const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'vista.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// The mangled part is up to line 94 `</div>`
const cutoffStr = '<!-- ======= PANEL MODAL KITS (Entradas Style) ======= -->';
const indexCutoff = html.indexOf(cutoffStr);

const replacement = `<div class="d-flex flex-column flex-1 min-h-0" style="height:100%; overflow:hidden">

  <!-- ── HEADER ────────────────────────────────────────────────── -->
  <div id="kits-desktop-header" class="d-flex align-items-center justify-content-between px-3 py-2 flex-shrink-0"
       style="border-bottom:1px solid var(--border); background:var(--surface)">
    <div class="d-flex align-items-center gap-2">
      <i class="bi bi-tools text-primary" style="font-size:1.1rem"></i>
      <span class="fw-bold" style="font-size:1rem">Kits de Mantenimiento</span>
    </div>
    <div class="d-flex gap-2">
      <button class="btn btn-sm btn-reload-cache" title="Actualizar"
              onclick="window.kitsCargarTabla()">
        <i class="bi bi-arrow-clockwise"></i>
      </button>
      <!-- Importar -->
      <div class="dropdown">
        <button class="btn btn-sm btn-outline-info fw-bold dropdown-toggle" type="button" data-bs-toggle="dropdown">
          <i class="bi bi-upload"></i> <span class="d-none d-md-inline">Importar</span>
        </button>
        <ul class="dropdown-menu shadow">
          <li><a class="dropdown-item fw-bold text-success" href="#" onclick="window.kitsDescargarPlantilla()"><i class="bi bi-file-earmark-spreadsheet me-1"></i>1. Descargar Plantilla</a></li>
          <li><hr class="dropdown-divider"></li>
          <li><a class="dropdown-item fw-bold text-primary" href="#" onclick="document.getElementById('inputFileKits').click()"><i class="bi bi-cloud-upload me-1"></i>2. Subir Excel Lleno</a></li>
        </ul>
      </div>
      <input type="file" id="inputFileKits" accept=".xlsx,.xls" style="display:none;" onchange="window.kitsImportarExcel(event)">
      <!-- Exportar -->
      <button class="btn btn-sm btn-outline-success fw-bold" onclick="window.kitsExportarExcel()">
        <i class="bi bi-file-earmark-excel"></i> <span class="d-none d-md-inline">Excel</span>
      </button>
      <button class="btn btn-sm btn-primary fw-bold" onclick="window.kitsAbrirModal()">
        <i class="bi bi-plus-lg me-1"></i>Nuevo Ítem de Kit
      </button>
    </div>
  </div>

  <!-- ── MOBILE HEADER ─────────────────────────────────────────── -->
  <div id="kits-m-header" style="display:none;align-items:center;padding:1rem 1.25rem .75rem;background:#fff;border-bottom:1.5px solid #e2e8f0;position:sticky;top:0;z-index:10;">
    <div style="flex:1;">
      <h6 style="margin:0;font-size:1.15rem;font-weight:900;color:#0f172a;">Kits de Mantenimiento</h6>
      <div style="font-size:.7rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Administración</div>
    </div>
  </div>

  <!-- ── FILTROS ───────────────────────────────────────────────── -->
  <div class="d-flex align-items-center gap-2 px-3 py-2 flex-shrink-0"
       style="border-bottom:1px solid var(--border); background:var(--surface); flex-wrap:wrap">
    <div class="position-relative" style="max-width:150px;">
      <input type="text" id="kits-fil-marca-txt" class="form-control form-control-sm" placeholder="Todas las marcas"
        autocomplete="off" oninput="window._cbFiltrarFilter('kits-fil-marca')"
        onfocus="window._cbFiltrar('kits-fil-marca')" onblur="window._cbHideFilter('kits-fil-marca')">
      <input type="hidden" id="kits-fil-marca">
      <div id="kits-fil-marca-dd" class="cb-dropdown"></div>
    </div>
    <div class="position-relative" style="max-width:150px;">
      <input type="text" id="kits-fil-tipo-txt" class="form-control form-control-sm" placeholder="Todo MP"
        autocomplete="off" oninput="window._cbFiltrarFilter('kits-fil-tipo')"
        onfocus="window._cbFiltrar('kits-fil-tipo')" onblur="window._cbHideFilter('kits-fil-tipo')">
      <input type="hidden" id="kits-fil-tipo">
      <div id="kits-fil-tipo-dd" class="cb-dropdown"></div>
    </div>
  </div>

  <!-- ── TABLA ─────────────────────────────────────────────────── -->
  <div class="flex-1 overflow-auto px-2 py-2 kits-desktop-table">
    <table class="table table-sm table-hover align-middle w-100" style="font-size:0.82rem">
      <thead style="position:sticky; top:0; background:var(--surface); z-index:1">
        <tr style="border-bottom:2px solid var(--border)">
          <th></th><th></th>
          <th style="min-width:160px">Ítem</th>
          <th>Cant.</th><th>Unidad</th>
          <th>C.Unit.</th><th>C.Total</th><th></th>
        </tr>
      </thead>
      <tbody id="kits-tbody">
        <tr><td colspan="8" class="text-center py-4" style="color:var(--subtext)">Cargando...</td></tr>
      </tbody>
    </table>
  </div>

  <!-- ── MOBILE GRID ─────────────────────────────────────────────── -->
  <div class="d-md-none flex-1 overflow-auto" style="padding: .75rem .75rem 120px .75rem; background:transparent;">
    <div id="kits-grid-mobile"></div>
  </div>
  
  <!-- ═══ FAB — solo mobile ════════════════════════════════════════ -->
  <div id="kits-fab-wrap" style="display:none;position:fixed;bottom:104px;right:1rem;z-index:1041;">
    <button class="kits-fab-btn" onclick="window.kitsAbrirModal()">
      <i class="bi bi-plus-lg"></i>
    </button>
  </div>

</div>

`;

// Keep any styles at the very top if they exist!
let styleMatch = html.match(/<style>[\s\S]*?<\/style>\s*/);
let styles = '';
if (styleMatch) {
    styles = styleMatch[0];
}

html = styles + replacement + html.substring(indexCutoff);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('HTML rewritten');
