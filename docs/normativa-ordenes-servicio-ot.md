# Normativa: órdenes de servicio y orden de trabajo (OT)

Vigente desde el 26/11/2026. Aplica a todas las órdenes de servicio que se generen en Azkell Fleet.

## Regla principal
**Todo servicio se asocia a una OT.** No pueden quedar servicios «en el aire»: la OT ubica el servicio en una placa y le carga el costo.

## 1. Al generar la orden de servicio (obligatorio)
- En **Almacén › Órdenes de compra › Nueva orden › Orden de servicio** hay dos interruptores: **Con OT** y **Sin OT**. Siempre hay uno encendido; **Con OT** viene encendido por defecto.
- **Con OT:** la OT es **obligatoria**. Si no se elige, el sistema no deja guardar y avisa «Debes registrar la OT asociada al servicio».
- La **placa no se digita**: se toma de la OT elegida.
- Si la OT no aparece en la lista, primero se crea la OT.

## 2. Excepción: pagos a terceros sin relación con una placa
- Se usa **Sin OT** solo cuando el pago no tiene que ver con ninguna unidad.
- La placa queda en «Sin placa». Antes de guardar, el sistema pide confirmar: **«Este servicio se está generando sin OT asociada. ¿Desea continuar?»**
- Es una excepción: queda identificada y aparece en el filtro **OS sin OT asignada**.

## 3. Lo que ocurre solo (automático)
- **Al aprobarse** una orden de servicio **con OT**, el sistema la **asigna sola a esa OT** y su costo suma en la OT. Funciona al aprobar desde Gerencia y también desde el enlace de WhatsApp.
- Al aprobar, Gerencia ve el aviso «Se asignó automáticamente a la OT …».
- Si la OT ya estaba **cerrada o finalizada**, igual se asigna y el aviso lo indica.
- Si la OT está **anulada** o no existe, **no** se asigna y el aviso explica por qué; se asigna a mano a otra OT.
- Queda registro en la auditoría de que la asignación fue automática.

## 4. Lo que se hace a mano
- Una orden **Sin OT** se puede asignar después desde la OT: pestaña **Servicios › Agregar servicio**.
- La lista muestra solo los servicios **de la placa de la OT** y los **sin placa**. Los que ya están asignados salen **tachados** y no se pueden agregar otra vez.
- «Incluir otras placas» existe solo para corregir errores; al usarlo el sistema lo marca.
- Si se quita un servicio de una OT abierta, queda libre para asignarlo a otra. **En una OT cerrada no se pueden quitar servicios.**

## 5. Recepción
- Las órdenes de servicio **no se recepcionan**: el servicio se asigna a su OT. La única excepción es la orden de **reencauche**, que recibe llantas.
- Los artículos no deben registrarse como «INV» dentro de una orden de servicio: lo que es servicio va como **SERV**.

## 6. Control y seguimiento
- **Órdenes de compra › Filtros › Tipo de orden › OS sin OT asignada**: muestra qué servicios aún no suman a ninguna OT.
- El **Excel** de la lista exporta lo filtrado e incluye las columnas **OT** y **Situación OT**.
- Las órdenes **antiguas** sin OT no se modifican. Se regularizan con el reporte auditable (constancia, resumen y detalle con huella SHA-256), asignando cada una a su OT solo cuando se conozca con certeza.
