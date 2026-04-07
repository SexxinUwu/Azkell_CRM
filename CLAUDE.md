# Azkell Fleet — Guía de Proyecto

**Responder siempre en ESPAÑOL. Nunca mezclar inglés en respuestas de texto.**

---

## 1. Identidad del Proyecto

- **Nombre:** Azkell Fleet (ERP / Fleet Management System para gestión de flotas)
- **Stack:**
  - **Backend:** Node.js + Express (`server.js`)
  - **Frontend:** Vanilla JS (ES6), HTML5, CSS3, Bootstrap 5
  - **DB:** MySQL en Aiven (case-sensitive, tablas minúsculas)
  - **Deploy:** Render (producción) — URLs relativas `/api/...` nunca absolutas
  - **IA:** Gemini 2.5 Flash vía `consultarGemini` (en `server.js`)
- **Estado:** Migrado de monolito a SPA "App Shell" — aún en migración
- **PWA:** `manifest.json` + `sw.js` (Service Worker cachea app shell; `/api/` siempre va a red)

---

## 2. Reglas Estrictas de Frontend (MANDATORY)

### DOM Defensivo
```javascript
let el = document.getElementById('id');
if(el) el.style.display = 'none';  // NUNCA sin if(el)
```
Toda manipulación de DOM comienza con validación del elemento.

### Variables Globales SPA
**NUNCA uses `let` / `const` en raíz de módulos** = crash "Identifier already declared" al recargar (F5).

```javascript
// ❌ MAL
let chartTotalInst = null;

// ✅ BIEN
window.chartTotalInst = window.chartTotalInst || null;
```

### Manejo de Rutas
- Router inyecta HTML en `<div id="root-dinamico">`
- Estado persiste en `localStorage.getItem('fleet_rutaActual')`
- **Prohibido** usar redirecciones duras (`window.location.href`)
- Flujo: `cargarModuloAislado(ruta)` → inyecta HTML + carga `.js` dinámico → llama `window.init_XXX()`

### Gráficos (Chart.js)
Antes de `new Chart()`, SIEMPRE destruir instancia previa y validar canvas aún en DOM:
```javascript
if (chartInst && !document.contains(chartInst.canvas)) {
    chartInst.destroy();
    chartInst = null;
}
if(!chartInst) chartInst = initGrafico('canvasId');
```

---

## 3. Reglas Estrictas de Backend y Red (MANDATORY)

### SIN Google Apps Script
**PROHIBIDO** sugerir código con `google.script.run` — proyecto ya NO lo usa.
*(GoogleRunner en logica.js es legacy; se reemplaza gradualmente con fetch)*

### API REST
- Todas las requests: `fetch('/api/endpoint')` (relativas, nunca absolutas)
- Wrapped en `try/catch`
- Validar `if (!response.ok)` para evitar crashes

### MySQL en Aiven
- Nombres de tabla: **minúsculas exactas** (case-sensitive)
- Ej: `FROM usuarios` NO `FROM Usuarios`

---

## 4. Arquitectura — SPA Router y Módulos

### Patrón de Módulo
```
Modulos/
├── <categoria>/
│   └── <nombre>/
│       ├── vista.html
│       └── logica.js (contiene window.init_<nombre>)
```

### Flujo de Carga
1. `cargarModuloAislado('categoria/nombre')` — router en `logica.js`
2. Fetch `vista.html` → inyecta en `#root-dinamico`
3. Fetch `logica.js` → ejecuta script dinámico
4. Llama `window.init_<nombre>()` automáticamente
5. Guardar ruta en `localStorage.setItem('fleet_rutaActual', ruta)`

### Módulos Migrados
- `Modulos/dashboard/` — Centro de Comando, gráficos, widgets
- `Modulos/login/` — autenticación, verificarSesionGuardada, cerrarSesion
- `Modulos/Mantenimiento/placas/` — grid+lista, paginación, formulario dinámico
- `Modulos/Mantenimiento/inspecciones/` — status, wizard, PDF, bulkSelect
- `Modulos/Mantenimiento/fleetrun/` — datos Fleetrun (tabla, gráficos, mapas)
- `Modulos/flota/status/` — status flota, agrupación dinámica, PDF export
- `Modulos/flota/ubicacion/` — GPS Wialon (sin Leaflet aún)
- `Modulos/directorio/conductores/` — CRUD conductores, tabla, modal
- `Modulos/sistema/usuarios/` — RBAC, matriz permisos, CRUD usuarios
- `Modulos/sistema/auditoria/` — bitácora actividad

