const fs = require('fs');

// 1. Add "Tipo" dropdown in vista.html next to Sistema
const visPath = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/vista.html';
let visCode = fs.readFileSync(visPath, 'utf8');

const targetHtml = `      <select id="inv-fil-sistema" onchange="window.filtrarInventario()"
              style="height:36px;border-radius:99px;border:1.5px solid var(--border);
                     background:var(--surface);padding:0 2rem 0 .85rem;font-size:.82rem;
                     font-weight:500;color:var(--text);outline:none;cursor:pointer;max-width:170px;">
        <option value="">Todos los sistemas</option>
      </select>`;

const replaceHtml = targetHtml + `
      <!-- Tipo (Físico vs Servicio) -->
      <select id="inv-fil-clase" onchange="window.filtrarInventario()"
              style="height:36px;border-radius:99px;border:1.5px solid var(--border);
                     background:rgba(14,165,233,0.05);padding:0 2rem 0 .85rem;font-size:.82rem;
                     font-weight:700;color:#0ea5e9;outline:none;cursor:pointer;max-width:170px;">
        <option value="fisicos" selected>Artículos Físicos</option>
        <option value="servicios">Solo Servicios</option>
        <option value="todos">Todos</option>
      </select>`;

if (!visCode.includes('inv-fil-clase')) {
    visCode = visCode.replace(targetHtml, replaceHtml);
    fs.writeFileSync(visPath, visCode);
}

// 2. Modify inventario/logica.js to use inv-fil-clase
const logPath = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/logica.js';
let logCode = fs.readFileSync(logPath, 'utf8');

const filterLogic = `
    var claseEl = document.getElementById('inv-fil-clase');
    var valClase = claseEl ? claseEl.value : 'fisicos';
`;

const conditionLogic = `
        if (valClase === 'fisicos' && item.tipo === 'Servicio') return false;
        if (valClase === 'servicios' && item.tipo !== 'Servicio') return false;
`;

if (!logCode.includes('inv-fil-clase')) {
    logCode = logCode.replace(/var valSis = sisEl \? sisEl\.value : '';/, "var valSis = sisEl ? sisEl.value : '';\n" + filterLogic);
    logCode = logCode.replace(/if \(valFam && item\.familia !== valFam\) return false;/, "if (valFam && item.familia !== valFam) return false;\n" + conditionLogic);
    fs.writeFileSync(logPath, logCode);
}

console.log('inject_servicios_filter.js applied!');
