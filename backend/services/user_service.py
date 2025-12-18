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
    """
    Obtiene la lista completa de usuarios registrados en el sistema.

    Args:
        db (Session): Sesión de base de datos.
    
    Returns:
        List[Usuario]: Lista de objetos Usuario.
    """
    return db.query(Usuario).all()

def get_admin_emails_query(db: Session) -> List[str]:
    """
    Recupera los correos electrónicos de todos los administradores activos.

    Útil para envío de notificaciones del sistema.

    Args:
        db (Session): Sesión de base de datos.

    Returns:
        List[str]: Lista de direcciones de correo electrónico.
    """
    admins = db.query(Usuario.correo).filter(Usuario.es_admin == True).all()
    # admins es una lista de tuplas [('email1',), ('email2',)]
    return [email[0] for email in admins]

def obtain_user_by_id_query(db: Session, usuario_id: int):
    """
    Busca un usuario por su ID único.

    Args:
        db (Session): Sesión de base de datos.
        usuario_id (int): ID del usuario.

    Returns:
        Usuario | None: El objeto Usuario si existe, None en caso contrario.
    """
    return db.query(Usuario).filter(Usuario.id == usuario_id).first()



def get_user_by_email_query(db: Session, email: str) -> Usuario | None:
    """
    Busca un usuario por su correo electrónico (case-insensitive).

    Normaliza el correo a minúsculas antes de la búsqueda.

    Args:
        db (Session): Sesión de base de datos.
        email (str): Correo a buscar.

    Returns:
        Usuario | None: Objeto Usuario si existe.
    """
    email_normalized = email.strip().lower()

    return (
        db.query(Usuario)
        .filter(func.lower(Usuario.correo) == email_normalized)
        .first()
    )


def update_user_status_query(db: Session, status: str, user: Usuario):
    """
    Actualiza el estado de un usuario (ej. aprobado, rechazado).

    Args:
        db (Session): Sesión de base de datos.
        status (str): Nuevo estado ("pendiente", "aprobado", "eliminado").
        user (Usuario): Objeto usuario a modificar.

    Returns:
        Usuario: Usuario actualizado.

    Raises:
        HTTPException(400): Si el estado no es válido.
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
    Modifica los privilegios de administrador de un usuario.

    Args:
        db (Session): Sesión de base de datos.
        admin (bool): True para conceder permisos de administrador, False para revocar.
        user (Usuario): Usuario a modificar.

    Returns:
        Usuario: Usuario actualizado.
    """
    user.es_admin = bool(admin)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def approve_user_query(db: Session, user: Usuario, admin: bool):
    """
    Proceso de aprobación de un usuario pendiente.

    Cambia el estado a 'aprobado', asigna el rol inicial y registra la fecha de aprobación.

    Args:
        db (Session): Sesión de base de datos.
        user (Usuario): Usuario a aprobar.
        admin (bool): Rol inicial (True=Admin, False=Usuario regular).

    Returns:
        Usuario: Usuario aprobado.
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
    Valida las credenciales y el estado de un usuario para permitir el ingreso.

    Args:
        db (Session): Sesión de base de datos.
        email (str): Correo electrónico.
        password (str): Contraseña en texto plano.

    Returns:
        dict: Resultado del login (success: bool, message: str, user_data...).
              Incluye estado de aprobación y roles si es exitoso.
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
    Filtra usuarios por su estado actual.

    Args:
        db (Session): Sesión de base de datos.
        status (str): Estado a filtrar ("pendiente", "aprobado", "eliminado").

    Returns:
        List[Usuario]: Lista de usuarios que coinciden.
    """
    allowed_status = ["pendiente", "aprobado", "eliminado"]
    if status not in allowed_status:
        raise HTTPException(status_code=400, detail=f"Estado invalido: {status}")

    users = db.query(Usuario).filter(Usuario.estado == status).all()
    return users

from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException

