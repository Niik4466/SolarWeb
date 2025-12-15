# backend/api/v1/mail.py
from fastapi import APIRouter, Query, HTTPException, Depends
from services.mail_service import send_mail_query
from core.security import get_current_user
from models.user import Usuario

router = APIRouter(prefix="/mail", tags=["mail"])

@router.get("/send_mail")
def send_mail(
    to: str = Query(..., description="ej: example@gmail.com"),
    subject: str = Query(..., description="Asunto del correo"),
    body: str = Query(..., description="Cuerpo del correo"),
    current_user: Usuario = Depends(get_current_user),
):
    """
    Endpoint que envía un correo. Devuelve información del envío o error detallado.
    """
    try:
        result = send_mail_query(to, subject, body)
        return {
            "status": "ok",
            "message": f"Correo enviado a {to}",
        }
    except HTTPException as e:
        # Repropaga el error HTTP personalizado
        raise e
    except Exception as e:
        # Cualquier otro error no controlado
        raise HTTPException(status_code=500, detail=f"Error inesperado: {e}")

