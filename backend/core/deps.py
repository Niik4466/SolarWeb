# Dependencias comunes para rutas que requieren autenticación y autorización.
from fastapi import Depends, HTTPException, status
from models.user import Usuario
from core.security import get_current_user  # el que ya usas

def get_current_admin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    """
    Devuelve el usuario actual SOLO si es admin.
    Si no lo es, lanza 403.
    """
    if not current_user.es_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No autorizado"
        )
    return current_user
