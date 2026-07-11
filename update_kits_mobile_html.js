const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'modulos', 'mantenimiento', 'kits-mp', 'vista.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Replace top styling to include mobile
const styleEnd = html.indexOf('</style>');
if (styleEnd > -1) {
    const newStyle = `
/* ─── Mobile Kits View ─────────────────────────────────────────── */
@media (max-width: 767.98px) {
    .topbar { display: none !important; }
    .main-area { padding: 0 !important; overflow: auto !important; overscroll-behavior: contain; }
    #kits-desktop-header { display: none !important; }
    #kits-m-header { display: flex !important; }
    #kits-fab-wrap { display: flex !important; flex-direction: column; align-items: flex-end; }
    .kits-desktop-table { display: none !important; }
}
/* ─── Kits List Card Mobile ────────────────────────────────────── */
.kits-list-card {
    background: #fff; border: 1.5px solid #e2e8f0;
    border-radius: 16px; padding: .85rem 1rem; margin-bottom: .65rem;
    box-shadow: 0 2px 8px rgba(0,0,0,.04); position: relative;
}
.kits-list-card-header {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px dashed #e2e8f0; padding-bottom: .5rem; margin-bottom: .5rem;
}
.kits-fab-btn {
    width: 56px; height: 56px; border-radius: 18px;
    background: #2563eb; color: #fff; border: none;
    box-shadow: 0 6px 16px rgba(37,99,235,.4);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.5rem; cursor: pointer; transition: transform .2s, box-shadow .2s;
}
.kits-fab-btn:active { transform: scale(.92); }
`;
    html = html.substring(0, styleEnd) + newStyle + html.substring(styleEnd);
}

// Wrap desktop header and add mobile header
html = html.replace('<div class="d-flex align-items-center justify-content-between px-3 py-2 flex-shrink-0"\n       style="border-bottom:1px solid var(--border); background:var(--surface)">', 
`<div id="kits-desktop-header" class="d-flex align-items-center justify-content-between px-3 py-2 flex-shrink-0" style="border-bottom:1px solid var(--border); background:var(--surface)">`);

// Remove "Nuevo Ítem de Kit" button from desktop header since it will be a FAB
html = html.replace(/<button class="btn btn-sm btn-primary fw-bold" onclick="window\.kitsAbrirModal\(\)">[\s\S]*?<\/button>/, '');

// Insert Mobile Header after desktop header
const filtersStart = html.indexOf('<!-- ── FILTROS');
html = html.substring(0, filtersStart) + 
`  <!-- ── MOBILE HEADER ─────────────────────────────────────────── -->
  <div id="kits-m-header" style="display:none;align-items:center;padding:1rem 1.25rem .75rem;background:#fff;border-bottom:1.5px solid #e2e8f0;position:sticky;top:0;z-index:10;">
    <div style="flex:1;">
      <h6 style="margin:0;font-size:1.15rem;font-weight:900;color:#0f172a;">Kits de Mantenimiento</h6>
      <div style="font-size:.7rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Administración</div>
    </div>
  </div>
` + html.substring(filtersStart);

// Add class to table container
html = html.replace('<div class="flex-1 overflow-auto px-2 py-2">', '<div class="flex-1 overflow-auto px-2 py-2 kits-desktop-table">');

// Add mobile grid div after table container
const tableEnd = html.indexOf('</div>\n\n<!-- ======= PANEL MODAL KITS');
html = html.substring(0, tableEnd) + 
`</div>
  
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
` + html.substring(tableEnd);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('HTML updated');
