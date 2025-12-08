from schemas.export import *
from db.influxdb import query_flux
from core.config import settings
import csv
import zipfile
import io
import asyncio
from concurrent.futures import ThreadPoolExecutor
from minio import Minio
from minio.error import S3Error
from datetime import datetime, timezone, timedelta
from services.image_service import floor_datetime
from services.irradiance_service import get_series_export
from collections import defaultdict
from dataclasses import dataclass, field
from typing import List, Dict, Literal, Optional, Any
from db.postgres import get_sync_session
from services.mail_service import send_mail_query
from services.user_service import create_transaction_entry_query, update_transaction_status_query
from apscheduler.schedulers.asyncio import AsyncIOScheduler

MEASUREMENT = "radiacion_solar"
VALID_FIELDS = {"GHI", "DNI", "DHI"}

# -------------------
# Queue & Worker
# -------------------

@dataclass
class ExportJob:
    user_id: int | str  # Identificador usuario (o email)
    email: str          # Correo para notificar
    job_type: str       # "daily_batch" | "range"
    params: dict        # Parámetros de la función de exportación
    transaction_id: int # ID de la transacción en DB

export_queue: asyncio.Queue = asyncio.Queue()
_executor = ThreadPoolExecutor(max_workers=1) # Para ejecutar la lógica síncrona de generación ZIP sin bloquear
export_scheduler = AsyncIOScheduler()

async def enqueue_export_job(user_id: int | str, email: str, job_type: str, params: dict, transaction_id: int):
    job = ExportJob(user_id=user_id, email=email, job_type=job_type, params=params, transaction_id=transaction_id)
    await export_queue.put(job)

async def export_worker():
    print("Export Worker Started")
    if not export_scheduler.running:
        export_scheduler.start()
        
    while True:
        job: ExportJob = await export_queue.get()
        try:
            await process_export_job(job)
        except Exception as e:
            print(f"Error processing export job {job}: {e}")
            update_transaction_status(job.transaction_id, "error")
        finally:
            export_queue.task_done()

# -------------------
# Async Transaccion / MinIO Helper
# -------------------

def create_transaction_entry(user_id: int, var_ghi: bool, var_dni: bool, var_global: bool, imagenes: bool) -> int:
    """Wrapper local para compatibilidad o llama directo a user_service."""
    db = get_sync_session()
    try:
        return create_transaction_entry_query(db, user_id, var_ghi, var_dni, var_global, imagenes)
    finally:
        db.close()

def update_transaction_status(t_id: int, status: str, files: List[str] = None):
    db = get_sync_session()
    try:
        update_transaction_status_query(db, t_id, status, files)
    finally:
        db.close()

def upload_file_to_minio(bucket: str, filename: str, data: bytes):
    client = _minio_client()
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    
    client.put_object(
        bucket, filename, io.BytesIO(data), len(data),
        content_type="application/zip"
    )

def delete_file_from_minio(bucket: str, filename: str, transaction_id: int):
    """
    Función callback para el scheduler.
    Elimina archivo y actualiza estado a 'expirado'.
    """
    try:
        # Delete file from minIO
        client = _minio_client()
        client.remove_object(bucket, filename)
        print(f"Deleted expired export: {filename}")
        
        # Update DB
        update_transaction_status(transaction_id, "expirado")
    except Exception as e:
        print(f"Error checking/deleting file {filename}: {e}")

