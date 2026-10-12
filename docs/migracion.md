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
  - [ ] Superadmin: el acceso por `Host: localhost` se puede falsificar; quitarlo o limitarlo a desarrollo
  - [ ] Seguridad: cerrar `/test-s3` y `/seguridad/limpiar-plantillas`, `helmet`
  - [ ] Detallar reglas y endpoints de cada pantalla (se hace al empezar cada módulo)
- [ ] **Fase 1 — Prisma sobre la base existente**
  - [ ] `prisma db pull` de una base de empresa; modelos repartidos por módulo con `@@map`
  - [ ] Migración `0_baseline` marcada como aplicada en cada base de empresa
  - [x] Comparar esquemas entre empresas → [fase1-esquema.md](fase1-esquema.md) (4 empresas, 107 tablas, 64 diferencias de columnas)
  - [x] Respaldo de las 6 bases, restaurado y verificado
  - [x] Casos especiales decididos; SQL de igualación generado y probado en copia ([sql/igualacion-2026-10/](../sql/igualacion-2026-10/))
  - [ ] Aplicar la igualación en producción (una empresa a la vez)
  - [ ] Quitar los `CREATE TABLE` / `ALTER TABLE` del arranque (75 tablas, 261 `ALTER` en el código)
- [ ] **Fase 2 — Base técnica**
  - [ ] 2A. Vite + React + TS; copiar de KINTSUGI `tokens.css`, `base.css`, `motion.ts`, `haptics.ts`, `src/core/ui/`
  - [ ] 2B. Login, bienvenida y despedida (con ícono de Azkell), sesión compartida con la versión actual, control de inactividad
  - [ ] 2C. `AppShell`, barra lateral, `TabBar`, `ConnectionBanner`, `navigation.ts` con todos los módulos
  - [ ] `server/core`: empresa por subdominio, `requirePermission`, `HttpError`, `audit`, SSE
  - [ ] Conversión de permisos (`insp.l` → `inspecciones.ver`, etc.) con script sobre `permisos_json`
  - [ ] Capacitor apuntando al build de Vite (Android y TV)
  - [ ] Asistente con Gemini en cadena
- [ ] **Fase 3 — Piloto: Flota › Placas**
- [ ] **Fase 4 — Módulos por grupos** (abajo)
- [ ] **Fase 5 — Cierre:** borrar `Index.html`, `logica.js`, `Modulos/`, `routes/`; cookies HttpOnly; 2FA

## Catálogo de pantallas (93)

Marcar cuando la pantalla nueva reemplaza a la antigua. ⚠️ = posible duplicado a revisar antes de migrar.

### A. Catálogos
- [ ] directorio/conductores
- [ ] directorio/clientes
- [ ] preferencias/situaciones
- [ ] almacen/familias · almacen/marcas · almacen/sistemas · almacen/unidades
- [ ] almacen/proveedores
- [ ] almacen/almacenes

### B. Flota
- [ ] flota/placas *(piloto)*
- [ ] flota/documentos
- [ ] flota/disponibilidad
- [ ] flota/ubicacion (GPS Wialon)
- [ ] flota/entrega-vehiculos · seguridad/entrega-vehiculos ⚠️

### C. Mantenimiento
- [ ] mantenimiento/dashboard
- [ ] mantenimiento/ordenes · mantenimiento/trabajos-ot · mantenimiento/reportes-ot
- [ ] mantenimiento/inspecciones
- [ ] mantenimiento/checklist
- [ ] mantenimiento/planificacion · mantenimiento/configuracion-mp · mantenimiento/tipos-mp · mantenimiento/kits-mp
- [ ] mantenimiento/backlog-taller
- [ ] mantenimiento/status-rampa
- [ ] mantenimiento/neumaticos-ultimas · mantenimiento/neumaticos-analisis
- [ ] mantenimiento/fleetrun · administracion/fleetrun-config
- [ ] mantenimiento/config-metrica
- [ ] mantenimiento/personal · mantenimiento/productividad · mantenimiento/kpis-taller · mantenimiento/finanzas-taller
- [ ] mantenimiento/incidencias-ruta
- [ ] mantenimiento/otros
- [ ] mantenimiento/combustible · mantenimiento/combustible-vales · mantenimiento/combustible-analisis ⚠️ (¿duplican operaciones/combustible-*?)

### D. Almacén
- [ ] almacen/inventario
- [ ] almacen/entradas · almacen/salidas
- [ ] almacen/kardex
- [ ] almacen/recepcion-compras
- [ ] almacen/costos · almacen/dashboard-financiero

### E. Operaciones
- [ ] operaciones/ordenes-viaje · operaciones/marsisa-ordenes-viaje ⚠️ (variante por empresa)
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
- [ ] tesoreria/liquidaciones · tesoreria/pago-requerimientos
- [ ] gerencia/aprobaciones-oc · gerencia/aprobaciones-caja · gerencia/aprobaciones/caja ⚠️

### G. RRHH y Seguridad
- [ ] rrhh/personal · rrhh/asistencia · rrhh/nomina
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
