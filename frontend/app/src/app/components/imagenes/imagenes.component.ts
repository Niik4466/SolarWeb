import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  OnInit,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type SkyFrame = {
  /** Puede ser '06:00', '12:10', '2025-07-21T12:00:00', etc. */
  time: string | Date;
  /** URL de la imagen (local en /assets o remota) */
  src: string;
  /** Texto alternativo accesible */
  alt?: string;
};

/**
 * Component that displays a series of images organized by hour, with optional autoplay functionality
 * and customizable display settings.
 *
 * @remarks
 * This component is designed to display a collection of images (`SkyFrame[]`) in a slider-like interface.
 * It supports autoplay, custom aspect ratios, and emits events when the selected image changes.
 *
 * @example
 * ```html
 * <app-imagenes-por-hora
 *   [frames]="framesArray"
 *   [showHeader]="true"
 *   [autoplay]="true"
 *   [intervalMs]="5000"
 *   [maxHeight]="240"
 *   [ratio]="'16 / 9'"
 *   (frameChange)="onFrameChange($event)">
 * </app-imagenes-por-hora>
 * ```
 *
 * @export
 * @class ImagenesPorHoraComponent
 * @implements {OnInit}
 * @implements {OnDestroy}
 */
@Component({
  selector: 'app-imagenes-por-hora',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './imagenes.component.html',
  styleUrls: ['./imagenes.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImagenesPorHoraComponent implements OnInit, OnDestroy {
  /** Arreglo ordenado por hora */
  @Input({ required: true }) frames: SkyFrame[] = [];
  /** Muestra reloj/etiqueta arriba de la imagen */
  @Input() showHeader = true;
  /** Autoplay (avanza solo) */
  @Input() autoplay = false;
  /** Cada cuánto avanza en autoplay */
  @Input() intervalMs = 10_000;

  
  @Input() maxHeight = 300;     // alto máximo en px (puedes pasar 220/240/260)
  
  @Input() ratio: string = '4 / 3'; // relación de aspecto CSS (ej: '3 / 2', '16 / 9')


  /** Emite el frame actual cuando cambia */
  @Output() frameChange = new EventEmitter<SkyFrame>();

  /** Índice seleccionado en el slider */
  index = signal(0);
  current = computed(() => this.frames[this.index()] ?? null);

  // Cada cuántos ticks mostrar etiqueta (evita usar Math en el HTML)
  step = computed(() => Math.max(1, Math.ceil(this.frames.length / 6)));


  private _timer: any = null;

  ngOnInit(): void {
    // Pre-carga básica de imágenes
    for (const f of this.frames) {
      const img = new Image();
      img.src = f.src;
    }
    if (this.autoplay && this.frames.length > 1) {
      this._timer = setInterval(() => this.next(), this.intervalMs);
    }
  }

  ngOnDestroy(): void {
    if (this._timer) clearInterval(this._timer);
  }

  onSlide(i: number) {
    this.index.set(i);
    const c = this.current();
    if (c) this.frameChange.emit(c);
  }

  prev() {
    if (!this.frames.length) return;
    const i = (this.index() - 1 + this.frames.length) % this.frames.length;
    this.onSlide(i);
  }

  next() {
    if (!this.frames.length) return;
    const i = (this.index() + 1) % this.frames.length;
    this.onSlide(i);
  }

  labelFor(time: string | Date) {
    const d = typeof time === 'string' ? new Date(time) : time;
    // Si no es parseable como Date, se devuelve la cadena tal cual (ej: "06:00")
    if (isNaN((d as any).valueOf())) return String(time);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
