const fs = require('fs');

const pathVista = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/vista.html';
const pathLogica = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';

let vista = fs.readFileSync(pathVista, 'utf8');
let logica = fs.readFileSync(pathLogica, 'utf8');

// 1. Update vista.html OT container to have both OT and Placa side-by-side
const otContainerRegex = /<!-- OT Asociada -->\s*<div id="ent-ot-container" style="display:none;">\s*<div class="ent-field-label">OT Asociada.*?<\/div>\s*<\/div>/s;
if (otContainerRegex.test(vista)) {
    vista = vista.replace(otContainerRegex, `<!-- OT Asociada -->
          <div id="ent-ot-container" style="display:none; grid-column:1/-1;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                <div>
                    <div class="ent-field-label">OT Asociada <span style="color:#ef4444;">*</span></div>
                    <div class="position-relative">
                    <input type="text" id="ent-f-ot-txt" class="ent-input-sm w-100"
                            placeholder="Buscar OT..." autocomplete="off"
                            oninput="window._entCbFiltrar('ent-f-ot')"
                            onfocus="window._entCbFiltrar('ent-f-ot')"
                            onblur="window._cbHide('ent-f-ot')">
                    <input type="hidden" id="ent-f-ot">
                    <div id="ent-f-ot-dd" class="cb-dropdown"></div>
                    </div>
                </div>
                <div>
                    <div class="ent-field-label">Placa / Vehículo</div>
                    <input type="text" id="ent-f-ot-placa" class="ent-input-sm w-100" disabled placeholder="Se llenará al elegir OT...">
                </div>
            </div>
          </div>`);
}

// 2. Fix logica.js CB dropdown for OT
logica = logica.replace(
    /window\._entCbMap = \{\s*['"]ent-f-ot['"]: function\(\) \{ return \[\]; \},/,
    `window._entCbMap = {
        'ent-f-ot': function() { 
            return (window._entCacheOT || []).map(function(ot) {
                var p = ot.placa || ot.placa_vehiculo || ot.placa_vehiculo_referencial;
                var display = ot.id + (p ? ' — ' + p : '');
                return { id: ot.id, text: display, raw: ot };
            }); 
        },`
);

// Fix previously broken ent-f-doc-ref map (revert it or ignore it, but we need to ensure ent-f-ot works)
// The backend needs to supply _entCacheOT
if (!logica.includes('window._entCacheOT = [];')) {
    logica = logica.replace(
        /window\._entCacheProveedores = \[\];/,
        `window._entCacheProveedores = [];\nwindow._entCacheOT = [];`
    );
}

// Check where _entCacheOT is populated. We should fetch it on load.
if (!logica.includes('/api/taller/ot?limit=100')) {
    logica = logica.replace(
        /fetch\('\/api\/almacen\/proveedores'\)/,
        `fetch('/api/taller/ot?limit=100').then(r=>r.json()).then(res=>{ if(res.data) window._entCacheOT = res.data; }),\n        fetch('/api/almacen/proveedores')`
    );
}

// 3. Fix the callback to fill Placa when OT is selected
if (!logica.includes(`id === 'ent-f-ot' && text`)) {
    logica = logica.replace(
        /window\._cbSelect = function\(id, val, text, raw\) \{/,
        `window._cbSelect = function(id, val, text, raw) {` // Ensure it has raw
    );

    logica = logica.replace(
        /if \(input\) \{ input\.value = val; \}/,
        `if (input) { input.value = val; }
        
        if (id === 'ent-f-ot' && text) {
            var parts = text.split('—');
            var placaInput = document.getElementById('ent-f-ot-placa');
            if (placaInput && parts.length > 1) {
                placaInput.value = parts[1].trim();
            } else if (placaInput) {
                placaInput.value = '';
            }
        }`
    );
}

// 4. Update window._entCbArticulos to filter by tipo_orden
// The function window._entCbFiltrarArticulo handles article search? 
// Actually, it's a datalist? No, looking at the UI, it's a custom dropdown "Buscar artículo..."
// Let's check how the articles dropdown is generated in logica.js.

fs.writeFileSync(pathVista, vista);
fs.writeFileSync(pathLogica, logica);
console.log('Patched OT logic successfully');
