# backend/api/v1/users.py
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session
from db.postgres import get_db
from services.user_service import *
from schemas.user import *

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

@router.get("/log-in")
def user_login(email: str, password: str, db: Session = Depends(get_db)):
    """
    Valida que un usuario exista y sea correcto para logearse en la pagina web
    """
    result = user_login_query(db, email, password)
    return {"success": result}

@router.put("/update_status/{user_id}")
def update_user_status(user_id: int, data: UsuarioEstadoActualizar, db: Session = Depends(get_db)):
    """
    Actualizar estado del usuario.
    """
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    updated_user = update_user_status_query(db, data.estado.value, user)
    return {"msg": "Estado actualizado", "user": updated_user}

@router.put("/update_power/{user_id}")
def update_user_power(user_id: int, data: UsuarioPoderActualizar, db: Session = Depends(get_db)):
    """
    Actualiza si un usuario es admin o no.
    """
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
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
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    updated_user = approve_user_query(db, user=user, admin=admin)
    return {"msg": "Usuario aprobado", "user": updated_user}

