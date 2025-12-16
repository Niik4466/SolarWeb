import sys
import os
import io
import time
from datetime import datetime
import re
from pathlib import Path
import boto3
from PIL import Image
import botocore

# === Configuración ===
POLL_INTERVAL = 5.0  # Revisar disco cada 5 segundos
image_dir = os.getenv("IMAGE_DIR", "/app/images")
bucket_name = os.getenv("MINIO_BUCKET", "imagenes-cielo")
UPLOAD_LOG_FILE = os.getenv("UPLOAD_LOG_FILE", "/app/logs/UPLOAD_LOG.csv")

# Estado global en memoria
last_uploaded_ts = 0

# --- Gestión de Estado ---
def load_last_state():
    global last_uploaded_ts
    if not os.path.exists(UPLOAD_LOG_FILE):
        return
    try:
        with open(UPLOAD_LOG_FILE, "r") as f:
            lines = [l.strip() for l in f.readlines() if l.strip()]
        if not lines: return
        
        # Intentar leer la última línea válida
        for line in reversed(lines):
            if "LAST_DIRECTORY" in line: continue
            parts = line.split(",")
            if len(parts) >= 2:
                last_file = parts[1].strip()
                match = re.search(r'(\d{17})', last_file)
                if match:
                    last_uploaded_ts = int(match.group(1))
                    print(f"[STATE] Recuperado TS: {last_uploaded_ts}")
                    return
    except Exception as e:
        print(f"[ERROR] Carga de estado: {e}")

def update_last_state(timestamp, key, filename):
    global last_uploaded_ts
    # Siempre actualizamos si es mayor
    if timestamp > last_uploaded_ts:
        last_uploaded_ts = timestamp
        try:
            directory = os.path.dirname(key)
            # Modo 'w' para no hacer crecer el archivo infinitamente, solo nos importa el último
            with open(UPLOAD_LOG_FILE, "w") as f:
                f.write("LAST_DIRECTORY, LAST_FILE\n")
                f.write(f"{directory}, {filename}\n")
        except Exception as e:
            print(f"[ERROR] Update log: {e}")

# --- Configuración MinIO ---
config = botocore.config.Config(connect_timeout=10, read_timeout=30)
s3 = boto3.client(
    's3',
    endpoint_url=os.getenv("MINIO_ENDPOINT", "http://minio:9000"),
    aws_access_key_id=os.getenv("MINIO_ROOT_USER", "minioadmin"),
    aws_secret_access_key=os.getenv("MINIO_ROOT_PASSWORD", "minioadmin"),
    config=config
)

try:
    s3.head_bucket(Bucket=bucket_name)
except botocore.exceptions.ClientError as e:
    if e.response['Error']['Code'] in ("404", "NoSuchBucket"):
        s3.create_bucket(Bucket=bucket_name)

# --- Lógica de Subida ---
def process_and_upload(file_path: Path, timestamp: int):
    filename = file_path.name
    timestamp_str = str(timestamp)
    
    # Preparar Key S3
    base_time = timestamp_str[:14]
    try:
        dt = datetime.strptime(base_time, "%Y%m%d%H%M%S")
    except ValueError:
        return

    key = f"{dt.year:04d}/{dt.month:02d}/{dt.day:02d}/{dt.hour:02d}_{dt.minute:02d}_{dt.second:02d}{file_path.suffix}"

    # Verificar existencia en S3 (Idempotencia)
    try:
        s3.head_object(Bucket=bucket_name, Key=key)
        # Si existe, solo actualizamos el estado local
        update_last_state(timestamp, key, filename)
        return
    except botocore.exceptions.ClientError as e:
        if e.response['Error']['Code'] != "404":
            print(f"[WARN] Error consultando S3: {e}")
            return

    # Subir
    try:
        with Image.open(file_path) as original_image:
            width, height = original_image.size
            compressed_image = original_image.resize((width // 2, height // 2), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            compressed_image.save(buffer, format="JPEG", quality=85)
            buffer.seek(0)
            
            print(f"[UPLOAD] {filename} -> {key}")
            s3.upload_fileobj(buffer, bucket_name, key)
            update_last_state(timestamp, key, filename)
            
    except Exception as e:
        print(f"[ERROR] Falló subida {filename}: {e}")

# --- Función de Escaneo (El reemplazo de Watchdog) ---
def scan_and_process():
    """
    Escanea recursivamente, filtra por TS > last_uploaded_ts, 
    ordena y sube.
    """
    candidates = []
    
    # Optimizacion: Calcular cutoff de fecha para no escanear carpetas viejas
    directory_cutoff = 0
    if last_uploaded_ts > 0:
        directory_cutoff = int(str(last_uploaded_ts)[:8])

    for root, dirs, files in os.walk(image_dir, topdown=True):
        # 1. Podar directorios antiguos para ir rápido
        for d in list(dirs):
            match = re.search(r'(20\d{2})[._-](\d{2})[._-](\d{2})', d)
            if match:
                try:
                    d_date = int(f"{match.group(1)}{match.group(2)}{match.group(3)}")
                    if d_date < directory_cutoff:
                        dirs.remove(d) # No entrar aquí
                except: pass
        
        # 2. Buscar archivos nuevos
        for name in files:
            if not name.lower().endswith(('.jpg', '.jpeg', '.png')):
                continue
            
            match = re.search(r'(\d{17})', name)
            if match:
                ts = int(match.group(1))
                if ts > last_uploaded_ts:
                    candidates.append((ts, Path(root) / name))
    
    if not candidates:
        return

    # Ordenar por antigüedad (procesar cronológicamente)
    candidates.sort(key=lambda x: x[0])
    
    if len(candidates) > 0:
        print(f"[BATCH] Encontrados {len(candidates)} archivos nuevos.")

    for ts, path in candidates:
        if ts > last_uploaded_ts:
            process_and_upload(path, ts)

# === Main Loop ===
if __name__ == "__main__":
    print("[START] Iniciando Uploader (Modo Polling Manual)...")
    load_last_state()
    
    try:
        while True:
            scan_and_process()
            time.sleep(POLL_INTERVAL)
            print(".", end="", flush=True) 
    except KeyboardInterrupt:
        print("\n[STOP] Detenido por usuario.")