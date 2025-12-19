import os
import csv
import time
import sys
import re
from pathlib import Path
from datetime import datetime
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

# === Configuración ===
DIRECTORIO = Path(os.getenv("CSV_SOURCE_DIR", "/datos"))
POLL_INTERVAL = 1.0

# InfluxDB Config
URL = os.getenv("INFLUX_ENDPOINT", "http://influxdb-solarweb:8086")
TOKEN = os.getenv("INFLUX_TOKEN", "super-secret-token")
ORG = os.getenv("INFLUX_ORG", "miOrg")
BUCKET = os.getenv("INFLUX_BUCKET", "miBucket")

# === Clases y Funciones ===

class InfluxConnector:
    def __init__(self):
        self.client = InfluxDBClient(url=URL, token=TOKEN, org=ORG)
        self.write_api = self.client.write_api(write_options=SYNCHRONOUS)

    def write_points(self, points):
        if not points:
            return
        try:
            self.write_api.write(bucket=BUCKET, org=ORG, record=points)
            print(f"[INFLUX] Escritos {len(points)} puntos.")
        except Exception as e:
            print(f"[INFLUX ERROR] Error escribiendo puntos: {e}")

    def close(self):
        self.client.close()

def parse_row_to_point(fila):
    """
    Convierte una fila del CSV (dict) a un Point de InfluxDB.
    Retorna None si falla o faltan datos.
    """
    if not fila.get("Fecha") or not fila.get("Hora"):
        return None

    try:
        # Parsear fecha
        fecha = datetime.strptime(fila["Fecha"], "%Y-%m-%d").date()

        # Parsear hora
        hora_str = fila["Hora"]
        if "." in hora_str:
            hora = datetime.strptime(hora_str, "%H:%M:%S.%f").time()
        else:
            hora = datetime.strptime(hora_str, "%H:%M:%S").time()

        # Combinar
        ts = datetime.combine(fecha, hora)

        point = Point("radiacion_solar").time(ts, WritePrecision.NS)
        
        # Campos estándar
        point.field("DNI", float(fila["DNI"]))
        point.field("DHI", float(fila["DHI"]))
        point.field("GHI", float(fila["GHI"]))

        # Campos extra (si existen)
        if fila.get("HR"):
            point.field("HR", float(fila["HR"]))
        
        if fila.get("Temp"):
            point.field("Temp", float(fila["Temp"]))

        return point
    except Exception as e:
        # print(f"[PARSE ERROR] Fila omitida: {e}") # Verbose
        return None

def process_file_full(path: Path, influx: InfluxConnector):
    """
    Lee un archivo completo y lo envía a InfluxDB.
    """
    print(f"[STARTUP] Procesando archivo completo: {path}")
    points = []
    try:
        with open(path, newline="", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for fila in reader:
                p = parse_row_to_point(fila)
                if p:
                    points.append(p)
                    # Batching simple (opcional, aquí enviamos todo al final o por chunks)
                    if len(points) >= 1000:
                        influx.write_points(points)
                        points = []
            
            # Enviar restantes
            if points:
                influx.write_points(points)
    except Exception as e:
        print(f"[ERROR] Procesando archivo {path}: {e}")

def extract_date_from_filename(filename: str):
    """
    Extrae la fecha (YYYY-MM-DD) del nombre del archivo.
    Retorna datetime.date o None si no hace match.
    """
    match = re.search(r"(\d{4}-\d{2}-\d{2})", filename)
    if match:
        try:
            return datetime.strptime(match.group(1), "%Y-%m-%d").date()
        except ValueError:
            return None
    return None

def find_latest_csv(directory: Path):
    """
    Encuentra el CSV con la fecha más reciente en el nombre.
    Retorna (fecha, path) o None.
    """
    candidates = []
    if not directory.exists():
        return None
    
    for f in directory.iterdir():
        if f.is_file() and f.suffix.lower() == ".csv":
            d = extract_date_from_filename(f.name)
            if d:
                candidates.append((d, f))
    
    if not candidates:
        return None
    
    # Ordenar por fecha descendente
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0]  # Retorna (date, path)

