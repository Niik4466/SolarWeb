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
  adminEmail = 'admin@solarweb.cl'; // <-- cambia por el correo real

  contactarAdmin() {
    const subject = encodeURIComponent('Solicitud de restablecimiento de contraseña');
    const body = encodeURIComponent(
      `Hola,\n\nHe olvidado mi contraseña y necesito restablecer mi acceso al sistema.\n\nGracias.`
    );
    window.location.href = `mailto:${this.adminEmail}?subject=${subject}&body=${body}`;
  }
}
