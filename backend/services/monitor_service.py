import paramiko
from typing import Optional
from enum import Enum
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from core.config import settings
from services.mail_service import send_mail_query
from services.user_service import get_admin_emails_query
from db.postgres import get_sync_session
import socket
from datetime import datetime, timedelta

# --- State Definitions ---

# Status general para el pc del 3000 y el directorio objetivo
class Status(str, Enum):
    """
    Enum que define los posibles estados operativos de un recurso (nodo o directorio).

    Attributes:
        OK: El recurso está funcionando correctamente.
        DEGRADED: El recurso ha presentado un fallo reciente/temporal.
        DOWN: El recurso ha fallado consistentemente y se considera inoperativo.
    """
    OK = "OK"
    DEGRADED = "DEGRADED"   # 1 fallo seguido
    DOWN = "DOWN"           # >=2 fallos seguidos

PC_NAME = "Computador del edificio 3000"
LOGO_DIR_PATH = "/mnt/c/Users/usuario/Documents/GitHub/LOGO"

# Estados iniciales
pc3000_state = Status.OK
logo_dir_state = Status.OK
last_logo_dir_size: Optional[int] = None

# Disk Alert State
last_disk_alert_time: Optional[datetime] = None
disk_alert_count: int = 0
DISK_THRESHOLD_PCT = 90.0

# --- Custom Errors ---

class NodeConnectionError(Exception):
    """Errores de conexión SSH que indican que el nodo podría estar caído."""
    pass

class NodeMetricsError(Exception):
    """El nodo responde, pero la métrica (df / parsing) falló."""
    pass

# --- SSH Logic ---
def get_remote_disk_usage() -> dict:
    """
    Se conecta vía SSH al PC remoto para obtener métricas de uso del disco en /mnt/e.

    Ejecuta comandos de sistema remoto (`df`) para calcular el espacio total y usado.

    Returns:
        dict: Diccionario con las métricas del disco:
            - total_bytes (int): Espacio total en bytes.
            - used_bytes (int): Espacio usado en bytes.
            - used_pct (float): Porcentaje de uso (0-100).

    Raises:
        NodeConnectionError: Si falla la conexión SSH o socket.
        NodeMetricsError: Si falla la autenticación o el formato de salida no es válido.
        Exception: Para otros errores imprevistos durante la ejecución.
    """
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(
            hostname=settings.DESTINY_MONITOR_PC,
            username=settings.SSH_USER,
            password=settings.SSH_PASSWORD,
            timeout=10
        )
        
        # Ejecutar: df -B1 /mnt/e | tail -n 1 | awk '{print $2" "$3}'
        # Output esperado: total_bytes used_bytes
        stdin, stdout, stderr = client.exec_command("df -B1 /mnt/e | tail -n 1 | awk '{print $2\" \"$3}'")
        output = stdout.read().decode().strip()
        
        if not output:
             error_msg = stderr.read().decode().strip()
             raise Exception(f"Empty output from df command. Stderr: {error_msg}")

        parts = output.split()
        if len(parts) != 2:
            raise Exception(f"Unexpected output format: {output}")
            
        total_bytes = int(parts[0])
        used_bytes = int(parts[1])
        used_pct = (used_bytes / total_bytes) * 100 if total_bytes > 0 else 0.0

        return {
                "total_bytes": total_bytes,
                "used_bytes": used_bytes,
                "used_pct": round(used_pct, 2)
        }

    # --- Errores de conexión / nodo caído ---
    except (paramiko.SSHException, socket.timeout, OSError) as e:
        raise NodeConnectionError(f"No se puede conectar vía SSH: {e}") from e

    # --- Errores de autenticación 
    except paramiko.AuthenticationException as e:
        raise NodeMetricsError(f"Error de autenticación SSH: {e}") from e   
    
    except Exception as e:
        if isinstance(e, NodeMetricsError):
            raise e
        raise Exception(f"SSH Connection/Command failed: {str(e)}")

    finally:
        client.close()

def get_remote_dir_size() -> int:
    """
    Obtiene el tamaño total en bytes del directorio monitoreado en el PC remoto.

    Se conecta vía SSH y utiliza el comando `du` para calcular el tamaño.

    Returns:
        int: Tamaño del directorio en bytes.

    Raises:
        NodeConnectionError: Si hay problemas de conectividad con el host remoto.
        NodeMetricsError: Si hay errores de autenticación.
        Exception: Si el comando en el remoto falla o devuelve una salida vacía.
    """
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(
            hostname=settings.DESTINY_MONITOR_PC,
            username=settings.SSH_USER,
            password=settings.SSH_PASSWORD,
            timeout=10,
        )
        
        # Ejecutar: du -sb LOGO_DIR_PATH | awk '{print $1}'
        # Output esperado: dir_size_bytes
        stdin, stdout, stderr = client.exec_command(f"du -sb {LOGO_DIR_PATH}" + " | awk '{print $1}'")
        output = stdout.read().decode().strip()
        
        if not output:
            error_msg = stderr.read().decode().strip()
            raise Exception(f"Empty output from du command. Stderr: {error_msg}")
            
        dir_size_bytes = int(output.split()[0])
        return dir_size_bytes

    # --- Errores de conexión / nodo caído ---
    except (paramiko.SSHException, socket.timeout, OSError) as e:
        raise NodeConnectionError(f"No se puede conectar vía SSH: {e}") from e

    # --- Errores de autenticación 
    except paramiko.AuthenticationException as e:
        raise NodeMetricsError(f"Error de autenticación SSH: {e}") from e   
    
    except Exception as e:
        if isinstance(e, NodeMetricsError):
            raise e
        raise Exception(f"SSH Connection/Command failed: {str(e)}")

    finally:
        client.close()


