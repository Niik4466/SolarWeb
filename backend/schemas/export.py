# backend/schemas/export.py
from typing import Literal, List, Dict, Optional, Set
from pydantic import BaseModel, field_validator
from datetime import datetime

class ExportBase(BaseModel):
    variables: List[Literal["GHI","DNI","DHI"]]
    format: Literal["csv","json"]
    include_images: bool = False
    images_bucket: Optional[str] = None

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


