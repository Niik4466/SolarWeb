import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Imagenes } from './imagenes.component';

describe('Imagenes', () => {
  let component: Imagenes;
  let fixture: ComponentFixture<Imagenes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Imagenes]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Imagenes);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
