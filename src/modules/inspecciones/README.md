# Módulo inspecciones — Vistas (Mantenimiento › Inspecciones)

Ruta: `/app/inspecciones`. Permiso: `insp.ver`. **Parte 1: consulta** (estado de la flota, historial y ficha). El registro (asistente con firma), la edición, el PDF y la importación siguen en la versión actual.

| Archivo | Qué es |
| --- | --- |
| `api.ts` | Datos de la versión actual; fotos firmadas de S3 |
| `vigencia.ts` | Regla de vigencia del ciclo (copia exacta de `evaluarCicloUnidad`) |
| `InspeccionesPage.tsx` | Estado de la flota (anillo + cifras + unidades por urgencia) e historial por día |
| `InspeccionFicha.tsx` | Resumen OK/fallas, puntos por categoría (fallas primero), fotos ampliables y firma |

## Regla de vigencia

Por cada unidad **activa y en uso**: última inspección mecánica general (sin "Solo Frenos") y última de neumáticos.
- Mecánica vigente si no pasaron los días propuestos (30) desde la inspección; neumáticos según sus días restantes.
- Días del ciclo: el menor si ambas vigentes; el de la vigente si solo una; el mayor si ambas vencidas.
- Estado: < 0 no vigente · 0–7 próximo a vencer · > 7 vigente · sin inspecciones: sin registro.

Verificada contra la versión actual con datos reales: 94/94 unidades (Marsisa) y 172/172 (Rosymar) con el mismo estado.

## Fotos

Las fotos de S3 se firman al abrir la ficha (`POST /api/mantenimiento/inspecciones/presign-read`). Una "foto" guardada como solo el dominio (`https://empresa.azkell.com/`) no es una foto: era una falla sin foto que la versión actual guardaba así (corregido en `modulos/mantenimiento/inspecciones/logica.js`).
