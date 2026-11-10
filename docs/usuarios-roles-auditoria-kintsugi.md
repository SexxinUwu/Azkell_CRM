# Usuarios, Roles y permisos y Auditoría de Azkell Fleet — especificación para replicarlos en KINTSUGI

Complementa a `docs/barra-lateral-kintsugi.md`. Describe cómo están hoy **estas tres pantallas** en Azkell y qué debe hacer KINTSUGI para que se vean y se comporten igual. Las rutas son relativas a la raíz del repositorio de Azkell. Si algo de aquí contradice al código, **manda el código**.

## 0. Lo primero: cómo están organizadas en Azkell (no son 3 entradas del menú)

| En KINTSUGI hoy | En Azkell |
|---|---|
| Menú: Usuarios, Roles y permisos, Auditoría (3 entradas, 3 rutas: `/usuarios`, `/roles`, `/auditoria`) | **2 entradas** en la sección Configuración: **Usuarios** (`/sistema/usuarios`) y **Auditoría** (`/sistema/auditoria`) |
| "Roles y permisos" como pantalla aparte | **No existe como entrada.** Es la pestaña **Roles** dentro de la pantalla *Usuarios y roles* |

Pantalla `/sistema/usuarios` = título **"Usuarios y roles"**, con un control segmentado de dos pestañas: **`Usuarios · N`** y **`Roles · N`**.
Por tanto, en KINTSUGI la sección Administración debe quedar con **dos** entradas: **Usuarios** y **Auditoría**, y la ruta `/roles` debe desaparecer (o redirigir a `/usuarios` con la pestaña Roles abierta).

Archivos de referencia:

| Archivo | Qué es |
|---|---|
| `src/modules/sistema/UsuariosPage.tsx` | Pantalla con las dos pestañas, lista y hoja de alta/edición |
| `src/modules/sistema/UsuarioFila.tsx` | Fila de un usuario |
| `src/modules/sistema/RolesPanel.tsx` | Pestaña Roles (lista + detalle + permisos) |
| `src/modules/sistema/permisosCatalogo.ts` | Catálogo de módulos/permisos y paleta de colores de rol |
| `src/modules/sistema/sistema.css` | Estilos (`.sis-tabs`, `.usr-*`, `.roles`, `.role-*`, `.perm-*`, `.save-bar`) |
| `src/modules/sistema/AuditoriaPage.tsx`, `auditoriaApi.ts`, `auditoriaPage.css` | Pantalla de Auditoría |
| `server.js` (bloques "ROLES" y "USUARIOS v2") | API de usuarios y roles |
| `rbac.js` | Control de permisos por ruta |
| `routes/audit_vista.js`, `services/auditoria.js`, `services/auditoria_vista.js` | API de Auditoría y registro firmado |
| `src/core/ui/Switch.tsx`, `SegmentedControl.tsx`, `Chips.tsx`, `Sheet.tsx` | Piezas de UI que usan |

---

## 1. Pantalla "Usuarios y roles" — pestaña **Usuarios**

### Encabezado
- `PageHeader`: eyebrow **"Sistema"**, título **"Usuarios y roles"**, subtítulo `N usuarios · N activos · N admins` (los admins son los miembros de roles con `es_admin`).
- Acción a la derecha, **solo en la pestaña Usuarios y con permiso `usuarios.crear`**: botón primario pequeño **"+ Nuevo usuario"**.
- Debajo, un `SegmentedControl` de ancho completo (`.sis-tabs`): **`Usuarios · N` | `Roles · N`**.

### Lista
- Buscador `SearchField`: placeholder **"Correo, nombre, cargo o rol…"** (busca en esos 4 campos, sin distinguir mayúsculas).
- Dos grupos con encabezado `.list__header`: **"Con acceso · N"** y **"Sin acceso · N"** (activos e inactivos). Si un grupo está vacío no se muestra.
- Sin resultados: `EmptyState` "Sin resultados" con el botón de texto "Limpiar búsqueda".

