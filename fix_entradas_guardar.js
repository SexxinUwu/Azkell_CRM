const fs = require('fs');

const pathLogica = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let logica = fs.readFileSync(pathLogica, 'utf8');

// Update guardarEntrada payload
const regexGuardar = /var placa\s*=\s*window\._cbGet\('ent-f-placa'\)\s*\|\|\s*'';\s*if \(\!fecha\)/;

if (regexGuardar.test(logica)) {
    logica = logica.replace(regexGuardar, `var placa = window._cbGet('ent-f-placa') || '';
      var ot_id = window._cbGet('ent-f-ot') || '';
      if (tipo_orden.toLowerCase() === 'orden de servicio') {
          placa = (document.getElementById('ent-f-ot-placa') || {}).value || '';
      } else {
          ot_id = null;
      }
      
      if (!fecha)`);
}

const regexPayload = /var payload = \{ fecha, proveedor_id: provId\|\|null, proveedor_nombre: provNombre\|\|null,\s*documento_referencia: docRef\|\|null, moneda,\s*tipo_igv: window\._entIgvMode \|\| 'sin_igv',\s*tipo_cambio: moneda === 'USD'\s*\?\s*\(parseFloat\(\(document\.getElementById\('ent-f-tc'\)\|\|\{\}\)\.value\)\s*\|\|\s*window\._entTC\s*\|\|\s*3\.40\)\s*:\s*1,\s*observaciones: obs,\s*motivo_entrada: motivo,\s*placa: placa,\s*tipo_orden: tipo_orden,\s*condicion_pago: condicion_pago,\s*dias_credito: dias_credito,\s*creado_por: localStorage\.getItem\('fleet_user'\)\|\|'', items \};/;

if (regexPayload.test(logica)) {
    logica = logica.replace(regexPayload, `var payload = { fecha, proveedor_id: provId||null, proveedor_nombre: provNombre||null,
          documento_referencia: docRef||null, moneda,
          tipo_igv: window._entIgvMode || 'sin_igv',
          tipo_cambio: moneda === 'USD'
              ? (parseFloat((document.getElementById('ent-f-tc')||{}).value) || window._entTC || 3.40)
              : 1,
          observaciones: obs,
          motivo_entrada: motivo,
          placa: placa,
          ot_id: ot_id,
          tipo_orden: tipo_orden,
          condicion_pago: condicion_pago,
          dias_credito: dias_credito,
          creado_por: localStorage.getItem('fleet_user')||'', items };`);
}

// When editing, load OT ID
const regexEdit = /if \(entrada\.proveedor_id\) \{/;
if (regexEdit.test(logica) && !logica.includes('if (entrada.ot_id) {')) {
    logica = logica.replace(regexEdit, `if (entrada.ot_id) {
          window._cbSet('ent-f-ot', entrada.ot_id, entrada.ot_id + (entrada.placa ? ' — ' + entrada.placa : ''));
          var placaInput = document.getElementById('ent-f-ot-placa');
          if (placaInput) placaInput.value = entrada.placa || '';
      }
      
      if (entrada.proveedor_id) {`);
}

// Ensure tipoOrdBadge is applied to all rows in the table
logica = logica.replace(
    /'<td class="text-center" style="vertical-align:middle;">' \+ \(isFirst \? tipoOrdBadge : ''\) \+ '<\/td>' \+/g,
    `'<td class="text-center" style="vertical-align:middle;">' + tipoOrdBadge + '</td>' +`
);

fs.writeFileSync(pathLogica, logica);
console.log('Fixed guardar logic successfully');
