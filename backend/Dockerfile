# Imagen base ligera de Python
FROM python:3.11-slim

# Establecer directorio de trabajo dentro del contenedor
WORKDIR /app

# Instalar dependencias del sistema necesarias (ej: psycopg2, pil, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements primero para aprovechar cache de Docker
COPY requirements.txt .

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código del backend
COPY . ./backend
COPY ../.env ./.env
WORKDIR /app/backend

# Exponer el puerto de FastAPI
EXPOSE 8000

# Comando por defecto: arrancar la app con uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir"]
