# backend/services/export_service.py
from schemas.export import *
from db.influxdb import query_flux
from core.config import settings
import csv
import json
import zipfile
import io
import os # import os
import tempfile # import tempfile
import time # Asegúrate de importar time arriba
import asyncio
import statistics
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
from services.mail_templates.export_ready_template import get_export_ready_email

MEASUREMENT = "radiacion_solar"
VALID_FIELDS = {"GHI", "DNI", "DHI", "HR", "Temp"}
VALID_METRICS = {"mean", "min", "max", "sum"} #sum = energía kWh/m2


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
    estimated_size: int = 0

export_queue: asyncio.Queue = asyncio.Queue()
CURRENT_QUEUE_SIZE_BYTES: int = 0
_executor = ThreadPoolExecutor(max_workers=1) # Para ejecutar la lógica síncrona de generación ZIP sin bloquear
export_scheduler = AsyncIOScheduler()

async def enqueue_export_job(user_id: int | str, email: str, job_type: str, params: dict, transaction_id: int):
    """
    Agrega una tarea de exportación a la cola de procesamiento asíncrono.

    Calcula el tamaño estimado de la exportación para el control de cuotas y 
    encola un objeto `ExportJob`.

    Args:
        user_id (int | str): ID del usuario o identificador.
        email (str): Correo para notificar al finalizar.
        job_type (str): Tipo de trabajo ("daily_batch" o "range").
        params (dict): Parámetros para la función de exportación subyacente.
        transaction_id (int): ID de la transacción en la BD.
    """
    # Calcular estimado para actualizar tracking
    est_size = 0
    try:
        d_count = 0
        if job_type == "daily_batch":
            dates = params.get("dates")
            if dates and isinstance(dates, (list, tuple)):
                d_count = len(dates)
        elif job_type == "range":
            d_init = params.get("day_init")
            d_finish = params.get("day_finish")
            if d_init and d_finish:
                t0 = datetime.strptime(d_init, "%Y-%m-%d")
                t1 = datetime.strptime(d_finish, "%Y-%m-%d")
                d_count = (t1 - t0).days + 1
        
        if d_count > 0:
            est_size = estimate_export_size(
                days_count=d_count,
                start_hour=params.get("start_hour", "00:00"),
                end_hour=params.get("end_hour", "23:59"),
                granularity=params.get("granularity"),
                include_images=params.get("include_images", False)
            )
    except Exception as e:
        print(f"Error estimating size for queue: {e}")

    global CURRENT_QUEUE_SIZE_BYTES
    CURRENT_QUEUE_SIZE_BYTES += est_size

    job = ExportJob(
        user_id=user_id, 
        email=email, 
        job_type=job_type, 
        params=params, 
        transaction_id=transaction_id,
        estimated_size=est_size
    )
    await export_queue.put(job)

async def export_worker():
    """
    Worker asíncrono que procesa la cola de exportaciones.

    Se ejecuta en un bucle infinito consumiendo `ExportJob` de la cola.
    Maneja el ciclo de vida del job: procesamiento, actualización de estado (error/éxito)
    y liberación de recursos de cuota estimados.
    """
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
            # Descontar del tamaño global de la cola luego de procesar (o fallar)
            global CURRENT_QUEUE_SIZE_BYTES
            CURRENT_QUEUE_SIZE_BYTES -= job.estimated_size
            if CURRENT_QUEUE_SIZE_BYTES < 0:
                CURRENT_QUEUE_SIZE_BYTES = 0
            
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

