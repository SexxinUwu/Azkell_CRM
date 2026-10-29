# Auditoría de migración: clásico → React (KINTSUGI)

Fecha: 2026-10-29. Alcance: menú, enlaces «Abrir en la versión actual», pantallas del clásico (`modulos/`) frente a rutas de React (`src/modules/*/rutas.ts`) y el plan de `docs/migracion.md`.

Método: análisis estático del código. **No** se probó cada pantalla en el navegador; lo que el plan marca como «verificar en navegador» sigue sin confirmar.

Terminología: en el código, **«versión actual»** es el clásico (`Index.html`, `logica.js`, `modulos/`). **React** es la app nueva (`/app`).

---

## Resumen

| Tema | Estado |
|---|---|
| Entradas del menú | 27 de 29 abren React. 2 siguen en el clásico (guías SUNAT, a propósito). |
| Enlaces rotos al clásico | **Corregido**: `mantenimiento/fallas` y `seguridad/patrimonial` no existían en el clásico. Se quitó la opción. |
| Accesos al clásico que quedan | 29 llamadas en 32 archivos, 25 destinos, todos existentes. 19 con el texto «Abrir en la versión actual». |
| Seguridad | **Prioridad alta**: la app conecta a MySQL como `root`. Tareas abajo. |
| Migración del clásico | Fase 5 (borrar el clásico) **no** iniciada. Depende de los accesos y de las guías SUNAT. |

---

## 1. Menú principal

29 entradas tienen `clasico:` en `src/core/layout/navigation.ts`. `conModulos()` cambia la entrada a React cuando existe una ruta con la misma clave en `rutas.ts`.

- **27 ya abren React.**
- **2 siguen en el clásico:**
  - `guias-remitente` → `operaciones/guia-remitente`
  - `guias-transportista` → `operaciones/guia-transportista`

  Son guías de remisión SUNAT. Se mantienen en el clásico hasta que el resto del ERP esté estable.

## 2. Enlaces «Abrir en la versión actual»

- **Corregidos (2):**
  - `mantenimiento/fallas` (FallasPage): la pantalla vive en React; el clásico no tiene esa carpeta.
  - `seguridad/patrimonial` (SegPatrimonialPage): ídem.
- **Quedan 29 llamadas a `abrirClasico()` en 32 archivos.** Los 25 destinos existen en `modulos/`:

  `dashboard`, `directorio/conductores`, `flota/disponibilidad`, `flota/placas`, `gerencia/aprobaciones-caja`, `gerencia/aprobaciones-oc`, `mantenimiento/fleetrun`, `mantenimiento/inspecciones`, `mantenimiento/kits-mp`, `mantenimiento/reportes-ot`, `mantenimiento/status-rampa`, `operaciones/conductor-portal`, `operaciones/ordenes-servicio`, `operaciones/ordenes-viaje`, `rrhh/asistencia`, `rrhh/nomina`, `rrhh/personal`, `seguridad/unidades`, `sistema/auditoria`, `sistema/integraciones`, `tesoreria/bancos`, `tesoreria/centros-costos`, `tesoreria/cuentas`, `tesoreria/liquidaciones`, `tesoreria/pago-requerimientos`.

  Hay 19 con el texto «Abrir en la versión actual». Las demás son accesos directos (por ejemplo «Ver garita»).

## 3. Carpetas del clásico sin equivalente en React

- `operaciones/asignacion`: solo en el clásico. Pendiente del plan.
- `operaciones/guias-remision`, `guia-remitente`, `guia-transportista`: SUNAT, se quedan en el clásico.

## 4. Pendientes del plan (`docs/migracion.md`)

- **Parciales:**
  - Almacén › Entradas (`almacen/entradas`): «Entradas al contado» depende de Tesorería.
  - Operaciones › Programación: faltan `operaciones/asignacion` y `operaciones/rutas`.
  - Conductor (portal): falta trabajo sin conexión.
  - Tesorería › Caja chica: por confirmar.
  - API (`sistema/api-gateway`): webhooks en pausa.
- **No iniciados:** `administracion` (raíz), Fase 5 (borrar `Index.html`, `logica.js`, `modulos/`, `routes/`), cookies HttpOnly completas, 2FA.
- **Verificación en navegador pendiente:** varias pantallas marcadas «Pendiente: verificar en navegador» en el catálogo.

---

## 5. Seguridad: tareas (prioridad alta)

La app se conecta a MySQL con `root`, y ese usuario está abierto a internet. Las tareas siguientes **no** están ejecutadas; cada una requiere confirmación antes de tocar producción.

