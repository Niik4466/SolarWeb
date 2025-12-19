// exportar.ts
import { Component, computed, signal, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { ExportApi } from '../../services/export.api';
import { TransactionsApi, TransaccionCreate } from '../../services/transactions.api';
import { of, Observable, throwError, Subscription } from 'rxjs';
import { concatMap, tap, finalize, catchError } from 'rxjs/operators';
import { LoadingService } from '../../services/loading.service';
import type { ExportAsyncResponse } from '../../services/export.api';
import { HttpErrorResponse } from '@angular/common/http';


type ExportResult = Blob | ExportAsyncResponse | null;


// ✅ Importar librería de rango de fechas
import { NgxDaterangepickerMd, LocaleConfig } from 'ngx-daterangepicker-material';
import dayjs from 'dayjs';

type Granularity = 'diario' | 'rango';
type VariableKey = 'GHI' | 'DNI' | 'DHI' | 'HR' | 'Temp';
type FormatKey = 'csv' | 'json';
type MetricKey = 'mean' | 'min' | 'max' | 'sum';

// Opcional: para ayudar en el HTML (select de granularidad de datos/imagenes)
type TimeGranularity =
  | '1s'
  | '10s'
  | '30s'
  | '1m'
  | '5m'
  | '30m'
  | '1h';

@Component({
  standalone: true,
  selector: 'app-exportar-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    NgxDaterangepickerMd, // ✅ registra LocaleService y dependencias internas
  ],
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
  private loadingSrv = inject(LoadingService);
  


  // Opciones para el select de granularidad (si lo usas en el HTML)
  granularityOptions: { label: string; value: TimeGranularity }[] = [
    { label: '1 segundo', value: '1s' },
    { label: '10 segundos', value: '10s' },
    { label: '30 segundos', value: '30s' },
    { label: '1 minuto', value: '1m' },
    { label: '5 minutos', value: '5m' },
    { label: '30 minutos', value: '30m' },
    { label: '1 hora', value: '1h' },
  ];

  // ===========================
  // Form principal (opciones de exportación)
  // ===========================

  form = this.fb.nonNullable.group({
    varGHI: this.fb.nonNullable.control<boolean>(true),
    varDNI: this.fb.nonNullable.control<boolean>(false),
    varDHI: this.fb.nonNullable.control<boolean>(false),

    varHR: this.fb.nonNullable.control<boolean>(false),
    varTemp: this.fb.nonNullable.control<boolean>(false),

    formato: this.fb.nonNullable.control<FormatKey>('csv', { validators: [Validators.required] }),
    incluirImagenes: this.fb.nonNullable.control<boolean>(false),

    fechaDiaria: this.fb.control<string | null>(null),
    rangoInicio: this.fb.control<string | null>(null),
    rangoFin: this.fb.control<string | null>(null),

    startHour: this.fb.nonNullable.control<string>('00:00', {
      validators: [Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)],
    }),
    endHour: this.fb.nonNullable.control<string>('23:59', {
      validators: [Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)],
    }),

    granularity: this.fb.control<TimeGranularity | null>(null, {
      validators: [Validators.required]
    }),

    metricMean: this.fb.nonNullable.control<boolean>(false),
    metricMin:  this.fb.nonNullable.control<boolean>(false),
    metricMax:  this.fb.nonNullable.control<boolean>(false),
    metricSum:  this.fb.nonNullable.control<boolean>(false),
  });
  private granularitySig = signal<TimeGranularity | null>(this.form.controls.granularity.value);

  // ---------------------------
  // Señales sincronizadas con el form (para reactividad)
  // ---------------------------
  private varGHI = signal<boolean>(this.form.controls.varGHI.value);
  private varDNI = signal<boolean>(this.form.controls.varDNI.value);
  private varDHI = signal<boolean>(this.form.controls.varDHI.value);
  private varHR = signal<boolean>(this.form.controls.varHR.value);
  private varTemp = signal<boolean>(this.form.controls.varTemp.value);
  
  private rangoInicioSig = signal<string | null>(this.form.controls.rangoInicio.value);
  private rangoFinSig = signal<string | null>(this.form.controls.rangoFin.value);

  private subs: Subscription[] = [];
  private metricMean = signal<boolean>(this.form.controls.metricMean.value);
  private metricMin  = signal<boolean>(this.form.controls.metricMin.value);
  private metricMax  = signal<boolean>(this.form.controls.metricMax.value);
  private metricSum  = signal<boolean>(this.form.controls.metricSum.value);


  // ===========================
  // Configuración de rango de fechas (ngx-daterangepicker-material)
  // ===========================

  public locale: LocaleConfig = {
    format: 'DD/MM/YYYY',
    displayFormat: 'DD/MM/YYYY',
    direction: 'ltr',
    applyLabel: 'Aplicar',
    cancelLabel: 'Cancelar',
    customRangeLabel: 'Personalizado',
    daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'],
    monthNames: [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ],
    firstDay: 1
  };

  selectedRange: { startDate: dayjs.Dayjs; endDate: dayjs.Dayjs } = {
    startDate: dayjs().subtract(0, 'day'),
    endDate: dayjs()
  };
  

  onDateRangeSelected(event: any) {
    if (!event.startDate || !event.endDate) return;

    this.selectedRange = {
      startDate: event.startDate,
      endDate: event.endDate
    };

    const inicio = event.startDate.format('YYYY-MM-DD');
    const fin = event.endDate.format('YYYY-MM-DD');

    this.form.patchValue({ rangoInicio: inicio, rangoFin: fin });
    this.rangoInicioSig.set(inicio);
    this.rangoFinSig.set(fin);
  }

  // ===========================
  // Selectores / helpers
  // ===========================

  constructor() {
    // Sincronizar controles -> señales
    
    this.subs.push(
      this.form.controls.varGHI.valueChanges.subscribe(v => this.varGHI.set(!!v)),
      this.form.controls.varDNI.valueChanges.subscribe(v => this.varDNI.set(!!v)),
      this.form.controls.varDHI.valueChanges.subscribe(v => this.varDHI.set(!!v)),
      this.form.controls.varHR.valueChanges.subscribe(v => this.varHR.set(!!v)),
      this.form.controls.varTemp.valueChanges.subscribe(v => this.varTemp.set(!!v)),

      this.form.controls.rangoInicio.valueChanges.subscribe(v => this.rangoInicioSig.set(v ?? null)),
      this.form.controls.rangoFin.valueChanges.subscribe(v => this.rangoFinSig.set(v ?? null)),
      this.form.controls.granularity.valueChanges.subscribe(v =>
        this.granularitySig.set(v ?? null)
      ),
      this.form.controls.metricMean.valueChanges.subscribe(v => this.metricMean.set(!!v)),
      this.form.controls.metricMin.valueChanges.subscribe(v => this.metricMin.set(!!v)),
      this.form.controls.metricMax.valueChanges.subscribe(v => this.metricMax.set(!!v)),
      this.form.controls.metricSum.valueChanges.subscribe(v => this.metricSum.set(!!v)),

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
    if (this.varHR())  v.push('HR');
    if (this.varTemp()) v.push('Temp');
    return v;
  }

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
  get granularityCtrl() {
    return this.form.controls.granularity;
  }

  setGranularidad(g: 'diario' | 'rango') {
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

  // ===========================
  // Estado de exportación
  // ===========================

  exporting = signal(false);
  statusMsg = signal<string | null>(null);
  progress = signal<{ total: number; done: number }>({ total: 0, done: 0 });

  errorMsg = signal<string | null>(null);
  errorTitle = signal<string>('No se pudo exportar');
  errorHint = signal<string | null>(null);
  private runningSub?: import('rxjs').Subscription;
  // Modal info exportación async
  showEmailModal = signal(false);
  emailModalMessage = signal<string>('');

  private openEmailModal(kind: 'batch' | 'range') {
    this.emailModalMessage.set(
      'Exportación confirmada. Los datos se enviarán por correo en un plazo estimado de 3 a 5 días.'
    );
    this.showEmailModal.set(true);
  }


  closeEmailModal() {
    this.showEmailModal.set(false);
    this.emailModalMessage.set('');
  }


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
  clearErrorBanner() {
    this.errorMsg.set(null);
    this.errorHint.set(null);
  }

  private extractBackendMessage(err: unknown): string | null {
    if (err instanceof HttpErrorResponse) {
      const e: any = err.error;
      if (typeof e === 'string') return e;
      if (e?.detail) return typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail);
      if (e?.message) return typeof e.message === 'string' ? e.message : JSON.stringify(e.message);
    }
    const anyErr: any = err;
    return (anyErr?.message ?? null) as string | null;
  }

  private getSelectedMetrics(): MetricKey[] {
    const v = this.form.getRawValue();
    const metrics: MetricKey[] = [];
    if (v.metricMean) metrics.push('mean');
    if (v.metricMin)  metrics.push('min');
    if (v.metricMax)  metrics.push('max');
    if (v.metricSum)  metrics.push('sum'); // esto es kWh/m2 en el backend
    return metrics;
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
      this.clearErrorBanner();
      // 🔴 Primero: validar granularidad y disparar el error visual
      const granularitySelected = !!this.granularitySig();
      if (!granularitySelected) {
        this.granularityCtrl.markAsTouched();
        this.granularityCtrl.markAsDirty();
        this.granularityCtrl.updateValueAndValidity();
        return;
      }

      // Luego el resto de validaciones normales
      if (!this.puedeExportar() || this.exporting()) return;

      const userIdString = localStorage.getItem('userId');
      if (!userIdString) {
        alert('Error de autenticación. No se pudo encontrar su ID de usuario.');
        return;
      }
      const userId = parseInt(userIdString, 10);
      const email = localStorage.getItem('userEmail');
      if (!email) {
        alert('No se pudo encontrar tu correo para enviarte la exportación.');
        return;
      }

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

      

      // encendemos el overlay global
      this.loadingSrv.show();

      // llamamos a la lógica de exportación
      const obs = this.logicaDeExportacion();

      // guardamos la suscripción para poder cancelarla si quieres
      this.runningSub = obs
        .pipe(
          // esto se ejecuta SIEMPRE (éxito o error)
          finalize(() => {
            this.loadingSrv.hide();
          })
        )
        .subscribe({
          next: () => {
            // ya manejas descargas dentro de logicaDeExportacion()
          },
          error: (err) => {
            console.error('Error en exportación:', err);
          }
        });
    }



  /**
   * Contiene la lógica de exportación (diaria o rango).
   * Es llamada por 'exportar()' y debe devolver un Observable.
   */
  logicaDeExportacion(): Observable<ExportResult> {
    const variables = this.getSelectedVariables();
    const format = this.form.value.formato!;

    // 🆕 leemos horas y granularidad del form, y las mapeamos a lo que espera el backend
    const formVal = this.form.getRawValue();
    const start_hour = formVal.startHour || '00:00';
    const end_hour = formVal.endHour || '23:59';
    const granularity = formVal.granularity ;
    const metrics = this.getSelectedMetrics();
    
    if (!granularity) {
      // Por seguridad, pero sin alert feo
      this.statusMsg.set('Debe seleccionar una granularidad.');
      return of(null);
    }

    this.statusMsg.set('Preparando descarga...');

    if (this.granularidad() === 'diario') {
      const dias = this.fechasDiarias();
      if (!dias.length) return of(null);

      const include_images = !!this.form.value.incluirImagenes;

      if (dias.length > 1) {
        this.statusMsg.set('Solicitando exportación (se enviará por correo)…');
        this.startProgress(1, 'Solicitando exportación…');

        const userIdString = localStorage.getItem('userId');
        const email = localStorage.getItem('userEmail');
        if (!userIdString || !email) return of(null);
        const user_id = parseInt(userIdString, 10);

        return this.exporter.exportDailyBatchAsync({
          user_id,
          email,
          dates: dias,
          variables,
          format,
          include_images,
          start_hour,
          end_hour,
          granularity,
          metrics,
        }).pipe(
          tap((res: ExportAsyncResponse) => {
            this.tickProgress('Solicitud enviada');
            this.statusMsg.set(res.message || 'La exportación quedó encolada. Te llegará por correo.');
            this.openEmailModal('batch');
          }),
          finalize(() => {
            setTimeout(() => this.endProgress(), 900);
          }),
          catchError((err) => {
            const backendMsg = this.extractBackendMessage(err);

            if (backendMsg) {
              this.errorTitle.set('Exportación demasiado grande');
              this.errorMsg.set(backendMsg);
              this.errorHint.set(
                'Has seleccionado muchos días. Prueba exportar menos días o aumenta la granularidad.'
              );

              this.statusMsg.set(backendMsg);
              return throwError(() => err);
            }

            // fallback genérico
            this.errorTitle.set('No se pudo iniciar la exportación');
            this.errorMsg.set('No se pudo iniciar la exportación (batch).');
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
        start_hour,
        end_hour,
        granularity,
        metrics,
      }).pipe(
        tap((blob: Blob) => {
          const hasMetrics = metrics && metrics.length > 0;
          const returnsZip = include_images || hasMetrics;

          const ext = returnsZip
            ? 'zip'
            : (format === 'csv' ? 'csv' : 'json');

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

      this.statusMsg.set(`Solicitando exportación rango ${inicio} → ${fin} (por correo)…`);
      this.startProgress(1, `Solicitando exportación…`);
      const userIdString = localStorage.getItem('userId');
      const email = localStorage.getItem('userEmail');
      if (!userIdString || !email) return of(null);
      const user_id = parseInt(userIdString, 10);


      // 🆕 también aquí: start_hour, end_hour, granularity
      return this.exporter.exportRangeAsync({
        user_id,
        email,
        date_init: inicio,
        date_finish: fin,
        variables,
        format,
        include_images,
        start_hour,
        end_hour,
        granularity,
        metrics,
      }).pipe(
        tap((res: ExportAsyncResponse) => {
          this.tickProgress('Solicitud enviada');
          this.statusMsg.set(res.message || 'La exportación quedó encolada. Te llegará por correo.');
          this.openEmailModal('range');
        }),
        finalize(() => {
          setTimeout(() => this.endProgress(), 900);
        }),
        catchError((err) => {
          const backendMsg = this.extractBackendMessage(err);

          // Si el backend devolvió detail, lo mostramos tal cual (es el mejor mensaje)
          if (backendMsg) {
            this.errorTitle.set('Exportación demasiado grande');
            this.errorMsg.set(backendMsg);

            // Hint extra (opcional) para guiar al usuario
            this.errorHint.set('Prueba con menos días, acota el rango horario o aumenta la granularidad.');

            // También puedes setear statusMsg si quieres mantener coherencia con tu barra
            this.statusMsg.set(backendMsg);

            // No alert, porque ya lo muestras “lindo”
            return throwError(() => err);
          }

          // fallback genérico si no vino detalle
          this.errorTitle.set('No se pudo iniciar la exportación');
          this.errorMsg.set(`No se pudo iniciar la exportación del rango ${inicio} a ${fin}.`);
          return throwError(() => err);
        })

      );
    }
  }
}