def upload_file_to_minio(bucket: str, filename: str, source: Any):
    """
    Sube un archivo (ruta o bytes) a MinIO con lógica de reintento.

    Args:
        bucket (str): Nombre del bucket destino.
        filename (str): Nombre del objeto en MinIO.
        source (Any): Puede ser ruta de archivo (str), bytes o BytesIO.
    
    Raises:
        Exception: Si falla tras varios intentos.
    """
    # Instanciamos el cliente
    client = _minio_client()
    
    # Asegurar bucket
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    
    # Lógica de reintento robusta
    retries = 3
    for attempt in range(retries):
        try:
            if isinstance(source, str):
                # Es un path de archivo
                client.fput_object(bucket, filename, source, content_type="application/zip")
            else:
                # Es bytes o BytesIO
                if isinstance(source, bytes):
                    stream = io.BytesIO(source)
                    length = len(source)
                else:
                    stream = source
                    stream.seek(0, 2)
                    length = stream.tell()
                    stream.seek(0)
                
                client.put_object(
                    bucket, filename, stream, length,
                    content_type="application/zip"
                )

            print(f"Subida exitosa: {filename}")
            return # Éxito
        except Exception as e:
            print(f"Intento {attempt+1}/{retries} fallido al subir a MinIO: {e}")
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1)) # Backoff: espera 2s, luego 4s...
            else:
                raise e # Si falla el último, lanzamos el error

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
    """
    Ejecuta la lógica principal de exportación (generación ZIP + subida + notificación).

    1. Rutea la lógica de generación según `job_type`.
    2. Ejecuta la generación (CPU-bound) en un ThreadPoolExecutor.
    3. Sube el resultado a MinIO.
    4. Notifica al usuario via correo electrónico con un link de descarga.
    5. Agenda la limpieza (borrado) del archivo en 24 horas.

    Args:
        job (ExportJob): Datos del trabajo.
    """
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
            # wrapper para llamar export_daily_batch_query
            def run_daily():
                # Pedimos use_temp_file=True
                return export_daily_batch_query(use_temp_file=True, **job.params)
            
            # Devuelve ruta de archivo temporal
            zip_source = await loop.run_in_executor(_executor, run_daily)
            
        elif job.job_type == "range":
            def run_range():
                # export_by_range_query returns (source, type, name)
                s, _, _ = export_by_range_query(use_temp_file=True, **job.params)
                if hasattr(s, "getvalue"): return s.getvalue()
                return s # Should be path str
            
            zip_source = await loop.run_in_executor(_executor, run_range)
        
        else:
            raise ValueError("Unknown job type")

        # 2. Subir a MinIO (File based)
        await loop.run_in_executor(_executor, upload_file_to_minio, bucket_export, filename_zip, zip_source)
        
        # Eliminar archivo temporal si es path
        if isinstance(zip_source, str) and os.path.exists(zip_source):
            try:
                os.remove(zip_source)
                print(f"Temp file removed: {zip_source}")
            except Exception as e:
                print(f"Error removing temp file {zip_source}: {e}")
        
        # 3. Actualizar DB
        update_transaction_status(job.transaction_id, "listo", [filename_zip])
        
        # 4. Enviar Correo
        # Ajustar según deploy
        # Construir URL descarga
        base_url = "https://solarweb.lat/api" 
        download_url = f"{base_url}/export/exports/{filename_zip}"
        
        email_tpl = get_export_ready_email(
            email=job.email,
            download_url=download_url,
            file_name=filename_zip,
            expires_in="24 horas",
        )

        
        send_mail_query(job.email, email_tpl.subject, email_tpl.bodyHtml)
        
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
    """
    Ejecuta una consulta básica de Flux para obtener (timestamp, value) de un campo.
    """
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

def _compute_daily_metrics(
    day: str,
    rows: List[Dict[str, Any]],
    variables: List[str],
    metrics: List[str]
) -> Dict[str, Any]:
    """
    Calcula métricas estadísticas por día y variable.

    Métricas soportadas:
    - mean: promedio aritmético de irradiancia (W/m2).
    - min, max: mínimo y máximo de irradiancia (W/m2).
    - sum: energía diaria aproximada en kWh/m2 (integración temporal W/m2 -> kWh/m2).

    Args:
        day (str): Fecha (YYYY-MM-DD).
        rows (List[Dict]): Filas de datos del día.
        variables (List[str]): Variables a procesar (GHI, DNI, etc).
        metrics (List[str]): Lista de métricas solicitadas.

    Returns:
        Dict: Diccionario con las métricas calculadas (keys ej. "GHI_mean").
    """
    result: Dict[str, Any] = {"day": day}
    if not rows:
        return result

    selected = [m for m in metrics if m in VALID_METRICS]
    if not selected:
        return result

    for var in variables:
        vals = [r[var] for r in rows if r.get(var) is not None]
        if not vals:
            continue

        if "mean" in selected:
            result[f"{var}_mean"] = statistics.fmean(vals)
        if "min" in selected:
            result[f"{var}_min"] = min(vals)
        if "max" in selected:
            result[f"{var}_max"] = max(vals)
        if "sum" in selected:
            # aquí sum ≡ energía diaria kWh/m2
            result[f"{var}_kwh_m2"] = _compute_energy_kwh_from_rows(rows, var)

    return result
    