### Variables Globales que Persisten en logica.js
(Accesibles desde todo módulo)
```javascript
dataGlobalInspecciones, dataGlobalPlacas, dataGlobalFleetrun,
dataGlobalAuditoria
isHistorialStatus, expandStatusMap, expandAllStatusState
chartTotalInst, chartMotorasInst, chartNoMotorasInst, chartFleetrunInst
```

---

## 5. localStorage Keys (Persistencia)

Prefijo `fleet_` para evitar conflictos:
```javascript
fleet_user           // email del usuario
fleet_rol            // rol del usuario (admin, usuario, etc)
fleet_correo         // email (duplicado con fleet_user)
fleet_permisos       // JSON de permisos RBAC
fleet_ultimo_acceso  // timestamp último login
fleet_rutaActual     // ruta del módulo actual (navegación SPA)
```

**Important:** `fleet_rutaActual` NUNCA guarda `'login'` (protege contra Infinite Login Loop).

---

## 6. RBAC — Esquema de Permisos (v2)

### Niveles de Acceso
- **Fundador** (`admin@azkell.com`): siempre `{ admin: true }` — blindado en server.js
- **Admin**: `{ admin: true }` en `permisos_json`
- **Personalizado**: Matriz módulo×acción
  ```json
  {
    "insp": {"l":1, "c":1, "e":1, "d":1},
    "placas": {"l":1, "c":0, "e":0, "d":0},
    "fleet": {"l":1, "c":1, "e":1, "d":1},
    "gps": {"l":1},
    "status": {"l":1, "c":0, "e":0, "d":0},
    "seg": {"l":0},
    "cond": {"l":1, "c":1, "e":1, "d":0},
    "mod_auditoria": false
  }
  ```
  (l=lectura, c=crear, e=editar, d=eliminar)

### Validación en Frontend
```javascript
const p = JSON.parse(localStorage.getItem('fleet_permisos'));
const isAdm = p.admin === true;  // ⚠️ Chequeo ESTRICTO (===)
if(isAdm) { /* permitir */ }
```

---

## 7. Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `Index.html` | SPA principal, app shell |
| `logica.js` | Monolito frontend (router, helpers, gráficos, módulos legacy) |
| `estilos.css` | Estilos globales + variables CSS (claro/oscuro) |
| `server.js` | Backend Express — rutas CRUD, IA, endpoints |
| `sw.js` | Service Worker PWA (cache busting v2) |
| `manifest.json` | Config PWA (nombre, icons, etc) |

---

## 8. Bugs Corregidos (Historial)

| Problema | Causa | Solución |
|----------|-------|----------|
| Login 500 | `FROM Usuarios` (mayúscula) | Cambiar a `FROM usuarios` (minúscula) |
| "Error Red" en fetch | URLs absolutas `http://127.0.0.1:3000/api/...` | URLs relativas `/api/...` |
| UTF-8 corrupto | Encoding DB no UTF-8 | Configurar collation MySQL UTF-8 |
| Dashboard UI rota | Referencias a funciones removidas | Defensive checks: `if (typeof func === 'function')` |
| F5 → GPS Flota | Legacy `setTimeout(300ms)` leía `ultimoModuloCRM` | Eliminar setTimeout, usar `fleet_rutaActual` |
| Fleetrun vacío | Race condition: `dataGlobalPlacas` aún cargando | Precarga en `verificarSesionGuardada()` + re-render trigger |
| Chart stale canvas | SPA re-injecciona HTML, instances obsoletas | Destruir canvas antes de new Chart (validar DOM) |
| `poblarSelectsFormularios` crash | Función removida de monolito | Implementar stub → lógica real |
| Modal zombie | Navegación con modal abierto = backdrop bloqueante | Cleanup en `cargarModuloAislado()` (removeChild backdrop, reset body.style) |

---

## 9. Modules: Placas (v8 SaaS)

### Estructura
- **Vista:** Grid de cards + Vista lista (toggle)
- **Paginación:** 16 items/página, `paginaActualPlacas`, `datosFiltradosPlacas[]`
- **Panel derecho:** `id="paneDetallePlaca"` — secciones inline (General/Técnico/Operatividad)
- **Search:** Busca name/cliente/placa, filtro ANTES de view-toggles

