# core/security.py

from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt  # PyJWT, asegura que esté en requirements.txt
from fastapi import HTTPException, status, Depends, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from db.postgres import get_db
from models.user import Usuario

# ---------------------------------------------------------
# Configuración de hashing de contraseñas
# ---------------------------------------------------------

# Passlib se encarga de manejar hashing seguro (bcrypt)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------------------------------------------------
# Clave secreta y parámetros del JWT
#
# ⚠ IMPORTANTE: En producción esto NO debe estar hardcodeado.
# Debe moverse a variables de entorno → usar core.config.
# ---------------------------------------------------------

SECRET_KEY = "a9c4e24d5b0480f13be6eec52e8120e92a9f715bba"  # reemplazar en producción
ALGORITHM = "HS256"                                     # algoritmo de firma JWT
ACCESS_TOKEN_EXPIRE_MINUTES = 60                        # duración del token (1 hora)

# Indica a FastAPI que se usará "Bearer <token>" en los headers
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/users/token", auto_error=False)

# ---------------------------------------------------------
# Funciones de hashing
# ---------------------------------------------------------

def hash_password(password: str) -> str:
    """
    Convierte una contraseña en texto plano a un hash seguro usando bcrypt.

    Retorna un string como:
    $2b$12$2c9NfBNH0x0aYg1vUpYQDuvT9... (hash bcrypt)
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifica si una contraseña en texto plano coincide
    con un hash bcrypt almacenado en la base de datos.
    """
    return pwd_context.verify(plain_password, hashed_password)

# ---------------------------------------------------------
# Creación de tokens JWT
# ---------------------------------------------------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    Crea y firma un token JWT.

    Parámetros:
    - data: diccionario con datos a incluir en el token (p.ej. {"sub": user_id})
    - expires_delta: tiempo de expiración opcional. Si no se pasa, usa el default (1 hora).

    El payload final incluye:
    {
        "sub": <user_id>,
        "exp": <fecha de expiración en UTC>
    }
    """
    to_encode = data.copy()

    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    to_encode.update({"exp": int(expire.timestamp())})

    # Firma el token con SECRET_KEY y algoritmo HS256
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# ---------------------------------------------------------
# Obtención del usuario autenticado desde el token
# ---------------------------------------------------------

def get_current_user(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme),
    token_query: Optional[str] = Query(None, alias="token"),
) -> Usuario:
    """
    Valida el token Bearer enviado en Authorization y devuelve el usuario autenticado.

    Flujo:
    ---------------------------------------------------------
    1. Extrae el token del header "Authorization: Bearer <token>".
    2. Intenta decodificarlo usando SECRET_KEY.
       - Si falla (firma inválida, expirado, corrupto), lanza 401.
    3. Obtiene el "sub" (subject) del token → debe ser el user_id.
    4. Busca al usuario en la base de datos.
    5. Valida:
       - Que el usuario exista,
       - Que NO esté eliminado.
    6. Si todo es válido → retorna el Usuario autenticado.

    Excepciones:
    ---------------------------------------------------------
    - Si el token es inválido → HTTP 401
    - Si expiró → HTTP 401
    - Si el usuario no existe → HTTP 401
    - Si el usuario está en estado "eliminado" → HTTP 401
    """

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Resolver cual token usar
        final_token = token or token_query
        if not final_token:
             raise credentials_exception

        # Decodificar token
        payload = jwt.decode(final_token, SECRET_KEY, algorithms=[ALGORITHM])

        # Extraer ID de usuario del campo "sub"
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception

    except jwt.PyJWTError:
        # Error en la decodificación (token inválido, firma incorrecta, expirado)
        raise credentials_exception

    # Buscar usuario en DB
    user = db.query(Usuario).filter(Usuario.id == user_id).first()

    if not user or user.estado == "eliminado":
        """
        Si el usuario:
        - fue borrado,
        - está eliminado,
        - o no existe,
        → tratamos esto como token inválido.
        """
        raise credentials_exception

    return user