def _compute_energy_kwh_from_rows(
    rows: List[Dict[str, Any]],
    var: str
) -> float:
    """
    Integra la irradiancia (W/m2) de 'var' a lo largo del día para obtener kWh/m2.
    Usa regla del trapecio entre puntos consecutivos.

    Args:
        rows (List[Dict]): Datos ordenados temporalmente.
        var (str): Nombre de la variable.

    Returns:
        float: Energía acumulada en kWh/m2.
    """
    points: List[tuple[datetime, float]] = []

    for r in rows:
        if var not in r or r[var] is None:
            continue
        ts = r.get("time")
        if not ts:
            continue
        # ts viene como "2025-04-08T12:30:00Z" -> compatible con fromisoformat tras reemplazar Z
        try:
            t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            continue
        try:
            v = float(r[var])
        except (TypeError, ValueError):
            continue
        points.append((t, v))

    if len(points) < 2:
        return 0.0

    # Asegurar orden por tiempo
    points.sort(key=lambda x: x[0])

    area_ws_per_m2 = 0.0
    for (t0, v0), (t1, v1) in zip(points, points[1:]):
        dt = (t1 - t0).total_seconds()
        if dt <= 0:
            continue
        # regla del trapecio
        area_ws_per_m2 += (v0 + v1) / 2.0 * dt

    # De W·s/m2 a kWh/m2
    wh_per_m2 = area_ws_per_m2 / 3600.0
    kwh_per_m2 = wh_per_m2 / 1000.0
    return kwh_per_m2

def _make_metrics_csv(metrics_rows: List[Dict[str, Any]]) -> bytes:
    """
    metrics_rows: lista de dicts con las columnas ya calculadas (day, GHI_mean, etc.)
    """
    if not metrics_rows:
        return b""

    fieldnames = list(metrics_rows[0].keys())
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in metrics_rows:
        writer.writerow(row)
    return buf.getvalue().encode("utf-8")

def _make_csv(rows: List[Dict], variables: List[str]) -> bytes:
    buf = io.StringIO()
    headers = ["time"] + variables
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow({k: r.get(k, "") for k in headers})
    return buf.getvalue().encode("utf-8")

_global_minio_client = None

def _minio_client() -> Minio:
    global _global_minio_client
    if _global_minio_client:
        return _global_minio_client

    # settings.MINIO_ENDPOINT incluye http://… ; Minio pide host sin esquema y secure=True/False
    endpoint = settings.MINIO_ENDPOINT.replace("http://", "").replace("https://", "")
    secure = settings.MINIO_ENDPOINT.startswith("https://")
    
    # Pool manager is handled internally by Minio client (urllib3) based on this instance.
    # We should keep one instance per process ideally.
    _global_minio_client = Minio(
        endpoint=endpoint,
        access_key=settings.MINIO_USER,
        secret_key=settings.MINIO_PASSWORD,
        secure=secure,
        # Optional: fine tune http_client if needed, but default is usually fine for one instance
    )
    return _global_minio_client

