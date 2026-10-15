# Inventario para documentos legales

Base de los textos de `src/modules/legal/legalContenido.ts`. Lo que aquí aparece se verificó en el código; lo que no se puede verificar desde el código queda como `[COMPLETAR]` en los textos. **No sustituye la revisión de un abogado en Perú.**

## Cookies y almacenamiento del navegador

| Clave | Dónde | Tipo | Duración | Para qué |
| --- | --- | --- | --- | --- |
| `azkell_session` | cookie HttpOnly (`server.js`, `res.cookie`) | necesaria | 12 h (`maxAge`) | Sesión del usuario |
| `fleet_sesion` | localStorage | necesaria | hasta cerrar sesión | Bandera de sesión activa |
| `fleet_tema`, `fleet_accent`, `fleet_fontsize`, `fleet_nav_*`, filtros | localStorage | preferencias | hasta borrar datos del sitio | Apariencia y filtros |
| `azkell_saved_email` | localStorage | opcional | hasta borrar | Solo si el usuario elige recordar el correo |
| `azkell.perfil.<correo>` | localStorage | caché | hasta borrar | Perfil para mostrarlo al instante |
| `azkell.foto.<url>` | localStorage | caché | hasta borrar o cuando la foto cambia | Foto y portada en data URL |
| `fleet_rutaActual` | sessionStorage | necesaria | hasta cerrar la pestaña | Recordar la pantalla |

No hay cookies de publicidad, analítica ni píxeles. No se encontró ninguna herramienta de analítica en `src/`, `Index.html`, `logica.js`, `modulos/` ni `sw.js`. Por eso no hay banner de consentimiento. Si se agrega analítica, se necesita consentimiento antes de activarla.

## Terceros que reciben datos

| Servicio | Dónde se usa | Qué recibe | Pendiente |
| --- | --- | --- | --- |
| Amazon S3 | `utils/s3.js`, `routes/perfil.js` | Fotos, documentos, firmas | CORS y región declarados en la política |
| Wialon | `server.js`, `modulos/flota/ubicacion` | Consultas GPS | Confirmar contrato y ubicación de datos |
| SUNAT | `routes/guia_*`, `server.js` | Guías y comprobantes | Ninguno |
| APISPERU | `server.js` (`/api/proxy/documento`) | DNI o RUC | Se consulta desde el servidor |
| WhatsApp (Evolution API) | `docker-compose.evolution.yml`, `web/qr_whatsapp.html` | Mensajes de aprobación | Confirmar si es instancia propia |
| MarsisaSoft | `server.js` (sincronización) | Vales y órdenes de viaje | Confirmar contrato |
| Google Gemini | `consultarGemini` en `server.js` | Consultas del asistente | **Confirmar si se envían datos personales** |
| Have I Been Pwned (rango k-anonymity) | `services/politica_clave.js` | Prefijo SHA-1 de la contraseña | Ninguno |
| Open-Meteo | `modulos/mantenimiento/dashboard/logica.js` | Latitud y longitud del taller | **Confirmar licencia de uso comercial** |
| Google Fonts | `Index.html`, `src/core/styles` | IP del navegador | Valorar alojar las fuentes en el servidor |
| CDNs (cdnjs, jsdelivr, unpkg) | `Index.html`, `libs/` | IP del navegador | Valorar alojar las librerías en `libs/` |
| Google Maps y Waze | enlaces (`href`) en GPS y disponibilidad | Solo si el usuario toca el enlace | Ninguno |
| WhatsApp (`wa.me`) | enlaces | Solo si el usuario toca el enlace | Ninguno |

### Pendientes detectados

1. **`api.qrserver.com`** (3 usos en el clásico: inventario, guías de remisión y personal) envía a un tercero el contenido del código QR. Si ese contenido incluye datos personales o de guías, conviene generar el QR en el cliente.
2. **Logos en Google Drive** (`drive.google.com/thumbnail?id=…`, 9 usos en 7 archivos de reportes y PDF) dependen de un archivo personal de Google Drive. Si se borra o se cambia de cuenta, el logo deja de salir. Conviene guardar el logo de la empresa en el servidor.
3. **Icono de icons8** (`img.icons8.com`) en la guía de remisión: **ya reemplazado** por un icono SVG local. Su licencia no permite enlazar sus imágenes desde otros sitios.

## Accesibilidad y contraste

- Texto terciario claro: `#86868b` daba 3,6:1 sobre blanco (menos de 4,5:1). Ahora es `#6c6c71` (≥ 4,5:1 sobre blanco, fondo y barra lateral).
- El bloque `prefers-contrast: more` oscurecía los textos también en modo oscuro. Ahora solo aplica al tema claro.
- Búsqueda de texto: las 15 etiquetas `<img>` de `src/` tienen atributo `alt`. Falta revisar que el texto sea descriptivo en las imágenes con contenido, porque la búsqueda no lee etiquetas multilínea.
- Pendiente: revisar botones solo con icono sin `aria-label` en toda la app.

## Derechos de imágenes

- Iconos: `lucide-react` (ISC), y `libs/` (licencias de cada librería).
- Tipografías: Google Fonts (OFL).
- Logos de la empresa: el logo es de la empresa cliente. [COMPLETAR: confirmar titularidad y permiso de uso del logo de Azkell Fleet].

## Textos comerciales

Se revisó `src/` buscando reseñas, testimonios, cifras o afirmaciones comerciales. No se encontró ninguna. Los únicos "100 %" son anchos de CSS.

La pantalla de login decía "Lima, Perú". Se cambió a "Perú" porque la ciudad no se puede confirmar desde el código.

## Pendientes que requieren datos o decisiones del negocio

- Razón social y RUC del responsable (la empresa cliente) y del encargado (Azkell).
- Domicilio y correo para derechos ARCO.
- Código de inscripción del banco de datos en el Registro Nacional de Protección de Datos Personales, o confirmar que no aplica.
- Plazos de conservación.
- Modalidad de cobro, cancelación y reembolso. Si se vende también a consumidores finales, aplican la Ley 29571 y el Libro de Reclamaciones.
- Jurisdicción y límite de responsabilidad.
- Revisión por abogado en Perú antes de publicar.
