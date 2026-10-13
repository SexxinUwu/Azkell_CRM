# Directorio › Personal

Diseño de Contactos de Apple sobre la tabla `rrhh_personal` (endpoints de `routes/rrhh.js`, sin cambios de reglas).

| Archivo | Qué hace |
|---|---|
| `api.ts` | Tipos, opciones de las listas, lectura/guardado, RENIEC, fin de contrato, alertas de vencimiento |
| `PersonalPage.tsx` | Lista alfabética por apellido con índice A–Z deslizable; tarjeta al lado (≥ 900 px) o encima (celular). Ruta `/directorio/personal/:id?` |
| `PersonaTarjeta.tsx` | Tarjeta: foto, mensaje/llamar/correo, alertas y datos agrupados. Pagos solo con permiso de editar |
| `PersonaFormulario.tsx` | Alta y edición en 4 pestañas (Persona, Puesto, Contrato, Salud) |
| `documentos.ts` | Fotocheck, ficha A4, tarjeta .vcf y Excel |

- El `PUT` reescribe todos los campos: siempre se envía el registro completo. La foto solo viaja si es nueva.
- Permiso `rrhh_personal` (ver/crear/editar/eliminar); en `rbac.js`, `/rrhh/*` → `rrhh_personal`, `/rrhh/tareo` → `rrhh_asistencia`, `/rrhh/nomina` → `rrhh_nomina`.
- Acciones secundarias en la casilla **Otros**.
