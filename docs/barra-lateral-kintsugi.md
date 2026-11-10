# Barra lateral, usuario y perfil de Azkell Fleet — especificación para replicarla

Documento de referencia para otra IA o persona que deba construir una barra lateral **idéntica** en otro proyecto (por ejemplo, el de combustible). Todo lo que se describe existe tal cual en este repositorio. Las rutas son relativas a la raíz del repositorio; cuando haya duda, **la fuente manda**: leer el archivo citado.

Stack de referencia: React 19 + TypeScript + Vite, React Router, TanStack Query, `lucide-react` (iconos), `motion/react` (solo el indicador de la barra del celular). CSS propio con variables (sin Tailwind).

---

## 1. Archivos que se copian (en este orden)

| Capa | Archivo | Qué es |
|---|---|---|
| Tokens | `src/core/styles/tokens.css` | Variables de color, vidrio, radios, espacios, anchos. **Primero.** |
| Estructura | `src/core/layout/layout.css` | `.app`, `.sidebar`, `.nav-item`, `.user-chip`, topbar, dock, hojas |
| Menú de colores | `src/core/layout/menu-secciones.css` | Secciones con icono de color, riel contraído, animaciones |
| Marco | `src/core/layout/AppShell.tsx` | Barra lateral, barra superior, dock del celular, hojas de Ajustes |
| Navegación | `src/core/layout/navigation.ts` | Datos del menú (secciones, opciones, permisos, contadores) |
| Marca | `src/core/layout/BrandMark.tsx` | Logo sobre placa blanca + wordmark |
| Celular | `src/core/layout/ModuleDock.tsx` | Barra inferior con un botón por módulo |
| Atajos | `src/core/layout/PaletaComandos.tsx` | Ctrl+K: buscar pantallas y favoritos |
| Estado | `src/core/layout/useNavBadges.ts` | Contadores de pendientes junto a las opciones |
| Aviso | `src/core/layout/ConnectionBanner.tsx`, `VigilanteVersion.tsx` | Banner de conexión y recarga por versión nueva |
| Tema | `src/core/lib/theme.ts`, `src/core/ui/ThemeToggle.tsx` | Claro / oscuro / automático |
| Acento | `src/core/lib/accent.ts`, `src/core/ui/AccentPicker.tsx` | Color de la app elegido por la persona |
| Perfil | `src/modules/perfil/*` | Mi cuenta, editar perfil y foto, contraseña, sesiones, avatar |
| Base UI | `src/core/ui/Display.tsx` (`Avatar`, `Page`, `PageHeader`), `Sheet.tsx`, `Button.tsx` | Piezas que usa el marco |

Lo único que **cambia** entre proyectos son los datos de `navigation.ts` (secciones y pantallas), el mapa `COLOR_SECCION`, el mapa `ICONOS_MODULO` y las rutas. Nada más debe diferir.

---

## 2. Tokens (`tokens.css`) — valores exactos

