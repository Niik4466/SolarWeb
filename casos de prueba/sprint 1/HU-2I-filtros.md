# Casos de Prueba — HU-2I: Filtros por tipo de irradiancia (global, directa, difusa)

> **Objetivo HU**: Activar/desactivar filtros para comparar curvas dinámicamente.

---

## F-2I-01 | Toggle Global/Directa/Difusa actualiza gráfico
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional  
**SUT:** Controles de filtro + `irradiance-chart`.  
**Pasos:** Desactivar/activar cada filtro.  
**Resultado esperado:** La serie asociada aparece/desaparece sin afectar otras.  
**Oráculo:** Conteo de series en DOM/SVG; no hay errores.  

---

## F-2I-02 | Estado inicial de filtros
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional (Sanidad)  
**SUT:** Vista `/graficos`.  
**Resultado esperado:** Los 3 filtros activos por defecto (según criterios de aceptación).  
**Oráculo:** Aserciones DOM.  

---

## F-2I-03 | Persistencia temporal al cambiar fecha
**Propósito:** Validación  
**Clasificación:** Caja gris; Automatizada; Dinámica; Funcional (Regresión)  
**SUT:** Filtros + calendario + gráfico.  
**Pasos:** Desactivar “difusa”; cambiar fecha; volver.  
**Resultado esperado:** Preferencia persiste si así fue diseñado (o se documenta lo contrario).  
**Oráculo:** Aserción de estado de filtros tras navegación.  

---

## NF-2I-01 | Rendimiento con filtros (10k puntos)
**Propósito:** No funcional → Rendimiento/Volumen  
**Clasificación:** Caja negra; Automatizada; Dinámica  
**SUT:** `irradiance-chart`.  
**Datos:** Dataset grande.  
**Resultado esperado:** Interacción con filtros < 200 ms p95; FPS ≥ 30.  
**Oráculo:** Medición con Performance API.  
