const fs = require('fs');
const p = 'c:/Users/teffa/OneDrive/Escritorio/Azkell_CRM/Azkell_CRM/modulos/almacen/inventario/logica.js';
let c = fs.readFileSync(p, 'utf8');

if (!c.includes('// Cambiar labels a Servicio')) {
    c = c.replace(
        /if \(isServicio && !id\) \{/,
        `// Cambiar labels a Servicio
        var lblTitulo = document.getElementById('modal-inv-titulo');
        var lblArticulo = document.querySelector('.servicio-keep .ent-field-label');
        if (lblTitulo) {
            if (isServicio) {
                lblTitulo.innerHTML = id ? '<i class="bi bi-pencil-fill me-1"></i>Editar Servicio &mdash; ' + id : '<i class="bi bi-box me-1"></i>Nuevo Servicio <span style="color:var(--subtext);font-size:0.65em;display:block;margin-top:-2px;font-weight:600;">CATÁLOGO DE SERVICIOS</span>';
            } else {
                lblTitulo.innerHTML = id ? '<i class="bi bi-pencil-fill me-1"></i>Editar Artículo &mdash; ' + id : '<i class="bi bi-box me-1"></i>Nuevo Artículo <span style="color:var(--subtext);font-size:0.65em;display:block;margin-top:-2px;font-weight:600;">INVENTARIO DE ALMACÉN</span>';
            }
        }
        if (lblArticulo) {
            lblArticulo.innerHTML = isServicio ? 'Servicio <span style="color:#ef4444;">*</span>' : 'Artículo <span style="color:#ef4444;">*</span>';
        }
        
        if (isServicio && !id) {`
    );
    
    // We also need to prevent the later `if (id)` from overriding our title entirely:
    // Wait, let's just search and replace the later if(id) title setting.
    c = c.replace(
        /if \(titulo\) titulo\.innerHTML = '<i class="bi bi-pencil-fill me-1"><\/i>Editar Art\u00edculo &mdash; ' \+ id;/,
        `if (titulo) titulo.innerHTML = '<i class="bi bi-pencil-fill me-1"></i>Editar ' + (isServicio ? 'Servicio' : 'Artículo') + ' &mdash; ' + id;`
    );
}

fs.writeFileSync(p, c);
console.log('Labels patched');
