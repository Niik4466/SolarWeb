#!/usr/bin/env python3
"""
ingest_watch.py

- Vigila imágenes en IMAGES_SRC (recursivo) con watchdog, las recorta/comprime y guarda en IMAGES_DST
  manteniendo la estructura relativa. Procesa archivos existentes al inicio y los que detecta watchdog.
  Después de comprimir BORRA la imagen origen (espec según tu petición).
- Vigila CSVs en CSV_SRC: 
    - Tail sobre el CSV más reciente y agrega líneas al destino.
    - Paso "masivo" inicial cortando y pegando CSV desde CSV_SRC hacia CSV_DST
- Mantiene un state_log.csv con 2 filas:
  row 0 -> CSVs: start_date_iso , last_timestamp_iso_or_empty
  row 1 -> IMAGES: start_date_iso, last_timestamp_iso_or_empty
"""

import os
import time
import shutil
import threading
from pathlib import Path
from datetime import datetime, timezone
from PIL import Image

# --- watchdog import (requerido). Si no está, se caerá con una instrucción clara. ---
try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
except Exception as e:
    raise RuntimeError("watchdog no está instalado") from e

# === Configuración ===
POLL_INTERVAL = float(os.getenv("POLL_INTERVAL", "1.0"))  # usado para loop principal del CSV
STABLE_WAIT = float(os.getenv("STABLE_WAIT", "0.01"))      # segundos para considerar archivo estable
LOG_PATH = Path(os.getenv("STATE_LOG_FILE", "./state_log.csv"))

# Rutas (usa expanduser)
IMAGES_SRC = Path(os.path.expanduser(os.getenv("IMAGES_ORIGIN_DIRECTORY", "~/Pictures/DatosCamera")))
IMAGES_DST = Path(os.path.expanduser(os.getenv("IMAGES_DESTINY_DIRECTORY", "~/Pictures/DatosCameraComprimido")))
CSV_SRC = Path(os.path.expanduser(os.getenv("CSV_ORIGIN_DIRECTORY", "~/Downloads/csv")))
CSV_DST = Path(os.path.expanduser(os.getenv("CSV_DESTINY_DIRECTORY", "~/Downloads/Irradiancia")))

# Parámetros de recorte/compress (si quieres cambiar, usa vars de entorno)
CROP_PIXELS = int(os.getenv("CROP_PIXELS", "0"))  # recorta X píxeles de cada borde (si 0 => no recorta)
JPEG_QUALITY = int(os.getenv("JPEG_QUALITY", "85"))

# --- Utilidades de tiempo ---
def now_iso():
    return datetime.now(timezone.utc).isoformat()

def epoch_to_iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()

# --- Estado persistente simple (state_log.csv) ---
# Formato: sin cabecera, DOS filas:
# row 0 -> CSVs: start_date_iso , last_timestamp_iso_or_empty
# row 1 -> IMAGES: start_date_iso, last_timestamp_iso_or_empty

def read_state_log():
    if not LOG_PATH.exists():
        start = now_iso()
        write_state_log((start, ""), (start, ""))
        return (start, ""), (start, "")
    lines = LOG_PATH.read_text().splitlines()
    # rellenar si falta
    while len(lines) < 2:
        lines.append(",")
    def parse_row(line):
        parts = line.split(",", 1)
        a = parts[0].strip() if parts and parts[0].strip() else ""
        b = parts[1].strip() if len(parts) > 1 and parts[1].strip() else ""
        return (a, b)
    row_csv = parse_row(lines[0])
    row_img = parse_row(lines[1])
    return row_csv, row_img

def write_state_log(csv_row, img_row):
    # csv_row and img_row are tuples (start_iso, last_iso_or_empty)
    content = f"{csv_row[0]},{csv_row[1]}\n{img_row[0]},{img_row[1]}\n"
    LOG_PATH.write_text(content)

