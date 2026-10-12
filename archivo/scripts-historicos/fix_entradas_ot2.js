const fs = require('fs');

const pathLogica = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let logica = fs.readFileSync(pathLogica, 'utf8');

// Replace the previous OT fetch line with a more comprehensive initialization
const fetchOTRegex = /fetch\('\/api\/taller\/ot\?limit=100'\)\.then\(r=>r\.json\(\)\)\.then\(res=>\{\s*if\(res\.data\) window\._entCacheOT = res\.data;\s*\}\),\s*/;

if (fetchOTRegex.test(logica)) {
    logica = logica.replace(fetchOTRegex, `fetch('/api/taller/ot?limit=100').then(r=>r.json()).then(res => {
        if(res.data) {
            window._entCacheOT = res.data;
            var otItems = window._entCacheOT.map(function(ot) {
                var p = ot.placa || ot.placa_vehiculo || ot.placa_vehiculo_referencial || '';
                return { value: ot.id, label: ot.id + (p ? ' — ' + p : '') };
            });
            window._cbInit('ent-f-ot', otItems, 'Buscar OT...');
            
            window._cbOnSelect('ent-f-ot', function(val) {
                // Find label to extract placa
                var item = otItems.find(function(x) { return x.value === val; });
                var placaInput = document.getElementById('ent-f-ot-placa');
                if (placaInput && item && item.label) {
                    var parts = item.label.split('—');
                    if (parts.length > 1) {
                        placaInput.value = parts[1].trim();
                    } else {
                        placaInput.value = '';
                    }
                } else if (placaInput) {
                    placaInput.value = '';
                }
            });
        }
    });\n        `);
    
    fs.writeFileSync(pathLogica, logica);
    console.log('Fixed OT fetch and initialization');
} else {
    console.log('Could not find OT fetch regex');
}

// Ensure the `oninput`, `onfocus` in vista.html use `_cbFiltrar` instead of `_entCbFiltrar` if they do.
const pathVista = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/vista.html';
let vista = fs.readFileSync(pathVista, 'utf8');

if (vista.includes("window._entCbFiltrar('ent-f-ot')")) {
    vista = vista.replace(/window\._entCbFiltrar\('ent-f-ot'\)/g, "window._cbFiltrar('ent-f-ot')");
    fs.writeFileSync(pathVista, vista);
    console.log('Fixed _entCbFiltrar to _cbFiltrar in vista.html');
}

// Make sure the dropdown lists articles only if type is "Orden de compra"
// In `entradas/logica.js`, `_entToggleTipoOrden` already calls `window._entInitCbItem` for existing rows.
// And `window._entInitCbItem` correctly filters!
// But wait! Is there another place where we get the OT value?
// In `guardarEntrada`, we need to get the selected OT and Placa.
// The id of the dropdown hidden input is `ent-f-ot`, so its value is `document.getElementById('ent-f-ot').value`.
// And the Placa is in `ent-f-ot-placa`.
// Wait, currently `guardarEntrada` does:
// var placa  = window._cbGet('ent-f-placa') || '';
// We should check if `tipo_orden` is "Orden de Servicio", if so, `placa` should be taken from `ent-f-ot-placa`, AND `motivo` or `id_referencia`?
// The backend `POST /entradas` takes: `tipo_orden`, `motivo_entrada`, `placa`, `orden_trabajo_id`? What's the field name for OT?
// Let's check `guardarEntrada` payload!