### Fila (`UsuarioFila`)
- Contenedor `.row.usr-fila` (`.usr-fila--inactivo` si está inactivo).
- Zona principal (botón, abre la edición; `haptic('selection')`): círculo con **iniciales neutras** (`.usr-avatar`, sin color por persona) + texto: nombre (en minúsculas), subtítulo `cargo · correo`, y el **rol** como píldora con **un punto del color del rol** (`.usr-rol`; en celular se muestra bajo el texto como `.usr-fila__rol-movil`).
- A la derecha un **interruptor** (`Switch`) activo/inactivo. Al tocarlo **no cambia directo**: abre un `ConfirmSheet` ("Desactivar usuario" / "Activar usuario"; mensaje "No podrá iniciar sesión." / "Podrá volver a iniciar sesión.").

### Hoja "Nuevo usuario" / "Editar usuario" (`Sheet`)
Campos, en este orden:
1. **Nombre completo** (obligatorio).
2. **Usuario de acceso (correo o DNI)** — obligatorio; correo válido **o** DNI de 8 dígitos. Texto de ayuda distinto al crear y al editar ("Si lo cambias, el usuario entra con el nuevo dato.").
3. Fila de dos: **Cargo** y **DNI** (8 dígitos, `maxLength 8`; ayuda "Al escribirlo se completa el nombre.").
4. **Contraseña** (`PasswordInput`): obligatoria al crear (mínimo 8); al editar se llama "Nueva contraseña (dejar en blanco para no cambiar)" con placeholder "Sin cambios".
5. **Rol** — obligatorio, `ChoiceChips` con todos los roles.
6. **Estado** — `SegmentedControl` Activo | Inactivo.

Pie de la hoja: **Eliminar** (rojo, a la izquierda, solo al editar y con permiso `usuarios.eliminar`), **Cancelar** y **Crear usuario / Guardar cambios** (primario; deshabilitado sin permiso).
Errores por campo bajo cada campo; mensajes: "Escribe el nombre completo.", "Escribe el correo o el DNI.", "Escribe un correo (usuario@empresa.com) o un DNI de 8 dígitos.", "Escribe una contraseña para el primer acceso.", "Elige el rol del usuario.".
**RENIEC:** al escribir un DNI de 8 dígitos con el nombre vacío se consulta `/api/proxy/documento?tipo=DNI&numero=…` y se completa el nombre en mayúsculas; si el usuario de acceso estaba vacío, se sugiere el DNI. Si falla, no pasa nada (se escribe a mano).
**Eliminar:** `ConfirmSheet` "Eliminar usuario — ¿Eliminar definitivamente a …? No se puede deshacer. Si solo quieres quitarle el acceso, mejor desactívalo."

Permisos de pantalla: `usuarios.ver` para entrar; `usuarios.crear`, `usuarios.editar`, `usuarios.eliminar` para cada acción.

---

## 2. Pestaña **Roles** (la que en KINTSUGI hoy es "Roles y permisos")

Diseño **lista + detalle** (`.roles`): en escritorio, lista a la izquierda y detalle a la derecha; en celular (< 900 px) primero la lista y, al elegir un rol, el detalle a pantalla completa con botón "‹ Roles" para volver. En escritorio se abre el primer rol automáticamente.

### Lista de roles (`.roles__lista`)
- Cabecera: **"Roles · N"** y botón **"+ Nuevo"** (solo con permiso de editar).
- Cada rol (`.row.role-item`, `aria-current` el elegido): punto del color del rol, **nombre** y subtítulo `N usuarios · Administrador` o `N usuarios · N módulos`.

### Detalle del rol
Tarjeta de cabecera (`.role-cabecera`):
- **Nombre del rol** (input grande).
- **Color**: 10 muestras redondas — `#5865F2, #57F287, #1ABC9C, #3498DB, #E67E22, #9B59B6, #ED4245, #EB459E, #F1C40F, #95A5A6` (`COLORES_ROL`).
- Chips informativos: `N de M módulos` y `N usuarios`.
- **"Acceso de administrador"** (interruptor, "Ve y edita todo el sistema, sin casillas."). Con él activo no se muestran permisos y aparece la nota "Como es administrador, tiene acceso a todo. Desactiva el interruptor para elegir módulos."

