from pathlib import Path
from typing import Optional
import json
import time

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from services.image_service import (
    get_images_query,
    get_image,
    stream_images_query
)
from schemas.image import MinioListResponse

router = APIRouter(prefix="/images", tags=["images"])

# =========================
# Endpoints existentes
# =========================

@router.get("", response_model=MinioListResponse)
def get_images(bucket: str, prefix: str = "", granularity: str = "1s") -> MinioListResponse:
    """
    Listado clásico (respuesta JSON única).
    """
    try:
        return get_images_query(bucket, prefix, granularity)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get(
    "/download",
    responses={
        200: {"content": {"application/octet-stream": {}}, "description": "Archivo"},
        404: {"description": "No encontrado"},
    },
)
def download_image(bucket: str, object_name: str):
    """
    Descarga forzada (Content-Disposition: attachment)
    y streaming con cierre del objeto MinIO.
    """
    try:
        obj = get_image(bucket, object_name)  # HTTPResponse-like
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    filename = Path(object_name).name

    def iterfile():
        try:
            for chunk in obj.stream(32 * 1024):
                yield chunk
        finally:
            obj.close()
            # release_conn es metodo de urllib3 response que minio devuelve
            if hasattr(obj, 'release_conn'):
                obj.release_conn()

    return StreamingResponse(
        iterfile(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@router.get(
    "/view",
    responses={
        200: {"content": {"image/jpeg": {}, "image/png": {}}, "description": "Imagen"},
        404: {"description": "No encontrado"},
    },
)
def view_image(bucket: str, object_name: str):
    """
    Visualización inline (para navegador). Detecta tipo por extensión simple.
    """
    try:
        obj = get_image(bucket, object_name)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    ext = Path(object_name).suffix.lower()
    media_type = "image/jpeg" if ext in [".jpg", ".jpeg"] else "image/png"

    def iterfile():
        try:
            for chunk in obj.stream(32 * 1024):
                yield chunk
        finally:
            obj.close()
            if hasattr(obj, 'release_conn'):
                obj.release_conn()

    return StreamingResponse(iterfile(), media_type=media_type)


# =========================
# NUEVO: Streaming NDJSON
# =========================

@router.get(
    "/stream",
    responses={
        200: {"content": {"application/x-ndjson": {}}, "description": "NDJSON stream"},
        400: {"description": "Parámetros inválidos"},
        500: {"description": "Error interno"},
    },
)
def stream_images(
    bucket: str,
    prefix: str = "",
    start_hhmm: Optional[str] = Query(default=None, pattern=r"^\d{2}:\d{2}$"),
    end_hhmm:   Optional[str] = Query(default=None, pattern=r"^\d{2}:\d{2}$"),
    granularity: str          = Query("1s", description="Granularidad temporal (1s, 1m, 30m, 1h, etc)"),
    limit:        int         = Query(10_000, ge=1, le=200_000, description="Máx. objetos a emitir"),
    start_after:  Optional[str] = Query(default=None, description="Cursor para continuar"),
):
    """
    Stream NDJSON: envía una línea JSON por objeto: {"name":"<obj>"}\n
    - Filtra por hora derivada del nombre de archivo.
    - Aplica granularidad temporal (agrupación/muestreo).
    - Corta en 'limit'.
    - Usa 'start_after' para paginar/continuar.
    """
    
    try:
        gen_names = stream_images_query(
            bucket=bucket, 
            prefix=prefix, 
            start_hhmm=start_hhmm, 
            end_hhmm=end_hhmm, 
            granularity=granularity, 
            limit=limit, 
            start_after=start_after
        )
    except Exception as e:
        # En streaming, si falla al inicio, lanzamos HTTP ex.
        # Si falla durante el stream, se corta (o se podría enviar JSON error si format lo permite).
        raise HTTPException(status_code=500, detail=str(e))

    def gen():
        last_flush = time.time()
        for name in gen_names:
            # Línea NDJSON (compacta)
            yield json.dumps({"name": name}, separators=(",", ":")) + "\n"

            # Flush cooperativo cada ~50ms para mejorar latencia percibida
            now = time.time()
            if now - last_flush > 0.05:
                last_flush = now

    headers = {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
    }

    return StreamingResponse(gen(), headers=headers)
