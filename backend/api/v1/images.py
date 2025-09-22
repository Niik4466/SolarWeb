# backend/api/v1/images.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from backend.services.image_service import list_images, get_image
from backend.schemas.image import MinioListResponse

router = APIRouter()

@router.get("/images", response_model=MinioListResponse)
def get_images(bucket: str, prefix: str = ""):
    try:
        return list_images(bucket, prefix)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/images/download")
def download_image(bucket: str, object_name: str):
    try:
        obj = get_image(bucket, object_name)
        return StreamingResponse(obj, media_type="application/octet-stream")
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
