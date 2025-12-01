# backend/services/user_service.py
from sqlalchemy.orm import Session
from db.postgres import get_db, get_sync_session
from models.user import *
from fastapi import HTTPException
from core.security import hash_password, verify_password
from datetime import datetime, timedelta
import secrets
import string
from services.mail_service import send_mail_query
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import func

scheduler = BackgroundScheduler()
scheduler.start()

class UsersError(Exception):
    """Error lógico para usuarios."""
    pass

# --------------------
# Tabla Usuarios
# --------------------

def list_users_query(db: Session):
    """Devuelve todos los usuarios registrados."""
    return db.query(Usuario).all()

def get_admin_emails_query(db: Session) -> List[str]:
    """
    Devuelve una lista de correos electrónicos de todos los usuarios
    que tienen rol de administrador en el sistema.
    """
    admins = db.query(Usuario.correo).filter(Usuario.es_admin == True).all()
    # admins es una lista de tuplas [('email1',), ('email2',)]
    return [email[0] for email in admins]

def obtain_user_by_id_query(db: Session, usuario_id: int):
    """Obtiene un usuario por su ID."""
    return db.query(Usuario).filter(Usuario.id == usuario_id).first()



def get_user_by_email_query(db: Session, email: str) -> Usuario | None:
    """
    Obtiene un usuario por su correo sin importar mayúsculas/minúsculas.
    """
    email_normalized = email.strip().lower()

    return (
        db.query(Usuario)
        .filter(func.lower(Usuario.correo) == email_normalized)
        .first()
    )


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
    user.es_admin = bool(admin)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def approve_user_query(db: Session, user: Usuario, admin: bool):
    """
    Aprueba un usuario, se especifica el rol (es o no es admin)
    """
    # Actualizamos el estado
    user.estado = "aprobado"
 
    # Actualizamos el rol
    user.es_admin = bool(admin)

    # Actualizamos la fecha de aprobacion
    user.aprobado_en = datetime.now()

    db.add(user)
    db.commit()
    db.refresh(user)

    return user