Claro (por defecto), `:root`:

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#f5f5f7` | Fondo de la página |
| `--surface` | `#ffffff` | Tarjetas, listas, barra lateral expandida |
| `--label` / `--label-2` / `--label-3` | `#1d1d1f` / `#6e6e73` / `#6c6c71` | Texto principal, secundario, terciario |
| `--fill-subtle` / `--fill` | `rgba(118,118,128,.06)` / `.12` | Hover y pulsado |
| `--separator` | `rgba(0,0,0,.08)` | Líneas finas |
| `--accent` | `var(--accent-base, #f56300)` | **Naranja**: único acento de marca |
| `--accent-ink` | `color-mix(in srgb, var(--accent) 72%, black)` | Texto de acento |
| `--accent-tint` | `color-mix(in srgb, var(--accent) 11%, transparent)` | Fondo suave |
| `--glass-thick` | `rgba(255,255,255,.82)` | Panel de la barra lateral contraída |
| `--glass-lens` | `rgba(255,255,255,.72)` | Opción seleccionada |
| `--glass-blur-thick` | `blur(36px) saturate(200%)` | Desenfoque del panel |
| `--glass-sheen` | `linear-gradient(180deg, rgba(255,255,255,.55) 0%, rgba(255,255,255,.08) 42%, rgba(255,255,255,0) 60%)` | Brillo superior |
| `--glass-shadow` | `var(--glass-rim), var(--glass-edge), 0 8px 24px rgba(0,0,0,.08), 0 24px 56px -16px rgba(0,0,0,.16)` | Sombra del panel |
| `--glass-shadow-sm` | `…, 0 2px 8px rgba(0,0,0,.06), 0 10px 24px -10px rgba(0,0,0,.14)` | Sombra de la opción activa |
| `--red`, `--red-ink` | `#ff3b30`, `#d70015` | Contadores y "Cerrar sesión" |
| `--rail-w` | `4.5rem` | Ancho del riel contraído |
| `--sidebar-w` | `16.5rem` | Ancho expandido |
| `--topbar-h` | `3.25rem` | Barra superior del celular |
| `--tabbar-h` / `--tabbar-gap` | `3.875rem` / `0.625rem` | Dock inferior |
| `--r-full` / `--r-xl` / `--r-lg` / `--r-md` | `999px` / `22px` / `18px` / `14px` | Radios |
| `--s-1 … --s-16` | `0.25rem … 4rem` (1,2,3,4,5,6,8,10,12,16 → 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4 rem) | Espaciado |
| `--ease-out` | `cubic-bezier(0.25, 1, 0.5, 1)` | Curva general |
| `--font` | `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, sans-serif` | Tipografía |

Oscuro: `:root[data-theme='dark']` (y `[data-theme='auto']` dentro de `@media (prefers-color-scheme: dark)`) redefine **todos** los anteriores; copiar el bloque completo de `tokens.css`, no inventar valores.

El color de la app se cambia con `--accent-base` en `document.documentElement.style` (ver `accent.ts`). Paleta: Naranja `#f56300`, Azul `#0a64d8`, Índigo `#5b4fe0`, Violeta `#9333ea`, Rosa `#d6246e`, Rojo `#d92d20`, Verde `#12a150`, Turquesa `#0c8f9c`, Grafito `#636366`. Llave de almacenamiento: `fleet_accent`.

---

## 3. Barra lateral de escritorio (≥ 1024 px)

### 3.1 Estructura HTML (de `AppShell.tsx`)

```
div.app[.app--barra-fija]
 └ aside.sidebar[.sidebar--fijo][.sidebar--teclado]  (aria-label="Navegación principal")
    └ div.sidebar__panel
       ├ a.sidebar__brand → BrandMark(30) + div.sidebar__texto( Wordmark + nombre de la empresa )
       ├ nav.sidebar__nav
       │   ├ (si hay favoritos) div.nav-seccion.nav-seccion--favoritos  (--seccion: #d97706)
       │   └ por cada sección: div.nav-seccion[.nav-seccion--abierta]  (style --seccion: color)
       │        ├ button.nav-seccion__cab (icono de color + título + pendientes + flecha)
       │        ├ div.nav-seccion__indicador (cifra de la sección, solo abierta)
       │        └ div.nav-seccion__item (×N, con --i para el escalonado) → NavEscritorio
       └ div.sidebar__footer
           ├ NavLink.user-chip → AvatarPropio + (nombre, rol)
           └ div.sidebar__acciones
               ├ Instalar aplicación (solo si el navegador lo permite)
               ├ Buscar pantalla (Ctrl+K)
               ├ Modo foco
               ├ Fijar menú abierto / Contraer menú
               └ div.sidebar__salida → [Cerrar sesión] + ThemeButton
 └ div.app__contenido → header.topbar + main.main
```

### 3.2 Geometría y estados

