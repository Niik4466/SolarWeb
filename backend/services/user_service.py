from sqlalchemy.orm import Session
from models.user import *
from fastapi import HTTPException

def list_users_query(db: Session):
    """Devuelve todos los usuarios registrados."""
    return db.query(Usuario).all()

def obtain_user_by_id_query(db: Session, usuario_id: int):
    """Obtiene un usuario por su ID."""
    return db.query(Usuario).filter(Usuario.id == usuario_id).first()

def get_user_by_email_query(db: Session, email: str) -> Usuario | None:
    """
    Obtiene un usuario por su correo inscrito
    """
    return db.query(Usuario).filter(Usuario.correo == email).first()

def update_user_status_query(db: Session, status: str, user: Usuario):
    """
    Actualizar estado del usuario.
    """
    allowed_status = ["pendiente", "aprobado", "eliminado"]
    if status not in allowed_status:
        raise HTTPException(status_code=400, detail=f"Estado invalido: {status}")

    # actualizamos el objeto
    user.estado = status
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def update_user_power_query(db: Session, admin: bool, user: Usuario):
    """
    Actualiza el rol del usuario, si es admin o no.
    """
    user.es_admin = bool(admin)  # 👈 usar el parámetro
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def approve_user_query(db: Session, user: Usuario, admin: bool):
    """
    Aprueba un usuario, se especifica el rol (es o no es admin)
    """
    # Actualizamos el estado
    update_user_status_query(db=db, status="aprobado", user=user)
 
    # Actualizamos el rol
    update_user_power_query(db, admin, user)

    return user

def user_login_query(db: Session, email:str, password:str) -> bool:
    """
    Valida que un usuario exista y sea correcto para logearse en la pagina web
    """
    usuario = get_user_by_email_query(db, email)
    if not usuario:
        return False

    if usuario.password_hash != password:
        return False

    if usuario.estado != "aprobado":
        return False

    return True

def get_users_by_status_query(db: Session, status: str = "aprobado"):
    """
    Devuelve todos los usuarios que tengan el estado especificado
    """
    allowed_status = ["pendiente", "aprobado", "eliminado"]
    if status not in allowed_status:
        raise HTTPException(status_code=400, detail=f"Estado invalido: {status}")

    users = db.query(Usuario).filter(Usuario.estado == status).all()
    return users

def create_user_query(db: Session, usuario_data: dict, justificacion: str):
    """
    Crea un nuevo usuario junto con su solicitud
    """
    try:
        # Creamos el usuario
        nuevo_usuario = Usuario(
        correo=usuario_data["correo"],
        nombre=usuario_data["nombre"],
        apellido=usuario_data.get("apellido"),
        password_hash=usuario_data["password"],
        es_admin=usuario_data.get("es_admin", False),
        estado=usuario_data.get("estado", "pendiente")
        )
        db.add(nuevo_usuario)
        db.flush()

        # Crear solicitud
        solicitud = Solicitud(
            usuario_id=nuevo_usuario.id,
            justificacion=justificacion
        )
        db.add(solicitud)

        # Hacemos commit a la bd
        db.commit()
        db.refresh(nuevo_usuario)

        return nuevo_usuario
    except IntegrityError as e:
        # Deshacemos los cambios
        db.rollback()
        raise e

