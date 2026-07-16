const fs = require('fs');
const p = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/vista.html';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(/<select id="inv-fil-sistema"[\s\S]*?<\/select>\s*background:var\(--surface\);padding:0 2rem 0 \.85rem;font-size:\.82rem;\s*font-weight:500;color:var\(--text\);outline:none;cursor:pointer;max-width:170px;">\s*<option value="">Todos los sistemas<\/option>\s*<\/select>/,
`<select id="inv-fil-sistema" onchange="window.filtrarInventario()"
              style="height:36px;border-radius:99px;border:1.5px solid var(--border);
                     background:var(--surface);padding:0 2rem 0 .85rem;font-size:.82rem;
                     font-weight:500;color:var(--text);outline:none;cursor:pointer;max-width:170px;">
        <option value="">Todos los sistemas</option>
      </select>`);

fs.writeFileSync(p, c);
console.log('Fixed syntax leak');
