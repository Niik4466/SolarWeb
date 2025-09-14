# Casos de Prueba — HU-3U: Login de usuario

> **Objetivo HU**: Permitir acceso a usuarios aprobados; validar credenciales; gestionar sesiones y recuperación de contraseña.

---

## F-3U-01 | Login válido/ inválido
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional  
**SUT:** Formulario de login + backend.  
**Datos:** Credenciales correctas/incorrectas.  
**Resultado esperado:** Correcto → acceso; Incorrecto → mensaje error.  
**Oráculo:** DOM/response.  

---

## F-3U-02 | Logout automático por inactividad
**Propósito:** Validación  
**Clasificación:** Caja negra; Automatizada; Dinámica; Funcional  
**SUT:** Sesiones/token.  
**Pasos:** Mantener sesión abierta inactiva.  
**Resultado esperado:** Sesión expira tras tiempo límite.  
**Oráculo:** Aserción expiración token.  

---

## NF-3U-01 | Seguridad — recuperación de contraseña
**Propósito:** No funcional → Seguridad  
**Clasificación:** Caja negra; Semiautomática; Dinámica  
**SUT:** Mecanismo de recuperación.  
**Pasos:** Click en “Olvidé mi contraseña”.  
**Resultado esperado:** Mail de reseteo o contacto admin.  
**Oráculo:** Validar envío correcto.  
