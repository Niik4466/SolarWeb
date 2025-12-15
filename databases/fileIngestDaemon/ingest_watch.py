#!/usr/bin/env python3
"""
ingest_watch_fixed.py
Versión corregida: Soluciona Deadlocks y explosión de hilos.
"""

import os
import time
import shutil
import threading
from pathlib import Path
from datetime import datetime, timezone
from PIL import Image, UnidentifiedImageError
import queue
import threading
from pathlib import Path
from datetime import datetime, timezone
from PIL import Image, UnidentifiedImageError

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
except Exception as e:
    raise RuntimeError("watchdog no está instalado") from e

# === Configuración ===
POLL_INTERVAL = float(os.getenv("POLL_INTERVAL", "1.0"))
STABLE_WAIT = float(os.getenv("STABLE_WAIT", "0.5")) 
LOG_PATH = Path(os.getenv("STATE_LOG_FILE", "./state_log.csv"))
LOST_DATA_PATH = Path(os.getenv("LOST_DATA_FILE", "./LOST_DATA.csv"))

# Rutas
IMAGES_SRC = Path(os.path.expanduser(os.getenv("IMAGES_ORIGIN_DIRECTORY", "/mnt/c/Users/usuario/Documents/DatosCamera")))
IMAGES_DST = Path(os.path.expanduser(os.getenv("IMAGES_DESTINY_DIRECTORY", "/mnt/e/DatosCameraCompressed")))
CSV_SRC = Path(os.path.expanduser(os.getenv("CSV_ORIGIN_DIRECTORY", "/mnt/c/Users/usuario/Documents/GitHub/LOGO")))
CSV_DST = Path(os.path.expanduser(os.getenv("CSV_DESTINY_DIRECTORY", "/mnt/e/DatosIrradiancia")))

CROP_PIXELS = int(os.getenv("CROP_PIXELS", "0"))
JPEG_QUALITY = int(os.getenv("JPEG_QUALITY", "85"))

# Cola de procesamiento para imágenes (Thread Safe)
image_queue = queue.Queue()

# --- Utilidades de tiempo ---
def now_iso():
    return datetime.now(timezone.utc).isoformat()

# --- Estado persistente ---
state_lock = threading.Lock() # Protege SOLO la escritura/lectura del archivo log

def read_state_log():
    with state_lock:
        if not LOG_PATH.exists():
            start = now_iso()
            # Escribimos directamente sin usar la función wrapper para evitar recursion de locks
            content = f"{start},\n{start},\n"
            LOG_PATH.write_text(content)
            return (start, ""), (start, "")

        try:
            lines = LOG_PATH.read_text().splitlines()
            while len(lines) < 2: lines.append(",")
            def parse_row(line):
                parts = line.split(",", 1)
                a = parts[0].strip() if parts and parts[0].strip() else ""
                b = parts[1].strip() if len(parts) > 1 and parts[1].strip() else ""
                return (a, b)
            return parse_row(lines[0]), parse_row(lines[1])
        except Exception as e:
            print(f"[ERROR] Leyendo state_log: {e}")
            return (now_iso(), ""), (now_iso(), "")

def write_state_log_safe(csv_state, img_state):
    """
    Escribe el log de forma atómica bajo lock.
    """
    content = f"{csv_state[0]},{csv_state[1]}\n{img_state[0]},{img_state[1]}\n"
    with state_lock:
        LOG_PATH.write_text(content)

def log_lost_data(path: Path, reason: str):
    """Registra archivos perdidos en CSV."""
    try:
        timestamp = now_iso()
        # formato: timestamp, filename, reason
        line = f"{timestamp},{path.name},{reason}\n"
        with open(LOST_DATA_PATH, "a", encoding="utf-8") as f:
            f.write(line)
        print(f"[LOST DATA] {path.name} -> {reason}")
    except Exception as e:
        print(f"[ERROR] Logging lost data {path}: {e}")

