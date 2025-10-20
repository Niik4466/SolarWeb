# backend/api/v1/images.py
from pathlib import Path
from typing import Optional
import json
import re
import time

from fastapi import APIRouter, HTTPException, Response, Query
from fastapi.responses import StreamingResponse

from services.image_service import (
    list_images,      # listado "normal" (no streaming)
    get_image,        # debe hacer minio.get_object(...)
    get_minio_client  # <-- añade este import en services.image_service si aún no lo expones
)
from schemas.image import MinioListResponse

router = APIRouter()

# =========================
# Endpoints existentes
# =========================

@router.get("/images", response_model=MinioListResponse)
def get_images(bucket: str, prefix: str = ""):
    """
    Listado clásico (respuesta JSON única).
    """
    try:
        return list_images(bucket, prefix)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get(
    "/images/download",
    responses={
        200: {"content": {"application/octet-stream": {}}, "description": "Archivo"},
        404: {"description": "No encontrado"},
    },
)
def download_image(bucket: str, object_name: str):
    """
    Descarga forzada (Content-Disposition: attachment)
    y streaming con cierre del objeto MinIO.
    """
    try:
        obj = get_image(bucket, object_name)  # HTTPResponse-like
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    filename = Path(object_name).name

    def iterfile():
        try:
            for chunk in obj.stream(32 * 1024):
                yield chunk
        finally:
            obj.close()
            obj.release_conn()

    return StreamingResponse(
        iterfile(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@router.get(
    "/images/view",
    responses={
        200: {"content": {"image/jpeg": {}, "image/png": {}}, "description": "Imagen"},
        404: {"description": "No encontrado"},
    },
)
def view_image(bucket: str, object_name: str):
    """
    Visualización inline (para navegador). Detecta tipo por extensión simple.
    """
    try:
        obj = get_image(bucket, object_name)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

    ext = Path(object_name).suffix.lower()
    media_type = "image/jpeg" if ext in [".jpg", ".jpeg"] else "image/png"

    def iterfile():
        try:
            for chunk in obj.stream(32 * 1024):
                yield chunk
        finally:
            obj.close()
            obj.release_conn()

    return StreamingResponse(iterfile(), media_type=media_type)


# =========================
# NUEVO: Streaming NDJSON
# =========================

# Reglas para extraer HH:MM del nombre de archivo
_TIME_REGEXES = [
    re.compile(r'^(\d{2})[-_:](\d{2})[-_.]\d{2}\.(?:jpg|jpeg|png)$', re.I),  # HH-MM-SS
    re.compile(r'^(\d{2})[-_:](\d{2})\.(?:jpg|jpeg|png)$', re.I),            # HH-MM
    re.compile(r'(?:^|[_-])(\d{2})(\d{2})(\d{2})\.(?:jpg|jpeg|png)$', re.I), # HHMMSS
]

def _extract_hhmm(name: str) -> Optional[str]:
    last = (name or "").split("/")[-1]
    for rgx in _TIME_REGEXES:
        m = rgx.search(last)
        if m:
            return f"{m.group(1)}:{m.group(2)}"
    return None

def _to_min(hhmm: str) -> int:
    hh, mm = hhmm.split(":")
    return int(hh) * 60 + int(mm)

def _within(hhmm: Optional[str], start: Optional[str], end: Optional[str]) -> bool:
    if not hhmm:
        return False
    cur = _to_min(hhmm)
    if start and cur < _to_min(start): return False
    if end and cur > _to_min(end):     return False
    return True

@router.get(
    "/images/stream",
    responses={
        200: {"content": {"application/x-ndjson": {}}, "description": "NDJSON stream"},
        400: {"description": "Parámetros inválidos"},
        500: {"description": "Error interno"},
    },
)
def stream_images(
    bucket: str,
    prefix: str = "",
    start_hhmm: Optional[str] = Query(default=None, pattern=r"^\d{2}:\d{2}$"),
    end_hhmm:   Optional[str] = Query(default=None, pattern=r"^\d{2}:\d{2}$"),
    sample_every: int         = Query(10, ge=1,  le=200, description="Toma 1 de cada N"),
    limit:        int         = Query(10_000, ge=1, le=200_000, description="Máx. objetos a emitir"),
    start_after:  Optional[str] = Query(default=None, description="Cursor para continuar"),
):
    """
    Stream NDJSON: envía una línea JSON por objeto: {"name":"<obj>"}\n
    - Filtra por hora derivada del nombre de archivo.
    - Aplica muestreo en servidor (1 de cada N).
    - Corta en 'limit'.
    - Usa 'start_after' para paginar/continuar.
    """
    try:
        client = get_minio_client()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MinIO client error: {e}")

    # Heurística para saltar cerca del inicio del rango horario si no viene cursor
    if start_hhmm and not start_after:
        try:
            hh, mm = start_hhmm.split(":")
            # Ajusta si tu patrón de nombre es distinto
            start_after = f"{prefix}{hh}-{mm}"
        except Exception:
            pass

    def gen():
        picked = 0    # candidatos que pasaron filtro de hora (para muestreo)
        emitted = 0   # líneas NDJSON realmente emitidas
        last_flush = time.time()

        try:
            it = client.list_objects(
                bucket,
                prefix=prefix,
                recursive=True,
                start_after=start_after,
                use_api_v1=False,       # ListObjectsV2
                # include_user_meta=False,  # depende de tu versión del SDK
            )
        except Exception as e:
            # Emitir un error “suave” como última línea (opcional)
            yield json.dumps({"error": f"list_objects failed: {e}"}) + "\n"
            return

        for obj in it:
            if emitted >= limit:
                break

            name = getattr(obj, "object_name", None)
            if not name:
                continue

            # Filtrado por hora desde el nombre
            hhmm = _extract_hhmm(name)
            if not _within(hhmm, start_hhmm, end_hhmm):
                continue

            # Muestreo: 1 de cada N que pasó el filtro
            if (picked % sample_every) != 0:
                picked += 1
                continue

            picked += 1
            emitted += 1

            # Línea NDJSON (compacta)
            yield json.dumps({"name": name}, separators=(",", ":")) + "\n"

            # Flush cooperativo cada ~50ms para mejorar latencia percibida
            now = time.time()
            if now - last_flush > 0.05:
                last_flush = now
                # time.sleep(0)  # opcional

    headers = {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        # Si necesitas CORS, configúralo con CORSMiddleware en main.py
    }

    return StreamingResponse(gen(), headers=headers)
