# backend/services/image_service.py
from db.minio import get_minio_client
from schemas.image import MinioListResponse, MinioObject
from datetime import datetime, timedelta
from collections import defaultdict

# def list_images(bucket: str, prefix: str = "") -> MinioListResponse:
#     """
#     Devuelve los objetos de MinIO en el bucket/prefix indicado.
#     """
#     client = get_minio_client()
#     objects = client.list_objects(bucket, prefix=prefix, recursive=True)
#
#     object_list = [
#         MinioObject(
#             name=obj.object_name,
#         )
#         for obj in objects
#     ]
#     return MinioListResponse(bucket=bucket, objects=object_list)


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

def list_images(bucket: str, prefix: str = "", granularity: str = "1s") -> MinioListResponse:
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
        try:
            # Ejemplo: "2025/10/20/14_35_01.jpg"
            parts = obj.object_name.split("/")
            if len(parts) < 4:
                continue

            year, month, day = map(int, parts[:3])
            time_part = parts[3].split(".")[0]  # "14_35_01"
            hour, minute, second = map(int, time_part.split("_"))

            dt = datetime(year, month, day, hour, minute, second)
            object_list.append((dt, obj.object_name))
        except Exception:
            continue

    # Paso 2: definir granularidades
    step_map = {
        "1s": timedelta(seconds=1),
        "10s": timedelta(seconds=10),
        "30s": timedelta(seconds=30),
        "1m": timedelta(minutes=1),
        "5m": timedelta(minutes=5),
        "30m": timedelta(minutes=30),
        "1h": timedelta(hours=1),
    }
    step = step_map.get(granularity, timedelta(seconds=1))

    # Paso 3: agrupar por granularidad
    grouped = defaultdict(list)
    for dt, name in object_list:
        floored = floor_datetime(dt, step)
        grouped[floored].append(name)

    # Paso 4: seleccionar una imagen representativa por grupo
    grouped_objects = [
        MinioObject(name=imgs[0]) for _, imgs in sorted(grouped.items())
    ]

    # Paso 5: Aniadir la ultima imagen

    last_img = max(object_list, key=lambda x: x[0])[1]
    if grouped_objects[-1].name != last_img:
        grouped_objects.append(MinioObject(name=last_img))

    return MinioListResponse(bucket=bucket, objects=grouped_objects)


def get_image(bucket: str, object_name: str):
    """
    Devuelve un objeto de MinIO como stream.
    """
    client = get_minio_client()
    return client.get_object(bucket, object_name)
