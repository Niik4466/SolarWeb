# backend/api/v1/export.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, PlainTextResponse, JSONResponse
from datetime import datetime, timezone
import csv
import io
import zipfile
from services.export_service import *
from services.export_service import _write_day_to_zip

router = APIRouter(prefix="/export", tags=["export"])

VALID_FIELDS = {"GHI", "DNI", "DHI"}

@router.post("/day")
def export_day(req: ExportDayReq):
    if not req.variables:
        raise HTTPException(400, "Debe indicar al menos una variable (GHI/DNI/DHI).")
    if any(v not in VALID_FIELDS for v in req.variables):
        raise HTTPException(400, "Variable no válida.")
    try:
        data_bytes, media_type, filename = export_day_query(
                images_bucket=req.images_bucket,
                variables=req.variables,
                date=req.date,
                format=req.format,
                include_images=req.include_images, 
                )
    except ExportError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Si es JSON puro, devolver JSONResponse
    if media_type == "application/json" and not req.include_images:
        import json
        return JSONResponse(
            content=json.loads(data_bytes.decode("utf-8")),
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    # Para CSV o ZIP -> StreamingResponse
    return StreamingResponse(
        io.BytesIO(data_bytes),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.post("/daily/batch")
def export_daily_batch(req: ExportBatchReq):
    if not req.variables:
        raise HTTPException(400, "Debe indicar al menos una variable (GHI/DNI/DHI).")
    if any(v not in VALID_FIELDS for v in req.variables):
        raise HTTPException(400, "Variable no válida.")

    buf = export_daily_batch_query(
            images_bucket=req.images_bucket,
            variables=req.variables,
            dates=req.dates,
            format=req.format,
            include_images=req.include_images, 
            )

    first = req.dates[0]
    last = req.dates[-1] if len(req.dates) > 1 else req.dates[0]
    zip_name = f"export_{first}_{last}.zip"

    print(type(buf))

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'}
    )

@router.post("/range")
def export_by_range(req: ExportByRangeReq):
    """
    Exporta datos en un rango de fechas (date_init -> date_finish).
    Devuelve un archivo ZIP que contiene los días solicitados.
    """
    try:
        # Llamamos la capa de servicio (lógica pura)
        data_bytes, media_type, filename = export_by_range_query(
            images_bucket=req.images_bucket,
            variables=req.variables,
            day_init=req.date_init,
            day_finish=req.date_finish,
            fmt=req.format,
            include_images=req.include_images,
        )
    except ExportError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno: {e}")

    # Devolver como StreamingResponse (descarga ZIP)
    return StreamingResponse(
        data_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
