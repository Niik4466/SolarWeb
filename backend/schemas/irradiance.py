# Define la forma del JSON de salida de la API y la valida.
# Pydantic valida que respeten esta forma antes de salir al frontend.
# backend/schemas/irradiance.py
from pydantic import BaseModel
from typing import List, Literal

# Solo aceptamos estos campos de irradiancia
FieldName = Literal["GHI", "DNI", "DHI", "HR", "Temp"]

class IrrPoint(BaseModel):
    # Un punto de la serie temporal
    time: str   
    value: float
    field: FieldName  # cuál campo es (GHI/DNI/DHI)

class SeriesOut(BaseModel):
    # Respuesta completa del endpoint
    field: FieldName
    points: List[IrrPoint]
