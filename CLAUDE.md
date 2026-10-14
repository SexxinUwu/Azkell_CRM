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
fleet_sesion         // bandera '1' de sesión activa (el JWT va en la cookie HttpOnly; en nativo se usa fleet_token)
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

> Estado verificado en el código el 2026-10-14. Marca `[x]` = completado.

### 📌 Migración React

- [x] ~~Stubs de Almacén, Mantenimiento, Operaciones, Tesorería y Sistema~~ — todos tienen implementación real en `src/modules/` (la lista de stubs anterior estaba desactualizada). Operaciones: varias pantallas redirigen al clásico por decisión.
- [x] ~~`MantDashboardPage.tsx`: conectar endpoints reales~~ — ahora usa `/taller-rampas` (ocupación real de rampas; `/taller/status` existe en `server.js` pero lista OTs, no rampas) y vigencia de inspecciones con `evaluarCiclo` (antes adivinaba campos que no existen).
- [x] ~~`gerencia/DashboardPage.tsx`: conectar endpoints reales~~ — ahora usa `/taller-rampas` y los campos de inventario correctos (`stock_actual` / `stock_min`).
- [x] ~~Librería de gráficos~~: **Recharts 3.10.1** (fijada). Tremor se descartó porque exige Tailwind y este proyecto usa CSS propio. Los donuts SVG a mano se retiraron.
- [x] `mant-dashboard` y `dashboard` (Centro de Comando): gráficos migrados a Recharts en React (ver §13).

- [x] ~~Inventario: filtro de familias tapaba la lista~~ — ahora es una casilla desplegable multiselect (`src/core/ui/MultiSelect.tsx`).
- [x] ~~Ficha sin estilos (`.dato`, `.tarjeta__*`)~~ — el CSS compartido vivía en `personal.css`; movido a `src/core/ui/ui.css` (afectaba ~45 pantallas).

- [x] ~~Barra del celular con nombres de módulo~~: `ModuleDock` (Inicio, un botón por módulo, Ajustes al final). Tocar un módulo abre su lista de pantallas; Ajustes reúne cuenta, color, Configuración, Sistema, instalar app y cerrar sesión. Reemplaza a `TabBar`.
- [x] ~~Color de la app elegible~~: `src/core/lib/accent.ts` + `AccentPicker` (Ajustes en celular, Mi cuenta en escritorio). Guardado por dispositivo en `fleet_accent`.
- [x] ~~Auditoría renovada~~: línea de tiempo por día con filtros (tipo, persona, fechas) y vista "Registro firmado".
- [x] ~~Bienvenida/despedida~~: misma animación en web y celular, solo con transform y opacidad (FLIP), centrada con CSS (`WelcomeTransition`, `FarewellTransition`). `LiteSplash` queda solo para "reducir movimiento". **Falta probar en teléfono real.**

### 🔧 Lógica por migrar — estado al 2026-10-14
Todas las pantallas del menú ya tienen versión React con **datos reales y escritura**. Lo que sigue en la versión actual son flujos largos o de riesgo, enlazados desde "Otros" de cada pantalla.

**Hecho (con alta/edición/acciones/Excel):** Recepción de compras, Kardex, Planificación, Trabajos de OT, Status de rampa (ingresar/editar/liberar/reactivar/evidencia), Disponibilidad, Documentos de flota, Reporte de fallas (nuevo con fotos y firma, eliminar), Entrega de vehículos (acta con inventario y firmas), Checklist de entrega, Bancos, Centros de costos y motivos, Liquidaciones (compensación), Cuentas por cobrar, Caja, Asistencia (tareo), Nómina (planilla y SST), Clientes, Proveedores (directorio), Integraciones (Wialon/SUNAT), Órdenes de viaje (+Marsisa), Vales de combustible (+Marsisa), Órdenes de servicio (estado), Guías de remitente y transportista (emitir/sincronizar), Análisis de combustible y urea (auditoría), Programación (agenda), Garita (salida/retorno), Panel patrimonial (registro por corte), Portal del conductor (gastos).

