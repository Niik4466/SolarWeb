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
    Actualizar estado del usuario. (solo admin)
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
    Actualiza si un usuario es admin o no.
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
    Endpoint específico para OAuth2 (Swagger UI uses this).
    Recibe username/password como Form Data.
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
def create_user(usuario: UsuarioCreate, db: Session = Depends(get_db), admin: Usuario = Depends(get_current_admin)):
    """
    Crea un usuario y una solicitud obligatoria.
    (solo admin)
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
    Obtiene la información del usuario actualmente autenticado.
    """
    return current_user

@router.post("/refresh-token", response_model=Token)
def refresh_access_token(
    current_user: Usuario = Depends(get_current_user),
):
    """
    Reemite un nuevo access token para el usuario actualmente autenticado.
    Usa la misma lógica de claims que el login.
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
    Devuelve todos los usuarios registrados. (solo admin)
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
    Obtiene usuarios filtrando por estado. (solo admin)
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
    Aprueba un usuario y define si es admin o no. (solo admin)
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
    Devuelve todos los usuarios en estado 'pendiente' con su última solicitud. (solo admin)
    """
    return get_pending_users_with_last_solicitud_query(db)


@router.get("/approved_users")
def approved_users(
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """
    Devuelve todos los usuarios aprobados. (solo admin)
    """
    return get_approved_users_query(db)


@router.get("/deleted_users")
def deleted_users(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin),
):
    """
    Devuelve todos los usuarios eliminados. (solo admin)
    """
    return get_deleted_users_query(db, admin)


@router.post("/delete_user/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin),
):
    """
    Elimina lógicamente un usuario. (solo admin)
    Usa el admin autenticado como 'eliminado_por_id'.
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
    Marca uno o varios usuarios como eliminados y programa su eliminación definitiva en 30 días. (solo admin y owner)
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
    Elimina definitivamente un usuario de la base de datos. (solo admin)
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
    Obtiene todas las transacciones realizadas por un usuario. (solo admin)
    """
    transactions = get_transactions_by_user_id_query(db, usuario_id=user_id)
    return {"total": len(transactions), "data": transactions}


@router.post("/save_transaction", response_model=TransaccionOut)
def create_transaction(payload: TransaccionCreate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):
    """
    Crea una nueva transacción (exportado_en queda en NULL).
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
    Genera un código de recuperación y lo envía por correo.
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
    Verifica si el código de recuperación es válido y actualiza la contraseña.
    """
    success = verify_recovery_code_query(db, payload.email, payload.code, payload.password)
    
    if not success:
        raise HTTPException(
            status_code=400, 
            detail="Código inválido, expirado o correo incorrecto."
        )

    return {"message": "Contraseña actualizada correctamente."}
