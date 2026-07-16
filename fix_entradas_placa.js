const fs = require('fs');

const pathVista = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/vista.html';
const pathLogica = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';

let vista = fs.readFileSync(pathVista, 'utf8');
let logica = fs.readFileSync(pathLogica, 'utf8');

// 1. Add "Tipo Orden" column to the table header in vista.html
if (!vista.includes('<th>Tipo Orden</th>')) {
    vista = vista.replace(
        '<th>C\u00f3digo</th>',
        '<th>C\u00f3digo</th>\n              <th>Tipo Orden</th>'
    );
}

// 2. Extract tipoOrdBadge from the first cell and put it into its own cell in logica.js
if (!logica.includes('<!-- TIPO ORDEN CELL -->')) {
    logica = logica.replace(
        /var tipoOrdBadge = \(d\.tipo_orden && d\.tipo_orden\.toLowerCase\(\) === 'orden de servicio'\) \n                \? '<div class="badge bg-warning text-dark" style="font-size:0\.6rem; letter-spacing:0\.04em; margin-bottom:4px;">SERVICIO<\/div><br>' \n                : '<div class="badge bg-primary" style="font-size:0\.6rem; letter-spacing:0\.04em; margin-bottom:4px;">COMPRA<\/div><br>';/,
        `var tipoOrdBadge = (d.tipo_orden && d.tipo_orden.toLowerCase() === 'orden de servicio') ? '<span class="badge bg-warning text-dark" style="font-size:0.6rem; letter-spacing:0.04em;">SERVICIO</span>' : '<span class="badge bg-primary" style="font-size:0.6rem; letter-spacing:0.04em;">COMPRA</span>';`
    );

    // Replace in tr0 (no items)
    logica = logica.replace(
        /'<td class="text-center">' \+ tipoOrdBadge \+ '<span class="badge bg-secondary fw-normal" style="font-size:0\.72rem;">' \+ _entEsc\(d\.id \|\| ''\) \+ '<\/span><\/td>' \+/,
        `'<td class="text-center"><span class="badge bg-secondary fw-normal" style="font-size:0.72rem;">' + _entEsc(d.id || '') + '</span></td>' +
                '<td class="text-center"> <!-- TIPO ORDEN CELL -->' + tipoOrdBadge + '</td>' +`
    );

    // Replace in tr (with items)
    logica = logica.replace(
        /'<td class="text-center" style="vertical-align:middle;">' \+ \(isFirst \? tipoOrdBadge : ''\) \+ '<span class="badge bg-secondary fw-normal" style="font-size:0\.72rem;">' \+ _entEsc\(d\.id \|\| ''\) \+ '<\/span><\/td>' \+/,
        `'<td class="text-center" style="vertical-align:middle;"><span class="badge bg-secondary fw-normal" style="font-size:0.72rem;">' + _entEsc(d.id || '') + '</span></td>' +
                '<td class="text-center" style="vertical-align:middle;"> <!-- TIPO ORDEN CELL -->' + (isFirst ? tipoOrdBadge : '') + '</td>' +`
    );
}

// 3. Add PLACA field in the form in vista.html
// Check where OT Asociada is.
// It's likely `<div class="ent-field-label">OT ASOCIADA</div>`
if (!vista.includes('id="ent-f-placa"')) {
    vista = vista.replace(
        /<!-- OT Asociada -->\s*<div id="ent-f-doc-ref-box" style="grid-column:1\/2; display:none;">\s*<div class="ent-field-label">OT ASOCIADA <span style="color:#ef4444;">\*<\/span><\/div>\s*<div class="position-relative">\s*<input type="text" id="ent-f-doc-ref-txt" class="ent-input-sm w-100" placeholder="Buscar OT\.\.\." autocomplete="off" oninput="window\._entCbFiltrar\('ent-f-doc-ref'\)" onfocus="window\._entCbFiltrar\('ent-f-doc-ref'\)" onblur="window\._cbHide\('ent-f-doc-ref'\)">\s*<input type="hidden" id="ent-f-doc-ref">\s*<div id="ent-f-doc-ref-dd" class="cb-dropdown"><\/div>\s*<\/div>\s*<\/div>/,
        `<!-- OT Asociada / Placa -->
          <div id="ent-f-doc-ref-box" style="grid-column:1/-1; display:none;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div>
                <div class="ent-field-label">OT ASOCIADA <span style="color:#ef4444;">*</span></div>
                <div class="position-relative">
                  <input type="text" id="ent-f-doc-ref-txt" class="ent-input-sm w-100" placeholder="Buscar OT..." autocomplete="off" oninput="window._entCbFiltrar('ent-f-doc-ref')" onfocus="window._entCbFiltrar('ent-f-doc-ref')" onblur="window._cbHide('ent-f-doc-ref')">
                  <input type="hidden" id="ent-f-doc-ref">
                  <div id="ent-f-doc-ref-dd" class="cb-dropdown"></div>
                </div>
              </div>
              <div>
                <div class="ent-field-label">PLACA</div>
                <input type="text" id="ent-f-placa" class="ent-input-sm w-100" placeholder="Buscar placa..." disabled>
              </div>
            </div>
          </div>`
    );
}

// 4. Update the OT data source logic in logica.js to format as "OT-XXXXX — PLACA" and set the PLACA
if (!logica.includes('_entCbOTFormat')) {
    logica = logica.replace(
        /window\._entCbMap = \{\s*['"]ent-f-doc-ref['"]: function\(\) \{ return \[\]; \},/,
        `window._entCbMap = {
        'ent-f-doc-ref': function() { 
            return (window._entCacheOT || []).map(function(ot) {
                var p = ot.placa || ot.placa_vehiculo;
                var display = ot.id + (p ? ' — ' + p : '');
                return { id: ot.id, text: display, raw: ot };
            }); 
        },`
    );

    // We need to fetch OTs into _entCacheOT when opening modal or changing tipo_orden
    // Wait, the dropdown data fetching. Is there a fetch for OT already?
    // Let's hook into the dropdown selection callback for ent-f-doc-ref!
    logica = logica.replace(
        /window\._cbSelect = function\(id, val, text\) \{/,
        `window._cbSelect = function(id, val, text, raw) {`
    );

    logica = logica.replace(
        /if \(input\) \{ input\.value = val; \}/,
        `if (input) { input.value = val; }
        
        if (id === 'ent-f-doc-ref' && raw) {
            var p = raw.placa || raw.placa_vehiculo || '';
            var placaInput = document.getElementById('ent-f-placa');
            if (placaInput) {
                placaInput.value = p;
                // Try to find the dash and extract if raw not passed
            }
        }
        if (id === 'ent-f-doc-ref' && !raw && text) {
            var parts = text.split('—');
            var placaInput = document.getElementById('ent-f-placa');
            if (placaInput && parts.length > 1) {
                placaInput.value = parts[1].trim();
            } else if (placaInput) {
                placaInput.value = '';
            }
        }`
    );
}

fs.writeFileSync(pathVista, vista);
fs.writeFileSync(pathLogica, logica);
console.log('Patched vista and logica successfully');