- [ ] **S1. Respaldo previo.** Dump completo de `azkell_master` y de todas las `azkell_tenant_*` antes de cualquier cambio de permisos.
- [x] **S2. Usuario dedicado de la app** (`azkell_app`). Cumplido el 2026-10-29: el usuario lo configuró en Coolify y la sesión del `.env` ya conecta con esa cuenta. Pendiente opcional: el host sigue en `%`; restringirlo a la IP de Coolify está sin hacer.
- [~] **S3. Permisos mínimos.** Verificado el 2026-10-29 con `SHOW GRANTS` (solo lectura):
  - Sin privilegios globales (solo `USAGE`). No hay `SUPER`, `FILE`, `PROCESS`, `RELOAD` ni `GRANT OPTION`. Correcto.
  - `azkell_master.*` y `azkell_tenant_%.*`: `SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, REFERENCES, INDEX, ALTER, CREATE TEMPORARY TABLES, LOCK TABLES`. Cubre el DML y el DDL que necesita la app.
  - **Sobra (decide el responsable):** `azkell_fleet.*` (base legacy; el runtime usa `DB_NAME` y solo la tocan scripts manuales de `scripts/`); `LOCK TABLES` y `CREATE TEMPORARY TABLES` (no aparecen en el código); `DROP` (ninguna migración actual lo usa; confirmar antes de quitarlo).
  - **Falta para aprovisionar empresas (S4):** no hay `CREATE` global. `services/tenant_provisioner.js` y `services/tenant_master.js` ejecutan `CREATE DATABASE IF NOT EXISTS` con la cuenta de la app; una empresa nueva fallará hasta resolver S4.
  - Los permisos no se cambiaron: lo decide el responsable.
- [ ] **S4. Aprovisionamiento de empresas.** `services/tenant_provisioner.js` crea bases nuevas. Decidir si hace falta `CREATE` a nivel servidor o un usuario aparte solo para esa operación.
- [x] **S5. Cambiar `DB_USER` y `DB_PASSWORD`** en Coolify (Runtime only). Cumplido el 2026-10-29 según confirmó el responsable. Pruebas funcionales de login, listados y escritura en producción: **no ejecutadas** en esta revisión.
- [~] **S6. Retirar `root` de la app.** Estado el 2026-10-29:
  - Código: `scripts/prisma_empresas.js` (`npm run db:estado` / `db:deploy`) ya usa `DB_USER` y `DB_PASSWORD`. Ningún script activo de `scripts/` ni de `services/` lee `SCRIPTS_DB_ROOT_PASSWORD`, así que no hubo cambios de código.
  - `npm run db:estado` ejecutado en solo lectura: la maestra y las 4 empresas (marsisa, rosymarperu, yoguitransport, trahesa) están al día. `db:deploy` no se ejecutó, porque aplica migraciones.
  - Hecho: `services/tenant_master.js` y `services/tenant_provisioner.js` ya no usan `root`; si falta `DB_USER`, fallan con un error claro. Los scripts de `archivo/` usan `DB_USER` y `DB_PASSWORD`.
  - Pendiente: (1) quitar `SCRIPTS_DB_ROOT_PASSWORD` de Coolify; (2) 17 scripts de `scripts/` todavía usan `|| 'root'` como respaldo de `DB_USER`; (3) `archivo/scripts-historicos` conserva una IP fija.
- [ ] **S7. Restringir `root` a acceso local** en el servidor MySQL (sin acceso remoto).
- [ ] **S8. Rotación de credenciales** (ver lista S9). Se rota después de S5 para no cortar el servicio a mitad.
- [ ] **S9. Credenciales a rotar** (nombres de variables; los valores no se escriben aquí):
  - Acceso del servidor MySQL: `root` y los usuarios de `DB_*` y `REMOTE_FUEL_*`.
  - Aplicación: `JWT_SECRET` (cierra todas las sesiones activas), `MASTER_KEY` (revisar antes qué datos cifra).
  - Terceros: `GEMINI_API_KEY`, `WIALON_TOKEN`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, `EVOLUTION_API_KEY`, `APISUNAT_PERSONA_TOKEN`.
  - Notificaciones push: `VAPID_PRIVATE_KEY` solo si el archivo `.env` estuvo expuesto; si se rota, todos los dispositivos deben volver a activar los avisos.
- [ ] **S10. Historial de git.** Buscar secretos ya subidos (`git log -p`, o una herramienta tipo gitleaks). Reescribir historial solo con aprobación explícita. Rotar siempre, aunque se reescriba.
- [ ] **S11. Registro de la rotación.** Anotar en este documento la fecha, qué se rotó y quién lo hizo (sin valores).

Estado (2026-10-29): **S2 y S5 cumplidos**; **S3 y S6 parciales** (ver arriba); S1, S4, S7 a S11 pendientes.

---

## 6. Siguientes pasos de desarrollo

1. Almacén › Entradas (`almacen/entradas`): cerrar «Entradas al contado», que depende de Tesorería.
2. Operaciones › Programación: migrar `operaciones/asignacion` y `operaciones/rutas`.
3. Después, los accesos «Abrir en la versión actual» que siguen apuntando a pantallas ya migradas, para decidir si se quitan.

Las guías SUNAT (`operaciones/guias-*`) quedan intactas en el clásico.

---

## Registro de cambios de esta auditoría

- Quitado «Abrir en la versión actual» en `FallasPage.tsx` (enlace roto a `mantenimiento/fallas`).
- Quitado «Abrir en la versión actual» en `SegPatrimonialPage.tsx` (enlace roto a `seguridad/patrimonial`). «Ver garita» se mantiene: apunta a `seguridad/unidades`, que sí existe.
- `npx tsc --noEmit` sin errores tras los cambios.
- 2026-10-29: Sistema › Auditoría (Actividad) recalcada del clásico: tabla, orden por ID, tamaño de página y paginación numerada (`routes/audit.js` acepta `pageSize` y `orden`). Documentada la diferencia de fuente de datos en `src/modules/sistema/AuditoriaPage.tsx`.
- 2026-10-29: revisión de S2, S3, S5 y S6 (ver sección 5).
