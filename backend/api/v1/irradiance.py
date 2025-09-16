# El router define la URL y recibe parámetros.
# SOLO delega al service; no toca la BD directamente.

from fastapi import APIRouter, Query
from backend.schemas.irradiance import SeriesOut, FieldName
from backend.services.irradiance_service import get_series

router = APIRouter(prefix="/api/v1/irradiance", tags=["irradiance"])

@router.get("", response_model=SeriesOut)
def read_irradiance(
    # Parámetros de consulta (query string): ?start=...&stop=...&field=...
    start: str = Query(..., description="RFC3339, ej: 2025-09-16T00:00:00Z"),
    stop:  str = Query(..., description="RFC3339"),
    field: FieldName = "GHI"
):
    # Llama al servicio y devuelve el resultado
    return get_series(start, stop, field)
