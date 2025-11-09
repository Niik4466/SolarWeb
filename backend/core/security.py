# core/security.py
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt  # PyJWT, asegúrate de tenerlo en requirements
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from db.postgres import get_db
from models.user import Usuario

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# idealmente lo sacas de core.config
SECRET_KEY = "a9c4e24d5b0480f13be6eec52e8120e92a9f715bba" # camiar esto en producción, usar variable de entorno
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # 1 hora

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="users/log-in")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme),
) -> Usuario:
    """
    Decodifica el token, busca el usuario en la DB y se asegura que siga existiendo
    y no esté eliminado.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user or user.estado == "eliminado":
        # aquí haces la validación que tú decías: si ya no existe o está eliminado → 401
        raise credentials_exception
    return user
