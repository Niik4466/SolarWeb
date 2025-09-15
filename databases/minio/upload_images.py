import sys
import os
import time
from datetime import datetime
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

def get_image_datetime(image_path):
    try:
        img = Image.open(image_path)
        exif_data = img._getexif() or {}
        for tag, value in exif_data.items():
            decoded = TAGS.get(tag, tag)
            if decoded == "DateTimeOriginal":
                return datetime.strptime(value, "%Y:%m:%d %H:%M:%S")
    except:
        pass
    # fallback: fecha de modificación del archivo
    t = os.path.getmtime(image_path)
    return datetime.fromtimestamp(t)


def upload_file(file_path: Path):
    if not file_path.is_file():
        return

    dt = get_image_datetime(file_path)
    key = f"{dt.year:04d}/{dt.month:02d}/{dt.day:02d}/{dt.hour:02d}_{dt.minute:02d}_{dt.second:02d}{file_path.suffix}"

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
observer.schedule(ImageHandler(), path=image_dir, recursive=False)
observer.start()

print(f"[WATCHING] Directorio: {image_dir}")

try:
    while True:
        time.sleep(10)
except KeyboardInterrupt:
    observer.stop()
observer.join()
