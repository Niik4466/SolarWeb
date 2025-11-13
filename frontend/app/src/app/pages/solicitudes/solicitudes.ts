import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { of } from 'rxjs';
import { UserService } from '../../services/solicitudes.api';
import { AuthService } from '../../services/auth.service'; 
import { LoadingService } from '../../services/loading.service';
import { FormControl, ReactiveFormsModule } from '@angular/forms'; 
import { catchError, map, finalize, startWith, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

type Solicitud = {
  id: string;
  nombre: string;
  correo: string;
  justificacion: string;
  fecha: string;
};

type Orden = 'recientes' | 'antiguos' | 'nombre' | 'correo';

@Component({
  selector: 'app-solicitudes',
  standalone: true,
  imports: [CommonModule, NgFor, NgIf, ReactiveFormsModule],
  templateUrl: './solicitudes.html',
  styleUrls: ['./solicitudes.scss'],
})

export class SolicitudesComponent implements OnInit {
  private users = inject(UserService);
  private auth = inject(AuthService); 
  private loadingSrv = inject(LoadingService);

  cargando = signal<boolean>(false);
  enviando = signal<boolean>(false);
  error = signal<string | null>(null);
  okMsg = signal<string | null>(null);

  solicitudes = signal<Solicitud[]>([]);

  sel = signal<Solicitud | null>(null);
  accion = signal<'aprobar' | 'rechazar' | null>(null);
  rol = signal<'admin' | 'user'>('user');

  // ---- buscador y orden (MISMO PATRÓN QUE USUARIOS) ----
  buscar = new FormControl('', { nonNullable: true });
  orden  = signal<Orden>('recientes'); // podrías usarlo después si quieres ordenar

  private termino = toSignal(
    this.buscar.valueChanges.pipe(
      startWith(this.buscar.value),   // valor inicial
      debounceTime(200),              // suaviza tecleo rápido
      distinctUntilChanged()
    ),
    { initialValue: this.buscar.value }
  );

  onOrdenChange(ev: Event) {
    const value = (ev.target as HTMLSelectElement).value as any; // 'recientes' | ...
    this.orden.set(value);
  }

  verJust = signal(false);
  justSel = signal<{ nombre: string; correo: string; justificacion: string } | null>(null);

  ngOnInit() { this.cargarPendientes(); }

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
          fecha: (u.creado_en ?? '').slice(0, 10) || '',
        })) as Solicitud[];
      }),
      catchError((err) => {
        this.error.set(`No se pudo cargar: ${err?.status || ''} ${err?.statusText || ''}`);
        return of<Solicitud[]>([]);
      }),
      finalize(() => this.cargando.set(false)),
    ).subscribe(lista => this.solicitudes.set(lista));
  }

  // normaliza texto (minúsculas, sin tildes, espacios simples)
  private norm(s: string) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // timestamp desde la fecha (para ordenar si quieres usar Orden)
  private ts(s: Solicitud): number {
    return s.fecha ? new Date(s.fecha).getTime() : NaN;
  }

  // Lista final visible: filtrada por buscador y opcionalmente ordenada
  visibles = computed(() => {
    const q = this.norm(this.termino() ?? '');
    let xs = this.solicitudes();

    // --- filtro por nombre + correo ---
    if (q) {
      xs = xs.filter(s => {
        const hay = this.norm(s.nombre + ' ' + s.correo);
        return hay.includes(q);
      });
    }

    // --- si quieres, también puedes ordenar usando this.orden() ---
    const ord = this.orden();

    xs = [...xs].sort((a, b) => {
      if (ord === 'nombre') return this.norm(a.nombre).localeCompare(this.norm(b.nombre));
      if (ord === 'correo') return this.norm(a.correo).localeCompare(this.norm(b.correo));

      const av = this.ts(a), bv = this.ts(b);
      const aNan = Number.isNaN(av), bNan = Number.isNaN(bv);
      if (aNan && bNan) return 0;
      if (aNan) return 1;
      if (bNan) return -1;

      return ord === 'recientes' ? (bv - av) : (av - bv);
    });

    return xs;
  });


  abrirJustificacion(s: Solicitud) {
    this.justSel.set({ nombre: s.nombre, correo: s.correo, justificacion: s.justificacion });
    this.verJust.set(true);
  }
  cerrarJustificacion() { this.verJust.set(false); this.justSel.set(null); }

  abrirAprobar(s: Solicitud)  { this.sel.set(s); this.accion.set('aprobar'); this.rol.set('user'); this.okMsg.set(null); this.error.set(null); }
  abrirRechazar(s: Solicitud) { this.sel.set(s); this.accion.set('rechazar'); this.okMsg.set(null); this.error.set(null); }
  cerrarModal()               { this.sel.set(null); this.accion.set(null); this.enviando.set(false); }

  confirmar() {
    const s = this.sel(); if (!s) return;

    this.enviando.set(true);
    this.error.set(null);
    this.okMsg.set(null);

    this.loadingSrv.show();

    if (this.accion() === 'aprobar') {
      const admin = this.rol() === 'admin';
      this.users.approveUser(Number(s.id), admin).pipe(
        catchError(err => {
          this.error.set(`No se pudo aprobar: ${err?.status || ''} ${err?.statusText || ''}`);
          return of(null);
        }),
        finalize(() => {this.enviando.set(false);
          this.loadingSrv.hide();
        })
      ).subscribe(resp => {
        if (!resp) return;
        this.okMsg.set('Usuario aprobado correctamente.');
        this.removerFila(s.id);
      });

    } else if (this.accion() === 'rechazar') {
      // ✅ obtener adminId del login actual
      const adminId = this.auth.getUserId();
      if (!adminId) {
        this.error.set('No se pudo obtener el ID del administrador autenticado.');
        this.enviando.set(false);
        this.loadingSrv.hide();
        return;
      }

      // ✅ usar delete_user para que guarde eliminado_en y el admin
      this.users.deleteUser(Number(s.id)).pipe(
        catchError(err => {
          this.error.set(`No se pudo rechazar: ${err?.status || ''} ${err?.statusText || ''}`);
          return of(null);
        }),
        finalize(() => {this.enviando.set(false);
          this.loadingSrv.hide();
        })
      ).subscribe(resp => {
        if (!resp) return;
        this.okMsg.set('Usuario rechazado y registrado con fecha de eliminación.');
        this.removerFila(s.id);
      });

    } else {
      this.enviando.set(false);
      this.loadingSrv.hide();
    }
  }

  private removerFila(id: string) {
    this.solicitudes.update(arr => arr.filter(x => x.id !== id));
    this.cerrarModal();
  }
}
