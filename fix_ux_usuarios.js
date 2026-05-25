const fs = require('fs');
const path = require('path');

const vistaHtmlPath = path.join(__dirname, 'modulos/sistema/usuarios/vista.html');
let html = fs.readFileSync(vistaHtmlPath, 'utf8');

// 1. Eliminar cualquier FAB previo que haya quedado.
// Buscamos desde "<!-- FAB Menu Usuarios -->" hasta el segundo "</div>" que lo cierra, o usamos regex codicioso con cuidado.
html = html.replace(/<!-- FAB Menu Usuarios -->.*?<\/div>\s*<\/div>\s*<\/div>/s, '</div>\n</div>');
html = html.replace(/<!-- FAB Menu Usuarios \(Estilo Inventario\) -->.*?<\/style>\s*<\/div>/s, '</div>');

// 2. Definir el FAB idéntico al de Inventario
const fabContent = `
    <!-- FAB Menu Usuarios (Estilo Inventario) -->
    <div id="us-fab-container" style="position:fixed;bottom:24px;right:24px;z-index:1030;display:flex;flex-direction:column;align-items:flex-end;">
      <div id="us-fab-backdrop" onclick="document.getElementById('us-fab-menu').style.display='none'; document.getElementById('us-fab-backdrop').style.display='none'; document.getElementById('us-fab-icon').style.transform='rotate(0deg)';" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;-webkit-backdrop-filter:blur(5px);background:rgba(0,0,0,.28);z-index:-1;"></div>
      
      <!-- Menú expandido -->
      <div id="us-fab-menu" style="display:none;flex-direction:column;align-items:flex-end;gap:1rem;margin-bottom:1rem;">
        
        <!-- NUEVO USUARIO -->
        <div style="display:flex;align-items:center;gap:.75rem;">
          <span style="background:#0f172a;color:#fff!important;padding:.45rem .95rem;border-radius:14px;font-size:.7rem;font-weight:800;letter-spacing:.1em;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.25);-webkit-text-fill-color:#fff;">NUEVO USUARIO</span>
          <button onclick="document.getElementById('us-fab-backdrop').click(); window.guNuevoMiembro && window.guNuevoMiembro()" style="width:56px;height:56px;border-radius:18px;background:#2563eb;border:2px solid #fff;color:#fff!important;font-size:1.3rem;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(37,99,235,.4);cursor:pointer;transition:transform .15s;">
            <i class="bi bi-person-plus"></i>
          </button>
        </div>

        <!-- NUEVO ROL -->
        <div style="display:flex;align-items:center;gap:.75rem;">
          <span style="background:#0f172a;color:#fff!important;padding:.45rem .95rem;border-radius:14px;font-size:.7rem;font-weight:800;letter-spacing:.1em;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.25);-webkit-text-fill-color:#fff;">NUEVO ROL</span>
          <button onclick="document.getElementById('us-fab-backdrop').click(); window.guNuevoRol && window.guNuevoRol()" style="width:56px;height:56px;border-radius:18px;background:#10b981;border:2px solid #fff;color:#fff!important;font-size:1.3rem;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(16,185,129,.4);cursor:pointer;transition:transform .15s;">
            <i class="bi bi-shield-plus"></i>
          </button>
        </div>

      </div>

      <!-- Botón principal (cuadrado redondeado) -->
      <button id="us-fab-btn" onclick="const m = document.getElementById('us-fab-menu'); const b = document.getElementById('us-fab-backdrop'); const i = document.getElementById('us-fab-icon'); if(m.style.display==='none'){ m.style.display='flex'; b.style.display='block'; i.style.transform='rotate(45deg)'; } else { m.style.display='none'; b.style.display='none'; i.style.transform='rotate(0deg)'; }" style="width:60px;height:60px;border-radius:18px;background:#f97316;border:none;color:#fff;font-size:1.5rem;box-shadow:0 6px 24px rgba(249,115,22,.5);display:flex;align-items:center;justify-content:center;transition:transform .25s cubic-bezier(.4,0,.2,1),background .2s;margin-top:.5rem;flex-shrink:0;">
        <i class="bi bi-plus-lg" id="us-fab-icon" style="transition:transform .25s;"></i>
      </button>
    </div>
    <style>
      @media (max-width: 768px) {
         #us-fab-container { bottom: 90px !important; }
      }
    </style>
`;