Permisos (si no es administrador): un bloque por **grupo** (`.perm-grupo`) con icono de grupo, título, `N de M con acceso` y el botón de texto **"Activar todos" / "Quitar todos"**. Dentro, una fila por módulo (`.perm-modulo`): nombre + descripción a la izquierda y, a la derecha, **chips de acción** — **Leer, Crear, Editar, Eliminar** (`aria-pressed`). Los módulos que solo se pueden ver muestran únicamente **Leer**.

Barra de guardado flotante (`.save-bar`, animada con spring): aparece solo si hay cambios — "Tienes cambios sin guardar", **Descartar** y **Guardar**. Cambiar de rol con cambios pendientes abre "¿Descartar los cambios?".
Pie del detalle: **"Eliminar rol"**; deshabilitado si tiene usuarios ("Eliminar rol · reasigna antes a sus N usuarios"). El servidor lo rechaza igual.
Crear rol: hoja "Nuevo rol" con nombre y color; el rol nuevo nace **sin permisos** y queda seleccionado.

### Formato del permiso
`permisos_json` = `{ "<modulo>": { "l": 0|1, "c": 0|1, "e": 0|1, "d": 0|1 } }` (los módulos solo-lectura guardan solo `l`). `admin` se maneja con `es_admin`, no dentro del JSON. Una acción está permitida si vale `1` o `true`.
Catálogo en `permisosCatalogo.ts`: `{ grupo, key, nombre, desc, lcad }`; `lcad` indica si tiene las 4 acciones o solo ver. Los grupos tienen icono (`ICONO_GRUPO` en `RolesPanel.tsx`).
En el código de pantalla se pregunta con `can('modulo.accion')` (`ver|crear|editar|eliminar`); en el servidor, `rbac.js` traduce la ruta al módulo y la acción HTTP a l/c/e/d (GET→l, POST→c, PUT/PATCH→e, DELETE→d).

---

## 3. Reglas de negocio y seguridad (servidor)

- Roles: `GET/POST /api/roles`, `PUT/DELETE /api/roles/:id`. Cada rol lleva `nombre, color, permisos_json, es_admin, orden`. El listado devuelve además `miembros` (conteo de usuarios).
- **Solo un administrador** puede crear, editar o eliminar un rol de administrador, o dar ese acceso a otro rol.
- **No se elimina un rol con usuarios** ("Este rol tiene N usuario(s) asignado(s). Reasígnalos antes de eliminar.").
- Al guardar un rol, sus permisos se copian a todos sus usuarios.
- Usuarios: `POST /api/usuarios-v2`, `PUT/DELETE /api/usuarios-v2/:id`. Validaciones: acceso = correo válido o DNI de 8 dígitos; DNI de 8 dígitos si se informa; **no duplicar correo ni DNI** (409); clave con la misma política que "Mi cuenta" (mínimo 8, no común ni filtrada); el rol debe existir.
- **Cuenta fundadora** (`admin@azkell.com`): solo ella puede modificar su cuenta, no se le cambia el correo ni se elimina. Un administrador no puede ser modificado ni eliminado por quien no lo es. **Nadie puede eliminarse a sí mismo.**
- **Desactivar a un usuario o cambiarle la clave cierra sus sesiones abiertas.**
- La clave nunca se guarda en claro ni se escribe en auditoría ("Cambió la contraseña de …" sin el valor).
- Cada cambio emite un aviso en vivo (`broadcast('usuarios', …)`) para que otras pantallas se actualicen.
- Cada cambio se registra en Auditoría (ver sección 4): crear/editar/eliminar usuario y rol, y cambio de clave.

---

## 4. Pantalla **Auditoría** (`/sistema/auditoria`)

Permiso: `mod_auditoria.ver`. Registro **firmado** (HMAC) de lo que pasa en el sistema, traducido a lenguaje de personas.

