# backend/db/influxdb.py
from functools import lru_cache
from influxdb_client import InfluxDBClient
from core.config import settings

@lru_cache
def get_influx_client() -> InfluxDBClient:
    return InfluxDBClient(
        url=settings.INFLUX_ENDPOINT,
        token=settings.INFLUX_TOKEN,
        org=settings.INFLUX_ORG,
    )

def query_flux(flux: str):
    client = get_influx_client()
    return client.query_api().query(query=flux, org=settings.INFLUX_ORG)
