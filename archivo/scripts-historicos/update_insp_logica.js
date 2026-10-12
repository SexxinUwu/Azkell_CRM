const fs = require('fs');

let fileContent = fs.readFileSync('modulos/mantenimiento/inspecciones/logica.js', 'utf8');

// 1. Reemplazar iteraciones WIZARD_SCHEMA por DYNAMIC_INSP_SCHEMA
fileContent = fileContent.replace(/WIZARD_SCHEMA/g, 'window.DYNAMIC_INSP_SCHEMA');

// 2. Modificar init_inspecciones
let initRegex = /window\.init_inspecciones\s*=\s*function\s*\(\)\s*\{([\s\S]*?)\n\};\n/m;
let matchInit = fileContent.match(initRegex);
if(matchInit) {
    let newInitBody = `
    if (!window.checkPerm('insp', 'l')) {
        window.showNoPermMsg('mod-inspecciones');
        return;
    }
    var btnNuevo = document.querySelector('#mod-inspecciones [onclick*="abrirModalInspeccion"], [onclick*="abrirWizard"]');
    if (btnNuevo) btnNuevo.style.display = window.checkPerm('insp', 'c') ? '' : 'none';
    
    var navFilter = localStorage.getItem('fleet_insp_nav_filter');
    if (navFilter) {
        localStorage.removeItem('fleet_insp_nav_filter');
        window._pendingInspFilter = navFilter;
    }
    
    if (window.innerWidth < 768) {
        var panel = document.getElementById('panelGraficosStatus');
        var btn = document.getElementById('btnToggleGraficos');
        if (panel) panel.style.display = 'none';
        if (btn) btn.innerHTML = '<i class="bi bi-eye-fill"></i> <span data-i18n="common.charts">Gráficos</span>';
    }

    // Cargar Configuración Dinámica de Inspecciones
    fetch('/api/mantenimiento/inspecciones/config')
        .then(r => r.json())
        .then(res => {
            if (res.ok && res.data) {
                window.DYNAMIC_INSP_SCHEMA = res.data.map(d => {
                    let parsedItems = [];
                    try { parsedItems = typeof d.items_json === 'string' ? JSON.parse(d.items_json) : d.items_json; } catch(e){}
                    return { tab: d.titulo, template_id: d.template_id, items: parsedItems };
                });
            } else {
                window.DYNAMIC_INSP_SCHEMA = [];
            }
            if (dataGlobalInspecciones && dataGlobalInspecciones.length > 0) {
                mostrarStatusInspecciones(dataGlobalInspecciones);
            } else {
                recargarModulo('statusMant');
            }
        })
        .catch(e => {
            console.error("Error cargando DYNAMIC_INSP_SCHEMA", e);
            window.DYNAMIC_INSP_SCHEMA = [];
            recargarModulo('statusMant');
        });
`;
    fileContent = fileContent.replace(initRegex, `window.init_inspecciones = function() {\n${newInitBody}\n};\n`);
}

// 3. Modificar cambiarPestana, moverWizard, abrirModalNuevaInspeccion
// Vamos a reescribirlas por completo
let regexNavegacion = /\/\/ ============================================================\s*\/\/ 🚀 NAVEGACIÓN DEL WIZARD Y APERTURA DE MODALES\s*\/\/ ============================================================[\s\S]*?(?=window\.abrirModalEditarInspeccion)/;