- `.app` es una **grid** de dos columnas: `calc(var(--rail-w) + var(--s-3)*2)` y `minmax(0,1fr)`. Con `.app--barra-fija` la primera columna pasa a `calc(var(--sidebar-w) + var(--s-3)*2)`. Transición de 350 ms `cubic-bezier(0.2,0.8,0.2,1)`.
- `.sidebar`: `position: sticky; top: var(--s-3); height: calc(100dvh - var(--s-3)*2); margin: var(--s-3) 0 var(--s-3) var(--s-3); width: var(--rail-w); z-index: 30`.
- `.sidebar__panel`: `position:absolute; inset 0 (top/left/bottom 0); width: var(--rail-w); border-radius: 1.625rem; overflow hidden; isolation:isolate; background: var(--glass-thick); backdrop-filter: var(--glass-blur-thick); box-shadow: var(--glass-shadow); transition: width 350ms cubic-bezier(.2,.8,.2,1), box-shadow 350ms`. Un `::before` pinta `--glass-sheen`.
- **Tres estados** (un único criterio en todo el CSS):
  - **Contraído (riel)**: `.sidebar:not(:hover):not(.sidebar--teclado):not(.sidebar--fijo)`. Solo iconos centrados. Ancho `--rail-w`.
  - **Expandido por cursor o foco de teclado**: `.sidebar:hover` o `.sidebar--teclado`. Ancho `--sidebar-w`, fondo **sólido** `var(--surface)` y sombra extra `0 30px 60px -20px rgba(0,0,0,.25)`. **Se superpone al contenido; la página no se mueve.**
  - **Fijo**: `.sidebar--fijo` + `.app--barra-fija`. Mismo ancho, pero sí empuja el contenido. Se guarda en `localStorage` (`fleet_nav_fijo` = `'1'`/`'0'`).
- Clase `.sidebar--teclado`: se agrega por JS cuando algo dentro tiene `:focus-visible` (`focusin`/`focusout` sobre el `aside`), **no** con `:has()`.
- Los textos llevan `.sidebar__texto`: `opacity:0; white-space:nowrap; overflow:hidden; transition: opacity 120ms`. Al expandir: `opacity:1; transition: opacity 220ms ease 120ms` (aparecen un poco después de que crece el panel). En el riel, además, `display:none` para que los iconos queden centrados.
- `.sidebar__nav`: `flex:1; overflow-y:auto; padding: 0 var(--s-2) var(--s-4); gap: var(--s-5); scrollbar oculto; mask-image: linear-gradient(to bottom, transparent 0, #000 var(--s-3), #000 calc(100% - var(--s-6)), transparent 100%)` (borde difuminado, no línea dura).
- `prefers-reduced-motion`: sin transiciones ni animaciones.

### 3.3 Sección con icono de color (`menu-secciones.css`)

- Cada sección recibe `style={{ '--seccion': color }}`. Colores (`COLOR_SECCION` en `AppShell.tsx`): Operaciones `#2563eb`, Operaciones Marsisa `#d97706`, Flota `#16a34a`, Mantenimiento `#ea580c`, Almacén `#7c3aed`, Gerencia `#0f766e`, RRHH `#db2777`, Tesorería `#059669`, Conductor `#0891b2`, Seguridad `#475569`, Directorio `#4f46e5`, Favoritos `#d97706`. Sin color → `var(--accent)`.
- **El icono es de color directo, sin caja ni sombra** (estilo Ajustes de Apple): `.nav-seccion__icono` 34×34, `color: var(--seccion)`, SVG 20 px con `stroke-width 1.8`. Hover: `scale(1.06)` con `cubic-bezier(.34,1.56,.64,1)`.
- Cabecera `.nav-seccion__cab`: `display:flex; gap:10px; padding:6px 8px; border-radius:16px; margin-top:4px`. Hover: fondo `color-mix(in srgb, var(--seccion) 8%, transparent)`. Pulsado: `scale(.98)`. Foco: `outline 2px solid var(--seccion)`.
- Título: `0.6875rem`, peso 700, `letter-spacing .07em`, MAYÚSCULAS.
- **Acordeón: una sola sección abierta a la vez.** Al entrar a una ruta se abre automáticamente la sección que la contiene (`useEffect` sobre `location.pathname`).
- Sección abierta: barra vertical de acento de 3 px a la izquierda (`::before`, `top/bottom: 14px`), título y flecha en `--seccion`, flecha girada 180°.
- Opciones de la sección abierta: entran una tras otra (`item-entrada`, 520 ms, `animation-delay: calc(var(--i)*60ms + 70ms)`, desde `translateX(-16px) scale(.96)`).
- **Pendientes**: con la sección cerrada y menú expandido, una píldora de `--seccion` con el número (`.nav-seccion__pendientes`); con el riel contraído, un punto rojo `#ef4444` de 9 px en la esquina del icono (`.nav-seccion__aviso`).
- **Indicador de sección** (`/nav/indicadores`): una línea de cifra con el color de la sección, solo con la sección abierta y el menú expandido (`margin: 0 12px 8px 54px; 0.75rem; peso 600`).
- Riel contraído: iconos centrados; la sección abierta marca con una línea de 3 px pegada al borde izquierdo (`left:5px; top/bottom:10px; opacity .85`).

