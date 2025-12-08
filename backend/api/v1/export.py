from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Request
from fastapi.responses import StreamingResponse, PlainTextResponse, JSONResponse, FileResponse
from datetime import datetime, timezone
import csv
import io
import zipfile
from schemas.export import *
from services.export_service import (
    export_day_query, export_daily_batch_query, export_by_range_query,
    enqueue_export_job, create_transaction_entry, _minio_client, ExportError
)
from pydantic import BaseModel, EmailStr

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
                start_hour=req.start_hour,
                end_hour=req.end_hour,
                granularity=req.granularity,
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
            start_hour=req.start_hour,
            end_hour=req.end_hour,
            granularity=req.granularity,
            )

    first = req.dates[0]
    last = req.dates[-1] if len(req.dates) > 1 else req.dates[0]
    zip_name = f"export_{first}_{last}.zip"

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
            start_hour=req.start_hour,
            end_hour=req.end_hour,
            granularity=req.granularity,
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


# ----------------------
# ASYNC ENDPOINTS
# ----------------------

@router.post("/daily/batch/async")
async def export_daily_batch_async(req: ExportBatchAsyncReq):
    if not req.variables:
        raise HTTPException(400, "Debe indicar al menos una variable.")
    if any(v not in VALID_FIELDS for v in req.variables):
        raise HTTPException(400, "Variable no válida.")

    # 1. Crear transacción en DB
    try:
        t_id = create_transaction_entry(
            user_id=req.user_id,
            var_ghi="GHI" in req.variables,
            var_dni="DNI" in req.variables,
            var_global="GLOBAL" in req.variables, # Ojo: validar nombres de vars
            imagenes=req.include_images
        )
    except Exception as e:
        print(f"DB Error: {e}")
        raise HTTPException(500, "Error creando transacción en DB")

    # 2. Encolar
    await enqueue_export_job(
        user_id=req.user_id,
        email=req.email,
        job_type="daily_batch",
        params=req.dict(exclude={"user_id", "email"}, exclude_unset=True),
        transaction_id=t_id
    )

    return {"message": "La exportación se está procesando, recibirás un correo cuando esté lista"}

@router.post("/range/async")
async def export_by_range_async(req: ExportRangeAsyncReq):
    if not req.variables:
        raise HTTPException(400, "Debe indicar al menos una variable.")
    
    # Validaciones previas básicas igual que en sync (opcional, pq se hará en worker, pero mejor fail fast)
    if not req.date_init or not req.date_finish:
         raise HTTPException(400, "Fechas requeridas")

    try:
        t_id = create_transaction_entry(
            user_id=req.user_id,
            var_ghi="GHI" in req.variables,
            var_dni="DNI" in req.variables,
            var_global="GLOBAL" in req.variables,
            imagenes=req.include_images
        )
    except Exception as e:
        print(f"DB Error: {e}")
        raise HTTPException(500, "Error creando transacción en DB")

    
    service_params = req.dict(exclude={"user_id", "email", "date_init", "date_finish", "format"}, exclude_unset=True)
    service_params["day_init"] = req.date_init
    service_params["day_finish"] = req.date_finish
    service_params["fmt"] = req.format
    service_params.setdefault("images_bucket", req.images_bucket)
    service_params.setdefault("variables", req.variables)

    await enqueue_export_job(
        user_id=req.user_id,
        email=req.email,
        job_type="range",
        params=service_params,
        transaction_id=t_id
    )

    return {"message": "La exportación se está procesando, recibirás un correo cuando esté lista"}


@router.get("/exports/{filename}")
def download_export_file(filename: str):
    """
    Descarga archivo desde MinIO (bucket exportaciones).
    """
    # En un caso real, validar usuario vs archivo aquí.
    bucket = "exportaciones"
    client = _minio_client()
    
    try:
        # Verificar existencia
        # stat_object lanza excepcion si no existe
        client.stat_object(bucket, filename)
        
        # Obtener stream
        resp = client.get_object(bucket, filename)
        
        # StreamingResponse con iterador
        def iterfile():
            try:
                for chunk in resp.stream(32*1024):
                    yield chunk
            finally:
                resp.close()
                resp.release_conn()
        
        return StreamingResponse(
            iterfile(),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
            
    except S3Error as e:
        if e.code == "NoSuchKey":
            raise HTTPException(404, "Archivo no encontrado (o expirado)")
        raise HTTPException(500, f"Error MinIO: {e}")
    except Exception as e:
        raise HTTPException(500, str(e))
