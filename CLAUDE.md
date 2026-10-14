# Azkell Fleet — Guía de Proyecto

**Responder siempre en ESPAÑOL. Nunca mezclar inglés en respuestas de texto.**

> **Migración en curso:** este archivo describe la versión **actual** (`Index.html`, `logica.js`, `Modulos/`, `routes/`). El código nuevo en `src/`, `server/` y `prisma/` sigue [AGENTS.md](AGENTS.md) (arquitectura KINTSUGI, React + TypeScript, diseño con la skill `apple-design`). Avance y plan en [docs/migracion.md](docs/migracion.md).

---

## 1. Identidad del Proyecto

- **Nombre:** Azkell Fleet (ERP / Fleet Management System para gestión de flotas)
- **Stack:**
  - **Backend:** Node.js + Express (`server.js`)
  - **Frontend:** Vanilla JS (ES6), HTML5, CSS3, Bootstrap 5
  - **DB:** MySQL en VPS propio (case-sensitive, tablas minúsculas)
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

### MySQL en VPS Propio
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

## 8. Patrones de Bugs Recurrentes (no repetir)

- Tablas MySQL en minúsculas exactas (`FROM usuarios`, nunca `Usuarios`).
- Fetch siempre con URL relativa (`/api/...`), nunca absoluta con IP/puerto.
- Antes de `new Chart()`: destruir instancia previa y validar que el canvas siga en el DOM.
- Al navegar con `cargarModuloAislado()`: limpiar cualquier modal/backdrop abierto para evitar bloqueo de UI.
- Precargar datos en `verificarSesionGuardada()` para evitar módulos vacíos por race condition.

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

## 13. Pendientes del ERP

### 📌 Backlog / Próximas Tareas

#### Migración React (estado real al 2026-10-14)
- 93 pantallas en catálogo total. Lo que falta es implementar la lógica en cada stub (todas ya tienen archivo en `src/modules/`).
- Completamente migrados: `placas` (piloto), `conductores`, `personal`, `inspecciones` (consulta), `UsuariosPage`, `FleetrunPage`, `NeumaticosPage` (inspecciones), `OrdenesTrabajoPage` (crear OT + backlog + materiales), `KitsMpPage`, `PagoRequerimientosPage`.
- Pendiente decidir librería de gráficos: SVG inline (ya usada en DashboardPage y MantDashboardPage) vs Recharts/Tremor.

**Dashboards pendientes de conectar (stubs con estructura lista):**
- [ ] `src/modules/mantenimiento/MantDashboardPage.tsx` — 5 queries React Query, componentes SVG propios. Falta conectar endpoints reales. **Prioridad alta** (más avanzado).
- [ ] `src/modules/gerencia/DashboardPage.tsx` — 5 queries React Query (`dashboard/flota`, `ots`, `inventario`, `liquidaciones`, `combustible`). **Prioridad media**.

**Stubs de módulos operativos (falta implementar lógica real):**
- [ ] Almacén: Inventario, Entradas, Salidas, Kardex, Recepción, Proveedores
- [ ] Mantenimiento: Status Rampa, Planificación, Fallas, Incidencias
- [ ] Operaciones: Órdenes Viaje, Servicios, Vales, Guías, Combustible, Urea (muchos son redirects intencionales al clásico)
- [ ] Tesorería: Caja, Liquidaciones, Bancos, CCs, Cuentas
- [ ] Sistema: Auditoría, Integraciones, Usuarios

---

### 🌙 Ciberseguridad & Arquitectura (pendiente)
- [ ] **Cookies HttpOnly en frontend**: backend ya las escribe/lee; falta que el frontend deje el JWT de `localStorage`.
- [ ] **CSP estricta**: deshabilitada mientras haya scripts inline y CDN en la SPA.
- [ ] **Desacople de CDNs externas**: quitar `cdn.tailwindcss.com` de reportes OT/Inspecciones.
- [ ] **Audit trail criptográfico**: tabla `log_auditoria` inmutable (quién, cuándo, IP, antes/después).

**Seguridad ya activa:** JWT_SECRET obligatorio, cookie HttpOnly `azkell_session`, rate limiting (login 20/15min, general 600/min), Helmet (HSTS, frameguard), 2FA TOTP (Admin/Gerencia).

---

## 14. Cómo Cambiar de Máquina

1. **Clonar repo:** `git clone [URL]`
2. **Instalar deps:** `npm install`
3. **Crear `.env`:**
   ```
   DB_HOST=tu-vps-ip-o-dominio
   DB_USER=usuario_mysql
   DB_PASS=password_seguro
   DB_PORT=3306
   DB_NAME=azkell_fleet
   JWT_SECRET=tu_clave_secreta_jwt_fuerte
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

