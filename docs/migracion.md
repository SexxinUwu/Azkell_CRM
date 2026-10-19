# Migración a la arquitectura KINTSUGI

Plan y avance de la migración de la versión actual (JS, HTML y CSS) a React + TypeScript con diseño Liquid Glass. Reglas en [AGENTS.md](../AGENTS.md).

## Principios

1. **La app nunca se detiene.** Las dos versiones conviven en el mismo servidor y la misma base. La nueva vive en `/app/`.
2. **Activación gradual:** primero el grupo de prueba (permiso `app.nueva`), luego una empresa, luego todas. Si algo falla, se apaga el permiso.
3. **Sin cambios de comportamiento sin aprobación.** Cada regla de negocio de la versión actual se anota en el README del módulo antes de reescribirla.
4. **Migraciones de base solo aditivas** mientras conviva la versión antigua. Respaldo antes de aplicar.
5. **Un módulo a la vez:** leer → anotar reglas → schemas + service + routes → pantalla → comparar lado a lado con datos reales → activar → borrar la versión antigua.

## Decisiones

| Tema | Estado |
| --- | --- |
| Modelo multiempresa | ✅ Una base por empresa (`azkell_master` + `azkell_tenant_*`), un cliente Prisma por empresa resuelto por subdominio. Sin `companyId` |
| Ícono de la animación de ingreso | ✅ El logo de cada empresa (`/api/tenant-logo`); si no tiene, el de Azkell. Como es imagen (no SVG), la animación usa la tarjeta → ícono, un trazo que lo rodea y un brillo, en lugar de dibujar el logo |
| Librería de gráficos | ⏳ Pendiente (hoy Chart.js) |
| Apps Android y TV | ⏳ Pendiente: migrar con el resto o al final |
| Modo oscuro | ⏳ Pendiente |
| Despliegue | Coolify (como KINTSUGI) |
| IA del asistente | Gemini con modelos en cadena, clave propia de este proyecto (`GEMINI_API_KEY`) |

## Auditoría de diseño (cerrada 2026-10-19)

Pasada de diseño sobre las pantallas ya migradas a React, bloque por bloque, cada uno verificado en navegador con datos simulados y con `npm run typecheck` en 0 antes de subirlo a `main`.

| Bloque | Merge a `main` |
| --- | --- |
| Tesorería (caja, bancos, cuentas, centros, liquidaciones, pago de requerimientos) | `f8509d79` |
| Operaciones y combustible (vales, análisis D2, urea, órdenes de viaje) | `6df155c6` |
| Mantenimiento y taller (OT, status de rampa, fallas, incidencias, Fleetrun) y matriz de rendimiento | `0d3b2a57` |
| Almacén (inventario, kardex, recepción de compras, entradas, salidas) | `d8ef690e` |
| Flota y unidades (placas, documentos, checklists, disponibilidad) | `ebb3f032` |
| Personal y conductores (conductores, personal, nómina, asistencia) | `0e772042` |
| Inicio, gerencia y aprobaciones | `82aabdc5` |
| Directorios, catálogos y sistema (clientes, usuarios, auditoría, integraciones, 2FA) | `34f0bc0f` |

**Criterios aplicados en todos los bloques**

1. **Moneda:** `formatSoles` (S/ con espacio no divisible) y `formatDolares` / `formatMoneda` (US$) en `src/core/lib/format.ts`.
2. **Fechas:** `formatFechaPe` (dd/mm/aaaa) y `formatFechaHoraPe` (dd/mm/aaaa HH:mm). El texto sin zona horaria se lee tal cual; las fechas con hora se convierten a Lima.
3. **Jerarquía de color:** botón primario en tinta (`--ink`). El naranja solo marca foco y selección. Verde, ámbar y rojo se usan solo para estados (vigencias, aprobado, vencido). Códigos de producto, OC, placas y números de vale sin naranja.
4. **Interacción:** `.pressable` y `haptic('selection')` en filas, tarjetas, filtros y KPI que tienen acción al tocarlos. Éxito y advertencia en confirmaciones.
5. **Validación en línea:** errores debajo del campo con `<Field error={...}>`. Ningún `alert()` ni toast para errores de validación.

**Reglas de negocio que cambiaron con esta pasada** (acordadas con el usuario)

