// src/app/services/mail-templates/estado-cuenta.ts

export type EstadoCuenta = 'desactivada' | 'reactivada' | 'aprobada' | 'rechazada';

export interface UsuarioMail {
  nombre: string;
  correo: string;
  rol?: 'admin' | 'user'; // solo se usa para estado "aprobada"
}

export interface EmailEstadoCuenta {
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

export function getEstadoCuentaEmail(
  estado: EstadoCuenta,
  u: UsuarioMail
): EmailEstadoCuenta {
  const base = buildCopyPorEstado(estado, u);
  return {
    subject: base.subject,
    bodyText: buildBodyText(base),
    bodyHtml: buildBodyHtml(base),
  };
}

// ----------------------
// Textos por estado
// ----------------------

type CopyBase = {
  subject: string;
  tituloEstado: string;
  badgeText: string;
  badgeColor: string;
  introParrafo: string;
  detalleParrafo: string;
  bullets: string[];
  notaFinal: string;
  usuarioNombre: string;
};

function buildCopyPorEstado(estado: EstadoCuenta, u: UsuarioMail): CopyBase {
  const base = {
    usuarioNombre: u.nombre,
  };

  // -------- DESACTIVADA --------
  if (estado === 'desactivada') {
    return {
      ...base,
      subject: 'SolarWeb – Cuenta desactivada',
      tituloEstado: 'Tu cuenta ha sido desactivada',
      badgeText: 'DESACTIVADA',
      badgeColor: '#f97316',
      introParrafo:
        'Te informamos que tu cuenta en SolarWeb ha sido desactivada por un administrador.',
      detalleParrafo: `A partir de ahora ya no podrás acceder a la plataforma con el correo ${u.correo}.`,
      bullets: [
        'Tu historial de exportaciones puede permanecer asociado internamente a tu usuario.',
        'Si corresponde, esta acción puede ser revisada por el equipo administrador.',
      ],
      notaFinal:
        'Si crees que se trata de un error o necesitas más información, contáctanos para revisar tu caso.',
    };
  }

  // -------- REACTIVADA --------
  if (estado === 'reactivada') {
    return {
      ...base,
      subject: 'SolarWeb – Cuenta reactivada',
      tituloEstado: '¡Tu cuenta ha sido reactivada!',
      badgeText: 'REACTIVADA',
      badgeColor: '#22c55e',
      introParrafo:
        'Te contamos que tu cuenta en SolarWeb ha sido reactivada correctamente.',
      detalleParrafo: `Ahora puedes volver a acceder a la plataforma utilizando el correo ${u.correo}.`,
      bullets: [
        'Tus permisos vuelven a estar activos de acuerdo al perfil asignado.',
        'Puedes retomar el uso de las herramientas de visualización y exportación normalmente.',
      ],
      notaFinal:
        'Si tienes problemas para iniciar sesión, por favor avísanos para poder ayudarte.',
    };
  }

  // -------- APROBADA (desde solicitud) --------
  if (estado === 'aprobada') {
    const esAdmin = u.rol === 'admin';

    return {
      ...base,
      subject: 'SolarWeb – Solicitud aprobada',
      tituloEstado: 'Tu solicitud de acceso ha sido aprobada',
      badgeText: 'APROBADA',
      badgeColor: '#22c55e',
      introParrafo:
        'Te contamos que tu solicitud de acceso a SolarWeb ha sido aprobada correctamente.',
      detalleParrafo: `Desde ahora puedes ingresar a la plataforma utilizando el correo ${u.correo}.`,
      bullets: [
        esAdmin
          ? 'Se te ha asignado el rol de administrador, con acceso ampliado a la gestión de usuarios y datos.'
          : 'Se te ha asignado el rol de usuario estándar, con acceso a la visualización y exportación de datos.',
        'Recuerda mantener la confidencialidad de tus credenciales y usar la plataforma de acuerdo a las políticas del proyecto.',
      ],
      notaFinal:
        'Si tienes dudas sobre tu acceso o el uso de la plataforma, por favor contáctanos.',
    };
  }

  // -------- RECHAZADA (desde solicitud) --------
  return {
    ...base,
    subject: 'SolarWeb – Solicitud rechazada',
    tituloEstado: 'Tu solicitud de acceso ha sido rechazada',
    badgeText: 'RECHAZADA',
    badgeColor: '#ef4444',
    introParrafo:
      'Tras revisar tu solicitud de acceso a SolarWeb, esta fue rechazada por el equipo administrador.',
    detalleParrafo: `La cuenta asociada al correo ${u.correo} no ha sido activada en la plataforma.`,
    bullets: [
      'Es posible que falte información o que tu perfil no cumpla con los criterios definidos para el proyecto.',
    ],
    notaFinal:
      'Si necesitas más detalles o quieres volver a solicitar acceso, contáctanos a través de los canales oficiales.',
  };
}

// ----------------------
// Versión texto plano
// ----------------------

function buildBodyText(copy: CopyBase): string {
  return `Hola ${copy.usuarioNombre},

${copy.tituloEstado}

${copy.introParrafo}
${copy.detalleParrafo}

- ${copy.bullets.join('\n- ')}

${copy.notaFinal}

Saludos,
Equipo SolarWeb`;
}

// ----------------------
// HTML bonito reutilizable
// ----------------------

function buildBodyHtml(copy: CopyBase): string {
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>${copy.subject}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0; padding:0; background-color:#0f172a; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#0f172a; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px; background-color:#0b1120; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,.35);">
            
            <!-- Header -->
            <tr>
              <td style="padding:24px 32px; background:linear-gradient(135deg,#0b1120,#1d4ed8); color:#e5e7eb;">
                <h1 style="margin:0; font-size:22px; font-weight:600;">
                  SolarWeb
                </h1>
                <p style="margin:4px 0 0; font-size:13px; opacity:0.85;">
                  Universidad Austral de Chile · Campus Miraflores
                </p>
              </td>
            </tr>

            <!-- Cuerpo -->
            <tr>
              <td style="padding:24px 32px; background-color:#020617; color:#e5e7eb;">
                <p style="margin:0 0 16px; font-size:15px;">
                  Hola <strong>${copy.usuarioNombre}</strong>,
                </p>

                <h2 style="margin:0 0 8px; font-size:18px; font-weight:600;">
                  ${copy.tituloEstado}
                </h2>

                <span style="display:inline-block; margin:0 0 16px; padding:4px 10px; border-radius:999px; font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; background-color:rgba(15,23,42,0.9); border:1px solid ${copy.badgeColor}; color:${copy.badgeColor};">
                  ${copy.badgeText}
                </span>

                <p style="margin:0 0 12px; font-size:14px; line-height:1.6;">
                  ${copy.introParrafo}
                </p>

                <p style="margin:0 0 16px; font-size:14px; line-height:1.6;">
                  ${copy.detalleParrafo}
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 8px;">
                  <tr>
                    <td style="font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:#9ca3af;">
                      Información importante
                    </td>
                  </tr>
                </table>

                <ul style="margin:4px 0 16px 18px; padding:0; font-size:13px; line-height:1.7; color:#d1d5db;">
                  ${copy.bullets.map(b => `<li>${b}</li>`).join('')}
                </ul>

                <p style="margin:0 0 20px; font-size:14px; line-height:1.6;">
                  ${copy.notaFinal}
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 4px;">
                  <tr>
                    <td align="left">
                      <a href="mailto:solarwebuach@gmail.com"
                         style="display:inline-block; padding:10px 18px; border-radius:999px; background:linear-gradient(135deg,#1d4ed8,#38bdf8); color:#0b1120; text-decoration:none; font-size:13px; font-weight:600;">
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
</html>`;
}
