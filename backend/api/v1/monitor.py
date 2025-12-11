from fastapi import APIRouter, HTTPException
from services.monitor_service import get_pc3000_state_query, get_logo_dir_state_query, get_remote_disk_usage

router = APIRouter(prefix="/monitor", tags=["monitor"])

@router.get("/disk")
def get_disk_status():
    """
    Devuelve el uso de disco remoto del PC 3000.
    """
    try:
        data = get_remote_disk_usage()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/data_service/state")
def get_pc3000_state():
    return get_pc3000_state_query()

@router.get("/data_service/LOGO/state")
def get_pc3000_LOGO_state():
    return get_logo_dir_state_query()