let nuevaNavegacion = `// ============================================================
// 🚀 RENDERIZADO MODERNO Y APERTURA DE MODALES
// ============================================================

window.renderModernInspForm = function() {
    let html = '';
    
    // Tarjeta 1: Registro Fijo
    html += \`<div class="card shadow-sm border-0 mb-3" style="border-radius:12px;">
        <div class="card-header bg-white border-bottom-0 pb-0 pt-3">
            <h6 class="fw-bold text-primary m-0"><i class="bi bi-card-heading me-1"></i> 1. DATOS DE REGISTRO</h6>
        </div>
        <div class="card-body">
            <div class="row g-3">
                <div class="col-md-6 col-12">
                    <label class="fw-bold text-muted" style="font-size:0.8rem;">Fecha de Ingreso</label>
                    <input type="date" class="form-control fw-bold shadow-sm" id="i_fecha" required style="border-radius:8px;">
                </div>
                <div class="col-md-6 col-12">
                    <label class="fw-bold text-primary" style="font-size:0.8rem;">
                        <i class="bi bi-truck"></i> Placa *
                    </label>
                    \${window.SS.html('insp-placa','i_placa','i_placa','ESCRIBE PARA BUSCAR...','Buscar placa...')}
                </div>
                <div class="col-md-6 col-12">
                    <label class="fw-bold text-muted" style="font-size:0.8rem;">KM Tablero (Opcional)</label>
                    <input type="number" class="form-control text-danger fw-bold shadow-sm" id="i_kmtablero" placeholder="Ej: 150000" style="border-radius:8px;">
                </div>
                <div class="col-md-6 col-12">
                    <label class="fw-bold text-muted" style="font-size:0.8rem;">Dueño (Cliente)</label>
                    <input type="text" class="form-control bg-light shadow-sm" id="i_cliente" readonly style="border-radius:8px;">
                </div>
                <div class="col-md-6 col-12">
                    <label class="fw-bold text-muted" style="font-size:0.8rem;">Tipo</label>
                    <input type="text" class="form-control bg-light text-uppercase shadow-sm" id="i_modelo" readonly style="border-radius:8px;">
                </div>
                <div class="col-md-6 col-12">
                    <label class="fw-bold text-muted" style="font-size:0.8rem;"><i class="bi bi-geo-alt-fill"></i> KM GPS (Wialon)</label>
                    <input type="number" class="form-control text-primary bg-light fw-bold shadow-sm" id="i_kmgps" readonly placeholder="Calculando..." style="border-radius:8px;">
                </div>
            </div>
        </div>
    </div>\`;

    // Tarjetas Dinámicas de Categorías
    window.DYNAMIC_INSP_SCHEMA.forEach((sec, i) => {
        html += \`<div class="card shadow-sm border-0 mb-3" style="border-radius:12px;">
            <div class="card-header bg-white border-bottom-0 pb-0 pt-3">
                <h6 class="fw-bold text-primary m-0"><i class="bi bi-list-check me-1"></i> \${i+2}. \${sec.tab}</h6>
            </div>
            <div class="card-body">\`;
            
        sec.items.forEach((item, j) => {
            let lbl = typeof item === 'string' ? item : item.label; 
            let t = typeof item === 'string' ? 'okfalla' : item.type; 
            let uid = \`p_\${i}_\${j}\`;
            
            html += \`<div class="mb-4 border-bottom pb-3 last-border-0">
                <label class="fw-bold text-dark d-block mb-2" style="font-size:0.9rem;">\${lbl}</label>\`;

            if (t === 'okfalla') {
                html += \`<div class="d-flex gap-2 w-100">
                    <input type="radio" class="btn-check" name="\${uid}" id="\${uid}_ok" value="OK" onclick="toggleRadioOkFalla(this, 'f_\${uid}', false)">
                    <label class="btn btn-outline-success fw-bold flex-grow-1" for="\${uid}_ok" style="border-radius:8px;">OK</label>
                    <input type="radio" class="btn-check" name="\${uid}" id="\${uid}_fa" value="FALLA" onclick="toggleRadioOkFalla(this, 'f_\${uid}', true)">
                    <label class="btn btn-outline-danger fw-bold flex-grow-1" for="\${uid}_fa" style="border-radius:8px;">FALLA</label>
                </div>
                <div id="f_\${uid}" style="display:none;" class="mt-2 p-3 bg-light rounded border-start border-danger border-4 shadow-sm">
                    <label class="form-label text-danger fw-bold" style="font-size:0.8rem;"><i class="bi bi-pencil-square"></i> Observación</label>
                    <textarea class="form-control mb-2 border-danger" rows="2" id="obs_\${uid}" placeholder="Describe la falla..."></textarea>
                    <label class="form-label text-danger fw-bold mt-2" style="font-size:0.8rem;"><i class="bi bi-camera"></i> Evidencia (Opcional)</label>
                    <input type="file" class="form-control border-danger form-control-sm" id="foto_\${uid}" accept="image/*">
                </div>\`;
            } else if (t === 'percent') {
                html += \`<input type="hidden" id="val_\${uid}" value="">
                <div class="d-flex flex-wrap gap-1">\`;
                [10,20,30,40,50,60,70,80,90,100].forEach(pct => { 
                    html += \`<button type="button" class="btn btn-outline-primary btn-sm fw-bold pct-btn pct-\${uid} flex-grow-1 shadow-sm" style="border-radius:6px; min-width:40px;" onclick="seleccionarPorcentaje('\${uid}', \${pct}, this)">\${pct}%</button>\`; 
                });
                html += \`</div>\`;
            } else if (t === 'text') {
                html += \`<textarea class="form-control border-primary shadow-sm" rows="2" id="txt_\${uid}" placeholder="Ingresa el detalle..." style="border-radius:8px;"></textarea>\`;
            }
            html += \`</div>\`;
        });
        html += \`</div></div>\`;
    });

    // Tarjeta Final: Firma
    html += \`<div class="card shadow-sm border-0 mb-3" style="border-radius:12px;">
        <div class="card-header bg-white border-bottom-0 pb-0 pt-3">
            <h6 class="fw-bold text-primary m-0"><i class="bi bi-pen me-1"></i> \${window.DYNAMIC_INSP_SCHEMA.length + 2}. FIRMA</h6>
        </div>
        <div class="card-body">
            <div class="row g-3">
                <div class="col-md-8 mb-3">
                    <label class="fw-bold text-primary" style="font-size:0.8rem;">Técnico Inspector</label>
                    <input type="text" class="form-control fw-bold text-uppercase shadow-sm" id="i_tecnico" list="dl-tecnicos" placeholder="Selecciona o escribe uno nuevo" required style="border-radius:8px;">
                </div>
                <div class="col-md-4 mb-3">
                    <label class="fw-bold text-primary" style="font-size:0.8rem;">Días Propuestos</label>
                    <input type="number" class="form-control fw-bold shadow-sm" id="i_dias" value="30" style="border-radius:8px;">
                </div>
            </div>
            <div class="mb-2">
                <label class="fw-bold text-primary mb-2" style="font-size:0.8rem;"><i class="bi bi-pen"></i> Firma del Técnico</label>
                <canvas id="canvasFirma" class="firma-pad shadow-sm border rounded w-100" style="height: 150px; background:#f8fafc;"></canvas>
                <button type="button" class="btn btn-sm btn-outline-danger mt-2 w-100 fw-bold" onclick="limpiarFirma()"><i class="bi bi-eraser"></i> Borrar Firma</button>
            </div>
        </div>
    </div>\`;

    document.getElementById('wizard-dynamic-tabs').innerHTML = html;
    
    // 🔥 INICIALIZAR LIBRERÍA DE BÚSQUEDA DESPUÉS DE RENDERIZAR 🔥
    if (window.SS) {
        window.SS.init('insp-placa');
        // También reasignamos autocompletado en caso de cambios
        let placaInput = document.getElementById('i_placa');
        if(placaInput) {
            placaInput.addEventListener('change', autocompletarInfoInsp);
        }
    }
    
    setTimeout(initFirma, 500);
};

window.abrirModalNuevaInspeccion = function (placaPreselect) {
    document.getElementById('formNuevaInspeccion').reset();
    document.getElementById('i_id_inspeccion').value = "";
    
    // Renderizamos de nuevo por si cambió la config
    renderModernInspForm();

    let tzOffset = (new Date()).getTimezoneOffset() * 60000;
    document.getElementById('i_fecha').value = (new Date(Date.now() - tzOffset)).toISOString().split('T')[0];

    document.querySelectorAll('[id^="f_p_"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.pct-btn').forEach(btn => {
        btn.classList.remove('btn-primary', 'text-white');
        btn.classList.add('btn-outline-primary');
    });
    document.querySelectorAll('[id^="val_p_"]').forEach(el => el.value = '');
    document.querySelectorAll('input[type="radio"]').forEach(r => r.dataset.chk = '0');

    if (placaPreselect) {
        let iPlaca = document.getElementById('i_placa');
        if (iPlaca) {
            iPlaca.value = placaPreselect;
            if (window.SS) window.SS.setValue('insp-placa', placaPreselect);
            autocompletarInfoInsp();
        }
    }

    new bootstrap.Offcanvas(document.getElementById('drawerInspeccion')).show();
};

`;
fileContent = fileContent.replace(regexNavegacion, nuevaNavegacion);

