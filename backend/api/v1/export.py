# backend/api/v1/export.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, PlainTextResponse, JSONResponse
from pydantic import BaseModel, field_validator
from typing import Literal, List, Dict, Optional, Set
from datetime import datetime, timezone

from db.influxdb import query_flux
from core.config import settings

import csv
import io
import zipfile
from minio import Minio
from minio.error import S3Error

router = APIRouter(prefix="/api/v1", tags=["export"])

MEASUREMENT = "radiacion_solar"          # según tu punto (3)
VALID_FIELDS = {"GHI", "DNI", "DHI"}

class ExportDailyBatchReq(BaseModel):
    dates: List[str]                             # ["YYYY-MM-DD", ...]
    variables: List[Literal["GHI","DNI","DHI"]]
    format: Literal["csv","json"]
    include_images: bool = False
    images_bucket: Optional[str] = None

    @field_validator("dates")
    @classmethod
    def check_dates(cls, vs: List[str]) -> List[str]:
        if not vs:
            raise ValueError("Debe indicar al menos una fecha.")
        seen: Set[str] = set()
        out: List[str] = []
        for v in vs:
            try:
                datetime.strptime(v, "%Y-%m-%d")
            except ValueError:
                raise ValueError(f"Fecha inválida: {v} (use YYYY-MM-DD)")
            if v not in seen:
                seen.add(v)
                out.append(v)
        return sorted(out)  # orden estable para nombre de archivo

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


@router.post("/export/daily")
def export_daily(req: ExportDailyBatchReq):
    if not req.variables:
        raise HTTPException(400, "Debe indicar al menos una variable (GHI/DNI/DHI).")
    if any(v not in VALID_FIELDS for v in req.variables):
        raise HTTPException(400, "Variable no válida.")

    start, stop = _day_bounds_utc(req.date)
    rows = _build_table(req.variables, start, stop)

    # --- JSON plano (sin imágenes) ---
    if req.format == "json" and not req.include_images:
        filename = f"irradiance_{req.date}.json"
        # JSONResponse ya serializa correctamente
        return JSONResponse(
            content=rows,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    # --- CSV plano (sin imágenes) ---
    if req.format == "csv" and not req.include_images:
        data_bytes = _make_csv(rows, req.variables)
        data_name = f"irradiance_{req.date}.csv"
        return StreamingResponse(
            io.BytesIO(data_bytes),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{data_name}"'}
        )

    # --- Con imágenes: empacar en ZIP ---
    # (CSV + imágenes) o (JSON + imágenes)
    if req.format == "csv":
        data_bytes = _make_csv(rows, req.variables)
        data_name = f"irradiance_{req.date}.csv"
    else:
        # JSON + imágenes
        import json
        data_bytes = json.dumps(rows).encode("utf-8")
        data_name = f"irradiance_{req.date}.json"

    bucket_imgs = req.images_bucket or "imagenes-cielo"
    zip_buf = _zip_with_images(
        data_bytes=data_bytes,
        data_name=data_name,
        day=req.date,
        bucket_name=bucket_imgs
    )
    zip_name = f"export_{req.date}.zip"
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'}
    )


@router.post("/export/daily/batch")
def export_daily_batch(req: ExportDailyBatchReq):
    if not req.variables:
        raise HTTPException(400, "Debe indicar al menos una variable (GHI/DNI/DHI).")
    if any(v not in VALID_FIELDS for v in req.variables):
        raise HTTPException(400, "Variable no válida.")

    bucket_imgs = req.images_bucket or "imagenes-cielo"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for day in req.dates:
            _write_day_to_zip(
                zf=zf,
                day=day,
                variables=req.variables,
                fmt=req.format,
                include_images=req.include_images,
                bucket_name=bucket_imgs,
            )
        # metadatos útiles
        manifest = {
            "dates": req.dates,
            "variables": req.variables,
            "format": req.format,
            "include_images": req.include_images,
        }
        import json
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))

    buf.seek(0)
    first = req.dates[0]
    last = req.dates[-1] if len(req.dates) > 1 else req.dates[0]
    zip_name = f"export_{first}_{last}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'}
    )
