import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { of } from 'rxjs';
import { UserService } from '../../services/solicitudes.api';
import { AuthService } from '../../services/auth.service'; 
import { LoadingService } from '../../services/loading.service';
import { MailApi } from '../../services/mail.service';
import { FormControl, ReactiveFormsModule } from '@angular/forms'; 
import { catchError, map, finalize, startWith, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { getEstadoCuentaEmail } from '../../services/mail-template/estado_cuenta';

// -----------------------------------------------------------
// Tipos de apoyo para la UI
// -----------------------------------------------------------

/**
 * Representa una solicitud de registro que viene del backend,
 * adaptada para ser usada en la tabla de la UI.
 */
type Solicitud = {
  id: string;
  nombre: string;
  correo: string;
  justificacion: string;
  fecha: Date | null;   // fecha de creación de la solicitud
};

/**
 * Criterios posibles de ordenamiento para la lista.
 */
type Orden = 'recientes' | 'antiguos' | 'nombre' | 'correo';

@Component({
  selector: 'app-solicitudes',
  standalone: true,
  imports: [CommonModule, NgFor, NgIf, ReactiveFormsModule],
  templateUrl: './solicitudes.html',
  styleUrls: ['./solicitudes.scss'],
})
export class SolicitudesComponent implements OnInit {
  // ---------------------------------------------------------
  // Inyección de servicios
  // ---------------------------------------------------------
  private users = inject(UserService);       // servicio que llama a la API de solicitudes/usuarios pendientes
  private auth = inject(AuthService);        // servicio de autenticación (para obtener admin actual)
  private loadingSrv = inject(LoadingService); // overlay global de carga
  private mail = inject(MailApi);  // Servicio para enviar mails


  // ---------------------------------------------------------
  // Estado general de la vista
  // ---------------------------------------------------------

  cargando = signal<boolean>(false);       // indica si se están cargando las solicitudes
  enviando = signal<boolean>(false);       // indica si se está enviando una acción (aprobar/rechazar)
  error = signal<string | null>(null);     // mensaje de error general
  okMsg = signal<string | null>(null);     // mensaje de éxito (aprobado/rechazado correctamente)

  // Lista de solicitudes pendientes mostradas en la tabla
  solicitudes = signal<Solicitud[]>([]);

  // ---------------------------------------------------------
  // Estado de los modales / acciones
  // ---------------------------------------------------------

  // Solicitud seleccionada para aprobar/rechazar
  sel = signal<Solicitud | null>(null);

  // Acción seleccionada para esa solicitud: aprobar o rechazar
  accion = signal<'aprobar' | 'rechazar' | null>(null);

  // Rol que se asignará si se aprueba (admin/user) – por defecto user
  rol = signal<'admin' | 'user'>('user');

  // ---------------------------------------------------------
  // Buscador y orden (mismo patrón que en UsuariosComponent)
  // ---------------------------------------------------------

  // Input de búsqueda reactivo
  buscar = new FormControl('', { nonNullable: true });

  // Criterio de orden actual
  orden  = signal<Orden>('recientes');

  /**
   * Signal derivado del valor del input de búsqueda con:
   * - valor inicial
   * - debounce para tecleo rápido
   * - distinctUntilChanged para evitar cálculos innecesarios
   */
  private termino = toSignal(
    this.buscar.valueChanges.pipe(
      startWith(this.buscar.value),   // valor inicial
      debounceTime(200),              // espera 200ms tras dejar de teclear
      distinctUntilChanged()
    ),
    { initialValue: this.buscar.value }
  );

  /**
   * Maneja el cambio de orden desde el <select>.
   */
  onOrdenChange(ev: Event) {
    const value = (ev.target as HTMLSelectElement).value as any; // 'recientes' | ...
    this.orden.set(value);
  }

  // ---------------------------------------------------------
  // Modal de justificación
  // ---------------------------------------------------------

  // Controla si se muestra el modal de justificación
  verJust = signal(false);

  // Datos de la justificación seleccionada (nombre, correo, texto)
  justSel = signal<Solicitud | null>(null);


  // ---------------------------------------------------------
  // Ciclo de vida
  // ---------------------------------------------------------

  ngOnInit() {
    this.cargarPendientes();
  }

  // ---------------------------------------------------------
  // Carga de solicitudes pendientes desde el backend
  // ---------------------------------------------------------

  /**
   * Llama al backend para obtener la lista de usuarios con solicitud pendiente.
   * Mapea la respuesta a la estructura Solicitud y maneja errores.
   */
  private cargarPendientes() {
    this.cargando.set(true);
    this.error.set(null);
    this.okMsg.set(null);

    this.users.getPendingWithSolicitudes().pipe(
      map(resp => {
        const data = resp?.data ?? [];
        return data.map((u: any) => ({
          id: String(u.id),
          nombre: `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim(),
          correo: u.correo,
          justificacion: (u.justificacion ?? '—').toString(),
          // Convertimos el string de fecha a Date, ajustando 'Z' si falta
          fecha: u.creado_en
            ? new Date(u.creado_en.endsWith('Z') ? u.creado_en : u.creado_en + 'Z')
            : null,
        })) as Solicitud[];
      }),
      catchError((err) => {
        this.error.set(`No se pudo cargar: ${err?.status || ''} ${err?.statusText || ''}`);
        return of<Solicitud[]>([]);
      }),
      finalize(() => this.cargando.set(false)),
    ).subscribe(lista => this.solicitudes.set(lista));
  }

  // ---------------------------------------------------------
  // Helpers buscador/orden
  // ---------------------------------------------------------

  /**
   * Normaliza texto:
   * - a minúsculas
   * - sin tildes
   * - espacios múltiples → uno solo
   */
  private norm(s: string) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Devuelve el timestamp numérico de la fecha de la solicitud,
   * para poder ordenar por recientes/antiguos.
   */
  private ts(s: Solicitud): number {
    return s.fecha ? s.fecha.getTime() : NaN;
  }

  /**
   * Lista final visible en la tabla:
   * - Filtrada por buscador (nombre + correo).
   * - Ordenada según el criterio seleccionado (orden).
   */
  visibles = computed(() => {
    const q = this.norm(this.termino() ?? '');
    let xs = this.solicitudes();

    // --- filtro por texto en nombre + correo ---
    if (q) {
      xs = xs.filter(s => {
        const hay = this.norm(s.nombre + ' ' + s.correo);
        return hay.includes(q);
      });
    }

    // --- orden según 'orden' seleccionado ---
    const ord = this.orden();

    xs = [...xs].sort((a, b) => {
      if (ord === 'nombre') return this.norm(a.nombre).localeCompare(this.norm(b.nombre));
      if (ord === 'correo') return this.norm(a.correo).localeCompare(this.norm(b.correo));

      const av = this.ts(a), bv = this.ts(b);
      const aNan = Number.isNaN(av), bNan = Number.isNaN(bv);
      if (aNan && bNan) return 0;
      if (aNan) return 1;   // sin fecha → al final
      if (bNan) return -1;

      return ord === 'recientes' ? (bv - av) : (av - bv);
    });

    return xs;
  });

  // ---------------------------------------------------------
  // Lógica de justificación (modal de texto largo)
  // ---------------------------------------------------------

  /**
   * Abre el modal de justificación para una solicitud dada.
   */
  abrirJustificacion(s: Solicitud) {
    this.justSel.set(s);
    this.verJust.set(true);
  }

  /**
   * Cierra el modal de justificación y limpia selección.
   */
  cerrarJustificacion() {
    this.verJust.set(false);
    this.justSel.set(null);
  }

  abrirAprobarDesdeJust(s: Solicitud | null) {
    if (!s) return;
    this.cerrarJustificacion();
    this.abrirAprobar(s);
  }

  abrirRechazarDesdeJust(s: Solicitud | null) {
    if (!s) return;
    this.cerrarJustificacion();
    this.abrirRechazar(s);
  }

  // ---------------------------------------------------------
  // Abrir modales de aprobar / rechazar
  // ---------------------------------------------------------

  /**
   * Abre el modal para aprobar una solicitud.
   * - Selecciona la fila
   * - Setea la acción en 'aprobar'
   * - Valor por defecto de rol: 'user'
   */
  abrirAprobar(s: Solicitud)  {
    this.sel.set(s);
    this.accion.set('aprobar');
    this.rol.set('user');
    this.okMsg.set(null);
    this.error.set(null);
  }

  /**
   * Abre el modal para rechazar una solicitud.
   */
  abrirRechazar(s: Solicitud) {
    this.sel.set(s);
    this.accion.set('rechazar');
    this.okMsg.set(null);
    this.error.set(null);
  }

  /**
   * Cierra el modal de aprobar/rechazar y resetea flags.
   */
  cerrarModal() {
    this.sel.set(null);
    this.accion.set(null);
    this.enviando.set(false);
  }

  // ---------------------------------------------------------
  // Confirmar acción (aprobar / rechazar)
  // ---------------------------------------------------------

  /**
   * Ejecuta la acción elegida sobre la solicitud seleccionada:
   * - Si es 'aprobar', llama al endpoint de approveUser asignando rol.
   * - Si es 'rechazar', llama al endpoint deleteUser para guardar eliminado_en.
   * En ambos casos:
   * - Muestra loader global.
   * - Maneja errores.
   * - Elimina la fila aprobada/rechazada de la tabla.
   */
  confirmar() {
    const s = this.sel();
    if (!s) return;

    this.enviando.set(true);
    this.error.set(null);
    this.okMsg.set(null);

    this.loadingSrv.show();

    // ---- APROBAR ----
    if (this.accion() === 'aprobar') {
      const admin = this.rol() === 'admin';

      this.users.approveUser(Number(s.id), admin).pipe(
        catchError(err => {
          this.error.set(`No se pudo aprobar: ${err?.status || ''} ${err?.statusText || ''}`);
          return of(null);
        }),
        finalize(() => {
          this.enviando.set(false);
          this.loadingSrv.hide();
        })
      ).subscribe(resp => {
        if (!resp) return;
        this.okMsg.set('Usuario aprobado correctamente.');
        this.removerFila(s.id);

        // ----- CORREO: pendiente -> aprobado -----
        const email = getEstadoCuentaEmail('aprobada', {
          nombre: s.nombre,
          correo: s.correo,
          rol: this.rol(), // 'admin' | 'user'
        });

        this.mail.sendMail(s.correo, email.subject, email.bodyHtml).subscribe({
          error: (err) =>
            console.error('Error enviando correo de aprobación', err),
        });

      });

    // ---- RECHAZAR ----
    } else if (this.accion() === 'rechazar') {
      // obtener adminId del login actual (por si backend lo registra)
      const adminId = this.auth.getUserId();
      if (!adminId) {
        this.error.set('No se pudo obtener el ID del administrador autenticado.');
        this.enviando.set(false);
        this.loadingSrv.hide();
        return;
      }

      // usar delete_user para que backend registre eliminado_en y admin
      this.users.deleteUser(Number(s.id)).pipe(
        catchError(err => {
          this.error.set(`No se pudo rechazar: ${err?.status || ''} ${err?.statusText || ''}`);
          return of(null);
        }),
        finalize(() => {
          this.enviando.set(false);
          this.loadingSrv.hide();
        })
      ).subscribe(resp => {
        if (!resp) return;
        this.okMsg.set('Usuario rechazado y registrado con fecha de eliminación.');
        this.removerFila(s.id);

        // ----- CORREO: pendiente -> rechazado -----
        const email = getEstadoCuentaEmail('rechazada', {
          nombre: s.nombre,
          correo: s.correo,
        });

        this.mail.sendMail(s.correo, email.subject, email.bodyHtml).subscribe({
          error: (err) =>
            console.error('Error enviando correo de rechazo', err),
        });

      });


    } else {
      // Si por alguna razón no hay acción definida
      this.enviando.set(false);
      this.loadingSrv.hide();
    }
  }

  /**
   * Quita una solicitud de la tabla por id
   * y cierra el modal de aprobación/rechazo.
   */
  private removerFila(id: string) {
    this.solicitudes.update(arr => arr.filter(x => x.id !== id));
    this.cerrarModal();
  }
}