### Forms & Selects Dinámicos
```javascript
window.poblarSelectsFormularios(datos)
// Extrae únicos de dataGlobalPlacas:
//  - Marca [index 3], Tipo [5], SubTipo [6], Color [7], Conf [12]
//  - Cliente [1] + RUC [2]
// Llena selects: p_marca, e_marca, etc (ambos modales)
```

### Import/Export
- `descargarPlantillaPlacas()` → descarga Excel plantilla
- `importarExcelPlacas(input)` → sube Excel, importa masivo

---

## 10. Módule: Status Inspecciones

### Tabla de StatusInspecciones
- Agrupación dinámica por **Tipo de Vehículo** (`obtenerTipoCompuesto`)
- Headers de grupo alineados izq, collapses/expands
- Dos vistas: **Últimos Registros** vs **Historial**
- Gráficos (Chart.js): vigentes vs vencidos, desglosado por motoras/no-motoras

### Wizard de Inspección
- Esquema: `WIZARD_SCHEMA` con 5+ fases
- Firma digital: canvas + base64 guardado en DB
- PDF export: HTML2Canvas + jsPDF

---

## 11. Módule: Fleetrun (Datos Flota)

### Datos
- Tabla + gráficos de análisis flota (motoras vs no-motoras, combustible, estado)
- Integración con `dataGlobalPlacas` para info vehículos
- Mode: **Activos** o **Historial** (toggle)

### Fix (Reciente)
- Precarga en `verificarSesionGuardada()` para evitar race condition
- `window.dataGlobalFleetrun` + window pattern para evitar re-declaration crash
- Canvas validation antes de Chart.js instantiation

---

## 12. Convenciones de Código

### Nombres
- Variables privadas: camelCase
- Variables globales (window): camelCase con prefijo (ej `dataGlobalPlacas`)
- Constantes: UPPER_SNAKE_CASE
- IDs HTML: kebab-case (ej `form-editar-placa`)

### Funciones Helpers en logica.js
```javascript
initGrafico(canvasId)              // Crea Chart default (doughnut)
updateGraficosEnVivo(...)          // Actualiza datos gráficos
actualizarColoresGraficos()        // Sincroniza colores claro/oscuro
generarWizardFase3(...)            // Genera fase 3 dinámicamente
cargarModuloAislado(ruta)          // Router SPA
verificarSesionGuardada()          // Precarga datos + F5 restore
descargarExcelDinamico(tablaId, nombre)
exportarAPDF(elemento, nombre)
normalizeStr(str)                  // Uppercase + trim (búsquedas)
```

### Error Handling
```javascript
// Fetch con error handling
try {
    const res = await fetch('/api/datos');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
} catch (err) {
    console.error('Error:', err);
    mostrarAlerta('Error al cargar datos', 'danger');
}

// DOM validation
const el = document.getElementById('id');
if (el) { el.style.display = 'none'; }
```

---

## 13. Pending Issues (Crítico)

- [ ] **DB_PORT missing** — `.env` no tiene `DB_PORT`, resulta en `NaN` en pool MySQL
- [ ] **API keys hardcoded** — Gemini y Wialon en `server.js` (usar `.env`)
- [ ] **toggleBulkBtn** — función no definida en ningún lado (buscar referencias)
- [ ] **Almacén/Inventario** — módulo estructurado pero sin endpoints backend
- [ ] **obtenerDatosAuditoria** — endpoint falta en `server.js`
- [ ] **localStorage crm_* keys** — 4 módulos aún usan `crm_correo` en lugar de `fleet_*`

---

## 14. Cómo Cambiar de Máquina

1. **Clonar repo:** `git clone [URL]`
2. **Instalar deps:** `npm install`
3. **Crear `.env`:**
   ```
   DB_HOST=your-aiven-host
   DB_USER=default
   DB_PASS=password
   DB_PORT=12345
   DB_NAME=azkell_fleet
   GEMINI_API_KEY=xxx
   WIALON_TOKEN=xxx
   ```
4. **Iniciar:** `npm start` (backend en :3000) + abrir `localhost:3000` en navegador
5. **Leer este CLAUDE.md** para entender arquitectura, reglas, y estado actual

---

## 15. Quick Reference — Comandos Útiles

```bash
# Desarrollo
npm start                    # Backend Express

# Git
git status
git add .
git commit -m "msg en español"
git push origin main

# Ver si hay cambios sin trackear
git diff --name-only

# Buscar en code
grep -r "función_nombre" --include="*.js"
```

---

