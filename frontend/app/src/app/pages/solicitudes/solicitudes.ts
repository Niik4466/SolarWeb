import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { catchError, map } from 'rxjs/operators';
import { of } from 'rxjs';
import { UserService } from '../../services/solicitudes.api';

type Solicitud = {
  id: string;
  nombre: string;
  correo: string;
  justificacion: string;
  fecha: string; // ISO o yyyy-MM-dd
};

@Component({
  selector: 'app-solicitudes',
  standalone: true,
  imports: [CommonModule, NgFor, NgIf],
  templateUrl: './solicitudes.html',
  styleUrls: ['./solicitudes.scss'],
})
export class SolicitudesComponent implements OnInit {
  private users = inject(UserService);

  cargando = signal<boolean>(false);
  enviando = signal<boolean>(false); // ✅ bloquea Confirmar mientras llama API
  error = signal<string | null>(null);
  okMsg = signal<string | null>(null);

  solicitudes = signal<Solicitud[]>([]);

  sel = signal<Solicitud | null>(null);
  accion = signal<'aprobar' | 'rechazar' | null>(null);
  rol = signal<'admin' | 'user'>('user'); // se usa al aprobar

  verJust = signal(false);
  justSel = signal<{ nombre: string; correo: string; justificacion: string } | null>(null);

  ngOnInit() {
    this.cargarPendientes();
  }

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
      })
    ).subscribe(lista => {
      this.solicitudes.set(lista);
      this.cargando.set(false);
    });
  }

  abrirJustificacion(s: Solicitud) {
    this.justSel.set({ nombre: s.nombre, correo: s.correo, justificacion: s.justificacion });
    this.verJust.set(true);
  }
  cerrarJustificacion() {
    this.verJust.set(false);
    this.justSel.set(null);
  }

  abrirAprobar(s: Solicitud) { this.sel.set(s); this.accion.set('aprobar'); this.rol.set('user'); this.okMsg.set(null); this.error.set(null); }
  abrirRechazar(s: Solicitud) { this.sel.set(s); this.accion.set('rechazar'); this.okMsg.set(null); this.error.set(null); }
  cerrarModal() { this.sel.set(null); this.accion.set(null); this.enviando.set(false); }

  confirmar() {
    const s = this.sel(); if (!s) return;
    this.enviando.set(true);
    this.error.set(null);
    this.okMsg.set(null);

    if (this.accion() === 'aprobar') {
      const admin = this.rol() === 'admin';
      this.users.approveUser(Number(s.id), admin).pipe(
        catchError(err => {
          this.error.set(`No se pudo aprobar: ${err?.status || ''} ${err?.statusText || ''}`);
          this.enviando.set(false);
          return of(null);
        })
      ).subscribe(resp => {
        if (!resp) return;
        this.okMsg.set('Usuario aprobado correctamente.');
        this.removerFila(s.id);
      });

    } else if (this.accion() === 'rechazar') {
      this.users.updateStatus(Number(s.id), 'eliminado').pipe(
        catchError(err => {
          this.error.set(`No se pudo rechazar: ${err?.status || ''} ${err?.statusText || ''}`);
          this.enviando.set(false);
          return of(null);
        })
      ).subscribe(resp => {
        if (!resp) return;
        this.okMsg.set('Usuario eliminado/rechazado correctamente.');
        this.removerFila(s.id);
      });
    } else {
      this.enviando.set(false);
    }
  }

  private removerFila(id: string) {
    this.solicitudes.update(arr => arr.filter(x => x.id !== id));
    this.enviando.set(false);
    this.cerrarModal();
  }
}
