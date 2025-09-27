# 1. Imagen base: Usamos una imagen oficial y ligera de Python.
FROM python:3.11-slim

# 2. Directorio de trabajo: Establecemos el directorio donde se ejecutará el script.
WORKDIR /app

# 3. Instalación de dependencias:
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Copia del script: Copiamos el script de compresión a la imagen.
COPY compress_script.py .

# 5. Comando de ejecución:
CMD ["python", "compress_script.py"]