async def process_export_job(job: ExportJob):
    print(f"Processing job {job.transaction_id} for {job.email}")
    
    # 1. Generar ZIP (Cpu bound, run in iterator)
    # Seleccionamos la función según job_type
    loop = asyncio.get_running_loop()
    
    zip_bytes = None
    filename_zip = ""

    # Determinar nombre archivo
    now_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    # Limpiamos email para filename
    safe_email = job.email.replace("@", "_at_").replace(".", "_")
    filename_zip = f"{safe_email}_{now_str}.zip"
    
    bucket_export = "exportaciones"

    try:
        if job.job_type == "daily_batch":
            # wrapper para llamar export_daily_batch_query que devuelve BytesIO
            def run_daily():
                buf = export_daily_batch_query(**job.params)
                return buf.getvalue()
            
            zip_bytes = await loop.run_in_executor(_executor, run_daily)
            
        elif job.job_type == "range":
            def run_range():
                # export_by_range_query returns (bytes, type, name)
                b, _, _ = export_by_range_query(**job.params)
                # Ojo: export_by_range_query retorna (BytesIO, str, str) en la versión actual?
                # Revisando codigo original: return buf, "application/zip", zip_name
                if hasattr(b, "getvalue"): return b.getvalue()
                return b
            
            zip_bytes = await loop.run_in_executor(_executor, run_range)
        
        else:
            raise ValueError("Unknown job type")

        # 2. Subir a MinIO
        # Ejecutar bloqueo IO en thread también es buena práctica, aunque minio-py es síncrono
        await loop.run_in_executor(_executor, upload_file_to_minio, bucket_export, filename_zip, zip_bytes)
        
        # 3. Actualizar DB
        update_transaction_status(job.transaction_id, "listo", [filename_zip])
        
        # 4. Enviar Correo
        # Ajustar según deploy
        # Construir URL descarga
        base_url = "http://localhost:8000" 
        download_url = f"{base_url}/export/exports/{filename_zip}"
        
        body = f"""
        <p>Hola,</p>
        <p>Tu exportación solicitada está lista.</p>
        <p><a href="{download_url}">Descargar Archivo ZIP</a></p>
        <p>El enlace expirará en 24 horas.</p>
        """
        
        send_mail_query(job.email, "Tu exportación está lista", body)
        
        # 5. Programar borrado
        if export_scheduler.running:
             run_date = datetime.now() + timedelta(hours=24)
             export_scheduler.add_job(
                 delete_file_from_minio, 
                 'date', 
                 run_date=run_date, 
                 args=[bucket_export, filename_zip, job.transaction_id]
             )
        else:
            print("Warning: Scheduler not running, file cleanup won't happen.")

    except Exception as e:
        print(f"Failed to process job: {e}")
        update_transaction_status(job.transaction_id, "error")


# -------------------
# Error logico para el Exportar
# -------------------
class ExportError(Exception):
    """Error lógico para exportaciones."""
    pass

# -------------------
# Funciones auxiliares
# -------------------
def _day_bounds_utc(yyyy_mm_dd: str, start_hour: str = "00:00", end_hour: str = "23:59") -> tuple[str, str]:
    # RFC3339 Zulu
    formatted_yyyy_mm_dd = yyyy_mm_dd.replace("/", "-")
    start = f"{formatted_yyyy_mm_dd}T{start_hour}:00Z"
    stop  = f"{formatted_yyyy_mm_dd}T{end_hour}:59Z"
    return start, stop

def _is_img_in_range(object_name: str, start_hm: str, end_hm: str) -> bool:
    # object_name: "YYYY/MM/DD/HH_MM_SS.jpg"
    filename = object_name.split("/")[-1]
    # "HH_MM_SS.jpg" -> "HH_MM_SS"
    name_part = filename.rsplit(".", 1)[0]
    parts = name_part.split("_")
    if len(parts) < 2:
        return False
    
    try:
        hh = int(parts[0])
        mm = int(parts[1])
        current_minutes = hh * 60 + mm
        
        start_h, start_m = map(int, start_hm.split(":"))
        start_minutes = start_h * 60 + start_m
        
        end_h, end_m = map(int, end_hm.split(":"))
        end_minutes = end_h * 60 + end_m
        
        return start_minutes <= current_minutes <= end_minutes
    except ValueError:
        return False

def _parse_img_time(object_name: str) -> int | None:
    try:
        filename = object_name.split("/")[-1]
        name_part = filename.rsplit(".", 1)[0]
        parts = name_part.split("_")
        hh = int(parts[0])
        mm = int(parts[1])
        return hh * 60 + mm
    except (ValueError, IndexError):
        return None

def _query_field_series(field: str, start: str, stop: str):
    flux = f'''
    from(bucket: "{settings.INFLUX_BUCKET}")
      |> range(start: {start}, stop: {stop})
      |> filter(fn: (r) => r._measurement == "{MEASUREMENT}")
      |> filter(fn: (r) => r._field == "{field}")
      |> keep(columns: ["_time","_value"])
      |> sort(columns: ["_time"])
    '''
    tables = query_flux(flux)
    out = []
    for t in tables:
        for rec in t.records:
            out.append((rec.get_time().replace(tzinfo=timezone.utc).isoformat().replace("+00:00","Z"),
                        float(rec.get_value())))
    return out  # list[(iso_time,value)]