// 4. Inyectar Lógica de Configuración al final del archivo
let configLogic = `
// ==========================================
// ⚙️ CONFIGURACIÓN DEL CHECKLIST
// ==========================================
window.abrirConfigInspecciones = function() {
    fetch('/api/mantenimiento/inspecciones/config')
        .then(r => r.json())
        .then(res => {
            let container = document.getElementById('config-insp-container');
            if (res.ok && res.data) {
                window.DYNAMIC_INSP_SCHEMA = res.data.map(d => {
                    let parsedItems = [];
                    try { parsedItems = typeof d.items_json === 'string' ? JSON.parse(d.items_json) : d.items_json; } catch(e){}
                    return { tab: d.titulo, template_id: d.template_id, items: parsedItems };
                });
            } else {
                window.DYNAMIC_INSP_SCHEMA = [];
            }
            renderConfigInspItems();
            new bootstrap.Modal(document.getElementById('modalConfigInsp')).show();
        })
        .catch(e => alert("Error al abrir configuración"));
};

window.renderConfigInspItems = function() {
    let container = document.getElementById('config-insp-container');
    let html = '';
    window.DYNAMIC_INSP_SCHEMA.forEach((cat, catIdx) => {
        let itemsHtml = '';
        (cat.items || []).forEach((item, itemIdx) => {
            let lbl = item.label || item;
            let type = item.type || 'okfalla';
            let icon = type==='okfalla' ? 'bi-check-circle' : (type==='percent' ? 'bi-percent' : 'bi-textarea-t');
            
            itemsHtml += \`
                <div class="d-flex align-items-center gap-2 mb-2 bg-white p-2 rounded border shadow-sm item-row" data-catidx="\${catIdx}" data-itemidx="\${itemIdx}">
                    <i class="bi bi-grip-vertical text-muted cursor-move"></i>
                    <input type="text" class="form-control form-control-sm fw-bold flex-grow-1" value="\${lbl}" onchange="actualizarItemConfigInsp(\${catIdx}, \${itemIdx}, 'label', this.value)">
                    <select class="form-select form-select-sm" style="width: 130px;" onchange="actualizarItemConfigInsp(\${catIdx}, \${itemIdx}, 'type', this.value)">
                        <option value="okfalla" \${type==='okfalla'?'selected':''}>OK / Falla</option>
                        <option value="percent" \${type==='percent'?'selected':''}>Porcentaje (%)</option>
                        <option value="text" \${type==='text'?'selected':''}>Texto Libre</option>
                    </select>
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarItemConfigInsp(\${catIdx}, \${itemIdx})"><i class="bi bi-trash"></i></button>
                </div>
            \`;
        });

        html += \`
            <div class="card shadow-sm border-0 mb-3 cat-card" style="border-radius:12px; border:1px solid #e2e8f0;">
                <div class="card-header d-flex justify-content-between align-items-center" style="background:#f1f5f9; border-radius:12px 12px 0 0;">
                    <div class="d-flex align-items-center gap-2 flex-grow-1">
                        <i class="bi bi-arrows-move text-muted cursor-move"></i>
                        <input type="text" class="form-control fw-bold border-0 bg-transparent text-primary" style="font-size:1.1rem; box-shadow:none;" value="\${cat.tab}" onchange="actualizarCategoriaConfigInsp(\${catIdx}, this.value)" placeholder="Nombre de la Categoría">
                    </div>
                    <button class="btn btn-sm btn-outline-danger ms-2" onclick="eliminarCategoriaConfigInsp(\${catIdx})"><i class="bi bi-trash"></i> Eliminar</button>
                </div>
                <div class="card-body bg-light rounded-bottom p-3">
                    <div id="items-container-\${catIdx}" class="items-sortable">
                        \${itemsHtml}
                    </div>
                    <button class="btn btn-sm btn-outline-primary mt-2 fw-bold w-100 shadow-sm" onclick="agregarItemConfigInsp(\${catIdx})" style="border-style:dashed;"><i class="bi bi-plus-lg"></i> Agregar Ítem</button>
                </div>
            </div>
        \`;
    });
    if(window.DYNAMIC_INSP_SCHEMA.length === 0) {
        html = '<div class="text-center py-4 text-muted">No hay categorías configuradas. Crea una para empezar.</div>';
    }
    container.innerHTML = html;
};

window.agregarCategoriaConfigInsp = function() {
    window.DYNAMIC_INSP_SCHEMA.push({ tab: "NUEVA CATEGORÍA", template_id: 'cat_' + Date.now(), items: [] });
    renderConfigInspItems();
};
window.eliminarCategoriaConfigInsp = function(idx) {
    if(confirm("¿Seguro que deseas eliminar esta categoría entera?")) {
        window.DYNAMIC_INSP_SCHEMA.splice(idx, 1);
        renderConfigInspItems();
    }
};
window.actualizarCategoriaConfigInsp = function(idx, val) {
    if(window.DYNAMIC_INSP_SCHEMA[idx]) window.DYNAMIC_INSP_SCHEMA[idx].tab = val;
};
window.agregarItemConfigInsp = function(catIdx) {
    window.DYNAMIC_INSP_SCHEMA[catIdx].items.push({ label: "Nuevo Ítem", type: "okfalla" });
    renderConfigInspItems();
};
window.eliminarItemConfigInsp = function(catIdx, itemIdx) {
    window.DYNAMIC_INSP_SCHEMA[catIdx].items.splice(itemIdx, 1);
    renderConfigInspItems();
};
window.actualizarItemConfigInsp = function(catIdx, itemIdx, field, val) {
    let item = window.DYNAMIC_INSP_SCHEMA[catIdx].items[itemIdx];
    if(typeof item === 'string') {
        window.DYNAMIC_INSP_SCHEMA[catIdx].items[itemIdx] = { label: item, type: 'okfalla' };
        item = window.DYNAMIC_INSP_SCHEMA[catIdx].items[itemIdx];
    }
    item[field] = val;
};
window.guardarConfigInsp = function() {
    let payload = {
        templates: window.DYNAMIC_INSP_SCHEMA.map(cat => ({
            titulo: cat.tab,
            template_id: cat.template_id || ('cat_' + Date.now() + Math.floor(Math.random()*1000)),
            items_json: cat.items
        }))
    };
    fetch('/api/mantenimiento/inspecciones/config/guardar', {
        method: 'POST', headers:{'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    }).then(r=>r.json()).then(res => {
        if(res.ok) {
            bootstrap.Modal.getInstance(document.getElementById('modalConfigInsp')).hide();
            recargarModulo('statusMant');
        } else alert("Error guardando: " + res.error);
    });
};
`;

fileContent += "\n" + configLogic;

fs.writeFileSync('modulos/mantenimiento/inspecciones/logica.js', fileContent, 'utf8');
console.log("Logica de inspecciones updated");