def _zip_with_images(
    data_bytes: bytes, 
    data_name: str, 
    day: str, 
    bucket_name: str,
    start_hour: str = "00:00",
    end_hour: str = "23:59",
    granularity: str | None = None,
) -> bytes:
    """
    Genera un ZIP en memoria combinando datos (CSV/JSON) e imágenes descargadas de MinIO.

    Filtra imágenes por rango horario y aplica granularidad.
    Obsoleto/Alternativo: Esta lógica está integrada mayormente en `_write_day_to_zip` para soportar multi-día.

    Args:
        data_bytes (bytes): Contenido del archivo de datos principal.
        data_name (str): Nombre del archivo de datos dentro del ZIP.
        day (str): Fecha de las imágenes.
        bucket_name (str): Bucket de origen.
    
    Returns:
        bytes: Contenido del archivo ZIP final.
    """
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
    metrics: Optional[List[str]] = None,                 # <--- NUEVO
    metrics_rows: Optional[List[Dict[str, Any]]] = None,
):
    start, stop = _day_bounds_utc(day, start_hour, end_hour)
    rows = _build_table(variables, start, stop, granularity)

    # ===== NUEVO: calcular métricas de este día =====
    if metrics and metrics_rows is not None:
        mrow = _compute_daily_metrics(day, rows, variables, metrics)
        if len(mrow) > 1:  # tiene algo más que 'day'
            metrics_rows.append(mrow)
    # ===============================================

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
        metrics: Optional[List[str]] = None,
):
    """
    Genera la exportación para un solo día (lógica pura).

    - Si `include_images` es False y `metrics` es None: Retorna bytes de un archivo único CSV/JSON.
    - Si se requieren imágenes o métricas: Retorna bytes de un archivo ZIP conteniendo:
        - `data/{date}.{ext}` (Series de tiempo).
        - `metrics.{ext}` (si se pidieron métricas).
        - `images/{date}/...` (si se pidieron imágenes).

    Args:
        variables (list[str]): GHI, DNI, etc.
        date (str): Fecha YYYY-MM-DD.
        format (str): "csv" o "json".
        include_images (bool): Incluir imágenes en ZIP.
        images_bucket (str): Nombre del bucket MinIO.
        start_hour (str): Hora inicio filtro.
        end_hour (str): Hora fin filtro.
        granularity (str | None): Granularidad muestreo.
        metrics (list[str] | None): Métricas opcionales.

    Returns:
        tuple[bytes, str, str]: (contenido_bytes, media_type, filename)
    """
    # Caso simple: sin imágenes ni métricas
    if not include_images and not metrics:
        start, stop = _day_bounds_utc(date, start_hour, end_hour)
        rows = _build_table(variables, start, stop, granularity)

        if format == "json":
            filename = f"irradiance_{date}.json"
            data_bytes = json.dumps(rows).encode("utf-8")
            media_type = "application/json"
            return data_bytes, media_type, filename

        # CSV
        data_bytes = _make_csv(rows, variables)
        filename = f"irradiance_{date}.csv"
        media_type = "text/csv"
        return data_bytes, media_type, filename

    # Caso ZIP: porque hay imágenes o métricas
    bucket_imgs = images_bucket or "imagenes-cielo"
    buf = io.BytesIO()
    metrics_rows: List[Dict[str, Any]] = []

    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        # Reutilizamos la misma función que para rango/batch
        _write_day_to_zip(
            zf=zf,
            day=date,
            variables=variables,
            fmt=format,
            include_images=include_images,
            bucket_name=bucket_imgs,
            start_hour=start_hour,
            end_hour=end_hour,
            granularity=granularity,
            metrics=metrics,
            metrics_rows=metrics_rows,
        )

        # Archivo de métricas (si corresponde)
        if metrics and metrics_rows:
            if format == "csv":
                m_bytes = _make_metrics_csv(metrics_rows)
                m_name = "metrics.csv"
            else:
                m_bytes = json.dumps(metrics_rows).encode("utf-8")
                m_name = "metrics.json"

            zf.writestr(m_name, m_bytes)

    buf.seek(0)
    zip_bytes = buf.getvalue()
    zip_name = f"export_{date}.zip"
    return zip_bytes, "application/zip", zip_name