# --- Funciones para imágenes ---
def compress_and_save_image(source_path: Path, output_path: Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source_path) as original_image:
        if CROP_PIXELS > 0:
            w, h = original_image.size
            left = min(CROP_PIXELS, w//2)
            top = min(CROP_PIXELS, h//2)
            right = max(left, w - left)
            bottom = max(top, h - top)
            cropped = original_image.crop((left, top, right, bottom))
        else:
            cropped = original_image

        w2, h2 = cropped.size
        compressed = cropped.resize((max(1, w2 // 2), max(1, h2 // 2)), Image.Resampling.LANCZOS)

        out = output_path.with_suffix(".jpg")
        tmp = out.with_suffix(out.suffix + ".tmp")
        compressed.save(tmp, "JPEG", quality=JPEG_QUALITY)
        tmp.replace(out)
        return True, out


def file_is_stable(path: Path, wait: float = STABLE_WAIT):
    try:
        if not path.exists(): return False
        s1 = path.stat().st_size
        time.sleep(wait)
        if not path.exists(): return False
        s2 = path.stat().st_size
        return s1 == s2 and s1 > 0 # Asegurar que no esté vacío
    except Exception:
        return False

# --- Estado en Memoria ---
# Usamos un diccionario thread-safe simplificado
global_state = {
    "csv": ("",""),
    "img": ("",""),
    "lock": threading.Lock() # Protege acceso a este diccionario en memoria
}

def update_state_and_persist(key, new_val):
    """Actualiza la variable en memoria y luego persiste a disco de forma segura."""
    # 1. Actualizar memoria
    with global_state["lock"]:
        global_state[key] = new_val
        current_csv = global_state["csv"]
        current_img = global_state["img"]

    # 2. Persistir (fuera del lock de memoria para evitar contención, protegido por state_lock interno)
    write_state_log_safe(current_csv, current_img)

stop_event = threading.Event()

def process_single_image_task(src: Path):
    """
    Función worker aislada. No recibe locks externos para evitar deadlocks.
    """
    try:
        if not src.exists(): return
        if src.suffix.lower() not in (".jpg", ".jpeg", ".png"): return
        
        # Espera estabilidad PRIMERO (antes de chequear tamaño)
        # Esto da tiempo a que se escriba el contenido si el archivo acaba de crearse (size=0)
        if not file_is_stable(src):
            print(f"[WARN] Archivo inestable, esperando estabilidad: {src}")
            time.sleep(2.0)
            if not file_is_stable(src):
                print(f"[WARN] Archivo inestable, omitiendo: {src}")
                return

        # 1. Chequeo de tamaño mínimo (< 10 bytes) AHORA que es estable
        try:
            size_bytes = src.stat().st_size
            if size_bytes < 10:
                log_lost_data(src, f"Size {size_bytes} < 10 bytes")
                src.unlink()
                return

        except FileNotFoundError:
            return 
        except Exception as e:
            print(f"[ERROR] Check size {src}: {e}")
            return

        rel = src.relative_to(IMAGES_SRC)
        dst = IMAGES_DST / rel

        # Retry logic: 2 retries (Initial + 2 retries = 3 attempts)
        retry_delays = [1.0, 5.0]
        
        for attempt in range(len(retry_delays) + 1):
            try:
                # compress_and_save_image now raises exceptions on failure
                ok, outpath = compress_and_save_image(src, dst)
                
                # If successful:
                try:
                    src.unlink()
                except Exception as e:
                    print(f"[WARN] no se pudo borrar origen {src}: {e}")

                # Actualizar estado global sin deadlocks
                with global_state["lock"]:
                    current_start = global_state["img"][0]
                new_img_state = (current_start, now_iso())
                update_state_and_persist("img", new_img_state)

                print(f"[IMG] OK: {src.name}")
                return # Exit function on success

            except Exception as e:
                # Failure
                if attempt < len(retry_delays):
                    wait_time = retry_delays[attempt]
                    print(f"[WARN] Fallo procesando {src.name} (Intento {attempt+1}): {e}. Reintentando en {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    # Final failure after retries
                    print(f"[ERROR] Worker falló finalmente con {src.name}: {e}")
                    reason = f"Failed after {attempt+1} attempts. Last error: {type(e).__name__}: {e}"
                    log_lost_data(src, reason)
                    try:
                        src.unlink()
                        print(f"[DELETE] Eliminado archivo corrupto/fallido: {src.name}")
                    except Exception as del_e:
                        print(f"[ERROR] No se pudo eliminar archivo corrupto {src}: {del_e}")
                    return
    except Exception as e:
        print(f"[ERROR] Unhandled worker exception for {src}: {e}")

def image_worker_loop():
    print("[IMG-THREAD] Worker iniciado. Esperando archivos...")
    while not stop_event.is_set():
        try:
            # Get with timeout to allow checking stop_event
            path = image_queue.get(timeout=1.0)
        except queue.Empty:
            continue
        
        process_single_image_task(path)
        image_queue.task_done()
    print("[IMG-THREAD] Finalizado.")

# Handler de watchdog optimizado
class ImageEventHandler(FileSystemEventHandler):
    def __init__(self, observer):
        super().__init__()
        self.observer = observer
        self.processing_cache = set()
        self.cache_lock = threading.Lock()

    def _should_handle(self, path):
        return Path(path).suffix.lower() in (".jpg", ".jpeg", ".png")

    def _submit(self, path):
         p = Path(path)
         with self.cache_lock:
             if p in self.processing_cache: return
             self.processing_cache.add(p)
         
         image_queue.put(p)
    

    def _cleanup_cache(self, path):
        with self.cache_lock:
            self.processing_cache.discard(path)

    def on_created(self, event):
        path = Path(event.src_path)
        if event.is_directory:
            print(f"[WATCHDOG] Nuevo directorio creado: {path}. Añadiendo watcher.")
            self.observer.schedule(self, path=path, recursive=True)
            return

        if self._should_handle(event.src_path):
            self._submit(event.src_path)

    def on_modified(self, event):
        if not event.is_directory and self._should_handle(event.src_path):
            self._submit(event.src_path)

    def on_moved(self, event):
        if not event.is_directory and getattr(event, "dest_path", None):
            if self._should_handle(event.dest_path):
                self._submit(event.dest_path)

# ---------------- CSV logic (Simplificada integración) ----------------

def find_latest_csv_in_source():
    candidates = []
    for root, _, files in os.walk(CSV_SRC):
        for f in files:
            if f.lower().endswith(".csv"):
                p = Path(root) / f
                try: candidates.append((p.stat().st_mtime, p))
                except: continue
    if not candidates: return None
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]

def recover_move_all_except(active_path: Path):
    moved = 0
    for root, _, files in os.walk(CSV_SRC):
        for f in files:
            if not f.lower().endswith(".csv"): continue
            p = Path(root) / f
            dest = CSV_DST / p.relative_to(CSV_SRC)
            dest.parent.mkdir(parents=True, exist_ok=True)
            try:
                if active_path and p.resolve() == active_path.resolve():
                    if not dest.exists(): # Solo copiar si no existe
                        shutil.copy(str(p), str(dest))
                    continue
                shutil.move(str(p), str(dest))
                moved += 1
            except Exception as e:
                print(f"[RECOVER ERROR] {p}: {e}")
    return moved

class CSVTailer:
    def __init__(self):
        self.active_src = None
        self.src_file = None
        self.src_pos = 0

    def open_active(self, src_path: Path):
        self.close_active(delete_source=False)
        if src_path is None: return
        self.active_src = src_path
        dst = CSV_DST / src_path.relative_to(CSV_SRC)
        dst.parent.mkdir(parents=True, exist_ok=True)

        if not dst.exists():
            try: shutil.copy2(src_path, dst)
            except Exception: pass

        try:
            self.src_file = open(src_path, "r", encoding="utf-8", errors="replace")
            self.src_file.seek(0, os.SEEK_END)
            self.src_pos = self.src_file.tell()
        except Exception as e:
            print(f"[CSV ERROR] open {src_path}: {e}")
            self.active_src = None

    def close_active(self, delete_source=False):
        if self.src_file:
            try: self.src_file.close()
            except: pass
        if delete_source and self.active_src:
            try: os.remove(self.active_src)
            except: pass
        self.src_file = None
        self.active_src = None

    def tail_once(self):
        if not self.src_file: return 0, None
        try:
            self.src_file.seek(self.src_pos)
            added = 0
            last_ts = None
            dst = CSV_DST / self.active_src.relative_to(CSV_SRC)
            with open(dst, "a", encoding="utf-8", errors="replace") as out:
                while True:
                    line = self.src_file.readline()
                    if not line: break
                    out.write(line)
                    added += 1
                    last_ts = now_iso()
                self.src_pos = self.src_file.tell()
            return added, last_ts
        except Exception as e:
            print(f"[CSV TAIL ERROR] {e}")
            return 0, None

def csv_flow():
    print("[CSV-THREAD] Iniciado.")
    tailer = CSVTailer()
    active = find_latest_csv_in_source()
    if active: tailer.open_active(active)
    recover_move_all_except(active)

    while not stop_event.is_set():
        # 1. Tail
        added, last_ts = tailer.tail_once()
        if added:
            with global_state["lock"]:
                curr_start = global_state["csv"][0]
                if not curr_start: curr_start = now_iso()

            new_state = (curr_start, last_ts or now_iso())
            update_state_and_persist("csv", new_state)
            print(f"[CSV] +{added} líneas.")

        # 2. Check rotation
        latest = find_latest_csv_in_source()
        if latest:
            # Condición de rotación: existe uno nuevo y es más reciente que el activo
            is_new = False
            if not tailer.active_src:
                is_new = True
            elif latest.resolve() != tailer.active_src.resolve():
                try:
                    if latest.stat().st_mtime > tailer.active_src.stat().st_mtime:
                        is_new = True
                except: pass

            if is_new:
                print(f"[CSV] Rotando a {latest.name}")
                prev = tailer.active_src
                tailer.open_active(latest)
                # Borrar anterior si existía
                if prev and prev.exists():
                    try: os.remove(prev)
                    except: pass

                # Reset timestamp start para el nuevo archivo
                update_state_and_persist("csv", (now_iso(), global_state["csv"][1]))

        time.sleep(POLL_INTERVAL)
    tailer.close_active()

def main():
    # Setup dirs
    for p in [IMAGES_SRC, IMAGES_DST, CSV_SRC, CSV_DST, LOG_PATH.parent]:
        p.mkdir(parents=True, exist_ok=True)

    # Cargar estado inicial
    csv_s, img_s = read_state_log()
    if not csv_s[0]: csv_s = (now_iso(), csv_s[1])
    if not img_s[0]: img_s = (now_iso(), img_s[1])

    global_state["csv"] = csv_s
    global_state["img"] = img_s
    write_state_log_safe(csv_s, img_s)

    # Executor eliminado. Usamos Queue y un hilo.
    
    # Procesar existentes (Encolar)
    print("[INIT] Procesando imágenes existentes...")
    cnt = 0
    for root, _, files in os.walk(IMAGES_SRC):
        for f in files:
            p = Path(root) / f
            if p.suffix.lower() in (".jpg", ".jpeg", ".png"):
                image_queue.put(p)
                cnt += 1
    print(f"[INIT] {cnt} imágenes encoladas.")

    # Threads
    t_csv = threading.Thread(target=csv_flow, name="CSVThread", daemon=True)
    t_img = threading.Thread(target=image_worker_loop, name="ImgThread", daemon=True)

    # Watchdog
    observer = Observer()
    event_handler = ImageEventHandler(observer)
    observer.schedule(event_handler, str(IMAGES_SRC), recursive=True)

    print("[START] Iniciando servicios...")
    t_csv.start()
    t_img.start()
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[STOP] Deteniendo...")
        stop_event.set()
        observer.stop()
        observer.join()
        # Esperar a que el worker termine (max 1s latency)
        t_img.join()
        print("[STOP] Bye.")

if __name__ == "__main__":
    main()