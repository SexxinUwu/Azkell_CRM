const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'vista.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Replace everything from <!-- ======= MODAL KIT MP ======= --> to the end of the file
const modalStart = html.indexOf('<!-- ======= MODAL KIT MP ======= -->');
if (modalStart > -1) {
    html = html.substring(0, modalStart);
}

const newModal = `
<!-- ======= PANEL MODAL KITS (Entradas Style) ======= -->
<style>
/* ─── Kits: Panel fullscreen (slide desde abajo) ────────── */
.kits-panel-full {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%) translateY(100%);
    width: 100%;
    max-width: 700px;
    height: 92vh;
    background: #f4f7fe;
    border-radius: 28px 28px 0 0;
    z-index: 1059;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: transform .28s ease;
    box-shadow: 0 -12px 48px rgba(0,0,0,.18);
}
.kits-panel-full.open {
    transform: translateX(-50%) translateY(0);
}
@media (max-width: 767.98px) {
    .kits-panel-full { max-width: 100%; left: 0; transform: translateY(100%); border-radius: 28px 28px 0 0; }
    .kits-panel-full.open { transform: translateY(0); }
}
.kits-item-card {
    background: #fff;
    border-radius: 20px;
    padding: 12px;
    border: 1.5px solid #e2e8f0;
    margin-bottom: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,.04);
}
.kits-doc-card {
    background: #fff;
    border-radius: 24px;
    padding: 14px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 2px 8px rgba(0,0,0,.04);
    margin-bottom: 12px;
}
.kits-field-label {
    font-size: .56rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .09em;
    color: #94a3b8;
    margin-bottom: 3px;
}
.kits-input-sm {
    width: 100%;
    height: 38px;
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    border-radius: 12px;
    padding: 0 11px;
    font-size: 12px;
    font-weight: 700;
    outline: none;
    transition: all .2s;
    color: #0f172a;
}
.kits-input-sm:focus { border-color: #2563eb; background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
</style>

<!-- ═══ PANEL KIT (fullscreen slide) ═══════════════════ -->
<div id="kits-panel-detalle" class="kits-panel-full">

  <!-- Header fijo -->
  <div style="display:flex;align-items:center;justify-content:space-between;
              padding:1rem 1.25rem .75rem;flex-shrink:0;border-bottom:1.5px solid #e2e8f0;
              background:#fff;">
    <div style="display:flex;align-items:center;gap:.6rem;">
      <div style="width:38px;height:38px;border-radius:14px;background:#dbeafe;
                  display:flex;align-items:center;justify-content:center;">
        <i class="bi bi-tools" style="color:#2563eb;font-size:1.1rem;"></i>
      </div>
      <div>
        <div id="kitsModal-titulo" style="font-size:.95rem;font-weight:900;color:#0f172a;line-height:1.1;">Configurar Kit de Mantenimiento</div>
        <div style="font-size:.6rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Mantenimiento Preventivo</div>
      </div>
    </div>
    <button onclick="window._kitsCerrarModal()"
            style="width:34px;height:34px;border-radius:10px;background:#f1f5f9;border:none;
                   color:#64748b;font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">
      <i class="bi bi-x-lg"></i>
    </button>
  </div>

  <!-- Cuerpo scrollable -->
  <div style="flex:1;overflow-y:auto;padding:1rem 1rem 0;">
    <datalist id="kits-dl-marcas"></datalist>
    <!-- Doc card -->
    <div class="kits-doc-card">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="grid-column:1/-1;">
          <div class="kits-field-label">Marca Vehículo <span style="color:#ef4444;">*</span></div>
          <input type="text" id="kits-marca" class="kits-input-sm fw-bold text-uppercase" placeholder="Ej: VOLVO" list="kits-dl-marcas" autocomplete="off">
        </div>
        <div style="grid-column:1/-1;">
          <div class="kits-field-label">Tipo de Mantenimiento <span style="color:#ef4444;">*</span></div>
          <div class="position-relative">
            <input type="text" id="kits-tipomp-txt" class="kits-input-sm fw-bold text-uppercase"
                   placeholder="Ej: MP1" autocomplete="off"
                   oninput="window._cbFiltrar('kits-tipomp')"
                   onfocus="window._cbFiltrar('kits-tipomp')"
                   onblur="window._kitsHideCombo('kits-tipomp')">
            <input type="hidden" id="kits-tipomp">
            <div id="kits-tipomp-dd" class="cb-dropdown"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Encabezado artículos -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin:.2rem 0 .65rem;">
      <div style="font-size:.68rem;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:.08em;">
        <i class="bi bi-list-ul me-1" style="color:#2563eb;"></i>Artículos
      </div>
      <button type="button" onclick="window.kitsAgregarFila()"
              style="display:flex;align-items:center;gap:.35rem;padding:.35rem .85rem;
                     border-radius:12px;border:1.5px solid #2563eb;background:#eff6ff;
                     color:#2563eb;font-weight:800;font-size:.72rem;cursor:pointer;">
        <i class="bi bi-plus-lg"></i>Agregar
      </button>
    </div>

    <!-- Cards de artículos -->
    <div id="kits-form-container" style="padding-bottom:1rem;"></div>
  </div>

  <!-- Footer fijo -->
  <div style="flex-shrink:0;padding:.85rem 1rem;border-top:1.5px solid #e2e8f0;background:#fff;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;">
      <div style="font-size:.6rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;">Total Kit</div>
      <div style="font-size:1.3rem;font-weight:900;color:#2563eb;">S/ <span id="kits-form-grand-total">0.00</span></div>
    </div>
    <div style="display:flex;gap:.6rem;">
      <button type="button" onclick="window._kitsCerrarModal()"
              style="flex:1;height:48px;border-radius:14px;border:1.5px solid #e2e8f0;
                     background:#f8fafc;color:#64748b;font-weight:700;font-size:.88rem;cursor:pointer;">
        Cancelar
      </button>
      <button type="button" onclick="window.kitsGuardar()" id="kits-btn-guardar"
              style="flex:2;height:48px;border-radius:14px;border:none;
                     background:linear-gradient(135deg,#2563eb,#1d4ed8);
                     color:#fff;font-weight:800;font-size:.92rem;cursor:pointer;
                     display:flex;align-items:center;justify-content:center;gap:.4rem;
                     box-shadow:0 4px 16px rgba(37,99,235,.35);">
        <i class="bi bi-save"></i>Guardar Kit
      </button>
    </div>
  </div>
</div>
<!-- BACKDROP -->
<div id="kits-backdrop" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,.6);z-index:1058;backdrop-filter:blur(4px);transition:opacity .2s;" onclick="window._kitsCerrarModal()"></div>
`;

// Also remove old <style> at top if it contains media max-width 767.98px #kitsModal
if (html.includes('<style>') && html.includes('#kitsModal .modal-dialog')) {
    html = html.replace(/<style>[\s\S]*?<\/style>/, '');
}

fs.writeFileSync(htmlPath, html + newModal, 'utf8');
console.log('HTML updated');
