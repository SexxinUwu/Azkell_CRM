# Inventario para documentos legales

Base de los textos de `src/modules/legal/legalContenido.ts`. Lo que aquí aparece se verificó en el código. Lo que no se puede verificar desde el código queda como `[COMPLETAR]` en los textos. **No sustituye la revisión de un abogado en Perú.**

## Modelo del negocio

- Azkell Fleet es un software que se contrata por empresa. No hay cobros dentro del sistema: el monto y la forma de pago están en el contrato comercial con cada empresa cliente.
- Cada empresa cliente tiene su propia base de datos (`azkell_tenant_*`; el registro de empresas está en `services/tenant_master.js`).
- Roles de protección de datos: la empresa cliente es la responsable (titular del banco de datos). Azkell es el encargado.

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

## Asistente de IA (Gemini)

Lo que recibe Gemini, según `routes/asistente.js`:
- El prompt fijo del sistema (`KNOWLEDGE` en `routes/asistente-knowledge.js`), que no incluye datos de la empresa.
- Lo que escribe el usuario (máximo 500 caracteres) y el historial de esa conversación.

No recibe datos de la base de datos. Los reportes (Excel y PDF) se generan en el servidor y no pasan por Gemini.

Cambios hechos:
- Antes de enviar, se ocultan DNI (8 dígitos), teléfonos (`9xx xxx xxx`, con o sin +51) y correos. Se usa `ocultarDatosPersonales` en `routes/asistente.js`.
- Solo se envían los últimos 6 mensajes del historial.

Pendientes:
- **Plan de pago de Google.** Según las condiciones de Gemini API, en el plan gratuito Google usa las consultas para mejorar sus productos, y en el plan de pago no. La clave `GEMINI_API_KEY` debe pertenecer a un proyecto de Google Cloud con facturación activa. Verificar en ai.google.dev/gemini-api/terms, porque las condiciones cambian.
- Decidir si se permite al usuario escribir datos personales. Hoy el sistema oculta los más evidentes, pero no garantiza que no se filtre un nombre completo.
- Si el asistente se vende a varias empresas, conviene poder desactivarlo por empresa.

## Terceros que reciben datos

| Servicio | Dónde se usa | Qué recibe | Pendiente |
| --- | --- | --- | --- |
| Amazon S3 | `utils/s3.js`, `routes/perfil.js` | Fotos, documentos, firmas, logos de empresa | Región: el código usa `us-east-2` por defecto; confirmar la de producción |
| Wialon | `server.js`, `modulos/flota/ubicacion` | Consultas GPS | Contrato y ubicación de datos |
| SUNAT | `routes/guia_*`, `server.js` | Guías y comprobantes | Ninguno |
| APISPERU | `server.js` (`/api/proxy/documento`) | DNI o RUC, consultados desde el servidor | Contrato |
| WhatsApp (Evolution API) | `docker-compose.evolution.yml`, `web/qr_whatsapp.html` | Mensajes de aprobación | Confirmar si es instancia propia |
| MarsisaSoft | `server.js` (sincronización) | Vales y órdenes de viaje | Contrato |
| Google Gemini | `routes/asistente.js` | Texto del chat (ver sección anterior) | Plan de pago |
| Have I Been Pwned (rango k-anonymity) | `services/politica_clave.js` | Prefijo SHA-1 de la contraseña | Ninguno |
| Open-Meteo | `modulos/mantenimiento/dashboard/logica.js` | Latitud y longitud del taller | **Licencia comercial** (ver abajo) |
| Google Fonts | `Index.html`, `src/core/styles` | IP del navegador | Valorar alojar las fuentes en el servidor |
| CDNs (cdnjs, jsdelivr, unpkg) | `Index.html`, `libs/` | IP del navegador | Valorar alojar las librerías en `libs/` |
| Google Maps y Waze | enlaces (`href`) en GPS y disponibilidad | Solo si el usuario toca el enlace | Ninguno |
| WhatsApp (`wa.me`) | enlaces | Solo si el usuario toca el enlace | Ninguno |

### Open-Meteo: decisión pendiente

Según las condiciones de Open-Meteo, la API gratuita es solo para uso no comercial. Para vender el ERP hace falta una suscripción comercial o retirar el widget de clima. Verificar precios y licencia en open-meteo.com/en/pricing. Algunas fuentes indican que el endpoint de geocodificación tiene una licencia de datos que no permite uso comercial. No usar ese endpoint hasta confirmarlo.

### QR y logos

1. **`api.qrserver.com`** (3 usos en el clásico: inventario, guías de remisión y personal). Envía a un tercero el contenido del código QR, que puede incluir datos de guías o de personal. Conviene generar el QR en el cliente.
2. **Logo de la empresa.** Se guarda en `fleet_empresa_logo` (localStorage) desde la configuración, y en S3 para la app. Algunos reportes del clásico (`reportes-ot`, `status-rampa`, `fleetrun`, `inspecciones`, `checklist`, `disponibilidad`) tienen como respaldo un enlace a Google Drive (`drive.google.com/thumbnail?id=…`) si la empresa no configuró logo. Si se quiere eliminar esa dependencia, conviene quitar el respaldo y usar un logo genérico de Azkell.
3. **Icono de icons8** en la guía de remisión: **ya reemplazado** por un icono SVG local. Su licencia no permite enlazar sus imágenes desde otros sitios.

## Accesibilidad y contraste

- Texto terciario claro: `#86868b` daba 3,6:1 sobre blanco (menos de 4,5:1). Ahora es `#6c6c71` (≥ 4,5:1 sobre blanco, fondo y barra lateral).
- El bloque `prefers-contrast: more` oscurecía los textos también en modo oscuro. Ahora solo aplica al tema claro.
- Búsqueda de texto: las 15 etiquetas `<img>` de `src/` tienen atributo `alt`. Falta revisar que el texto sea descriptivo, porque la búsqueda no lee etiquetas multilínea.
- Pendiente: revisar botones que solo tienen icono y no tienen `aria-label` en toda la app.

## Derechos de imágenes y textos

- Iconos: `lucide-react` (ISC) y `libs/` (licencias de cada librería).
- Tipografías: Google Fonts (OFL).
- Logos: el logo de cada empresa cliente lo sube esa empresa. El logo de Azkell Fleet: [COMPLETAR: confirmar titularidad].
- Textos comerciales: no se encontraron reseñas, testimonios, cifras ni afirmaciones comerciales en `src/`. Los "100 %" son anchos de CSS.
- El pie del login decía "Lima, Perú". Ahora dice "Perú", porque la ciudad no se puede confirmar desde el código.

## Pendientes que requieren datos o decisiones

- Razón social, RUC y domicilio fiscal de Azkell (encargado). El domicilio fiscal es público en SUNAT, así que no hace falta publicar una dirección personal.
- Correo de contacto para derechos ARCO y para cancelaciones.
- Código de inscripción de los bancos de datos propios de Azkell en el Registro Nacional de Protección de Datos Personales, o confirmar que está en trámite.
- Contrato de encargo de tratamiento (acuerdo de datos) con cada empresa cliente. Debe incluir medidas de seguridad, la lista de proveedores (subencargados) y el borrado de datos al terminar el contrato. Lo redacta un abogado.
- Plazos de conservación y de borrado.
- SLA de disponibilidad, límite de responsabilidad y jurisdicción (ver los textos en `legalContenido.ts`).
- Decidir sobre Open-Meteo, el logo de respaldo de Drive y el QR externo.
- Revisión por abogado en Perú antes de publicar.
