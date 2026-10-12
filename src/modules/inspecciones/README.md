# Módulo inspecciones — Vistas (Mantenimiento › Inspecciones)

Ruta: `/app/inspecciones`. Permiso: `insp.ver`. **Parte 1: consulta** (estado de la flota, historial y ficha). **Parte 2: registrar** (`/app/inspecciones/nueva`, permiso `insp.crear`). La edición, el PDF y la importación siguen en la versión actual.

| Archivo | Qué es |
| --- | --- |
| `api.ts` | Datos de la versión actual; fotos firmadas de S3 |
| `vigencia.ts` | Regla de vigencia del ciclo (copia exacta de `evaluarCicloUnidad`) |
| `InspeccionesPage.tsx` | Estado de la flota (anillo + cifras + unidades por urgencia) e historial por día |
| `RegistrarInspeccionPage.tsx` / `registro.ts` / `Firma.tsx` | Asistente de registro: unidad → un paso por sistema → resumen y firma |
| `esquemaPorDefecto.ts` | Lista de puntos por defecto (copia exacta de DEFAULT_INSP_SCHEMA) |
| `InspeccionFicha.tsx` | Resumen OK/fallas, puntos por categoría (fallas primero), fotos ampliables y firma |

## Regla de vigencia

Por cada unidad **activa y en uso**: última inspección mecánica general (sin "Solo Frenos") y última de neumáticos.
- Mecánica vigente si no pasaron los días propuestos (30) desde la inspección; neumáticos según sus días restantes.
- Días del ciclo: el menor si ambas vigentes; el de la vigente si solo una; el mayor si ambas vencidas.
- Estado: < 0 no vigente · 0–7 próximo a vencer · > 7 vigente · sin inspecciones: sin registro.

Verificada contra la versión actual con datos reales: 94/94 unidades (Marsisa) y 172/172 (Rosymar) con el mismo estado.

## Fotos

Las fotos de S3 se firman al abrir la ficha (`POST /api/mantenimiento/inspecciones/presign-read`). Una "foto" guardada como solo el dominio (`https://empresa.azkell.com/`) no es una foto: era una falla sin foto que la versión actual guardaba así (corregido en `modulos/mantenimiento/inspecciones/logica.js`).

## Registrar (parte 2)

- Pasos: **unidad** (placa con búsqueda, cliente automático, fecha, km, técnico, vigencia en días) → **un paso por sistema** de la lista de la empresa (`GET /api/mantenimiento/inspecciones/config`; si no hay, la por defecto) → **resumen y firma**.
- Por punto: OK / FALLA (la falla abre observación y foto con la cámara), porcentaje (deslizador) o texto. "Todo OK" marca los pendientes del sistema.
- Fotos reducidas a 1600 px y subidas a S3 (`upload-url`); si no se puede, quedan en base64 (como la versión actual).
- Guardado: `POST /api/script/guardarInspeccion` con el mismo formato. El servidor numera (INSP-AAAA-NNNN) y pasa las fallas a Reportes de fallas (al reporte abierto de la unidad si existe) y a la OT activa.
- Mismas reglas que hoy: placa y técnico obligatorios; la firma es opcional.
- **Borrador automático** en el dispositivo (sin fotos): si se cierra la app, al volver ofrece continuar.
- Verificado con el código real contra el servidor local: correlativo, formato del detalle idéntico, porcentaje, firma y traspaso de fallas.
