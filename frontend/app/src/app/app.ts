import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `
    <nav class="main-nav">
      <a routerLink="/graficos" routerLinkActive="active">nose q cojones es esto, pero es la pagina principal y parece q deberia redirigir a graficos, para ir a graficos escribir /graficos</a>
    </nav>
    <router-outlet></router-outlet>
  `,
})
export class App {
  protected readonly title = signal('app');
}