def export_daily_batch_query(
        variables: List[str], 
        dates: tuple[str], 
        format: str, 
        include_images: bool, 
        images_bucket: str = "imagenes-cielo", 
        start_hour: str = "00:00",
        end_hour: str = "23:59",
        granularity: str | None = None,
        metrics: Optional[List[str]] = None,
        use_temp_file: bool = False
):
    """
    Genera una exportación de múltiples días en batch (ZIP consolidado).

    Itera sobre la lista de fechas y agrega los datos/imágenes de cada día al ZIP.
    Puede operar completamente en memoria (BytesIO) o usar un archivo temporal en disco
    (recomendado para grandes volúmenes).

    Args:
        dates (tuple[str]): Tupla de fechas (YYYY-MM-DD).
        use_temp_file (bool): Si True, escribe en '/tmp' en lugar de RAM. Retorna la ruta str.
    
    Returns:
        bytes | str: Bytes del ZIP (si use_temp_file=False) o ruta absoluta del archivo (si use_temp_file=True).
    """
    bucket_imgs = images_bucket or "imagenes-cielo"
    
    if use_temp_file:
        fd, temp_path = tempfile.mkstemp(suffix=".zip")
        os.close(fd)
        # Usamos mode 'w' sobre el archivo
        zf = zipfile.ZipFile(temp_path, mode="w", compression=zipfile.ZIP_DEFLATED)
    else:
        buf = io.BytesIO()
        zf = zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED)

    metrics_rows: List[Dict[str, Any]] = []  
    try:
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
                metrics=metrics,
                metrics_rows=metrics_rows,
            )
        # ---- NUEVO: escribir archivo de métricas si corresponde
        if metrics and metrics_rows:
            if format == "csv":
                data_bytes = _make_metrics_csv(metrics_rows)
                metrics_name = "metrics.csv"
            else:
                data_bytes = json.dumps(metrics_rows).encode("utf-8")
                metrics_name = "metrics.json"

            zf.writestr(metrics_name, data_bytes)
    finally:
        zf.close()
    
    if use_temp_file:
        return temp_path
    
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
        metrics: Optional[List[str]] = None,
        use_temp_file: bool = False
) -> tuple[Any, str, str]:
    """
    Genera un ZIP con la exportación de un rango de fechas continuo.

    Expande el rango (inicio, fin) a una lista de días y delega en `export_daily_batch_query`.

    Args:
        day_init (str): Fecha inicio YYYY-MM-DD.
        day_finish (str): Fecha fin YYYY-MM-DD.
        use_temp_file (bool): Ver `export_daily_batch_query`.

    Returns:
        tuple: (source, content_type, filename). Source puede ser bytes o path.
    """
    # Validaciones básicas
    if not variables:
        raise ValueError("Variables required")

    start_func = datetime.strptime(day_init, "%Y-%m-%d")
    end_func = datetime.strptime(day_finish, "%Y-%m-%d")
    
    if start_func > end_func:
        raise ValueError("Start date > End date")
    
    days = []
    curr = start_func
    while curr <= end_func:
        days.append(curr.strftime("%Y-%m-%d"))
        curr += timedelta(days=1)
        
    # Reutilizamos logic de daily batch que ya maneja iteración y temp file
    # Solo cambiamos la firma de lo que recibe daily batch
    result_source = export_daily_batch_query(
        variables=variables,
        dates=tuple(days),
        format=fmt,
        include_images=include_images,
        images_bucket=images_bucket,
        start_hour=start_hour,
        end_hour=end_hour,
        granularity=granularity,
        metrics=metrics,
        use_temp_file=use_temp_file
    )
    
    filename = f"export_range_{day_init}_{day_finish}.zip"
    return result_source, "application/zip", filename



# -------------------
# Storage Limits & Estimation
# -------------------

MAX_EXPORT_STORAGE_BYTES = 100 * 1024 * 1024 * 1024  # 100 GB
CSV_BYTES_PER_RECORD = 5  # ~300kb for 86400 records (aprox)
IMAGE_BYTES_AVG = 40 * 1024 # 40 KB (aprox)

def _parse_granularity_seconds(granularity: str | None) -> int:
    """Parsea la granularidad (ej: '10s', '1m') a segundos. Default 1s."""
    if not granularity:
        return 1
    
    # Mapeo simple basado en lo que usa el sistema
    mapping = {
        "1s": 1,
        "10s": 10,
        "30s": 30,
        "1m": 60,
        "5m": 300,
        "30m": 1800,
        "1h": 3600
    }
    return mapping.get(granularity, 1)

def _calculate_seconds_in_interval(start_hour: str, end_hour: str) -> int:
    """Calcula la duración en segundos entre dos horas 'HH:MM'."""
    try:
        sh, sm = map(int, start_hour.split(":"))
        eh, em = map(int, end_hour.split(":"))
        start_secs = sh * 3600 + sm * 60
        end_secs = eh * 3600 + em * 60
        duration = end_secs - start_secs
        return max(0, duration)
    except ValueError:
        return 86400 # fallback full day

