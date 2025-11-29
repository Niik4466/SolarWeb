import paramiko
from typing import Optional
from enum import Enum
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from core.config import settings
from services.mail_service import send_mail_query
from services.user_service import get_admin_emails_query
from db.postgres import get_sync_session

# --- State Definitions ---

class NodeStatus(str, Enum):
    OK = "OK"
    DEGRADED = "DEGRADED"   # 1 fallo seguido
    DOWN = "DOWN"           # >=2 fallos seguidos

NODE_ID_PC3000 = "computador del edificio 3000"
pc3000_state = NodeStatus.OK

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
    Se conecta por SSH al PC configurado en DESTINY_MONITOR_PC
    y devuelve un dict con:
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

    # --- Errores de autenticación (config tuya, no nodo muerto) ---
    except paramiko.AuthenticationException as e:
        raise NodeMetricsError(f"Error de autenticación SSH: {e}") from e   
    
    except Exception as e:
        raise Exception(f"SSH Connection/Command failed: {str(e)}")

    finally:
        client.close()

# --- Alerting Logic ---

def _send_status_change_alert(node_id: str, new_status: NodeStatus):
    """
    Envía un correo a todos los administradores cuando cambia el estado del nodo.
    Usa mail_service y get_admin_emails().
    """
    db = get_sync_session()
    try:
        admin_emails = get_admin_emails_query(db)
        if not admin_emails:
            return

        subject = f"Cambio de estado en {node_id}: {new_status.value}"
        
        if new_status == NodeStatus.OK:
            body = f"<p>El <strong>{node_id}</strong> ha vuelto a estar operativo.</p>"
        elif new_status == NodeStatus.DOWN:
            body = f"<p style='color:red'><strong>ALERTA:</strong> El <strong>{node_id}</strong> parece estar apagado (2 fallos de conexión seguidos).</p>"
        elif new_status == NodeStatus.DEGRADED:
            body = f"<p>El <strong>{node_id}</strong> está presentando problemas (DEGRADED).</p>"

        for email in admin_emails:
            try:
                send_mail_query(email, subject, body)
            except Exception as e:
                print(f"Error sending alert to {email}: {e}")
                
    finally:
        db.close()

# --- Job Logic ---

def check_pc3000():
    """
    Job periódico que intenta obtener el uso de disco vía SSH.
    - Si tiene éxito: resetea fallos, estado = OK.
    - Si falla 1 vez: estado DEGRADED.
    - Si falla 2 veces o más: estado DOWN
    - Solo envía correo cuando el estado cambia (DEGRADED -> DOWN y DOWN -> OK).
    """
    global pc3000_state
    
    try:
        # Success
        get_remote_disk_usage()
        
        # Si el estado estaba en down, ahora pasa a estar en ok
        if pc3000_state == NodeStatus.DOWN:
            send_status_change_alert(NODE_ID_PC3000, NodeStatus.OK)
            
        pc3000_state = NodeStatus.OK

    except NodeConnectionError as e:
        print(f"Monitor connection error: {e}")
        pc3000_failures += 1

        if pc3000_failures == 1 and pc3000_state == NodeStatus.OK:
            pc3000_state = NodeStatus.DEGRADED
            _send_status_change_alert(NODE_ID_PC3000, NodeStatus.DEGRADED)

        elif pc3000_failures >= 2 and pc3000_state != NodeStatus.DOWN:
            pc3000_state = NodeStatus.DOWN
            _send_status_change_alert(NODE_ID_PC3000, NodeStatus.DOWN)

    except Exception as e:
        print(f"Monitor check failed: {e}")
        if pc3000_state == NodeStatus.OK:
            pc3000_state = NodeStatus.DEGRADED
            _send_status_change_alert(NODE_ID_PC3000, NodeStatus.DEGRADED)


# --- Scheduler Entrypoint ---

scheduler: Optional[AsyncIOScheduler] = None

def init_monitoring():
    """
    Entry point para ser llamado desde main.py.
    Configura y arranca el scheduler si no está iniciado.
    Registra el job periódico check_pc3000 (cada 2 minutos).
    """
    global scheduler
    if scheduler is None:
        scheduler = AsyncIOScheduler()
        scheduler.add_job(check_pc3000, 'interval', minutes=2)
        scheduler.start()