### 3.4 Opciones (`.nav-item`)

- `min-height: 2.375rem; padding: 0 var(--s-3); gap: var(--s-3); border-radius: var(--r-full); font-size: .9375rem; weight 500; letter-spacing -.008em`. Icono 18 px, `strokeWidth 1.9`, color `--label-2`.
- Hover: `--fill-subtle`. Pulsado: `scale(.97)` y `--fill`.
- **Activa** (`aria-current="page"`): fondo `--glass-lens`, sombra `--glass-shadow-sm`, peso 600, icono en `--accent`. Se detecta con `NavLink` (la raíz `/` usa `end`).
- Foco: `outline 2px solid var(--accent); offset 2px`.
- Contador: `.nav-item__contador` píldora roja (`--red`), blanco, `0.6875rem`, peso 700, `margin-left:auto`.
- Opción "Pronto": `opacity .55`, sin hover, etiqueta "Pronto".
- Riel contraído: cada opción 44×44, centrada, `border-radius 14px`.
- **Submenús** (`children`): `NavEscritorio` recursivo. Nivel 1: `min-height 2.25rem`, `.875rem`, peso 450, icono 16. Nivel 2: `2.125rem`, `.8125rem`, icono 14, color `--label-2`. Los hijos van sangrados `margin-left: calc(var(--s-3) + 9px)`, con guía vertical de 1.5 px (`--separator`; si hay hijo activo, `color-mix(in srgb, var(--accent) 45%, var(--separator))`). El padre de la ruta activa se tiñe de `--accent` (sin píldora). Se abren solos si contienen la ruta activa. Animación `nav-hijos-entrada` 220 ms.

### 3.5 Pie: usuario y acciones

- `.sidebar__footer`: `padding: var(--s-2); box-shadow: inset 0 1px 0 var(--separator)`.
- `.user-chip` = `NavLink` a `/perfil`: `AvatarPropio` + nombre (`.875rem`, 600) y rol (`.75rem`, `--label-2`), con puntos suspensivos. Hover `--fill-subtle`; en `/perfil` queda con `--glass-lens`.
- Acciones (en columna, `gap 2px`): **Instalar aplicación** (solo si `useInstallApp().canPrompt` y no está instalada), **Buscar pantalla (Ctrl+K)**, **Modo foco** (`aria-pressed`), **Fijar menú abierto / Contraer menú**, y la fila de salida: **Cerrar sesión** (`flex:1`) + `ThemeButton` de 2.375 rem. En el riel esa fila va apilada; expandida, en fila.

### 3.6 Funciones extra

