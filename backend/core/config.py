# backend/core/config.py

from functools import lru_cache
from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict  

class Settings(BaseSettings):
    """
    Clase central de configuración del backend.

    Usa Pydantic Settings para cargar variables de entorno
    desde un archivo .env o desde variables del sistema.
    
    Esta clase concentra:
    - Credenciales de InfluxDB
    - Credenciales de MinIO
    - Configuración de PostgreSQL
    - Configuración de Resend (envío de correos)
    - Parámetros generales como CORS y API_KEY

    Todas las variables aquí definidas podrán ser accedidas
    globalmente mediante `settings.<NOMBRE>`.
    """

    # ---------------------------------------------------------
    # 🔹 InfluxDB
    # ---------------------------------------------------------
    INFLUX_USER: str            # Usuario para conectarse a InfluxDB
    INFLUX_PASS: str            # Password para InfluxDB
    INFLUX_ORG: str             # Organización configurada en InfluxDB
    INFLUX_BUCKET: str          # Bucket principal de almacenaje
    INFLUX_TOKEN: str           # Token de acceso (autenticación)
    INFLUX_ENDPOINT: str        # URL del servidor InfluxDB

    # ---------------------------------------------------------
    # 🔹 MinIO
    # ---------------------------------------------------------
    MINIO_USER: str             # Usuario de MinIO
    MINIO_PASSWORD: str         # Password de MinIO
    MINIO_ENDPOINT: str         # Endpoint del servidor MinIO (host:puerto)

    # ---------------------------------------------------------
    # 🔹 PostgreSQL
    # ---------------------------------------------------------
    POSTGRES_USER: str          # Usuario de PostgreSQL
    POSTGRES_PASSWORD: str      # Password del usuario de PostgreSQL
    POSTGRES_DB: str            # Nombre de la base de datos
    POSTGRES_HOST: str          # Host donde corre PostgreSQL
    POSTGRES_PORT: str          # Puerto (por defecto 5432)

    # ---------------------------------------------------------
    # 🔹 Resend (envío de correos)
    # ---------------------------------------------------------
    RESEND_API_KEY: str         # API Key del servicio Resend (para mandar emails)
    RESEND_FROM: str            # Email desde el cual se enviarán los correos

    # ---------------------------------------------------------
    # 🔹 API / CORS
    # ---------------------------------------------------------
    API_KEY: Optional[str] = None     # API Key opcional para proteger endpoints
    ALLOW_ORIGINS: List[str] = ["*"]  # Orígenes permitidos para CORS

    # ---------------------------------------------------------
    # 🔹 Configuración interna de Pydantic Settings
    # ---------------------------------------------------------
    model_config = SettingsConfigDict(
        env_file="../.env",           # Ruta del archivo .env
        env_file_encoding="utf-8",    # Codificación del archivo
        case_sensitive=True           # Las variables respetan mayúsc/minúsc
    )

@lru_cache
def get_settings() -> Settings:
    """
    Carga la configuración solo una vez (singleton).
    Gracias a @lru_cache, Settings() no se re-crea en cada import.

    Esto mejora rendimiento y mantiene consistencia.
    """
    return Settings()

# Instancia global que se usa en todo el backend:
settings = get_settings()
