# backend/services/export_service.py
from schemas.export import *
from db.influxdb import query_flux
from core.config import settings
import csv
import zipfile
import io
from minio import Minio
from minio.error import S3Error

MEASUREMENT = "radiacion_solar"
VALID_FIELDS = {"GHI", "DNI", "DHI"}

def _day_bounds_utc(yyyy_mm_dd: str) -> tuple[str, str]:
    # RFC3339 Zulu
    start = f"{yyyy_mm_dd}T00:00:00Z"
    stop  = f"{yyyy_mm_dd}T23:59:59Z"
    return start, stop

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

def _build_table(variables: List[str], start: str, stop: str) -> List[Dict]:
    # Une por timestamp (llave = time), dejando None si falta
    timeline: Dict[str, Dict] = {}
    for field in variables:
        series = _query_field_series(field, start, stop)
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

def _zip_with_images(data_bytes: bytes, data_name: str, day: str, bucket_name: str) -> io.BytesIO:
    client = _minio_client()
    prefix = day.replace("-", "/") + "/"        # "YYYY/MM/DD/"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"data/{data_name}", data_bytes)
        # listar y agregar imágenes
        try:
            for obj in client.list_objects(bucket_name, prefix=prefix, recursive=True):
                # solo archivos (ignora "directorios")
                if obj.object_name.endswith((".jpg", ".jpeg", ".png")):
                    resp = client.get_object(bucket_name, obj.object_name)
                    try:
                        zf.writestr(f"images/{obj.object_name.split(prefix,1)[-1]}", resp.read())
                    finally:
                        resp.close(); resp.release_conn()
        except S3Error as e:
            # si falla la lista, igual devolvemos el zip con solo datos
            zf.writestr("images/README.txt", f"No se pudieron incluir imágenes: {e}")
    buf.seek(0)
    return buf

def _write_day_to_zip(
    zf: zipfile.ZipFile,
    day: str,
    variables: List[str],
    fmt: Literal["csv","json"],
    include_images: bool,
    bucket_name: str,
):
    start, stop = _day_bounds_utc(day)
    rows = _build_table(variables, start, stop)

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
        try:
            any_img = False
            for obj in client.list_objects(bucket_name, prefix=prefix, recursive=True):
                if obj.object_name.lower().endswith((".jpg", ".jpeg", ".png")):
                    any_img = True
                    resp = client.get_object(bucket_name, obj.object_name)
                    try:
                        # Guardar bajo images/YYYY-MM-DD/...
                        rel = obj.object_name.split(prefix, 1)[-1]
                        zf.writestr(f"images/{day}/{rel}", resp.read())
                    finally:
                        resp.close()
                        resp.release_conn()
            if not any_img:
                zf.writestr(f"images/{day}/README.txt", "No se encontraron imágenes para este día.")
        except S3Error as e:
            zf.writestr(f"images/{day}/README.txt", f"No se pudieron incluir imágenes: {e}")
