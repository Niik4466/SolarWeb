// src/app/pages/estado-sistema/estado-sistema.component.ts
import {
  Component, OnInit, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { MonitorApi, DiskStatus, SimpleState } from '../../services/monitor.service';

@Component({
  selector: 'app-estado-sistema',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './estado-sistema.html',
  styleUrls: ['./estado-sistema.scss'],
})
export class EstadoSistemaComponent implements OnInit {

  private api = inject(MonitorApi);

  private _disk = signal<DiskStatus | null>(null);
  private _dataService = signal<SimpleState | null>(null);
  private _logoService = signal<SimpleState | null>(null);

  loading = signal(true);
  error = signal<string | null>(null);
  lastUpdate = signal<Date | null>(null);

  // ---- derivados para la vista ----
  diskUsedPct = computed(() => this._disk()?.used_pct ?? 0);

  diskLevel = computed<'ok' | 'warn' | 'danger'>(() => {
    const pct = this.diskUsedPct();
    if (pct < 33) return 'ok';
    if (pct < 66) return 'warn';
    return 'danger';
  });

  diskSummary = computed(() => {
    const d = this._disk();
    if (!d) return '';
    const toGB = (x: number) => (x / (1024 ** 3)).toFixed(0);
    return `${toGB(d.used_bytes)} GB de ${toGB(d.total_bytes)} GB usados`;
  });

  dataServiceOk = computed(() => this._dataService()?.ok ?? false);
  logoServiceOk = computed(() => this._logoService()?.ok ?? false);

  // alerta general si algo está mal o el disco muy lleno
  hasWarning = computed(() =>
    this.diskLevel() !== 'ok' ||
    !this.dataServiceOk() ||
    !this.logoServiceOk()
  );

  ngOnInit() {
    this.refresh();
  }

  refresh() {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      disk: this.api.getDiskStatus(),
      dataService: this.api.getDataServiceState(),
      logoService: this.api.getLogoState(),
    }).subscribe({
      next: ({ disk, dataService, logoService }) => {
        this._disk.set(disk);
        this._dataService.set(dataService);
        this._logoService.set(logoService);
        this.lastUpdate.set(new Date());
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.error.set('No se pudo obtener el estado del sistema.');
        this.loading.set(false);
      },
    });
  }
}
