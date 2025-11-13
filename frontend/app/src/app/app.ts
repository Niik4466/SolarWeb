import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './components/ui/navbar/navbar.component';
import { Footer } from './components/ui/footer/footer';
import { AuthService } from './services/auth.service';
import { LoadingOverlayComponent } from './components/loading-overlay/loading-overlay';

@Component({
  selector: 'app-root',
  standalone: true,
  //Se agregan los imports necesarios
  imports: [CommonModule, RouterOutlet, NavbarComponent, Footer, LoadingOverlayComponent], 

  //Template agrega el componente necesario
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
  constructor(private auth: AuthService) {
    console.log('App initialized. User is logged in:', this.auth.isLoggedIn());
    this.auth.initFromBackend();
  }
}
