# backend/db/minio_client.py
from functools import lru_cache
from minio import Minio
from core.config import settings

@lru_cache
def get_minio_client() -> Minio:
    return Minio(
        endpoint=settings.MINIO_ENDPOINT.replace("http://", "").replace("https://", ""),
        access_key=settings.MINIO_USER,
        secret_key=settings.MINIO_PASSWORD,
        secure=settings.MINIO_ENDPOINT.startswith("https://")
    )