| Función | Detalle | Almacenamiento |
|---|---|---|
| Ctrl+K / ⌘K | Abre `PaletaComandos`: busca por nombre y sección, flechas + Enter, Esc cierra, estrella para favorito, favoritos primero | — |
| Favoritos | Máximo 5 (`slice(-5)`), por usuario | `fleet_favoritos_<email>` |
| Modo foco | El menú vuelve a contraerse al cambiar de pantalla | `fleet_modo_foco` |
| Menú fijo | Ver 3.2 | `fleet_nav_fijo` |
| Tema | `claro` / `oscuro` / `auto` (`data-theme` en `<html>`) | ver `theme.ts` |
| Acento | Ver sección 2 | `fleet_accent` |

Todo `localStorage` va en `try/catch` y la app funciona sin él.

---

## 4. Celular y tableta (< 1024 px)

- La barra lateral **no existe** (`display:none`). Se usa:
  - **Barra superior** (`.topbar`): logo, título de la pantalla (aparece al hacer scroll) , botón de tema y avatar que lleva a `/perfil`. Sin fondo propio; al desplazar aparece un borde difuminado (`.is-scrolled`).
  - **Dock inferior** (`ModuleDock`): cápsula de vidrio (`--dock-fondo`, blur 28 px) con un botón por módulo (icono 21 px + nombre `.6875rem`), **Inicio** primero y **Ajustes** al final. El activo lleva una píldora `--glass-lens` que se desliza (`motion` con `layoutId="dock-pill"`). Se desliza en horizontal si no caben y centra el activo. `max-width: 34rem`, flotante a `--tabbar-gap` del borde.
  - Tocar un módulo abre una **hoja** (`Sheet`) con la lista de pantallas (`.modulo-fila`: icono en baldosa `--accent-tint`, texto 600, flecha; activa con borde `--accent` de 1.5 px).
  - **Ajustes** (hoja): fila de usuario → Apariencia (`ThemeSelector`) → Color de la app (`AccentPicker`) → secciones de Configuración → Instalar app → Cerrar sesión (rojo).
- En celular el contenido se desplaza dentro de `<main>` (no en el documento) y las barras de desplazamiento se ocultan.

---

## 5. Transiciones entre pantallas

- Cada ruta se envuelve en `div.vista-transicion` con `key={location.pathname}`: animación `vista-entrada` 640 ms `cubic-bezier(.2,1.25,.35,1)` (de `translateY(22px) scale(.97) blur(10px)` a normal).
- `LimiteDeError` con la misma `key`: si una pantalla falla, el menú sigue arriba.
- Al cambiar de ruta: `window.scrollTo(0,0)`, `main.scrollTo(0,0)`, se cierran las hojas.

---

## 6. Usuario y perfil

### 6.1 Datos del usuario (`useAuth()`)
`user.name`, `user.email`, `user.roleName`, `user.companyName`; `can('modulo.accion')` para permisos; `logout()`; `refresh()`.

### 6.2 Avatar
`AvatarPropio` (`src/modules/perfil/AvatarPropio.tsx`) muestra la **foto** si existe y, si no, las **iniciales** (`initials()` de `core/lib/format`). `Avatar` (`core/ui/Display.tsx`) acepta `size: 'sm' | 'lg'` y `accent` (fondo con el color de la app). Se usa igual en barra lateral, barra superior, Ajustes y Mi cuenta.

### 6.3 Pantallas (`src/modules/perfil/`)

| Ruta | Archivo | Contenido |
|---|---|---|
| `/perfil` | `PerfilPage.tsx` | Tarjeta con avatar grande, nombre, correo, rol y empresa → Apariencia → Color de la app → Avisos al teléfono → lista de acciones: Cambiar contraseña, Sesiones activas, Editar perfil y foto, Cerrar sesión (rojo) |
| `/perfil/editar` | `EditarPerfilPage.tsx` | Nombre, teléfono, foto, portada y firma digital |
| (hoja) | `CambiarPasswordSheet.tsx` | Contraseña actual y nueva |
| (hoja) | `SesionesSheet.tsx` | Sesiones activas y "cerrar las demás" |
| (bloque) | `AvisosTelefono.tsx` | Aviso por teléfono |

