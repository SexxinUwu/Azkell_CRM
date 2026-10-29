# Webhooks salientes de la API

Sistema › API y desarrolladores permite registrar una URL para que Azkell ERP le avise cuando ocurre un evento de negocio. Cada aviso va firmado con HMAC-SHA256 y se reintenta un número limitado de veces.

Código: `services/webhooks.js` (envío, firma, reintentos), `routes/api-gateway.js` (endpoints `/api/sistema/webhooks...`), `services/notificaciones_eventos.js` (emisión desde cada evento), `src/modules/sistema/WebhooksSeccion.tsx` (pantalla).

## 1. Catálogo de eventos

El catálogo reutiliza los eventos que ya existen en `services/notificaciones.js` (`EVENTOS`). No se crearon eventos nuevos.

| Evento | Qué significa | Cuándo se emite | Origen en el código |
|---|---|---|---|
| `oc_aprobacion` | Una orden de compra queda por aprobar | Al enviar la O/C a aprobación. No se repite la misma O/C dentro de 30 min | `routes/almacen.js` (aviso `oc_aprobacion`) |
| `oc_pagar` | Una O/C queda aprobada y Tesorería debe pagarla | Al aprobar la O/C. No se repite dentro de 5 min | `services/notificaciones_eventos.js` `avisarOcPagar`; llamado desde `routes/almacen.js` y `routes/ordenes_compra.js` |
| `oc_voucher` | Tesorería subió el comprobante de pago de una O/C | Al subir el voucher. No se repite dentro de 5 min | `avisarOcVoucher`; llamado desde `routes/almacen.js` |
| `ot_fin_rampa` | Una unidad sale de taller (OT finalizada o salida de rampa) | Al cerrar la OT o liberar la rampa. No se repite dentro de 15 min | `routes/taller.js` |
| `checklist_critico` | Un conductor reporta una falla crítica; la unidad no debe salir | Al registrar un checklist con falla crítica | `routes/checklist.js` |
| `flota_vencimiento` | Resumen de documentos de flota vencidos o por vencer | Una vez al día (7:00, hora de Lima) por empresa, o al forzar el envío desde Notificaciones | `ejecutarVencimientos` en `services/notificaciones_eventos.js` |

Un webhook solo recibe los eventos que eligió al crearlo. Los webhooks no dependen de la regla de Notificaciones del ERP: si un evento tiene webhook suscrito, se emite aunque su aviso (correo, WhatsApp, push) esté desactivado.

### Datos de cada evento (`datos`)

Los datos nunca incluyen contraseñas ni números de cuenta completos.

- `oc_aprobacion`: `orden_id`, `proveedor`, `moneda`, `monto` (en la moneda de la O/C), `total_pen`, `motivo`, `solicitante`, `empresa`.
- `oc_pagar`: `orden_id`, `proveedor`, `total_pen`, `cuenta` (texto tipo `terminada en 5566`).
- `oc_voucher`: `orden_id`, `proveedor`.
- `ot_fin_rampa`: `placa`, `orden_trabajo`, `rampa`, `tecnicos` (lista), `cerrado_por`, `empresa`.
- `checklist_critico`: `folio`, `placa`, `reportado_por`, `detalle`, `backlog_id`, `empresa`.
- `flota_vencimiento`: `fecha` (AAAA-MM-DD), `vencidos` (número), `por_vencer` (número), `documentos` (lista de `{placa, documento, fecha, dias}`; máximo 200; `dias` negativo = ya venció).

## 2. Formato del envío

- Método `POST`, `Content-Type: application/json`, `User-Agent: AzkellERP-Webhooks/1.0`.
- Cuerpo:

```json
{
  "id": "evt_6f1c2a3e-9b7d-4c1a-8e21-0d4f5a6b7c8d",
  "evento": "oc_pagar",
  "version": 1,
  "creado_en": "2026-10-29T15:04:05.000Z",
  "datos": { "orden_id": "OC-1042", "proveedor": "Proveedor SAC", "total_pen": 1234.5, "cuenta": "terminada en 5566" }
}
```

- Cabeceras:
  - `X-Azkell-Evento`: nombre del evento (`oc_pagar`, `prueba`...).
  - `X-Azkell-Entrega`: identificador del envío en Azkell. Repite el mismo valor en cada reintento: sirve para no procesar dos veces.
  - `X-Azkell-Firma`: `t=<unix en segundos>,v1=<hex>`. Ver la sección 3.

El identificador `id` del cuerpo es el mismo para el mismo evento aunque lo reciban varios webhooks.

