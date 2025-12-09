import { Component, computed, signal, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { UsersApi, UsuarioOut, TransaccionOut } from '../../services/user.api';
import { AuthService } from '../../services/auth.service';
import { MailApi } from '../../services/mail.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith, debounceTime, distinctUntilChanged, finalize } from 'rxjs/operators';
import { LoadingService } from '../../services/loading.service';
import { HttpErrorResponse } from '@angular/common/http';
import { getEstadoCuentaEmail } from '../../services/mail-template/estado_cuenta';

// -----------------------------------------------------------
// Tipos de apoyo para la UI
// -----------------------------------------------------------

/**
 * Representa al usuario tal como se muestra en la UI de la tabla.
 * Es una versión simplificada/adaptada de UsuarioOut.
 */
type UsuarioUI = {
  id: number;
  nombre: string;
  correo: string;
  aprobado_el: string | null;
  rol: 'owner' | 'admin' | 'user';
  eliminado?: boolean;
  eliminado_el?: string | null;
};

/**
 * Fila que se mostrará en el modal de historial de exportaciones.
 */
type FilaHistorial = {
  fecha: string;     // creado_en de la transacción
  tipo: 'dias' | 'rango';
  fechas: string;    // Lista de días o “ini – fin”
  detalle: string;   // Texto con variables seleccionadas e info de imágenes
};

/**
 * Posibles criterios de orden de la tabla de usuarios.
 */
type Orden = 'recientes' | 'antiguos' | 'nombre' | 'correo';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './usuarios.html',
  styleUrls: ['./usuarios.scss'],
})
export class UsuariosComponent implements OnInit {
  // ---------------------------------------------------------
  // Inyección de servicios
  // ---------------------------------------------------------
  private api = inject(UsersApi);
  private auth = inject(AuthService);
  private loadingSrv = inject(LoadingService);
  private mail = inject(MailApi);  


  /**
   * Obtiene el ID del admin autenticado (según AuthService).
   * Se usa para excluir al usuario actual de ciertas listas.
   */
  private get adminId(): number | null {
    const id = this.auth.getUserId?.() ?? this.auth.adminId ?? null;
    return id != null ? Number(id) : null;
  }

  /**
   * Dada una lista de UsuarioUI, elimina de ella al usuario actual (admin logueado),
   * para evitar que se pueda auto-eliminar.
   */
  private excluirActual(xs: UsuarioUI[]): UsuarioUI[] {
    const id = this.adminId;
    return id == null ? xs : xs.filter(u => u.id !== id);
  }

  // ---------------------------------------------------------
  // Estado principal de usuarios
  // ---------------------------------------------------------

  // Lista de usuarios aprobados (activos)
  listaAprobados = signal<UsuarioUI[]>([]);

  // Lista de usuarios eliminados (papelera)
  listaEliminados = signal<UsuarioUI[]>([]);

  // ---------------------------------------------------------
  // Buscador y orden de la tabla
  // ---------------------------------------------------------

  // Control del input de búsqueda
  buscar = new FormControl('', { nonNullable: true });

  // Criterio de orden actual de la tabla
  orden  = signal<Orden>('recientes'); // default: más recientes primero

  /**
   * Valor del buscador como signal, con debounce, para reaccionar
   * a cambios del input de forma eficiente.
   */
  private termino = toSignal(
    this.buscar.valueChanges.pipe(
      startWith(this.buscar.value),   // valor inicial
      debounceTime(200),              // suaviza tecleo rápido
      distinctUntilChanged()
    ),
    { initialValue: this.buscar.value }
  );

  // Muestra/oculta el modal o sección de usuarios eliminados
  mostrarEliminados = signal(false);

  // Flags de carga y error para la tabla principal
  cargando = signal(false);
  error = signal<string | null>(null);

  // ---------------------------------------------------------
  // Estado del historial de transacciones
  // ---------------------------------------------------------

  cargandoHist = signal(false);
  errorHist = signal<string | null>(null);

  // Usuario cuyo historial se está mostrando actualmente
  historialUser = signal<UsuarioUI | null>(null);

  // Caché en memoria de historial por usuario (para no repetir llamadas)
  privados_histCache = new Map<number, FilaHistorial[]>();

  // ---------------------------------------------------------
  // Ciclo de vida
  // ---------------------------------------------------------

  ngOnInit() {
    this.cargarAprobados();
  }
  
  // ---------------------------------------------------------
  // Manejo de cambios de orden desde el <select>
  // ---------------------------------------------------------

  /**
   * Maneja el change del selector de orden (recientes/antiguos/nombre/correo).
   */
  onOrdenChange(ev: Event) {
    const value = (ev.target as HTMLSelectElement).value as any; // 'recientes' | ...
    this.orden.set(value);
  }

