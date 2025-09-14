# Casos de Prueba — HU-1A: Gestionar solicitudes (aceptar/rechazar + rol)

> **Objetivo HU**: Admin aprueba o rechaza solicitudes, asigna rol y notifica al usuario.

---

## F-1A-01 | Aceptar con asignación de rol
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional  
**Pasos:** Admin aprueba solicitud → selecciona rol admin/usuario.  
**Resultado esperado:** Usuario pasa a lista de aprobados con rol correcto; recibe notificación.  
**Oráculo:** Aserciones en BD + UI.  

---

## F-1A-02 | Rechazar solicitud
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional  
**Resultado esperado:** Solicitud removida; notificación de rechazo.  
**Oráculo:** DOM + BD.  
