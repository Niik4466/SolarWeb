import { Component, inject, signal } from '@angular/core';
import { Router, NavigationEnd, RouterLink, RouterLinkActive } from '@angular/router';
import { NgIf, NgClass, DecimalPipe } from '@angular/common';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import {
  SystemStatusService,
  DiskUsage,
} from '../../../services/system-status.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgIf , NgClass, DecimalPipe],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
})
export class NavbarComponent {
  private router = inject(Router);
  private systemStatus = inject(SystemStatusService);
  auth = inject(AuthService);

  isLogin = signal(false);
  mobileOpen = signal(false); // 👈 estado del menú móvil

  // Estado del indicador de disco
  diskUsage = signal<DiskUsage | null>(null);
  // storageLevel igual
  storageLevel = signal<'ok' | 'warn' | 'danger'>('ok');

  constructor() {
    const set = (url: string) =>
      this.isLogin.set(/^\/(login|forgot-password|solicitar-registro)(\/|$|\?|#|;)/.test(url));

    set(this.router.url || '');
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => set(e.urlAfterRedirects ?? e.url ?? ''));

    // 👇 cada navegación cierra el menú móvil
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.mobileOpen.set(false));
      this.cargarUsoDisco();
  }

  toggleMenu() {
    this.mobileOpen.update(v => !v);
  }

  closeMenu() {
    this.mobileOpen.set(false);
  }
  logout() {
    this.auth.logout();           // limpia todo el estado de auth
    this.closeMenu?.();           // por si estás en móvil
    this.router.navigate(['/login']);
  }
  estaEnInicio(): boolean {
    return this.router.url === '/inicio' || this.router.url === '/';
  }

  irALogin() {
    this.router.navigate(['/login']);
  }
  private cargarUsoDisco() {
    console.log('[Navbar] Pidiendo uso de disco...');

    this.systemStatus.getDiskUsage().subscribe({
      next: (data) => {
        console.log('[Navbar] DiskUsage recibido:', data);
        this.diskUsage.set(data);

        const pct = data.used_pct;

        if (pct < 33) {
          this.storageLevel.set('ok');
        } else if (pct < 66) {
          this.storageLevel.set('warn');
        } else {
          this.storageLevel.set('danger');
        }
      },
      error: (err) => {
        console.error('[Navbar] Error al obtener uso de disco', err);
        this.diskUsage.set(null); // si falla, no se muestra nada
      }
    });
  }


}
