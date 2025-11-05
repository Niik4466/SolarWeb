# backend/services/mail_service.py
import resend
from core.config import settings
from fastapi import HTTPException, status

def send_mail_query(send_to: str, subject: str, body: str):
    """
    Envía un correo electrónico mediante Resend.
    Lanza una HTTPException si ocurre algún error en el proceso.
    """
    params: resend.Emails.SendParams = {
        "from": settings.RESEND_FROM,
        "to": [send_to],
        "subject": subject,
        "html": body,
    }

    try:
        email = resend.Emails.send(params)

        # Resend devuelve un diccionario con información del envío
        # Ejemplo: {'id': 'abc123', 'from': ..., 'to': [...], ...}
        if not email or "id" not in email:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="El servicio de correo no devolvió una respuesta válida.",
            )

        return email

    except resend.errors.ResendError as e:
        # Error propio de la librería Resend
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error de Resend: {str(e)}",
        )

    except Exception as e:
        # Cualquier otro error inesperado (ej. red, credenciales)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al enviar el correo: {str(e)}",
        )

