import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IrradianceChart } from './irradiance-chart';

describe('IrradianceChart', () => {
  let component: IrradianceChart;
  let fixture: ComponentFixture<IrradianceChart>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IrradianceChart]
    })
    .compileComponents();

    fixture = TestBed.createComponent(IrradianceChart);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
