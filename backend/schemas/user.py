from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr
from enum import Enum

# --- QUERYS ---
class UsuarioEstado(str, Enum):
    pendiente = "pendiente"
    aprobado = "aprobado"
    eliminado = "eliminado"

class UsuarioEstadoActualizar(BaseModel):
    estado: UsuarioEstado

class UsuarioPoderActualizar(BaseModel):
    es_admin: bool

# --- USUARIO ---
class UsuarioBase(BaseModel):
    correo: EmailStr
    nombre: str
    apellido: Optional[str] = None
    es_admin: bool = False
    estado: UsuarioEstado = UsuarioEstado.pendiente


class UsuarioCreate(UsuarioBase):
    password: str
    justificacion: str


class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    estado: Optional[UsuarioEstado] = None


class UsuarioOut(UsuarioBase):
    id: int
    creado_en: datetime
    actualizado_en: datetime
    aprobado_en: Optional[datetime] = None
    owner: bool
    model_config = {"from_attributes": True}



# --- SOLICITUD ---
class SolicitudBase(BaseModel):
    justificacion: Optional[str] = None


class SolicitudCreate(SolicitudBase):
    usuario_id: int


class SolicitudOut(SolicitudBase):
    id: int
    usuario_id: int
    creado_en: datetime
    model_config = {"from_attributes": True}



# --- TRANSACCION ---
# --- TRANSACCION ---
class TransaccionEstado(str, Enum):
    pendiente = "pendiente"
    listo = "listo"
    error = "error"
    expirado = "expirado"

class TransaccionBase(BaseModel):
    archivos: Optional[List[str]] = None
    imagenes: bool = False
    var_ghi: bool = False
    var_dni: bool = False
    var_global: bool = False
    estado: TransaccionEstado = TransaccionEstado.pendiente


class TransaccionCreate(TransaccionBase):
    usuario_id: int


class TransaccionOut(TransaccionBase):
    id: int
    usuario_id: int
    exportado_en: Optional[datetime]
    creado_en: datetime

    class Config:
        orm_mode = True


# --- ELIMINACION LOG ---
class UsuarioEliminacionLogBase(BaseModel):
    motivo: Optional[str] = None


class UsuarioEliminacionLogCreate(UsuarioEliminacionLogBase):
    usuario_id: int
    eliminado_por_id: int


class UsuarioEliminacionLogOut(UsuarioEliminacionLogBase):
    id: int
    usuario_id: int
    eliminado_por_id: int
    eliminado_en: datetime
    model_config = {"from_attributes": True}


# --- PASSWORD RECOVERY ---
class RecoveryCodeRequest(BaseModel):
    email: EmailStr

class RecoveryCodeVerify(BaseModel):
    email: EmailStr
    code: str
    password: str

# --- TOKEN AUTENTICACIÓN ---
class Token(BaseModel):
    access_token: str
    token_type: str