const fs = require('fs');
const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/entradas/logica.js';
let code = fs.readFileSync(path, 'utf8');

const regex = /card\.innerHTML =[\s\S]*?'<div id="ent-price-alert-' \+ idx \+ '" style="display:none;margin-top:6px;align-items:center;gap:\.4rem;"><\/div>';/;

const newLogic = `
      var tipoOrden = ((document.getElementById('ent-f-tipo-orden') || {}).value || '').toLowerCase();
      var isServicio = tipoOrden === 'orden de servicio';

      if (isServicio) {
          card.innerHTML =
              '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
                  '<div style="flex:1;position:relative;">' +
                      '<input type="text" id="' + cbId + '-txt" class="ent-input-sm ent-item-desc" data-idx="' + idx + '"' +
                          ' placeholder="Buscar servicio…" autocomplete="off"' +
                          ' oninput="window._entCbFiltrar(\\'' + cbId + '\\')"' +
                          ' onfocus="window._entCbFiltrar(\\'' + cbId + '\\')"' +
                          ' onblur="window._cbHide(\\'' + cbId + '\\')">' +
                      '<input type="hidden" id="' + cbId + '" class="ent-item-inv-id" data-idx="' + idx + '">' +
                      '<div id="' + cbId + '-dd" class="cb-dropdown"></div>' +
                  '</div>' +
                  '<button type="button" onclick="window._entQuitarItem(' + idx + ')"' +
                      ' style="width:32px;height:32px;border-radius:10px;border:none;background:#fee2e2;' +
                      'color:#ef4444;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.8rem;">' +
                      '<i class="bi bi-x-lg"></i>' +
                  '</button>' +
              '</div>' +
              '<div style="display:flex; gap:10px; align-items:center; background:#f8fafc; padding:10px; border-radius:8px;">' +
                  '<div style="flex:1"><div class="ent-field-label">Costo Total (S/)</div>' +
                      '<input type="number" class="ent-input-sm ent-item-imp" data-idx="' + idx + '"' +
                          ' value="0" step="0.01" oninput="window._entSyncServiceCost(' + idx + ', this.value)">' +
                  '</div>' +
              '</div>' +
              // Hidden fields to satisfy the backend
              '<input type="hidden" class="ent-item-cant" data-idx="' + idx + '" value="1">' +
              '<input type="hidden" class="ent-item-vu" data-idx="' + idx + '" value="0">' +
              '<input type="hidden" class="ent-item-pu" data-idx="' + idx + '" value="0">' +
              '<input type="hidden" class="ent-item-igv" data-idx="' + idx + '" value="0">' +
              '<div id="ent-price-alert-' + idx + '" style="display:none;"></div>';
      } else {
          card.innerHTML =
              '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
                  '<div style="flex:1;position:relative;">' +
                      '<input type="text" id="' + cbId + '-txt" class="ent-input-sm ent-item-desc" data-idx="' + idx + '"' +
                          ' placeholder="Buscar artículo…" autocomplete="off"' +
                          ' oninput="window._entCbFiltrar(\\'' + cbId + '\\')"' +
                          ' onfocus="window._entCbFiltrar(\\'' + cbId + '\\')"' +
                          ' onblur="window._cbHide(\\'' + cbId + '\\')">' +
                      '<input type="hidden" id="' + cbId + '" class="ent-item-inv-id" data-idx="' + idx + '">' +
                      '<div id="' + cbId + '-dd" class="cb-dropdown"></div>' +
                  '</div>' +
                  '<button type="button" onclick="window._entAbrirQR(' + idx + ')" title="Escanear QR"' +
                      ' style="width:32px;height:32px;border-radius:10px;border:1.5px solid #2563eb;background:#eff6ff;' +
                      'color:#2563eb;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.82rem;">' +
                      '<i class="bi bi-qr-code-scan"></i>' +
                  '</button>' +
                  '<button type="button" onclick="window._entQuitarItem(' + idx + ')"' +
                      ' style="width:32px;height:32px;border-radius:10px;border:none;background:#fee2e2;' +
                      'color:#ef4444;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.8rem;">' +
                      '<i class="bi bi-x-lg"></i>' +
                  '</button>' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:72px 1fr 1fr 80px 1fr;gap:5px;">' +
                  '<div><div class="ent-field-label">Cant.</div>' +
                      '<input type="number" class="ent-input-sm ent-item-cant" data-idx="' + idx + '"' +
                          ' value="1" min="0.001" step="0.001" oninput="window._entCalcImporte(' + idx + ',\\'cant\\')">' +
                  '</div>' +
                  '<div><div class="ent-field-label ent-lbl-vu" data-idx="' + idx + '">Valor Unit.</div>' +
                      '<input type="number" class="ent-input-sm ent-item-vu" data-idx="' + idx + '"' +
                          ' value="0" min="0" step="0.0001" oninput="window._entCalcImporte(' + idx + ',\\'vu\\')"' +
                          ' style="' + vuRo + '">' +
                  '</div>' +
                  '<div><div class="ent-field-label ent-lbl-pu" data-idx="' + idx + '">Precio Unit.</div>' +
                      '<input type="number" class="ent-input-sm ent-item-pu" data-idx="' + idx + '"' +
                          ' value="0" min="0" step="0.0001" oninput="window._entCalcImporte(' + idx + ',\\'pu\\')"' +
                          ' style="' + puRo + '">' +
                  '</div>' +
                  '<div><div class="ent-field-label">IGV</div>' +
                      '<input type="number" class="ent-input-sm ent-item-igv" data-idx="' + idx + '"' +
                          ' value="0" readonly style="background:#f1f5f9;color:#94a3b8;">' +
                  '</div>' +
                  '<div><div class="ent-field-label">Importe</div>' +
                      '<input type="number" class="ent-input-sm ent-item-imp" data-idx="' + idx + '"' +
                          ' value="0" step="0.01" oninput="window._entCalcImporte(' + idx + ',\\'imp\\')">' +
                  '</div>' +
              '</div>' +
              '<div id="ent-price-alert-' + idx + '" style="display:none;margin-top:6px;align-items:center;gap:.4rem;"></div>';
      }
`;