# Querys para ver estados

def get_pc3000_state_query() -> Status:
    """
    Retorna el último estado conocido de conectividad del PC 3000.

    Returns:
        Status: Estado actual (OK, DEGRADED, DOWN).
    """
    return pc3000_state

def get_logo_dir_state_query() -> Status:
    """
    Retorna el último estado conocido de la ingesta de datos (actividad del directorio).

    Returns:
        Status: Estado actual (OK, DEGRADED, DOWN).
    """
    return logo_dir_state


# --- Alerting Logic ---
def _send_alert(subject: str, body_html: str):
    """
    Envía una notificación por correo electrónico a todos los administradores registrados.

    Recupera la lista de correos de administradores desde la base de datos y envía el mensaje.

    Args:
        subject (str): Asunto del correo electrónico.
        body_html (str): Contenido del correo en formato HTML.
    """
    db = get_sync_session()
    try:
        admin_emails = get_admin_emails_query(db)
        if not admin_emails:
            print("No admin emails found.")
            return

        for email in admin_emails:
            try:
                send_mail_query(email, subject, body_html)
            except Exception as e:
                print(f"Error sending alert to {email}: {e}")
    finally:
        db.close()

def _handle_node_status_change(new_status: Status):
    """
    Procesa el cambio de estado de conectividad del nodo y envía alertas si corresponde.

    Args:
        new_status (Status): El nuevo estado detectado del nodo.
                             Solo genera alerta para transiciones a OK (recuperación) 
                             o DOWN (caída confirmada).
    """
    subject = f"Cambio de estado en {PC_NAME}: {new_status.value}"
    
    if new_status == Status.OK:
        body = f"<p>El <strong>{PC_NAME}</strong> ha vuelto a estar operativo.</p>"
    elif new_status == Status.DOWN:
        body = f"<p style='color:red'><strong>ALERTA:</strong> El <strong>{PC_NAME}</strong> parece estar apagado (2 fallos de conexión seguidos).</p>"
    else:
        return

    _send_alert(subject, body)

def _handle_invariant_directory_alert(status: Status):
    """
    Maneja las alertas relacionadas con el estancamiento de la ingesta de datos.

    Args:
        status (Status): El estado de la actividad del directorio.
                         DOWN implica que el directorio no ha cambiado de tamaño (alerta).
                         OK implica que el directorio ha vuelto a crecer (recuperación).
    """
    if status == Status.DOWN:
        subject = f"ALERTA: Ingesta de datos posiblemente estancada en {PC_NAME}"
        body = (
            f"<p style='color:orange'><strong>ADVERTENCIA:</strong></p>"
            f"<p>El directorio de datos en <code>{LOGO_DIR_PATH}</code> no ha cambiado de tamaño "
            f"<p>Verificar si el script de ingesta está corriendo correctamente.</p>"
        )
    elif status == Status.OK:
        subject = f"ALERTA: Ingesta de datos ha vuelto a funcionar en {PC_NAME}"
        body = (
            f"<p style='color:orange'><strong>ADVERTENCIA:</strong></p>"
            f"<p>El directorio de datos en <code>{LOGO_DIR_PATH}</code> ha cambiado de tamaño "
            f"<p>El script de ingesta parece estar funcionando correctamente.</p>"
        )
    else:
        return
    
    _send_alert(subject, body)

def _handle_disk_limit_alert(used_pct: float, total_bytes: int, used_bytes: int):
    """
    Genera y envía una alerta crítica de espacio en disco.

    Args:
        used_pct (float): Porcentaje de uso actual.
        total_bytes (int): Capacidad total del disco en bytes.
        used_bytes (int): Espacio usado en bytes.
    """
    subject = f"ALERTA: Espacio en disco crítico en {PC_NAME}"
    total_gb = total_bytes / (1024**3)
    used_gb = used_bytes / (1024**3)
    
    body = (
        f"<p style='color:red'><strong>CRÍTICO:</strong> El uso de disco ha superado el {DISK_THRESHOLD_PCT}%.</p>"
        f"<ul>"
        f"<li>Uso actual: <strong>{used_pct}%</strong></li>"
        f"<li>Espacio usado: {used_gb:.2f} GB</li>"
        f"<li>Espacio total: {total_gb:.2f} GB</li>"
        f"</ul>"
        f"<p>Por favor liberar espacio en <code>/mnt/e</code>.</p>"
    )
    _send_alert(subject, body)

# --- Job Logic ---

