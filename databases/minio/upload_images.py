import sys
import os
import time
from datetime import datetime
import re
from pathlib import Path
import boto3
from PIL import Image
from PIL.ExifTags import TAGS
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import botocore

# Args
image_dir = os.getenv("IMAGE_DIR", "/app/images")
bucket_name = os.getenv("MINIO_BUCKET", "imagenes-cielo")

# Config MinIO
s3 = boto3.client(
    's3',
    endpoint_url=os.getenv("MINIO_ENDPOINT", "http://minio:9000"),
    aws_access_key_id=os.getenv("MINIO_ROOT_USER", "minioadmin"),
    aws_secret_access_key=os.getenv("MINIO_ROOT_PASSWORD", "minioadmin")
)

# Creamos bucket si no existe
try:
    s3.head_bucket(Bucket=bucket_name)
    print(f"[INFO] Bucket '{bucket_name}' ya existe")
except botocore.exceptions.ClientError as e:
    error_code = e.response['Error']['Code']
    if error_code in ("404", "NoSuchBucket"):
        print(f"[CREATE] Creando bucket '{bucket_name}'...")
        s3.create_bucket(Bucket=bucket_name)
    else:
        raise


def upload_file(file_path: Path):
    if not file_path.is_file():
        return

    filename = file_path.name  # ejemplo: 172.16.137.6_01_20250802213004761_TIMING.jpg

    # Buscar la cadena de fecha en el nombre (17 dígitos seguidos de números)
    match = re.search(r'(\d{17})', filename)
    if not match:
        print(f"[ERROR] No se encontró timestamp en {filename}")
        return

    timestamp_str = match.group(1)  # "20250802213004761"
    base_time = timestamp_str[:14]  # "20250802213004" → YYYYMMDDHHMMSS
    millis = timestamp_str[14:]     # "761"

    # Convertir a datetime
    dt = datetime.strptime(base_time, "%Y%m%d%H%M%S")

    # Construir key con el nuevo formato
    key = (
        f"{dt.year:04d}/"
        f"{dt.month:02d}/"
        f"{dt.day:02d}/"
        f"{dt.hour:02d}_{dt.minute:02d}_{dt.second:02d}{file_path.suffix}"
    )

    # Consultar si ya existe en MinIO
    try:
        s3.head_object(Bucket=bucket_name, Key=key)
        print(f"[SKIP] {file_path} ya existe como {key}")
        return
    except botocore.exceptions.ClientError as e:
        if e.response['Error']['Code'] != "404":
            raise

    # Subir si no existe
    print(f"[UPLOAD] {file_path} → {key}")
    s3.upload_file(str(file_path), bucket_name, key)

# Subir imágenes existentes
for file_path in Path(image_dir).glob("*.*"):
    upload_file(file_path)

# Watchdog para nuevas imágenes
class ImageHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        file_path = Path(event.src_path)
        time.sleep(1)  # esperar a que termine de escribirse
        upload_file(file_path)

observer = Observer()
observer.schedule(ImageHandler(), path=image_dir, recursive=True)
observer.start()

print(f"[WATCHING] Directorio: {image_dir}")

try:
    while True:
        time.sleep(10)
except KeyboardInterrupt:
    observer.stop()
observer.join()
