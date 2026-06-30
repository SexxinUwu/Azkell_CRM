const fs = require('fs');
let html = fs.readFileSync('modulos/mantenimiento/fleetrun/vista.html', 'utf8');

function replaceBlock(startStr, endStr, replacement) {
    let startIdx = html.indexOf(startStr);
    if (startIdx === -1) {
        console.log('Not found: ' + startStr.substring(0, 50));
        return;
    }
    let endIdx = html.indexOf(endStr, startIdx);
    if (endIdx === -1) {
        console.log('End not found: ' + endStr);
        return;
    }
    endIdx += endStr.length;
    html = html.substring(0, startIdx) + replacement + html.substring(endIdx);
}

// 1. f_placa
replaceBlock(
    '<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Placa *</label><div id="frPlacaW-f"', 
    '</div></div></div></div>', 
    `<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Placa *</label>
<div class="position-relative">
  <input type="text" id="f_placa-txt" class="form-control form-control-sm text-uppercase" placeholder="Buscar placa…" autocomplete="off" style="border-radius:12px;min-height:44px;" oninput="this.value=this.value.toUpperCase();window._cbFiltrar('f_placa')" onfocus="window._cbFiltrar('f_placa')" onblur="window._cbHide('f_placa')">
  <input type="hidden" id="f_placa" name="f_placa" onchange="window.autocompletarFleetrun('f')">
  <div id="f_placa-dd" class="cb-dropdown"></div>
</div>
</div>`
);

// 2. f_tipomp
replaceBlock(
    '<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Tipo de Mantt</label><div id="frTipoW-f"', 
    '</div></div></div></div>', 
    `<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Tipo de Mantt</label>
<div class="position-relative">
  <input type="text" id="f_tipomp-txt" class="form-control form-control-sm text-uppercase" placeholder="Buscar tipo…" autocomplete="off" style="border-radius:12px;min-height:44px;" oninput="window._cbFiltrar('f_tipomp')" onfocus="window._cbFiltrar('f_tipomp')" onblur="window._cbHide('f_tipomp')">
  <input type="hidden" id="f_tipomp" name="f_tipomp">
  <div id="f_tipomp-dd" class="cb-dropdown"></div>
</div>
</div>`
);

// 3. f_tec
replaceBlock(
    '<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Técnico</label><input type="text" class="form-control form-control-sm text-uppercase" style="border-radius:12px;min-height:44px;" name="f_tec" id="f_tec" required></div>', 
    'required></div>', 
    `<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Técnico Encargado</label>
<div class="position-relative">
  <input type="text" id="f_tec-txt" class="form-control form-control-sm text-uppercase" placeholder="Buscar técnico…" autocomplete="off" style="border-radius:12px;min-height:44px;" oninput="this.value=this.value.toUpperCase();window._cbFiltrar('f_tec')" onfocus="window._cbFiltrar('f_tec')" onblur="window._cbHide('f_tec')">
  <input type="hidden" id="f_tec" name="f_tec">
  <div id="f_tec-dd" class="cb-dropdown"></div>
</div>
</div>`
);


// 4. eF_placa
replaceBlock(
    '<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Placa *</label><div id="frPlacaW-eF"', 
    '</div></div></div></div>', 
    `<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Placa *</label>
<div class="position-relative">
  <input type="text" id="eF_placa-txt" class="form-control form-control-sm text-uppercase" placeholder="Buscar placa…" autocomplete="off" style="border-radius:12px;min-height:44px;" oninput="this.value=this.value.toUpperCase();window._cbFiltrar('eF_placa')" onfocus="window._cbFiltrar('eF_placa')" onblur="window._cbHide('eF_placa')">
  <input type="hidden" id="eF_placa" name="editF_placa" onchange="window.autocompletarFleetrun('eF')">
  <div id="eF_placa-dd" class="cb-dropdown"></div>
</div>
</div>`
);

// 5. eF_tipomp
replaceBlock(
    '<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Tipo de Mantt</label><div id="frTipoW-eF"', 
    '</div></div></div></div>', 
    `<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Tipo de Mantt</label>
<div class="position-relative">
  <input type="text" id="eF_tipomp-txt" class="form-control form-control-sm text-uppercase" placeholder="Buscar tipo…" autocomplete="off" style="border-radius:12px;min-height:44px;" oninput="window._cbFiltrar('eF_tipomp')" onfocus="window._cbFiltrar('eF_tipomp')" onblur="window._cbHide('eF_tipomp')">
  <input type="hidden" id="eF_tipomp" name="editF_tipomp">
  <div id="eF_tipomp-dd" class="cb-dropdown"></div>
</div>
</div>`
);

// 6. eF_tec
replaceBlock(
    '<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Técnico</label><input type="text" class="form-control form-control-sm text-uppercase" style="border-radius:12px;min-height:44px;" name="editF_tec" id="eF_tec" required></div>', 
    'required></div>', 
    `<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Técnico Encargado</label>
<div class="position-relative">
  <input type="text" id="eF_tec-txt" class="form-control form-control-sm text-uppercase" placeholder="Buscar técnico…" autocomplete="off" style="border-radius:12px;min-height:44px;" oninput="this.value=this.value.toUpperCase();window._cbFiltrar('eF_tec')" onfocus="window._cbFiltrar('eF_tec')" onblur="window._cbHide('eF_tec')">
  <input type="hidden" id="eF_tec" name="editF_tec">
  <div id="eF_tec-dd" class="cb-dropdown"></div>
</div>
</div>`
);

fs.writeFileSync('modulos/mantenimiento/fleetrun/vista.html', html);
console.log('Successfully completed.');