// 3. Reemplazar Offcanvas
const offcanvasOld = /<!-- Offcanvas para móvil -->\s*<div class="offcanvas offcanvas-end".*?<\/div>\s*<\/div>/s;
const offcanvasNew = `<!-- Offcanvas para móvil y paneles -->
<div class="offcanvas offcanvas-end" tabindex="-1" id="offcanvasGU" style="width:min(460px,100vw); background:var(--bg); border:none; margin:16px; height:calc(100% - 32px); border-radius:24px; box-shadow:-4px 0 30px rgba(0,0,0,0.15); z-index:1045;">
    <div class="offcanvas-header" style="background:var(--surface);border-bottom:1px solid var(--border);border-radius:24px 24px 0 0;padding:20px 24px;">
        <h6 class="offcanvas-title fw-bold" id="offcanvasGUTitle" style="color:var(--text);font-size:1.1rem;letter-spacing:0.3px;">Detalle</h6>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" style="opacity:0.6;transition:all 0.2s;"></button>
    </div>
    <div class="offcanvas-body p-0" style="overflow-y:auto;position:relative;">
        <div id="guOffcanvasContent" style="padding:24px 24px 80px;"></div>
        <div id="guOffcanvasActions" style="display:none;position:sticky;bottom:0;background:var(--surface);padding:16px 24px;border-top:1px solid var(--border);border-radius:0 0 24px 24px;justify-content:flex-end;gap:12px;z-index:10;box-shadow:0 -4px 10px rgba(0,0,0,0.02);"></div>
    </div>
</div>`;

// Inject FAB before the Offcanvas
// El HTML termina con </div> </div> y luego el offcanvas. Asegurémonos de encontrar el offcanvas y poner el FAB justo antes.
html = html.replace(offcanvasOld, fabContent + '\n\n' + offcanvasNew);

fs.writeFileSync(vistaHtmlPath, html);
console.log('vista.html modificado.');

// 4. Modificar logica.js para usar el action bar unificado en panel y offcanvas
// Necesitamos asegurar que logica.js coloque los botones flex
const logicaPath = path.join(__dirname, 'modulos/sistema/usuarios/logica.js');
let logica = fs.readFileSync(logicaPath, 'utf8');

// Modificamos _guShowInPanel para poner 'display:flex' en guOffcanvasActions
logica = logica.replace(/if \(oa\) \{ oa\.style\.display=''; oa\.innerHTML = actions; \}/g, "if (oa) { oa.style.display='flex'; oa.innerHTML = actions; }");
logica = logica.replace(/if \(pa\) \{ pa\.style\.display=''; pa\.innerHTML = actions; \}/g, "if (pa) { pa.style.display='flex'; pa.innerHTML = actions; }");

fs.writeFileSync(logicaPath, logica);
console.log('logica.js modificado.');

// 5. Inyectar estilos para botones de acción en estilos.css
const cssPath = path.join(__dirname, 'estilos.css');
let css = fs.readFileSync(cssPath, 'utf8');

const btnStyles = `
/* Botones de acción (Guardar/Eliminar) para Módulo Usuarios y otros */
.btn-gu-save {
    background: var(--crm-accent, #2563eb);
    color: #ffffff;
    border: none;
    padding: 10px 20px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 0.85rem;
    letter-spacing: 0.5px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 12px rgba(37,99,235,0.25);
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.btn-gu-save:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(37,99,235,0.35);
    background: #1d4ed8;
    color: #ffffff;
}

.btn-gu-danger {
    background: transparent;
    color: #ef4444;
    border: 1px solid rgba(239,68,68,0.4);
    padding: 10px 20px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 0.85rem;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.btn-gu-danger:hover {
    background: #ef4444;
    color: #ffffff;
    border-color: #ef4444;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(239,68,68,0.25);
}

/* Modificamos gu-panel-actions en desktop */
.gu-panel-actions {
    background: var(--surface);
    padding: 16px 24px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    border-radius: 0 0 24px 0;
}
`;
if (!css.includes('.btn-gu-save {')) {
    css += '\n' + btnStyles;
    fs.writeFileSync(cssPath, css);
    console.log('estilos.css modificado.');
}
