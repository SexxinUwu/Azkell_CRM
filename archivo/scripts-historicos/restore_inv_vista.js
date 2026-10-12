const fs = require('fs');
const path = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/vista.html';
let code = fs.readFileSync(path, 'utf8');

const correctHtml = `  <div id="inv-filter-row"
       style="display:flex;align-items:center;gap:.6rem;padding:.6rem 1.5rem;
              border-bottom:1px solid var(--border);background:var(--surface);
              flex-shrink:0;flex-wrap:wrap;">
    <!-- Pill search -->
    <div style="display:flex;align-items:center;gap:.45rem;background:var(--bg);
                border:1.5px solid var(--border);border-radius:99px;padding:.25rem .85rem;
                min-width:230px;transition:border-color .2s,box-shadow .2s;"
         onfocusin="this.style.borderColor='#2563eb';this.style.boxShadow='0 0 0 3px rgba(37,99,235,.08)'"
         onfocusout="this.style.borderColor='var(--border)';this.style.boxShadow=''">
      <i class="bi bi-search" style="color:#94a3b8;font-size:.82rem;flex-shrink:0;"></i>
      <input type="text" id="inv-buscar"
             style="border:none;background:transparent;outline:none;
                    font-size:.83rem;color:var(--text);flex:1;min-width:0;padding:.28rem 0;"
             placeholder="Código, descripción, marca…" oninput="window.filtrarInventario()">
    </div>
    <!-- Familia -->
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
    </select>
    <!-- Tipo (Físico vs Servicio) -->
    <select id="inv-fil-clase" onchange="window.filtrarInventario()"
            style="height:36px;border-radius:99px;border:1.5px solid var(--border);
                   background:rgba(14,165,233,0.05);padding:0 2rem 0 .85rem;font-size:.82rem;
                   font-weight:700;color:#0ea5e9;outline:none;cursor:pointer;max-width:170px;">
      <option value="fisicos" selected>Artículos Físicos</option>
      <option value="servicios">Solo Servicios</option>
      <option value="todos">Todos</option>
    </select>`;

code = code.replace(/<div id="inv-filter-row"[\s\S]*?<option value="">Todas las familias<\/option>\s*<\/select>/, correctHtml);
fs.writeFileSync(path, code);
console.log('Restored vista.html');