def _build_table(variables: List[str], start: str, stop: str, granularity: str | None = None) -> List[Dict]:
    # Une por timestamp (llave = time), dejando None si falta
    timeline: Dict[str, Dict] = {}
    for field in variables:
        series = get_series_export(start, stop, field, granularity)
        for ts, val in series:
            row = timeline.setdefault(ts, {"time": ts})
            row[field] = val
    # ordenado por tiempo
    rows = [timeline[k] for k in sorted(timeline.keys())]
    return rows

def _make_csv(rows: List[Dict], variables: List[str]) -> bytes:
    buf = io.StringIO()
    headers = ["time"] + variables
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow({k: r.get(k, "") for k in headers})
    return buf.getvalue().encode("utf-8")

def _minio_client() -> Minio:
    # settings.MINIO_ENDPOINT incluye http://… ; Minio pide host sin esquema y secure=True/False
    endpoint = settings.MINIO_ENDPOINT.replace("http://", "").replace("https://", "")
    secure = settings.MINIO_ENDPOINT.startswith("https://")
    return Minio(
        endpoint=endpoint,
        access_key=settings.MINIO_USER,
        secret_key=settings.MINIO_PASSWORD,
        secure=secure
    )

def _zip_with_images(
    data_bytes: bytes, 
    data_name: str, 
    day: str, 
    bucket_name: str,
    start_hour: str = "00:00",
    end_hour: str = "23:59",
    granularity: str | None = None,
) -> bytes:
    client = _minio_client()
    prefix = day.replace("-", "/") + "/"        # "YYYY/MM/DD/"
    buf = io.BytesIO()
    
    # Definir step si hay granularidad
    step = None
    if granularity:
        step_map = {
            "1s": timedelta(seconds=1),
            "10s": timedelta(seconds=10),
            "30s": timedelta(seconds=30),
            "1m": timedelta(minutes=1),
            "5m": timedelta(minutes=5),
            "30m": timedelta(minutes=30),
            "1h": timedelta(hours=1),
        }
        step = step_map.get(granularity)

    # Calcular start_after para optimizar listado
    # Formato: YYYY/MM/DD/HH_MM
    # start_hour es HH:MM. Reemplazamos : por _
    start_after_key = prefix + start_hour.replace(":", "_")

    # Calcular minutos de fin para early exit
    try:
        end_h, end_m = map(int, end_hour.split(":"))
        end_minutes = end_h * 60 + end_m
    except ValueError:
        end_minutes = 24 * 60 # fallback

    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"data/{data_name}", data_bytes)
        
        # Recolectar imágenes válidas
        valid_images = []
        try:
            for obj in client.list_objects(bucket_name=bucket_name, prefix=prefix, recursive=True, start_after=start_after_key):
                if obj.object_name.endswith((".jpg", ".jpeg", ".png")):
                    # Early exit optimization
                    img_minutes = _parse_img_time(obj.object_name)
                    if img_minutes is not None and img_minutes > end_minutes:
                        break

                    if not _is_img_in_range(obj.object_name, start_hour, end_hour):
                        continue
                    valid_images.append(obj.object_name)
        except S3Error as e:
            zf.writestr("images/README.txt", f"No se pudieron incluir imágenes: {e}")
            buf.seek(0)
            return buf.getvalue()

        # Aplicar granularidad
        images_to_write = []
        if step:
            grouped = defaultdict(list)
            for img_name in valid_images:
                try:
                    # img_name: "YYYY/MM/DD/HH_MM_SS.jpg"
                    filename = img_name.split("/")[-1]
                    name_part = filename.rsplit(".", 1)[0]
                    parts = name_part.split("_")
                    hh, mm, ss = int(parts[0]), int(parts[1]), int(parts[2])
                    # Asumimos que el día es 'day'
                    normalized_day = day.replace("/", "-")
                    d = datetime.strptime(normalized_day, "%Y-%m-%d")
                    dt = d.replace(hour=hh, minute=mm, second=ss)
                    
                    floored = floor_datetime(dt, step)
                    grouped[floored].append(img_name)
                except Exception:
                    continue
            
            # Seleccionar una por grupo (la primera)
            for _, imgs in sorted(grouped.items()):
                if imgs:
                    images_to_write.append(imgs[0])
        else:
            images_to_write = valid_images

        # Escribir al ZIP
        for img_name in images_to_write:
            try:
                resp = client.get_object(bucket_name, img_name)
                try:
                    zf.writestr(f"images/{img_name.split(prefix,1)[-1]}", resp.read())
                finally:
                    resp.close(); resp.release_conn()
            except Exception:
                pass

    buf.seek(0)
    return buf.getvalue()

