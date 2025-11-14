# Dependencias comunes para rutas que requieren autenticación y autorización.

from fastapi import Depends, HTTPException, status
from models.user import Usuario
from core.security import get_current_user  # dependencia que obtiene el usuario autenticado

def get_current_admin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    """
    Dependencia para validar permisos de administrador.

    Esta función se utiliza en endpoints que requieren no solo
    que el usuario esté autenticado, sino que además tenga rol
    de administrador.

    Flujo:
    --------
    1. Primero ejecuta la dependencia `get_current_user`, la cual:
       - Valida el token,
       - Obtiene al usuario desde la base de datos,
       - Retorna un objeto Usuario.

    2. Verifica el atributo `es_admin` del usuario autenticado.

    3. Si el usuario NO es administrador → lanza una excepción HTTP 403.

    4. Si el usuario SÍ es administrador → retorna el objeto Usuario,
       permitiendo que el endpoint continúe.

    Uso típico en rutas:
    ---------------------
    @router.get("/admin-only")
    def admin_route(current_admin = Depends(get_current_admin)):
        return {"msg": "Acceso permitido solo a administradores"}

    Esto permite centralizar la lógica de autorización
    sin repetir código en cada endpoint protegido.
    """
    if not current_user.es_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No autorizado"
        )
    return current_user
