// exportar.ts

import { Component, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ExportApi } from '../../services/export.api';
import { from, of } from 'rxjs';
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
export class ExportarPage {

  // ===========================
  // Estado de la UI
  // ===========================

  /** Granularidad seleccionada por el usuario (diario o rango). */
  granularidad = signal<Granularity>('diario');

  /** Fechas seleccionadas en modo "diario" (formato YYYY-MM-DD). */
  fechasDiarias = signal<string[]>([]);

  /** Inyección del constructor reactivo de formularios. */
  private fb = inject(FormBuilder);

  /** Servicio de exportación (llamadas HTTP a backend). */
  private exporter = inject(ExportApi);

  // ===========================
  // Form principal (opciones de exportación)
  // ===========================

  /**
   * FormGroup con:
   * - varGHI/varDNI/varDHI: checkboxes independientes para seleccionar variables.
   * - formato: radio ('csv' | 'json'), requerido.
   * - incluirImagenes: aplica sólo para exportación por rango (ZIP).
   * - fechaDiaria/rangoInicio/rangoFin: controles de calendario.
   */
  form = this.fb.nonNullable.group({
    // variables como checkboxes (booleanos independientes)
    varGHI: this.fb.nonNullable.control<boolean>(true),
    varDNI: this.fb.nonNullable.control<boolean>(false),
    varDHI: this.fb.nonNullable.control<boolean>(false),

    // formato (radio en HTML)
    formato: this.fb.nonNullable.control<FormatKey>('csv', { validators: [Validators.required] }),
    incluirImagenes: this.fb.nonNullable.control<boolean>(false),

    // Controles de calendario
    fechaDiaria: this.fb.control<string | null>(null),
    rangoInicio: this.fb.control<string | null>(null),
    rangoFin: this.fb.control<string | null>(null),
  });

  // ===========================
  // Selectores / helpers
  // ===========================

  /**
   * Obtiene las variables seleccionadas como arreglo de claves.
   * @returns Array de variables marcadas por el usuario.
   */
  private getSelectedVariables(): VariableKey[] {
    const v: VariableKey[] = [];
    if (this.form.value.varGHI) v.push('GHI');
    if (this.form.value.varDNI) v.push('DNI');
    if (this.form.value.varDHI) v.push('DHI');
    return v;
  }

  /**
   * Indica si se cumplen las condiciones mínimas para habilitar el botón "Exportar".
   * - Debe haber al menos una variable seleccionada.
   * - En modo diario: al menos una fecha agregada.
   * - En modo rango: fechas inicio/fin válidas y con inicio <= fin.
   */
  puedeExportar = computed(() => {
    const anyVar = this.getSelectedVariables().length > 0;  
    if (!anyVar) return false;

    const g = this.granularidad();
    if (g === 'diario') {
      return this.fechasDiarias().length > 0;
    } else {
      const ini = this.form.value.rangoInicio;
      const fin = this.form.value.rangoFin;
      return Boolean(ini && fin && ini <= fin);
    }
  });

  // ===========================
  // Acciones de UI
  // ===========================

  /**
   * Cambia la granularidad. Si vuelve a "diario", limpia el rango.
   * @param g 'diario' | 'rango'
   */
  setGranularidad(g: 'diario'|'rango') {
    this.granularidad.set(g);
    if (g === 'diario') {
      this.form.patchValue({ rangoInicio: null, rangoFin: null });
    }
  }

  /**
   * Agrega una fecha al listado diario (sin duplicados) y limpia el input.
   * Usa Set para evitar repeticiones y ordena lexicográficamente (YYYY-MM-DD).
   */
  addFechaDiaria() {
    const value = this.form.value.fechaDiaria;
    if (!value) return;
    const list = new Set(this.fechasDiarias());
    list.add(value);
    this.fechasDiarias.set(Array.from(list).sort());
    this.form.patchValue({ fechaDiaria: null });
  }

  /**
   * Elimina una fecha específica del listado diario.
   * @param value Fecha a remover en formato YYYY-MM-DD
   */
  removeFechaDiaria(value: string) {
    this.fechasDiarias.set(this.fechasDiarias().filter(f => f !== value));
  }


  // 👇 NUEVO: estado UI de exportación
  exporting = signal(false);
  statusMsg = signal<string | null>(null);
  progress = signal<{ total: number; done: number }>({ total: 0, done: 0 });
  private runningSub?: import('rxjs').Subscription;


