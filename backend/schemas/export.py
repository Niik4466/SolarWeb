# backend/schemas/export.py
from typing import Literal, List, Dict, Optional, Set
from pydantic import BaseModel, field_validator, EmailStr
from datetime import datetime

MetricLiteral = Literal["mean", "min", "max", "sum"]  # puedes ajustar nombres

class ExportBase(BaseModel):
    variables: List[Literal["GHI","DNI","DHI"]]
    format: Literal["csv","json"]
    include_images: bool = False
    images_bucket: Optional[str] = None
    start_hour: str = "00:00"
    end_hour: str = "23:59"
    granularity: Optional[str] = None
    metrics: Optional[List[MetricLiteral]] = None   # <--- NUEVO

    @field_validator("start_hour", "end_hour")
    @classmethod
    def check_time_format(cls, v: str) -> str:
        import re
        if not re.match(r"^\d{2}:\d{2}$", v):
            raise ValueError("Formato de hora inválido. Use HH:MM")
        # Opcional: validar rango 00-23 y 00-59
        hh, mm = map(int, v.split(":"))
        if not (0 <= hh <= 23 and 0 <= mm <= 59):
            raise ValueError("Hora fuera de rango (00:00 - 23:59)")
        return v

class ExportDayReq(ExportBase):
    date: str

class ExportByRangeReq(ExportBase):
    date_init: str
    date_finish: str

class ExportBatchReq(ExportBase):
    dates: List[str]                             # ["YYYY-MM-DD", ...]

    @field_validator("dates")
    @classmethod
    def check_dates(cls, vs: List[str]) -> List[str]:
        if not vs:
            raise ValueError("Debe indicar al menos una fecha.")
        seen: Set[str] = set()
        out: List[str] = []
        for v in vs:
            try:
                datetime.strptime(v, "%Y-%m-%d")
            except ValueError:
                raise ValueError(f"Fecha inválida: {v} (use YYYY-MM-DD)")
            if v not in seen:
                seen.add(v)
                out.append(v)
        return sorted(out)  # orden estable para nombre de archivo

class ExportAsyncBaseReq(BaseModel):
    user_id: int 
    email: EmailStr 
    
class ExportBatchAsyncReq(ExportBatchReq, ExportAsyncBaseReq):
    pass

class ExportRangeAsyncReq(ExportByRangeReq, ExportAsyncBaseReq):
    pass
