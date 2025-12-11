import paramiko
from typing import Optional
from enum import Enum
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from core.config import settings
from services.mail_service import send_mail_query
from services.user_service import get_admin_emails_query
from db.postgres import get_sync_session
import socket
from datetime import datetime

# --- State Definitions ---

# Status general para el pc del 3000 y el directorio objetivo
class Status(str, Enum):
    OK = "OK"
    DEGRADED = "DEGRADED"   # 1 fallo seguido
    DOWN = "DOWN"           # >=2 fallos seguidos

PC_NAME = "Computador del edificio 3000"
LOGO_DIR_PATH = "/mnt/c/Users/usuario/Documents/GitHub/LOGO"

# Estados iniciales
pc3000_state = Status.OK
logo_dir_state = Status.OK
last_logo_dir_size: Optional[int] = None

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
    Se conecta por SSH al PC configurado y devuelve:
    {
        "total_bytes": int,
        "used_bytes": int,
        "used_pct": float
    }
    para la partición /mnt/e.
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
    Se conecta por SSH al PC configurado y devuelve el tamaño del directorio configurado en LOGO_DIR_PATH 
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
    return pc3000_state

def get_logo_dir_state_query() -> Status:
    return logo_dir_state


# --- Alerting Logic ---
def _send_alert(subject: str, body_html: str):
    """
    Envía email a los admins.
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
    """Logica de alerta cuando cambia el estado del nodo (OK/DOWN)."""
    subject = f"Cambio de estado en {PC_NAME}: {new_status.value}"
    
    if new_status == Status.OK:
        body = f"<p>El <strong>{PC_NAME}</strong> ha vuelto a estar operativo.</p>"
    elif new_status == Status.DOWN:
        body = f"<p style='color:red'><strong>ALERTA:</strong> El <strong>{PC_NAME}</strong> parece estar apagado (2 fallos de conexión seguidos).</p>"
    else:
        return

    _send_alert(subject, body)

def _handle_invariant_directory_alert(status: Status):
    """Maneja alertas de invarianza de directorio y cuando el estado del directorio cambia OK/DOWN."""
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

# --- Job Logic ---

def check_pc3000():
    """
    Job periódico:
    1. Verifica conexion y metricas.
    2. Maneja estado UP/DOWN.
    3. Verifica 'stalled data' (invarianza de directorio).
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

# --- Scheduler Entrypoint ---

scheduler: Optional[AsyncIOScheduler] = None

def init_monitoring():
    """
    Configura y arranca el scheduler.
    """
    global scheduler
    if scheduler is None:
        scheduler = AsyncIOScheduler()
        
        # Job recurrente cada 1 minuto
        scheduler.add_job(check_pc3000, 'interval', seconds=30)
        
        scheduler.start()
