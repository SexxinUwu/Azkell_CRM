const fs = require('fs');
let html = fs.readFileSync('modulos/mantenimiento/fleetrun/vista.html', 'utf8');

html = html.replace(
  /<label class="form-label fw-bold"[^>]*>.*?Placa \*<\/label>\s*<div id="frPlacaW-f" style="position:relative;">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g,
  `<label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Placa *</label>
<div class="position-relative">
  <input type="text" id="f_placa-txt" class="form-control form-control-sm text-uppercase" placeholder="Buscar placa…" autocomplete="off" style="border-radius:12px;min-height:44px;" oninput="this.value=this.value.toUpperCase();window._cbFiltrar('f_placa')" onfocus="window._cbFiltrar('f_placa')" onblur="window._cbHide('f_placa')">
  <input type="hidden" id="f_placa" name="f_placa" onchange="window.autocompletarFleetrun('f')">
  <div id="f_placa-dd" class="cb-dropdown"></div>
</div>
</div>
</div>`
);

html = html.replace(
  /<label class="form-label fw-bold"[^>]*>.*?Tipo de Mantt<\/label>\s*<div id="frTipoW-f" style="position:relative;">[\s\S]*?<\/div>\s*<\/div>/g,
  `<label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Tipo de Mantt</label>
<div class="position-relative">
  <input type="text" id="f_tipomp-txt" class=\"form-control form-control-sm text-uppercase\" placeholder=\"Buscar tipo…\" autocomplete=\"off\" style=\"border-radius:12px;min-height:44px;\" oninput=\"window._cbFiltrar('f_tipomp')\" onfocus=\"window._cbFiltrar('f_tipomp')\" onblur=\"window._cbHide('f_tipomp')\">
  <input type=\"hidden\" id=\"f_tipomp\" name=\"f_tipomp\">
  <div id=\"f_tipomp-dd\" class=\"cb-dropdown\"></div>
</div>
</div>`
);

html = html.replace(
  /<label class="form-label fw-bold"[^>]*>.*?Técnico Encargado<\/label>\s*<input type="text" class="form-control form-control-sm text-uppercase" id="f_tec" name="f_tec"[^>]*>/g,
  `<label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Técnico Encargado</label>
<div class="position-relative">
  <input type="text" id="f_tec-txt" class="form-control form-control-sm text-uppercase" placeholder="Buscar técnico…" autocomplete="off" style="border-radius:12px;min-height:44px;" oninput="this.value=this.value.toUpperCase();window._cbFiltrar('f_tec')" onfocus="window._cbFiltrar('f_tec')" onblur="window._cbHide('f_tec')">
  <input type="hidden" id="f_tec" name="f_tec">
  <div id="f_tec-dd" class="cb-dropdown"></div>
</div>`
);

html = html.replace(
  /<label class="form-label fw-bold"[^>]*>.*?Placa \*<\/label>\s*<div id="frPlacaW-eF" style="position:relative;">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g,
  `<label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Placa *</label>
<div class="position-relative">
  <input type="text" id="eF_placa-txt" class="form-control form-control-sm text-uppercase" placeholder="Buscar placa…" autocomplete="off" style="border-radius:12px;min-height:44px;" oninput="this.value=this.value.toUpperCase();window._cbFiltrar('eF_placa')" onfocus="window._cbFiltrar('eF_placa')" onblur="window._cbHide('eF_placa')">
  <input type="hidden" id="eF_placa" name="editF_placa" onchange="window.autocompletarFleetrun('eF')">
  <div id="eF_placa-dd" class="cb-dropdown"></div>
</div>
</div>
</div>`
);

html = html.replace(
  /<label class="form-label fw-bold"[^>]*>.*?Tipo de Mantt<\/label>\s*<div id="frTipoW-eF" style="position:relative;">[\s\S]*?<\/div>\s*<\/div>/g,
  `<label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Tipo de Mantt</label>
<div class="position-relative">
  <input type="text" id="eF_tipomp-txt" class="form-control form-control-sm text-uppercase" placeholder="Buscar tipo…" autocomplete="off" style="border-radius:12px;min-height:44px;" oninput="window._cbFiltrar('eF_tipomp')" onfocus="window._cbFiltrar('eF_tipomp')" onblur="window._cbHide('eF_tipomp')">
  <input type="hidden" id="eF_tipomp" name="editF_tipomp">
  <div id="eF_tipomp-dd" class="cb-dropdown"></div>
</div>
</div>`
);

