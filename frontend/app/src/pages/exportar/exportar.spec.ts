import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Exportar } from './exportar';

describe('Exportar', () => {
  let component: Exportar;
  let fixture: ComponentFixture<Exportar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Exportar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Exportar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