def user_login_query(db: Session, email: str, password: str) -> dict:
    """
    Lógica de negocio del login:
    - Busca usuario
    - Verifica contraseña
    - Verifica estado 
    """
    usuario = get_user_by_email_query(db, email)
    if not usuario:
        return {"success": False, "estado": None, "message": "credenciales invalidas"}

    if not verify_password(password, usuario.password_hash):
        return {"success": False, "estado": None, "message": "credenciales invalidas", "user_id": usuario.id}

    estado = getattr(usuario.estado, "value", usuario.estado)  # Enum -> str

    if estado == "aprobado":
        return {"success": True, "estado": "aprobado", "message": "ok", "user_id": usuario.id, "es_admin": usuario.es_admin, "owner": usuario.owner}
    if estado == "pendiente":
        return {"success": False, "estado": "pendiente", "message": "su solicitud sigue en estado de espera en aprobacion", "user_id": usuario.id}
    if estado == "eliminado":
        return {"success": False, "estado": "eliminado", "message": "su solicitud ha sido rechazada", "user_id": usuario.id}

    return {"success": False, "estado": estado, "message": "estado no permitido para login", "user_id": usuario.id}

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
    user = get_user_by_email_query(db, usuario_data["correo"])
    if user and (user.estado == "aprobado" or user.estado == "pendiente"):
        raise HTTPException(status_code=400, detail=f"Ya existe un usuario con el correo {usuario_data['correo']} en estado {user.estado}")   

    try:
        # Creamos el usuario
        hashed = hash_password(usuario_data["password"])

        nuevo_usuario = Usuario(
            correo=usuario_data["correo"].strip().lower(),
            nombre=usuario_data["nombre"],
            apellido=usuario_data.get("apellido"),
            password_hash=hashed,
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
        raise HTTPException(status_code=500, detail=f"Error al crear usuario: {str(e)}")

def get_pending_users_with_last_solicitud_query(db: Session):
    """
    Devuelve todos los usuarios en estado 'pendiente' junto con su última solicitud (si existe).
    Retorna una lista de diccionarios listos para serializar.
    """
    usuarios = db.query(Usuario).filter(Usuario.estado == UsuarioEstado.pendiente).all()
    if not usuarios:
        return {"total": 0, "data": []}

    ids = [u.id for u in usuarios]

    # Trae todas las solicitudes de esos usuarios, ordenadas por fecha DESC
    solicitudes = (
        db.query(Solicitud)
        .filter(Solicitud.usuario_id.in_(ids))
        .order_by(Solicitud.usuario_id, Solicitud.creado_en.desc())
        .all()
    )

    # Tomar la última solicitud por usuario
    last_by_user = {}
    for s in solicitudes:
        if s.usuario_id not in last_by_user:
            last_by_user[s.usuario_id] = s

    data = []
    for u in usuarios:
        s = last_by_user.get(u.id)
        data.append({
            "id": u.id,
            "correo": u.correo,
            "nombre": u.nombre,
            "apellido": u.apellido,
            "estado": u.estado.value if hasattr(u.estado, "value") else u.estado,
            "justificacion": (s.justificacion if s else None),
            "creado_en": (s.creado_en.isoformat() if s and s.creado_en else (u.creado_en.isoformat() if u.creado_en else None)),
            "owner": u.owner,
        })

    return {"total": len(data), "data": data}


def get_approved_users_query(db: Session):
    """
    Devuelve todos los usuarios con estado 'aprobado' junto con la fecha de aprobacion
    Estructura: { total, data: [ { id, nombre, apellido, correo, estado, aprobado_en } ] }
    """
    # Filtrar solo usuarios aprobados
    usuarios = (
        db.query(Usuario)
        .filter(Usuario.estado == UsuarioEstado.aprobado)
        .order_by(Usuario.aprobado_en.desc().nullslast())
        .all()
    )

    if not usuarios:
        return {"total": 0, "data": []}

    # Transformar al formato esperado
    data = [
        {
            "id": u.id,
            "nombre": u.nombre,
            "apellido": u.apellido,
            "correo": u.correo,
            "estado": u.estado.value,
            "aprobado_en": (
                u.aprobado_en.isoformat() if getattr(u, "aprobado_en", None) else None
            ),
            "owner": u.owner,
            "admin": u.es_admin
        }
        for u in usuarios
    ]

    return {"total": len(data), "data": data}

def get_deleted_users_query(db: Session):
    """
    Devuelve todos los usuarios con estado 'eliminado', junto con la fecha de eliminación registrada.
    Estructura: { total, data: [ { id, nombre, apellido, correo, estado, eliminado_en } ] }
    """
    # Consultar todos los usuarios eliminados
    usuarios_eliminados = db.query(Usuario).filter(Usuario.estado == UsuarioEstado.eliminado).all()
    if not usuarios_eliminados:
        return {"total": 0, "data": []}

    ids = [u.id for u in usuarios_eliminados]

    # Consultar logs de eliminación de esos usuarios
    logs = (
        db.query(UsuarioEliminacionLog)
        .filter(UsuarioEliminacionLog.usuario_id.in_(ids))
        .order_by(UsuarioEliminacionLog.eliminado_en.desc())
        .all()
    )

    # Tomar el log más reciente por usuario
    last_log_by_user = {}
    for log in logs:
        if log.usuario_id not in last_log_by_user:
            last_log_by_user[log.usuario_id] = log

    # Armar respuesta final
    data = []
    for u in usuarios_eliminados:
        log = last_log_by_user.get(u.id)
        data.append({
            "id": u.id,
            "nombre": u.nombre,
            "apellido": u.apellido,
            "correo": u.correo,
            "estado": u.estado.value if hasattr(u.estado, "value") else u.estado,
            "eliminado_en": (log.eliminado_en.isoformat() if log and log.eliminado_en else None),
            "owner": u.owner,
        })

    data.sort(key=lambda x: x["eliminado_en"] or "", reverse=True)

    return {"total": len(data), "data": data}

def delete_user_query(db: Session, usuario_id: int, eliminado_por_id: int | None = None):
    """
    Elimina (lógicamente) un usuario:
      1. Busca el usuario por ID
      2. Cambia su estado a 'eliminado'
      3. Crea un registro en UsuarioEliminacionLog
      4. Commit transaccional
    """
    # 1. Obtener usuario
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail=f"Usuario con ID {usuario_id} no encontrado")

    # Si el usuario es admin no eliminar
    if usuario.es_admin == True:
        raise HTTPException(status_code=403, detail="No se puede eliminar un usuario administrador")

    # Si ya estaba eliminado, evitar duplicar
    if usuario.estado == "eliminado":
        raise HTTPException(status_code=400, detail=f"El usuario {usuario_id} ya está eliminado")

    try:
        # 2. Cambiar estado
        usuario.estado = "eliminado"

        # 3. Crear registro de eliminación
        log = UsuarioEliminacionLog(
            usuario_id=usuario.id,
            motivo="",
            eliminado_por_id=eliminado_por_id,
            eliminado_en=datetime.now(),
        )

        # 4. Guardar todo en la misma transacción
        db.add(usuario)
        db.add(log)
        db.commit()
        db.refresh(usuario)
        db.refresh(log)

        return {
            "success": True,
            "message": f"Usuario {usuario_id} eliminado correctamente",
            "usuario": usuario,
            "deleted_user_log": log,
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar usuario: {str(e)}")


# --------------------
# Tabla Transacciones
# --------------------
def get_transactions_by_user_id_query(db: Session, usuario_id: int):
    """
    Devuelve todas las transacciones asociadas a un usuario,
    agregando campos lógicos: tipo_exportar, fecha_ini y fecha_fin.
    """
    transacciones = db.query(Transaccion).filter(Transaccion.usuario_id == usuario_id).all()
    if not transacciones:
        raise HTTPException(status_code=404, detail=f"No existen transacciones para el usuario {usuario_id}")

    processed = []
    for t in transacciones:
        # Copiamos los datos originales del modelo
        trans_dict = {
            "id": t.id,
            "usuario_id": t.usuario_id,
            "archivos": t.archivos,
            "exportado_en": t.exportado_en,
            "imagenes": t.imagenes,
            "var_ghi": t.var_ghi,
            "var_dni": t.var_dni,
            "var_global": t.var_global,
            "creado_en": t.creado_en,
        }

        tipo_exportar = "dias"
        fecha_ini = None
        fecha_fin = None

        # Procesar si existen archivos/fechas
        if t.archivos and len(t.archivos) > 0:
            first_date = t.archivos[0]
            # Si el primer elemento tiene formato "fecha - fecha"
            if " - " in first_date:
                tipo_exportar = "rango"
                partes = [p.strip() for p in first_date.split(" ")]
                fecha_ini, fecha_fin = partes[0], partes[2]
            else:
                tipo_exportar = "dias"

        # Agregamos los campos derivados
        trans_dict.update({
            "tipo_exportar": tipo_exportar,
            "fecha_ini": fecha_ini,
            "fecha_fin": fecha_fin
        })

        processed.append(trans_dict)

    return processed


def save_transaction_query(
    db: Session,
    user_id: int,
    files: list[str],
    images: bool,
    var_ghi: bool,
    var_dni: bool,
    var_global: bool
):
    """
    Guarda una nueva transacción de exportar realizada por un usuario.
    Se deja el campo 'exportado_en' como NULL
    """
    try:
        # Validaciones mínimas
        if not user_id:
            raise HTTPException(status_code=400, detail="Falta 'user_id' para la transacción.")
        if not isinstance(files, list):
            raise HTTPException(status_code=400, detail="'files' debe ser una lista de strings.")

        nueva_transaccion = Transaccion(
            usuario_id=user_id,
            archivos=files,
            imagenes=images,
            var_ghi=var_ghi,
            var_dni=var_dni,
            var_global=var_global,
            exportado_en=None,  # explícitamente NULL
            creado_en=datetime.utcnow()
        )

        db.add(nueva_transaccion)
        db.commit()
        db.refresh(nueva_transaccion)

        return nueva_transaccion

    except HTTPException:
        # Reenviar excepciones HTTP personalizadas
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar la transacción: {str(e)}")

def create_transaccion_query(db: Session, data: dict):
    """
    Crea una nueva transacción.
    `data` debe contener los campos definidos en TransaccionCreate.
    Considera que 'archivos' es una lista y que 'exportado_en' puede ser múltiple.
    """
    try:
        # Validación mínima de campos obligatorios
        if "usuario_id" not in data:
            raise HTTPException(status_code=400, detail="Falta 'usuario_id' en el cuerpo de la solicitud.")

        # Si el campo exportado_en es una lista, la convertimos a string o lista JSON
        exportado_en = data.get("exportado_en")
        if isinstance(exportado_en, list):
            # Ejemplo: convertir lista de timestamps a string (puedes adaptarlo si usas JSON en DB)
            exportado_en = [datetime.fromisoformat(e) if isinstance(e, str) else e for e in exportado_en]

        nueva_transaccion = Transaccion(
            usuario_id=data["usuario_id"],
            archivos=data.get("archivos", []),
            imagenes=data.get("imagenes", False),
            var_ghi=data.get("var_ghi", False),
            var_dni=data.get("var_dni", False),
            var_global=data.get("var_global", False),
            exportado_en=exportado_en,
            creado_en=datetime.now(),
        )

        db.add(nueva_transaccion)
        db.commit()
        db.refresh(nueva_transaccion)

        return nueva_transaccion

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear transacción: {str(e)}")


# --------------------
# Eliminacion Usuarios
# --------------------
def delete_user_permanently_query(usuario_id: int, db: Session = None):
    """
    Elimina completamente al usuario y sus registros asociados de la base de datos.
    """
    try:
        # Buscar usuario con estado 'eliminado'
        usuario = (
            db.query(Usuario)
            .filter(Usuario.id == usuario_id, Usuario.estado == UsuarioEstado.eliminado)
            .first()
        )

        if not usuario:
            raise HTTPException(status_code=404, detail=f"Usuario {usuario_id} no encontrado o no eliminado")

        # Eliminar manualmente todos los registros relacionados
        db.query(UsuarioEliminacionLog).filter(
            (UsuarioEliminacionLog.usuario_id == usuario_id) |
            (UsuarioEliminacionLog.eliminado_por_id == usuario_id)
        ).delete(synchronize_session=False)

        db.query(Transaccion).filter(Transaccion.usuario_id == usuario_id).delete(synchronize_session=False)
        db.query(Solicitud).filter(Solicitud.usuario_id == usuario_id).delete(synchronize_session=False)

        db.expire_all()

        db.query(Usuario).filter(Usuario.id == usuario_id).delete(synchronize_session=False)
        db.commit()

        return {"msg": f"Usuario {usuario_id} eliminado completamente."}

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar usuario {usuario_id}: {str(e)}")

def delete_user_permanently_scheduled(usuario_id: int):
    """
    Elimina completamente al usuario y sus registros asociados de la base de datos.
    (Es llamada automáticamente por el scheduler)
    """
    db: Session = get_sync_session()
    try:
        # Buscar usuario con estado 'eliminado'
        usuario = (
            db.query(Usuario)
            .filter(Usuario.id == usuario_id, Usuario.estado == UsuarioEstado.eliminado)
            .first()
        )

        if not usuario:
            print(f"⚠️ Usuario {usuario_id} no encontrado o no está marcado como eliminado.")
            return

        
        print(f"🧹 Eliminando usuario {usuario_id} y registros asociados...")

        # Eliminar manualmente todos los registros relacionados
        db.query(UsuarioEliminacionLog).filter(
            (UsuarioEliminacionLog.usuario_id == usuario_id) |
            (UsuarioEliminacionLog.eliminado_por_id == usuario_id)
        ).delete(synchronize_session=False)

        db.query(Transaccion).filter(Transaccion.usuario_id == usuario_id).delete(synchronize_session=False)
        db.query(Solicitud).filter(Solicitud.usuario_id == usuario_id).delete(synchronize_session=False)

        # ✅ Importante: refrescar para evitar UPDATEs automáticos
        db.expire_all()

        # Eliminar usuario principal
        db.query(Usuario).filter(Usuario.id == usuario_id).delete(synchronize_session=False)
        db.commit()

        print(f"✅ Usuario {usuario_id} eliminado completamente.")
    except Exception as e:
        db.rollback()
        print(f"❌ Error al eliminar usuario {usuario_id}: {e}")
    finally:
        db.close()

def schedule_user_deletion_query(usuario_id: int):
    """
    Programa la eliminación definitiva del usuario en 30 días.
    """
    scheduler.add_job(
        func=delete_user_permanently_scheduled,
        trigger="date",
        run_date=datetime.utcnow() + timedelta(days=30),
        args=[usuario_id],
        id=f"delete_user_{usuario_id}",
        replace_existing=True
    )

def mark_and_schedule_deletion_query(db: Session, usuario_id: int, eliminado_por_id: int):
    """
    Marca un usuario como eliminado y programa su eliminación definitiva.
    """
    try:
        # Obtenemos el usuario a eliminar
        usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
        if not usuario:
            raise HTTPException(status_code=404, detail=f"Usuario {usuario_id} no encontrado.")
        if usuario.estado == UsuarioEstado.eliminado:
            raise HTTPException(status_code=400, detail=f"Usuario {usuario_id} ya está marcado como eliminado.")

        # Obtenemos el administrador que elimina
        admin = db.query(Usuario).filter(Usuario.id == eliminado_por_id).first()
        if not admin:
            raise HTTPException(status_code=404, detail=f"Administrador {eliminado_por_id} no encontrado.")

        if admin.es_admin == False:
            raise HTTPException(status_code=403, detail="El usuario que quiere eliminar no es un administrador.")
        
        if (admin.es_admin == True and admin.owner == False) and usuario.es_admin == True:
            raise HTTPException(status_code=403, detail="Solo el dueño puede eliminar a un administrador.")

        # Marcar como eliminado
        usuario.estado = UsuarioEstado.eliminado
        usuario.actualizado_en = datetime.utcnow()

        # Crear log
        log = UsuarioEliminacionLog(
            usuario_id=usuario_id,
            eliminado_por_id=eliminado_por_id,
            motivo="",
            eliminado_en=datetime.utcnow(),
        )
        db.add(log)
        db.commit()

        # Agendar eliminación en 30 días
        schedule_user_deletion_query(usuario_id)

        return {
            "usuario_id": usuario_id,
            "estado": "eliminado",
            "eliminacion_programada_en": (datetime.utcnow() + timedelta(days=30)).isoformat(),
            "mensaje": f"Usuario {usuario_id} marcado como eliminado. Eliminación definitiva en 30 días."
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al procesar eliminación: {str(e)}")


# --------------------
# Recuperación de Contraseña
# --------------------

def generate_recovery_code_query(db: Session, email: str):
    """
    Genera un código de recuperación, lo guarda en la BD y lo envía por correo.
    """
    # 1. Buscar usuario
    user = get_user_by_email_query(db, email)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    try:
        # 2. Generar código
        # 6 dígitos numéricos
        code = ''.join(secrets.choice(string.digits) for _ in range(6))
        
        # 3. Hashear código
        # Usamos la misma función de hash que para passwords, o una simple si se prefiere.
        # Dado que es un código temporal, hash_password está bien.
        hashed_code = hash_password(code)

        # 4. Guardar en BD
        # Expiración: 15 minutos (ejemplo)
        expires = datetime.utcnow() + timedelta(minutes=15)
        
        recovery_entry = PasswordRecoveryCode(
            usuario_id=user.id,
            code_hash=hashed_code,
            expires_at=expires,
            used=False
        )
        db.add(recovery_entry)
        db.commit()

        # 5. Enviar correo
        subject = "Código de recuperación de contraseña"
        body = f"""
        <h1>Recuperación de contraseña</h1>
        <p>Tu código de recuperación es: <strong>{code}</strong></p>
        <p>Este código expira en 15 minutos.</p>
        """
        send_mail_query(email, subject, body)

        return True

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al generar código de recuperación: {str(e)}")

def verify_recovery_code_query(db: Session, email: str, code: str, new_password: str):
    """
    Verifica si el código de recuperación es válido y actualiza la contraseña.
    """
    # 1. Buscar usuario
    user = get_user_by_email_query(db, email)
    if not user:
        # Retornamos False o lanzamos excepción genérica para no enumerar
        return False

    # 2. Buscar código válido más reciente
    # Debe coincidir usuario, no estar usado, y no estar expirado
    recovery_entry = (
        db.query(PasswordRecoveryCode)
        .filter(
            PasswordRecoveryCode.usuario_id == user.id,
            PasswordRecoveryCode.used == False,
            PasswordRecoveryCode.expires_at > datetime.utcnow()
        )
        .order_by(PasswordRecoveryCode.created_at.desc())
        .first()
    )

    if not recovery_entry:
        return False

    # 3. Verificar hash del código
    if verify_password(code, recovery_entry.code_hash):
        # Código válido: proceder al cambio de contraseña
        
        # a) Marcar código como usado
        recovery_entry.used = True
        
        # b) Actualizar contraseña
        new_hash = hash_password(new_password)
        user.password_hash = new_hash
        
        # c) Guardar cambios
        db.add(recovery_entry)
        db.add(user)
        db.commit()
        
        return True
    
    return False
