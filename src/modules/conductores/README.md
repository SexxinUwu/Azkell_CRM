# Módulo conductores — Vistas (Directorio › Conductores)

Ruta: `/app/conductores`. Permisos: `cond.ver`, `cond.crear`, `cond.editar`, `cond.eliminar` (matriz actual `cond`).

| Archivo | Qué es |
| --- | --- |
| `api.ts` | Datos y escritura sobre los endpoints actuales; RENIEC; reducción de foto; WhatsApp |
| `ConductoresPage.tsx` | Resumen, búsqueda, filtros, tarjetas con contacto rápido |
| `ConductorFicha.tsx` | Ficha con foto, llamar / WhatsApp y datos |
| `ConductorFormulario.tsx` | Crear y editar |
| `importar.ts` / `ImportarConductores.tsx` | Importar desde Excel; plantilla |
| `FotoConductor.tsx` | Foto o iniciales en un círculo de color (siempre el mismo color por persona) |

## Comportamiento

- **Resumen** animado: activos, inactivos, con licencia, sin DNI.
- **Búsqueda** por nombre, DNI, licencia, empresa o teléfono; filtros por estado y por las empresas más frecuentes.
- **Tarjetas** con foto o iniciales; botones para **llamar** y **WhatsApp** (si el celular es peruano de 9 dígitos).
- **Formulario:** al escribir los 8 dígitos del DNI, el nombre llega solo desde RENIEC (`/api/proxy/documento`). Valida nombre obligatorio, DNI de 8 dígitos **y no repetido**, celular de 9 dígitos.
- **Foto:** se recorta cuadrada y se reduce a 320 px en el navegador antes de enviarla. La columna `foto` es TEXT (≈64 KB): en la versión actual una foto normal fallaba con "Data too long", por eso ningún conductor tenía foto.
- **Importar:** el servidor solo inserta; para no duplicar personas se omiten los DNI ya registrados y los repetidos en el archivo. Recupera el cero inicial del DNI que Excel quita.
- **Eliminar** desde la ficha, con confirmación (`DELETE /api/conductores/:id`).

## Endpoints (versión actual)

`GET /api/conductores` · `POST /api/script/guardarConductor` (crear/editar; la foto vacía conserva la anterior) · `DELETE /api/conductores/:id` · `POST /api/conductores/importarMasivo` · `GET /api/almacen/clientes-placas` (empresas).

Seguridad corregida al migrar: `rbac.js` dejaba borrar e importar conductores sin permiso (la lista estaba exenta para cualquier método). Ahora las listas de consulta solo están exentas para leer.
