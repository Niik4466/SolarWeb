//exportar.ts

import { Component, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ExportApi } from '../../services/export.api';

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

  // Estado de la UI
  granularidad = signal<Granularity>('diario');
  // Fechas seleccionadas (para modo "diario") en formato YYYY-MM-DD
  fechasDiarias = signal<string[]>([]);

  private fb = inject(FormBuilder);
  private exporter = inject(ExportApi);

  // Form principal (opciones de exportación)
  form = this.fb.nonNullable.group({
    variable: this.fb.nonNullable.control<VariableKey>('GHI', { validators: [Validators.required] }),
    // métricas se ignoran en esta versión
    formato: this.fb.nonNullable.control<FormatKey>('csv', { validators: [Validators.required] }),
    incluirImagenes: this.fb.nonNullable.control<boolean>(false),

    // Controles de calendario
    fechaDiaria: this.fb.control<string | null>(null),
    rangoInicio: this.fb.control<string | null>(null),
    rangoFin: this.fb.control<string | null>(null),
  });

  // Validez mínima para habilitar "Exportar"
  puedeExportar = computed(() => {
    const g = this.granularidad();
    if (g === 'diario') {
      return this.fechasDiarias().length > 0;
    } else {
      const ini = this.form.value.rangoInicio;
      const fin = this.form.value.rangoFin;
      return Boolean(ini && fin && ini <= fin);
    }
  });

  // --- Acciones UI ---
  setGranularidad(g: Granularity) {
    this.granularidad.set(g);
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

  // --- Descarga ---
  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportar() {
    if (!this.puedeExportar()) return;

    if (this.granularidad() !== 'diario') {
      alert('Por ahora solo está implementado el modo "Diario".');
      return;
    }

    const variable = this.form.value.variable!;
    const format = this.form.value.formato!;
    const include_images = !!this.form.value.incluirImagenes;

    const dias = this.fechasDiarias();
    if (!dias.length) return;

    // Una descarga por día seleccionado
    for (const day of dias) {
      this.exporter.exportDaily({
        date: day,
        variables: [variable],
        format,
        include_images
      }).subscribe({
        next: (blob) => {
          const ext = include_images ? 'zip' : (format === 'csv' ? 'csv' : 'json');
          const filename = `export_${day}.${ext}`;
          this.downloadBlob(blob, filename);
        },
        error: (err) => {
          console.error('[Exportar] error', err);
          alert(`No se pudo exportar el día ${day}. Revisa la consola para más detalles.`);
        }
      });
    }
  }
}
