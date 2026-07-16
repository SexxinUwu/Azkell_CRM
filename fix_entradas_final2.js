const fs = require('fs');

const pathLogica = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let logica = fs.readFileSync(pathLogica, 'utf8');

// 1. Fix OT endpoint and mapper
const oldFetchOT = /fetch\('\/api\/taller\/ot\?limit=100'\)\.then\(r=>r\.json\(\)\)\.then\(res => \{[\s\S]*?\}\);\s*/;
const newFetchOT = `fetch('/api/ordenes-trabajo').then(r=>r.json()).then(d => {
        window._entCacheOT = d || [];
        var otItems = (d || []).map(function(o) {
            var idOt = (o.id_ot || '').toUpperCase();
            var placa = (o.placa || '').toUpperCase();
            if (!idOt) return null;
            return { value: idOt, label: placa ? idOt + ' — ' + placa : idOt };
        }).filter(Boolean);
        window._cbInit('ent-f-ot', otItems, 'Buscar OT...');
        
        window._cbOnSelect('ent-f-ot', function(val) {
            var ot = window._entCacheOT.find(function(x) { return (x.id_ot||'').toUpperCase() === val; });
            var placaInput = document.getElementById('ent-f-ot-placa');
            if (placaInput && ot && ot.placa) {
                placaInput.value = ot.placa;
            } else if (placaInput) {
                placaInput.value = '';
            }
        });
    }).catch(function(){});\n        `;

if (oldFetchOT.test(logica)) {
    logica = logica.replace(oldFetchOT, newFetchOT);
    console.log('Fixed OT fetch endpoint');
} else {
    console.log('Could not find OT fetch to replace');
}

// 2. Fix filter logic in _entInitCbItem
const oldFilter = /return isServicio \? \(d\.tipo === 'Servicio'\) : \(d\.tipo !== 'Servicio'\);/;
const newFilter = `var isServId = d.id.toUpperCase().startsWith('SERV-');
          var isFamServ = d.familia === 'Servicio' || d.familia === 'Servicios';
          var isTipoServ = d.tipo === 'Servicio';
          var isService = isServId || isFamServ || isTipoServ;
          return isServicio ? isService : !isService;`;

if (oldFilter.test(logica)) {
    logica = logica.replace(oldFilter, newFilter);
    console.log('Fixed _entInitCbItem filter logic');
} else {
    console.log('Could not find _entInitCbItem filter to replace');
}

// 3. Update _entToggleTipoOrden to re-init items dropdowns
const toggleFnRegex = /(window\._entToggleTipoOrden = function\(\) \{[\s\S]*?if \(tipo\.toLowerCase\(\) === 'orden de servicio'\) \{[^\}]*\} else \{[^\}]*\} )\};/;

if (toggleFnRegex.test(logica)) {
    const loopCode = `
          var itemsDesc = document.querySelectorAll('.ent-item-desc');
          for (var i = 0; i < itemsDesc.length; i++) {
              var idx = itemsDesc[i].getAttribute('data-idx');
              var cbId = 'ent-art-' + idx;
              if (typeof window._entInitCbItem === 'function') {
                  window._entInitCbItem(idx, cbId);
                  window._cbReset(cbId);
                  window._entCalcImporte(idx, 'pu'); // Reset calculations if needed
              }
          }
    `;
    logica = logica.replace(toggleFnRegex, `$1 ${loopCode} };`);
    console.log('Fixed _entToggleTipoOrden loop');
} else {
    console.log('Could not find _entToggleTipoOrden to patch');
}

fs.writeFileSync(pathLogica, logica);
console.log('Saved logica.js');

// 4. Transform `ent-f-ot-placa` to a cb-dropdown in vista.html so it matches Salidas perfectly
const pathVista = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/vista.html';
let vista = fs.readFileSync(pathVista, 'utf8');

const oldPlacaInput = /<input type="text" id="ent-f-ot-placa" class="ent-input-sm w-100" placeholder="Placa o veh\u00EDculo...">/;
const newPlacaInput = `<div class="position-relative">
                        <input type="text" id="ent-f-ot-placa-txt" class="ent-input-sm w-100" placeholder="Placa o vehículo..." autocomplete="off" oninput="window._entCbFiltrar('ent-f-ot-placa')" onfocus="window._entCbFiltrar('ent-f-ot-placa')" onblur="window._cbHide('ent-f-ot-placa')">
                        <input type="hidden" id="ent-f-ot-placa">
                        <div id="ent-f-ot-placa-dd" class="cb-dropdown"></div>
                    </div>`;

if (oldPlacaInput.test(vista)) {
    vista = vista.replace(oldPlacaInput, newPlacaInput);
    fs.writeFileSync(pathVista, vista);
    console.log('Fixed vista.html: transformed ent-f-ot-placa into a cb-dropdown');
    
    // Also inject the fetch('/api/placas-lista') into logica.js
    const newPlacaFetch = `
    fetch('/api/placas-lista').then(function(r){return r.json();}).then(function(d){
        var items = (d||[]).map(function(p){
            var placa = (p.placa||'').toUpperCase();
            return {value:placa, label:placa};
        }).filter(function(x){return x.value;}).sort(function(a,b){return a.label.localeCompare(b.label);});
        window._cbInit('ent-f-ot-placa', items, 'Buscar placa...');
    }).catch(function(){});\n`;
    logica = fs.readFileSync(pathLogica, 'utf8');
    logica = logica.replace(/window\._cbInit\('ent-f-ot', otItems, 'Buscar OT\.\.\.'\);/, `window._cbInit('ent-f-ot', otItems, 'Buscar OT...');${newPlacaFetch}`);
    fs.writeFileSync(pathLogica, logica);
} else {
    console.log('Could not find ent-f-ot-placa in vista.html');
}
