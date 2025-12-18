from fastapi import APIRouter, HTTPException, Depends
from services.monitor_service import get_pc3000_state_query, get_logo_dir_state_query, get_remote_disk_usage
from core.security import get_current_user
from models.user import Usuario

router = APIRouter(prefix="/monitor", tags=["monitor"])

@router.get("/disk")
def get_disk_status(current_user: Usuario = Depends(get_current_user)):
    """
    Obtiene el estado actual del uso del disco en el servidor remoto (PC 3000).

    Se conecta al servidor remoto configurado y ejecuta comandos para verificar 
    el espacio total, usado y el porcentaje de uso de la partición monitoreada.

    Args:
        current_user (Usuario): El usuario autenticado actual.

    Returns:
        dict: Un diccionario con la información del disco:
            - total_bytes (int): Capacidad total del disco en bytes.
            - used_bytes (int): Espacio utilizado en bytes.
            - used_pct (float): Porcentaje de uso del disco (0-100).

    Raises:
        HTTPException(500): Si ocurre un error al conectar con el servidor remoto 
                            o al obtener las métricas del disco.
    """
    try:
        data = get_remote_disk_usage()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/data_service/state")
def get_pc3000_state():
    """
    Consulta el estado de conectividad del PC 3000.

    Devuelve el estado actual monitoreado por el servicio de background, 
    que indica si el PC es accesible vía SSH.


    Returns:
        Status: El estado actual del PC. Puede ser:
            - "OK": Conectividad normal.
            - "DEGRADED": Fallo temporal o advertencia.
            - "DOWN": Sin conectividad (posiblemente apagado).
    """
    return get_pc3000_state_query()

@router.get("/data_service/LOGO/state")
def get_pc3000_LOGO_state(current_user: Usuario = Depends(get_current_user)):
    """
    Consulta el estado de la ingesta de datos en el directorio LOGO del PC 3000.

    Monitorea si el directorio de datos está aumentando de tamaño, lo cual indica 
    que la ingesta de datos está activa.

    Args:
        current_user (Usuario): El usuario autenticado actual.

    Returns:
        Status: El estado de la ingesta de datos. Puede ser:
            - "OK": El directorio está creciendo, ingesta activa.
            - "DEGRADED": Advertencia de posible estancamiento.
            - "DOWN": El directorio no ha cambiado de tamaño (ingesta detenida).
    """
    return get_logo_dir_state_query()