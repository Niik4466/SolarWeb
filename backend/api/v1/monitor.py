from fastapi import APIRouter, HTTPException
from services.monitor_service import get_remote_disk_usage

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
