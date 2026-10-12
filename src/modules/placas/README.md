# Módulo placas — Vistas (Flota › Placas)

Piloto de la migración (Fase 3). Ruta: `/app/placas`. Permiso: `placas.ver`.

| Archivo | Qué es |
| --- | --- |
| `api.ts` | Datos: `POST /api/script/obtenerDatosPlacas` (versión actual) convertido de fila de 30 posiciones a objeto `Placa`; búsqueda |
| `PlacasPage.tsx` | Resumen, filtros, tarjetas o lista |
| `PlacaFicha.tsx` | Ficha de la unidad en hoja (celular) o diálogo (escritorio) |
| `placas.css` | Estilos |

## Comportamiento

- **Resumen** con cifras que cuentan al aparecer: activas, motoras, no motoras, inactivas.
- **Búsqueda al instante** por placa (con o sin guion), cliente, marca, modelo, tipo, VIN o nombre en Wialon; sin tildes ni mayúsculas, palabras en cualquier orden.
- **Filtros:** Todas / Motoras / No motoras y tipo de unidad (varios a la vez). "Quitar filtros" los limpia.
- **Tarjetas o lista** (se recuerda en el dispositivo). Al filtrar, las tarjetas se reacomodan con animación.
- **Ficha:** placa peruana grande, estado, clase, tipo y configuración; datos agrupados en General, Técnico, Capacidad y Operación.
- **Solo consulta.** Crear, editar, importar desde Excel y eliminar siguen en la versión actual ("Editar en la versión actual"), sin cambios en sus reglas.

## Siguiente paso

Edición en la app nueva: formulario con validación en línea sobre `POST /api/script/guardarPlaca` (mismas reglas), y luego el endpoint propio `/api/v2/placas` con Prisma.
