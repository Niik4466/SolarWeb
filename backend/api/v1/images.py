# backend/api/v1/images.py
from pathlib import Path
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from services.image_service import list_images, get_image  # get_image debe hacer minio.get_object(...)
from schemas.image import MinioListResponse

router = APIRouter()

@router.get("/images", response_model=MinioListResponse)
def get_images(bucket: str, prefix: str = ""):
    try:
        return list_images(bucket, prefix)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get(
    "/images/download",
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
        obj = get_image(bucket, object_name)  # debe retornar el objeto de MinIO (HTTPResponse-like)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    filename = Path(object_name).name

    def iterfile():
        try:
            for chunk in obj.stream(32 * 1024):
                yield chunk
        finally:
            obj.close()
            obj.release_conn()

    return StreamingResponse(
        iterfile(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@router.get(
    "/images/view",
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
            obj.release_conn()

    return StreamingResponse(iterfile(), media_type=media_type)
