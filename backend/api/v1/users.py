# backend/api/v1/users.py
from fastapi import APIRouter, Depends, status, HTTPException, Query
from sqlalchemy.orm import Session
from db.postgres import get_db
from services.user_service import *
from schemas.user import *
from models.user import Usuario, Solicitud
from pydantic import BaseModel, EmailStr

from core.security import create_access_token, get_current_user

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/")
def list_users(db: Session = Depends(get_db)):
    """
    Devuelve todos los usuarios registrados.
    """
    users = list_users_query(db)
    return {"data": users, "total": len(users)}

@router.post("/create_user", response_model=UsuarioOut)
def create_user(usuario: UsuarioCreate, db: Session = Depends(get_db)):
    """
    Crea un usuario y una solicitud obligatoria
    """
    if not usuario.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is missing"
        )
    try:
        nuevo_usuario = create_user_query(db, usuario.dict(), usuario.justificacion)
        return nuevo_usuario
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error creating user: {str(e)}"
        )

class LoginIn(BaseModel):
    email: EmailStr
    password: str

@router.post("/log-in")
def user_login(data: LoginIn, db: Session = Depends(get_db)):
    login_result = user_login_query(db, data.email, data.password)

    # se asume que login_result es un dict con 'success' y 'user' keys
    if not login_result.get("success"):
        return login_result # Retorna el error si el login falló
    
    if login_result.get("estado") != "aprobado":
        return login_result # Retorna el estado si no está aprobado
    
    user_id = login_result.get("user_id")

    if not user_id:
        # Esto no debería pasar, pero por seguridad, en caso de que no haya user_id
        user = db.query(Usuario).filter(Usuario.correo == data.email).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Usuario no encontrado después del login exitoso"
            )
        user_id = user.id
    access_token = create_access_token(data={"sub": str(user_id)})
    # Devolvemos lo mismo que antes, pero con el token añadido
    login_result.update({
        "access_token": access_token,
        "token_type": "bearer"
    })
    return login_result

@router.get("/me", response_model=UsuarioOut)
def read_me(current_user: Usuario = Depends(get_current_user)):
    """
    Obtiene la información del usuario actualmente autenticado.
    """
    return current_user

@router.put("/update_status/{user_id}")
def update_user_status(user_id: int, data: UsuarioEstadoActualizar, db: Session = Depends(get_db)):
    """
    Actualizar estado del usuario.
    """
    user = obtain_user_by_id_query(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    updated_user = update_user_status_query(db, data.estado.value, user)
    return {"msg": "Estado actualizado", "user": updated_user}

@router.put("/update_power/{user_id}")
def update_user_power(user_id: int, data: UsuarioPoderActualizar, db: Session = Depends(get_db)):
    """
    Actualiza si un usuario es admin o no.
    """
    user = obtain_user_by_id_query(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    updated_user = update_user_power_query(db, data.es_admin, user)
    return {"msg": "Rol actualizado", "user": updated_user}

@router.get("/by_status")
def list_users_by_status(status: UsuarioEstado = UsuarioEstado.aprobado, db: Session = Depends(get_db)):
    """
    Obtiene usuarios filtrando por estado.
    """
    users = get_users_by_status_query(db, status.value)
    return {"total": len(users), "data": users}

@router.put("/approve/{user_id}/{admin}")
def approve_user(user_id: int, admin: bool, db: Session = Depends(get_db)):
    """
    Aprueba un usuario y define si es admin o no.
    """
    user = obtain_user_by_id_query(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    updated_user = approve_user_query(db, user=user, admin=admin)
    return {"msg": "Usuario aprobado", "user": updated_user}

@router.get("/pending_with_solicitudes")
def pending_with_solicitudes(db: Session = Depends(get_db)):
    """
    Devuelve todos los usuarios en estado 'pendiente' con su última solicitud (si existe).
    """
    return get_pending_users_with_last_solicitud_query(db)

@router.get("/approved_users")
def approved_users(db: Session = Depends(get_db)):
    """
    Devuelve todos los usuarios en estado 'aprobados' con su fecha de aprobacion
    """
    return get_approved_users_query(db)

@router.get("/deleted_users")
def deleted_users(db: Session = Depends(get_db)):
    """
    Devuelve todos los usuarios en estado 'eliminado' con su fecha de eliminacion
    """
    return get_deleted_users_query(db)

@router.post("/delete_user/{user_id}/{admin_id}")
def delete_user(user_id: int, admin_id: int, db: Session = Depends(get_db)):
    """
    Elimina logicamente un usuario
    """
    return delete_user_query(db=db, usuario_id=user_id, eliminado_por_id=admin_id)

@router.get("/get_transactions/{user_id}")
def get_transactions_by_user_id(user_id: int, db: Session = Depends(get_db)):
    """
    Obtiene todas las transacciones realizadas por un usuario
    """
    transactions = get_transactions_by_user_id_query(db, usuario_id=user_id)
    return {"total": len(transactions), "data": transactions}

@router.post("/save_transaction", response_model=TransaccionOut)
def create_transaction(payload: TransaccionCreate, db: Session = Depends(get_db)):
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

@router.delete("/delete_scheduled")
def delete_users_scheduled(
    usuario_id: int = Query(..., description="ID de usuarios a eliminar"),
    eliminado_por_id: int = Query(..., description="ID del usuario que ejecuta la acción"),
    db: Session = Depends(get_db),
):
    """
    Marca uno o varios usuarios como eliminados y programa su eliminación definitiva en 30 días.
    """
    resultado = mark_and_schedule_deletion_query(db, usuario_id, eliminado_por_id)

    return resultado
