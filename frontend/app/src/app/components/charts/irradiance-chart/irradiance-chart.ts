import { Component, Input, OnChanges } from '@angular/core';
import { NgApexchartsModule } from 'ng-apexcharts';
import {
  ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexStroke, ApexXAxis,
  ApexYAxis, ApexTitleSubtitle, ApexLegend, ApexGrid, ApexTooltip, ApexMarkers, ApexAnnotations
} from 'ng-apexcharts';

export type Serie = { name: string; data: number[]; color?: string };

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
  @Input() categories: string[] = ['6 AM','7 AM','8 AM','9 AM','10 AM','11 AM','12 PM','1 PM','2 PM','3 PM','4 PM','5 PM','6 PM','7 PM','8 PM'];
  @Input() series: ApexAxisChartSeries = [
    { name: 'Global',  data: [0,120,320,520,700,820,960,900,820,720,600,420,220,80,0] },
    { name: 'Direct',  data: [0,100,290,480,650,760,820,780,710,620,510,360,190,60,0] },
    { name: 'Diffuse', data: [0,80,230,380,520,610,680,640,580,510,420,300,160,50,0] },
  ];

  chart: ApexChart = { type: 'line', height: 420, toolbar: { show: false } };
  stroke: ApexStroke = { curve: 'smooth', width: 3 };
  dataLabels: ApexDataLabels = { enabled: false };
  xaxis: ApexXAxis = { categories: this.categories, title: { text: 'Hora' } };
  yaxis: ApexYAxis = { title: { text: 'Irradiancia (W/m^2)' }, min: 0 };
  title: ApexTitleSubtitle = { text: 'Irradiancia vs. Hora', align: 'center' };
  legend: ApexLegend = { position: 'right' };
  grid: ApexGrid = { padding: { right: 20 } };
  tooltip: ApexTooltip = { y: { formatter: (v: number) => `${Math.round(v)} W/m²` } };
  markers: ApexMarkers = { size: 0, hover: { size: 7 } };
  annotations: ApexAnnotations = { points: [] };

  ngOnChanges(): void {
    this.xaxis = { ...this.xaxis, categories: this.categories };
    // add a label at the max of each series (like your screenshot)
    this.annotations = {
      points: this.series.map(s => {
        const { max, idx } = this.maxWithIndex((s as any).data as number[]);
        return {
          x: this.categories[idx],
          y: max,
          marker: { size: 0 },
          label: {
            text: `${Math.round(max)}`,
            style: { fontSize: '12px', background: 'transparent' }
          }
        };
      })
    };
  }

  private maxWithIndex(arr: number[]) {
    let max = -Infinity, idx = -1;
    arr.forEach((v, i) => { if (v > max) { max = v; idx = i; } });
    return { max, idx };
  }
}
