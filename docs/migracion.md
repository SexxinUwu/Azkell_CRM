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

Marcar cuando la pantalla nueva reemplaza a la antigua. ⚠️ = posible duplicado a revisar antes de migrar.

### A. Catálogos
- [x] directorio/conductores *(en /app: consulta, crear/editar con RENIEC y foto, importar, eliminar)*

> Regla de pantallas nuevas: solo la acción principal en el encabezado; todo lo demás (importar, exportar, imprimir, versión actual…) va en la casilla **Otros** (`src/core/ui/MenuOtros.tsx`).
- [ ] directorio/clientes
- [x] preferencias/situaciones *(en /app)*
- [x] almacen/familias · almacen/marcas · almacen/sistemas · almacen/unidades *(en /app; pantalla común `src/modules/catalogos`)*
- [ ] almacen/proveedores
- [x] almacen/almacenes *(en /app)*

### B. Flota
- [x] flota/placas *(piloto completo en /app; pendiente solo la API propia con Prisma)*
- [x] flota/documentos *(en /app desde 2026-10-16: expediente por placa, matriz con datos generales y Excel, calendario, historial por documento, eliminar, WhatsApp, TIVE y otros tipos personalizados. Eliminar e importar vehículos están en Flota › Placas. Pendiente: quitar archivo en el formulario)*
- [x] flota/disponibilidad *(en /app, 2026-10-16: cifras por placa como la versión actual, estados (taller, viaje), búsqueda, Excel con ubicación GPS, observaciones manuales. Pendiente: los gráficos por sub tipo siguen como tabla, sin gráfico ni clic)*
- [ ] flota/ubicacion (GPS Wialon)
- [ ] flota/entrega-vehiculos · seguridad/entrega-vehiculos ⚠️

### C. Mantenimiento
- [ ] mantenimiento/dashboard
- [ ] mantenimiento/ordenes · mantenimiento/trabajos-ot · mantenimiento/reportes-ot
- [ ] mantenimiento/inspecciones *(en /app: estado de la flota, historial, ficha y registrar; falta editar/PDF/importar)*
- [~] mantenimiento/checklist *(en /app: Nuevo reporte de fallas con fotos, firma y falla crítica, optimizado para celular. Configurar sistemas de revisión sigue en la versión actual)*
- [ ] mantenimiento/planificacion · mantenimiento/configuracion-mp · mantenimiento/kits-mp *(tipos-mp ya en /app)*
- [ ] mantenimiento/backlog-taller
- [~] mantenimiento/status-rampa *(en /app: tablero, ingresar, editar, liberar y reactivar, evidencia, OT desde la visita, eliminar rampa, configurador de rampas, PDF y WhatsApp del reporte. Falta: columna de inspección y PDF por rampa)*
- [ ] mantenimiento/neumaticos-ultimas · mantenimiento/neumaticos-analisis
- [ ] mantenimiento/fleetrun · administracion/fleetrun-config
- [ ] mantenimiento/config-metrica
- [ ] mantenimiento/productividad · mantenimiento/kpis-taller · mantenimiento/finanzas-taller *(mantenimiento/personal ya en /app)*
- [ ] mantenimiento/incidencias-ruta
- [ ] mantenimiento/otros
- [ ] mantenimiento/combustible · mantenimiento/combustible-vales · mantenimiento/combustible-analisis ⚠️ (¿duplican operaciones/combustible-*?)

### D. Almacén
- [x] almacen/inventario *(en /app, verificado en navegador 2026-10-16: búsqueda y filtros, exportar Excel solo con lo filtrado, plantilla e importación. Pendiente de decisión: que los contadores del encabezado sigan la búsqueda; hoy son totales)*
- [ ] almacen/entradas · almacen/salidas
- [~] almacen/kardex *(en /app con costo unitario, costo promedio y valor de saldo. El servidor devuelve `{ movimientos }` y la app lo adapta; la versión actual sigue igual)*
- [~] almacen/recepcion-compras *(en /app es la versión oficial, con recepción en dólares y TC SUNAT del día. La pantalla clásica no se modifica)*
- [ ] almacen/costos · almacen/dashboard-financiero

### E. Operaciones
- [~] operaciones/ordenes-viaje · operaciones/marsisa-ordenes-viaje ⚠️ (variante por empresa) *(en /app: alerta de documentos vencidos por placa, resumen financiero en la ficha (flete, gastos de ruta, margen y rentabilidad), órdenes de servicio del viaje, sincronización con MarsisaSoft)*
- [ ] operaciones/ordenes-servicio
- [ ] operaciones/programacion · operaciones/asignacion · operaciones/rutas
- [ ] operaciones/monitoreo · operaciones/reporte-viajes
- [ ] operaciones/combustible-vales · operaciones/marsisa-combustible-vales ⚠️
- [ ] operaciones/combustible-analisis · operaciones/urea-analisis
- [ ] operaciones/combustible-estaciones · operaciones/combustible-matriz
- [ ] operaciones/guias-remision · operaciones/guia-remitente · operaciones/guia-transportista (SUNAT)
- [ ] operaciones/conductor-portal · operaciones/conductor/portal ⚠️ (candidato a trabajo sin conexión)

### F. Tesorería y Gerencia
- [ ] tesoreria/caja · tesoreria/caja-chica · tesoreria/movimientos
- [ ] tesoreria/bancos · tesoreria/cuentas
- [ ] tesoreria/flujo-caja · tesoreria/centros-costos
- [~] tesoreria/liquidaciones *(en /app; el cierre automático LIQUIDADO se probó en base local, falta confirmarlo en producción)*
- [~] tesoreria/pago-requerimientos *(en /app con columna de vencimiento según la condición de pago de la O/C)*
- [ ] gerencia/aprobaciones-oc · gerencia/aprobaciones-caja · gerencia/aprobaciones/caja ⚠️

### G. RRHH y Seguridad
- [x] rrhh/personal *(en /app como Directorio › Personal, estilo Contactos: lista A–Z, tarjeta, RENIEC, foto, fotocheck, ficha, vCard, Excel). Corregido: rbac no mapeaba /rrhh y solo entraban administradores*
- [ ] rrhh/asistencia · rrhh/nomina
- [ ] seguridad/unidades · seguridad/unidades-base

### H. Sistema
- [ ] login → Fase 2B
- [ ] dashboard → Centro de Control
- [ ] sistema/usuarios · sistema/perfil
- [ ] sistema/auditoria
- [ ] sistema/configuracion · sistema/ajustes · sistema/integraciones
- [ ] sistema/api-gateway · sistema/superadmin
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
