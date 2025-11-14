// loading.service.ts
import { Injectable, signal } from '@angular/core';

/**
 * Servicio global para manejar un estado de "cargando".
 *
 * Sirve para:
 * - Mostrar u ocultar un spinner global.
 * - Ser usado desde cualquier componente o servicio.
 * - Evitar tener múltiples estados de carga dispersos.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {

  /**
   * Señal interna que indica si algo está cargando.
   * Comienza en `false` porque no hay carga inicial.
   *
   * Esta señal NO se expone directamente para evitar que otros componentes
   * puedan modificarla desde fuera accidentalmente.
   */
  private _isLoading = signal(false);

  /**
   * Señal de solo lectura que los componentes pueden observar.
   * Esto permite suscribirse al estado de carga sin poder alterarlo.
   *
   * Ejemplo de uso en templates:
   *   *ngIf="loadingService.isLoading()"
   */
  isLoading = this._isLoading.asReadonly();

  /**
   * Activa el estado de carga.
   *
   * Se suele invocar justo antes de una operación async:
   *   loadingService.show();
   */
  show() {
    this._isLoading.set(true);
  }

  /**
   * Desactiva el estado de carga.
   *
   * Se usa después de completar o fallar una operación async:
   *   loadingService.hide();
   */
  hide() {
    this._isLoading.set(false);
  }
}
