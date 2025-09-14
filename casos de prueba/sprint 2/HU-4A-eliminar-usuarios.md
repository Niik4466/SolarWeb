# Casos de Prueba — HU-4A: Eliminar usuarios aprobados

---

## F-4A-01 | Eliminar con confirmación
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional  
**Pasos:** Admin selecciona usuario y hace click “Eliminar”.  
**Resultado esperado:** Modal de confirmación → usuario marcado eliminado; pierde acceso inmediato.  
**Oráculo:** BD + login.  

---

## F-4A-02 | Eliminación permanente tras 30 días
**Propósito:** Validación  
**Clasificación:** Caja blanca; Semiauto; Dinámica; Funcional  
**Resultado esperado:** Usuario no aparece en sistema tras 30 días.  
**Oráculo:** Query BD + UI.  
