const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'logica.js');
let js = fs.readFileSync(jsPath, 'utf8');

// Replace _kitsBsModal with _kitsAbrirPanel
js = js.replace(/function _kitsBsModal[\s\S]*?\}\n/, `
window._kitsAbrirPanel = function() {
    document.getElementById('kits-backdrop').style.display = 'block';
    setTimeout(function() {
        document.getElementById('kits-panel-detalle').classList.add('open');
    }, 10);
};
window._kitsCerrarModal = function() {
    document.getElementById('kits-panel-detalle').classList.remove('open');
    setTimeout(function() {
        document.getElementById('kits-backdrop').style.display = 'none';
    }, 280);
};
`);

js = js.replace(/_kitsBsModal\(document\.getElementById\('kitsModal'\)\)\.show\(\);/g, 'window._kitsAbrirPanel();');

js = js.replace(/_kitsBsModal\(document\.getElementById\('kitsModal'\)\)\.hide\(\);/g, 'window._kitsCerrarModal();');

js = js.replace(/var btn = document\.querySelector\('#kitsModal \.btn-primary'\);/g, "var btn = document.getElementById('kits-btn-guardar');");

// Update kitsAgregarFila HTML to match Entradas style cards
const addRowStart = js.indexOf('window.kitsAgregarFila = function(data)');
const addRowEnd = js.indexOf('var opciones = _kitsGenerarOpcionesItems();', addRowStart);
if (addRowStart > -1 && addRowEnd > -1) {
    const oldFunc = js.substring(addRowStart, addRowEnd);
    const newFunc = `window.kitsAgregarFila = function(data) {
    data = data || {};
    var rid = 'kr_' + (++window.kitsRowCounter);
    
    var tr = document.createElement('div');
    tr.id = rid;
    tr.className = 'kits-item-card kit-card';
    if (data.id) tr.dataset.id = data.id;
    
    var cbId = 'cb_' + rid;
    var html = '';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">';
    html += '<div style="flex:1;position:relative;">';
    html += '<input type="text" id="'+cbId+'-txt" class="kits-input-sm kit-item-input" placeholder="Buscar artículo..." autocomplete="off" oninput="window._cbFiltrar(\\''+cbId+'\\')" onfocus="window._cbFiltrar(\\''+cbId+'\\')" onblur="window._kitsHideCombo(\\''+cbId+'\\')">';
    html += '<input type="hidden" id="'+cbId+'" class="kit-desc">';
    html += '<div id="'+cbId+'-dd" class="cb-dropdown"></div>';
    html += '</div>';
    html += '<button type="button" onclick="window.kitsEliminarFila(this)" style="width:38px;height:38px;border-radius:12px;background:#fef2f2;border:1.5px solid #fecaca;color:#ef4444;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;"><i class="bi bi-x-lg"></i></button>';
    html += '</div>';
    
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">';
    html += '<div><div class="kits-field-label">CANT.</div><input type="number" class="kits-input-sm kit-cant" value="'+(data.cantidad||1)+'" step="0.01" oninput="window.kitsRecalcularFormulario()"></div>';
    html += '<div><div class="kits-field-label">UNID.</div><input type="text" class="kits-input-sm kit-unid" value="'+(data.unidad_medida||'')+'" readonly style="background:rgba(0,0,0,.03); color:var(--subtext)"></div>';
    html += '<div><div class="kits-field-label">C. UNIT.</div><input type="number" class="kits-input-sm kit-costo" value="'+(data.costo_unitario||0)+'" step="0.01" oninput="window.kitsRecalcularFormulario()"></div>';
    html += '<div><div class="kits-field-label">IMPORTE</div><input type="number" class="kits-input-sm kit-total" value="'+(data.costo_total||0)+'" step="0.01" readonly style="background:rgba(0,0,0,.03); font-weight:bold; color:var(--text)"></div>';
    html += '</div>';
    
    tr.innerHTML = html;
    var tb = document.getElementById('kits-form-container');
    if (tb) tb.appendChild(tr);
    
    `;
    js = js.replace(oldFunc, newFunc);
}

fs.writeFileSync(jsPath, js, 'utf8');
console.log('JS updated');
