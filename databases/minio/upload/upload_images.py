import sys
import os
import io
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
UPLOAD_LOG_FILE = os.getenv("UPLOAD_LOG_FILE", "/app/logs/UPLOAD_LOG.csv")

# Estado global
last_uploaded_ts = 0

def load_last_state():
    """Lee el UPLOAD_LOG.csv y retorna el timestamp global mas reciente."""
    global last_uploaded_ts
    if not os.path.exists(UPLOAD_LOG_FILE):
        return
    try:
        with open(UPLOAD_LOG_FILE, "r") as f:
            lines = [l.strip() for l in f.readlines() if l.strip()]
            
        if not lines:
            return

        # Ignorar header si existe en la última línea (caso archivo solo header)
        last_line = lines[-1]
        if "LAST_DIRECTORY" in last_line:
            return

        parts = last_line.split(",")
        if len(parts) >= 2:
            # Formato: directory, filename
            last_file = parts[1].strip()
            # Recuperar timestamp del filename
            match = re.search(r'(\d{17})', last_file)
            if match:
                last_uploaded_ts = int(match.group(1))
                print(f"[INIT] Estado cargado. Último TS: {last_uploaded_ts}")

    except Exception as e:
        print(f"[ERROR] Carga de estado: {e}")

def update_last_state(timestamp, key, filename):
    """Actualiza la variable global y escribe en el log."""
    global last_uploaded_ts
    if timestamp > last_uploaded_ts:
        last_uploaded_ts = timestamp
        try:
            # Extraer "Directorio" (YYYY/MM/DD) del key de MinIO
            directory = os.path.dirname(key)
            with open(UPLOAD_LOG_FILE, "w") as f:
                f.write("LAST_DIRECTORY, LAST_FILE.\n")
                f.write(f"{directory}, {filename}\n")
        except Exception as e:
            print(f"[ERROR] Update log: {e}")

# Cargar al inicio
load_last_state()

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

    # Lógica de descarte por software
    # Int(timestamp_str) vs global last_uploaded_ts
    try:
        current_ts = int(timestamp_str)
        if current_ts <= last_uploaded_ts:
            # Es un archivo viejo ya procesado (o anterior al último procesado)
            # print(f"[SKIP-SOFT] {filename} timestamp {current_ts} <= {last_uploaded_ts}")
            return
    except ValueError:
        pass

    # Consultar si ya existe en MinIO
    try:
        s3.head_object(Bucket=bucket_name, Key=key)
        print(f"[SKIP] {file_path} ya existe como {key}")
        return
    except botocore.exceptions.ClientError as e:
        if e.response['Error']['Code'] != "404":
            raise

    # Subir si no existe
    try:
        # Compresión en memoria
        with Image.open(file_path) as original_image:
            width, height = original_image.size
            # Resize 50%
            compressed_image = original_image.resize((width // 2, height // 2), Image.Resampling.LANCZOS)
            
            # Guardar en buffer
            buffer = io.BytesIO()
            compressed_image.save(buffer, format="JPEG", quality=85)
            buffer.seek(0)
            
            print(f"[UPLOAD] {file_path} (Comprimido) → {key}")
            s3.upload_fileobj(buffer, bucket_name, key)
            
            # Actualizar estado tras éxito
            try:
                current_ts = int(timestamp_str)
                # Extraemos "LAST_DIRECTORY" como YYYYMMDD
                update_last_state(current_ts, key, filename)
            except:
                pass
            
    except Exception as e:
        print(f"[ERROR] Procesando/Subiendo {file_path}: {e}")

# Subir imágenes existentes
print(f"[INIT] Escaneando y filtrando archivos en {image_dir}...")
valid_files = [] # Tuplas (timestamp, path)

# Cutoff para directorios (YYYYMMDD)
try:
    directory_cutoff = int(str(last_uploaded_ts)[:8])
except:
    directory_cutoff = 0

print(f"[INIT] Directory cutoff: {directory_cutoff}")

for root, dirs, files in os.walk(image_dir, topdown=True):
    # Filtrar directorios in-place para optimizar el recorrido
    for d in list(dirs):
        # Buscamos patrón de fecha (YYYY_MM_DD, YYYY-MM-DD, etc)
        match = re.search(r'(20\d{2})[._-](\d{2})[._-](\d{2})', d)
        if match:
            try:
                d_date = int(f"{match.group(1)}{match.group(2)}{match.group(3)}")
                # Si la carpeta es de un día PREVIO al último estado, se ignora completa
                if d_date < directory_cutoff:
                    dirs.remove(d)
                    print(f"[IGNORED] Directory {d} before {directory_cutoff}")
            except:
                pass

    for name in files:
        if not name.lower().endswith(('.jpg', '.jpeg', '.png')):
            continue
        
        # Extraer timestamp y filtrar
        match = re.search(r'(\d{17})', name)
        if not match:
            continue
        
        try:
            ts = int(match.group(1))
            if ts > last_uploaded_ts:
                file_path = Path(root) / name
                valid_files.append((ts, file_path))
        except ValueError:
            continue

# Ordenar por timestamp (índice 0 de la tupla)
print(f"[INIT] Ordenando {len(valid_files)} imágenes pendientes...")
valid_files.sort(key=lambda x: x[0])

print(f"[INIT] Iniciando carga ordenada...")
for ts, file_path in valid_files:
    upload_file(file_path)

# Watchdog para nuevas imágenes
class ImageHandler(FileSystemEventHandler):
    IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png')
    
    def __init__(self, observer):
        self.observer = observer

    def on_created(self, event):
        path = Path(event.src_path)

        if event.is_directory:
            print(f"[WATCHDOG] Nuevo directorio creado: {path}. Añadiendo watcher.")
            # Solución: Añadir el nuevo directorio al observador
            self.observer.schedule(self, path=path, recursive=True)
            return
        
        # Lógica para archivos (solo se ejecuta si NO es un directorio)
        if path.suffix.lower() in self.IMAGE_EXTENSIONS:
            print(f"[FILE DETECTED] Procesando {path.name}")
            time.sleep(1) 
            upload_file(path)
        else:
            print(f"[INFO] Ignorando archivo: {path.name}")

observer = Observer()
handler = ImageHandler(observer)
observer.schedule(handler, path=image_dir, recursive=True)
observer.start()

print(f"[WATCHING] Directorio: {image_dir}")

try:
    while True:
        time.sleep(10)
except KeyboardInterrupt:
    observer.stop()
observer.join()
