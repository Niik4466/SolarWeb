import os, csv
from datetime import datetime
from influxdb_client import InfluxDBClient, Point, WritePrecision

# Ruta a directorios
directorio = "/datos"

#Configuracion de la base de datos influxDB

# URL del servidor InfluxDB ("localhost" si esta en el mismo pc)
URL = os.getenv("INFLUX_ENDPOINT", "http://influxdb:8086")
# Token de autenticación de InfluxDB 
TOKEN = os.getenv("INFLUX_TOKEN", "super-secret-token")
# Organización de InfluxDB 
ORG = os.getenv("INFLUX_ORG", "miOrg")
# Bucket donde se guardarán los datos
BUCKET = os.getenv("INFLUX_BUCKET", "miBucket")

# Crear cliente y API de escritura
client = InfluxDBClient(url=URL, token=TOKEN, org=ORG)
write_api = client.write_api()

# Recorre todos los archivos dentro de la carpeta 'datos'
for nombre in os.listdir(directorio):
    with open(os.path.join(directorio, nombre), newline="", encoding="utf-8") as f:
        # 👇 Salta la primera línea (encabezado)
        next(f)
        for fila in csv.DictReader(f, fieldnames=["Fecha", "Hora", "DNI", "DHI", "GHI"]):
            if not fila["Fecha"] or not fila["Hora"]:
                continue  # saltar filas vacías
            try:
                # intentar con microsegundos y luego sin microsegundos
                try:
                    ts = datetime.strptime(fila["Fecha"] + " " + fila["Hora"], "%Y-%m-%d %H:%M:%S.%f")
                except ValueError:
                    ts = datetime.strptime(fila["Fecha"] + " " + fila["Hora"], "%Y-%m-%d %H:%M:%S")

                punto = (
                    Point("radiacion_solar")
                    .time(ts, WritePrecision.NS)
                    .field("DNI", float(fila["DNI"]))
                    .field("DHI", float(fila["DHI"]))
                    .field("GHI", float(fila["GHI"]))
                )
                write_api.write(bucket=BUCKET, org=ORG, record=punto)
            except Exception as e:
                print(f"Fila omitida en {nombre}: {e}")

#mensaje de validacion
print("Datos enviados a InfluxDB")

