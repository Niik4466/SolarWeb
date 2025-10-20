// irradiance-chart.ts
import { Component, Input, OnChanges } from '@angular/core';
import { NgApexchartsModule } from 'ng-apexcharts';
import {
  ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexStroke, ApexXAxis,
  ApexYAxis, ApexTitleSubtitle, ApexLegend, ApexGrid, ApexTooltip, ApexMarkers,
  ApexAnnotations
} from 'ng-apexcharts';

export type Serie = { name: string; data: any[]; color?: string }; // data puede ser number[] O [x,y][]

@Component({
  selector: 'app-irradiance-chart',
  standalone: true,
  imports: [NgApexchartsModule],
  template: `
    <apx-chart
      [series]="series"
      [chart]="chart"
      [xaxis]="xaxis"
      [yaxis]="yaxis"
      [stroke]="stroke"
      [dataLabels]="dataLabels"
      [title]="title"
      [legend]="legend"
      [grid]="grid"
      [tooltip]="tooltip"
      [markers]="markers"
      [annotations]="annotations">
    </apx-chart>
  `,
})
export class IrradianceChartComponent implements OnChanges {
  /** Si true, espera series como [[timestampMs, value], ...] y usa eje datetime */
  @Input() timeSeries = false;

  /** Para modo “categorías” (como lo tenías) */
  @Input() categories: string[] = [];

  /** Series: en modo categorías => number[]; en modo datetime => [number,value][]  */
  @Input() series: ApexAxisChartSeries = [];

  chart: ApexChart = {
    type: 'line',
    height: 420,
    toolbar: { show: false },
    animations: { enabled: false }, // importante si hay muchos puntos
    fontFamily: 'Sansation, sans-serif'
  };
  stroke: ApexStroke = { curve: 'straight', width: 2 }; // straight rinde mejor con muchos puntos
  dataLabels: ApexDataLabels = { enabled: false };
  xaxis: ApexXAxis = { categories: this.categories, title: { text: 'Hora' } };
  yaxis: ApexYAxis = {
    title: { text: 'Irradiancia (W/m²)' },
    min: 0,
    labels: {
      formatter: (v: number) => v.toFixed(0), // Redondear sin decimales
    },
  };
  title: ApexTitleSubtitle = { text: 'Irradiancia vs. Tiempo', align: 'center' };
  legend: ApexLegend = { position: 'right' };
  grid: ApexGrid = { padding: { right: 20 } };
  tooltip: ApexTooltip = {
    x: { formatter: (v: number) => this.timeSeries ? new Date(v).toLocaleTimeString() : String(v) },
    y: { formatter: (v: number) => `${v.toFixed(1)} W/m²` }
  };
  markers: ApexMarkers = { size: 0, hover: { size: 0 } }; // 0 para rendimiento
  annotations: ApexAnnotations = { points: [] };

  ngOnChanges(): void {
    // Configura eje X según modo
    this.xaxis = this.timeSeries
      ? { type: 'datetime', labels: { datetimeUTC: false } }
      : { categories: this.categories, title: { text: 'Hora' } };

    // Etiquetas de máximos: solo en modo categorías (opcional)
    if (!this.timeSeries && this.categories?.length && this.series?.length) {
      this.annotations = {
        points: this.series.map(s => {
          const data = (s as any).data as number[];
          const { max, idx } = this.maxWithIndex(Array.isArray(data) ? data : []);
          return isFinite(max) && idx >= 0 ? {
            x: this.categories[idx],
            y: max,
            marker: { size: 0 },
            label: { text: `${Math.round(max)}`, style: { fontSize: '12px', background: 'transparent' } }
          } : undefined;
        }).filter(Boolean) as any
      };
    } else {
      this.annotations = { points: [] };
    }
  }

  private maxWithIndex(arr: number[]) {
    let max = -Infinity, idx = -1;
    arr.forEach((v, i) => { if (v > max) { max = v; idx = i; } });
    return { max, idx };
  }
}
