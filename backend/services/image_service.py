from db.minio import get_minio_client
from schemas.image import MinioListResponse, MinioObject
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Optional, Generator

def floor_datetime(dt: datetime, step: timedelta) -> datetime:
    """
    Redondea hacia abajo un datetime según el tamaño del paso (step).
    Funciona para granularidades en segundos, minutos u horas.
    """
    total_seconds = int(step.total_seconds())

    if total_seconds < 60:  # segundos
        floored = dt.replace(microsecond=0, second=(dt.second // total_seconds) * total_seconds)
    elif total_seconds < 3600:  # minutos
        minutes = total_seconds // 60
        floored = dt.replace(second=0, microsecond=0, minute=(dt.minute // minutes) * minutes)
    else:  # horas
        hours = total_seconds // 3600
        floored = dt.replace(minute=0, second=0, microsecond=0, hour=(dt.hour // hours) * hours)

    return floored

def _parse_object_date(object_name: str) -> Optional[datetime]:
    """Parses date from object name formatted as year/month/day/hh_mm_ss.ext"""
    try:
        parts = object_name.split("/")
        if len(parts) < 4:
            return None
        year, month, day = map(int, parts[:3])
        time_part = parts[3].split(".")[0]
        # Handle cases where underscore might be used or mixed
        # The original code assumed h_m_s. Expect strictly that format?
        # Original: hour, minute, second = map(int, time_part.split("_"))
        # We will keep it strictly as original list_images did.
        hour, minute, second = map(int, time_part.split("_"))
        return datetime(year, month, day, hour, minute, second)
    except Exception:
        return None

def _get_step(granularity: str) -> timedelta:
    step_map = {
        "1s": timedelta(seconds=1),
        "10s": timedelta(seconds=10),
        "30s": timedelta(seconds=30),
        "1m": timedelta(minutes=1),
        "5m": timedelta(minutes=5),
        "30m": timedelta(minutes=30),
        "1h": timedelta(hours=1),
    }
    return step_map.get(granularity, timedelta(seconds=1))

def get_images_query(bucket: str, prefix: str = "", granularity: str = "1s") -> MinioListResponse:
    """
    Devuelve los objetos de MinIO agrupados por granularidad de tiempo.
    Formato esperado de los objetos: año/mes/día/hh_mm_ss[.ext]
    Granularidades soportadas: 1s, 10s, 1m, 5m, 30m, 1h
    """
    client = get_minio_client()
    objects = client.list_objects(bucket, prefix=prefix, recursive=True)

    # Paso 1: obtener lista base (parsear fecha desde el path)
    object_list = []
    for obj in objects:
        dt = _parse_object_date(obj.object_name)
        if dt:
            object_list.append((dt, obj.object_name))

    # Paso 2: definir granularidades
    step = _get_step(granularity)

    # Paso 3: agrupar por granularidad
    grouped = defaultdict(list)
    for dt, name in object_list:
        floored = floor_datetime(dt, step)
        grouped[floored].append(name)

    # Paso 4: seleccionar una imagen representativa por grupo
    grouped_objects = [
        MinioObject(name=imgs[0]) for _, imgs in sorted(grouped.items())
    ]

    # Paso 5: Añadir la ultima imagen
    if object_list:
        last_img = max(object_list, key=lambda x: x[0])[1]
        if not grouped_objects or grouped_objects[-1].name != last_img:
            grouped_objects.append(MinioObject(name=last_img))

    return MinioListResponse(bucket=bucket, objects=grouped_objects)


def get_image(bucket: str, object_name: str):
    """
    Devuelve un objeto de MinIO como stream.
    """
    client = get_minio_client()
    return client.get_object(bucket, object_name)

def _is_within_time_range(dt: datetime, start_hhmm: Optional[str], end_hhmm: Optional[str]) -> bool:
    if not start_hhmm and not end_hhmm:
        return True
    
    current_minutes = dt.hour * 60 + dt.minute
    
    if start_hhmm:
        sh, sm = map(int, start_hhmm.split(":"))
        start_minutes = sh * 60 + sm
        if current_minutes < start_minutes:
            return False
            
    if end_hhmm:
        eh, em = map(int, end_hhmm.split(":"))
        end_minutes = eh * 60 + em
        if current_minutes > end_minutes:
            return False
            
    return True

def stream_images_query(
    bucket: str, 
    prefix: str = "", 
    start_hhmm: Optional[str] = None, 
    end_hhmm: Optional[str] = None, 
    granularity: str = "1s",
    limit: int = 10000,
    start_after: Optional[str] = None
) -> Generator[str, None, None]:
    """
    Generates object names from MinIO with granularity filtering and time range support.
    """
    client = get_minio_client()
    
    if start_hhmm and not start_after:
        try:
            hh, mm = start_hhmm.split(":")
            start_after = f"{prefix}{hh}-{mm}" 
        except Exception:
            pass

    objects = client.list_objects(
        bucket,
        prefix=prefix,
        recursive=True,
        start_after=start_after or str(prefix),
        use_api_v1=False
    )
    
    step = _get_step(granularity)
    last_yielded_bucket_time: Optional[datetime] = None
    emitted = 0
    
    for obj in objects:
        if emitted >= limit:
            break
            
        name = getattr(obj, "object_name", None)
        if not name:
            continue
            
        dt = _parse_object_date(name)
        if not dt:
            continue
            
        if not _is_within_time_range(dt, start_hhmm, end_hhmm):
            continue
            
        # Granularity Logic
        floored_dt = floor_datetime(dt, step)
        
        if last_yielded_bucket_time is None or floored_dt != last_yielded_bucket_time:
            yield name
            last_yielded_bucket_time = floored_dt
            emitted += 1
