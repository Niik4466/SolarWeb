from datetime import datetime
from typing import List, Optional
from sqlalchemy import (
    Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, BigInteger, ARRAY
)
from sqlalchemy.orm import relationship, DeclarativeBase, Mapped, mapped_column
import enum


# ENUM del estado de usuario
class UsuarioEstado(str, enum.Enum):
    pendiente = "pendiente"
    aprobado = "aprobado"
    eliminado = "eliminado"


class Base(DeclarativeBase):
    pass


class Usuario(Base):
    __tablename__ = "usuario"
    __table_args__ = {"schema": "app"}  # importante por CREATE SCHEMA app

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    correo: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    apellido: Mapped[Optional[str]] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    es_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    estado: Mapped[UsuarioEstado] = mapped_column(Enum(UsuarioEstado), default=UsuarioEstado.pendiente)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    actualizado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    aprobado_en: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # Relaciones
    solicitudes: Mapped[List["Solicitud"]] = relationship("Solicitud", back_populates="usuario", cascade="all, delete-orphan")
    transacciones: Mapped[List["Transaccion"]] = relationship("Transaccion", back_populates="usuario", cascade="all, delete-orphan")
    eliminaciones_hechas: Mapped[List["UsuarioEliminacionLog"]] = relationship(
        "UsuarioEliminacionLog",
        back_populates="eliminado_por",
        foreign_keys="UsuarioEliminacionLog.eliminado_por_id"
    )
    eliminaciones_recibidas: Mapped[List["UsuarioEliminacionLog"]] = relationship(
        "UsuarioEliminacionLog",
        back_populates="usuario",
        foreign_keys="UsuarioEliminacionLog.usuario_id"
    )


class UsuarioEliminacionLog(Base):
    __tablename__ = "usuario_eliminacion_log"
    __table_args__ = {"schema": "app"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("app.usuario.id"), nullable=False)
    eliminado_por_id: Mapped[int] = mapped_column(ForeignKey("app.usuario.id"), nullable=False)
    motivo: Mapped[Optional[str]] = mapped_column(Text)
    eliminado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relaciones
    usuario: Mapped["Usuario"] = relationship("Usuario", foreign_keys=[usuario_id], back_populates="eliminaciones_recibidas")
    eliminado_por: Mapped["Usuario"] = relationship("Usuario", foreign_keys=[eliminado_por_id], back_populates="eliminaciones_hechas")


class Solicitud(Base):
    __tablename__ = "solicitud"
    __table_args__ = {"schema": "app"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("app.usuario.id"), nullable=False)
    justificacion: Mapped[Optional[str]] = mapped_column(Text)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    usuario: Mapped["Usuario"] = relationship("Usuario", back_populates="solicitudes")


class Transaccion(Base):
    __tablename__ = "transaccion"
    __table_args__ = {"schema": "app"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("app.usuario.id"), nullable=False)
    archivos: Mapped[Optional[List[str]]] = mapped_column(ARRAY(Text))
    exportado_en: Mapped[Optional[datetime]] = mapped_column(DateTime)
    imagenes: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    var_ghi: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    var_dni: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    var_global: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    usuario: Mapped["Usuario"] = relationship("Usuario", back_populates="transacciones")

