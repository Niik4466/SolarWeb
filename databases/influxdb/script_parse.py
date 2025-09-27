import os, csv
from datetime import datetime
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

directorio = "/datos"

URL = os.getenv("INFLUX_ENDPOINT", "http://influxdb-solarweb:8086")
TOKEN = os.getenv("INFLUX_TOKEN", "super-secret-token")
ORG = os.getenv("INFLUX_ORG", "miOrg")
BUCKET = os.getenv("INFLUX_BUCKET", "miBucket")

client = InfluxDBClient(url=URL, token=TOKEN, org=ORG)
write_api = client.write_api(write_options=SYNCHRONOUS)

for nombre in os.listdir(directorio):
    if not nombre.lower().endswith(".csv"):
        continue

    ruta = os.path.join(directorio, nombre)
    with open(ruta, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        points = []

        for fila in reader:
            if not fila["Fecha"] or not fila["Hora"]:
                continue

            try:
                # Parsear fecha sola
                fecha = datetime.strptime(fila["Fecha"], "%Y-%m-%d").date()

                # Parsear hora sola (puede tener o no microsegundos)
                hora_str = fila["Hora"]
                if "." in hora_str:
                    hora = datetime.strptime(hora_str, "%H:%M:%S.%f").time()
                else:
                    hora = datetime.strptime(hora_str, "%H:%M:%S").time()

                # Combinar fecha + hora en un solo datetime
                ts = datetime.combine(fecha, hora)

                points.append(
                    Point("radiacion_solar")
                    .time(ts, WritePrecision.NS)
                    .field("DNI", float(fila["DNI"]))
                    .field("DHI", float(fila["DHI"]))
                    .field("GHI", float(fila["GHI"]))
                )

            except Exception as e:
                print(f"Fila omitida en {nombre}: {e}")

        if points:
            write_api.write(bucket=BUCKET, org=ORG, record=points)

print("Datos enviados a InfluxDB")
client.close()
