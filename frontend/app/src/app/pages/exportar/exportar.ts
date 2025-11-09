// exportar.ts

import { Component, computed, signal, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ExportApi } from '../../services/export.api';
import { TransactionsApi, TransaccionCreate } from '../../services/transactions.api';
import { of, Observable, throwError, Subscription } from 'rxjs';
import { concatMap, tap, finalize, catchError } from 'rxjs/operators';

type Granularity = 'diario' | 'rango';
type VariableKey = 'GHI' | 'DNI' | 'DHI';
type FormatKey = 'csv' | 'json';

@Component({
  standalone: true,
  selector: 'app-exportar-page',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './exportar.html',
  styleUrls: ['./exportar.scss']
})
export class ExportarPage implements OnDestroy {

  // ===========================
  // Estado de la UI
  // ===========================

  granularidad = signal<Granularity>('diario');
  fechasDiarias = signal<string[]>([]);

  private fb = inject(FormBuilder);
  private exporter = inject(ExportApi);
  private transactionsApi = inject(TransactionsApi);

  // ===========================
  // Form principal (opciones de exportación)
  // ===========================

  form = this.fb.nonNullable.group({
    varGHI: this.fb.nonNullable.control<boolean>(true),
    varDNI: this.fb.nonNullable.control<boolean>(false),
    varDHI: this.fb.nonNullable.control<boolean>(false),

    formato: this.fb.nonNullable.control<FormatKey>('csv', { validators: [Validators.required] }),
    incluirImagenes: this.fb.nonNullable.control<boolean>(false),

    fechaDiaria: this.fb.control<string | null>(null),
    rangoInicio: this.fb.control<string | null>(null),
    rangoFin: this.fb.control<string | null>(null),
  });

  // ---------------------------
  // Señales sincronizadas con el form (para reactividad)
  // ---------------------------
  private varGHI = signal<boolean>(this.form.controls.varGHI.value);
  private varDNI = signal<boolean>(this.form.controls.varDNI.value);
  private varDHI = signal<boolean>(this.form.controls.varDHI.value);

  private rangoInicioSig = signal<string | null>(this.form.controls.rangoInicio.value);
  private rangoFinSig = signal<string | null>(this.form.controls.rangoFin.value);

  private subs: Subscription[] = [];

  // ===========================
  // Selectores / helpers
  // ===========================

