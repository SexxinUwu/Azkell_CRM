# Módulo auth — Vistas

Ingreso, bienvenida y despedida de la app nueva (`/app/login`). Copiado de KINTSUGI y adaptado a Azkell.

| Archivo | Qué es |
| --- | --- |
| `LoginPage.tsx` | Pantalla de ingreso |
| `WelcomeTransition.tsx` / `welcome.ts` / `welcome.css` | Animación de bienvenida tras ingresar |
| `FarewellTransition.tsx` | Animación de despedida al cerrar sesión (usa `welcome.css`) |
| `login.css` | Estilos de la pantalla |

## Sesión (por ahora, sobre la API actual)

La sesión vive en [`src/core/auth/AuthProvider.tsx`](../../core/auth/AuthProvider.tsx) y usa los endpoints de la versión actual: `POST /api/login`, `GET /api/perfil/me`, `GET /api/configuracion` (nombre de la empresa) y `POST /api/auth/logout`.

- **Sesión compartida:** guarda las mismas claves que la versión actual (`fleet_token`, `fleet_permisos`, `fleet_rol`…). Ingresar en una versión deja la sesión abierta en la otra. La sesión dura lo que el token del servidor (12 h).
- **Permisos:** la matriz actual (`placas: {l,c,e,d}`) se convierte a nombres (`placas.ver`, `placas.crear`…) en [`core/auth/permisos.ts`](../../core/auth/permisos.ts). Administradores y Fundador: acceso total.
- **Recuérdame:** recuerda correo y nombre en el dispositivo ("Hola de nuevo, Ana"); nunca la contraseña.
- **Error:** la tarjeta "niega" con un movimiento lateral y selecciona la contraseña.
- Cualquier 401 de la API cierra la sesión local.

## Bienvenida y despedida con el logo de la empresa

El ícono es el logo de la empresa del subdominio (`/api/tenant-logo`, con el de Azkell si no tiene) sobre una placa blanca.

- **Bienvenida (~1,7 s, un toque la salta):** la tarjeta del login se encoge y se vuelve el ícono → aparece el logo → un trazo naranja recorre el borde → un brillo cruza el logo → "Hola, {nombre}" → el ícono crece y se abre sobre la app.
- **Despedida (~1,8 s):** el reverso. La app se recoge en el ícono, el trazo se retira, "Hasta pronto, {nombre}", y el ícono se vuelve la tarjeta del login.
- Con "Reducir movimiento": fundidos simples. Un 401 sale sin animación.
