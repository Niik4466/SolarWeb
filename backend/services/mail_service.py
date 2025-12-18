import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from core.config import settings
from fastapi import HTTPException, status

def send_mail_query(send_to: str, subject: str, body: str):
    """
    Envía un correo electrónico a través del servidor SMTP de Gmail configurado.

    Construye un mensaje MIME multipart (HTML) y lo envía utilizando las credenciales
    del entorno.

    Args:
        send_to (str): Dirección de correo del destinatario.
        subject (str): Asunto del correo.
        body (str): Contenido HTML del mensaje.

    Returns:
        dict: Mensaje de éxito `{"message": ...}`.

    Raises:
        HTTPException(502): Si ocurre un error específico del protocolo SMTP.
        HTTPException(500): Si ocurre cualquier otro error inesperado.
    """
    try:
        # Crear el mensaje
        msg = MIMEMultipart()
        msg["From"] = settings.GMAIL_USER
        msg["To"] = send_to
        msg["Subject"] = subject

        # Asumimos que el cuerpo es HTML, similar a la implementación anterior
        msg.attach(MIMEText(body, "html"))

        # Conectar al servidor SMTP de Gmail
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()  # iniciar TLS
            server.login(settings.GMAIL_USER, settings.GMAIL_API_KEY)
            server.send_message(msg)

        return {"message": "Email enviado correctamente"}

    except smtplib.SMTPException as e:
        # Error propio de SMTP
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error SMTP de Gmail: {str(e)}",
        )

    except Exception as e:
        # Cualquier otro error inesperado (ej. red, credenciales)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al enviar el correo: {str(e)}",
        )

