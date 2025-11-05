# backend/services/irradiance_service.py
# Como funciona:
# - arma la consulta Flux
# - ejecuta contra Influx (usando db/query_flux)
# - transforma el resultado al esquema de schemas(SeriesOut)

from db.influxdb import query_flux           # función que ejecuta Flux
from core.config import settings             # para leer INFLUX_BUCKET del .env
from schemas.irradiance import SeriesOut, IrrPoint, FieldName

MEASUREMENT = "radiacion_solar"  # el measurement que hay en influx

def get_series(start: str, stop: str, field: FieldName = "GHI", granularity: str | None = None) -> SeriesOut:
    # OJO: start/stop deben venir en formato RFC3339/ISO (ej: 2025-09-16T00:00:00Z)
    flux = f'''
    from(bucket: "{settings.INFLUX_BUCKET}")
        |> range(start: {start}, stop: {stop})
        |> filter(fn: (r) => r._measurement == "{MEASUREMENT}")
        |> filter(fn: (r) => r._field == "{field}")
        |> filter(fn: (r) => r._value != 0)
    '''

    if granularity:
        flux += f'''
            |> aggregateWindow(every: {granularity}, fn: mean, createEmpty: false)
        '''

    flux+=f'''
        |> keep(columns: ["_time","_value","_field"])
    '''

    # Ejecuta la consulta
    tables = query_flux(flux)

    # Convierte el resultado a una lista de puntos
    points: list[IrrPoint] = []
    for t in tables:
        for rec in t.records:
            points.append(IrrPoint(
                time=rec.get_time().isoformat(),   
                value=float(rec.get_value()),
                field=rec.values["_field"]
            ))

    # Devuelve en el formato que definimos en schema (SeriesOut)
    return SeriesOut(field=field, points=points)
