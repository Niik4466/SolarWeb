# backend/services/irradiance_service.py
# Como funciona:
# - arma la consulta Flux
# - ejecuta contra Influx (usando db/query_flux)
# - transforma el resultado al esquema de schemas(SeriesOut)

from db.influxdb import query_flux           # función que ejecuta Flux
from core.config import settings             # para leer INFLUX_BUCKET del .env
from schemas.irradiance import SeriesOut, IrrPoint, FieldName

MEASUREMENT = "radiacion_solar"  # el measurement que hay en influx
IRRADIANCE_FIELDS = {"GHI", "DNI", "DHI"}

def get_series(start: str, stop: str, field: FieldName = "GHI", granularity: str | None = None) -> SeriesOut:
    """
    Ejecuta una consulta Flux para obtener una serie temporal de irradiancia.

    Filtra los datos por rango de tiempo y campo, eliminando valores cero (salvo que `get_series_export` diga lo contrario, pero aquí se filtra).
    Aplica una agregación por ventana (media) si se especifica una granularidad.

    Args:
        start (str): Fecha de inicio RFC3339.
        stop (str): Fecha de fin RFC3339.
        field (FieldName, optional): Campo a consultar (GHI, DNI, etc).
        granularity (str, optional): Ventana de agregación (ej: "1h").

    Returns:
        SeriesOut: Objeto con la lista de puntos normalizados.
    """
    # OJO: start/stop deben venir en formato RFC3339/ISO (ej: 2025-09-16T00:00:00Z)
    flux = f'''
    from(bucket: "{settings.INFLUX_BUCKET}")
        |> range(start: {start}, stop: {stop})
        |> filter(fn: (r) => r._measurement == "{MEASUREMENT}")
        |> filter(fn: (r) => r._field == "{field}")
    '''

    # ✅ solo para irradiancia, quitamos ceros
    if field in IRRADIANCE_FIELDS:
        flux += '''
        |> filter(fn: (r) => r._value != 0)
        '''

    if granularity:
        flux += f'''
            |> aggregateWindow(every: {granularity}, fn: mean, createEmpty: false)
        '''

    flux += '''
        |> keep(columns: ["_time","_value","_field"])
    '''

    tables = query_flux(flux)

    points: list[IrrPoint] = []
    for t in tables:
        for rec in t.records:
            points.append(IrrPoint(
                time=rec.get_time().isoformat(),
                value=float(rec.get_value()),
                field=rec.values["_field"],
            ))

    return SeriesOut(field=field, points=points)

def get_series_export(start: str, stop: str, field: FieldName = "GHI", granularity: str | None = None) -> list[tuple[str, float]]:
    """
    Obtiene datos brutos para exportación sin filtrar valores cero.

    Similar a `get_series` pero optimizado para exportación masiva:
    - Retorna una lista de tuplas (timestamp, valor) en lugar de pydantic models.
    - No filtra valores iguales a cero.
    - Ordena explícitamente por tiempo.

    Args:
        start (str): Fecha de inicio RFC3339.
        stop (str): Fecha de fin RFC3339.
        field (FieldName, optional): Campo a consultar.
        granularity (str, optional): Ventana de agregación.

    Returns:
        list[tuple[str, float]]: Lista de pares (timestamp ISO, valor).
    """
    flux = f'''
    from(bucket: "{settings.INFLUX_BUCKET}")
        |> range(start: {start}, stop: {stop})
        |> filter(fn: (r) => r._measurement == "{MEASUREMENT}")
        |> filter(fn: (r) => r._field == "{field}")
    '''

    if granularity:
        flux += f'''
            |> aggregateWindow(every: {granularity}, fn: mean, createEmpty: false)
        '''

    flux+=f'''
        |> keep(columns: ["_time","_value"])
        |> sort(columns: ["_time"])
    '''

    tables = query_flux(flux)
    out = []
    for t in tables:
        for rec in t.records:
            # isoformat() de python a veces incluye +00:00, lo normalizamos a Z
            ts = rec.get_time().isoformat().replace("+00:00", "Z")
            val = float(rec.get_value())
            out.append((ts, val))
    return out