  // ---------------------------------------------------------
  // Mapeo de datos que vienen del backend a UsuarioUI
  // ---------------------------------------------------------

  /**
   * Convierte un UsuarioOut (del backend) a UsuarioUI (para la tabla).
   * - Une nombre + apellido.
   * - Determina rol en base a "rol" o "es_admin".
   * - Marca si está eliminado.
   */
  private mapToUI(u: UsuarioOut): UsuarioUI {
    const nombreCompleto = [u.nombre, u.apellido].filter(Boolean).join(' ');

    let rol: 'owner' | 'admin' | 'user';
    if ((u as any).owner === true) {
      rol = 'owner';
    } else if (u.es_admin === true) {
      rol = 'admin';
    } else {
      rol = 'user';
    }

    return {
      id: u.id,
      nombre: nombreCompleto,
      correo: u.correo,
      aprobado_el: u.aprobado_en ?? null,
      rol,
      eliminado: u.estado === 'eliminado',
      eliminado_el: (u as any).eliminado_en ?? null,
    };
  }

  // ---------------------------------------------------------
  // Carga de usuarios aprobados y eliminados
  // ---------------------------------------------------------

  /**
   * Carga desde el backend la lista de usuarios aprobados
   * y la guarda en listaAprobados (excluyendo el usuario actual).
   */
  private cargarAprobados() {
    this.cargando.set(true);
    this.error.set(null);

    this.api.getByStatus('aprobado').subscribe({
      next: (data) => {
        const mapeados = data.map(u => this.mapToUI(u));
        this.listaAprobados.set(this.excluirActual(mapeados));
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar usuarios aprobados');
        this.cargando.set(false);
      }
    });
  }

  /**
   * Carga desde el backend la lista de usuarios eliminados
   * y la guarda en listaEliminados (excluyendo el usuario actual).
   */
  private cargarEliminados() {
    this.cargando.set(true);

    this.api.getDeletedUsers().subscribe({
      next: (data) => {
        const mapeados = data.map(u => this.mapToUI(u));
        this.listaEliminados.set(this.excluirActual(mapeados));
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar usuarios eliminados');
        this.cargando.set(false);
      }
    });
  }

  /**
   * Abre la "papelera" y dispara la carga de usuarios eliminados.
   */
  abrirPapelera() {
    this.mostrarEliminados.set(true);
    this.cargarEliminados();
  }

  /**
   * Cierra la vista de usuarios eliminados.
   */
  cerrarPapelera() {
    this.mostrarEliminados.set(false);
  }

  /**
   * Computed que representa la lista de usuarios activos
   * (ya excluyendo al usuario actual).
   */
  activos  = computed(() => this.excluirActual(this.listaAprobados()));

  // ---------------------------------------------------------
  // Helpers buscador/orden
  // ---------------------------------------------------------

  /**
   * Normaliza texto:
   * - pasa a minúsculas
   * - remueve tildes
   * - colapsa espacios
   */
  private norm(s: string) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Convierte la fecha de aprobación a timestamp numérico.
   * Sirve para ordenar por recientes/antiguos.
   */
  private ts(u: UsuarioUI): number {
    return u.aprobado_el ? new Date(u.aprobado_el).getTime() : NaN;
  }

  /**
   * Lista final visible en la tabla:
   * - Aplica filtro de búsqueda.
   * - Aplica orden (nombre, correo, recientes, antiguos).
   */
  visibles = computed(() => {
    const q = this.norm(this.termino() ?? '');
    const base = this.activos();

    // Filtro por texto
    let xs = !q ? base : base.filter(u => {
      const hay = this.norm(u.nombre + ' ' + u.correo);
      return hay.includes(q);
    });

    // Orden
    const ord = this.orden();
    xs = [...xs].sort((a, b) => {
      if (ord === 'nombre') return this.norm(a.nombre).localeCompare(this.norm(b.nombre));
      if (ord === 'correo') return this.norm(a.correo).localeCompare(this.norm(b.correo));

      const av = this.ts(a), bv = this.ts(b);
      const aNan = Number.isNaN(av), bNan = Number.isNaN(bv);
      if (aNan && bNan) return 0;
      if (aNan) return 1;   // sin fecha -> al final
      if (bNan) return -1;

      return ord === 'recientes' ? (bv - av) : (av - bv);
    });

    return xs;
  });

  /**
   * Alterna entre orden "recientes" y "antiguos"
   * cuando se hace click en el encabezado de fecha.
   */
  toggleFechaSort() {
    this.orden.set(this.orden() === 'recientes' ? 'antiguos' : 'recientes');
  }

  // ---------------------------------------------------------
  // Helpers para armar historial de transacciones
  // ---------------------------------------------------------

