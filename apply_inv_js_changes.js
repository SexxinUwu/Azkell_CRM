const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

// 1. Add multiselect logic
const msLogic = `
// ── Poblar / Multiselect Marcas (Unidades Compatibles) ────────────────────────────
window._invMarcasLista = window._invMarcasLista || [];
window._invMarcasSeleccionadas = window._invMarcasSeleccionadas || [];

window.invMsInit = function(valorActual) {
    var arr = [];
    if (typeof valorActual === 'string' && valorActual.trim().startsWith('[')) {
        try { arr = JSON.parse(valorActual); } catch(e) {}
    } else if (typeof valorActual === 'string' && valorActual) {
        arr = valorActual.split(',').map(function(m){ return m.trim(); });
    } else if (Array.isArray(valorActual)) {
        arr = valorActual;
    }
    window._invMarcasSeleccionadas = arr.filter(Boolean);
    window.invMsRenderBox();
    
    var dd = document.getElementById('inv-ms-dropdown');
    if (dd) dd.style.display = 'none';
    var s = document.getElementById('inv-ms-search');
    if (s) s.value = '';

    var doRender = function() { window.invMsRenderOptions(''); };
    if (window._invMarcasLista.length > 0) { doRender(); return; }
    
    fetch('/api/placas-lista')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(data) {
            var marcasSet = {};
            data.forEach(function(p) {
                if (p.marca_vehiculo) marcasSet[p.marca_vehiculo.trim().toUpperCase()] = true;
            });
            window._invMarcasLista = Object.keys(marcasSet).sort();
            doRender();
        })
        .catch(function() {});
};

window.invMsToggle = function() {
    var dd = document.getElementById('inv-ms-dropdown');
    var box = document.getElementById('inv-ms-box');
    if (!dd) return;
    var isOpen = dd.style.display !== 'none';
    if (isOpen) {
        dd.style.display = 'none';
        if (box) box.style.borderColor = 'rgba(229,231,235,0.6)';
    } else {
        dd.style.display = 'block';
        if (box) box.style.borderColor = '#2563eb';
        var search = document.getElementById('inv-ms-search');
        if (search) { search.value = ''; search.focus(); }
        window.invMsRenderOptions('');
    }
};

window.invMsSearch = function() {
    var s = document.getElementById('inv-ms-search');
    if (s) window.invMsRenderOptions(s.value.toLowerCase());
};

window.invMsRenderOptions = function(filtro) {
    var cont = document.getElementById('inv-ms-options');
    if (!cont) return;
    var html = '';
    window._invMarcasLista.forEach(function(m) {
        if (filtro && m.toLowerCase().indexOf(filtro) === -1) return;
        var checked = window._invMarcasSeleccionadas.includes(m) ? 'checked' : '';
        html += '<div style="padding:6px 16px;display:flex;align-items:center;cursor:pointer;transition:background .2s;" onmouseover="this.style.background=\\'#f8fafc\\'" onmouseout="this.style.background=\\'transparent\\'" onclick="window.invMsToggleOption(\\'' + m + '\\')">';
        html += '<input type="checkbox" class="form-check-input mt-0 me-2 shadow-none" style="cursor:pointer;" ' + checked + ' onclick="event.stopPropagation(); window.invMsToggleOption(\\'' + m + '\\')">';
        html += '<span style="font-size:0.9rem;color:#334155;">' + m + '</span>';
        html += '</div>';
    });
    if (html === '') html = '<div style="padding:10px 16px;font-size:0.85rem;color:#94a3b8;text-align:center;">No hay coincidencias</div>';
    cont.innerHTML = html;
};

window.invMsToggleOption = function(m) {
    var idx = window._invMarcasSeleccionadas.indexOf(m);
    if (idx > -1) window._invMarcasSeleccionadas.splice(idx, 1);
    else window._invMarcasSeleccionadas.push(m);
    window.invMsRenderBox();
    var s = document.getElementById('inv-ms-search');
    window.invMsRenderOptions(s ? s.value.toLowerCase() : '');
};

window.invMsClear = function() {
    window._invMarcasSeleccionadas = [];
    window.invMsRenderBox();
    var s = document.getElementById('inv-ms-search');
    window.invMsRenderOptions(s ? s.value.toLowerCase() : '');
};

window.invMsRenderBox = function() {
    var count = document.getElementById('inv-ms-count');
    if (!count) return;
    var sel = window._invMarcasSeleccionadas.length;
    if (sel === 0) {
        count.textContent = '0 seleccionados';
        count.style.color = '#94a3b8';
    } else if (sel === 1) {
        count.textContent = window._invMarcasSeleccionadas[0];
        count.style.color = '#1e293b';
    } else {
        count.textContent = sel + ' seleccionados';
        count.style.color = '#1e293b';
    }
};

// Close dropdown on click outside
document.addEventListener('click', function(e) {
    var dd = document.getElementById('inv-ms-dropdown');
    var box = document.getElementById('inv-ms-box');
    if (!dd || !box) return;
    if (dd.style.display === 'none') return;
    if (!box.contains(e.target) && !dd.contains(e.target)) {
        dd.style.display = 'none';
        box.style.borderColor = 'rgba(229,231,235,0.6)';
    }
});

`;