def _write_day_to_zip(
    zf: zipfile.ZipFile,
    day: str,
    variables: List[str],
    fmt: Literal["csv","json"],
    include_images: bool,
    bucket_name: str,
    start_hour: str = "00:00",
    end_hour: str = "23:59",
    granularity: str | None = None,
):
    start, stop = _day_bounds_utc(day, start_hour, end_hour)
    rows = _build_table(variables, start, stop, granularity)

    # archivo de datos por día
    if fmt == "csv":
        data_bytes = _make_csv(rows, variables)
        data_name = f"data/{day}.csv"
    else:
        import json
        data_bytes = json.dumps(rows).encode("utf-8")
        data_name = f"data/{day}.json"

    zf.writestr(data_name, data_bytes)

    # imágenes por día (si aplica)
    if include_images:
        client = _minio_client()
        prefix = day.replace("-", "/") + "/"
        
        # Definir step si hay granularidad
        step = None
        if granularity:
            step_map = {
                "1s": timedelta(seconds=1),
                "10s": timedelta(seconds=10),
                "30s": timedelta(seconds=30),
                "1m": timedelta(minutes=1),
                "5m": timedelta(minutes=5),
                "30m": timedelta(minutes=30),
                "1h": timedelta(hours=1),
            }
            step = step_map.get(granularity)

        # Calcular start_after para optimizar listado
        start_after_key = prefix + start_hour.replace(":", "_")

        # Calcular minutos de fin para early exit
        try:
            end_h, end_m = map(int, end_hour.split(":"))
            end_minutes = end_h * 60 + end_m
        except ValueError:
            end_minutes = 24 * 60

        try:
            valid_images = []
            for obj in client.list_objects(bucket_name = bucket_name, prefix=prefix, recursive=True, start_after=start_after_key):
                if obj.object_name.lower().endswith((".jpg", ".jpeg", ".png")):
                    # Early exit optimization
                    img_minutes = _parse_img_time(obj.object_name)
                    if img_minutes is not None and img_minutes > end_minutes:
                        break

                    if not _is_img_in_range(obj.object_name, start_hour, end_hour):
                        continue
                    valid_images.append(obj.object_name)
            
            if not valid_images:
                zf.writestr(f"images/{day}/README.txt", "No se encontraron imágenes para este día.")
                return

            # Aplicar granularidad
            images_to_write = []
            if step:
                grouped = defaultdict(list)
                for img_name in valid_images:
                    try:
                        filename = img_name.split("/")[-1]
                        name_part = filename.rsplit(".", 1)[0]
                        parts = name_part.split("_")
                        hh, mm, ss = int(parts[0]), int(parts[1]), int(parts[2])
                        normalized_day = day.replace("/", "-")
                        d = datetime.strptime(normalized_day, "%Y-%m-%d")
                        dt = d.replace(hour=hh, minute=mm, second=ss)
                        floored = floor_datetime(dt, step)
                        grouped[floored].append(img_name)
                    except Exception:
                        continue
                
                for _, imgs in sorted(grouped.items()):
                    if imgs:
                        images_to_write.append(imgs[0])
            else:
                images_to_write = valid_images

            for img_name in images_to_write:
                resp = client.get_object(bucket_name, img_name)
                try:
                    # Guardar bajo images/YYYY-MM-DD/...
                    rel = img_name.split(prefix, 1)[-1]
                    zf.writestr(f"images/{day}/{rel}", resp.read())
                finally:
                    resp.close()
                    resp.release_conn()

        except S3Error as e:
            zf.writestr(f"images/{day}/README.txt", f"No se pudieron incluir imágenes: {e}")

# ----------------
# Funciones llamadas por el endpoint
# ----------------