  /**
   * Construye una descripción textual de qué variables se exportaron
   * y si la exportación incluía imágenes.
   */
  private buildDetalle(t: TransaccionOut): string {
    const vars: string[] = [];
    if (t.var_ghi) vars.push('GHI');
    if (t.var_dni) vars.push('DNI');
    if (t.var_global) vars.push('Global');

    const varsTxt = vars.length ? `Vars: ${vars.join(', ')}` : 'Vars: —';
    const imgsTxt = t.imagenes ? 'con imágenes' : 'sin imágenes';

    return `${varsTxt} · ${imgsTxt}`;
  }

  /**
   * Construye el texto de la columna "fechas" del historial:
   * - Para 'dias', une los días exportados.
   * - Para 'rango', muestra "fecha_ini – fecha_fin".
   */
  private buildFechas(t: TransaccionOut): string {
    if (t.tipo_exportar === 'dias') return t.archivos.join(', ');
    if (t.fecha_ini && t.fecha_fin) return `${t.fecha_ini} – ${t.fecha_fin}`;
    return t.archivos?.[0] ?? '—';
  }

  /**
   * Abre el modal de historial para un usuario dado.
   * Si el historial de ese usuario ya está en caché, no vuelve a consultar.
   */
  abrirHistorial(u: UsuarioUI) {
    this.historialUser.set(u);
    this.errorHist.set(null);

    // Si ya lo tenemos en caché, no volvemos a llamar al backend
    if (this.privados_histCache.has(u.id)) return;

    this.cargandoHist.set(true);

    this.api.getUserTransactions(u.id).subscribe({
      next: (res) => {
        const filas: FilaHistorial[] = (res.data || [])
          .map(t => ({
            fecha: t.creado_en,
            tipo: t.tipo_exportar,
            fechas: this.buildFechas(t),
            detalle: this.buildDetalle(t),
          }))
          // Ordenamos de más reciente a más antiguo
          .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

        this.privados_histCache.set(u.id, filas);
        this.cargandoHist.set(false);
      },
      error: (err: HttpErrorResponse) => {
        // Si el backend responde 404, lo interpretamos como “no tiene historial todavía”
        if (err.status === 404) {
          this.privados_histCache.set(u.id, []);   // caché vacío
          this.errorHist.set(null);                // sin error
        } else {
          // otros errores sí son reales (500, 0, etc.)
          this.errorHist.set('No se pudo cargar el historial de transacciones.');
        }
        this.cargandoHist.set(false);
      }
    });
  }

  /**
   * Cierra el modal de historial.
   */
  cerrarHistorial() {
    this.historialUser.set(null);
  }

  /**
   * Devuelve las filas de historial para un usuario particular,
   * o arreglo vacío si aún no hay datos.
   */
  filasHistorialDe(u: UsuarioUI): FilaHistorial[] {
    return this.privados_histCache.get(u.id) ?? [];
  }

  // ---------------------------------------------------------
  // Eliminación / restauración de usuarios
  // ---------------------------------------------------------

  // Usuario marcado para eliminación lógica (en diálogo de confirmación)
  pendiente = signal<UsuarioUI | null>(null);

  // Usuario marcado para eliminación definitiva (en diálogo de confirmación)
  pendienteDef = signal<UsuarioUI | null>(null);

  /**
   * Abre el modal de confirmación de eliminación lógica.
   */
  abrirConfirmacion(u: UsuarioUI) {
    if (!this.puedeEliminar(u)) {
      this.error.set('No tienes permisos para eliminar a este usuario.');
      return;
    }
    this.pendiente.set(u);
  }
  /**
   * Cancela el diálogo de eliminación lógica.
   */
  cancelarEliminacion() {
    this.pendiente.set(null);
  }

  /**
   * Indica si el usuario autenticado puede eliminar (lógica o definitivamente)
   * al usuario u.
   *
   * - Nunca se puede eliminar al OWNER.
   * - OWNER puede eliminar admins y users (pero excluirActual ya evita que se elimine a sí mismo).
   * - Admin normal solo puede eliminar usuarios estándar.
   * - Usuarios estándar no pueden eliminar a nadie.
   */
  puedeEliminar(u: UsuarioUI): boolean {
    // Target OWNER nunca se puede eliminar
    if (u.rol === 'owner') return false;

    const esOwner = this.auth.isOwner?.() ?? false;
    const esAdmin = this.auth.isAdmin?.() ?? false;

    if (esOwner) return true;        // owner puede eliminar a cualquiera menos owner
    if (esAdmin) return u.rol === 'user';

    return false;
  }


  /**
   * Abre el modal de confirmación para eliminación definitiva.
   */

  abrirEliminarDefinitivo(u: UsuarioUI) {
    if (!this.puedeEliminar(u)) {
      this.error.set('No tienes permisos para eliminar a este usuario.');
      return;
    }
    this.pendienteDef.set(u);
  }
  /**
   * Cancela el diálogo de eliminación definitiva.
   */
  cancelarEliminarDefinitivo() {
    this.pendienteDef.set(null);
  }