- **Vista (control segmentado):** `Actividad` · `Anulaciones y rechazos` · `Personas` · `Alertas (N pendientes)` · `Registro firmado`. En celular el control ocupa todo el ancho.
- **Actividad:** línea de eventos legibles, con filtros: búsqueda (`q`), módulo, usuario, categoría, desde y hasta; paginación (25 por defecto, máx. 250) y orden. Cifras por categoría que filtran (`/audit/eventos/resumen`). Categorías: **Ingresó, Registró, Modificó, Eliminó, Anuló, Rechazó, Aprobó, Bloqueado, Acceso fallido, Consultó**.
- **Detalle de un evento:** quién, cuándo (hora de Lima), IP, módulo, qué hizo, **antes/después** campo por campo, código del documento si lo hay, estado de la firma.
- **Anulaciones y rechazos:** quién anuló o rechazó, cuándo, el motivo y el monto.
- **Personas:** actividad por persona en un rango.
- **Alertas:** hechos que merecen atención (anulaciones, eliminaciones, bloqueos, accesos fallidos, cambios de roles y usuarios), con selector `Hoy | 7 días | 30 días`.
- **Registro firmado:** la vista técnica del registro con su firma de integridad.
- Endpoints (`auditoriaApi.ts`): `GET /api/audit/eventos`, `/audit/eventos/resumen`, `/audit/eventos/filtros`, `/audit/evento/:uid`, `/audit/anulaciones`, `/audit/historial?codigo=`, `/audit/personas`, `/audit/alertas?dias=`.
- Los eventos de usuarios y roles se escriben con `auditar(db, actor, { action, entity, entityId, summary, changes })` (`services/auditoria.js`): `CREATE/UPDATE/DELETE/PASSWORD_CHANGE`, entidades `user` y `role`, y `changes` como `{ campo: { antes, después } }` (sin secretos).

---

## 5. Qué adaptar en KINTSUGI (y qué NO)

KINTSUGI ya tiene sus propios módulos `usuarios`, `auditoria` y roles, con otro modelo de datos: `User`, `Role`, `RolePermission` con **claves planas** (`usuarios.view`, `roles.manage`, `auditoria.view`…) y `AuditLog` con `action/entity/summary/changes`. **El modelo de datos y las claves de permiso se conservan; lo que se replica es la interfaz, el orden de los elementos, los textos y las reglas.**

| Se replica idéntico | Se adapta |
|---|---|
| Estructura de 2 entradas (Usuarios y Auditoría) con Roles como pestaña | Nombres de sección y rutas de KINTSUGI |
| Diseño de lista y detalle, hoja de usuario, interruptor con confirmación, barra de guardado, chips de acción, colores de rol, "Activar todos" | Catálogo de módulos y grupos (los de KINTSUGI: Gerencia, Operaciones, Inventario, Finanzas, Gestión, Clientes, Administración) |
| Textos exactos, validaciones y mensajes de error | Claves de permiso: hay que **mapear** las 4 acciones (Leer/Crear/Editar/Eliminar) a las claves de KINTSUGI (por ejemplo `view`, `create`, `edit`, `delete` / `manage`) |
| Reglas de seguridad de la sección 3 | Almacenamiento: `Role` + `RolePermission` en lugar de `permisos_json` |
| Auditoría con las 5 vistas, categorías y detalle antes/después | Tabla de eventos de KINTSUGI (`AuditLog`) y su firma, si la tiene |

### Preguntas que el desarrollador debe hacer antes de empezar
1. ¿Cada módulo de KINTSUGI tiene las 4 acciones o solo "ver"? ¿Cómo se llaman sus claves de permiso?
2. ¿KINTSUGI tiene cuenta fundadora o "administrador" especial (regla de la sección 3)?
3. ¿Los roles base (`isSystem`) se pueden editar o eliminar? (en Azkell no hay roles protegidos, salvo los de administrador)
4. ¿`AuditLog` tiene firma de integridad? Si no, la vista "Registro firmado" se deja para una fase posterior.
5. ¿KINTSUGI es multiempresa? Todo se filtra por `companyId`.
6. ¿Hay consulta de DNI (RENIEC)? Si no, el autocompletado se omite.

## 6. Orden de trabajo sugerido
1. Menú: dejar Administración con **Usuarios** y **Auditoría**; retirar `/roles` (redirigir).
2. Pantalla Usuarios y roles con la pestaña **Usuarios** (lista, buscador, interruptor, hoja de alta y edición).
3. Pestaña **Roles** (lista y detalle, permisos, barra de guardado).
4. Reglas de seguridad del servidor y registro en auditoría.
5. Pantalla **Auditoría**: primero Actividad y detalle; después Anulaciones, Personas y Alertas.
6. Pruebas en escritorio y celular, claro y oscuro; typecheck y build.
