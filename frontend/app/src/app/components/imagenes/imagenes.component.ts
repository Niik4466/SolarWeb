import {
  Component, ChangeDetectionStrategy, Input, Output, EventEmitter,
  signal, computed, OnInit, OnDestroy, OnChanges, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type SkyFrame = { time: string | Date; src: string; alt?: string; };

@Component({
  selector: 'app-imagenes-por-hora',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './imagenes.component.html',
  styleUrls: ['./imagenes.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImagenesPorHoraComponent implements OnInit, OnDestroy, OnChanges {

  // ----- inputs -----
  private _frames = signal<SkyFrame[]>([]);
  @Input({ required: true })
  set frames(v: SkyFrame[]) { this._frames.set(v ?? []); }       // <— ahora es signal
  get frames(): SkyFrame[] { return this._frames(); }

  @Input() showHeader = true;
  @Input() autoplay = false;
  @Input() intervalMs = 10_000;
  @Input() startIndex = 0;
  @Input() maxHeight = 300;
  @Input() ratio: string = '4 / 3';
  @Input() resetKey?: number;   // para forzar reinicio externo si quieres

  @Output() frameChange = new EventEmitter<SkyFrame>();

  // ----- estado -----
  index = signal(0);
  current = computed(() => this._frames()[this.index()] ?? null);               // <—
  step    = computed(() => Math.max(1, Math.ceil(this._frames().length / 6))); // <—

  private _timer: any = null;

  // ----- ciclo de vida -----
  ngOnInit(): void {
    this.resetTo(this.startIndex);
    this.startAutoplayIfNeeded();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['startIndex'] || changes['resetKey'] || changes['frames']) {
      this.resetTo(this.startIndex);      // cuando llegan nuevos frames, recalcula
      this.restartAutoplayIfNeeded();
    }
  }

  ngOnDestroy(): void { this.stopAutoplay(); }

  // ----- UI API -----
  onSlide(i: number) {
    this.index.set(i);
    const c = this.current();
    if (c) { this.frameChange.emit(c); this.prefetchAdjacent(); }
  }
  prev() { if (!this.frames.length) return; this.onSlide((this.index() - 1 + this.frames.length) % this.frames.length); }
  next() { if (!this.frames.length) return; this.onSlide((this.index() + 1) % this.frames.length); }

  // ----- helpers -----
  private resetTo(i: number) {
    const n = this._frames().length;
    const safe = Math.min(Math.max(i || 0, 0), Math.max(n - 1, 0));
    this.index.set(safe);
    const c = this.current();
    if (c) { this.frameChange.emit(c); this.prefetchAdjacent(); }
  }
  private startAutoplayIfNeeded() {
    if (this.autoplay && this._frames().length > 1) {
      this.stopAutoplay();
      this._timer = setInterval(() => this.next(), this.intervalMs);
    }
  }
  private restartAutoplayIfNeeded() { this.stopAutoplay(); this.startAutoplayIfNeeded(); }
  private stopAutoplay() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }

  /** precarga ligera sólo ±1 */
  private prefetchAdjacent() {
    const n = this._frames().length; if (n <= 1) return;
    const i = this.index(); const idxs = [ (i - 1 + n) % n, (i + 1) % n ];
    for (const j of idxs) { const url = this._frames()[j]?.src; if (url) { const img = new Image(); img.decoding='async'; img.src = url; } }
  }

  labelFor(time: string | Date) {
    const d = typeof time === 'string' ? new Date(time) : time;
    return isNaN((d as any).valueOf()) ? String(time) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
