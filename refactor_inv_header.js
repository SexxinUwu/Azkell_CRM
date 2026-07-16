const fs = require('fs');
const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/vista.html';
let code = fs.readFileSync(path, 'utf8');

const regex = /(<!-- Familia -->[\s\S]*?)(?=<\/div>\s*<button type="button" onclick="window\._invAbrirNuevo)/m;

const match = code.match(regex);
if (match) {
    console.log('Match found');
    const tabsHtml = `
      <!-- Pestañas de Aislamiento -->
      <div style="display:flex; background:rgba(14,165,233,0.1); border-radius:12px; padding:4px; margin-left:12px;">
        <button id="inv-tab-fisicos" onclick="window._invSwitchTab('fisicos')" class="inv-tab-btn active" style="border:none; border-radius:8px; padding:4px 12px; font-size:.8rem; font-weight:700; background:#0ea5e9; color:#fff; cursor:pointer;">📦 Inventario Físico</button>
        <button id="inv-tab-servicios" onclick="window._invSwitchTab('servicios')" class="inv-tab-btn" style="border:none; border-radius:8px; padding:4px 12px; font-size:.8rem; font-weight:700; background:transparent; color:#0ea5e9; cursor:pointer; margin-left:4px;">🛠️ Catálogo de Servicios</button>
      </div>
    `;
    
    const newHeader = `<!-- Familia -->
      <select id="inv-fil-familia" onchange="window.filtrarInventario()"
              style="height:36px;border-radius:99px;border:1.5px solid var(--border);
                     background:var(--surface);padding:0 2rem 0 .85rem;font-size:.82rem;
                     font-weight:500;color:var(--text);outline:none;cursor:pointer;max-width:170px;">
        <option value="">Todas las familias</option>
      </select>
      <!-- Sistema -->
      <select id="inv-fil-sistema" onchange="window.filtrarInventario()"
              style="height:36px;border-radius:99px;border:1.5px solid var(--border);
                     background:var(--surface);padding:0 2rem 0 .85rem;font-size:.82rem;
                     font-weight:500;color:var(--text);outline:none;cursor:pointer;max-width:170px;">
        <option value="">Todos los sistemas</option>
      </select>` + tabsHtml;
    
    code = code.replace(regex, newHeader + '\n    ');
    fs.writeFileSync(path, code);
    console.log('Refactored header!');
} else {
    console.log('Regex did not match.');
}
