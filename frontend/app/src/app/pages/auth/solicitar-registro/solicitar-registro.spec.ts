import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SolicitarRegistroComponent } from './solicitar-registro';

describe('SolicitarRegistroComponent', () => {
  let component: SolicitarRegistroComponent;
  let fixture: ComponentFixture<SolicitarRegistroComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SolicitarRegistroComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SolicitarRegistroComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