- Rechazar una OC y anular un movimiento de caja exigen motivo escrito. Antes el rechazo era opcional y la anulación tenía un motivo por defecto.
- RUC/DNI en clientes: 8 u 11 dígitos (persona natural o empresa).
- Brevete: entre 8 y 12 letras o números, para incluir conductores con Carnet de Extranjería o PTP.

**Pendiente, fuera del alcance de la auditoría o sin verificar** (Perfil ya está cerrado)

- **Perfil** (`src/modules/perfil/PerfilPage.tsx`, `CambiarPasswordSheet.tsx`): revisado el 2026-10-19 y verificado en navegador. Filas tocables con háptica, cerrar sesión con advertencia, validación en línea de la contraseña y botón primario en tinta.
- **Catálogos:** las filas no tienen acción al tocarlas; solo sus botones de editar y eliminar son tocables.
- **Integraciones:** las tarjetas son formularios sin acción de toque, por eso no llevan `.pressable`.
- **Fechas de creación** de clientes y usuarios: no se muestran en ninguna lista ni ficha. No se agregaron columnas nuevas.
- **Persona (formulario) y Asistencia:** el brevete de persona y la licencia de asistencia pasan typecheck y comparten la lógica validada en conductores, pero no se probaron en navegador.

## Siguiente paso técnico

**Retirar el auto-sync y los `ALTER` de arranque** (Fase 1, último punto abierto). Hoy `services/tenant_master.js`, `init_db.js` y las rutas copian tablas y columnas desde `DB_NAME` a todas las empresas fuera de las migraciones de Prisma. Mientras eso siga activo, el esquema de cada empresa puede cambiar sin pasar por `npm run db:deploy`. Es el requisito para que `server/core` (Fase 2) use Prisma sin divergencias entre empresas.

En paralelo, un punto de seguridad que no depende del código: **crear un usuario MySQL propio para la app** (hoy usa `root` y el puerto está abierto a internet). La rotación de contraseñas la hace el usuario.

## Fases

- [ ] **Fase 0 — Inventario y limpieza**
  - [x] Skill `apple-design` en `.claude/skills/`
  - [x] `AGENTS.md`, `docs/diseno.md`, este documento
  - [x] Quitar `Código.js` (legado de Apps Script con clave de Gemini)
  - [x] Mover los scripts sueltos de la raíz a `archivo/` (158 archivos; nada del sistema los usa)
  - [x] Secretos fuera del código (95 archivos): todo se lee de `process.env`; valores movidos al `.env`
  - [x] Raíz publicada: `server.js` ahora sirve solo una lista de archivos y las carpetas `modulos/`, `icons/`, `web/` (y `libs/`)
  - [x] `JWT_SECRET` obligatorio al arrancar; sin `MASTER_KEY` la clave maestra ya no da acceso
  - [ ] Rotar los secretos que quedaron en el historial de git (ver lista en la conversación del 2026-10-12)
  - [x] Superadmin: solo con sesión de Fundador (montado después de verifyToken); se quitaron el acceso por dominio/`localhost` y la clave maestra, que estaba escrita en el frontend
  - [x] Eliminados `/test-s3` y `/seguridad/limpiar-plantillas` (públicos: subían a S3 y borraban plantillas)
  - [x] `helmet` con configuración conservadora (CSP estricta pendiente para la app nueva)
  - [x] Sincronización de combustible: errores de conexión en español, sin mostrar valores de configuración
  - [ ] Usuario MySQL propio para la app (hoy usa `root` abierto a internet)
  - [ ] Detallar reglas y endpoints de cada pantalla (se hace al empezar cada módulo)
