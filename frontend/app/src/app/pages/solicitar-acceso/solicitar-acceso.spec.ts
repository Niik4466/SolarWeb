import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SolicitarAcceso } from './solicitar-acceso';

describe('SolicitarAcceso', () => {
  let component: SolicitarAcceso;
  let fixture: ComponentFixture<SolicitarAcceso>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SolicitarAcceso]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SolicitarAcceso);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