  constructor() {
    // Sincronizar controles -> señales
    this.subs.push(
      this.form.controls.varGHI.valueChanges.subscribe(v => this.varGHI.set(!!v)),
      this.form.controls.varDNI.valueChanges.subscribe(v => this.varDNI.set(!!v)),
      this.form.controls.varDHI.valueChanges.subscribe(v => this.varDHI.set(!!v)),

      this.form.controls.rangoInicio.valueChanges.subscribe(v => this.rangoInicioSig.set(v ?? null)),
      this.form.controls.rangoFin.valueChanges.subscribe(v => this.rangoFinSig.set(v ?? null)),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  private getSelectedVariables(): VariableKey[] {
    const v: VariableKey[] = [];
    if (this.varGHI()) v.push('GHI');
    if (this.varDNI()) v.push('DNI');
    if (this.varDHI()) v.push('DHI');
    return v;
  }

  // computed ahora usa SOLO señales — se actualizará inmediatamente
  puedeExportar = computed(() => {
    const anyVar = this.getSelectedVariables().length > 0;
    if (!anyVar) return false;

    const g = this.granularidad();
    if (g === 'diario') {
      return this.fechasDiarias().length > 0;
    } else {
      const ini = this.rangoInicioSig();
      const fin = this.rangoFinSig();
      return Boolean(ini && fin && ini <= fin);
    }
  });

  // ===========================
  // Acciones de UI
  // ===========================

  setGranularidad(g: 'diario'|'rango') {
    this.granularidad.set(g);
    if (g === 'diario') {
      this.form.patchValue({ rangoInicio: null, rangoFin: null });
      this.rangoInicioSig.set(null);
      this.rangoFinSig.set(null);
    } else {
      // si cambia a rango, opcionalmente limpiar fechas diarias
      // this.fechasDiarias.set([]);
    }
  }

  addFechaDiaria() {
    const value = this.form.value.fechaDiaria;
    if (!value) return;
    const list = new Set(this.fechasDiarias());
    list.add(value);
    this.fechasDiarias.set(Array.from(list).sort());
    this.form.patchValue({ fechaDiaria: null });
  }

  removeFechaDiaria(value: string) {
    this.fechasDiarias.set(this.fechasDiarias().filter(f => f !== value));
  }

  // ===========================
  // Estado de exportación
  // ===========================

  exporting = signal(false);
  statusMsg = signal<string | null>(null);
  progress = signal<{ total: number; done: number }>({ total: 0, done: 0 });
  private runningSub?: import('rxjs').Subscription;

  private startProgress(total: number, msg?: string) {
    this.progress.set({ total, done: 0 });
    this.statusMsg.set(msg ?? null);
    this.exporting.set(true);
  }
  private tickProgress(msg?: string) {
    const p = this.progress();
    this.progress.set({ total: p.total, done: Math.min(p.done + 1, p.total) });
    if (msg) this.statusMsg.set(msg);
  }
  private endProgress() {
    this.exporting.set(false);
    this.statusMsg.set(null);
    this.progress.set({ total: 0, done: 0 });
    this.runningSub = undefined;
  }

  cancelExport() {
    if (this.runningSub && !this.runningSub.closed) {
      this.runningSub.unsubscribe();
    }
    this.endProgress();
  }

  // ===========================
  // Utilidad de descarga
  // ===========================

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===========================
  // Acción principal: Exportar
  // ===========================

  exportar() {
    if (!this.puedeExportar() || this.exporting()) return;

    const userIdString = localStorage.getItem('userId');
    if (!userIdString) {
      alert('Error de autenticación. No se pudo encontrar su ID de usuario.');
      return;
    }
    const userId = parseInt(userIdString, 10);

    const formVal = this.form.getRawValue();

    const archivosPayload = this.granularidad() === 'diario'
      ? this.fechasDiarias()
      : [`${formVal.rangoInicio} - ${formVal.rangoFin}`];

    const payload: TransaccionCreate = {
      usuario_id: userId,
      imagenes: !!formVal.incluirImagenes,
      var_ghi: !!formVal.varGHI,
      var_dni: !!formVal.varDNI,
      var_global: !!formVal.varDHI,
      archivos: archivosPayload
    };

    const total = this.granularidad() === 'diario'
      ? Math.max(1, this.fechasDiarias().length)
      : 1;

    this.startProgress(total, 'Registrando transacción…');

    this.runningSub = this.transactionsApi.saveTransaction(payload).pipe(
      tap((savedTransaction) => {
        this.statusMsg.set('Transacción registrada. Iniciando descarga...');
      }),
      concatMap(() => this.logicaDeExportacion()),
    ).subscribe({
      error: (err) => {
        if (!this.statusMsg()?.startsWith('No se pudo')) {
          alert('No se pudo registrar la transacción en la base de datos. La exportación ha sido cancelada.');
        }
        this.endProgress();
      }
    });
  }

  /**
   * Contiene la lógica de exportación (diaria o rango).
   * Es llamada por 'exportar()' y debe devolver un Observable.
   */
  logicaDeExportacion(): Observable<Blob | null> {
    const variables = this.getSelectedVariables();
    const format = this.form.value.formato!;

    this.statusMsg.set('Preparando descarga...');

    if (this.granularidad() === 'diario') {
      const dias = this.fechasDiarias();
      if (!dias.length) return of(null);

      const include_images = !!this.form.value.incluirImagenes;

      if (dias.length > 1) {
        this.statusMsg.set('Exportando múltiples días…');
        this.startProgress(dias.length, 'Exportando múltiples días…');

        return this.exporter.exportDailyBatch({
          dates: dias,
          variables,
          format,
          include_images
        }).pipe(
          tap((blob: Blob) => {
            const first = dias[0];
            const last = dias[dias.length - 1];
            this.downloadBlob(blob, `export_${first}_${last}.zip`);
            this.tickProgress('ZIP descargado');
          }),
          finalize(() => {
            this.statusMsg.set('¡Exportación diaria (batch) completada!');
            setTimeout(() => this.endProgress(), 700);
          }),
          catchError((err) => {
            this.statusMsg.set('No se pudo exportar el batch de días seleccionados.');
            alert('No se pudo exportar el batch de días seleccionados.');
            return throwError(() => err);
          })
        );
      }

      this.statusMsg.set('Exportando día único…');
      const day = dias[0];

      return this.exporter.exportDaily({
        date: day,
        variables,
        format,
        include_images,
      }).pipe(
        tap((blob: Blob) => {
          const ext = include_images ? 'zip' : (format === 'csv' ? 'csv' : 'json');
          this.downloadBlob(blob, `export_${day}.${ext}`);
          this.tickProgress(`Descargado ${day}`);
        }),
        finalize(() => {
          this.statusMsg.set('¡Exportación diaria completada!');
          setTimeout(() => this.endProgress(), 700);
        }),
        catchError((err) => {
          this.statusMsg.set(`No se pudo exportar el día ${day}.`);
          alert(`No se pudo exportar el día ${day}.`);
          return throwError(() => err);
        })
      );

    } else {
      const inicio = this.form.value.rangoInicio!;
      const fin = this.form.value.rangoFin!;
      const include_images = !!this.form.value.incluirImagenes;

      this.statusMsg.set(`Exportando rango ${inicio} → ${fin}…`);
      this.startProgress(1, `Exportando rango ${inicio} → ${fin}…`);

      return this.exporter.exportRange({
        date_init: inicio, date_finish: fin, variables, format, include_images
      }).pipe(
        tap((blob: Blob) => {
          this.downloadBlob(blob, `export_${inicio}_${fin}.zip`);
          this.tickProgress('ZIP descargado');
        }),
        finalize(() => {
          this.statusMsg.set('¡Exportación de rango completada!');
          setTimeout(() => this.endProgress(), 700);
        }),
        catchError((err) => {
          this.statusMsg.set(`No se pudo exportar el rango ${inicio} a ${fin}.`);
          alert(`No se pudo exportar el rango ${inicio} a ${fin}.`);
          return throwError(() => err);
        })
      );
    }
  }
}