def check_pc3000():
    """
    Tarea programada (Job) para monitorear la salud del PC 3000.

    Realiza las siguientes verificaciones:
    1. Conectividad y tamaño del directorio objetivo mediante SSH.
    2. Actualiza el estado de conectividad (UP/DOWN) y alerta cambios.
    3. Verifica si el tamaño del directorio ha cambiado respecto a la última ejecución 
       para detectar estancamiento en la ingesta de datos.

    Maneja estados transitorios (DEGRADED) antes de confirmar una caída (DOWN).
    """
    global pc3000_state, last_logo_dir_size, logo_dir_state
    
    try:
        # 1. Obtener tamaño del directorio objetivo
        current_dir_size = get_remote_dir_size()

        # 2. Lógica de estado del nodo (Recuperación o Mantenimiento de OK)
        if pc3000_state == Status.DOWN:
            _handle_node_status_change(Status.OK)
            
        pc3000_state = Status.OK

        # 3. Lógica de Invarianza (Sólo si el nodo está OK)
        if last_logo_dir_size is not None:
            if current_dir_size == last_logo_dir_size:
                # El tamaño es IGUAL al anterior -> Alerta
                if logo_dir_state == Status.OK:
                    logo_dir_state = Status.DEGRADED
                elif logo_dir_state == Status.DEGRADED:
                    logo_dir_state = Status.DOWN
                    _handle_invariant_directory_alert(Status.DOWN)
            else:
                # El tamaño cambió -> Todo bien (o al menos se mueve)
                if logo_dir_state == Status.DOWN:
                    _handle_invariant_directory_alert(Status.OK)
                logo_dir_state = Status.OK
        
        # Actualizar referencia
        last_logo_dir_size = current_dir_size

    except NodeConnectionError as e:
        # Failure: Node likely down
        print(f"Monitor connection error: {e}")

        if pc3000_state == Status.OK:
            pc3000_state = Status.DEGRADED
        elif pc3000_state == Status.DEGRADED:
            pc3000_state = Status.DOWN
            _handle_node_status_change(Status.DOWN)
        # Si ya estaba DOWN, se mantiene silencio

    except Exception as e:
        # Failure: Logic or Metrics error
        print(f"Monitor check failed: {e}")
        if pc3000_state == Status.OK:
            pc3000_state = Status.DEGRADED

def check_disk_usage_alert():
    """
    Tarea programada (Job) para monitorear el espacio en disco del PC 3000.

    Verifica si el uso de disco supera el umbral definido (DISK_THRESHOLD_PCT).
    Implementa una estrategia de "backoff exponencial" para las alertas repetitivas:
    envía la primera alerta inmediatamente y luego incrementa el tiempo de espera 
    entre alertas subsecuentes (1h, 2h, 4h, etc.) mientras persista la condición.
    """
    global disk_alert_count, last_disk_alert_time
    
    try:
        data = get_remote_disk_usage()
        used_pct = data["used_pct"]
        
        if used_pct > DISK_THRESHOLD_PCT:
            now = datetime.now()
            should_alert = False
            
            if disk_alert_count == 0:
                # Primera vez -> Alerta
                should_alert = True
                disk_alert_count = 1
                last_disk_alert_time = now
            else:
                # Veces subsecuentes -> Chequear backoff
                # Estrategia: 1h, 2h, 4h, 8h ...
                # count=1 (ya enviada 1) -> wait 1h
                # count=2 (ya enviada 2) -> wait 2h
                hours_to_wait = 1 * (2 ** (disk_alert_count - 1))
                if last_disk_alert_time and (now - last_disk_alert_time) >= timedelta(hours=hours_to_wait):
                    should_alert = True
                    disk_alert_count += 1
                    last_disk_alert_time = now
            
            if should_alert:
                _handle_disk_limit_alert(used_pct, data["total_bytes"], data["used_bytes"])
        else:
            # Recuperado o bajo umbral -> Reset
            if disk_alert_count > 0:
                print(f"Disk usage normal ({used_pct}%), resetting alert state.")
            disk_alert_count = 0
            last_disk_alert_time = None

    except Exception as e:
        print(f"Disk check failed: {e}")

# --- Scheduler Entrypoint ---

scheduler: Optional[AsyncIOScheduler] = None

def init_monitoring():
    """
    Inicializa y arranca el planificador de tareas (AsyncIOScheduler) para el monitoreo.

    Configura los jobs de:
    - Verificación de estado y directorio (cada 1 minuto).
    - Verificación de espacio en disco (cada 30 minutos).

    Si el scheduler ya está inicializado, no hace nada.
    """
    global scheduler
    if scheduler is None:
        scheduler = AsyncIOScheduler()
        
        # Job recurrente cada 1 minuto (status y dir size)
        scheduler.add_job(check_pc3000, 'interval', minutes=1)
        
        # Job monitoreo de disco (cada 30 min)
        scheduler.add_job(check_disk_usage_alert, 'interval', minutes=30)
        
        # Ejecutar una vez al inicio para estado inicial
        scheduler.add_job(check_disk_usage_alert, next_run_time=datetime.now())
        
        scheduler.start()