def create_user_query(db: Session, usuario_data: dict, justificacion: str):
    """
    Crea un nuevo usuario o reactiva uno eliminado.

    Si el correo ya existe:
    - Si está aprobado/pendiente -> Error 409.
    - Si está eliminado -> Reactiva la cuenta pasándola a 'pendiente' y actualizando datos.
    
    Si no existe:
    - Crea un nuevo registro en estado 'pendiente'.

    En ambos casos crea una 'Solicitud' de ingreso.

    Args:
        db (Session): Sesión de base de datos.
        usuario_data (dict): Datos del usuario (nombre, apellido, correo, password).
        justificacion (str): Motivo de la solicitud de cuenta.

    Returns:
        Usuario: El usuario creado o reactivado.

    Raises:
        HTTPException(409): Si el usuario ya existe y está activo.
        HTTPException(500): Error interno.
    """
    email = usuario_data["correo"].strip().lower()

    user = get_user_by_email_query(db, email)

    # ✅ ya existe y NO está eliminado
    if user and user.estado in ("aprobado", "pendiente"):
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe una cuenta con este correo."
        )

    # ✅ existe pero está eliminado: reactivar
    if user and user.estado == "eliminado":
        try:
            user.estado = "pendiente"
            user.actualizado_en = datetime.utcnow()
            user.aprobado_en = None
            user.password_hash = hash_password(usuario_data["password"])
            user.nombre = usuario_data["nombre"]
            user.apellido = usuario_data.get("apellido")

            db.add(user)
            db.flush()

            solicitud = Solicitud(usuario_id=user.id, justificacion=justificacion)
            db.add(solicitud)

            db.commit()
            db.refresh(user)
            return user
        except Exception as e:
            db.rollback()
            raise HTTPException(500, detail=f"Error al reactivar usuario: {str(e)}")

    # ✅ no existe: crear normal
    try:
        nuevo_usuario = Usuario(
            correo=email,
            nombre=usuario_data["nombre"],
            apellido=usuario_data.get("apellido"),
            password_hash=hash_password(usuario_data["password"]),
            es_admin=False,
            estado="pendiente",
        )
        db.add(nuevo_usuario)
        db.flush()

        solicitud = Solicitud(usuario_id=nuevo_usuario.id, justificacion=justificacion)
        db.add(solicitud)

        db.commit()
        db.refresh(nuevo_usuario)
        return nuevo_usuario

    except IntegrityError:
        db.rollback()
        raise HTTPException(409, detail="Ya existe una solicitud o cuenta registrada con este correo.")


def get_pending_users_with_last_solicitud_query(db: Session):
    """
    Obtiene usuarios pendientes incluyendo el detalle de su solicitud de ingreso.

    Recupera los usuarios en estado 'pendiente' y hace un join manual con la tabla 
    de Solicitudes para obtener la justificación más reciente.

    Args:
        db (Session): Sesión de base de datos.

    Returns:
        dict: Estructura `{"total": int, "data": list}` con info combinada de usuario y solicitud.
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
    Obtiene lisado de usuarios aprobados formateado para el frontend.

    Incluye fechas de aprobación.

    Args:
        db (Session): Sesión de base de datos.

    Returns:
        dict: Estructura `{"total": int, "data": list}`.
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

def get_deleted_users_query(db: Session, admin: Usuario):
    """
    Obtiene listado de usuarios eliminados y cuándo fueron eliminados.

    Si el solicitante no es Owner, se ocultan los usuarios eliminados que eran admins.
    Busca en el log de eliminación (`UsuarioEliminacionLog`) la fecha del evento.

    Args:
        db (Session): Sesión de BD.
        admin (Usuario): Admin que realiza la consulta (para aplicar filtros de visibilidad).

    Returns:
        dict: Estructura `{"total": int, "data": list}` ordenada por fecha de eliminación descendente.
    """
    # Consultar todos los usuarios eliminados
    usuarios_eliminados = db.query(Usuario).filter(Usuario.estado == UsuarioEstado.eliminado).all()
    if not usuarios_eliminados:
        return {"total": 0, "data": []}

    # Filtrar administradores si el que elimina tiene rol administrador
    if admin.owner == False:
        usuarios_eliminados = [u for u in usuarios_eliminados if u.es_admin == False]

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
            "es_admin": u.es_admin,
            "creado_en": u.creado_en.isoformat() if u.creado_en else None,
        })


    data.sort(key=lambda x: x["eliminado_en"] or "", reverse=True)

    return {"total": len(data), "data": data}

def delete_user_query(db: Session, usuario_id: int, eliminado_por_id: int | None = None):
    """
    Ejecuta un borrado lógico (Soft Delete) de un usuario.

    Cambia el estado a 'eliminado' y registra el evento en el log. No borra físicamente.

    Args:
        db (Session): Sesión de BD.
        usuario_id (int): ID del usuario a "borrar".
        eliminado_por_id (int, optional): ID del admin que ejecuta la acción.

    Returns:
        dict: Resultado de la operación con el usuario actualizado.

    Raises:
        HTTPException(403): Si se intenta eliminar un admin sin permisos suficientes.
        HTTPException(400): Si ya estaba eliminado.
        HTTPException(500): Error interno.
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
    Obtiene el historial de transacciones (exportaciones) de un usuario.

    Procesa los datos crudos para inferir metadata como el tipo de rango (días vs rango)
    analizando el nombre de los archivos generados.

    Args:
        db (Session): Sesión de BD.
        usuario_id (int): ID del usuario.

    Returns:
        list[dict]: Lista de transacciones procesada con campos adicionales (fecha_ini, fecha_fin).
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
    Registra una transacción completada exitosamente (exportación síncrona).

    Args:
        db (Session): Sesión de BD.
        user_id (int): ID del usuario.
        files (list[str]): Lista de nombres de archivos generados.
        images (bool): Si incluyó imágenes.
        var_... (bool): Variables incluidas.

    Returns:
        Transaccion: Objeto creado.
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
            estado=TransaccionEstado.completado,
            imagenes=images,
            var_ghi=var_ghi,
            var_dni=var_dni,
            var_global=var_global,
            exportado_en=datetime.utcnow(),
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

