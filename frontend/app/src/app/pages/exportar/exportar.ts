import { Component, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

type Granularity = 'diario' | 'rango';
type VariableKey = 'GHI' | 'DNI' | 'DHI';
type MetricKey = 'promedio' | 'suma' | 'minimo' | 'maximo';
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
  // Fechas seleccionadas (para modo "diario")
  fechasDiarias = signal<string[]>([]); // ISO yyyy-MM-dd

  private fb = inject(FormBuilder);

  // Form principal (opciones de exportación)
  form = this.fb.nonNullable.group({
    variable: this.fb.nonNullable.control<VariableKey>('GHI', { validators: [Validators.required] }),
    metrics: this.fb.nonNullable.control<MetricKey[]>([]),
    formato: this.fb.nonNullable.control<FormatKey>('csv', { validators: [Validators.required] }),
    incluirImagenes: this.fb.nonNullable.control<boolean>(false),

    // Controles de calendario
    fechaDiaria: this.fb.control<string | null>(null),                    // campo auxiliar para añadir fechas
    rangoInicio: this.fb.control<string | null>(null),
    rangoFin: this.fb.control<string | null>(null),
  });

  // Validez mínima para habilitar "Exportar"
  puedeExportar = computed(() => {
    const g = this.granularidad();
    const metricsOk = (this.form.value.metrics?.length ?? 0) > 0;

    if (!metricsOk) return false;

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

  toggleMetric(key: MetricKey, checked: boolean) {
    const current = new Set(this.form.value.metrics ?? []);
    checked ? current.add(key) : current.delete(key);
    this.form.patchValue({ metrics: Array.from(current) });
  }

  // Payload final (solo consola por ahora)
  exportar() {
    if (!this.puedeExportar()) return;

    const payload = {
      granularidad: this.granularidad(),
      variable: this.form.value.variable!,
      metrics: this.form.value.metrics!,
      formato: this.form.value.formato!,
      incluirImagenes: !!this.form.value.incluirImagenes,
      fechas:
        this.granularidad() === 'diario'
          ? { dias: this.fechasDiarias() }
          : { inicio: this.form.value.rangoInicio!, fin: this.form.value.rangoFin! }
    };

    // Aquí conectas tu servicio HTTP para descargar el archivo.
    console.log('[EXPORT PAYLOAD]', payload);
    alert('Payload listo en consola. Conecta tu servicio de exportación cuando quieras.');
  }
}
