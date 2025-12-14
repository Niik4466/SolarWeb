# backend/services/mail_templates/export_ready_template.py
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

@dataclass
class EmailOut:
    subject: str
    bodyText: str
    bodyHtml: str

@dataclass
class ExportReadyCopy:
    subject: str
    titulo: str
    badgeText: str
    badgeColor: str
    introParrafo: str
    detalleParrafo: str
    bullets: list[str]
    notaFinal: str
    email: str
    requested_at: str
    expires_in: str
    download_url: str
    file_name: Optional[str] = None

def _build_copy_export_ready(
    *,
    email: str,
    download_url: str,
    file_name: Optional[str] = None,
    requested_at: Optional[datetime] = None,
    expires_in: str = "24 horas",
) -> ExportReadyCopy:
    req_str = (requested_at or datetime.now()).strftime("%d-%m-%Y %H:%M")

    return ExportReadyCopy(
        subject="SolarWeb – Tu exportación está lista",
        titulo="Tu exportación solicitada está lista",
        badgeText="LISTA",
        badgeColor="#22c55e",
        introParrafo="Te avisamos que la exportación que solicitaste ya se generó correctamente.",
        detalleParrafo="Puedes descargar tu archivo en el siguiente enlace:",
        bullets=[
            f"El enlace expirará en {expires_in}.",
            "Si el enlace no funciona, copia y pega la URL en tu navegador.",
            "Por seguridad, no compartas este enlace con terceros.",
        ],
        notaFinal="Si no reconoces esta solicitud o tienes problemas para descargar, contáctanos para revisar tu caso.",
        email=email,
        requested_at=req_str,
        expires_in=expires_in,
        download_url=download_url,
        file_name=file_name,
    )

def _build_body_text(copy: ExportReadyCopy) -> str:
    file_line = f"\nArchivo: {copy.file_name}\n" if copy.file_name else "\n"
    return (
        f"Hola,\n\n"
        f"{copy.titulo}\n\n"
        f"{copy.introParrafo}\n"
        f"{copy.detalleParrafo}\n"
        f"{copy.download_url}\n"
        f"{file_line}"
        f"- {chr(10).join(copy.bullets).replace(chr(10), chr(10) + '- ')}\n\n"
        f"Solicitud: {copy.requested_at}\n\n"
        f"{copy.notaFinal}\n\n"
        f"Saludos,\n"
        f"Equipo SolarWeb"
    )

def _build_body_html(copy: ExportReadyCopy) -> str:
    file_row = ""
    if copy.file_name:
        file_row = f"""
          <tr>
            <td style="padding:10px 12px; border-radius:10px; background-color:rgba(148,163,184,.10); border:1px solid rgba(148,163,184,.25);">
              <div style="font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:.08em; margin-bottom:6px;">Archivo</div>
              <div style="font-size:13px; color:#e5e7eb; word-break:break-all;">{copy.file_name}</div>
            </td>
          </tr>
        """

    bullets_html = "".join([f"<li>{b}</li>" for b in copy.bullets])

    return f"""<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>{copy.subject}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>

  <body style="margin:0; padding:0; background-color:#0f172a; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#0f172a; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                 style="max-width:600px; background-color:#0b1120; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,.35);">

            <!-- Header -->
            <tr>
              <td style="padding:24px 32px; background:linear-gradient(135deg,#0b1120,#1d4ed8); color:#e5e7eb;">
                <h1 style="margin:0; font-size:22px; font-weight:600;">SolarWeb</h1>
                <p style="margin:4px 0 0; font-size:13px; opacity:0.85;">
                  Universidad Austral de Chile · Campus Miraflores
                </p>
              </td>
            </tr>

            <!-- Cuerpo -->
            <tr>
              <td style="padding:24px 32px; background-color:#020617; color:#e5e7eb;">
                <p style="margin:0 0 16px; font-size:15px;">
                  Hola,
                </p>

                <h2 style="margin:0 0 8px; font-size:18px; font-weight:600;">
                  {copy.titulo}
                </h2>

                <span style="display:inline-block; margin:0 0 16px; padding:4px 10px; border-radius:999px;
                             font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase;
                             background-color:rgba(15,23,42,0.9); border:1px solid {copy.badgeColor}; color:{copy.badgeColor};">
                  {copy.badgeText}
                </span>

                <p style="margin:0 0 12px; font-size:14px; line-height:1.6;">
                  {copy.introParrafo}
                </p>

                <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">
                  {copy.detalleParrafo}
                </p>

                <!-- Botón descarga -->
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
                  <tr>
                    <td align="left">
                      <a href="{copy.download_url}"
                         style="display:inline-block; padding:11px 18px; border-radius:999px;
                                background:linear-gradient(135deg,#1d4ed8,#38bdf8);
                                color:#60a5fa; text-decoration:none; font-size:13px; font-weight:700;">
                        Descargar ZIP
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- URL fallback -->
                <div style="padding:12px; border-radius:10px; background-color:rgba(148,163,184,.10);
                            border:1px solid rgba(148,163,184,.25); margin-bottom:16px;">
                  <div style="font-size:12px; color:#9ca3af; text-transform:uppercase; letter-spacing:.08em; margin-bottom:6px;">
                    Enlace de descarga
                  </div>
                  <div style="font-size:13px; color:#e5e7eb; word-break:break-all;">
                    <a href="{copy.download_url}" style="color:#60a5fa; text-decoration:none;">{copy.download_url}</a>
                  </div>
                </div>

                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; margin:0 0 12px;">
                  {file_row}
                </table>

                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 8px;">
                  <tr>
                    <td style="font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:#9ca3af;">
                      Información importante
                    </td>
                  </tr>
                </table>

                <ul style="margin:4px 0 14px 18px; padding:0; font-size:13px; line-height:1.7; color:#d1d5db;">
                  {bullets_html}
                </ul>

                <div style="margin:0 0 18px; font-size:12px; color:#9ca3af;">
                  Solicitud: <strong style="color:#e5e7eb;">{copy.requested_at}</strong> · Expira en <strong style="color:#e5e7eb;">{copy.expires_in}</strong>
                </div>

                <p style="margin:0 0 20px; font-size:14px; line-height:1.6;">
                  {copy.notaFinal}
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 4px;">
                  <tr>
                    <td align="left">
                      <a href="mailto:solarwebuach@gmail.com"
                         style="display:inline-block; padding:10px 18px; border-radius:999px;
                                background:linear-gradient(135deg,#1d4ed8,#38bdf8);
                                color:#60a5fa; text-decoration:none; font-size:13px; font-weight:600;">
                        Contactar al equipo SolarWeb
                      </a>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:16px 24px; background-color:#020617; border-top:1px solid rgba(148,163,184,.35);">
                <p style="margin:0 0 4px; font-size:11px; color:#6b7280;">
                  Este mensaje fue generado automáticamente por la plataforma <strong>SolarWeb</strong>.
                </p>
                <p style="margin:0; font-size:11px; color:#4b5563;">
                  Por favor, no respondas directamente a este correo. Si necesitas ayuda, utiliza los canales oficiales del proyecto.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""

def get_export_ready_email(
    *,
    email: str,
    download_url: str,
    file_name: Optional[str] = None,
    requested_at: Optional[datetime] = None,
    expires_in: str = "24 horas",
) -> EmailOut:
    copy = _build_copy_export_ready(
        email=email,
        download_url=download_url,
        file_name=file_name,
        requested_at=requested_at,
        expires_in=expires_in,
    )
    return EmailOut(
        subject=copy.subject,
        bodyText=_build_body_text(copy),
        bodyHtml=_build_body_html(copy),
    )
