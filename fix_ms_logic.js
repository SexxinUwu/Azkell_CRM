const fs = require('fs');
const path = require('path');

const fileJs = path.join(__dirname, 'modulos', 'almacen', 'inventario', 'logica.js');
let js = fs.readFileSync(fileJs, 'utf8');

const regex = /\/\/ ── Multi-select chips: Marca de Unidad ──────────────────────────[\s\S]*?window\._invMarcasKeydown = function\(event\) \{[\s\S]*?\};/g;

const msLogic = `// ── Poblar / Multiselect Marcas (Unidades Compatibles) ────────────────────────────
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
    window._invActualizarPreview();
};

window.invMsClear = function() {
    window._invMarcasSeleccionadas = [];
    window.invMsRenderBox();
    var s = document.getElementById('inv-ms-search');
    window.invMsRenderOptions(s ? s.value.toLowerCase() : '');
    window._invActualizarPreview();
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

js = js.replace(regex, msLogic);
fs.writeFileSync(fileJs, js, 'utf8');
console.log('Fixed invMsInit.');