## 3. Cómo verificar la firma (lado del receptor)

La firma es `HMAC_SHA256(secreto, t + "." + cuerpo_crudo)` en hexadecimal. Compara el cuerpo tal como llegó, sin volver a serializar el JSON.

```js
const crypto = require('crypto');

function verificarWebhook(secreto, cabeceraFirma, cuerpoCrudo) {
  const partes = Object.fromEntries(cabeceraFirma.split(',').map(p => p.split('=')));
  const t = Number(partes.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false; // rechaza avisos con más de 5 min
  const esperada = crypto.createHmac('sha256', secreto).update(`${t}.${cuerpoCrudo}`).digest('hex');
  const a = Buffer.from(esperada, 'hex'), b = Buffer.from(partes.v1 || '', 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

El secreto (`whsec_...`) se muestra una sola vez, al crear el webhook. Si se pierde, hay que eliminar el webhook y crear otro.

Responde `2xx` lo antes posible. Un receptor que tarda más de 10 segundos cuenta como fallo.

## 4. Reintentos y estados

- Intentos máximos: 3 en total. El primero es inmediato; el segundo, 30 segundos después; el tercero, 5 minutos después del segundo.
- Se reintenta solo ante errores de red, tiempo agotado (10 s), `408`, `429` y `5xx`.
- No se reintenta ante otros `4xx` ni ante redirecciones `3xx` (no se siguen). Quedan como `FALLIDO` de inmediato.
- Si el webhook se pausa o se elimina entre intentos, el envío se detiene.
- Estados en el historial (`webhook_envios`): `PENDIENTE` (en curso o pendiente de reintento), `ENTREGADO` (respuesta `2xx`), `FALLIDO` (agotó los intentos o el error no admite reintento).
- Cada webhook guarda `ultimo_envio` y `ultimo_estado`, y la pantalla muestra el historial de sus últimos envíos.

## 5. Gestión (API interna del panel)

Todos los endpoints exigen sesión y permiso de administración (`administracion` en `rbac.js`).

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/sistema/webhooks/catalogo` | Eventos disponibles |
| GET | `/api/sistema/webhooks` | Lista de webhooks (el secreto aparece enmascarado) |
| POST | `/api/sistema/webhooks` | Crea un webhook `{ nombre, url, eventos[] }`; responde el `secreto` una sola vez |
| PUT | `/api/sistema/webhooks/:id` | Cambia `nombre`, `url`, `eventos` o `activo` (pausar / reactivar) |
| DELETE | `/api/sistema/webhooks/:id` | Elimina el webhook y su historial |
| POST | `/api/sistema/webhooks/:id/probar` | Envía un evento `prueba` con un solo intento y devuelve el resultado |
| GET | `/api/sistema/webhooks/:id/envios` | Últimos 50 envíos |

Las llaves de API (`/api/sistema/api-keys`) usan la misma ruta de gestión.

## 6. Seguridad

- Solo `https://` en producción. Se rechazan URLs con usuario o contraseña.
- Se rechazan destinos internos (`localhost`, `127.0.0.0/8`, `10.x`, `192.168.x`, `169.254.x`, `172.16-31.x`).
- No se siguen redirecciones.
- Cada webhook tiene su propio secreto; el secreto nunca vuelve a mostrarse completo.
- Las cargas no incluyen contraseñas, llaves de API ni cuentas bancarias completas.
- Los cambios de webhooks y llaves quedan en la auditoría (`CREATE`, `UPDATE`, `DELETE` con entidad `webhook`).

## 7. Pruebas locales

Para probar contra un receptor local (`127.0.0.1` o `localhost`) hay que activar la variable de desarrollo:

```
WEBHOOKS_PERMITIR_LOCAL=1
```

Con esa variable se permite `http://` y destinos internos. No debe activarse en producción.

## 8. Lo que no cubre todavía

- Los reintentos viven en memoria del proceso. Si el servidor se reinicia mientras hay envíos pendientes de reintento, esos envíos quedan `PENDIENTE` en el historial y no se reanudan solos.
- No hay rotación de secreto desde la pantalla (hay que eliminar y crear de nuevo).
- La protección contra destinos internos se basa en el nombre o la IP escrita en la URL; no resuelve DNS, así que un nombre público que apunte a una IP interna no se bloquea.
- No hay límite de envíos por minuto por webhook.
- Las tablas `webhooks` y `webhook_envios` se crean la primera vez que se usan, en la base de cada empresa.
