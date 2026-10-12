# AZKELL FLEET — Contexto para asistentes de IA

Lee esto antes de modificar el código. Detalle en [docs/diseno.md](docs/diseno.md) y [docs/migracion.md](docs/migracion.md).

## Qué es

ERP de gestión de flotas para empresas de transporte en Perú (Marsisa, Rosymar, Trahesa…): placas y documentos, mantenimiento y taller, almacén, operaciones (viajes, combustible, guías SUNAT), tesorería, RRHH y seguridad. Moneda **soles (S/)**, zona horaria `America/Lima`, textos en **español de Perú**.

## Estado: migración en curso

El sistema convive en dos versiones sobre el mismo Express y la misma base de datos:

| Versión | Dónde | Reglas |
| --- | --- | --- |
| **Actual** (JS, HTML y CSS) | `Index.html`, `logica.js`, `Modulos/`, `server.js`, `routes/` | Las de [CLAUDE.md](CLAUDE.md). Solo correcciones de errores; nada de funciones nuevas en módulos que ya se están migrando |
| **Nueva** (React + TypeScript) | `src/`, `server/`, `prisma/` — servida en `/app/` | Las de este archivo |

Nunca se detiene la app en producción: cada módulo pasa a la versión nueva por separado, se activa primero para un grupo de prueba (permiso `app.nueva`) y la ruta antigua se borra solo cuando la nueva ya la reemplaza. Avance en [docs/migracion.md](docs/migracion.md).

## Stack de la versión nueva (igual que KINTSUGI)

React 19 + TypeScript estricto + Vite 8 · motion 14 (`motion/react`) · TanStack React Query 5 · React Router · lucide-react · Express 5 + zod 4 · Prisma 6 con MySQL · AWS S3 (URLs firmadas) · SSE en `/api/eventos` · write-excel-file y jsPDF + autotable, cargados solo al usarse · PWA y Capacitor (Android y TV).

## Arquitectura (obligatoria)

**Monolito modular.** Cada módulo vive en su carpeta y no mezcla responsabilidades:

- `server/modules/<modulo>/` → `<modulo>.routes.ts` (solo HTTP), `<modulo>.service.ts` (reglas + datos), `<modulo>.schemas.ts` (zod), `README.md`
- `src/modules/<modulo>/` → `api.ts` (React Query), páginas, `components/`, `<modulo>.css`, `README.md`
- `prisma/schema/<modulo>.prisma` → modelos del módulo (con `@@map` al nombre real de la tabla, en minúsculas)
- Lo compartido en `server/core/` y `src/core/`

Reglas:
1. **Multiempresa:** cada empresa tiene su propia base de datos, elegida por el subdominio. Toda consulta usa el cliente Prisma de la empresa de la petición; nunca uno fijo ni el de otra empresa. No se usa `companyId`: el aislamiento lo da la base.
2. **Permisos:** cada endpoint usa `requirePermission('modulo.accion')`; nunca compares nombres de rol ni el correo del fundador. Catálogo en `server/core/permissions.ts`.
3. **Auditoría:** todo cambio importante llama a `audit(actor, { action, entity, entityId, summary, changes })` con el antes y el después, y se avisa **en vivo** por SSE a los demás dispositivos.
4. **Registrar una sola vez:** no pidas al usuario datos que el sistema ya conoce.
5. **Errores:** lanza `HttpError(status, 'mensaje en español para la persona')`.
6. **Secretos solo en variables de entorno.** Nunca claves ni tokens en el código.
7. Al terminar un módulo: README en ambas carpetas, ruta en `src/App.tsx`, entrada en `src/core/layout/navigation.ts`, casilla marcada en `docs/migracion.md`, y borrar su versión antigua.

## Diseño (obligatorio)

Modo **claro** al estilo apple.com con materiales **Liquid Glass**, según la skill **`apple-design`** (`.claude/skills/apple-design/`). Cárgala antes de diseñar o revisar cualquier pantalla.

- Colores solo por tokens de `src/core/styles/tokens.css`: fondo `#f5f5f7`, tarjetas blancas, texto `#1d1d1f`, **naranja `#f56300` solo como acento** (activo, foco, interruptores, marca). **Acciones principales en negro.**
- Componentes de `src/core/ui/` (Button, Field, Sheet, Switch, SegmentedControl, Combobox, Toast, LicensePlate…) antes de crear otros nuevos.
- Movimiento con los resortes de `src/core/lib/motion.ts`: sin rebote por defecto; rebote solo tras un gesto. Respuesta al presionar, no al soltar.
- Primero el celular: objetivos táctiles de 44 px o más, hojas inferiores, pestañas flotantes.
- Textos en español de Perú, etiquetas específicas, validación en línea.

## Base de datos

Esquema por módulo en `prisma/schema/<modulo>.prisma` (modelos en singular con mayúscula + `@@map` a la tabla; columnas con su nombre actual de la base). Base maestra aparte en `prisma/master/schema.prisma`. `npm run db:estado` y `npm run db:deploy` recorren la maestra y todas las empresas (`scripts/prisma_empresas.js`).

Nunca uses `prisma db push`: todo cambio de esquema va en una **migración** (`prisma/schema/migrations/`), versionada en git y aplicada en cada base de empresa. Mientras conviva la versión antigua, las migraciones solo **agregan** (columnas, tablas, índices); borrar o renombrar espera a que ninguna pantalla antigua lo use. Respaldo de cada base antes de aplicar.

## Comandos

```bash
npm start            # versión actual + /app (si está compilada) en :3000
npm run dev:app      # app nueva con recarga en :5173 (usa la API de :3000)
npm run build:app    # compila la app nueva en dist/app (el Dockerfile lo corre al desplegar)
npm run typecheck    # revisa los tipos de src/
npm run db:estado    # migraciones pendientes por empresa
```

## Despliegue

Coolify (Docker). Variables marcadas como *Runtime only*: `DATABASE_URL`/`DB_*`, `JWT_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `WIALON_TOKEN`, credenciales de S3.
