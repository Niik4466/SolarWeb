# backend/api/v1/export.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, PlainTextResponse, JSONResponse
from datetime import datetime, timezone
import csv
import io
import zipfile
from services.export_service import *

router = APIRouter(prefix="/export", tags=["export"])

MEASUREMENT = "radiacion_solar"
VALID_FIELDS = {"GHI", "DNI", "DHI"}

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