- [ ] **Fase 1 — Prisma sobre la base existente**
  - [ ] `prisma db pull` de una base de empresa; modelos repartidos por módulo con `@@map`
  - [ ] Migración `0_baseline` marcada como aplicada en cada base de empresa
  - [x] Comparar esquemas entre empresas → [fase1-esquema.md](fase1-esquema.md) (4 empresas, 107 tablas, 64 diferencias de columnas)
  - [x] Respaldo de las 6 bases, restaurado y verificado
  - [x] Casos especiales decididos; SQL de igualación generado y probado en copia ([sql/igualacion-2026-10/](../sql/igualacion-2026-10/))
  - [x] Igualación aplicada en producción el 2026-10-12 (Trahesa, Yogui, Rosymar, Marsisa): 6–10 s por empresa, 0 filas perdidas, 0 diferencias con la copia probada. Respaldo previo en `C:\Users\teffa\Respaldos_Azkell\2026-10-12_1457_antes_igualacion\`
  - [x] `server.js` ya no revierte `frecuencia_horas` al arrancar
  - [x] Esquema Prisma por módulo en `prisma/schema/` (13 módulos, 107 modelos; singular con mayúscula + `@@map`; columnas con su nombre actual) y base maestra en `prisma/master/`
  - [x] Migración `0_baseline` (completada con `scripts/prisma_baseline.js`: 43 columnas `ON UPDATE CURRENT_TIMESTAMP` y 1 calculada) — probada creando una empresa nueva desde cero
  - [x] `0_baseline` marcada como aplicada en producción (maestra + 4 empresas): `npm run db:estado` → todas al día
  - [x] Fórmula del promedio de neumáticos: se queda `(r1+r2+r3)/3` (decisión 2026-10-12), igual en las bases, `init_db.js`, `routes/neumaticos.js` y `0_baseline`
  - [ ] Apagar el "auto-sync" de `services/tenant_master.js` y los `ALTER` de arranque (`server.js`, `init_db.js`, rutas) cuando el servidor nuevo use Prisma: hoy siguen copiando tablas y columnas desde `DB_NAME` a todas las empresas por fuera de las migraciones
    - Revisión de solo lectura del 2026-10-19 (referencia `azkell_tenant_marsisa`): **las empresas no tienen el mismo esquema.** Rosymar, Yoguitransport y Trahesa no tienen `flota_articulos`, `flota_documentos`, `flota_devoluciones`, `flota_movimientos` ni `fallas_conductor`, y les faltan columnas en `auditoria` (`ip`) y `cat_rampas`. Esas tablas las crea el código en tiempo de ejecución (`routes/almacen-flota.js`, `asegurarTablas`), solo donde se usan. `azkell_fleet` (base por defecto, `DB_NAME`) es la más atrasada: 15 tablas menos y decenas de columnas.
    - Orden propuesto: (1) migración de conciliación **solo aditiva** (tablas y columnas faltantes) creada contra una copia y revisada, (2) respaldo y `npm run db:deploy` en cada empresa, (3) quitar el auto-sync de `services/tenant_master.js`, (4) quitar los `asegurarTablas` y DDL de las rutas, (5) que `tenant_provisioner.js` cree empresas con `prisma migrate deploy` en lugar de `initDB()`. No se toca `guias_remision` (SUNAT) sin instrucción.

### Cómo se cambia el esquema desde ahora

1. Editar el módulo en `prisma/schema/<modulo>.prisma`.
2. Crear la migración contra una copia local (nunca contra producción): `npx prisma migrate dev --name <cambio>` con `DATABASE_URL` apuntando a la copia.
3. Revisar el SQL generado: mientras conviva la versión actual, **solo agregar** (columnas, tablas, índices).
4. Respaldo, y luego `npm run db:deploy` aplica la migración en la maestra y en cada empresa (`--solo <slug>` para una sola). `npm run db:estado` muestra qué falta.
5. Nunca `prisma db push` ni `migrate dev` contra producción.
  - [ ] Quitar los `CREATE TABLE` / `ALTER TABLE` del arranque (75 tablas, 261 `ALTER` en el código)
- [ ] **Fase 2 — Base técnica**
  - [x] 2A. Vite + React + TS en `src/`, publicada en `/app/` (`npm run build` → `dist/app`, servida por `server.js`); núcleo de KINTSUGI copiado (`styles`, `ui`, `lib`, `auth`, `layout`)
  - [x] 2B. Login, bienvenida y despedida con el logo de cada empresa; sesión compartida con la versión actual (mismas claves `fleet_*`); permisos de la matriz convertidos a nombres en el cliente
  - [x] 2B. Control de inactividad igual a la versión actual (aviso a los 30 min, salida a los 35; clave compartida `fleet_ultimo_acceso`), con anillo de cuenta regresiva
  - [x] 2C. `AppShell`, barra lateral, `TabBar`, `navigation.ts` con todos los módulos (los no migrados abren la versión actual con ↗), Inicio y Mi cuenta
  - [ ] `server/core`: empresa por subdominio, `requirePermission`, `HttpError`, `audit`, SSE
  - [ ] Conversión de permisos (`insp.l` → `inspecciones.ver`, etc.) con script sobre `permisos_json`
  - [ ] Capacitor apuntando al build de Vite (Android y TV)
  - [ ] Asistente con Gemini en cadena
  - [ ] Revocar el token al cerrar sesión (hoy el JWT sigue válido hasta vencer; el servidor no revisa `sesiones_activas`)
  - [ ] Avisos en vivo (SSE) entre dispositivos: hoy el aviso de conexión solo usa la red del dispositivo
- [ ] **Fase 3 — Piloto: Flota › Placas**
  - [x] Consulta en `/app/placas`: resumen animado, búsqueda, filtros, tarjetas/lista y ficha (datos de la API actual)
  - [x] Crear y editar en la app nueva (mismos endpoints y reglas), con historial de cambios en la ficha
  - [x] Corregido en el servidor actual: la edición ponía la métrica en 'km' siempre, no guardaba 'modelo de motor' y el historial leía de la base por defecto (no de la empresa)
  - [x] Importar desde Excel (con revisión previa) y eliminar (desde la ficha o varias a la vez)
  - [ ] Endpoint propio `/api/v2/placas` con Prisma
- [ ] **Fase 4 — Módulos por grupos** (abajo)
  - [x] Inspecciones, parte 1 (2026-10-12): consulta. Corregido: cachés de inspecciones/GPS/TV compartidas entre empresas (fuga de datos) y fallas sin foto guardadas como "https://empresa.azkell.com/"
  - [x] Conductores (2026-10-12). Corregido: la foto nunca se guardaba (columna TEXT) y rbac dejaba borrar/importar conductores y cambiar métricas sin permiso
  - [~] Avance 2026-10-16: Status de rampa con herramientas (configurador de rampas, PDF y WhatsApp del reporte, OT desde la visita, eliminar rampa); Falla crítica en celular (objetivos ≥ 44 px, fotos reducidas en paralelo, firma con `touch-action: none`); Kardex con costo promedio y valor de saldo; recepción en dólares con TC SUNAT del día (respaldo 3.75); pago de requerimientos con vencimiento; rentabilidad y documentos vencidos en viajes. **Falta probar en teléfono real** la firma y las fotos.
- [ ] **Fase 5 — Cierre:** borrar `Index.html`, `logica.js`, `Modulos/`, `routes/`; cookies HttpOnly; 2FA

## Catálogo de pantallas (93)

> **Estado real (2026-10-16), según el menú:** una entrada sigue en el clásico solo si no tiene pantalla en React. Quedan **13 entradas en el clásico**: Dashboard financiero de almacén, Movimientos de tesorería, Métricas y KPIs, Productividad personal, Reporte financiero de taller, Config. métrica, Frecuencias MP, Estaciones de proveedores, Unidades en Base (seguridad), Notificaciones y SMTP, Empresa, API y desarrolladores, Empresas SaaS (SuperAdmin).
> Pendientes de funcionalidad, no de pantalla: guías SUNAT (a propósito, hasta la fase formal), monitoreo GPS de viajes, asignación y rutas, Entradas al contado (depende de Tesorería), importación de inspecciones.

Marcar cuando la pantalla nueva reemplaza a la antigua. ⚠️ = posible duplicado a revisar antes de migrar.

### A. Catálogos
- [x] directorio/conductores *(en /app: consulta, crear/editar con RENIEC y foto, importar, eliminar)*

> Regla de pantallas nuevas: solo la acción principal en el encabezado; todo lo demás (importar, exportar, imprimir, versión actual…) va en la casilla **Otros** (`src/core/ui/MenuOtros.tsx`).
- [x] directorio/clientes *(en /app)*
- [x] preferencias/situaciones *(en /app)*
- [x] almacen/familias · almacen/marcas · almacen/sistemas · almacen/unidades *(en /app; pantalla común `src/modules/catalogos`)*
- [x] almacen/proveedores *(en /app)*
- [x] almacen/almacenes *(en /app)*

### B. Flota
- [x] flota/placas *(piloto completo en /app; pendiente solo la API propia con Prisma)*
- [x] flota/documentos *(en /app desde 2026-10-16: expediente por placa, matriz con datos generales y Excel, calendario, historial por documento, eliminar, WhatsApp, TIVE y otros tipos personalizados. Eliminar e importar vehículos están en Flota › Placas. Pendiente: quitar archivo en el formulario)*
- [x] flota/disponibilidad *(en /app, 2026-10-16: cifras por placa como la versión actual, estados (taller, viaje), búsqueda, Excel con ubicación GPS, observaciones manuales. Pendiente: los gráficos por sub tipo siguen como tabla, sin gráfico ni clic)*
- [x] flota/ubicacion (GPS Wialon) *(en /app, 2026-10-16: mapa con rumbo y animación, lista agrupada por empresa con casilla y colapso por grupo, KPIs que filtran por estado, historial y playback, WhatsApp. Búsqueda solo por placa o nombre, por decisión previa. Agrupa por empresa; no usa los grupos de Wialon de la clásica)*
- [x] flota/entrega-vehiculos · seguridad/entrega-vehiculos ⚠️ *(en /app, 2026-10-16: una sola pantalla; las dos rutas clásicas eran el mismo archivo. Acta, croquis por configuración y cabina, inventario de partes, firmas y PDF. Pendiente: editar la plantilla del inventario, que sigue en la versión actual)*
- [x] flota/almacen-flota *(en /app, verificado en navegador 2026-10-16: ingreso, asignación a unidad, reingreso y kardex por artículo, con stock actualizado en cada operación)*

### C. Mantenimiento
- [x] mantenimiento/dashboard *(en /app: Torre de Control de taller en tiempo real, visualizador de bahías/rampas con cronómetro en vivo, KPIs de OTs por rango temporal, MTTR en horas, costos acumulados en soles, semáforo preventivo con inspecciones vigentes/próximas/vencidas, alertas de fallas F-MAN-001, clima de Base Lurigancho cuando hay conexión (sin datos si no responde), atajos de teclado [N, R, O, C, F] y hojas laterales de detalle rápido)*
- [x] mantenimiento/ordenes · mantenimiento/reportes-ot *(tablero por estado, ficha con 4 pestañas, pausas con motivo y cronómetro, checklist, cierre con liberación de rampa y disponibilidad, PDF de cierre, Nueva OT con kilometraje sugerido, rampa y backlog)*
- [x] mantenimiento/trabajos-ot *(en /app: estados oficiales Pendiente, En Proceso, Realizado y Aprobado, sin distinguir mayúsculas; búsqueda por placa, técnico, trabajo, OT y ticket; hoja de edición con aprobación del supervisor; exportación a Excel y plantilla de importación)*
- [x] mantenimiento/inspecciones *(estado de la flota, historial, ficha, registrar, editar, PDF oficial, WhatsApp y OT desde la inspección; importación de inspecciones pendiente de confirmar)*
- [x] mantenimiento/checklist *(en /app, verificado en navegador 2026-10-16: listado con filtros por estado y empresa, Excel, nuevo y editar reporte con foto, firma y falla crítica, backlog pendiente de la unidad, generación de OTs, PDF oficial F-MAN-001 con cuadrícula ✓/✕ y envío por WhatsApp. Configurar sistemas de revisión abre la versión actual)*
- [x] mantenimiento/planificacion · mantenimiento/kits-mp *(en /app: planificación con selector de mes y año, estados Programada, Vigente, Atrasada y Completada, formulario e importación desde Excel; Kits MP agrupados por vehículo; tipos-mp ya en /app)*
- [ ] mantenimiento/configuracion-mp *(Frecuencias MP sigue en la versión clásica: no hay pantalla de React para ella)*
- [x] mantenimiento/backlog-taller *(en /app como pestaña Backlog de Órdenes de trabajo; el menú abre esa pestaña directamente)*
- [x] mantenimiento/status-rampa *(en /app, verificado en navegador 2026-10-16: tablero, ingresar, editar, liberar y reactivar, evidencia, OT desde la visita, eliminar rampa, configurador, PDF y WhatsApp del tablero, columna de inspección con semáforo y resumen, y PDF de la rampa con OT, trabajos, materiales y evidencia. Pendiente: una sola foto de evidencia por rampa; liberar actualiza Disponibilidad al consultarla, verificado por código)*
- [x] mantenimiento/neumaticos-ultimas · mantenimiento/neumaticos-analisis *(en /app: pestañas Últimas inspecciones, Requerimientos y Análisis de flota con ?tab=analisis; KPI de vigencia y llantas críticas, marcas y medidas, semáforo por unidad; la fórmula del remanente promedio no cambia)*
- [x] mantenimiento/fleetrun *(en /app: km restante (próximo km − km GPS o del cambio), prioridades Vencido, Por vencer, Vigente y Sin datos, umbrales de la empresa, búsqueda y filtros)*
- [ ] administracion/fleetrun-config *(no hay pantalla de React ni entrada de menú para esta configuración)*
- [ ] mantenimiento/config-metrica
- [ ] mantenimiento/productividad · mantenimiento/kpis-taller · mantenimiento/finanzas-taller *(mantenimiento/personal ya en /app)*
- [x] mantenimiento/incidencias-ruta *(en /app: registro con placa del catálogo de unidades activas, búsqueda con paginación de 50, detalle con costos en soles; sin notificaciones externas; en la base de la empresa)*
- [x] mantenimiento/otros *(en /app)*
- [x] mantenimiento/combustible · mantenimiento/combustible-vales · mantenimiento/combustible-analisis *(resueltas en operaciones/combustible-*, que es lo que usa el menú)*

### D. Almacén
- [x] almacen/inventario *(en /app, verificado en navegador 2026-10-16: búsqueda y filtros, exportar Excel solo con lo filtrado, plantilla e importación. Pendiente de decisión: que los contadores del encabezado sigan la búsqueda; hoy son totales)*
- [~] almacen/entradas *(en React: formulario con proveedor del catálogo y RUC, condición de pago, PEN/USD con tipo de cambio SUNAT, IGV, validación por línea, aprobación V°B° con permiso de gerencia y PDF de la orden. Probado en base real con una orden a crédito: creación, aprobación, visibilidad en Recepción de compras y anulación, con stock y costo intactos. Pendiente: la ruta de aprobación real (envía WhatsApp a Tesorería; no se llamó en la prueba). La variante al contado se cierra al migrar Tesorería, porque depende del pago)*
- [x] almacen/salidas *(en /app, desde la OT: validado de extremo a extremo con datos reales del tenant azkell_fleet: entrada de prueba de 1 bushing a S/ 5,50, salida de 1 hacia una OT de prueba desde el formulario React, stock 0 → 1 → 0, repuesto y costo de S/ 5,50 en la pestaña Repuestos y Costos de la OT, salida en el kardex al costo promedio; luego anuladas la salida, la entrada y la OT de prueba, con stock final 0)*
- [x] almacen/kardex *(en /app, verificado en navegador 2026-10-16: cuatro KPIs (entradas, salidas, stock de apertura y saldo valorizado al costo promedio), encabezado fijo, números a la derecha en fuente monoespaciada y tarjetas en móvil)*
- [x] almacen/recepcion-compras *(en /app, verificado 2026-10-16: tipo de cambio SUNAT del día con equivalente en soles en vivo, y registro atómico en una sola transacción: costo promedio, O/C y cabecera + detalle con rollback si falla. La pantalla clásica no se modifica)*
- [ ] almacen/costos · almacen/dashboard-financiero *(el dashboard financiero sigue en el clásico)*

### E. Operaciones
- [~] operaciones/ordenes-viaje · operaciones/marsisa-ordenes-viaje ⚠️ (variante por empresa) *(en /app: alerta de documentos vencidos por placa, resumen financiero en la ficha (flete, gastos de ruta, margen y rentabilidad), órdenes de servicio del viaje, sincronización con MarsisaSoft solo en el dominio Marsisa; verificado en navegador 2026-10-16 con datos simulados: listado, filtro, ficha, validaciones de finalizar y alta sin conductor. Pendiente: monitoreo GPS y vales desde la ficha, que siguen en el clásico)*
- [x] operaciones/ordenes-servicio *(en /app: consulta por estado (Todas, Pendientes, Iniciadas, Finalizadas, Anuladas), búsqueda, exportación a Excel, alta y edición con rutas, flete e impuesto, cambio de estado y guías disponibles. Todas las rutas del servidor usan la base del tenant. Verificado en navegador 2026-10-16 con datos simulados)*
- [~] operaciones/programacion *(en /app: agenda por día (Hoy, Mañana, fecha), búsqueda, mostrar u ocultar finalizados, enlace a la ficha del viaje y alta de viaje. Verificado en navegador 2026-10-16. Pendiente: operaciones/asignacion y operaciones/rutas, que siguen en el clásico)*
- [ ] operaciones/monitoreo · operaciones/reporte-viajes
- [x] operaciones/combustible-vales · operaciones/marsisa-combustible-vales *(en /app: lista con filtros por estado, combustible, fechas y búsqueda que llega al servidor (placa, proveedor, estación, viaje, conductor); importación desde Excel; sincronización con MarsisaSoft solo en el dominio Marsisa. Verificado en navegador 2026-10-16 con datos simulados)*
- [x] operaciones/combustible-analisis · operaciones/urea-analisis *(en /app: análisis de viajes por producto (combustible y urea) con tabla de viajes y auditoría. Verificado en navegador con datos simulados; los KPI de galones no quedaron confirmados en la prueba)*
- [x] operaciones/combustible-matriz *(en /app: se abre desde Análisis de combustible o directamente con ?matriz=1; el menú lleva ahí. Verificado en navegador)*
- [ ] operaciones/combustible-estaciones *(sigue en el clásico)*
- [ ] operaciones/guias-remision · operaciones/guia-remitente · operaciones/guia-transportista (SUNAT)
- [~] operaciones/conductor-portal · operaciones/conductor/portal *(gastos del conductor en /app; trabajo sin conexión pendiente)*

### F. Tesorería y Gerencia
- [~] tesoreria/caja · tesoreria/caja-chica *(caja en /app; caja chica por confirmar)* · tesoreria/movimientos *(sigue en el clásico)*
- [x] tesoreria/bancos · tesoreria/cuentas *(en /app)*
- [~] tesoreria/flujo-caja · tesoreria/centros-costos *(centros de costos en /app; flujo de caja sigue en el clásico)*
- [x] tesoreria/liquidaciones *(en /app: resumen por viaje con viáticos entregados, comprobantes rendidos, gastos por tipo y saldo a favor de la empresa o del conductor; el estado del viaje se muestra y LIQUIDADO se marca solo cuando el saldo cuadra. Verificado en navegador con datos simulados. El cierre automático en producción sigue pendiente de confirmar; la regla de cajas pendientes queda por decidir)*
- [x] tesoreria/pago-requerimientos *(en /app: vencimiento según la condición de pago (crédito con sus días; contado sin fecha); si la O/C aún no tiene recepción, el vencimiento se estima con la fecha de la orden. Pago con constancia, cuenta origen y monto en S/ o US$. Verificado en navegador con datos simulados)*
- [x] gerencia/aprobaciones-oc · gerencia/aprobaciones-caja *(en /app)*

### G. RRHH y Seguridad
- [x] rrhh/personal *(en /app como Directorio › Personal, estilo Contactos: lista A–Z, tarjeta, RENIEC, foto, fotocheck, ficha, vCard, Excel). Corregido: rbac no mapeaba /rrhh y solo entraban administradores*
- [x] rrhh/asistencia · rrhh/nomina *(en /app)*
- [x] seguridad/unidades *(en /app)*
- [ ] seguridad/unidades-base *(Unidades en Base sigue en el clásico)*

### H. Sistema
- [x] login → Fase 2B *(en /app)*
- [x] dashboard → Centro de Control *(en /app)*
- [x] sistema/usuarios *(en /app)*
- [~] sistema/perfil *(Mi cuenta en /app; sesiones activas por confirmar)*
- [x] sistema/auditoria *(en /app)*
- [x] sistema/ajustes · sistema/integraciones *(en /app)*
- [ ] sistema/configuracion *(Empresa y notificaciones siguen en el clásico)*
- [ ] sistema/api-gateway · sistema/superadmin *(siguen en el clásico)*
- [ ] administracion (raíz)

## Endpoints actuales por archivo (499)

| Archivo | Endpoints | Archivo | Endpoints |
| --- | --- | --- | --- |
| `server.js` | 87 | `routes/tesoreria.js` | 37 |
| `routes/almacen.js` | 72 | `routes/seguridad.js` | 30 |
| `routes/planificacion.js` | 48 | `routes/taller.js` | 30 |
| `routes/combustible.js` | 27 | `routes/guias_remision.js` | 18 |
| `routes/operaciones.js` | 18 | `routes/neumaticos.js` | 16 |
| `routes/guia_transportista.js` | 15 | `routes/mantenimiento.js` | 15 |
| `routes/rrhh.js` | 15 | `routes/checklist.js` | 13 |
| `routes/guia_remitente.js` | 12 | `routes/api-gateway.js` | 10 |
| `routes/clientes.js` | 10 | `routes/perfil.js` | 8 |
| `routes/legacy.js` | 5 | `routes/ordenes_compra.js` | 5 |
| `routes/disponibilidad.js` | 4 | `routes/superadmin.js` | 4 |
