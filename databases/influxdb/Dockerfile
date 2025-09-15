FROM python:3.12-alpine3.22

# Instalar Python y dependencias
RUN apk add --no-cache curl bash exiftool

# Copiar el script y entrypoint
COPY script_parse.py /app/script_parse.py

# Crear directorio de datos
WORKDIR /app

# Instalar dependencias de python
RUN pip install --no-cache-dir influxdb-client python-dateutil

# Comando por defecto
ENTRYPOINT ["python", "/app/script_parse.py"]

