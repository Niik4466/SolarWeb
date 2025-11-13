import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingService } from '../../services/loading.service';

@Component({
  selector: 'app-loading-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="overlay-backdrop" *ngIf="loading.isLoading()">
      <div class="overlay-card">
        <div class="spinner"></div>
        <p>Cargando...</p>
      </div>
    </div>
  `,
  styleUrls: ['./loading-overlay.scss'],
})
export class LoadingOverlayComponent {
  loading = inject(LoadingService);
}
