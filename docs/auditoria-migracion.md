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
- [ ] **S2. Usuario dedicado de la app** (p. ej. `azkell_app`), con host restringido a la IP del servidor de Coolify en lugar de `%` cuando sea posible.
- [ ] **S3. Permisos mínimos:**
  - `SELECT, INSERT, UPDATE, DELETE` sobre `azkell_master` y `azkell_tenant_*`.
  - DDL (`CREATE`, `ALTER`, `INDEX`): la app crea tablas al vuelo (por ejemplo `push_suscripciones`, `CREATE TABLE IF NOT EXISTS`). Sin este permiso fallarán los avisos y las migraciones.
  - **Sin** `SUPER`, `FILE`, `PROCESS`, `RELOAD`, `GRANT OPTION`.
- [ ] **S4. Aprovisionamiento de empresas.** `services/tenant_provisioner.js` crea bases nuevas. Decidir si hace falta `CREATE` a nivel servidor o un usuario aparte solo para esa operación.
- [ ] **S5. Cambiar `DB_USER` y `DB_PASSWORD`** en Coolify (Runtime only) y probar login, listados y escritura.
- [ ] **S6. Retirar `root` de la app.** Quitar también `SCRIPTS_DB_ROOT_PASSWORD` de las variables de la app si los scripts no la necesitan.
- [ ] **S7. Restringir `root` a acceso local** en el servidor MySQL (sin acceso remoto).
- [ ] **S8. Rotación de credenciales** (ver lista S9). Se rota después de S5 para no cortar el servicio a mitad.
- [ ] **S9. Credenciales a rotar** (nombres de variables; los valores no se escriben aquí):
  - Acceso del servidor MySQL: `root` y los usuarios de `DB_*` y `REMOTE_FUEL_*`.
  - Aplicación: `JWT_SECRET` (cierra todas las sesiones activas), `MASTER_KEY` (revisar antes qué datos cifra).
  - Terceros: `GEMINI_API_KEY`, `WIALON_TOKEN`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, `EVOLUTION_API_KEY`, `APISUNAT_PERSONA_TOKEN`.
  - Notificaciones push: `VAPID_PRIVATE_KEY` solo si el archivo `.env` estuvo expuesto; si se rota, todos los dispositivos deben volver a activar los avisos.
- [ ] **S10. Historial de git.** Buscar secretos ya subidos (`git log -p`, o una herramienta tipo gitleaks). Reescribir historial solo con aprobación explícita. Rotar siempre, aunque se reescriba.
- [ ] **S11. Registro de la rotación.** Anotar en este documento la fecha, qué se rotó y quién lo hizo (sin valores).

Estado: **pendiente**. Ninguna de estas tareas se ha ejecutado.

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
