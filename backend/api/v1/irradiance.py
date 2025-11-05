# backend/api/v1/irradiance.py
# El router define la URL y recibe parámetros.
# SOLO delega al service; no toca la BD directamente.

from fastapi import APIRouter, Query
from schemas.irradiance import SeriesOut, FieldName
from services.irradiance_service import get_series

router = APIRouter(prefix="/irradiance", tags=["irradiance"])

@router.get("", response_model=SeriesOut)
def read_irradiance(
    # Parámetros de consulta (query string): ?start=...&stop=...&field=... &granularity=...
    start: str = Query(..., description="RFC3339, ej: 2025-09-16T00:00:00Z"),
    stop:  str = Query(..., description="RFC3339"),
    field: FieldName = "GHI",
    granularity: str = Query(..., description="Granularity, ej: 1h, 5m, 10s")
):
    # Llama al servicio y devuelve el resultado
    return get_series(start, stop, field, granularity=granularity)
