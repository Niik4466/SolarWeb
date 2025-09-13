import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './components/ui/navbar/navbar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  //Se agregan los imports necesarios
  imports: [CommonModule, RouterOutlet, NavbarComponent], 

  //Template agrega el componente necesario
  template: `
    <app-navbar></app-navbar>
    <main class="container">
      <router-outlet></router-outlet>
    </main>
  `,
  styles: [`.container{max-width:1200px;margin:0 auto;padding:1rem}`]
})
export class App {}