  // 👇 helper: actualizar progreso
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

  // 👇 opcional: cancelar (para múltiples días)
  cancelExport() {
    if (this.runningSub && !this.runningSub.closed) {
      this.runningSub.unsubscribe();
    }
    this.endProgress();
  }


  // ===========================
  // Utilidad de descarga
  // ===========================

  /**
   * Dispara la descarga de un Blob como archivo en el navegador.
   * @param blob Contenido binario a descargar.
   * @param filename Nombre sugerido para el archivo.
   */
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

  /**
   * Ejecuta la exportación según la granularidad:
   * - Diario: descarga un archivo por cada fecha (CSV o JSON). `include_images` se ignora.
   * - Rango: descarga un ZIP que puede incluir imágenes (opcional).
   * Manejo de errores: muestra alert y loguea en consola.
   */
  exportar() {
    if (!this.puedeExportar() || this.exporting()) return;

    const variables = this.getSelectedVariables();
    const format = this.form.value.formato!;

    // Limpia errores previos
    this.statusMsg.set(null);

  if (this.granularidad() === 'diario') {
    const dias = this.fechasDiarias();
    if (!dias.length) return;

    const include_images = !!this.form.value.incluirImagenes;

    // ✅ Si hay > 1 fecha → usamos el endpoint batch para un único ZIP
    if (dias.length > 1) {
      this.startProgress(1, 'Exportando múltiples días…');

      this.runningSub = this.exporter.exportDailyBatch({
        dates: dias,
        variables,
        format,
        include_images
      }).pipe(
        tap((blob: Blob) => {
          const first = dias[0];
          const last  = dias[dias.length - 1];
          this.downloadBlob(blob, `export_${first}_${last}.zip`);
          this.tickProgress('ZIP descargado');
        }),
        finalize(() => {
          this.statusMsg.set('¡Exportación diaria (batch) completada!');
          setTimeout(() => this.endProgress(), 700);
        })
      ).subscribe({
        error: (err) => {
          console.error('[Exportar batch] error', err);
          alert('No se pudo exportar el batch de días seleccionados.');
          this.endProgress();
        }
      });

      return; // 👈 importante: no seguir con el flujo por-día
    }

    // 🗓️ Si hay exactamente 1 fecha → mantiene tu flujo actual (CSV/JSON o ZIP con imágenes)
    this.startProgress(1, 'Exportando día único…');

    const day = dias[0];
    this.runningSub = this.exporter.exportDailyBatch({
      dates: [day],
      variables,
      format,
      include_images
    }).pipe(
      tap((blob: Blob) => {
        // Si marcaste imágenes, el backend devuelve ZIP por día; si no, CSV/JSON
        const ext = include_images ? 'zip' : (format === 'csv' ? 'csv' : 'json');
        this.downloadBlob(blob, `export_${day}.${ext}`);
        this.tickProgress(`Descargado ${day}`);
      }),
      finalize(() => {
        this.statusMsg.set('¡Exportación diaria completada!');
        setTimeout(() => this.endProgress(), 700);
      })
    ).subscribe({
      error: (err) => {
        console.error('[Exportar día] error', err);
        alert(`No se pudo exportar el día ${day}.`);
        this.endProgress();
      }
    });

  } else {

      // Rango → un solo ZIP
      const inicio = this.form.value.rangoInicio!;
      const fin = this.form.value.rangoFin!;
      const include_images = !!this.form.value.incluirImagenes;

      this.startProgress(1, `Exportando rango ${inicio} → ${fin}…`);

      this.runningSub = this.exporter.exportRange({
        inicio, fin, variables, format, include_images
      }).pipe(
        tap((blob: Blob) => {
          this.downloadBlob(blob, `export_${inicio}_${fin}.zip`);
          this.tickProgress('ZIP descargado');
        }),
        finalize(() => {
          this.statusMsg.set('¡Exportación de rango completada!');
          setTimeout(() => this.endProgress(), 700);
        })
      ).subscribe({
        error: (err) => {
          console.error('[Exportar] error', err);
          alert(`No se pudo exportar el rango ${inicio} a ${fin}.`);
          this.endProgress();
        }
      });
    }
  }
}
