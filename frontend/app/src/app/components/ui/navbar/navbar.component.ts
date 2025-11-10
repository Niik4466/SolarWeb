import { Component, inject, signal } from '@angular/core';
import { Router, NavigationEnd, RouterLink, RouterLinkActive } from '@angular/router';
import { NgIf } from '@angular/common';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service'; // ajusta path
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

  constructor() {
    const set = (url: string) =>
      this.isLogin.set(/^\/(login|forgot-password|solicitar-registro)(\/|$)/.test(url));

    // evaluar al cargar
    set(this.router.url || '');
    // y en cada navegación
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => set(e.urlAfterRedirects ?? e.url ?? ''));
  }
}
