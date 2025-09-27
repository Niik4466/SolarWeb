FROM python:3.12-alpine3.22

# Instalar Python y dependencias
RUN apk add --no-cache curl bash exiftool

# Copiar el script y entrypoint
COPY upload_images.py /app/upload_images.py

# Crear directorio de datos
WORKDIR /app

# Instalar dependencias de python
RUN pip install --no-cache-dir boto3 watchdog Pillow

# Comando por defecto
ENTRYPOINT ["python", "/app/upload_images.py"]
