# backend/api/v1/users.py
from fastapi import APIRouter, Depends, status, HTTPException, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from db.postgres import get_db
from services.user_service import *
from schemas.user import *
from models.user import Usuario, Solicitud
from datetime import timedelta  # si no lo tienes ya importado arriba

from core.security import create_access_token, get_current_user
from core.deps import get_current_admin  # dependencia que valida es_admin

router = APIRouter(prefix="/users", tags=["users"])

# -----------------------------------------------------------
# TESTING
# -----------------------------------------------------------
@router.put("/update_status/{user_id}")
def update_user_status(
    user_id: int,
    data: UsuarioEstadoActualizar,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin),
):
    """
    Actualiza el estado de un usuario (ej. aprobado, pendiente, rechazado).

    Solo accesible por administradores.

    Args:
        user_id (int): ID del usuario a modificar.
        data (UsuarioEstadoActualizar): Payload con el nuevo estado.
        db (Session): Sesión de base de datos.
        admin (Usuario): Administrador autenticado.

    Returns:
        dict: Mensaje de confirmación y objeto usuario actualizado.

    Raises:
        HTTPException(404): Si el usuario no existe.
    """
    user = obtain_user_by_id_query(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    updated_user = update_user_status_query(db, data.estado.value, user)
    return {"msg": "Estado actualizado", "user": updated_user}


@router.put("/update_power/{user_id}")
def update_user_power(
    user_id: int,
    data: UsuarioPoderActualizar,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin),
):
    """
    Actualiza los privilegios de administrador de un usuario.

    Solo accesible por administradores.

    Args:
        user_id (int): ID del usuario.
        data (UsuarioPoderActualizar): Payload indicando si es admin (True/False).
        db (Session): Sesión de BD.
        admin (Usuario): Admin autenticado.

    Returns:
        dict: Mensaje de confirmación y usuario actualizado.

    Raises:
        HTTPException(404): Si el usuario no existe.
    """
    user = obtain_user_by_id_query(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    updated_user = update_user_power_query(db, data.es_admin, user)
    return {"msg": "Rol actualizado", "user": updated_user}


# -----------------------------------------------------------
# AUTENTICACIÓN / REGISTRO
# -----------------------------------------------------------
@router.post("/log-in")
def user_login(data: LoginIn, db: Session = Depends(get_db)):
    """
    Autentica a un usuario y devuelve un token de acceso (JWT).

    Valida credenciales y estado del usuario (debe estar aprobado).

    Args:
        data (LoginIn): Credenciales (email, password).
        db (Session): Sesión de BD.

    Returns:
        dict: Objeto con token de acceso, tipo de token y datos del usuario si es exitoso.
              Si falla, puede retornar un diccionario indicando el error (success=False).
    """
    email_normalized = data.email.strip().lower()
    login_result = user_login_query(db, email_normalized, data.password)

    # 1. ¿falló login?
    if not login_result.get("success"):
        return login_result

    # 2. ¿está aprobado?
    if login_result.get("estado") != "aprobado":
        return login_result


    # 3. crear token incluyendo es_admin
    access_token = create_access_token(
        data={
            "sub": str(login_result["user_id"]),
            "es_admin": login_result["es_admin"],
            "owner": login_result.get("owner", False),
        }
    )

    # 4. devolver lo mismo que devolvías + token + flag admin
    login_result.update(
        {
            "access_token": access_token,
            "token_type": "bearer",
        }
    )
    return login_result


@router.post("/token")
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Endpoint OAuth2 estándar para obtener un token de acceso.

    Utilizado comúnmente por Swagger UI. Requiere enviar credenciales como Form Data.

    Args:
        form_data (OAuth2PasswordRequestForm): Datos del formulario (username, password).
        db (Session): Sesión de BD.

    Returns:
        dict: Token de acceso y tipo de token.

    Raises:
        HTTPException(401): Credenciales inválidas o usuario no aprobado.
    """
    email_normalized = form_data.username.strip().lower()
    login_result = user_login_query(db, email_normalized, form_data.password)

    if not login_result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if login_result.get("estado") != "aprobado":
         raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Usuario en estado: {login_result.get('estado')}",
        )

    access_token = create_access_token(
        data={
            "sub": str(login_result["user_id"]),
            "es_admin": login_result["es_admin"],
            "owner": login_result.get("owner", False),
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.post("/create_user", response_model=UsuarioOut)
def create_user(usuario: UsuarioCreate, db: Session = Depends(get_db)):
    """
    Registra un nuevo usuario en el sistema.

    Crea el registro de usuario y una solicitud de acceso asociada.
    El usuario recién creado queda en estado 'pendiente' y requiere aprobación.

    Args:
        usuario (UsuarioCreate): Datos del nuevo usuario incluyendo justificación.
        db (Session): Sesión de BD.

    Returns:
        UsuarioOut: El usuario creado.

    Raises:
        HTTPException(400): Si falta password u otros datos requeridos.
    """
    if not usuario.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Password is missing"
        )
    nuevo_usuario = create_user_query(
        db, usuario.dict(), usuario.justificacion
    )
    return nuevo_usuario


# -----------------------------------------------------------
# USUARIO
# -----------------------------------------------------------
@router.get("/me", response_model=UsuarioOut)
def read_me(current_user: Usuario = Depends(get_current_user)):
    """
    Obtiene la información del perfil del usuario autenticado actual.
    
    Args:
        current_user (Usuario): Usuario extraído del token JWT.
    
    Returns:
        UsuarioOut: Objeto usuario.
    """
    return current_user

@router.post("/refresh-token", response_model=Token)
def refresh_access_token(
    current_user: Usuario = Depends(get_current_user),
):
    """
    Emite un nuevo token de acceso para un usuario ya autenticado.

    Permite renovar la sesión sin volver a enviar credenciales, siempre que 
    el token actual sea válido (o se use dentro de un flujo de refresco válido).

    Args:
        current_user (Usuario): Usuario autenticado.

    Returns:
        Token: Nuevo access token.
    """
    # Reutilizamos la misma estructura de data que en /users/log-in
    access_token = create_access_token(
        data={
            "sub": str(current_user.id),
            "es_admin": current_user.es_admin,
            "owner": getattr(current_user, "owner", False),
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }



# -----------------------------------------------------------
# ADMIN
# -----------------------------------------------------------
@router.get("/")
def list_users(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Lista todos los usuarios registrados en el sistema.

    Solo accesible por administradores.

    Args:
        db (Session): Sesión de BD.
        _: (Usuario): Admin autenticado (no usado en la lógica, solo como dependencia).

    Returns:
        dict: Objeto con lista de usuarios ("data") y total ("total").
    """
    users = list_users_query(db)
    return {"data": users, "total": len(users)}


@router.get("/by_status")
def list_users_by_status(
    status: UsuarioEstado = UsuarioEstado.aprobado,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Lista usuarios filtrados por su estado actual.

    Solo accesible por administradores.

    Args:
        status (UsuarioEstado): Estado a filtrar (ej: aprobado, pendiente). Default: aprobado.
        db (Session): Sesión de BD.
        _: (Usuario): Admin autenticado.

    Returns:
        dict: Lista de usuarios y total.
    """
    users = get_users_by_status_query(db, status.value)
    return {"total": len(users), "data": users}


@router.put("/approve/{user_id}/{admin_flag}")
def approve_user(
    user_id: int,
    admin_flag: bool,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Aprueba un usuario pendiente y asigna rol inicial.

    Solo accesible por administradores. Cambia el estado a 'aprobado'.

    Args:
        user_id (int): ID del usuario.
        admin_flag (bool): Si True, el usuario será administrador.
        db (Session): Sesión de BD.
        _: (Usuario): Admin autenticado.

    Returns:
        dict: Mensaje y usuario actualizado.

    Raises:
        HTTPException(404): Si el usuario no existe.
    """
    user = obtain_user_by_id_query(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    updated_user = approve_user_query(db, user=user, admin=admin_flag)
    return {"msg": "Usuario aprobado", "user": updated_user}


@router.get("/pending_with_solicitudes")
def pending_with_solicitudes(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Obtiene usuarios pendientes junto con los detalles de su última solicitud.

    Útil para la interfaz de aprobación de usuarios, mostrando la justificación de ingreso.
    Solo accesible por administradores.

    Args:
        db (Session): Sesión de BD.
        _: (Usuario): Admin autenticado.

    Returns:
        list: Lista de usuarios pendientes con sus solicitudes.
    """
    return get_pending_users_with_last_solicitud_query(db)


@router.get("/approved_users")
def approved_users(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Retorna la lista de todos los usuarios con estado 'aprobado'.

    Solo accesible por administradores.

    Args:
        db (Session): Sesión de BD.
        _: (Usuario): Admin autenticado.

    Returns:
        list: Lista de usuarios aprobados.
    """
    return get_approved_users_query(db)


@router.get("/deleted_users")
def deleted_users(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin),
):
    """
    Lista los usuarios que han sido eliminados lógicamente (soft delete).

    Solo accesible por administradores.

    Args:
        db (Session): Sesión de BD.
        admin (Usuario): Admin autenticado.

    Returns:
        list: Lista de usuarios eliminados.
    """
    return get_deleted_users_query(db, admin)


@router.post("/delete_user/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin),
):
    """
    Realiza un borrado lógico (soft delete) de un usuario.

    Solo accesible por administradores. Registra quién realizó la eliminación.

    Args:
        user_id (int): ID del usuario a eliminar.
        db (Session): Sesión de BD.
        admin (Usuario): Admin autenticado que ejecuta la acción.

    Returns:
        Usuario: El usuario actualizado (marcado como eliminado).
    """
    return delete_user_query(
        db=db,
        usuario_id=user_id,
        eliminado_por_id=admin.id,
    )


@router.delete("/delete_scheduled")
def delete_users_scheduled(
    usuario_id: int = Query(..., description="ID de usuarios a eliminar"),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin),
):
    """
    Programa la eliminación definitiva de un usuario.

    Marca al usuario para ser eliminado físicamente de la base de datos después de un periodo 
    de retención (ej. 30 días). Accesible por administradores y posiblemente Owners.

    Args:
        usuario_id (int): ID del usuario.
        db (Session): Sesión de BD.
        admin (Usuario): Admin autenticado.

    Returns:
        dict: Resultado de la operación de agendamiento.
    """
    resultado = mark_and_schedule_deletion_query(
        db, usuario_id, admin.id
    )
    return resultado

@router.delete("/delete_permanently")
def delete_user_permanently(
    usuario_id: int = Query(..., description="ID del usuario a eliminar"),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin),
):
    """
    Elimina permanentemente un usuario de la base de datos (Hard Delete).

    Esta acción es irreversible.

    Args:
        usuario_id (int): ID del usuario.
        db (Session): Sesión de BD.
        admin (Usuario): Admin autenticado.

    Returns:
        dict: Resultado de la operación.
    """
    resultado = delete_user_permanently_query(
        db=db, usuario_id=usuario_id
    )
    return resultado

# -----------------------------------------------------------
# TRANSACCIONES
# -----------------------------------------------------------
@router.get("/get_transactions/{user_id}")
def get_transactions_by_user_id(user_id: int, db: Session = Depends(get_db), admin: Usuario = Depends(get_current_admin)):
    """
    Consulta el historial de transacciones (exportaciones) de un usuario.

    Solo accesible por administradores.

    Args:
        user_id (int): ID del usuario.
        db (Session): Sesión de BD.
        admin (Usuario): Admin autenticado.

    Returns:
        dict: Lista de transacciones y total.
    """
    transactions = get_transactions_by_user_id_query(db, usuario_id=user_id)
    return {"total": len(transactions), "data": transactions}


@router.post("/save_transaction", response_model=TransaccionOut)
def create_transaction(payload: TransaccionCreate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """
    Registra manualmente una nueva transacción.

    Generalmente usado por procesos o clientes que necesitan guardar un registro de exportación.
    
    Args:
        payload (TransaccionCreate): Datos de la transacción.
        db (Session): Sesión de BD.
        current_user (Usuario): Usuario autenticado.

    Returns:
        TransaccionOut: Transacción creada.
    """
    return save_transaction_query(
        db=db,
        user_id=payload.usuario_id,
        files=payload.archivos or [],
        images=payload.imagenes,
        var_ghi=payload.var_ghi,
        var_dni=payload.var_dni,
        var_global=payload.var_global,
    )


# -----------------------------------------------------------
# PASSWORD RECOVERY
# -----------------------------------------------------------
@router.post("/pass/generate_code")
def generate_recovery_code(
    payload: RecoveryCodeRequest,
    db: Session = Depends(get_db)
):
    """
    Genera y envía un código de recuperación de contraseña.

    Busca al usuario por email y, si existe, envía un código a su correo.
    Siempre devuelve un mensaje de éxito para evitar enumeración de usuarios.

    Args:
        payload (RecoveryCodeRequest): Contiene el email del usuario.
        db (Session): Sesión de BD.

    Returns:
        dict: Mensaje genérico de éxito.
    """
    generate_recovery_code_query(db, payload.email)
    # Siempre respondemos lo mismo para no enumerar usuarios
    return {"message": "Se ha enviado un código de recuperación."}


@router.post("/pass/recovery")
def verify_recovery_code(
    payload: RecoveryCodeVerify,
    db: Session = Depends(get_db)
):
    """
    Verifica un código de recuperación y actualiza la contraseña del usuario.

    Args:
        payload (RecoveryCodeVerify): Email, código y nueva contraseña.
        db (Session): Sesión de BD.

    Returns:
        dict: Mensaje de éxito si el cambio fue correcto.

    Raises:
        HTTPException(400): Si el código es inválido, expirado o el email no coincide.
    """
    success = verify_recovery_code_query(db, payload.email, payload.code, payload.password)
    
    if not success:
        raise HTTPException(
            status_code=400, 
            detail="Código inválido, expirado o correo incorrecto."
        )

    return {"message": "Contraseña actualizada correctamente."}
