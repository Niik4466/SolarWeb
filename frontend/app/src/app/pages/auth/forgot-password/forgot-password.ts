import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrls: ['./forgot-password.scss']
})
export class ForgotPasswordComponent {
  /**
   * Dirección de correo del administrador responsable de gestionar
   * restablecimientos de contraseña.
   * 
   * ⚠️ Debe reemplazarse por el correo oficial en producción.
   */
  adminEmail = 'admin@solarweb.cl';

  /**
   * Abre el cliente de correo predeterminado del usuario usando un enlace `mailto:`.
   * 
   * El email se genera automáticamente con:
   * - Un asunto predeterminado.
   * - Un cuerpo preformateado solicitando restablecimiento de contraseña.
   * 
   * Notas:
   * - Este componente NO restablece contraseñas por sí mismo.
   * - Simplemente facilita al usuario enviar una solicitud manual al administrador.
   */
  contactarAdmin() {
    const subject = encodeURIComponent('Solicitud de restablecimiento de contraseña');
    const body = encodeURIComponent(
      `Hola,\n\nHe olvidado mi contraseña y necesito restablecer mi acceso al sistema.\n\nGracias.`
    );

    // Abre el cliente de correo del sistema operativos
    window.location.href = `mailto:${this.adminEmail}?subject=${subject}&body=${body}`;
  }
}
