const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'vista.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Remove the bad stuff at the top
html = html.replace(/<\/div>\s*<!-- ── MOBILE GRID ─────────────────────────────────────────────── -->\s*<div class="d-md-none flex-1 overflow-auto" style="padding: \.75rem \.75rem 120px \.75rem; background:transparent;">\s*<div id="kits-grid-mobile"><\/div>\s*<\/div>\s*<!-- ═══ FAB — solo mobile ════════════════════════════════════════ -->\s*<div id="kits-fab-wrap" style="display:none;position:fixed;bottom:104px;right:1rem;z-index:1041;">\s*<button class="kits-fab-btn" onclick="window\.kitsAbrirModal\(\)">\s*<i class="bi bi-plus-lg"><\/i>\s*<\/button>\s*<\/div>/, '');

// 2. Put it at the bottom (before the end of the flex container)
// First, find the table end.
const tableEndStr = `    </table>
  </div>`;
const insertionIndex = html.indexOf(tableEndStr) + tableEndStr.length;

if (html.indexOf('id="kits-grid-mobile"') === -1) {
    const toInsert = `
  
  <!-- ── MOBILE GRID ─────────────────────────────────────────────── -->
  <div class="d-md-none flex-1 overflow-auto" style="padding: .75rem .75rem 120px .75rem; background:transparent;">
    <div id="kits-grid-mobile"></div>
  </div>
  
  <!-- ═══ FAB — solo mobile ════════════════════════════════════════ -->
  <div id="kits-fab-wrap" style="display:none;position:fixed;bottom:104px;right:1rem;z-index:1041;">
    <button class="kits-fab-btn" onclick="window.kitsAbrirModal()">
      <i class="bi bi-plus-lg"></i>
    </button>
  </div>`;
    html = html.substring(0, insertionIndex) + toInsert + html.substring(insertionIndex);
}

// 3. Add back the "Nuevo Ítem de Kit" button for desktop
const btnToAdd = `
      <button class="btn btn-sm btn-primary fw-bold" onclick="window.kitsAbrirModal()">
        <i class="bi bi-plus-lg me-1"></i>Nuevo Ítem de Kit
      </button>`;
// find where to put it
if (html.indexOf('Nuevo Ítem de Kit') === -1) {
    const exportExcelBtn = `<button class="btn btn-sm btn-outline-success fw-bold" onclick="window.kitsExportarExcel()">
        <i class="bi bi-file-earmark-excel"></i> <span class="d-none d-md-inline">Excel</span>
      </button>`;
    html = html.replace(exportExcelBtn, exportExcelBtn + btnToAdd);
}

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('HTML fixed');
