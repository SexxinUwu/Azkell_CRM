# AZKELL FLEET - REGLAS DE ARQUITECTURA Y DESARROLLO

## 1. Identidad del Proyecto
* **Nombre:** Azkell Fleet (ERP / Fleet Management System).
* **Stack:** Node.js (Express) en el backend. Vanilla JS (ES6), HTML5, CSS3 y Bootstrap 5 en el Frontend.
* **Estado:** Migrado de monolito a Arquitectura SPA (Single Page Application) "App Shell".
* **Base de Datos:** MySQL.

## 2. Reglas Estrictas de Frontend (MANDATORY)
* **DOM Defensivo:** NUNCA manipules el DOM directamente sin validar. Usa siempre: `let el = document.getElementById('id'); if(el) el.style.display = 'none';`.
* **Variables Globales SPA:** NUNCA uses `let` o `const` para variables globales en la raíz de los submódulos. Si el usuario recarga la vista, causará un crash "Identifier has already been declared". DEBES usar siempre el objeto window: `window.miVariable = window.miVariable || [];`.
* **Manejo de Rutas:** El Router inyecta vistas en `<div id="root-dinamico">`. El estado persiste en `localStorage.getItem('fleet_rutaActual')`. Prohibido usar redirecciones duras (`window.location.href`).
* **Gráficos (Chart.js):** Antes de instanciar un nuevo gráfico en un canvas, SIEMPRE debes verificar si existe una instancia previa y destruirla (`chart.destroy()`).

## 3. Reglas Estrictas de Backend y Red (MANDATORY)
* **PROHIBIDO GOOGLE APPS SCRIPT:** El proyecto ya NO usa Google Apps Script. Está estrictamente prohibido sugerir código con `google.script.run`.
* **API REST:** Todas las comunicaciones de red deben hacerse usando `fetch` hacia endpoints relativos (ej. `fetch('/api/vehiculos')`) que son procesados por `server.js`.
* **Respuestas Seguras:** Todo `fetch` debe estar envuelto en un bloque `try/catch` y validar `if (!response.ok)` para no crashear el Frontend si el Backend falla.

## 4. Módulos Eliminados/Pausados
* **Status Taller y Órdenes de Trabajo:** Han sido purgados del frontend. No hacer referencia a ellos en el Dashboard.
* **Inventario (Almacén):** Está estructurado pero en pausa hasta crear la BD.