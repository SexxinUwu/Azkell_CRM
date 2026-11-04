# Azkell Fleet — Guía para Claude Code

**Responder siempre en español.** Respuestas cortas; datos en tablas cuando hay varios registros.

> Arquitectura nueva: [AGENTS.md](AGENTS.md) (KINTSUGI). Avance y plan: [docs/migracion.md](docs/migracion.md). Esta guía describe el código tal como está hoy.

## 1. Reglas de trabajo (obligatorias)

1. **No escribir en la base de datos sin el OK del usuario.** Las consultas SELECT de verificación sí se pueden hacer. Cualquier INSERT, UPDATE, DELETE, DDL o migración espera confirmación explícita en el chat.
   Puedes leer código y ejecutar SELECT de solo lectura sin pedir permiso; cualquier escritura en la base, migración, merge o deploy necesita el OK del usuario.
2. **Respaldo antes de cada cambio en datos** (§5).
3. **Transacciones con conteo exacto:** `BEGIN`; cada UPDATE o INSERT revisa `affectedRows` contra lo esperado; si no coincide, `ROLLBACK`. Mostrar antes y después de algunas filas.
4. **Ramas desde `main`, sin fusionar** sin OK del usuario. Antes de cada commit: `npm run typecheck` y `npm run build`. Commits en español.
5. **Sin subagentes:** trabajar directamente con las herramientas.
6. **Esperar el OK** cuando el prompt lo pida (publicar, fusionar, migrar, borrar, enviar mensajes).
7. Leer un archivo antes de editarlo. Los archivos del proyecto usan fin de línea CRLF: conservarlo.

## 2. Stack actual

| Capa | Tecnología |
|------|-----------|
| Frontend | React + TypeScript + Vite en `src/` (módulos en `src/modules/`, base común en `src/core/`) |
| Backend | Express en `server.js`; rutas en `routes/*.js`; lógica compartida en `services/*.js` |
| Base de datos | MySQL en VPS. `azkell_master` (empresas) y una base por empresa, `azkell_tenant_<slug>` |
| Empresas | marsisa, rosymarperu, yoguitransport, trahesa (`req.db` apunta a la base de la empresa) |
| Esquema | Prisma en `prisma/schema/*.prisma` y migraciones SQL en `prisma/schema/migrations/` |
| Deploy | Coolify, desde `main`. Tras cambiar variables de entorno: Redeploy |
| PWA | `sw.js` (caché `azkell-fleet-v62`). Las llamadas `/api/` siempre van a la red |
| IA | Gemini, en `routes/asistente*.js` |

`Index.html`, `logica.js` y `Modulos/` ya no existen. No proponer editarlos.

## 3. Variables de entorno (`.env` y Coolify)

`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`, `MASTER_DB_NAME` (por defecto `azkell_master`), `JWT_SECRET` (obligatorio), `WIALON_TOKEN`, `GEMINI_API_KEY`, `GEMINI_MODEL` (opcional), `ASISTENTE_LIMITE_DIARIO` (por defecto 30), `AWS_*` (archivos en S3), `EVOLUTION_*` (WhatsApp).
Nunca imprimir valores de estas variables.

## 4. Backend y permisos

- Las rutas son `/api/...` relativas. Nunca URLs absolutas.
- Nombres de tabla en minúsculas exactas (MySQL distingue mayúsculas).
- Permisos: matriz `modulo: {l, c, e, d}` en `permisos_json`. `admin: true` da todo. La cuenta fundadora siempre es admin (ver el backend). En el backend se verifica con `tienePermiso(user, 'modulo.accion')`.
- En React: `useAuth()` y `can('modulo.accion')`. `ADMIN = '*'` en `src/core/auth/permisos.ts`.
- Auditoría: `log_auditoria` está firmada (HMAC).
- Errores: `try/catch` y `if (!res.ok)`. En el frontend, la llamada es `api()` de `src/core/api/client.ts`.

## 5. Migraciones, respaldos y transacciones

- Migraciones: `prisma/schema/migrations/N_nombre/migration.sql`. El SQL es idempotente (revisa `information_schema` y usa `PREPARE`). La última es `9_viaje_km_recorrido_gps`.
- Comandos de migración. Siempre leer primero el estado:
  - `node scripts/prisma_empresas.js estado [--solo <slug>]`
  - `node scripts/prisma_empresas.js deploy [--solo <slug>]` (requiere OK)
  - `node scripts/prisma_empresas.js resolver <migración> [--solo <slug>]`
  - `npm run db:validate` valida el esquema.