if (code.match(regex)) {
    code = code.replace(regex, newLogic);
    
    // Add window._entSyncServiceCost function if it doesn't exist
    if (!code.includes('window._entSyncServiceCost = function')) {
        code += `\nwindow._entSyncServiceCost = function(idx, val) {
    var v = parseFloat(val) || 0;
    var mode = window._entIgvMode || 'incluido';
    var pu = v, vu = v;
    if (mode === 'mas_igv') {
        pu = v * 1.18;
        vu = v;
    } else if (mode === 'sin_igv') {
        pu = v;
        vu = v;
    } else {
        pu = v;
        vu = v / 1.18;
    }
    var puEl = document.querySelector('.ent-item-pu[data-idx="'+idx+'"]');
    var vuEl = document.querySelector('.ent-item-vu[data-idx="'+idx+'"]');
    var igvEl = document.querySelector('.ent-item-igv[data-idx="'+idx+'"]');
    if (puEl) puEl.value = pu.toFixed(4);
    if (vuEl) vuEl.value = vu.toFixed(4);
    if (igvEl) igvEl.value = (pu - vu).toFixed(2);
    window._entCalcTotales();
};\n`;
    }
    
    // Update window._entInitCbItem to filter by service type
    const cbRegex = /window\._entInitCbItem = function\(idx, cbId\) \{[\s\S]*?var items = \(window\._entInvData \|\| \[\]\)\.map\(function\(d\) \{/;
    if (code.match(cbRegex)) {
        code = code.replace(cbRegex, `window._entInitCbItem = function(idx, cbId) {
    var isServicio = ((document.getElementById('ent-f-tipo-orden') || {}).value || '').toLowerCase() === 'orden de servicio';
    var dataFiltered = (window._entInvData || []).filter(function(d) {
        return isServicio ? (d.tipo === 'Servicio') : (d.tipo !== 'Servicio');
    });
    var items = dataFiltered.map(function(d) {`);
    }

    fs.writeFileSync(path, code);
    console.log('Inject OK');
} else {
    console.log('Regex failed');
}
