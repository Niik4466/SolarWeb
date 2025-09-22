# backend/schemas/image.py
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class MinioObject(BaseModel):
    name: str
    size: int
    last_modified: Optional[datetime] = None

class MinioListResponse(BaseModel):
    bucket: str
    objects: List[MinioObject]