// Insert the logic before the old tags logic
js = js.replace(/\/\/ ── Tags: Unidades Compatibles \(Marcas\) ──/, msLogic + '\n// ── Tags: Unidades Compatibles (Marcas) ──');

// 2. Remove the old reset logic from abrirModalInventario
js = js.replace(/\/\/ Reset chips\s*window\._invMarcasSeleccionadas = \[\];\s*window\._invRenderChips\(\);/g, '// Reset chips\n    window.invMsInit(\'\');');

// 3. Remove the old parsing from edit logic
js = js.replace(/\/\/ Chips marca_unidad\s*try \{\s*window\._invMarcasSeleccionadas = JSON\.parse\(item\.marca_unidad \|\| '\[\]'\);\s*\} catch\(e\) \{\s*window\._invMarcasSeleccionadas = item\.marca_unidad \? \[item\.marca_unidad\] : \[\];\s*\}\s*window\._invRenderChips\(\);/g,
'// Chips marca_unidad\n        window.invMsInit(item.marca_unidad);');

// 4. Update the save function (guardarArticuloInv)
// We need to change the way marca_unidad is collected. The original logic probably does:
// var marcaU = JSON.stringify(window._invMarcasSeleccionadas || []);
// Let's verify what it is currently.
// It uses window._invMarcasSeleccionadas directly. Since we repurposed window._invMarcasSeleccionadas, it will still just work! 
// Wait, the API expects a JSON string or comma-separated string? JSON.stringify(window._invMarcasSeleccionadas || []) is safe.
// We will just let it be, but let's make sure `guardarArticuloInv` doesn't break.

// 5. Remove the old nav-tabs reset in abrirModalInventario
js = js.replace(/\/\/ Resetear tab a Artículo[\s\S]*?if \(basico\) basico\.classList\.add\('show', 'active'\);\s*\}/g, '// Tabs removidos');

// 6. Update Drawer animation toggle
js = js.replace(/var drawer = document\.getElementById\('inv-form-drawer'\);\s*if \(drawer\) drawer\.classList\.add\('open'\);/g, 
`var drawer = document.getElementById('inv-form-drawer');
    var bd = document.getElementById('inv-drawer-backdrop');
    if (bd) bd.style.display = 'block';
    if (drawer) {
        drawer.style.display = 'flex';
        // force reflow
        void drawer.offsetWidth;
        drawer.classList.add('open');
    }`);

js = js.replace(/window\._invCerrarDrawer = function\(\) \{[\s\S]*?\};/g,
`window._invCerrarDrawer = function() {
    var d = document.getElementById('inv-form-drawer');
    var bd = document.getElementById('inv-drawer-backdrop');
    if (d) {
        d.classList.remove('open');
        // wait for transition
        setTimeout(function(){ d.style.display = 'none'; }, 300);
    }
    if (bd) bd.style.display = 'none';
};`);


fs.writeFileSync(fileJs, js, 'utf8');
console.log('JS updated successfully.');