def create_transaction_entry_query(db: Session, user_id: int, var_ghi: bool, var_dni: bool, var_global: bool, imagenes: bool) -> int:
    """
    Crea un registro inicial de transacción en estado 'pendiente' (para Async).

    Returns:
        int: ID de la transacción creada.
    """
    try:
        nueva_transaccion = Transaccion(
            usuario_id=user_id,
            estado=TransaccionEstado.pendiente,
            var_ghi=var_ghi,
            var_dni=var_dni,
            var_global=var_global,
            imagenes=imagenes,
            exportado_en=None,
            creado_en=datetime.utcnow()
        )
        db.add(nueva_transaccion)
        db.commit()
        db.refresh(nueva_transaccion)
        return nueva_transaccion.id
    except Exception as e:
        db.rollback()
        raise e

def update_transaction_status_query(db: Session, t_id: int, status: str, files: List[str] = None):
    """
    Actualiza el estado de una transacción existente (ej. de pendiente a completado).

    Args:
        db (Session): Sesión de BD.
        t_id (int): ID de la transacción.
        status (str): Nuevo estado.
        files (List[str], optional): Archivos generados para adjuntar al registro.
    """
    try:
        # Recuperar transacción
        t = db.query(Transaccion).filter(Transaccion.id == t_id).first()
        if not t:
            return # O lanzar error
        
        # Mapear string a Enum si es necesario, o usar string directo si Enum acepta
        # status viene como "listo", "error", etc.
        t.estado = TransaccionEstado(status) if status in TransaccionEstado._value2member_map_ else t.estado
        
        if files:
             t.archivos = files
             t.exportado_en = datetime.utcnow()
        
        db.add(t)
        db.commit()
    except Exception as e:
        db.rollback()
        # Log error?
        pass

