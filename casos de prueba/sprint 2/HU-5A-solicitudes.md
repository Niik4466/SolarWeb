# Casos de Prueba — HU-5A: Visualizar solicitudes de acceso

> **Objetivo HU**: El admin debe ver la lista de solicitudes pendientes o mensaje claro si no hay.

---

## F-5A-01 | Lista de solicitudes pendiente
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional  
**SUT:** Panel admin → pestaña solicitudes.  
**Datos:** 2 solicitudes en BD.  
**Resultado esperado:** Tabla con nombre, correo, justificación.  
**Oráculo:** Aserción DOM.  

---

## F-5A-02 | No hay solicitudes pendientes
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional  
**Datos:** BD vacía.  
**Resultado esperado:** Mensaje “No hay solicitudes pendientes”.  
**Oráculo:** DOM.  
