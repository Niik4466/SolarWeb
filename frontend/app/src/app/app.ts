import { Component } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './components/ui/navbar/navbar.component';
import { Footer } from './components/ui/footer/footer';
import { AuthService } from './services/auth.service';
import { LoadingOverlayComponent } from './components/loading-overlay/loading-overlay';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, Footer, LoadingOverlayComponent],
  template: `
    <app-navbar></app-navbar>
    <main class="container">
      <router-outlet></router-outlet>
    </main>
    <app-footer></app-footer>
    <app-loading-overlay></app-loading-overlay>
  `,
  styles: [`
    .container {
      width: 100%;
      margin: 0;
      padding: 0;
    }
  `]
})
export class App {
  constructor(
    private auth: AuthService,
    private router: Router,
  ) {
    console.log('App initialized. User is logged in:', this.auth.isLoggedIn());
    this.auth.initFromBackend();

    // 👇 Escuchar cambios de ruta y setear la clase del body
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        const url: string = e.urlAfterRedirects ?? e.url ?? '';

        const esPantallaLogin = /^\/(login|forgot-password|solicitar-registro)(\/|$|\?|#|;)/.test(url);

        if (esPantallaLogin) {
          document.body.classList.add('login-bg');
        } else {
          document.body.classList.remove('login-bg');
        }
      });
  }
}
