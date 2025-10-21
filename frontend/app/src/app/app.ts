import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './components/ui/navbar/navbar.component';
import { Footer } from './components/ui/footer/footer';

@Component({
  selector: 'app-root',
  standalone: true,
  //Se agregan los imports necesarios
  imports: [CommonModule, RouterOutlet, NavbarComponent, Footer], 

  //Template agrega el componente necesario
  template: `
    <app-navbar></app-navbar>
    <main class="container">
      <router-outlet></router-outlet>
    </main>
    <app-footer></app-footer>
  `,
  styles: [`
  .container {
    width: 100%;
    margin: 0;
    padding: 0;
  }
`]

})
export class App {}