**Pendiente en el clásico (por diseño, con enlace):**
- [x] ~~Reporte de fallas: **generar OTs**~~ — `GenerarOTsSheet.tsx` (desde el detalle del reporte). Configurar sistemas de revisión sigue en el clásico.
- [x] ~~Status de rampa: crear OT y **eliminar rampa**~~ — "Nueva OT" en la visita y "Eliminar" con confirmación (borra OTs hijas en cadena).
- [x] ~~Órdenes de viaje~~: órdenes de servicio del viaje (las rutas son sus OS, `SeccionOrdenesServicioViaje`), "Nueva OS" con el viaje precargado, gastos del viaje en solo lectura (depósitos y liquidaciones; se registran en Tesorería) y sincronización con MarsisaSoft (`ViajeExtras.tsx`).
- [x] ~~Órdenes de servicio: **crear/editar**~~ con rutas, flete e impuesto, y guías (GRE) de "disponibles sin servicio" (`OrdenServicioSheet.tsx`).
- [ ] Guías de remitente/transportista: **redactar guía nueva**, emisión masiva y credenciales. **Sin migrar a propósito:** emiten documentos a SUNAT (no reversible); requiere pruebas supervisadas en ambiente de prueba antes de pasar a React.
- [x] ~~Vales~~: importación de Excel (`ImportarValesSheet.tsx`), sincronización con MarsisaSoft y eliminación masiva con selección.
- [x] ~~Cuentas por cobrar~~: importación masiva (`importarCuentas.ts`, mismos encabezados que el clásico) y cambio de factura con nota de crédito (`NotaCreditoSheet.tsx`).
- [~] Garita: checklist de revisión, firmas y fotos hechos en React (`garitaComponentes.tsx`). **PDF del registro** sigue en el clásico (acta HTML). Entrega de vehículos: **croquis de daños y PDF** siguen en el clásico (diagrama SVG + PDF por html2canvas); hay que validarlos visualmente contra el original antes de migrarlos.
- [x] ~~Planificación~~: importar Excel (`ImportarPlanificacionSheet.tsx`), tipos de MP y destinatarios de alertas (`TiposAlertasPage.tsx`). Los kits ya tienen pantalla propia (`kits-mp`).
- [x] ~~Análisis de combustible: matriz de rendimiento y telemetría Wialon~~: matriz en React (`MatrizRendimientoSheet.tsx`) y telemetría CAN Bus por viaje en el detalle (`TelemetriaViaje`). **Auditoría avanzada** del clásico (~2.200 líneas) sigue en la versión actual.
- [x] ~~Trabajos de OT: importación masiva~~ (`ImportarTrabajosSheet.tsx`).
- [x] ~~Centro de Comando y dashboard de mantenimiento: gráficos~~ — con Recharts (`src/core/ui/Graficos.tsx`). Centro de Comando: vigencia de inspecciones en total, motoras y no motoras; mantenimiento: disponibilidad y vigencia.

### 🧪 Pruebas en navegador (sin verificar)
- [ ] **Almacén de flota** (Flota > Almacén de flota, nuevo): asignar artículos a una unidad (salida despachada con destino `Vehiculo`) y devolverlos (entrada de ajuste + `flota_devoluciones`). Endpoints en `routes/almacen-flota.js` (montado en `routes/almacen.js`). Probar con datos reales: saldo por unidad, stock del almacén antes/después y Kardex.
- [ ] Almacén > Inventario: KPIs cambian al buscar y el Excel exporta solo lo filtrado (`modulos/almacen/inventario/logica.js`).
- [ ] `server.js`: límite general 600 req/min (ya en el código; falta reiniciar el servidor para que aplique).
- [ ] Almacén > Otros: tarjeta Kits MP abre el mismo módulo en `modulos/almacen/otros/vista.html` y `AlmacenOtrosPage.tsx`.
- [ ] Probar en navegador los dos dashboards corregidos (Mantenimiento y Gerencia).
- [ ] Probar Inventario: Exportar (solo filtrado), Importar desde Excel y Descargar plantilla (ahora nativos).
- [ ] Probar Auditoría: `/api/auditoria` corregido (faltaba la columna `ip`, ahora se crea y usa la base del cliente).

### 🌙 Ciberseguridad & Arquitectura
- [x] ~~Cookies HttpOnly en frontend~~: en web el JWT ya no se guarda en `localStorage`; solo la bandera `fleet_sesion` ('1') y la cookie `azkell_session` autentica (el interceptor de `logica.js` envía `credentials: 'include'`). En Capacitor nativo se conserva `fleet_token` como respaldo (la cookie no cruza orígenes). Sesiones antiguas se migran solas al abrir. Servidor: `tokenDeSesion(req)` (cookie → Bearer) en `server.js` y `routes/perfil.js` para sesiones activas y `documentos-flota`. **Falta probar:** login, F5, cerrar sesión, Perfil > sesiones activas, y documentos de flota.
- [~] **CSP estricta**: activa en modo SOLO REPORTE (`server.js`, Helmet). No bloquea; las violaciones salen en consola como `[CSP]` desde `/csp-report`. Siguiente: revisar avisos reales, ajustar la lista y pasar a bloqueo (quitar `reportOnly`).
- [x] ~~Desacople de `cdn.tailwindcss.com` en reportes OT/Inspecciones~~ — ya usan `/libs/tailwind.min.js` local; en `Index.html` solo queda el filtro del aviso.
- [x] ~~**Audit trail criptográfico**~~: `log_auditoria` firma HMAC-SHA256 y guarda `antes` / `despues` con `firma_estado`. "Después" = respuesta del servidor (automático); "antes" = el handler lo fija con `req.auditAntes = {...}`. Ya lo usan `PUT /api/usuarios-v2/:id` y `PUT /api/perfil/me` (sin claves). Visible en Sistema > Auditoría > "Registro firmado".
- [x] ~~**Cambio de contraseña manual**~~ (Mi cuenta): mínimo 10 caracteres, distinta de la actual, no común y no filtrada (consulta k-anonymity a la base de filtraciones; si el servicio no responde, no bloquea). Reglas en `services/politica_clave.js`, usadas por `/api/perfil/password` y `/api/cambiar-password`. Ya no se guarda la clave en `password_visible`. Tras cambiarla, usar la clave nueva al ingresar para que el navegador deje de avisar.

**Seguridad ya activa:** JWT_SECRET obligatorio, cookie HttpOnly `azkell_session`, rate limiting (login 20/15min, general 600/min), Helmet (HSTS, frameguard), 2FA TOTP (Admin/Gerencia), `log_auditoria` firmada.

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

