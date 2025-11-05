# backend/core/config.py
from functools import lru_cache
from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict  

class Settings(BaseSettings):
    # ==== InfluxDB ====
    INFLUX_USER: str
    INFLUX_PASS: str
    INFLUX_ORG: str
    INFLUX_BUCKET: str
    INFLUX_TOKEN: str
    INFLUX_ENDPOINT: str

    # ==== MinIO ====
    MINIO_USER: str
    MINIO_PASSWORD: str
    MINIO_ENDPOINT: str

    # ==== PostgreSQL ====
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str
    POSTGRES_PORT: str

    # ==== PostgreSQL ====
    RESEND_API_KEY: str
    RESEND_FROM: str

    # ==== API / CORS (opcionales) ====
    API_KEY: Optional[str] = None
    ALLOW_ORIGINS: List[str] = ["*"]

    # Config Pydantic Settings
    model_config = SettingsConfigDict(
        env_file="../.env",          # buscará .env en el directorio donde ejecutas Python
        env_file_encoding="utf-8",
        case_sensitive=True
    )

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
