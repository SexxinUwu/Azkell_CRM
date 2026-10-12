const fs = require('fs');

const pathVista = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/vista.html';
const pathLogica = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';

let vista = fs.readFileSync(pathVista, 'utf8');

const startIdx = vista.indexOf('<!-- OT Asociada -->');
const endIdx = vista.indexOf('<!-- Motivo -->');

if (startIdx !== -1 && endIdx !== -1) {
    const newOT = `<!-- OT Asociada -->
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
          </div>

          `;
    vista = vista.substring(0, startIdx) + newOT + vista.substring(endIdx);
    fs.writeFileSync(pathVista, vista);
    console.log('Fixed vista.html OT container');
}

let logica = fs.readFileSync(pathLogica, 'utf8');

// The dropdown initialization in window._entInitCbItem already filters `dataFiltered` correctly by `d.tipo === 'Servicio'`.
// BUT `window._cbInit` creates the HTML.
// Why did the user say "en el buscador salen los arituclos deberian salir solo los servicios"?
// Because _entInitCbItem is CALLED when the row is created!
// But wait! If the user CHANGES the `tipo_orden` dropdown AFTER creating rows, the rows don't automatically update their dropdowns!
// AND the user says they changed to "Orden de Servicio". The existing row's dropdown was already initialized with "Orden de compra" filter (which shows INV).
// Let's hook into window._entToggleTipoOrden to RE-INITIALIZE all existing item dropdowns!
logica = logica.replace(
    /window\._entToggleTipoOrden = function\(\) \{.*?\};/,
    `window._entToggleTipoOrden = function() { 
        var tipo = document.getElementById('ent-f-tipo-orden').value; 
        var elPlaca = document.getElementById('ent-placa-container'); 
        var elOt = document.getElementById('ent-ot-container'); 
        if (!elPlaca || !elOt) return; 
        if (tipo.toLowerCase() === 'orden de servicio') { 
            elPlaca.style.display = 'none'; 
            elOt.style.display = 'block'; 
        } else { 
            elPlaca.style.display = 'block'; 
            elOt.style.display = 'none'; 
        }
        
        // Re-initialize all item dropdowns so they show the correct items (INV vs SERV)
        var tbody = document.getElementById('ent-items-tbody');
        if (tbody) {
            var rows = tbody.querySelectorAll('div.ent-item-row');
            for (var i = 0; i < rows.length; i++) {
                var idxStr = rows[i].getAttribute('data-idx');
                if (idxStr) {
                    var idx = parseInt(idxStr, 10);
                    if (!isNaN(idx)) {
                        window._entInitCbItem(idx, 'ent-add-inv-' + idx);
                    }
                }
            }
        }
    };`
);

// We also need to fix `_entCbMap` because my previous regex `window\._entCbMap = \{\s*['"]ent-f-ot['"]: function\(\) \{ return \[\]; \},` failed.
// Let's find _cbMap or where `ent-f-ot` is defined.
// Wait, I saw earlier that `window._entCbMap` didn't exist! So `_entCbFiltrar` must use something else, maybe `window._cbMap` or it's hardcoded.
// Let's dump the `_entCbFiltrar` function to see how it works!
