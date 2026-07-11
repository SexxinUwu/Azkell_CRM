const fs = require('fs');
const path = require('path');

const fileHtml = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'vista.html');
let html = fs.readFileSync(fileHtml, 'utf8');

// 1. Update CSS desktop
html = html.replace(/#inv-form-drawer \{\s*position: fixed; top: 0; right: -500px;\s*width: 480px; max-width: 100vw; height: 100vh;\s*background: var\(--surface\); box-shadow: -6px 0 32px rgba\(0,0,0,\.15\);\s*z-index: 1050; transition: right \.3s cubic-bezier\(\.4,0,\.2,1\);\s*display: flex; flex-direction: column; overflow: hidden;\s*\}/g,
`#inv-form-drawer {
    position: fixed; bottom: 0; left: 50%; transform: translateX(-50%) translateY(100%);
    width: 100%; max-width: 700px; height: 92vh;
    background: #f4f7fe; border-radius: 28px 28px 0 0;
    box-shadow: 0 -12px 48px rgba(0,0,0,.18);
    z-index: 1059; transition: transform .28s ease;
    display: flex; flex-direction: column; overflow: hidden;
}`);

html = html.replace(/#inv-form-drawer\.open \{ right: 0; \}/g, 
`#inv-form-drawer.open { transform: translateX(-50%) translateY(0); }`);

// 2. Update CSS mobile
html = html.replace(/#inv-form-drawer \{\s*top: auto !important; bottom: -100vh; right: 0 !important;\s*width: 100vw !important; height: 91vh !important;\s*border-radius: 22px 22px 0 0 !important;\s*transition: bottom \.35s cubic-bezier\(\.4,0,\.2,1\) !important;\s*box-shadow: 0 -12px 48px rgba\(0,0,0,\.2\) !important;\s*\}/g,
`#inv-form-drawer {
        max-width: 100% !important; left: 0 !important; transform: translateX(0) translateY(100%) !important;
        border-radius: 28px 28px 0 0 !important;
    }`);

html = html.replace(/#inv-form-drawer\.open \{ bottom: 0 !important; right: 0 !important; \}/g,
`#inv-form-drawer.open { transform: translateX(0) translateY(0) !important; }`);

// 3. Remove Tabs HTML
const tabsRegex = /<!-- Tabs \(Estilo Segmented Control iOS\) -->[\s\S]*?<\/div>\s*<\/div>\s*<!-- Body scrollable -->/;
html = html.replace(tabsRegex, '<!-- Body scrollable -->');

// 4. Remove tab-content and tab-pane wrappers
html = html.replace(/<div class="tab-content">/, '');
html = html.replace(/<!-- ── TAB 1: Artículo ─── -->\s*<div class="tab-pane fade show active" id="inv-tab-articulo">/, '<!-- Contenido del Artículo -->');
html = html.replace(/<\/div><!-- \/tab-articulo -->\s*<!-- ── TAB 2: Imagen & QR ─── -->\s*<div class="tab-pane fade" id="inv-tab-imagen">/, '<!-- Imagen & QR -->');
html = html.replace(/<!-- Fin TAB 2 -->\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/form>/, '</div>\n    </form>');

// 5. Replace Compatibilidad (Tags) with Multi-select
const compatRegex = /<!-- Compatibilidad \(Tags\) -->[\s\S]*?<div id="inv-marcas-dropdown"[\s\S]*?<\/div>\s*<\/div>/;
const msHtml = `<!-- Compatibilidad (Multi-Select) -->
          <div class="px-3 mt-4 mb-3">
            <p class="text-uppercase fw-semibold mb-1 px-1" style="font-size:0.75rem; letter-spacing:0.05em; color:#6b7280;">Unidades Compatibles</p>
            <div class="position-relative">
              <div id="inv-ms-box" onclick="window.invMsToggle()" style="background:#fff;border:1px solid rgba(229,231,235,0.6);border-radius:12px;padding:12px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;box-shadow:0 1px 2px rgba(0,0,0,.05);">
                <span id="inv-ms-count" style="font-weight:600;color:#1e293b;font-size:0.95rem;">0 seleccionados</span>
                <i class="bi bi-chevron-down" style="color:#64748b;"></i>
              </div>
              <div id="inv-ms-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid rgba(229,231,235,0.6);border-radius:12px;margin-top:6px;box-shadow:0 10px 25px rgba(0,0,0,.08);z-index:999;overflow:hidden;">
                <div style="padding:10px;border-bottom:1px solid #e2e8f0;">
                  <input type="text" id="inv-ms-search" class="form-control form-control-sm shadow-none" placeholder="Buscar marca..." oninput="window.invMsSearch()" style="border-radius:8px;font-size:0.9rem;border:1px solid rgba(229,231,235,0.8);">
                </div>
                <div id="inv-ms-options" style="max-height:220px;overflow-y:auto;padding:6px 0;"></div>
                <div style="padding:8px;border-top:1px solid #e2e8f0;text-align:center;">
                  <button type="button" onclick="window.invMsClear()" class="btn btn-sm btn-light w-100" style="font-weight:600;font-size:0.85rem;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;">Limpiar todo</button>
                </div>
              </div>
            </div>
          </div>`;
html = html.replace(compatRegex, msHtml);

fs.writeFileSync(fileHtml, html, 'utf8');
console.log('HTML updated successfully.');
