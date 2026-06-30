const fs = require('fs');

let html = fs.readFileSync('modulos/mantenimiento/fleetrun/vista.html', 'utf8');

// 1. Title change
html = html.replace('Registrar Mantenimiento Fleetrun', 'Registrar Mantenimiento Preventivo');
html = html.replace('Editar Fleetrun', 'Editar Mantenimiento Preventivo');
html = html.replace('data-i18n="fleet.modal.new">Registrar Mantenimiento Fleetrun', 'data-i18n="fleet.modal.new">Registrar Mantenimiento Preventivo');

// 2. Add Combustible and Modelo to "nuevo" modal
const addF = `</div>
<div class="row">
  <div class="col-6 mb-3">
    <label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Combustible</label>
    <select class="form-select form-select-sm shadow-sm" style="border-radius:12px;min-height:44px;" name="f_combustible" id="f_combustible">
      <option value="">Seleccionar...</option>
      <option value="DIESEL">DIESEL</option>
      <option value="GNV">GNV</option>
      <option value="GASOLINA">GASOLINA</option>
    </select>
  </div>
  <div class="col-6 mb-3">
    <label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Modelo</label>
    <input type="text" class="form-control form-control-sm text-uppercase shadow-sm" style="border-radius:12px;min-height:44px;" name="f_modelo" id="f_modelo" placeholder="Ej: FH 460">
  </div>
</div>
<div class="row">`;
html = html.replace('</div><div class="row"><div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">KM Wialon', addF + '<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">KM Wialon');

// 3. Add Combustible and Modelo to "editar" modal
const addE = `</div>
<div class="row">
  <div class="col-6 mb-3">
    <label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Combustible</label>
    <select class="form-select form-select-sm shadow-sm" style="border-radius:12px;min-height:44px;" name="editF_combustible" id="eF_combustible">
      <option value="">Seleccionar...</option>
      <option value="DIESEL">DIESEL</option>
      <option value="GNV">GNV</option>
      <option value="GASOLINA">GASOLINA</option>
    </select>
  </div>
  <div class="col-6 mb-3">
    <label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Modelo</label>
    <input type="text" class="form-control form-control-sm text-uppercase shadow-sm" style="border-radius:12px;min-height:44px;" name="editF_modelo" id="eF_modelo" placeholder="Ej: FH 460">
  </div>
</div>
<div class="row">`;
html = html.replace('</div><div class="row"><div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">KM Wialon</label><input type="number" class="form-control form-control-sm text-primary fw-bold" style="border-radius:12px;min-height:44px;" name="editF_kmgps" id="eF_kmgps"></div>', addE + '<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">KM Wialon</label><input type="number" class="form-control form-control-sm text-primary fw-bold" style="border-radius:12px;min-height:44px;" name="editF_kmgps" id="eF_kmgps"></div>');

// 4. Dropdowns for Tecnico
const regexF = /<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:\.62rem;color:var\(--subtext\);text-transform:uppercase;letter-spacing:\.08em;">Técnico Encargado<\/label><input type="text" class="form-control form-control-sm text-uppercase border-primary shadow-sm" style="border-radius:12px;min-height:44px;" name="f_tec" placeholder="Ej: Juan Perez" required><\/div>/g;
const replF = `<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Técnico Encargado</label>
<div class="position-relative">
  <input type="text" id="f_tec-txt" class="form-control form-control-sm text-uppercase border-primary shadow-sm" placeholder="Ej: Juan Perez" autocomplete="off" style="border-radius:12px;min-height:44px;" oninput="this.value=this.value.toUpperCase();window._cbFiltrar('f_tec')" onfocus="window._cbFiltrar('f_tec')" onblur="window._cbHide('f_tec')">
  <input type="hidden" id="f_tec" name="f_tec">
  <div id="f_tec-dd" class="cb-dropdown"></div>
</div>
</div>`;
html = html.replace(regexF, replF);

const regexE = /<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:\.62rem;color:var\(--subtext\);text-transform:uppercase;letter-spacing:\.08em;">Técnico Encargado<\/label><input type="text" class="form-control form-control-sm text-uppercase border-primary shadow-sm" style="border-radius:12px;min-height:44px;" name="editF_tec" id="eF_tec" placeholder="Ej: Juan Perez" required><\/div>/g;
const replE = `<div class="col-6 mb-3"><label class="form-label fw-bold" style="font-size:.62rem;color:var(--subtext);text-transform:uppercase;letter-spacing:.08em;">Técnico Encargado</label>
<div class="position-relative">
  <input type="text" id="eF_tec-txt" class="form-control form-control-sm text-uppercase border-primary shadow-sm" placeholder="Ej: Juan Perez" autocomplete="off" style="border-radius:12px;min-height:44px;" oninput="this.value=this.value.toUpperCase();window._cbFiltrar('eF_tec')" onfocus="window._cbFiltrar('eF_tec')" onblur="window._cbHide('eF_tec')">
  <input type="hidden" id="eF_tec" name="editF_tec">
  <div id="eF_tec-dd" class="cb-dropdown"></div>
</div>
</div>`;
html = html.replace(regexE, replE);

fs.writeFileSync('modulos/mantenimiento/fleetrun/vista.html', html);
console.log('Done patching vista.html');
