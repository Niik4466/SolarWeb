# backend/services/image_service.py
from db.minio import get_minio_client
from schemas.image import MinioListResponse, MinioObject


def list_images(bucket: str, prefix: str = "") -> MinioListResponse:
    """
    Devuelve los objetos de MinIO en el bucket/prefix indicado.
    """
    client = get_minio_client()
    objects = client.list_objects(bucket, prefix=prefix, recursive=True)

    object_list = [
        MinioObject(
            name=obj.object_name,
        )
        for obj in objects
    ]
    return MinioListResponse(bucket=bucket, objects=object_list)


def get_image(bucket: str, object_name: str):
    """
    Devuelve un objeto de MinIO como stream.
    """
    client = get_minio_client()
    return client.get_object(bucket, object_name)