html = html.replace(
  /<label class="form-label fw-bold"[^>]*>.*?Técnico Encargado<\/label>\s*<input type="text" class="form-control form-control-sm text-uppercase" id="eF_tec" name="editF_tec"[^>]*>/g,
  `<label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Técnico Encargado</label>
<div class="position-relative">
  <input type="text" id="eF_tec-txt" class="form-control form-control-sm text-uppercase" placeholder="Buscar técnico…" autocomplete="off" style="border-radius:12px;min-height:44px;" oninput="this.value=this.value.toUpperCase();window._cbFiltrar('eF_tec')" onfocus="window._cbFiltrar('eF_tec')" onblur="window._cbHide('eF_tec')">
  <input type="hidden" id="eF_tec" name="editF_tec">
  <div id="eF_tec-dd" class="cb-dropdown"></div>
</div>`
);

fs.writeFileSync('modulos/mantenimiento/fleetrun/vista.html', html);

let logica = fs.readFileSync('modulos/mantenimiento/fleetrun/logica.js', 'utf8');

if (!logica.includes('fetch(\'/api/conductores-lista\')')) {
    const fetchConduc = `fetch('/api/conductores-lista')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            window.dataGlobalConductores = (d || []).map(function(c) { return c.nombre || ''; }).filter(Boolean);
        }).catch(function() {});
`;
    logica = logica.replace("fetch('/api/tipos-preventivo')", fetchConduc + "    fetch('/api/tipos-preventivo')");
}

if (!logica.includes("_cbInit('f_placa'")) {
    const initCode = `
    if (window.dataGlobalPlacas) window._cbInit('f_placa', window.dataGlobalPlacas.map(function(p){ return {value:p[0], label:p[0]}; }), 'Buscar placa...');
    if (window._frTipoLista) window._cbInit('f_tipomp', window._frTipoLista.map(function(t){ return {value:t, label:t}; }), 'Buscar tipo...');
    if (window.dataGlobalConductores) window._cbInit('f_tec', window.dataGlobalConductores.map(function(c){ return {value:c, label:c}; }), 'Buscar técnico...');
`;
    logica = logica.replace("frPlacaInit('f', '');", initCode);
    logica = logica.replace("frTipoInit('f', '');", "");
}

if (!logica.includes("_cbInit('eF_placa'")) {
    const editCode = `
    if (window.dataGlobalPlacas) window._cbInit('eF_placa', window.dataGlobalPlacas.map(function(p){ return {value:p[0], label:p[0]}; }), 'Buscar placa...');
    if (window._frTipoLista) window._cbInit('eF_tipomp', window._frTipoLista.map(function(t){ return {value:t, label:t}; }), 'Buscar tipo...');
    if (window.dataGlobalConductores) window._cbInit('eF_tec', window.dataGlobalConductores.map(function(c){ return {value:c, label:c}; }), 'Buscar técnico...');
    
    if (fila[4]) window._cbSet('eF_placa', fila[4], fila[4]);
    if (fila[8]) window._cbSet('eF_tipomp', fila[8], fila[8]);
    if (fila[24]) window._cbSet('eF_tec', fila[24], fila[24]);
`;
    logica = logica.replace("document.getElementById('eF_tec').value = fila[24] || '';", "// eF_tec removed\n" + editCode);
    logica = logica.replace("frPlacaInit('eF', fila[4] || '');", "// frPlacaInit removed");
    logica = logica.replace("frTipoInit('eF', fila[8] || '');", "// frTipoInit removed");
}

fs.writeFileSync('modulos/mantenimiento/fleetrun/logica.js', logica);
console.log('Done.');
