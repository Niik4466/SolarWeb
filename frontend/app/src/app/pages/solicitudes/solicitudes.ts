import { Component, signal } from '@angular/core';
import { CommonModule, NgFor, NgIf } from '@angular/common';

type Solicitud = {
  id: string;
  nombre: string;
  correo: string;
  justificacion: string;  // ✅ asegúrate de tener esta propiedad
  fecha: string;
};


const SEED: Solicitud[] = [
  {
    id: '1',
    nombre: 'Javiera González Riquelme',
    correo: 'javiera.gonzalez@gmail.com',
    justificacion: 'Solicito acceso a los registros de irradiancia solar y datos meteorológicos del proyecto SolarWeb con el propósito de realizar un análisis comparativo sobre la eficiencia energética de distintos materiales fotovoltaicos utilizados en techos urbanos. El estudio forma parte de mi proyecto de título para la carrera de Ingeniería Civil en Energía de la Universidad Austral de Chile, y busca correlacionar los niveles de radiación y temperatura superficial con la eficiencia de conversión de paneles instalados en distintos puntos de Valdivia. Además, pretendo usar estos datos para construir modelos predictivos de generación eléctrica a corto plazo, lo cual podría contribuir al diseño de sistemas de almacenamiento energético optimizados. La información será utilizada exclusivamente con fines académicos, respetando los lineamientos de confidencialidad del proyecto y citando las fuentes correspondientes en el informe final.',
    fecha: '2025-11-01'
  },
  {
    id: '2',
    nombre: 'Matías Herrera Valenzuela',
    correo: 'matias.herrera@outlook.com',
    justificacion: 'Usar registros para proyecto de titulación.',
    fecha: '2025-11-01'
  },
  {
    id: '3',
    nombre: 'Felipe Castro Morales',
    correo: 'felipe.castro@alumnos.uach.cl',
    justificacion: 'Acceso para sistema de pronóstico en laboratorio.',
    fecha: '2025-11-02'
  },
  {
    id: '4',
    nombre: 'Valentina Soto Aravena',
    correo: 'valentina.soto@alumnos.uach.cl',
    justificacion: 'Comparar con mediciones in situ.',
    fecha: '2025-11-03'
  }
];


@Component({
  selector: 'app-solicitudes',
  standalone: true,
  imports: [CommonModule, NgFor, NgIf],
  templateUrl: './solicitudes.html',
  styleUrls: ['./solicitudes.scss'],
})
export class SolicitudesComponent {
  solicitudes = signal<Solicitud[]>([...SEED]);

  sel = signal<Solicitud | null>(null);
  accion = signal<'aprobar' | 'rechazar' | null>(null);
  rol = signal<'admin' | 'user'>('user');
  // Estado para ver justificación completa
  verJust = signal(false);
  justSel = signal<{ nombre: string; correo: string; justificacion: string } | null>(null);

  abrirJustificacion(s: Solicitud) {
    this.justSel.set({ nombre: s.nombre, correo: s.correo, justificacion: s.justificacion });
    this.verJust.set(true);
  }

  cerrarJustificacion() {
    this.verJust.set(false);
    this.justSel.set(null);
  }

  abrirAprobar(s: Solicitud) { this.sel.set(s); this.accion.set('aprobar'); this.rol.set('user'); }
  abrirRechazar(s: Solicitud) { this.sel.set(s); this.accion.set('rechazar'); }
  cerrarModal() { this.sel.set(null); this.accion.set(null); }

  confirmar() {
    const s = this.sel(); if (!s) return;
    if (this.accion() === 'aprobar') {
      console.log('Aprobada:', s, 'rol:', this.rol());
    } else {
      console.log('Rechazada:', s);
    }
    // Quita la fila (dummy)
    this.solicitudes.update(arr => arr.filter(x => x.id !== s.id));
    this.cerrarModal();
  }
}
