# backend/db/postgres.py
from functools import lru_cache
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from core.config import settings


@lru_cache
def get_postgres_engine():
    """Crea el motor de conexión a PostgreSQL con SQLAlchemy."""
    DATABASE_URL = (
        f"postgresql+psycopg2://{settings.POSTGRES_USER}:"
        f"{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:"
        f"{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
    )
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # verifica conexión antes de usarla
        pool_size=10,
        max_overflow=20,
        connect_args={"options": "-csearch_path=app"}
    )
    return engine

def get_sync_session() -> Session:
    """
    Crea una sesión síncrona fuera del contexto de FastAPI.
    Ideal para tareas del scheduler u operaciones en segundo plano.
    """
    SessionLocal = get_postgres_sessionmaker()
    return SessionLocal()

@lru_cache
def get_postgres_sessionmaker():
    """Crea un sessionmaker enlazado al engine (para dependencias FastAPI)."""
    engine = get_postgres_engine()
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dependencia para inyección en endpoints FastAPI
def get_db() -> Session:
    """Provee una sesión de base de datos a cada request."""
    SessionLocal = get_postgres_sessionmaker()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