Cada fila de la lista usa `className="row pressable"` con icono de 20 px (`strokeWidth 1.8`), texto 600 y háptica (`haptic('selection')`; `haptic('warning')` en cerrar sesión).

### 6.4 Endpoints (contrato del servidor, `src/modules/perfil/perfilApi.ts`)

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/perfil/me` | Perfil (nombre, teléfono, `avatar_url`, `banner_url`, firma) |
| PUT | `/api/perfil/me` | Guarda cambios del perfil |
| GET | `/api/perfil/imagen-upload-url?contentType=image/jpeg` | URL firmada para subir la foto (S3) → `{ uploadUrl, fileUrl }` |
| POST | `/api/perfil/imagen-lectura` | URL firmada de lectura `{ url }` |
| PUT | `/api/perfil/password` | `{ actual, nueva }` |
| GET | `/api/perfil/sesiones` | Lista de sesiones |
| DELETE | `/api/perfil/sesiones-otras` | Cierra las demás sesiones |
| GET | `/api/nav/indicadores` | Cifra por sección para el menú |
| GET | `/api/tenant-logo` | Logo de la empresa para `BrandMark` |

Las rutas son siempre relativas (`/api/...`), nunca absolutas.

---

## 7. Datos del menú (`navigation.ts`)

```ts
interface NavItem {
  key: string; label: string; icon: LucideIcon; to?: string;
  permissions: string[];          // 'modulo.ver'; vacío = cualquiera con sesión
  children?: NavItem[];           // submenú
  pronto?: boolean;               // deshabilitado con etiqueta "Pronto"
  badge?: 'aprob-oc' | 'aprob-caja';   // contador de pendientes
  soloEmpresa?: string; noEmpresa?: string; soloFundador?: boolean;
}
interface NavSection { title: string; items: NavItem[] }
```

`visibleSections(can, esFundador)` filtra por permisos. `findNavItem(pathname)` da el título de la pantalla actual. `homePath(can)` da la ruta de inicio según permisos. Las secciones `Configuración` van a **Ajustes** en el celular, y `Dashboard` es el botón **Inicio** del dock.

---

## 8. Reglas de fidelidad (lo que no se debe cambiar)

1. Iconos de sección **de color directo, sin cuadro ni sombra** y sin fondo de color.
2. Un solo acordeón abierto; se abre solo la sección de la ruta actual.
3. Riel de 4.5 rem → 16.5 rem **superponiéndose** (la página no salta), salvo en modo fijo.
4. Los textos aparecen con retraso (120 ms) después de que el panel crece.
5. La opción activa es una **lente de vidrio** (`--glass-lens` + `--glass-shadow-sm`), no un color sólido.
6. Naranja solo como acento (activo, foco, interruptores); las acciones principales son **negras**.
7. Todo debe funcionar igual en web y celular, en claro y oscuro, y con `prefers-reduced-motion`.
8. Accesibilidad: `aria-label` en la navegación, `aria-expanded` en secciones, `aria-current="page"` en la activa, `aria-pressed` en los interruptores, foco visible.
9. Los nombres de variables CSS, clases y llaves de `localStorage` se mantienen (`fleet_*`) para que sirvan los mismos estilos.

## 9. Qué sí se adapta al proyecto de combustible

- Los nombres de las secciones, sus **colores** (mantener la misma paleta de la sección 3.3 y agregar nuevos con la misma saturación, ~600 de Tailwind) y sus **iconos** de `lucide-react`.
- Las rutas y los permisos de `navigation.ts`.
- El nombre del producto en el `Wordmark` y el nombre de la empresa bajo él.
- Los endpoints del servidor, si el backend nuevo los nombra distinto (mantener el contrato de la sección 6.4).

## 10. Si algo no está claro

Preguntar antes de inventar. Casos típicos: qué hace una sección con muchos submenús, permisos que no existen aún, qué módulo es "Inicio", y si el proyecto de combustible tiene multiempresa (afecta `BrandMark`, `/tenant-logo` y `soloEmpresa`).
