const fs = require('fs');
const path = require('path');

// 1. Mejorar el layout de #moduloUsuarios y #moduloAuditoria en el CSS global
const cssPath = path.join(__dirname, 'estilos.css');
let css = fs.readFileSync(cssPath, 'utf8');

// Agregar las reglas de bordes redondeados para el módulo interno
const wrapperCss = `
/* Rediseño de Contenedores de Módulos (Usuarios y Auditoría) */
#moduloUsuarios, #moduloAuditoria {
    margin: 16px;
    height: calc(100% - 32px) !important;
    border-radius: 24px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
}
@media (max-width: 768px) {
    #moduloUsuarios, #moduloAuditoria {
        margin: 10px;
        height: calc(100% - 20px) !important;
        border-radius: 20px;
    }
}
`;
if (!css.includes('#moduloUsuarios, #moduloAuditoria')) {
    css += '\n' + wrapperCss;
    fs.writeFileSync(cssPath, css);
}

// 2. Replicar el FAB de Inventario en Usuarios
const usuariosHtmlPath = path.join(__dirname, 'modulos/sistema/usuarios/vista.html');
let usuariosHtml = fs.readFileSync(usuariosHtmlPath, 'utf8');

// Eliminar el FAB anterior
usuariosHtml = usuariosHtml.replace(/<!-- FAB Menu Usuarios -->.*?<\/div>\n<\/div>\n\n<!-- Offcanvas/s, '</div>\n\n<!-- Offcanvas');

// Inyectar el FAB estilo Inventario antes de cerrar #moduloUsuarios
const fabHtml = `
    <!-- FAB Menu Usuarios (Estilo Inventario) -->
    <div id="us-fab-container" style="position:fixed;bottom:24px;right:24px;z-index:1040;display:flex;flex-direction:column;align-items:flex-end;">
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
         #us-fab-container { bottom: 90px !important; } /* Para que no choque con la barra inferior en móvil */
      }
    </style>
`;

usuariosHtml = usuariosHtml.replace('    </div>\n</div>\n\n<!-- Offcanvas para móvil -->', '    </div>\n' + fabHtml + '\n</div>\n\n<!-- Offcanvas para móvil -->');
fs.writeFileSync(usuariosHtmlPath, usuariosHtml);

console.log('Layout and FAB updated successfully.');