# --- Funciones para imágenes ---
def compress_and_save_image(source_path: Path, output_path: Path):
    """
    Comprime una imagen reduciendo sus dimensiones a la mitad y la guarda 
    en la ruta de destino especificada. Devuelve (True, out_path) si OK.
    """
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source_path) as original_image:
            if CROP_PIXELS > 0:
                w, h = original_image.size
                # evitar límites negativos
                left = min(CROP_PIXELS, w//2)
                top = min(CROP_PIXELS, h//2)
                right = max(left, w - left)
                bottom = max(top, h - top)
                cropped = original_image.crop((left, top, right, bottom))
            else:
                cropped = original_image
            w2, h2 = cropped.size
            compressed = cropped.resize((max(1, w2 // 2), max(1, h2 // 2)), Image.Resampling.LANCZOS)
            # Forzar JPG extensión en destino
            out = output_path.with_suffix(".jpg")
            # Guardar en tmp y mover para atomicidad
            tmp = out.with_suffix(out.suffix + ".tmp")
            compressed.save(tmp, "JPEG", quality=JPEG_QUALITY)
            tmp.replace(out)
            return True, out
    except Exception as e:
        print(f"[ERROR] compress {source_path}: {e}")
        return False, None

def file_is_stable(path: Path, wait: float = STABLE_WAIT):
    """
    Devuelve True si el tamaño no cambia durante `wait` segundos.
    """
    try:
        s1 = path.stat().st_size
        time.sleep(wait)
        s2 = path.stat().st_size
        return s1 == s2
    except Exception:
        return False

# Lock para proteger updates al state_log
state_lock = threading.Lock()
stop_event = threading.Event()

# Función que procesa una imagen y la borra si fue procesada correctamente.
def process_image_and_delete(src: Path, csv_state_ref, img_state):
    """
    Procesa la imagen (espera a que sea "estable"), la comprime y guarda en IMAGES_DST
    manteniendo la estructura relativa. Si se procesa correctamente, borra el archivo origen
    y actualiza img_state (timestamp) persistiendo en state_log.csv.
    
    csv_state_ref: dict with "val" containing the current csv_state tuple
    img_state: tuple (start_iso, last_iso) - current image state known by caller
    
    Returns updated img_state tuple and boolean whether processed.
    """
    try:
        if not src.exists():
            return img_state, False
        # asegurar extensión válida
        if not src.suffix.lower() in (".jpg", ".jpeg", ".png"):
            return img_state, False
        # esperar a que sea estable
        if not file_is_stable(src):
            # no listo aún
            return img_state, False

        rel = src.relative_to(IMAGES_SRC)
        dst = IMAGES_DST / rel
        ok, outpath = compress_and_save_image(src, dst)
        if ok:
            try:
                src.unlink()  # borrar origen
            except Exception as e:
                print(f"[WARN] no se pudo borrar origen {src}: {e}")
            # actualizar estado de imágenes (last timestamp = ahora)
            with state_lock:
                # Leer el estado CSV más reciente para no sobrescribirlo con uno viejo
                current_csv_state = csv_state_ref["val"]
                new_img_state = (img_state[0] or now_iso(), now_iso())
                write_state_log(current_csv_state, new_img_state)
            print(f"[IMG] procesada: {src} -> {outpath} (origen eliminado)")
            return new_img_state, True
        else:
            return img_state, False
    except Exception as e:
        print(f"[ERROR] procesando imagen {src}: {e}")
        return img_state, False

# Handler de watchdog para imágenes
class ImageEventHandler(FileSystemEventHandler):
    def __init__(self, csv_state_ref, img_state_ref):
        super().__init__()
        # csv_state_ref and img_state_ref are dict-like references so we can update outer variables
        self.csv_state_ref = csv_state_ref
        self.img_state_ref = img_state_ref
        self.processing = set()
        self.lock = threading.Lock()

    def _should_handle(self, path):
        p = Path(path)
        return p.suffix.lower() in (".jpg", ".jpeg", ".png")

    def _schedule_process(self, path):
        # lanzar en hilo para no bloquear watchdog
        t = threading.Thread(target=self._attempt_process, args=(Path(path),), daemon=True)
        t.start()

    def on_created(self, event):
        if event.is_directory:
            return
        if self._should_handle(event.src_path):
            # Pequeña pausa para permitir escritura inicial
            time.sleep(0.2)
            self._schedule_process(event.src_path)

    def on_moved(self, event):
        # cuando un archivo es movido dentro del arbol o desde fuera, tratarlo como creado en destino
        if event.is_directory:
            return
        dest = getattr(event, "dest_path", None)
        if dest and self._should_handle(dest):
            time.sleep(0.2)
            self._schedule_process(dest)

    def on_modified(self, event):
        if event.is_directory:
            return
        if self._should_handle(event.src_path):
            # modificado durante escritura -> intentar procesar cuando estable
            time.sleep(0.2)
            self._schedule_process(event.src_path)

    def _attempt_process(self, path: Path):
        # Evitar procesar la misma ruta simultáneamente
        with self.lock:
            key = str(path.resolve())
            if key in self.processing:
                return
            self.processing.add(key)
        try:
            # Intentar varias veces si el archivo cambia de tamaño
            attempts = 3
            for i in range(attempts):
                # Obtener estado actual de imagen
                with self.img_state_ref["lock"]:
                    img_state = tuple(self.img_state_ref["val"])
                
                # Pasamos csv_state_ref para que process_image_and_delete lea el valor actual bajo lock
                new_img_state, done = process_image_and_delete(path, self.csv_state_ref, img_state)
                if done:
                    # Actualizar referencia compartida
                    with self.img_state_ref["lock"]:
                        self.img_state_ref["val"] = new_img_state
                    break
                else:
                    # esperar y reintentar
                    time.sleep(1.0)
        finally:
            with self.lock:
                self.processing.discard(key)

# ---------------- CSV logic ----------------
# Se mantiene la lógica que tenías para tail y switch de CSVs.
# Hecho con mínimos ajustes sintácticos para encajar en este archivo.

def find_latest_csv_in_source():
    candidates = []
    for root, _, files in os.walk(CSV_SRC):
        for f in files:
            if f.lower().endswith(".csv"):
                p = Path(root) / f
                try:
                    candidates.append((p.stat().st_mtime, p))
                except Exception:
                    continue
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]  # path newest

def recover_move_all_except(active_path: Path):
    """
    Mueve todos los CSVs en CSV_SRC a CSV_DST sobrescribiendo,
    excepto active_path (si no es None).
    """
    moved = 0
    for root, _, files in os.walk(CSV_SRC):
        for f in files:
            if not f.lower().endswith(".csv"):
                continue
            p = Path(root) / f
            dest = CSV_DST / p.relative_to(CSV_SRC)
            dest.parent.mkdir(parents=True, exist_ok=True)
            try:
                if dest.exists():
                    dest.unlink()
                if active_path and p.resolve() == active_path.resolve():
                    print(f"[RECOVER] recuperado cambios de: {p} -> {dest}")
                    shutil.copy(str(p), str(dest))
                    continue
                shutil.move(str(p), str(dest))
                moved += 1
                print(f"[RECOVER] movido: {p} -> {dest}")
            except Exception as e:
                print(f"[RECOVER ERROR] {p}: {e}")
    return moved

class CSVTailer:
    """
    Mantiene tail sobre un archivo CSV activo: añade nuevas líneas a CSV_DST/<same_name>.
    Si no existe el destino, copia contenido existente (primera vez).
    Cambia a un nuevo archivo cuando se detecte y elimina el anterior (origen).
    """
    def __init__(self):
        self.active_src = None  # Path
        self.src_file = None    # file object
        self.src_pos = 0

    def open_active(self, src_path: Path):
        # Cerrar anterior si existía
        self.close_active(delete_source=False)
        if src_path is None:
            return
        self.active_src = src_path
        dst = CSV_DST / src_path.relative_to(CSV_SRC)
        dst.parent.mkdir(parents=True, exist_ok=True)
        # Si el destino no existe, copiar todo el contenido actual
        if not dst.exists():
            try:
                shutil.copy2(src_path, dst)
                print(f"[CSV] Copiado inicial: {src_path} -> {dst}")
            except Exception as e:
                print(f"[CSV ERROR] copy initial {src_path}: {e}")
        # Abrimos el src para hacer tail desde su final (si destino existe)
        try:
            self.src_file = open(src_path, "r", encoding="utf-8", errors="replace")
            # posicionar al final para empezar a tail
            self.src_file.seek(0, os.SEEK_END)
            self.src_pos = self.src_file.tell()
        except Exception as e:
            print(f"[CSV ERROR] open tail {src_path}: {e}")
            self.src_file = None
            self.active_src = None

    def close_active(self, delete_source=False):
        if self.src_file:
            try:
                self.src_file.close()
            except Exception:
                pass
            self.src_file = None
        if delete_source and self.active_src:
            try:
                os.remove(self.active_src)
                print(f"[CSV] eliminado origen anterior: {self.active_src}")
            except Exception as e:
                print(f"[CSV ERROR] eliminar {self.active_src}: {e}")
        self.active_src = None
        self.src_pos = 0

    def tail_once(self):
        """
        Lee nuevas líneas del archivo activo y las escribe al destino.
        Retorna cuántas líneas se agregaron y timestamp ISO del último append (o None).
        """
        if not self.src_file or not self.active_src:
            # no activo
            return 0, None
        try:
            self.src_file.seek(self.src_pos)
            added = 0
            last_ts = None
            dst = CSV_DST / self.active_src.relative_to(CSV_SRC)
            with open(dst, "a", encoding="utf-8", errors="replace") as out:
                while True:
                    line = self.src_file.readline()
                    if not line:
                        break
                    out.write(line)
                    out.flush()
                    added += 1
                    last_ts = now_iso()
                    self.src_pos = self.src_file.tell()
            return added, last_ts
        except Exception as e:
            print(f"[CSV ERROR] tail {self.active_src}: {e}")
            return 0, None

# ----------------- MAIN -----------------
def initial_process_existing_images(csv_state_ref, img_state, img_state_ref):
    """
    En el inicio, procesar recursivamente todas las imágenes presentes en IMAGES_SRC.
    Después de procesar cada archivo exitosamente se borra el origen.
    """
    processed_any = 0
    for root, _, files in os.walk(IMAGES_SRC):
        for f in sorted(files):
            if not f.lower().endswith((".jpg", ".jpeg", ".png")):
                continue
            src = Path(root) / f
            # Intentar procesar (espera estabilidad)
            new_img_state, done = process_image_and_delete(src, csv_state_ref, img_state)
            if done:
                with img_state_ref["lock"]:
                    img_state_ref["val"] = new_img_state
                img_state = new_img_state
                processed_any += 1
    if processed_any:
        print(f"[IMG] Inicial: procesadas {processed_any} imágenes existentes.")
    return img_state

def csv_flow(csv_state_ref, img_state_ref):
    print("[CSV-THREAD] Iniciando flujo CSV...")
    # Preparar CSVTailer
    tailer = CSVTailer()
    active = find_latest_csv_in_source()
    if active:
        tailer.open_active(active)
        print(f"[CSV] activo: {active}")
    else:
        print("[CSV] no hay CSVs en origen")

    moved = recover_move_all_except(active)
    if moved:
        print(f"[RECOVERY] movidos {moved} archivos CSV al destino")

    if not tailer.active_src:
        active = find_latest_csv_in_source()
        if active:
            tailer.open_active(active)

    while not stop_event.is_set():
        # CSV tailing
        added, last_ts = tailer.tail_once()
        
        # Obtener estado actual del CSV para actualizarlo
        with csv_state_ref["lock"]:
            current_csv_state = csv_state_ref["val"]

        if added:
            new_csv_state = (current_csv_state[0], last_ts or current_csv_state[1])
            # Actualizar ref
            with csv_state_ref["lock"]:
                csv_state_ref["val"] = new_csv_state
            
            # persistir estado
            with state_lock:
                # img_state actual desde referencia
                with img_state_ref["lock"]:
                    current_img_state = img_state_ref["val"]
                write_state_log(new_csv_state, current_img_state)
            print(f"[CSV] agregadas {added} lineas al destino. last_ts={last_ts}")
            current_csv_state = new_csv_state # update local var

        # Detectar CSV nuevo y hacer switch si corresponde
        latest = find_latest_csv_in_source()
        if latest:
            if (not tailer.active_src) or (latest.resolve() != tailer.active_src.resolve() and latest.stat().st_mtime > (tailer.active_src.stat().st_mtime if tailer.active_src else 0)):
                prev = tailer.active_src
                tailer.open_active(latest)
                if prev and prev.exists():
                    try:
                        os.remove(prev)
                        print(f"[CSV] eliminado antiguo tras cambio: {prev}")
                    except Exception as e:
                        print(f"[CSV ERROR] eliminar prev {prev}: {e}")
                
                if not current_csv_state[0]:
                    new_csv_state = (now_iso(), current_csv_state[1])
                    with csv_state_ref["lock"]:
                        csv_state_ref["val"] = new_csv_state
                    current_csv_state = new_csv_state

                # persistir
                with state_lock:
                    with img_state_ref["lock"]:
                        current_img_state = img_state_ref["val"]
                    write_state_log(current_csv_state, current_img_state)
                print(f"[CSV] switched active -> {latest}")

        time.sleep(POLL_INTERVAL)
    
    tailer.close_active(delete_source=False)
    print("[CSV-THREAD] Finalizado.")

def image_flow(csv_state_ref, img_state_ref):
    print("[IMG-THREAD] Iniciando flujo de Imágenes...")
    
    # Obtener estado inicial
    with img_state_ref["lock"]:
        img_state = img_state_ref["val"]

    # Procesar existentes antes de iniciar watchdog
    img_state = initial_process_existing_images(csv_state_ref, img_state, img_state_ref)

    # --- Iniciar watchdog observer para IMAGES_SRC ---
    event_handler = ImageEventHandler(csv_state_ref, img_state_ref)
    observer = Observer()
    observer.schedule(event_handler, str(IMAGES_SRC), recursive=True)
    observer.start()
    print(f"[WATCHDOG] Observando imágenes en: {IMAGES_SRC}")

    while not stop_event.is_set():
        time.sleep(1)

    observer.stop()
    observer.join(timeout=2.0)
    print("[IMG-THREAD] Finalizado.")

def main():
    # Asegurar dirs
    CSV_DST.mkdir(parents=True, exist_ok=True)
    IMAGES_DST.mkdir(parents=True, exist_ok=True)
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    IMAGES_SRC.mkdir(parents=True, exist_ok=True)
    CSV_SRC.mkdir(parents=True, exist_ok=True)

    csv_state, img_state = read_state_log()
    # inicializar start si vacío
    if not csv_state[0]:
        csv_state = (now_iso(), csv_state[1])
    if not img_state[0]:
        img_state = (now_iso(), img_state[1])
    # persistir inicial (por si no existía)
    write_state_log(csv_state, img_state)

    # Referencias compartidas
    csv_state_ref = {"val": csv_state, "lock": threading.Lock()}
    img_state_ref = {"val": img_state, "lock": threading.Lock()}

    # Crear hilos
    t_csv = threading.Thread(target=csv_flow, args=(csv_state_ref, img_state_ref), name="CSVThread")
    t_img = threading.Thread(target=image_flow, args=(csv_state_ref, img_state_ref), name="ImgThread")

    print("[START] Iniciando threads. Ctrl-C para detener.")
    t_csv.start()
    t_img.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[SHUTDOWN] Señal de parada recibida.")
        stop_event.set()
        t_csv.join()
        t_img.join()
        
        # escribir estado final
        with state_lock:
            with csv_state_ref["lock"]:
                final_csv_state = csv_state_ref["val"]
            with img_state_ref["lock"]:
                final_img_state = img_state_ref["val"]
            write_state_log(final_csv_state, final_img_state)
        print("[SHUTDOWN] estado guardado. Bye.")

if __name__ == "__main__":
    main()
