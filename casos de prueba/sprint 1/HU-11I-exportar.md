# Casos de Prueba — HU-11I/ HU-4I/ HU-6I/ HU-5I: Exportación de imágenes + datos

> **Objetivo HU-11I**: Selección de rango o días exactos; calendario para seleccionar; eliminar días; descarga ZIP con imágenes dentro del rango; controles claros.  
> **Objetivo HU-4I/6I/5I (Sprint 0 soporte de exportación)**: Validaciones clave de rango y filtros previos/previos a exportar (si aplica UI inicial).

---

## F-11I-01 | Selección de rango y días exactos
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional  
**SUT:** Pestaña Exportar (UI de rango/días).  
**Pasos:** Seleccionar 2025-05-01 → 2025-05-07; quitar 2025-05-03.  
**Resultado esperado:** UI muestra rango y días exactos restantes.  
**Oráculo:** Aserciones DOM/estado.  

---

## F-4I-01 | Validación de fechas (inicio < fin)
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional (Sanidad)  
**SUT:** Validadores de formulario.  
**Datos:** inicio > fin.  
**Resultado esperado:** Mensaje de error; botón Exportar deshabilitado.  
**Oráculo:** Aserciones de validación.  

---

## F-11I-02 | ZIP contiene solo imágenes del rango
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada (E2E); Dinámica; Funcional (Regresión)  
**SUT:** Backend de exportación + UI.  
**Datos:** Rango pequeño con datos conocidos.  
**Pasos:** Ejecutar exportación; descargar ZIP.  
**Resultado esperado:** ZIP incluye únicamente imágenes del rango; nombres y cantidad correctos.  
**Oráculo:** Descomprimir y verificar lista/fechas.  

---

## F-6I-01 | Selección de métricas y tipo de irradiancia (si UI está disponible en S0)
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional  
**SUT:** Controles de métricas/tipo.  
**Pasos:** Elegir tipo=Global; métrica=Promedio.  
**Resultado esperado:** Previsualización/resultado refleja selección.  
**Oráculo:** Aserciones DOM/archivo previo.  

---

## F-5I-01 | Vista previa antes de exportar (resumen)
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional  
**SUT:** Modal de confirmación.  
**Resultado esperado:** Se muestran fechas seleccionadas y filtros; opción de corregir antes de confirmar.  
**Oráculo:** Aserciones DOM.  

---

## NF-11I-01 | Rendimiento Spike en exportación
**Propósito:** No funcional → Rendimiento/Spike  
**Clasificación:** Caja negra; Automatizada; Dinámica  
**SUT:** Endpoint de exportación.  
**Datos:** 20 solicitudes concurrentes en 5 s.  
**Resultado esperado:** ≥ 95% éxito; sin bloquear UI.  
**Oráculo:** Script concurrente + métricas.  