def _calculate_image_intersection_seconds(start_hour: str, end_hour: str) -> int:
    """
    Calcula cuántos segundos del rango solicitado caen dentro de 06:00 - 22:00.
    """
    # Rango imágenes fijo: 06:00 (21600s) a 22:00 (79200s)
    IMG_START = 6 * 3600
    IMG_END = 22 * 3600
    
    try:
        # Calcular rango de imagenes solicitado
        sh, sm = map(int, start_hour.split(":"))
        eh, em = map(int, end_hour.split(":"))
        req_start = sh * 3600 + sm * 60
        req_end = eh * 3600 + em * 60
        
        # Intersección entre las horas pedidas y las existentes
        inter_start = max(req_start, IMG_START)
        inter_end = min(req_end, IMG_END)
        
        # Devuelve la duración de la intersección
        return max(0, inter_end - inter_start)

    except ValueError:
        return 0

def estimate_export_size(
    days_count: int,
    start_hour: str = "00:00",
    end_hour: str = "23:59",
    granularity: str | None = None,
    include_images: bool = False
) -> int:
    """
    Estima el tamaño total en bytes que ocupará una exportación.

    Suma el peso estimado de:
    1. Registros CSV (basado en duración del día y granularidad).
    2. Imágenes (basado en intersección horaria válida y peso promedio).

    Args:
        days_count (int): Cantidad de días.
        start_hour (str): Hora inicio.
        end_hour (str): Hora fin.
        granularity (str): Settings de granularidad.
        include_images (bool): Si incluye imágenes o no.

    Returns:
        int: Bytes estimados.
    """
    gran_secs = _parse_granularity_seconds(granularity)
    
    # 1. Estimación CSV
    # Duración solicitada por día
    duration_secs = _calculate_seconds_in_interval(start_hour, end_hour)
    if duration_secs == 0: duration_secs = 86400
    
    rows_per_day = duration_secs / gran_secs
    csv_size = days_count * rows_per_day * CSV_BYTES_PER_RECORD
    
    # 2. Estimación Imágenes
    img_size = 0
    if include_images:
        # Imágenes solo entre 06:00 y 22:00.
        # Frecuencia base de imágenes: cada 10s (aprox).
        # Si granularidad > 10s, usamos granularidad. Si < 10s, usamos 10s (limitado por fuente).
        img_step = max(10, gran_secs)
        
        valid_duration = _calculate_image_intersection_seconds(start_hour, end_hour)
        images_per_day = valid_duration / img_step
        img_size = days_count * images_per_day * IMAGE_BYTES_AVG

    total_est = int(csv_size + img_size)
    return total_est

def get_export_bucket_usage() -> int:
    """Calcula el uso actual del bucket de exportaciones."""
    client = _minio_client()
    bucket = "exportaciones"
    total_size = 0
    
    if not client.bucket_exists(bucket):
        return 0
        
    # List objects recursive
    # Nota: esto puede ser lento si hay millones de objetos.
    try:
        objects = client.list_objects(bucket, recursive=True)
        for obj in objects:
            total_size += obj.size
    except Exception as e:
        print(f"Error checking bucket size: {e}")
        return 0
        
    return total_size

def validate_export_feasibility(
    days_count: int,
    start_hour: str = "00:00",
    end_hour: str = "23:59",
    granularity: str | None = None,
    include_images: bool = False
):
    """
    Valida si es factible realizar la exportación según cuotas y límites de almacenamiento.

    Verifica:
    1. Tamaño individual de la exportación (< 600MB).
    2. Espacio total ocupado+pendiente en bucket exportaciones (< 100GB).

    Args:
        days_count (int): Días.
    
    Raises:
        ExportError: Si se superan los límites.
    """
    estimated = estimate_export_size(
        days_count, start_hour, end_hour, granularity, include_images
    )
    
    current_usage = get_export_bucket_usage()
    # Usar variable global trackeada
    queue_usage = CURRENT_QUEUE_SIZE_BYTES
    
    if estimated > 600 * 1024 * 1024:
        raise ExportError(
            f"La exportación estimada ({estimated/1024**3:.2f}GB) excede el límite máximo de 600MB."
        )
    

    if current_usage + estimated + queue_usage > MAX_EXPORT_STORAGE_BYTES:
        raise ExportError(
            f"Límite de almacenamiento de exportaciones excedido (100GB). "
            f"Uso actual: {current_usage/1024**3:.2f}GB. "
            f"Cola pendiente: {queue_usage/1024**3:.2f}GB. "
            f"Estimado nueva exportación: {estimated/1024**3:.2f}GB."
        )
    
    print(f"Export valid. Current: {current_usage/1024**2:.1f}MB, Est: {estimated/1024**2:.1f}MB")
