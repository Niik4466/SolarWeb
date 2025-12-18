from pathlib import Path
from typing import Optional
import json
import time

from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse

from services.image_service import (
    get_images_query,
    get_image,
    stream_images_query
)
from schemas.image import MinioListResponse
from core.security import get_current_user
from models.user import Usuario

router = APIRouter(prefix="/images", tags=["images"])

# =========================
# Endpoints existentes
# =========================

@router.get("", response_model=MinioListResponse)
def get_images(bucket: str, prefix: str = "", granularity: str = "1s", current_user: Usuario = Depends(get_current_user)) -> MinioListResponse:
    """
    Obtiene un listado de imágenes almacenadas en el bucket MinIO especificado.

    Permite filtrar por prefijo (directorio) y aplicar granularidad para reducir el número 
    de resultados (muestreo temporal). Retorna todos los resultados en una sola respuesta JSON.

    Args:
        bucket (str): Nombre del bucket de MinIO donde buscar.
        prefix (str, optional): Prefijo o ruta de directorio para filtrar objetos.
        granularity (str, optional): Granularidad temporal para el muestreo (ej: "1s", "1m"). Default: "1s".
        current_user (Usuario): Usuario autenticado realizando la petición.

    Returns:
        MinioListResponse: Objeto conteniendo la lista de nombres de objetos encontrados.

    Raises:
        HTTPException(500): Si ocurre un error de conexión o consulta a MinIO.
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
def download_image(bucket: str, object_name: str, current_user: Usuario = Depends(get_current_user)):
    """
    Descarga un archivo de imagen desde MinIO.

    Inicia una descarga forzada (Attachment) del objeto especificado. 
    Maneja el streaming del contenido para no sobrecargar la memoria.

    Args:
        bucket (str): Nombre del bucket.
        object_name (str): Ruta completa del objeto dentro del bucket.
        current_user (Usuario): Usuario autenticado.

    Returns:
        StreamingResponse: El contenido del archivo como stream de octetos.

    Raises:
        HTTPException(404): Si el objeto no existe en MinIO.
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
def view_image(bucket: str, object_name: str, current_user: Usuario = Depends(get_current_user)):
    """
    Visualiza una imagen directamente en el navegador (Inline).

    Similar a la descarga, pero con cabeceras `media-type` adecuadas (JPEG/PNG) 
    para que el navegador renderice la imagen en lugar de descargarla.

    Args:
        bucket (str): Nombre del bucket.
        object_name (str): Ruta completa del objeto.
        current_user (Usuario): Usuario autenticado.

    Returns:
        StreamingResponse: Stream de la imagen con el Content-Type detectado.

    Raises:
        HTTPException(404): Si la imagen no se encuentra.
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
    start_hhmm: Optional[str] = Query(default=None, pattern=r"^\d{2}:\d{2}$", description="Hora inicio filtro (HH:MM)"),
    end_hhmm:   Optional[str] = Query(default=None, pattern=r"^\d{2}:\d{2}$", description="Hora fin filtro (HH:MM)"),
    granularity: str          = Query("1s", description="Granularidad temporal (1s, 1m, 30m, 1h, etc)"),
    limit:        int         = Query(10_000, ge=1, le=200_000, description="Máx. objetos a emitir"),
    start_after:  Optional[str] = Query(default=None, description="Cursor (nombre de archivo) para paginación"),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Transmite (Stream) un listado de imágenes usando el formato NDJSON (Newline Delimited JSON).

    Ideal para listados muy grandes. Emite objetos JSON línea por línea conforme se encuentran,
    evitando esperar a completar la búsqueda para responder. Soporta filtrado por rango horario 
    (parseando el nombre del archivo) y paginación por cursor.

    Args:
        bucket (str): Nombre del bucket.
        prefix (str, optional): Prefijo de búsqueda.
        start_hhmm (str, optional): Hora de inicio (HH:MM) para filtrar archivos por nombre.
        end_hhmm (str, optional): Hora de fin (HH:MM) para filtrar archivos por nombre.
        granularity (str, optional): Intervalo de muestreo.
        limit (int, optional): Límite máximo de registros a devolver.
        start_after (str, optional): Nombre del último archivo recibido para continuar la paginación.
        current_user (Usuario): Usuario autenticado.

    Returns:
        StreamingResponse: Respuesta en formato `application/x-ndjson`.
                           Cada línea es un objeto JSON: `{"name": "path/to/image.jpg"}`.

    Raises:
        HTTPException(500): Si ocurre un error al inicializar el stream.
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