def create_transaccion_query(db: Session, data: dict):
    """
    Crea una transacción genérica desde un diccionario de datos.

    Args:
        db (Session): Sesión de BD.
        data (dict): Diccionario con campos de TransaccionCreate (usuario_id, archivos, etc).

    Returns:
        Transaccion: La transacción creada.
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
    Ejecuta un Hard Delete: elimina físicamente al usuario y todos sus datos relacionados.

    Borra transacciones, logs, solicitudes y finalmente el usuario.

    Args:
        usuario_id (int): ID del usuario.
        db (Session): Sesión de BD.

    Returns:
        dict: Mensaje de confirmación.
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
    Función callback para el Scheduler: ejecuta la eliminación física de un usuario.

    Se ejecuta automáticamente en segundo plano cuando se cumple el plazo de retención.
    Crea su propia sesión de BD.

    Args:
        usuario_id (int): ID del usuario a eliminar.
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
    Programa un Job en el scheduler para eliminar un usuario en 30 días.

    Args:
        usuario_id (int): ID del usuario.
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
    Orquesta el flujo de eliminación programada.

    1. Marca al usuario como eliminado (soft delete).
    2. Crea log de eliminación.
    3. Programa la eliminación definitiva (hard delete) usando `schedule_user_deletion_query`.

    Args:
        db (Session): Sesión de BD.
        usuario_id (int): Usuario afectado.
        eliminado_por_id (int): Admin que ejecuta.

    Returns:
        dict: Metadata de la operación.
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
    Inicia el flujo de recuperación de contraseña.

    - Busca usuario.
    - Genera código numérico aleatorio.
    - Guarda hash del código con expiración.
    - Envía correo con el código.

    Args:
        db (Session): Sesión de DB.
        email (str): Email del usuario.
    """
    # 1. Buscar usuario
    user = get_user_by_email_query(db, email)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    try:
        # 2. Generar código (6 dígitos)
        code = ''.join(secrets.choice(string.digits) for _ in range(6))

        # 3. Hashear código
        hashed_code = hash_password(code)

        # 4. Guardar en BD (expira en 15 min)
        expires = datetime.utcnow() + timedelta(minutes=15)

        recovery_entry = PasswordRecoveryCode(
            usuario_id=user.id,
            code_hash=hashed_code,
            expires_at=expires,
            used=False
        )
        db.add(recovery_entry)
        db.commit()

        # 5. Enviar correo (HTML bonito)
        subject = "SolarWeb – Código de recuperación de contraseña"
        body = f"""<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>Código de recuperación de contraseña</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin:0;padding:0;background-color:#0f172a;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#0f172a;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background-color:#0b1120;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.35);">
            
            <!-- Header -->
            <tr>
              <td style="padding:24px 32px;background:linear-gradient(135deg,#0b1120,#1d4ed8);color:#e5e7eb;">
                <h1 style="margin:0;font-size:22px;font-weight:600;">
                  SolarWeb
                </h1>
                <p style="margin:4px 0 0;font-size:13px;opacity:0.85;">
                  Universidad Austral de Chile · Campus Miraflores
                </p>
              </td>
            </tr>

            <!-- Cuerpo -->
            <tr>
              <td style="padding:24px 32px;background-color:#020617;color:#e5e7eb;">
                <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;">
                  Recuperación de contraseña
                </h2>

                <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">
                  Has solicitado recuperar tu contraseña de acceso a <strong>SolarWeb</strong>.
                </p>

                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;">
                  Utiliza el siguiente código para completar el proceso:
                </p>

                <p style="margin:16px 0 16px;font-size:26px;font-weight:700;letter-spacing:0.25em;text-align:center;color:#fbbf24;">
                  <span style="display:inline-block;padding:10px 18px;border-radius:999px;background-color:#111827;border:1px solid #fbbf24;">
                    {code}
                  </span>
                </p>

                <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#d1d5db;">
                  Este código es válido por <strong>15 minutos</strong>. Si no lo utilizas en ese tiempo, deberás solicitar uno nuevo.
                </p>

                <p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">
                  Si tú no solicitaste este cambio, puedes ignorar este correo. Tu contraseña actual seguirá siendo válida.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:16px 24px;background-color:#020617;border-top:1px solid rgba(148,163,184,.35);">
                <p style="margin:0 0 4px;font-size:11px;color:#6b7280;">
                  Este mensaje fue generado automáticamente por la plataforma <strong>SolarWeb</strong>.
                </p>
                <p style="margin:0;font-size:11px;color:#4b5563;">
                  Si necesitas ayuda adicional, contacta al equipo administrador por los canales oficiales.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""

        send_mail_query(email, subject, body)
        return True

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al generar código de recuperación: {str(e)}")

def verify_recovery_code_query(db: Session, email: str, code: str, new_password: str):
    """
    Verifica un código de recuperación y cambia la contraseña.

    Valida que el código exista para el usuario, no haya expirado y no haya sido usado.

    Args:
        db (Session): Sesión de BD.
        email (str): Email del usuario.
        code (str): Código numérico ingresado.
        new_password (str): Nueva contraseña.

    Returns:
        bool: True si tuvo éxito, False si falló la validación.
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
