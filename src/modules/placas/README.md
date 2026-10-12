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
- **Crear y editar** en la app nueva (permisos `placas.crear` y `placas.editar`), con validación al salir de cada campo: placa (formato y repetidas), tipo, RUC/DNI, año y números. La placa se dibuja mientras se escribe y la capacidad total se suma en vivo.
  - Editar: `PUT /api/placas/:placa` (envía todas las columnas; conserva la métrica km/horas de `/api/config-metrica`). El servidor registra cada campo cambiado en `placa_auditoria`.
  - Crear: `guardarPlaca` (inserta o actualiza): por eso la pantalla bloquea antes las placas repetidas.
- **Historial de cambios** en la ficha (`GET /api/placas/:placa/historial`): campo, antes → después, quién y cuándo.
- Importar desde Excel y eliminar siguen en la versión actual.

## Siguiente paso

Endpoint propio `/api/v2/placas` con Prisma, permisos por nombre en el servidor y auditoría con antes/después.
