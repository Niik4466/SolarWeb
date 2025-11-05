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
  },
  {
    id: '5',
    nombre: 'Ignacio Rivas Paredes',
    correo: 'ignacio.rivas@alumnos.uach.cl',
    justificacion: 'Requiero acceso a los registros horarios de radiación GHI y DHI para calibrar un modelo de predicción de generación fotovoltaica en tiempo real, como parte del curso de Energías Renovables II. Los datos se integrarán a un simulador que compara la generación esperada versus la medida, con el objetivo de validar su precisión bajo condiciones atmosféricas variables.',
    fecha: '2025-11-04'
  },
  {
    id: '6',
    nombre: 'Constanza Muñoz Araya',
    correo: 'constanza.munoz@alumnos.uach.cl',
    justificacion: 'Necesito información histórica de irradiancia y temperatura ambiente para analizar su influencia sobre los rendimientos de distintos tipos de inversores solares. Este análisis será incluido en un artículo académico sobre eficiencia energética distribuida.',
    fecha: '2025-11-04'
  },
  {
    id: '7',
    nombre: 'Diego Paredes Olivares',
    correo: 'diego.paredes@alumnos.uach.cl',
    justificacion: 'Solicito los datos diarios de radiación solar y nubosidad con el fin de complementar un proyecto de modelación de energía disponible para calefacción solar pasiva en viviendas del sur de Chile. Los resultados se utilizarán para optimizar el diseño de estructuras con orientación norte.',
    fecha: '2025-11-05'
  },
  {
    id: '8',
    nombre: 'María Fernanda Vásquez',
    correo: 'maria.vasquez@uach.cl',
    justificacion: 'Como asistente de investigación del Laboratorio de Energías Renovables, necesito acceder a los registros de irradiancia del último trimestre para revisar la consistencia de los sensores y preparar el informe semestral del proyecto Fondecyt 11220709.',
    fecha: '2025-11-05'
  },
  {
    id: '9',
    nombre: 'Tomás Reyes Leiva',
    correo: 'tomas.reyes@alumnos.uach.cl',
    justificacion: 'Estoy desarrollando una aplicación educativa que muestra datos de radiación solar en tiempo real. Solicito acceso de solo lectura al dataset de irradiancia horaria y temperatura ambiente para integrarlo mediante la API pública de SolarWeb.',
    fecha: '2025-11-05'
  },
  {
    id: '10',
    nombre: 'Camila Arancibia Soto',
    correo: 'camila.arancibia@alumnos.uach.cl',
    justificacion: 'Requiero los registros de radiación de los meses de junio a septiembre para realizar un análisis de estacionalidad y sombreado, como parte de un trabajo práctico de Análisis de Datos Ambientales. La información será usada únicamente con fines educativos.',
    fecha: '2025-11-06'
  },
  {
    id: '11',
    nombre: 'Rodrigo Díaz Vergara',
    correo: 'rodrigo.diaz@uach.cl',
    justificacion: 'Solicito acceso completo a los datos diarios de irradiancia y humedad relativa para validar un modelo meteorológico WRF en desarrollo en el Instituto de Ciencias Ambientales y Evolutivas.',
    fecha: '2025-11-06'
  },
  {
    id: '12',
    nombre: 'Isidora Contreras Alarcón',
    correo: 'isidora.contreras@alumnos.uach.cl',
    justificacion: 'Necesito datos de radiación y temperatura superficial para elaborar un estudio comparativo entre días despejados y nublados, en el contexto de mi memoria sobre predicción de energía solar con redes neuronales.',
    fecha: '2025-11-07'
  },
  {
    id: '13',
    nombre: 'Sebastián Navarro Lagos',
    correo: 'sebastian.navarro@alumnos.uach.cl',
    justificacion: 'Requiero información histórica de irradiancia global para desarrollar una herramienta visual en Python que permita observar patrones de radiación a lo largo del año en la Región de Los Ríos.',
    fecha: '2025-11-07'
  },
  {
    id: '14',
    nombre: 'Andrea Castillo Moraga',
    correo: 'andrea.castillo@uach.cl',
    justificacion: 'Como docente de la Facultad de Ciencias de la Ingeniería, solicito acceso temporal a la base de datos de irradiancia y temperatura superficial para utilizarla en actividades prácticas del ramo Energías Sustentables.',
    fecha: '2025-11-07'
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
