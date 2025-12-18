# backend/api/v1/irradiance.py
# El router define la URL y recibe parámetros.
# SOLO delega al service; no toca la BD directamente.

from fastapi import APIRouter, Query, Depends
from schemas.irradiance import SeriesOut, FieldName
from services.irradiance_service import get_series
from core.security import get_current_user
from models.user import Usuario

router = APIRouter(prefix="/irradiance", tags=["irradiance"])

@router.get("", response_model=SeriesOut)
def read_irradiance(
    start: str = Query(..., description="Inicio del rango en formato RFC3339 (ej: 2025-09-16T00:00:00Z)"),
    stop:  str = Query(..., description="Fin del rango en formato RFC3339"),
    field: FieldName = "GHI",
    granularity: str = Query(..., description="Granularidad de los datos (ej: 1h, 5m, 10s)"),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Obtiene series temporales de irradiancia para un rango y granularidad específicos.

    Consulta el servicio de irradiancia para recuperar datos de la serie especificada (ej. GHI)
    dentro del intervalo de tiempo proporcionado, remuestreados a la granularidad solicitada.

    Args:
        start (str): Fecha y hora de inicio en formato ISO 8601 / RFC3339.
        stop (str): Fecha y hora de fin en formato ISO 8601 / RFC3339.
        field (FieldName, optional): Campo de irradiancia a consultar (default: "GHI").
        granularity (str): Intervalo de tiempo para agrupar los datos (ej: "1s", "1m", "1h").
        current_user (Usuario): Usuario autenticado realizando la petición.

    Returns:
        SeriesOut: Objeto con la lista de puntos de datos (timestamps y valores).
    """
    return get_series(start, stop, field, granularity=granularity)