  /**
   * Confirma la eliminación definitiva desde el modal (pendienteDef).
   * Llama al endpoint de borrado permanente y actualiza la tabla de eliminados.
   */
  confirmarEliminarDefinitivo() {
    const u = this.pendienteDef();
    if (!u) return;

    if (!this.puedeEliminar(u)) {
      this.error.set('No tienes permisos para eliminar a este usuario.');
      this.pendienteDef.set(null);
      return;
    }

    this.error.set(null);
    this.cargando.set(true);
    this.loadingSrv?.show?.();

    this.api.deleteUserPermanently(u.id).pipe(
      finalize(() => {
        this.cargando.set(false);
        this.loadingSrv?.hide?.();
      })
    ).subscribe({
      next: () => {
        // quitar de la lista de eliminados
        this.listaEliminados.update(xs => xs.filter(x => x.id !== u.id));
        this.pendienteDef.set(null);
      },
      error: () => {
        this.error.set('No se pudo eliminar definitivamente el usuario.');
      }
    }); 
  }

  /**
   * Confirma la eliminación lógica de un usuario.
   * - Llama a deleteUser (backend)
   * - Lo saca de listaAprobados
   * - Opcionalmente recarga listaEliminados si la papelera está visible
   */
  confirmarEliminacion() {
    const u = this.pendiente();
    if (!u) return;
    
    if (!this.puedeEliminar(u)) {
      this.error.set('No tienes permisos para eliminar a este usuario.');
      this.pendiente.set(null);
      return;
    }

    const adminId = this.auth.getUserId();
    if (!adminId) {
      this.error.set('No se pudo obtener el ID del administrador autenticado.');
      return;
    }

    this.cargando.set(true);
    this.loadingSrv.show();

    this.api.deleteUser(u.id).pipe(
      finalize(() => {
        // siempre se ejecuta (éxito o error)
        this.cargando.set(false);
        this.loadingSrv.hide();  // oculta overlay global
      })
    ).subscribe({
      next: () => {
        // Lo sacamos de la lista de aprobados
        this.listaAprobados.update(xs => xs.filter(x => x.id !== u.id));

        // Si la papelera está abierta, recargamos eliminados
        if (this.mostrarEliminados()) this.cargarEliminados();

        this.pendiente.set(null);

        // ----- CORREO: aprobado -> eliminado -----
        const email = getEstadoCuentaEmail('desactivada', {
          nombre: u.nombre,
          correo: u.correo,
        });

        // Si tu MailApi solo acepta un body: usa el HTML como body
        this.mail.sendMail(u.correo, email.subject, email.bodyHtml).subscribe({
          error: (err) =>
            console.error('Error enviando correo de desactivación', err),
        });
      },
      error: () => {
        this.error.set('No se pudo eliminar el usuario');
      },
    });

  }

  /**
   * Restaura un usuario desde la papelera:
   * - Actualiza su estado a 'aprobado' en backend.
   * - Lo saca de listaEliminados.
   * - Recarga listaAprobados para reflejar fechas reales desde backend.
   */
  restaurar(u: UsuarioUI) {
    this.api.updateStatus(u.id, 'aprobado').subscribe({
      next: () => {
        this.listaEliminados.update(xs => xs.filter(x => x.id !== u.id));

        // Recargar desde backend → trae aprobación REAL
        this.cargarAprobados();

        // ----- CORREO: eliminado -> aprobado (restaurado) -----
        const email = getEstadoCuentaEmail('reactivada', {
          nombre: u.nombre,
          correo: u.correo,
        });

        this.mail.sendMail(u.correo, email.subject, email.bodyHtml).subscribe({
          error: (err) =>
            console.error('Error enviando correo de reactivación', err),
        });
      },
      error: () => this.error.set('No se pudo restaurar el usuario'),
    });
  }

  /**
   * Elimina definitivamente a un usuario desde la tabla de eliminados
   * (sin pasar por pendienteDef, por ejemplo en un botón directo).
   */
  borrarDefinitivo(u: UsuarioUI) {
    this.error.set(null);
    this.cargando.set(true);
    this.loadingSrv?.show?.(); // usa LoadingService para overlay global

    this.api.deleteUserPermanently(u.id).pipe(
      finalize(() => {
        this.cargando.set(false);
        this.loadingSrv?.hide?.();
      })
    ).subscribe({
      next: () => {
        // sacamos al usuario de la tabla de eliminados
        this.listaEliminados.update(xs => xs.filter(x => x.id !== u.id));
      },
      error: () => {
        this.error.set('No se pudo eliminar definitivamente el usuario.');
      }
    });
  }
}