- Respaldo con `mysqldump` (MySQL 8.4 en `C:\Program Files\MySQL\MySQL Server 8.4\bin\`):
  `--single-transaction --no-tablespaces --set-gtid-purged=OFF --skip-lock-tables --no-create-info --replace --skip-extended-insert --where="..."`.
  La contraseña va en `MYSQL_PWD`, leída del `.env` (nunca imprimirla). Los archivos se guardan en `C:\Users\teffa\Documents\respaldos-azkell\`.
- Scripts de Node: `require('dotenv').config({ quiet: true })`. Si el script está fuera del proyecto, usar `NODE_PATH=$PWD/node_modules`.

## 6. Neumáticos (ciclo de vida)

- `routes/neumaticos.js` y `routes/neumaticos-ciclo.js` (movimientos, retorno de reencauche, despacho a la reformadora, listado).
- Servicios: `services/neumaticos_codigo.js` (códigos de fuego), `services/neumaticos_retorno.js` (retorno de reencauche), y otros de neumáticos en `services/`.
- Almacenes: **100** Nuevas · **1142** Reencauche · **1144** Reparadas · **1146** Retén · **1148** Scrap.
- Situación de cada llanta (`situacionLlanta`): `en_almacen` → disponible; `en_unidad` → en_actividad; `en_reencauche` en 1146 → enviar_reforma; otro almacén → en_reformadora; `desechado` en 1146 → esperando_descarte; `desechado` en 1148 → desactivacion. Sin código de fuego: `PROV-` → provisional; el resto → sin_codigo. **Una llanta desechada no necesita código de fuego para pasar al descarte.**
- Hoja de vida (`neumaticos_hoja_vida`): serie, `codigo_dot`, marca, modelo, medida, banda (`banda_marca`, `banda_diseno`, `banda_ancho`), remanente, vida (R0 a R3), `contador_reencauches`, `costo_compra`.
- Movimientos en `neumaticos_movimientos`. Órdenes de reencauche en `neumaticos_reencauche_oc` y en `entradas_inv`. Al recepcionar, cada llanta queda aprobada o rechazada.

## 7. Combustible, viajes y Wialon

- `routes/combustible.js`: análisis de viajes (`analisis-viajes`), auditoría (`auditar-viaje`) y telemetría CAN por viaje (`wialon-telemetria`).
- **Filas del análisis: viaje + placa.** Un equipo Thermo King (subtipo en la ficha de placas) tiene su propia fila con el mismo N° de viaje. Sus galones y km no se suman al tracto.
- **Viaje CONFORME:** solo un administrador puede cambiarlo. El servidor lo valida en `auditar-viaje`.
- Wialon: la sesión es única por token, así que los reportes se ejecutan en secuencia. Token y URL en `integraciones_api` (`wialon_token`, `wialon_url`). Enlace placa-unidad: `services/wialon_placas.js`. Datos de una unidad: `services/wialon_unidad.js`.
- Frontend: `src/modules/operaciones/AnalisisViajes.tsx`, `canLote.ts` (CAN por viaje con caché y cola) y `PanelCan.tsx`.

## 8. Asistente de IA (Gemini)

- `routes/asistente.js`: chat con cadena de modelos (`GEMINI_MODEL` o la lista por defecto) y límite diario por persona.
- `routes/asistente-consultas.js`: herramientas fijas de solo lectura (OT, GPS, documentos, vencimientos de toda la flota, conductor, stock, llantas). Cada una valida permisos. La IA nunca escribe SQL.
- `routes/asistente-intents.js`: pedidos de reporte sin IA. Solo disparan un archivo si piden Excel, PDF, reporte o listado.
- `routes/asistente-reports.js`: genera los reportes.
- `routes/asistente-knowledge.js`: conocimiento del sistema que recibe Gemini. Actualizarlo cuando cambie una pantalla.
- Voz: `src/modules/asistente/voz.ts` (dictado y lectura con las voces del navegador).

## 9. Frontend React

- Componentes compartidos en `src/core/ui/`: `Sheet`, `Combobox`, `TablaRedimensionable` (con prop `fijas`), `CargadorCrow`, `Notice`, `Button`.
- Estilos: `src/core/ui/tabla.css` y `cargador-crow.css`, más un CSS por módulo.
- Iconos: `lucide-react`. Animaciones: `motion/react`. Gráficos: Recharts (`src/core/ui/Graficos.tsx`).
- localStorage con prefijo `fleet_` (por ejemplo `fleet_accent`, `fleet_meta_revision`, `fleet_asistente_voz`).
- `noUnusedLocals` está activo: `tsc` falla con imports o variables sin usar.

## 10. Módulos (`src/modules/`)

almacen · asistente · auth · catalogos · conductores · directorio · flota · gerencia · inicio · inspecciones · legal · mantenimiento · operaciones · perfil · personal · personas · placas · seguridad · sistema · tesoreria

## 11. Comandos

- `npm start`: servidor Express (`server.js`), puerto 3000.
- `npm run dev:app`: Vite (frontend).
- `npm run typecheck` y `npm run build`: antes de cada commit.
- `npm run db:estado`: estado de migraciones por empresa.

## 12. Pendientes conocidos

- Guías de remisión (SUNAT): ya se emiten desde React (individual y masiva). Detalle en [docs/migracion.md](docs/migracion.md).
- CSP en modo solo reporte (`server.js`, Helmet): revisar los avisos antes de pasarla a bloqueo.
- Pruebas en navegador: análisis de combustible (Thermo King, CAN, auditoría de admin), asistente (voz y herramientas nuevas) y neumáticos (descarte sin código).
- 540 documentos de flota sin fecha cargada.
- Lo demás: [docs/migracion.md](docs/migracion.md).

## 13. Cambiar de máquina

1. `git clone` del repositorio y `npm install`.
2. Crear el `.env` (§3).
3. `npm start` y abrir `http://localhost:3000`.
4. Leer [AGENTS.md](AGENTS.md) y esta guía.
