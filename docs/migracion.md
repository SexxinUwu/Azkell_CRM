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
| Librería de gráficos | ✅ Recharts 3.10.1 (`src/core/ui/Graficos.tsx`). Tremor se descartó porque exige Tailwind; el clásico sigue con Chart.js |
| Apps Android y TV | ⏳ Pendiente: migrar con el resto o al final |
| Modo oscuro | ✅ Claro, oscuro y automático, por dispositivo (Mi cuenta y barra); color de la app elegible (`fleet_accent`) |
| Despliegue | Coolify (como KINTSUGI) |
| Sitios públicos | ✅ `azkell.com` (cartera) y `fleet.azkell.com` (producto), en el mismo servidor y por dominio (`services/sitios_publicos.js`, código en `sitios/`, `npm run build:sitios`). Subdominios reservados: www, app, azkell, fleet, admin, master, seguridad, api |
| Sesiones | ✅ Un token solo vale mientras su fila siga en `sesiones_activas` (`verifyToken`, caché de 15 s). Cerrar sesión y cerrar otras sesiones lo revocan |
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

**Estado al 2026-10-20.** La Fase 1 quedó cerrada (auto-sync y DDL de arranque retirados; migraciones 0 a 6 aplicadas en la maestra y en las 4 empresas). Lo que sigue, en orden:

1. **Desplegar** lo subido a `main` el 2026-10-20 (costos en soles, recepción con TC de la OC, revocación de sesión, documentos de flota, sitios públicos) y verificar en navegador: costos de OT y recepción, flujo de sesión y Notificaciones.
2. **Pantallas sin versión en React** (las casillas `[ ]` del catálogo) y las funciones parciales marcadas `[~]`.
3. **Fase 2 pendiente:** `server/core`, conversión de permisos, Capacitor, Gemini en cadena.
4. **Fase 5 (cierre):** borrar la versión clásica solo cuando no quede nada que abrir en ella.

Seguridad que no depende del código: **usuario MySQL propio para la app** (hoy usa `root` abierto a internet) y **rotar los secretos del historial de git**. La rotación la hace el usuario.

## Deuda técnica

