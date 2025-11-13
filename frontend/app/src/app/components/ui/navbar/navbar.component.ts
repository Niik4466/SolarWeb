import { Component, inject, signal } from '@angular/core';
import { Router, NavigationEnd, RouterLink, RouterLinkActive } from '@angular/router';
import { NgIf } from '@angular/common';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgIf],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
})
export class NavbarComponent {
  private router = inject(Router);
  auth = inject(AuthService);

  isLogin = signal(false);
  mobileOpen = signal(false); // 👈 estado del menú móvil

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
  }

  toggleMenu() {
    this.mobileOpen.update(v => !v);
  }

  closeMenu() {
    this.mobileOpen.set(false);
  }
}