class CSVTailer:
    """
    Mantiene tail sobre un archivo CSV activo.
    """
    def __init__(self, influx: InfluxConnector):
        self.active_src = None
        self.src_file = None
        self.src_pos = 0
        self.influx = influx
        self.headers = None

    def open_active(self, src_path: Path, seek_end=True):
        self.close_active()
        if src_path is None:
            return
        
        self.active_src = src_path
        print(f"[TAILER] Abriendo archivo: {src_path} (Seek End: {seek_end})")
        
        try:
            self.src_file = open(src_path, "r", encoding="utf-8", errors="replace")
            
            # Leemos los headers
            self.headers = next(csv.reader([self.src_file.readline()]))
            
            if seek_end:
                self.src_file.seek(0, os.SEEK_END)
            
            self.src_pos = self.src_file.tell()
            
        except Exception as e:
            print(f"[TAILER ERROR] Error abriendo {src_path}: {e}")
            self.src_file = None
            self.active_src = None

    def close_active(self):
        if self.src_file:
            try:
                self.src_file.close()
            except Exception:
                pass
            self.src_file = None
        self.active_src = None
        self.src_pos = 0
        self.headers = None

    def tail_once(self):
        if not self.src_file or not self.active_src:
            return 0

        try:
            self.src_file.seek(self.src_pos)
            lines = self.src_file.readlines()
            if not lines:
                return 0
            
            # Actualizar posición
            self.src_pos = self.src_file.tell()

            # Procesar líneas
            points = []
            # Usamos DictReader con los headers que leímos al principio
            # Simulamos un archivo con las líneas leídas
            reader = csv.DictReader(lines, fieldnames=self.headers)
            
            for fila in reader:

                # Asumimos que seek(0, SEEK_END) cae al final limpio.
                p = parse_row_to_point(fila)
                if p:
                    points.append(p)
            
            if points:
                self.influx.write_points(points)
                return len(points)
            
            return 0

        except Exception as e:
            print(f"[TAILER ERROR] Error leyendo {self.active_src}: {e}")
            return 0

def main():
    print("=== Iniciando Daemon de Ingesta InfluxDB ===")
    
    # 1. Conexión Influx
    influx = InfluxConnector()
    
    # 2. Startup: Procesar TODOS los archivos existentes (ordenados por fecha)
    if DIRECTORIO.exists():
        # Recolectar todos los archivos con fecha válida
        all_files = []
        for f in DIRECTORIO.iterdir():
            if f.is_file() and f.suffix.lower() == ".csv":
                d = extract_date_from_filename(f.name)
                if d:
                    all_files.append((d, f))
        
        # Ordenar por fecha ascendente para procesar en orden cronológico
        all_files.sort(key=lambda x: x[0])
        
        print(f"[STARTUP] Encontrados {len(all_files)} archivos CSV válidos.")
        for _, f in all_files:
            process_file_full(f, influx)
    else:
        print(f"[WARN] Directorio {DIRECTORIO} no existe.")

    # 3. Daemon Loop
    tailer = CSVTailer(influx)
    
    # Inicializar con el último archivo
    latest_info = find_latest_csv(DIRECTORIO)
    current_active_date = None
    
    if latest_info:
        current_active_date, latest_path = latest_info
        # Abrimos con seek_end=True porque ya lo procesamos en el paso 2
        tailer.open_active(latest_path, seek_end=True)
    
    try:
        while True:
            # 1. Leer nuevas líneas del activo
            added = tailer.tail_once()
            if added > 0:
                print(f"[DAEMON] Agregados {added} puntos de {tailer.active_src.name}")

            # 2. Chequear rotación
            latest_info = find_latest_csv(DIRECTORIO)
            if latest_info:
                found_date, found_path = latest_info
                
                # Si encontramos una fecha MAS NUEVA que la actual
                # O si no teníamos fecha actual (arranque en vacío)
                if current_active_date is None or found_date > current_active_date:
                    print(f"[DAEMON] Detectado nuevo archivo (Fecha: {found_date}): {found_path}")
                    
                    # Actualizar fecha activa
                    current_active_date = found_date
                    
                    # Abrimos el nuevo desde el PRINCIPIO (seek_end=False)
                    tailer.open_active(found_path, seek_end=False)
            
            time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print("\n[SHUTDOWN] Deteniendo...")
        tailer.close_active()
        influx.close()
        print("Bye.")

if __name__ == "__main__":
    main()