def export_day_query(
        variables: list[str], 
        date: str,
        format: str, 
        include_images: bool, 
        images_bucket: str = "imagenes-cielo", 
        start_hour: str = "00:00",
        end_hour: str = "23:59",
        granularity: str | None = None,
):
    """
    Lógica pura: genera los datos y devuelve (bytes, media_type, filename)
    """
    start, stop = _day_bounds_utc(date, start_hour, end_hour)
    rows = _build_table(variables, start, stop, granularity)

    # JSON plano (sin imágenes)
    if format == "json" and not include_images:
        filename = f"irradiance_{date}.json"
        data_bytes = json.dumps(rows).encode("utf-8")
        media_type = "application/json"
        return data_bytes, media_type, filename

    # CSV plano (sin imágenes)
    if format == "csv" and not include_images:
        data_bytes = _make_csv(rows, variables)
        filename = f"irradiance_{date}.csv"
        media_type = "text/csv"
        return data_bytes, media_type, filename

    # Con imágenes: empaquetar en ZIP
    if format == "csv":
        data_bytes = _make_csv(rows, variables)
        data_name = f"irradiance_{date}.csv"
    else:
        data_bytes = json.dumps(rows).encode("utf-8")
        data_name = f"irradiance_{date}.json"

    bucket_imgs = images_bucket or "imagenes-cielo"
    zip_buf = _zip_with_images(
        data_bytes=data_bytes,
        data_name=data_name,
        day=date,
        bucket_name=bucket_imgs,
        start_hour=start_hour,
        end_hour=end_hour,
        granularity=granularity,
    )

    zip_name = f"export_{date}.zip"
    return zip_buf, "application/zip", zip_name

def export_daily_batch_query(
        variables: List[str], 
        dates: tuple[str], 
        format: str, 
        include_images: bool, 
        images_bucket: str = "imagenes-cielo", 
        start_hour: str = "00:00",
        end_hour: str = "23:59",
        granularity: str | None = None,
):
    bucket_imgs = images_bucket or "imagenes-cielo"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for day in dates:
            _write_day_to_zip(
                zf=zf,
                day=day,
                variables=variables,
                fmt=format,
                include_images=include_images,
                bucket_name=bucket_imgs,
                start_hour=start_hour,
                end_hour=end_hour,
                granularity=granularity,
            )
    buf.seek(0)
    return buf

def export_by_range_query(
        images_bucket: str = "imagenes-cielo",
        variables: List[str] | None = None,
        day_init: str | None = None,
        day_finish: str | None = None,
        fmt: Literal["csv", "json"] = "csv",
        include_images: bool = False,
        start_hour: str = "00:00",
        end_hour: str = "23:59",
        granularity: str | None = None,
) -> tuple[bytes, str, str]:
    """
    Genera un ZIP con archivos `data/YYYY-MM-DD.(csv|json)` para cada día en el rango
    [day_init, day_finish] (ambos inclusive). Si include_images=True, incluye las imágenes
    en images/YYYY-MM-DD/...
    Devuelve (bytes_zip, "application/zip", filename).
    """
    # Validaciones básicas
    if not variables:
        raise ExportError("Debe indicar al menos una variable (GHI/DNI/DHI).")
    if any(v not in VALID_FIELDS for v in variables):
        raise ExportError("Variable no válida.")
    if not day_init or not day_finish:
        raise ExportError("Debe indicar day_init y day_finish en formato YYYY-MM-DD.")

    # Parsear fechas
    try:
        d0 = datetime.strptime(day_init, "%Y-%m-%d").date()
        d1 = datetime.strptime(day_finish, "%Y-%m-%d").date()
    except ValueError:
        raise ExportError("Formato de fecha inválido. Use YYYY-MM-DD.")

    if d1 < d0:
        raise ExportError("day_finish no puede ser anterior a day_init.")

    # Generar lista de días (strings YYYY-MM-DD)
    days: List[str] = []
    cur = d0
    while cur <= d1:
        days.append(cur.isoformat())
        cur = cur + timedelta(days=1)

    bucket_imgs = images_bucket or "imagenes-cielo"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for day in days:
            # Reutiliza la función que ya sabe cómo escribir datos + imágenes por día
            _write_day_to_zip(
                zf=zf,
                day=day,
                variables=variables,
                fmt=fmt,
                include_images=include_images,
                bucket_name=bucket_imgs,
                start_hour=start_hour,
                end_hour=end_hour,
                granularity=granularity,
            )

    # Nombre final
    zip_name = f"export_{day_init}_{day_finish}.zip"

    buf.seek(0)
    return buf, "application/zip", zip_name