- **`GET /api/tesoreria/movimientos` escribe en la base de datos.** Antes de devolver el libro, borra movimientos de caja de órdenes de compra que ya no existen en `entradas_inv` (`routes/tesoreria.js`, al inicio del handler). Un GET debe ser solo lectura: si React Query lanza dos peticiones en paralelo o dos usuarios cargan la pantalla a la vez, la limpieza puede pisarse o alterar auditorías. Mientras no se quite, el riesgo es bajo porque el borrado solo toca registros huérfanos, pero no debe crecer. **Plan:** mover la limpieza a `POST /api/tesoreria/conciliar-huerfanos` (ejecución explícita, con auditoría) o a un job nocturno, y dejar el GET sin escrituras.

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
- [x] **Fase 1 — Prisma sobre la base existente** *(cerrada 2026-10-20)*
  - [x] Esquema Prisma por módulo a partir de una base de empresa (ver más abajo)
  - [x] Migración `0_baseline` marcada como aplicada en cada base de empresa
  - [x] Comparar esquemas entre empresas → [fase1-esquema.md](fase1-esquema.md) (4 empresas, 107 tablas, 64 diferencias de columnas)
  - [x] Respaldo de las 6 bases, restaurado y verificado
  - [x] Casos especiales decididos; SQL de igualación generado y probado en copia ([sql/igualacion-2026-10/](../sql/igualacion-2026-10/))
  - [x] Igualación aplicada en producción el 2026-10-12 (Trahesa, Yogui, Rosymar, Marsisa): 6–10 s por empresa, 0 filas perdidas, 0 diferencias con la copia probada. Respaldo previo en `C:\Users\teffa\Respaldos_Azkell\2026-10-12_1457_antes_igualacion\`
  - [x] `server.js` ya no revierte `frecuencia_horas` al arrancar
  - [x] Esquema Prisma por módulo en `prisma/schema/` (13 módulos, 107 modelos; singular con mayúscula + `@@map`; columnas con su nombre actual) y base maestra en `prisma/master/`
  - [x] Migración `0_baseline` (completada con `scripts/prisma_baseline.js`: 43 columnas `ON UPDATE CURRENT_TIMESTAMP` y 1 calculada) — probada creando una empresa nueva desde cero
  - [x] `0_baseline` marcada como aplicada en producción (maestra + 4 empresas): `npm run db:estado` → todas al día
  - [x] Fórmula del promedio de neumáticos: se queda `(r1+r2+r3)/3` (decisión 2026-10-12), igual en las bases, `init_db.js`, `routes/neumaticos.js` y `0_baseline`
  - [x] Auto-sync de `services/tenant_master.js` y `ALTER` de arranque apagados (pasos 3, 4 y 5 de abajo, cerrados el 2026-10-19)
    - Revisión de solo lectura del 2026-10-19 (referencia `azkell_tenant_marsisa`): **las empresas no tienen el mismo esquema.** Rosymar, Yoguitransport y Trahesa no tienen `flota_articulos`, `flota_documentos`, `flota_devoluciones`, `flota_movimientos` ni `fallas_conductor`, y les faltan columnas en `auditoria` (`ip`) y `cat_rampas`. Esas tablas las crea el código en tiempo de ejecución (`routes/almacen-flota.js`, `asegurarTablas`), solo donde se usan. `azkell_fleet` (base por defecto, `DB_NAME`) es la más atrasada: 15 tablas menos y decenas de columnas.
    - Orden propuesto: (1) migración de conciliación **solo aditiva** (tablas y columnas faltantes) creada contra una copia y revisada, (2) respaldo y `npm run db:deploy` en cada empresa, (3) quitar el auto-sync de `services/tenant_master.js`, (4) quitar los `asegurarTablas` y DDL de las rutas, (5) que `tenant_provisioner.js` cree empresas con `prisma migrate deploy` en lugar de `initDB()`. No se toca `guias_remision` (SUNAT) sin instrucción.

  - [x] Conciliación aditiva aplicada el 2026-10-19: migración `1_conciliacion_aditiva` (3 tablas `flota_*` y las columnas `auditoria.ip` y `cat_rampas.en_reporte`) en la maestra y en las 4 empresas activas. Respaldo previo en `C:Users	effaRespaldos_Azkell6-10-19_0824_antes_conciliacion` (5 archivos, completos). `fallas_conductor` y `flota_devoluciones` quedan fuera a propósito: ningún código las usa.

  - [x] Paso 3 (2026-10-19): auto-sync retirado de `services/tenant_master.js`. Ya no copia tablas ni columnas entre bases.
  - [x] Paso 5 (2026-10-19): `services/tenant_provisioner.js` crea empresas nuevas con `prisma migrate deploy` y carga las semillas con `services/tenant_seeds.js` (solo datos, `INSERT IGNORE`). `init_db.js` eliminado. `prisma` pasa a dependencias de producción (6.19.3 exacto), porque la imagen se construye con `npm ci --omit=dev`.
  - [x] Arranque (2026-10-19): `server.js` ya no llama a `initDB()` al iniciar.
  - [x] Migración `2_tablas_de_servidor` (desplegada el 2026-10-19; respaldo en `C:Users	effaRespaldos_Azkell6-10-19_0901_antes_migracion_2`; las cuatro empresas quedan iguales a Marsisa) (2026-10-19): `log_auditoria`, `usuarios_2fa`, `webauthn_credentials` y cuatro columnas que una empresa nueva no tenía. Probada en base vacía (queda idéntica a Marsisa, 1720 columnas) y sobre una copia de empresa existente.
  - [x] Migración `3_telemetria_can` (2026-10-19): tabla de telemetría CAN por viaje. Desplegada en las 4 empresas tras respaldo (`Respaldos_Azkell6-10-19_0915_antes_migracion_3`). `routes/telemetria.js` ya no crea tablas.
  - [x] Migración `4_audit_logs` (2026-10-19): tabla de auditoría de actividad. Desplegada en las 4 empresas tras respaldo (`Respaldos_Azkell\2026-10-19_1255_antes_migracion_4`).
  - [x] Migraciones `5_notificaciones` y `6_indice_sesiones` (2026-10-20): historial y reglas de notificaciones; índice por token en `sesiones_activas` (prefijo de 191 caracteres, idempotente). Desplegadas en la maestra y en las 4 empresas tras respaldo (`Respaldos_Azkell\2026-10-20_0956_antes_migraciones_5_y_6`, 5 archivos completos). `npm run db:estado`: todo al día.
  - [x] Paso 4: DDL dentro de las rutas Express (cerrado 2026-10-19). Todas las rutas de la aplicación quedaron sin creación de tablas ni ALTER en tiempo de ejecución, salvo los módulos SUNAT, que se dejan intactos a propósito (`guias_remision`, `guia_transportista`, `guia_remitente`). Último grupo: `rrhh` (función `ensureTablesRRHH`), `checklist` (middleware de `reportes_fallas`) y `mantenimiento` (`ensureTableSql` en callbacks, reescrito con análisis sintáctico). Verificado con base de prueba nueva: rrhh 6/6, checklist 4/4, mantenimiento 5/5 rutas de lectura en 200. El POST de guardado de configuración de inspecciones no se probó con el arnés (solo lecturas).

### Cómo se cambia el esquema desde ahora

1. Editar el módulo en `prisma/schema/<modulo>.prisma`.
2. Crear la migración contra una copia local (nunca contra producción): `npx prisma migrate dev --name <cambio>` con `DATABASE_URL` apuntando a la copia.
3. Revisar el SQL generado: mientras conviva la versión actual, **solo agregar** (columnas, tablas, índices).
4. Respaldo, y luego `npm run db:deploy` aplica la migración en la maestra y en cada empresa (`--solo <slug>` para una sola). `npm run db:estado` muestra qué falta.
5. Nunca `prisma db push` ni `migrate dev` contra producción.
  - [x] Los `CREATE TABLE` / `ALTER TABLE` de arranque y de las rutas ya no corren (paso 4); solo quedan los módulos SUNAT, intactos a propósito
- [ ] **Fase 2 — Base técnica**
  - [x] 2A. Vite + React + TS en `src/`, publicada en `/app/` (`npm run build` → `dist/app`, servida por `server.js`); núcleo de KINTSUGI copiado (`styles`, `ui`, `lib`, `auth`, `layout`)
  - [x] 2B. Login, bienvenida y despedida con el logo de cada empresa; sesión compartida con la versión actual (mismas claves `fleet_*`); permisos de la matriz convertidos a nombres en el cliente
  - [x] 2B. Control de inactividad igual a la versión actual (aviso a los 30 min, salida a los 35; clave compartida `fleet_ultimo_acceso`), con anillo de cuenta regresiva
  - [x] 2C. `AppShell`, barra lateral, `TabBar`, `navigation.ts` con todos los módulos (los no migrados abren la versión actual con ↗), Inicio y Mi cuenta
  - [ ] `server/core`: empresa por subdominio, `requirePermission`, `HttpError`, `audit`, SSE
  - [ ] Conversión de permisos (`insp.l` → `inspecciones.ver`, etc.) con script sobre `permisos_json`
  - [ ] Capacitor apuntando al build de Vite (Android y TV)
  - [ ] Asistente con Gemini en cadena
  - [x] Revocar el token al cerrar sesión (2026-10-20): `verifyToken` exige la fila en `sesiones_activas`; si la consulta falla no se bloquea a nadie. El login desde el dominio raíz también registra su sesión
  - [x] Avisos en vivo (SSE `/api/eventos`, `useLiveUpdates`): cambios entre dispositivos y actividad de auditoría en tiempo real
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
  - [~] Avance 2026-10-19 y 2026-10-20: auditoría de actividad completa (`audit_logs`, pantalla con filtros y actualización en vivo); Empresa, Notificaciones (WhatsApp, correo, SMS) y API y desarrolladores en React; horas y eficiencia por técnico y regularización de técnicos (React y clásico); costos de solicitudes a OT en soles (el servidor decide) y recepción de OC con el TC de la OC; Documentos de flota con plantilla e importación, configurador de placas, calendario del teléfono (.ics) y fechas sin hora en la matriz; exportaciones con fechas nativas de Excel. **Falta verificar en navegador** los costos de OT, la recepción y Notificaciones, y las pantallas nuevas de Documentos de flota en un teléfono.
- [~] Análisis de combustible, CAN (GPS): corregido el periodo del viaje para que use las fechas del viaje como el clásico (commit `8f622b7d`). Según la prueba del responsable de datos del 2026-10-21, BDA828 devuelve telemetría de Wialon para el viaje 2026-00001169. Las placas de Rosymar y Trahesa (BBR902, BBR905, BBK704, ATK888, AJH911, ACL795) no están en la cuenta Wialon de Marsisa y quedan en "Sin datos" por diseño, sin mezclar tokens entre empresas.
- [~] Avance 2026-10-21 (commits `f2dbcc2f`, `065dfaba`, `ac92b2a9`, `bcc294b6`): importaciones con revisión previa (Proveedores, Clientes, Inspecciones, Fleetrun, Neumáticos, Documentos de flota); Fleetrun CRUD, umbrales y Planificación (proyección, repuestos y buscador); Neumáticos con diagrama de ejes, semáforo 6/3 mm en todo el ERP y historial por llanta; Reporte de viajes en React; vales y mapa GPS en Órdenes de viaje (trazado sin corte y pines de paradas y excesos); checklist de fallas con km GPS y viajes recientes (también al editar); Garita con PDF y WhatsApp; Entrega de vehículos con croquis de daños, PDF y plantilla compartida por el servidor (también en el clásico); Almacén con configuración y RUC en Empresas SaaS; auditoría de combustible en Análisis (guardado en vivo y conciliación); Documentos de flota con calendario y `.ics`; grupos de Wialon en Ubicación; tema oscuro en el mapa; retorno de vales `<último destino> - LIMA`; blindaje de `getDb(req)` en `routes/almacen.js`. **Sin probar en navegador ni contra Wialon, Coolify o datos reales.**
- [ ] **Fase 5 — Cierre:** borrar `Index.html`, `logica.js`, `Modulos/`, `routes/`; cookies HttpOnly; 2FA

## Catálogo de pantallas (93)

> **Estado real (2026-10-20), según el menú:** una entrada abre la versión clásica solo si su pantalla de React no existe o si se decidió dejarla (guías SUNAT). El menú toma cada pantalla de `src/modules/<modulo>/rutas.ts` (`conModulos()` en `navigation.ts`), así que una pantalla nueva reemplaza sola al enlace clásico. Ya tienen pantalla en React (pendiente verificar en navegador): Métricas y KPIs, Productividad personal, Frecuencias MP, Config. métrica, Unidades en Base, Empresas SaaS, Flujo de caja y Costos de almacén. **No todo el menú está migrado:** siguen en el clásico las casillas `[ ]` y `[~]` del catálogo, entre ellas las guías de remisión SUNAT (decisión deliberada), asignación, rutas y la pantalla raíz de administración.
> Pendientes de funcionalidad, no de pantalla: guías SUNAT (a propósito, hasta las pruebas supervisadas en ambiente de prueba), asignación y rutas, Entradas al contado (depende de Tesorería), importación de inspecciones, y los sitios públicos que aún no están desplegados.

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
- [x] flota/documentos *(en /app desde 2026-10-16: expediente por placa, matriz con datos generales y Excel, calendario, historial por documento, eliminar, WhatsApp, TIVE y otros tipos personalizados. Eliminar e importar vehículos están en Flota › Placas. Pendiente: quitar archivo en el formulario). **2026-10-20:** descargar plantilla e importar desde Excel (placa nueva = se crea solo la placa; placa existente = la fila del archivo es el estado actual: el documento que no venga queda vacío en la unidad y lo anterior se conserva en su historial, junto con su archivo; la plantilla trae solo PLACA, PROPIEDAD (propia o tercera) y los documentos; tipo, marca, modelo, color, año, serie y empresa no van: esos datos salen siempre de Placas, tanto en la lista como en la matriz), configurador de placas (se guarda en el dispositivo), calendario con botón para agregar al teléfono los vencidos y por vencer (.ics) y fechas de la matriz sin hora. Los tipos de documento son 8: la póliza vehicular pasó a llamarse Seguro vehicular y la póliza carreta se quitó como tipo (sus datos antiguos siguen en la base, sin mostrarse). Importación probada en base temporal; falta probar la pantalla en navegador y el .ics en un teléfono)*
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
- [x] mantenimiento/configuracion-mp *(en /app: frecuencias por marca y modelo con alta, edición, eliminación, plantilla e importación de Excel. Pendiente: verificar en navegador)*
- [x] mantenimiento/backlog-taller *(en /app como pestaña Backlog de Órdenes de trabajo; el menú abre esa pestaña directamente)*
- [x] mantenimiento/status-rampa *(en /app, verificado en navegador 2026-10-16: tablero, ingresar, editar, liberar y reactivar, evidencia, OT desde la visita, eliminar rampa, configurador, PDF y WhatsApp del tablero, columna de inspección con semáforo y resumen, y PDF de la rampa con OT, trabajos, materiales y evidencia. Pendiente: una sola foto de evidencia por rampa; liberar actualiza Disponibilidad al consultarla, verificado por código)*
- [x] mantenimiento/neumaticos-ultimas · mantenimiento/neumaticos-analisis *(en /app: pestañas Últimas inspecciones, Requerimientos y Análisis de flota con ?tab=analisis; KPI de vigencia y llantas críticas, marcas y medidas, semáforo por unidad; la fórmula del remanente promedio no cambia)*
- [x] mantenimiento/fleetrun *(en /app: km restante (próximo km − km GPS o del cambio), prioridades Vencido, Por vencer, Vigente y Sin datos, umbrales de la empresa, búsqueda y filtros)*
- [x] administracion/fleetrun-config *(React: umbrales por UTS en mantenimiento/fleetrun-config, clave `fleetrun_uts_umbrales`. Pendiente verificar en navegador)*
- [x] mantenimiento/config-metrica *(en /app. Pendiente: verificar en navegador)*
- [x] mantenimiento/productividad · mantenimiento/kpis-taller *(en /app. Pendiente: verificar en navegador)*
- [x] mantenimiento/finanzas-taller *(en /app: gasto total de taller, repuestos y mano de obra, costo por OT, evolución mensual de 12 meses, costo por tipo de OT y unidades con mayor costo. Mismos cálculos del clásico (solo OT aprobadas o cerradas). Pendiente: verificar en navegador con datos reales)*
- [x] mantenimiento/incidencias-ruta *(en /app: registro con placa del catálogo de unidades activas, búsqueda con paginación de 50, detalle con costos en soles; sin notificaciones externas; en la base de la empresa)*
- [x] mantenimiento/otros *(en /app)*
- [x] mantenimiento/combustible · mantenimiento/combustible-vales · mantenimiento/combustible-analisis *(resueltas en operaciones/combustible-*, que es lo que usa el menú)*

### D. Almacén
- [x] almacen/inventario *(en /app, verificado en navegador 2026-10-16: búsqueda y filtros, exportar Excel solo con lo filtrado, plantilla e importación. Pendiente de decisión: que los contadores del encabezado sigan la búsqueda; hoy son totales)*
- [~] almacen/entradas *(en React: formulario con proveedor del catálogo y RUC, condición de pago, PEN/USD con tipo de cambio SUNAT, IGV, validación por línea, aprobación V°B° con permiso de gerencia y PDF de la orden. Probado en base real con una orden a crédito: creación, aprobación, visibilidad en Recepción de compras y anulación, con stock y costo intactos. Pendiente: la ruta de aprobación real (envía WhatsApp a Tesorería; no se llamó en la prueba). La variante al contado se cierra al migrar Tesorería, porque depende del pago)*
- [x] almacen/salidas *(en /app, desde la OT: validado de extremo a extremo con datos reales del tenant azkell_fleet: entrada de prueba de 1 bushing a S/ 5,50, salida de 1 hacia una OT de prueba desde el formulario React, stock 0 → 1 → 0, repuesto y costo de S/ 5,50 en la pestaña Repuestos y Costos de la OT, salida en el kardex al costo promedio; luego anuladas la salida, la entrada y la OT de prueba, con stock final 0)*
- [x] almacen/kardex *(en /app, verificado en navegador 2026-10-16: cuatro KPIs (entradas, salidas, stock de apertura y saldo valorizado al costo promedio), encabezado fijo, números a la derecha en fuente monoespaciada y tarjetas en móvil)*
- [x] almacen/recepcion-compras *(en /app, verificado 2026-10-16: tipo de cambio SUNAT del día con equivalente en soles en vivo, y registro atómico en una sola transacción: costo promedio, O/C y cabecera + detalle con rollback si falla. La pantalla clásica no se modifica)*
- [x] almacen/costos *(en /app: valorizado por familia, artículos más caros y consumo por artículo, con los mismos endpoints del clásico. Pendiente: verificar en navegador)*
- [x] almacen/dashboard-financiero *(en /app con agregados del servidor en solo lectura: capital inmovilizado, reposición crítica, stock sin rotación, consumo por familia y tendencia de compras. Pendiente: verificar en navegador)*

### E. Operaciones
- [~] operaciones/ordenes-viaje · operaciones/marsisa-ordenes-viaje ⚠️ (variante por empresa) *(en /app: alerta de documentos vencidos por placa, resumen financiero en la ficha (flete, gastos de ruta, margen y rentabilidad), órdenes de servicio del viaje, sincronización con MarsisaSoft solo en el dominio Marsisa; verificado en navegador 2026-10-16 con datos simulados: listado, filtro, ficha, validaciones de finalizar y alta sin conductor. Pendiente: monitoreo GPS y vales desde la ficha, que siguen en el clásico)*
- [x] operaciones/ordenes-servicio *(en /app: consulta por estado (Todas, Pendientes, Iniciadas, Finalizadas, Anuladas), búsqueda, exportación a Excel, alta y edición con rutas, flete e impuesto, cambio de estado y guías disponibles. Todas las rutas del servidor usan la base del tenant. Verificado en navegador 2026-10-16 con datos simulados)*
- [~] operaciones/programacion *(en /app: agenda por día (Hoy, Mañana, fecha), búsqueda, mostrar u ocultar finalizados, enlace a la ficha del viaje y alta de viaje. Verificado en navegador 2026-10-16. Pendiente: operaciones/asignacion y operaciones/rutas, que siguen en el clásico)*
- [x] operaciones/reporte-viajes *(React: filtros, KPIs, tabla con tramos ida/retorno y Excel. Pendiente verificar en navegador; el descuento de solo tracto quedó en -25 %)*
- [x] operaciones/monitoreo *(el clásico es una maqueta con cifras fijas y sin lógica. Su función está en Flota › Ubicación (mapa en vivo) y en el trazado de la ficha de viaje con paradas y excesos)*
- [x] operaciones/combustible-vales · operaciones/marsisa-combustible-vales *(en /app: lista con filtros por estado, combustible, fechas y búsqueda que llega al servidor (placa, proveedor, estación, viaje, conductor); importación desde Excel; sincronización con MarsisaSoft solo en el dominio Marsisa. Verificado en navegador 2026-10-16 con datos simulados)*
- [x] operaciones/combustible-analisis · operaciones/urea-analisis *(en /app: análisis de viajes por producto (combustible y urea) con tabla de viajes y auditoría. Verificado en navegador con datos simulados; los KPI de galones no quedaron confirmados en la prueba)*
- [x] operaciones/combustible-matriz *(en /app: se abre desde Análisis de combustible o directamente con ?matriz=1; el menú lleva ahí. Verificado en navegador)*
- [x] operaciones/combustible-estaciones *(en /app: alta, edición, eliminación y búsqueda de proveedores con sus estaciones. Pendiente: verificar en navegador)*
- [ ] operaciones/guias-remision · operaciones/guia-remitente · operaciones/guia-transportista (SUNAT)
- [~] operaciones/conductor-portal · operaciones/conductor/portal *(gastos del conductor en /app; trabajo sin conexión pendiente)*

### F. Tesorería y Gerencia
- [~] tesoreria/caja · tesoreria/caja-chica *(caja en /app; caja chica por confirmar)*
- [x] tesoreria/movimientos *(en /app: libro unificado de bancos y caja, con totales en soles y dólares por separado y sin anulados. Pendiente: verificar en navegador)*
- [x] tesoreria/bancos · tesoreria/cuentas *(en /app)*
- [x] tesoreria/flujo-caja · tesoreria/centros-costos *(en /app: flujo de caja con saldo disponible, proyección del mes, gráfico de 12 meses y grupos por centro de costos o cuenta, a partir de los movimientos reales. El clásico tenía cifras escritas a mano. Pendiente: verificar en navegador)*
- [x] tesoreria/liquidaciones *(en /app: resumen por viaje con viáticos entregados, comprobantes rendidos, gastos por tipo y saldo a favor de la empresa o del conductor; el estado del viaje se muestra y LIQUIDADO se marca solo cuando el saldo cuadra. Verificado en navegador con datos simulados. El cierre automático en producción sigue pendiente de confirmar; la regla de cajas pendientes queda por decidir)*
- [x] tesoreria/pago-requerimientos *(en /app: vencimiento según la condición de pago (crédito con sus días; contado sin fecha); si la O/C aún no tiene recepción, el vencimiento se estima con la fecha de la orden. Pago con constancia, cuenta origen y monto en S/ o US$. Verificado en navegador con datos simulados)*
- [x] gerencia/aprobaciones-oc · gerencia/aprobaciones-caja *(en /app)*

### G. RRHH y Seguridad
- [x] rrhh/personal *(en /app como Directorio › Personal, estilo Contactos: lista A–Z, tarjeta, RENIEC, foto, fotocheck, ficha, vCard, Excel). Corregido: rbac no mapeaba /rrhh y solo entraban administradores*
- [x] rrhh/asistencia · rrhh/nomina *(en /app)*
- [x] seguridad/unidades *(en /app)*
- [x] seguridad/unidades-base *(en /app: panorama en vivo, alta, edición y baja del registro en base. Pendiente: verificar en navegador)*

### H. Sistema
- [x] login → Fase 2B *(en /app)*
- [x] dashboard → Centro de Control *(en /app)*
- [x] sistema/usuarios *(en /app)*
- [x] sistema/perfil *(Mi cuenta en /app, con apariencia, color de la app, cambio de contraseña y sesiones activas; cerrar sesión ya revoca el token)*
- [x] sistema/auditoria *(en /app)*
- [x] sistema/ajustes · sistema/integraciones *(en /app)*
- [x] sistema/configuracion *(Empresa y Notificaciones en /app. Notificaciones: canales WhatsApp, correo y SMS, reglas por evento e historial; falta conectar los eventos reales (OC, vencimientos, fin de OT, checklist crítico), cargar credenciales de SMS y probar WhatsApp desde el servidor. Sedes: sin tabla ni decisión)*
- [~] sistema/api-gateway *(API y desarrolladores en /app: llaves, permisos, métricas y registro. Webhooks en pausa hasta definir catálogo de eventos y reintentos)*
- [x] sistema/superadmin *(en /app: listado, alta con aprovisionamiento de la base, edición de plan, límite de unidades, RUC, correo y estado. Pendiente: verificar en navegador)*
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

## Estado de cierre (2026-10-29)

- Escapes al clásico: 0, salvo las guías SUNAT (decisión: el clásico emite a SUNAT hasta validar el sandbox).
- Raíz `/` → app nueva; versión actual en `/clasico`.
- Fase 5 (borrar el clásico: `Index.html`, `logica.js`, `modulos/`, `routes/` del clásico): **no iniciada**. Depende de validar la emisión de guías en sandbox y de las pruebas en navegador de la sección anterior.
- Lista de pendientes de calca: ver `docs/paridad-botones-escape.md`, sección «Estado de cierre».
