var vehiculosFlota = [];
var placasCatalogo = [];
var currentPlaca = null;
var currentFiltroKPI = 'total';

function init_documentos() {
    if (!window.checkPerm('docs_flota', 'l')) {
        var wrap = document.getElementById('moduloDocumentos') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    if (typeof window._cbOnSelect === 'function') {
        window._cbOnSelect('fd_placa', function(val) {
            autocompletarDatosPlaca(val);
        });
    }
    cargarDatosPlacasCatalogo();
    cargarDatosVehiculos();
}

function cargarDatosPlacasCatalogo() {
    fetch('/api/placas-lista')
    .then(r => r.json())
    .then(rows => {
        placasCatalogo = Array.isArray(rows) ? rows : [];
        actualizarDatalistPlacas();
    }).catch(e => console.error('Error cargando catálogo de placas:', e));
}

function actualizarDatalistPlacas() {
    let opciones = new Set();
    placasCatalogo.forEach(p => { if (p.placa) opciones.add(p.placa.toUpperCase()); });
    vehiculosFlota.forEach(v => { if (v.placa) opciones.add(v.placa.toUpperCase()); });
    
    let items = Array.from(opciones).sort().map(placa => ({ value: placa, label: placa }));
    
    if (typeof window._cbInit === 'function') {
        window._cbInit('fd_placa', items, 'BUSCAR PLACA...');
    }
}

// =========================================================================
// FILTROS AVANZADOS DOCS (ESTILO APPSHEET)
// =========================================================================

window.docFiltros = {}; // { colKey: Set(val1, val2...) }
window._columnaActivaFiltroDoc = null;

var DOC_COLUMNAS = [
    { key: 'placa', label: 'Placa' },
    { key: 'empresa', label: 'Cliente' },
    { key: 'marca', label: 'Marca' },
    { key: 'modelo', label: 'Modelo' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'color', label: 'Color' },
    { key: 'anio', label: 'Año' },
    { key: 'propiedad', label: 'Propiedad' }
];

window.abrirFiltrosDoc = function() {
    const contenedor = document.getElementById('lista-columnas-filtro');
    let html = '';
    
    for (let i = 0; i < DOC_COLUMNAS.length; i++) {
        let colDef = DOC_COLUMNAS[i];
        let seleccionados = window.docFiltros[colDef.key] ? window.docFiltros[colDef.key].size : 0;
        let badge = seleccionados > 0 ? `<span class="badge bg-primary rounded-pill">${seleccionados}</span>` : '';
        
        html += `
            <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3" 
                    style="background: transparent; color: var(--text); border-color: var(--border); cursor: pointer;"
                    onclick="window.entrarFiltroDetalleDoc('${colDef.key}', '${colDef.label}')">
                <span class="fw-bold" style="font-size: 0.95rem;">${colDef.label}</span>
                <div class="d-flex align-items-center gap-2">
                    ${badge}
                    <i class="bi bi-chevron-right text-muted"></i>
                </div>
            </button>
        `;
    }
    
    contenedor.innerHTML = html;
    
    document.getElementById('filtros-slider').style.transform = 'translateX(0)';
    document.getElementById('header-filtros-main').classList.remove('d-none');
    document.getElementById('footer-filtros-main').classList.remove('d-none');
    document.getElementById('header-filtros-detalle').classList.add('d-none');
    const bsOffcanvas = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('offcanvasFiltrosDoc'));
    bsOffcanvas.show();
};

window.entrarFiltroDetalleDoc = function(colKey, colName) {
    window._columnaActivaFiltroDoc = colKey;
    document.getElementById('titulo-columna-filtro').innerText = colName;
    document.getElementById('buscador-opciones-filtro').value = '';
    
    let valoresSet = new Set();
    vehiculosFlota.forEach(row => {
        let val = row[colKey] ? String(row[colKey]).trim() : '';
        if (val === '') val = '(Vacío)';
        valoresSet.add(val);
    });
    
    let valores = Array.from(valoresSet).sort();
    
    const contenedor = document.getElementById('lista-opciones-filtro');
    let html = '';
    
    let seleccionados = window.docFiltros[colKey] || new Set();
    
    valores.forEach(val => {
        let isChecked = seleccionados.has(val) ? 'checked' : '';
        let safeVal = val.replace(/[^a-zA-Z0-9]/g, '');
        html += `
            <div class="form-check py-2 border-bottom opt-filtro-item" style="border-color: var(--border) !important;">
                <input class="form-check-input" type="checkbox" value="${val}" id="chk-flt-${colKey}-${safeVal}" ${isChecked} onchange="window._toggleFiltroValorDoc('${colKey}', this.value, this.checked)" style="transform: scale(1.2); cursor: pointer;">
                <label class="form-check-label w-100 ms-2" for="chk-flt-${colKey}-${safeVal}" style="cursor: pointer; color: var(--text); font-size: 0.95rem;">
                    ${val}
                </label>
            </div>
        `;
    });
    
    contenedor.innerHTML = html;
    
    document.getElementById('header-filtros-main').classList.add('d-none');
    document.getElementById('footer-filtros-main').classList.add('d-none');
    document.getElementById('header-filtros-detalle').classList.remove('d-none');
    document.getElementById('filtros-slider').style.transform = 'translateX(-100%)';
};

window.filtrosDocNavAtras = function() {
    window.abrirFiltrosDoc();
};

window._toggleFiltroValorDoc = function(colKey, val, isChecked) {
    if (!window.docFiltros[colKey]) {
        window.docFiltros[colKey] = new Set();
    }
    if (isChecked) {
        window.docFiltros[colKey].add(val);
    } else {
        window.docFiltros[colKey].delete(val);
    }
    window.actualizarBadgeGlobalFiltrosDoc();
};

window.buscarEnFiltroOpciones = function(txt) {
    txt = txt.toLowerCase();
    const items = document.querySelectorAll('.opt-filtro-item');
    items.forEach(item => {
        const lbl = item.querySelector('label').innerText.toLowerCase();
        if (lbl.includes(txt)) {
            item.classList.remove('d-none');
        } else {
            item.classList.add('d-none');
        }
    });
};

window.limpiarFiltroColumnaActual = function() {
    let col = window._columnaActivaFiltroDoc;
    if (window.docFiltros[col]) {
        window.docFiltros[col].clear();
    }
    document.querySelectorAll('.opt-filtro-item input[type="checkbox"]').forEach(chk => {
        chk.checked = false;
    });
    window.actualizarBadgeGlobalFiltrosDoc();
};

window.limpiarTodosFiltrosDoc = function() {
    window.docFiltros = {};
    window.actualizarBadgeGlobalFiltrosDoc();
    filtrarListaLocal();
    bootstrap.Offcanvas.getInstance(document.getElementById('offcanvasFiltrosDoc')).hide();
};

window.actualizarBadgeGlobalFiltrosDoc = function() {
    let totalActivos = 0;
    for (let col in window.docFiltros) {
        if (window.docFiltros[col].size > 0) totalActivos++;
    }
    const badge = document.getElementById('badge-filtros-doc');
    if (badge) {
        if (totalActivos > 0) {
            badge.innerText = totalActivos;
            badge.classList.remove('d-none');
        } else {
            badge.classList.add('d-none');
        }
    }
};

function calcularEstado(fechaVencimiento) {
    if (!fechaVencimiento) return { text: 'Indefinido', class: 's-gray', color: '#94a3b8', bgClass: 'bg-gray', bdgClass: 'bdg-gray', score: -1, diff: null };
    
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    const ven = new Date(fechaVencimiento);
    ven.setHours(0,0,0,0);
    
    if(isNaN(ven.getTime())) return { text: 'Indefinido', class: 's-gray', color: '#94a3b8', bgClass: 'bg-gray', bdgClass: 'bdg-gray', score: -1, diff: null };

    const diffTime = ven.getTime() - hoy.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: 'Vencido', class: 's-red', color: '#ef4444', bgClass: 'bg-red', bdgClass: 'bdg-red', score: 0, diff: diffDays };
    if (diffDays <= 15) return { text: 'Crítico', class: 's-orange', color: '#ea580c', bgClass: 'bg-orange', bdgClass: 'bdg-red', score: 1, diff: diffDays };
    if (diffDays <= 30) return { text: 'Alerta', class: 's-yellow', color: '#f59e0b', bgClass: 'bg-yellow', bdgClass: 'bdg-red', score: 2, diff: diffDays };
    return { text: 'Vigente', class: 's-green', color: '#10b981', bgClass: 'bg-green', bdgClass: 'bdg-green', score: 3, diff: diffDays };
}

function formatearFechaVista(fechaIso) {
    if(!fechaIso) return '-';
    let d = new Date(fechaIso);
    if(isNaN(d.getTime())) return '-';
    if(d.getFullYear() === 2000 && d.getMonth() === 0) return '-';
    let day = d.getUTCDate().toString().padStart(2, '0');
    let month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}/${d.getUTCFullYear()}`;
}

function calcularMetadatos(v) {
    let docs = [
        calcularEstado(v.tc_vencimiento),
        calcularEstado(v.soat_vencimiento),
        calcularEstado(v.matpel_vencimiento),
        calcularEstado(v.rt_vencimiento),
        calcularEstado(v.boni_vencimiento),
        calcularEstado(v.sv_vencimiento),
        calcularEstado(v.sc_vencimiento),
        calcularEstado(v.fum_vencimiento),
        calcularEstado(v.ext_vencimiento)
    ];

    let docsRegistrados = 0;
    let docsVerdes = 0;
    let peorScore = 99;
    let peorEstado = { text: 'Ok', class: 's-green', color: '#10b981', bgClass: 'bg-green' };

    docs.forEach(est => {
        if (est.score !== -1) {
            docsRegistrados++;
            if (est.score === 3) docsVerdes++;
            if (est.score < peorScore) {
                peorScore = est.score;
                peorEstado = est;
            }
        }
    });

    let salud = docsRegistrados === 0 ? 0 : Math.round((docsVerdes / docsRegistrados) * 100);
    if(docsRegistrados === 0) peorEstado = { text: 'Sin Info', class: 's-gray', color: '#94a3b8', bgClass: 'bg-gray' };

    return { salud, peorEstado, docs };
}

function cargarDatosVehiculos() {
    var vList = document.getElementById('vehicle-list');
    if (vList) vList.innerHTML = '<div class="text-center" style="margin-top:2rem; color:#94a3b8;">Cargando flota...</div>';
    
    fetch('/api/vehiculos-flota?t=' + Date.now())
    .then(r => r.json())
    .then(rows => {
        vehiculosFlota = Array.isArray(rows) ? rows : [];
        vehiculosFlota.forEach(v => { v._meta = calcularMetadatos(v); });
        actualizarFiltroEmpresas();
        actualizarKPIs();
        renderizarListaLateral();
        renderizarMatriz();
        actualizarDatalistPlacas();
        
        if(currentPlaca) {
            const existe = vehiculosFlota.find(x => x.placa === currentPlaca);
            if(existe) seleccionarVehiculo(currentPlaca, true);
            else seleccionarVehiculo(vehiculosFlota.length > 0 ? vehiculosFlota[0].placa : null, true);
        } else if(vehiculosFlota.length > 0) {
            seleccionarVehiculo(vehiculosFlota[0].placa, true);
        } else {
            seleccionarVehiculo(null, true);
        }
    }).catch(e => {
        console.error(e);
        var vl = document.getElementById('vehicle-list');
        if (vl) vl.innerHTML = '<div class="text-center" style="margin-top:2rem;color:#ef4444;">Error al cargar</div>';
    });
}

function actualizarKPIs() {
    let t = 0, vig = 0, ale = 0, ven = 0, sinDoc = 0;
    
    vehiculosFlota.forEach(v => {
        let matchAvanzado = true;
        if (window.docFiltros) {
            for (let colKey in window.docFiltros) {
                let setVals = window.docFiltros[colKey];
                if (setVals && setVals.size > 0) {
                    let vVal = v[colKey] ? String(v[colKey]).trim() : '';
                    if (vVal === '') vVal = '(Vacío)';
                    if (!setVals.has(vVal)) {
                        matchAvanzado = false;
                        break;
                    }
                }
            }
        }
        if(!matchAvanzado) return;
        
        t++;
        if(v._meta.peorEstado.score === -1 || v._meta.salud === 0) sinDoc++;
        else if(v._meta.peorEstado.score === 3) vig++;
        else if(v._meta.peorEstado.score === 2 || v._meta.peorEstado.score === 1) ale++;
        else if(v._meta.peorEstado.score === 0) ven++;
    });

    var setTxt = function(id, val) { var e = document.getElementById(id); if (e) e.innerText = val; };
    setTxt('kpi-total', t);
    setTxt('kpi-vigente', vig);
    setTxt('kpi-alerta', ale);
    setTxt('kpi-vencido', ven);
    setTxt('kpi-sin-doc', sinDoc);
}

function filtrarKPI(tipo, element) {
    document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active'));
    element.classList.add('active');
    currentFiltroKPI = tipo;
    renderizarListaLateral();
    renderizarMatriz();
}

function filtrarListaLocal() {
    actualizarKPIs();
    renderizarListaLateral();
    renderizarMatriz();
}

function actualizarFiltroEmpresas() {
    let sel = document.getElementById('fleet-empresa-select');
    if(!sel) return;
    let current = sel.value;
    let empresas = new Set();
    vehiculosFlota.forEach(v => { if(v.empresa) empresas.add(v.empresa.trim()); });
    
    let html = '<option value="">Todas las empresas</option>';
    Array.from(empresas).sort().forEach(emp => {
        html += `<option value="${emp}">${emp}</option>`;
    });
    sel.innerHTML = html;
    if(empresas.has(current)) sel.value = current;
}

function renderizarListaLateral() {
    const listDiv = document.getElementById('vehicle-list');
    if (!listDiv) return;
    const searchEl = document.getElementById('fleet-search');
    const term = searchEl ? (searchEl.value || '').toLowerCase() : '';
    
    let html = '';
    
    let filtrados = vehiculosFlota.filter(v => {
        let matchTerm = v.placa.toLowerCase().includes(term) || (v.tipo || '').toLowerCase().includes(term);
        
        let matchAvanzado = true;
        if (window.docFiltros) {
            for (let colKey in window.docFiltros) {
                let setVals = window.docFiltros[colKey];
                if (setVals && setVals.size > 0) {
                    let vVal = v[colKey] ? String(v[colKey]).trim() : '';
                    if (vVal === '') vVal = '(Vacío)';
                    if (!setVals.has(vVal)) {
                        matchAvanzado = false;
                        break;
                    }
                }
            }
        }
        
        let matchKpi = true;
        if(currentFiltroKPI === 'vigente') matchKpi = (v._meta.peorEstado.score === 3);
        else if(currentFiltroKPI === 'alerta') matchKpi = (v._meta.peorEstado.score === 1 || v._meta.peorEstado.score === 2);
        else if(currentFiltroKPI === 'vencido') matchKpi = (v._meta.peorEstado.score === 0);
        else if(currentFiltroKPI === 'sin-doc') matchKpi = (v._meta.peorEstado.score === -1 || v._meta.salud === 0);
        
        return matchTerm && matchAvanzado && matchKpi;
    });

    if(filtrados.length === 0) {
        listDiv.innerHTML = '<div class="text-center" style="margin-top:2rem; font-size:0.9rem; color:#94a3b8;">No se encontraron vehículos.</div>';
        return;
    }

    filtrados.forEach(v => {
        let selCls = (currentPlaca === v.placa) ? 'selected' : '';
        html += `
        <div class="vehicle-item ${selCls}" onclick="seleccionarVehiculo('${v.placa}')" id="vi-${v.placa}">
            <div class="v-icon-circle"><i class="bi bi-arrow-left-right"></i></div>
            <div class="v-info">
                <span class="v-plate">${v.placa}</span>
                <span class="v-type">${v.tipo || '---'}</span>
            </div>
            <div class="status-dot ${v._meta.peorEstado.bgClass}"></div>
        </div>`;
    });
    
    listDiv.innerHTML = html;
}

function seleccionarVehiculo(placa, isInitialLoad = false) {
    document.querySelectorAll('.vehicle-item').forEach(el => el.classList.remove('selected'));
    if(placa) {
        const el = document.getElementById(`vi-${placa}`);
        if(el) el.classList.add('selected');
    }
    
    currentPlaca = placa;
    
    const rcw = document.getElementById('right-content-wrapper');
    const esp = document.getElementById('empty-state-panel');
    
    if(!placa) {
        if (rcw) rcw.style.display = 'none';
        if (esp) esp.style.display = 'flex';
        return;
    }
    
    if (rcw) rcw.style.display = 'flex';
    if (esp) esp.style.display = 'none';
    const splitContainer = document.querySelector('.fleet-main-split');
    if(splitContainer) {
        if (isInitialLoad && window.innerWidth <= 768) { /* Do not auto-open on mobile load */ }
        else { 
            splitContainer.classList.add('show-detail');
            const fmc = document.getElementById('fleet-module-container');
            if (fmc) fmc.classList.add('show-detail-mobile');
            const fab = document.querySelector('.mobile-fab-plus');
            if(fab) fab.style.display = 'none'; 
        }
    }
    const v = vehiculosFlota.find(x => x.placa === placa);
    if(!v) return;

    // Ficha Header defensivo
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val || ''; };
    setTxt('ft-placa', v.placa);
    document.getElementById('ft-tipo').innerText = v.tipo || '---';
    document.getElementById('ft-marca-modelo').innerText = `${v.marca || '---'} - ${v.modelo || '---'}`;
    document.getElementById('ft-anio').innerText = v.anio || '---';
    document.getElementById('ft-chasis').innerText = v.chasis || '---';
    
    document.getElementById('ft-health-bar').style.width = `${v._meta.salud}%`;
    
    let detEstTexto = (v._meta.peorEstado.score === 3) ? 'VIGENTE' : (v._meta.peorEstado.score === 0 ? 'VENCIDO' : 'ALERTA');
    let detEstColor = (v._meta.peorEstado.score === 3) ? '#10b981' : (v._meta.peorEstado.score === 0 ? '#ef4444' : '#f59e0b');
    let detEstBg = (v._meta.peorEstado.score === 3) ? '#f0fdf4' : (v._meta.peorEstado.score === 0 ? '#fef2f2' : '#fffbeb');
    
    const placaMovil = document.getElementById('ft-placa-movil');
    if (placaMovil) {
        let badgeHTMLMovil = `<span style="display:inline-block; background:${detEstBg}; color:${detEstColor}; padding:0.2rem 0.6rem; border-radius:12px; font-size:0.65rem; font-weight:800; margin-left:0.5rem; vertical-align:middle;">${detEstTexto}</span>`;
        placaMovil.innerHTML = v.placa + badgeHTMLMovil;
        document.getElementById('ft-marca-modelo-movil').innerText = `${v.empresa || ''} - ${v.modelo || ''}`;
        document.getElementById('ft-anio-movil').innerText = v.anio || '---';
        document.getElementById('ft-health-txt-movil').innerText = `${Math.round(v._meta.salud)}%`;
        document.getElementById('ft-health-bar-movil').style.width = `${v._meta.salud}%`;
    }
    document.getElementById('ft-health-txt').innerText = `${v._meta.salud}%`;

    // Renderizar tarjetas de documentos exactas a la imagen
    const m = v._meta.docs;
    
    const renderCard = (id, title, num, bgClass, contentRows, est, docUrl) => {
        let rowsHtml = '';
        contentRows.forEach(row => {
            rowsHtml += `
            <div class="doc-row">
                <span class="doc-label">${row.label}</span>
                <span class="doc-value">${row.val}</span>
            </div>`;
        });
        
        let estHtml = `<span class="footer-label">ESTADO</span>`;
        if(est.diff !== null) {
            let labelText = '';
            if (est.diff < 0) {
                labelText = `Vencido hace ${Math.abs(est.diff)} días`;
            } else if (est.diff === 0) {
                labelText = `Vence hoy (Alerta)`;
            } else if (est.diff <= 30) {
                labelText = `Faltan ${est.diff} días (${est.text})`;
            } else {
                labelText = `Faltan ${est.diff} días (${est.text})`;
            }
            estHtml += `<span class="footer-status ${est.class}">${labelText}</span>`;
        } else {
            estHtml += `<span class="footer-status" style="color:#94a3b8;">-</span>`;
        }

        let html = `
        <div class="doc-card-header">
            <div class="num-circle ${bgClass}">${num}</div>
            ${title}
        </div>
        <div class="doc-card-body">
            ${rowsHtml}
        </div>
        <div class="doc-card-footer">
            ${estHtml}
        </div>`;
        
        const cardEl = document.getElementById(id);
        cardEl.innerHTML = html;
        
        let shadowColor = '';
        if (est.class === 's-green') shadowColor = 'rgba(16, 185, 129, 0.4)';
        else if (est.class === 's-yellow' || est.class === 's-orange') shadowColor = 'rgba(245, 158, 11, 0.4)';
        else if (est.class === 's-red') shadowColor = 'rgba(239, 68, 68, 0.4)';
        else shadowColor = 'rgba(148, 163, 184, 0.2)';

        if (shadowColor) {
            cardEl.style.boxShadow = `0 4px 6px -1px ${shadowColor}, 0 2px 4px -2px ${shadowColor}`;
            if (est.class === 's-green') cardEl.style.border = '1px solid #10b981';
            else if (est.class === 's-yellow' || est.class === 's-orange') cardEl.style.border = '1px solid #f59e0b';
            else if (est.class === 's-red') cardEl.style.border = '1px solid #ef4444';
            else cardEl.style.border = '1px solid #e2e8f0';
        }
        
        cardEl.style.cursor = 'pointer';
        cardEl.onclick = () => window.abrirDocModal(title, contentRows, est, docUrl);
    };

    renderCard('card-tc', 'TARJ. CIRC...', 1, 'bg-c1', [
        {label: 'N°', val: v.tc_constancia||'---'},
        {label: 'Vencimiento', val: formatearFechaVista(v.tc_vencimiento)}
    ], m[0], v.tc_url);
    
    renderCard('card-soat', 'SOAT', 2, 'bg-c2', [
        {label: 'Entidad', val: v.soat_entidad||'---'},
        {label: 'Pago', val: v.soat_pago||'---'},
        {label: 'Vencimiento', val: formatearFechaVista(v.soat_vencimiento)}
    ], m[1], v.soat_url);
        
    renderCard('card-matpel', 'MATPEL', 3, 'bg-c3', [
        {label: 'N°', val: v.matpel_constancia||'---'},
        {label: 'Vencimiento', val: formatearFechaVista(v.matpel_vencimiento)}
    ], m[2], v.matpel_url);
        
    renderCard('card-rt', 'REV. TÉCN...', 4, 'bg-c4', [
        {label: 'Emisión', val: formatearFechaVista(v.rt_emision)},
        {label: 'Vencimiento', val: formatearFechaVista(v.rt_vencimiento)}
    ], m[3], v.rt_url);
        
    renderCard('card-boni', 'BONIFICA...', 5, 'bg-c5', [
        {label: 'Emisión', val: formatearFechaVista(v.boni_emision)},
        {label: 'Vencimiento', val: formatearFechaVista(v.boni_vencimiento)}
    ], m[4], v.boni_url);
        
    renderCard('card-sv', 'SEG. VEHI...', 6, 'bg-c6', [
        {label: 'Entidad', val: v.sv_entidad||'---'},
        {label: 'Asesor', val: v.sv_asesor||'---'},
        {label: 'Vencimiento', val: formatearFechaVista(v.sv_vencimiento)}
    ], m[5], v.sv_url);
        
    renderCard('card-sc', 'SEG. CAR...', 7, 'bg-c7', [
        {label: 'Entidad', val: v.sc_entidad||'---'},
        {label: 'Asesor', val: v.sc_asesor||'---'},
        {label: 'Vencimiento', val: formatearFechaVista(v.sc_vencimiento)}
    ], m[6], v.sc_url);
        
    renderCard('card-fum', 'FUMIGACI...', 8, 'bg-c8', [
        {label: 'Emisión', val: formatearFechaVista(v.fum_emision)},
        {label: 'Vencimiento', val: formatearFechaVista(v.fum_vencimiento)}
    ], m[7], v.fum_url);
        
    renderCard('card-ext', 'EXTINTOR...', 9, 'bg-c9', [
        {label: 'Cantidad', val: v.ext_cantidad||1},
        {label: 'Emisión', val: formatearFechaVista(v.ext_emision)},
        {label: 'Vencimiento', val: formatearFechaVista(v.ext_vencimiento)}
    ], m[8], v.ext_url);
}

function renderizarMatriz() {
    const tbody = document.getElementById('matriz-body');
    let html = '';
    let filtrados = vehiculosFlota;

    const term = (document.getElementById('fleet-search').value || '').toLowerCase();
    filtrados = vehiculosFlota.filter(v => {
        let matchTerm = v.placa.toLowerCase().includes(term) || (v.tipo || '').toLowerCase().includes(term);
        
        let matchAvanzado = true;
        if (window.docFiltros) {
            for (let colKey in window.docFiltros) {
                let setVals = window.docFiltros[colKey];
                if (setVals && setVals.size > 0) {
                    let vVal = v[colKey] ? String(v[colKey]).trim() : '';
                    if (vVal === '') vVal = '(Vacío)';
                    if (!setVals.has(vVal)) {
                        matchAvanzado = false;
                        break;
                    }
                }
            }
        }
        
        let matchKpi = true;
        if(currentFiltroKPI === 'vigente') matchKpi = (v._meta.peorEstado.score === 3);
        else if(currentFiltroKPI === 'alerta') matchKpi = (v._meta.peorEstado.score === 1 || v._meta.peorEstado.score === 2);
        else if(currentFiltroKPI === 'vencido') matchKpi = (v._meta.peorEstado.score === 0);
        
        return matchTerm && matchAvanzado && matchKpi;
    });

    if(filtrados.length === 0){
        tbody.innerHTML = '<tr><td colspan="41" class="text-center" style="color:#94a3b8; padding:2rem;">No hay datos para mostrar en la matriz.</td></tr>';
        return;
    }

    filtrados.forEach((v, i) => {
        const m = v._meta.docs;
        const eD = (obj) => {
            if(!obj || obj.diff === null) return `<span class="badge-dias bdg-gray">-</span>`;
            return `<span class="badge-dias ${obj.bdgClass}">${obj.diff}</span>`;
        };
        const fB = (f) => {
            let fv = formatearFechaVista(f);
            if (fv !== '-') return `<span class="date-purple">${fv}</span>`;
            return fv;
        };

        html += `
        <tr>
            <td class="sticky-col" style="border-right: none; color:#94a3b8;">${i+1}</td>
            <td class="sticky-col-2">${v.placa}</td>
            <td>${v.propiedad||''}</td>
            <td>${v.empresa||''}</td>
            <td>${formatearFechaVista(v.fecha_entrega)}</td>
            <td>${v.tipo||''}</td>
            <td>${v.anio||''}</td>
            <td>${v.modelo||''}</td>
            <td>${v.color||''}</td>
            <td>${v.marca||''}</td>
            <td>${v.chasis||''}</td>
            
            <td>${v.tc_constancia||''}</td>
            <td>${fB(v.tc_vencimiento)}</td>
            <td>${eD(m[0])}</td>
            
            <td>${v.soat_entidad||''}</td>
            <td class="text-right">${v.soat_pago||''}</td>
            <td>${fB(v.soat_vencimiento)}</td>
            <td>${eD(m[1])}</td>

            <td>${v.matpel_constancia||''}</td>
            <td>${fB(v.matpel_vencimiento)}</td>
            <td>${eD(m[2])}</td>

            <td>${formatearFechaVista(v.rt_emision)}</td>
            <td>${fB(v.rt_vencimiento)}</td>
            <td>${eD(m[3])}</td>

            <td>${formatearFechaVista(v.boni_emision)}</td>
            <td>${fB(v.boni_vencimiento)}</td>
            <td>${eD(m[4])}</td>

            <td>${v.sv_entidad||''}</td>
            <td>${v.sv_asesor||''}</td>
            <td>${fB(v.sv_vencimiento)}</td>
            <td>${eD(m[5])}</td>

            <td>${v.sc_entidad||''}</td>
            <td>${v.sc_asesor||''}</td>
            <td>${fB(v.sc_vencimiento)}</td>
            <td>${eD(m[6])}</td>

            <td>${formatearFechaVista(v.fum_emision)}</td>
            <td>${fB(v.fum_vencimiento)}</td>
            <td>${eD(m[7])}</td>

            <td>${v.ext_cantidad||1}</td>
            <td>${formatearFechaVista(v.ext_emision)}</td>
            <td>${fB(v.ext_vencimiento)}</td>
            <td>${eD(m[8])}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

// Modal Logic
function switchTab(index, element) {
    document.querySelectorAll('.fm-tab').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${index}`).classList.add('active');
}

function abrirModalEdicion(placa) {
    document.getElementById('formVehiculoFlota').reset();
    
    // Configurar combobox de placa
    if (window._cbReset) window._cbReset('fd_placa');
    var txtEl = document.getElementById('fd_placa-txt');
    if (placa) {
        if (window._cbSet) window._cbSet('fd_placa', placa, placa);
        if (txtEl) txtEl.readOnly = true;
    } else {
        if (txtEl) txtEl.readOnly = false;
    }
    
    switchTab(0, document.querySelector('.fm-tab'));

    // Helper: sincroniza campo hidden + boton Ver + boton Eliminar para cada documento
    var _setDocUrl = function(key, url) {
        var hidEl  = document.getElementById('f_' + key + '_url');
        var lnkEl  = document.getElementById('link_' + key);
        var delEl  = document.getElementById('del_' + key);
        var fileEl = document.getElementById('file_' + key);
        if (hidEl)  hidEl.value = url || '';
        if (fileEl) fileEl.value = '';   // limpiar cualquier archivo seleccionado previo
        if (url) {
            if (lnkEl) { lnkEl.href = url; lnkEl.style.display = 'inline-flex'; }
            if (delEl) delEl.style.display = 'inline-flex';
        } else {
            if (lnkEl) { lnkEl.href = '#'; lnkEl.style.display = 'none'; }
            if (delEl) delEl.style.display = 'none';
        }
    };

    // Limpiar visualmente todos los archivos
    ['tc', 'soat', 'matpel', 'rt', 'boni', 'sv', 'sc', 'fum', 'ext'].forEach(function(k) {
        _setDocUrl(k, null);
    });

    if(placa) {
        const v = vehiculosFlota.find(x => x.placa === placa);
        if(v) {
            document.getElementById('f_tipo').value = v.tipo || '';
            document.getElementById('f_propiedad').value = v.propiedad || '';
            document.getElementById('f_empresa').value = v.empresa || '';
            document.getElementById('f_marca').value = v.marca || '';
            document.getElementById('f_modelo').value = v.modelo || '';
            document.getElementById('f_anio').value = v.anio || '';
            document.getElementById('f_color').value = v.color || '';
            document.getElementById('f_chasis').value = v.chasis || '';
            document.getElementById('f_fecha_entrega').value = (v.fecha_entrega||'').split('T')[0];
            
            document.getElementById('f_tc_constancia').value = v.tc_constancia || '';
            document.getElementById('f_tc_vencimiento').value = (v.tc_vencimiento||'').split('T')[0];
            
            document.getElementById('f_soat_entidad').value = v.soat_entidad || '';
            document.getElementById('f_soat_pago').value = v.soat_pago || '';
            document.getElementById('f_soat_vencimiento').value = (v.soat_vencimiento||'').split('T')[0];
            
            document.getElementById('f_matpel_constancia').value = v.matpel_constancia || '';
            document.getElementById('f_matpel_vencimiento').value = (v.matpel_vencimiento||'').split('T')[0];
            
            document.getElementById('f_rt_emision').value = (v.rt_emision||'').split('T')[0];
            document.getElementById('f_rt_vencimiento').value = (v.rt_vencimiento||'').split('T')[0];
            
            document.getElementById('f_boni_emision').value = (v.boni_emision||'').split('T')[0];
            document.getElementById('f_boni_vencimiento').value = (v.boni_vencimiento||'').split('T')[0];
            
            document.getElementById('f_sv_entidad').value = v.sv_entidad || '';
            document.getElementById('f_sv_asesor').value = v.sv_asesor || '';
            document.getElementById('f_sv_vencimiento').value = (v.sv_vencimiento||'').split('T')[0];
            
            document.getElementById('f_sc_entidad').value = v.sc_entidad || '';
            document.getElementById('f_sc_asesor').value = v.sc_asesor || '';
            document.getElementById('f_sc_vencimiento').value = (v.sc_vencimiento||'').split('T')[0];
            
            document.getElementById('f_fum_emision').value = (v.fum_emision||'').split('T')[0];
            document.getElementById('f_fum_vencimiento').value = (v.fum_vencimiento||'').split('T')[0];
            
            document.getElementById('f_ext_cantidad').value = v.ext_cantidad || 1;
            document.getElementById('f_ext_emision').value = (v.ext_emision||'').split('T')[0];
            document.getElementById('f_ext_vencimiento').value = (v.ext_vencimiento||'').split('T')[0];

            _setDocUrl('tc',     v.tc_url);
            _setDocUrl('soat',   v.soat_url);
            _setDocUrl('matpel', v.matpel_url);
            _setDocUrl('rt',     v.rt_url);
            _setDocUrl('boni',   v.boni_url);
            _setDocUrl('sv',     v.sv_url);
            _setDocUrl('sc',     v.sc_url);
            _setDocUrl('fum',    v.fum_url);
            _setDocUrl('ext',    v.ext_url);

        }
    }
    
    document.getElementById('modalEdicionVehiculo').style.display = 'flex';
}

function autocompletarDatosPlaca(placaSeleccionada) {
    if(!placaSeleccionada) {
        document.getElementById('formVehiculoFlota').reset();
        return;
    }
    
    // 1. Ver si ya está en vehiculosFlota (editar)
    const v = vehiculosFlota.find(x => x.placa === placaSeleccionada);
    if(v) {
        abrirModalEdicion(placaSeleccionada);
        return;
    }

    // 2. Si no, llenar con datos del catálogo
    const p = placasCatalogo.find(x => x.placa === placaSeleccionada);
    if(p) {
        // Handle "tipo de unidad" mapping safely (accents and variations)
        let tipoStr = (p.tipo || p.modelo_uts || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        document.getElementById('f_tipo').value = p.tipo || '';

        document.getElementById('f_propiedad').value = p.propiedad || 'PROPIA';
        document.getElementById('f_empresa').value = p.cliente || p.empresa || 'MARSISA';
        document.getElementById('f_marca').value = p.marca || '';
        document.getElementById('f_modelo').value = p.modelo_uts || p.modelo || '';
        document.getElementById('f_anio').value = p.anio || '';
        document.getElementById('f_color').value = p.color || '';
        document.getElementById('f_chasis').value = p.nro_vin || p.chasis_vin || p.chasis || '';
        document.getElementById('f_fecha_entrega').value = (p.fecha_ingreso || p.fecha_entrega || '').split('T')[0];
    }
}

function cerrarModalEdicion() {
    document.getElementById('modalEdicionVehiculo').style.display = 'none';
}

function guardarVehiculo() {
    const placa = (document.getElementById('fd_placa')||{}).value;
    if(!placa || !placa.trim()) return alert('La placa es obligatoria');

    const data = {
        placa: placa.trim().toUpperCase(),
        tipo: document.getElementById('f_tipo').value,
        propiedad: document.getElementById('f_propiedad').value,
        empresa: document.getElementById('f_empresa').value,
        marca: document.getElementById('f_marca').value,
        modelo: document.getElementById('f_modelo').value,
        anio: document.getElementById('f_anio').value,
        color: document.getElementById('f_color').value,
        chasis: document.getElementById('f_chasis').value,
        fecha_entrega: document.getElementById('f_fecha_entrega').value,
        tc_vencimiento: document.getElementById('f_tc_vencimiento').value,
        tc_constancia: document.getElementById('f_tc_constancia').value,
        soat_entidad: document.getElementById('f_soat_entidad').value,
        soat_pago: document.getElementById('f_soat_pago').value,
        soat_vencimiento: document.getElementById('f_soat_vencimiento').value,
        matpel_constancia: document.getElementById('f_matpel_constancia').value,
        matpel_vencimiento: document.getElementById('f_matpel_vencimiento').value,
        rt_emision: document.getElementById('f_rt_emision').value,
        rt_vencimiento: document.getElementById('f_rt_vencimiento').value,
        boni_emision: document.getElementById('f_boni_emision').value,
        boni_vencimiento: document.getElementById('f_boni_vencimiento').value,
        sv_entidad: document.getElementById('f_sv_entidad').value,
        sv_asesor: document.getElementById('f_sv_asesor').value,
        sv_vencimiento: document.getElementById('f_sv_vencimiento').value,
        sc_entidad: document.getElementById('f_sc_entidad').value,
        sc_asesor: document.getElementById('f_sc_asesor').value,
        sc_vencimiento: document.getElementById('f_sc_vencimiento').value,
        fum_emision: document.getElementById('f_fum_emision').value,
        fum_vencimiento: document.getElementById('f_fum_vencimiento').value,
        ext_cantidad: document.getElementById('f_ext_cantidad').value,
        ext_emision: document.getElementById('f_ext_emision').value,
        ext_vencimiento: document.getElementById('f_ext_vencimiento').value,
        tc_url: document.getElementById('f_tc_url').value,
        soat_url: document.getElementById('f_soat_url').value,
        matpel_url: document.getElementById('f_matpel_url').value,
        rt_url: document.getElementById('f_rt_url').value,
        boni_url: document.getElementById('f_boni_url').value,
        sv_url: document.getElementById('f_sv_url').value,
        sc_url: document.getElementById('f_sc_url').value,
        fum_url: document.getElementById('f_fum_url').value,
        ext_url: document.getElementById('f_ext_url').value,
    };

    fetch('/api/vehiculos-flota', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) })
    .then(r => r.json())
    .then(r => {
        if(r.ok) {
            cerrarModalEdicion();
            cargarDatosVehiculos();
        } else {
            alert(r.error || 'Error al guardar');
        }
    }).catch(e => console.error(e));
}

function eliminarVehiculoActual() {
    if(!currentPlaca) return;
    if(confirm(`¿Estás seguro de eliminar el expediente del vehículo ${currentPlaca}? Esta acción es irreversible.`)) {
        fetch('/api/vehiculos-flota/' + encodeURIComponent(currentPlaca), { method: 'DELETE' })
        .then(r => r.json())
        .then(() => { currentPlaca = null; cargarDatosVehiculos(); });
    }
}

function exportarExcel() {
    if (typeof XLSX === 'undefined') return alert("XLSX no cargado");
    let wb = XLSX.utils.table_to_book(document.getElementById('tabla-matriz'), {sheet: "Control Flota"});
    XLSX.writeFile(wb, "Control_Documentos_Flota.xlsx");
}

// ── Importación Excel ────────────────────────────────────────────
window.descargarPlantillaVehiculos = function() {
    if (typeof XLSX === 'undefined') return alert("XLSX no cargado");
    const ws_data = [
        [
            'PLACA', 'TIPO', 'PROPIEDAD', 'EMPRESA', 'F. ENTREGA', 'AÑO', 'MODELO', 'COLOR', 'MARCA', 'SERIE/CHASIS',
            'TC N° CONST.', 'TC F. VENC.',
            'SOAT ENTIDAD', 'SOAT PAGO', 'SOAT F. VENC.',
            'MATPEL N° CONST.', 'MATPEL F. VENC.',
            'RT F. EMISIÓN', 'RT F. VENC.',
            'BONI F. EMISIÓN', 'BONI F. VENC.',
            'SV ENTIDAD', 'SV ASESOR', 'SV F. VENC.',
            'SC ENTIDAD', 'SC ASESOR', 'SC F. VENC.',
            'FUM F. EMISIÓN', 'FUM F. VENC.',
            'EXT CANTIDAD', 'EXT F. EMISIÓN', 'EXT F. VENC.'
        ],
        [
            'ABC-123', 'CAMION', 'PROPIA', 'MARSISA', '2024-01-15', '2023', 'FMX', 'BLANCO', 'VOLVO', 'VIN1234567890',
            '123456', '2025-01-15',
            'PACIFICO', '120.50', '2025-01-15',
            'MAT-987', '2025-01-15',
            '2024-01-15', '2025-01-15',
            '2024-01-15', '2025-01-15',
            'MAPFRE', 'JUAN PEREZ', '2025-01-15',
            'RIMAC', 'MARIA GOMEZ', '2025-01-15',
            '2024-01-15', '2024-07-15',
            '1', '2024-01-15', '2025-01-15'
        ]
    ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla_Documentos_Flota");
    XLSX.writeFile(wb, "Plantilla_Documentos_Flota.xlsx");
};

window.importarExcelVehiculos = function(event) {
    if (typeof XLSX === 'undefined') return alert("XLSX no cargado");
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (rawJson.length === 0) {
            alert("El archivo Excel está vacío o no tiene datos válidos.");
            return;
        }

        const confirmacion = await (typeof window.confirmar === 'function'
            ? window.confirmar({ titulo: 'Importar Flota', mensaje: `Se importarán <strong>${rawJson.length} registros</strong>. ¿Continuar?`, textoConfirmar: 'Sí, importar' })
            : Promise.resolve(confirm(`Se importarán ${rawJson.length} registros.\n¿Continuar?`)));
            
        if (!confirmacion) { event.target.value = ''; return; }

        document.body.style.cursor = 'wait';

        fetch('/api/importarVehiculosFlotaMasivo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ registros: rawJson })
        })
        .then(res => res.json())
        .then(r => {
            document.body.style.cursor = 'default';
            event.target.value = '';
            let alertMsg = `✅ Importación completada.\nProcesados con éxito: ${r.ok}\nErrores/Omitidos: ${r.errores}`;
            if (r.msg) alertMsg += `\nDetalle del error: ${r.msg}`;
            alert(alertMsg);
            cargarDatosVehiculos();
        })
        .catch(err => {
            document.body.style.cursor = 'default';
            event.target.value = '';
            alert("❌ Error subiendo archivo: " + err.message);
        });
    };
    reader.readAsArrayBuffer(file);
};

window.subirDocumentoS3 = async function(input, hiddenId, linkId, docId) {
    if(!input.files || input.files.length === 0) return;
    const file = input.files[0];
    if(file.size > 25 * 1024 * 1024) return alert('El archivo es muy pesado (Máx 25MB)');
    
    const spin = document.getElementById('spin_' + docId);
    if(spin) spin.style.display = 'inline-block';
    
    try {
        const token = localStorage.getItem('token');
        const resUrl = await fetch('/api/documentos-flota/upload-url?filename=' + encodeURIComponent(file.name) + '&contentType=' + encodeURIComponent(file.type), {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const urlData = await resUrl.json();
        
        if(!urlData.uploadUrl) throw new Error(urlData.error || 'Error obteniendo URL');
        
        const resUp = await fetch(urlData.uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type }
        });
        
        if(!resUp.ok) throw new Error('Error al subir a S3');
        
        document.getElementById(hiddenId).value = urlData.fileUrl;
        var lnkEl = document.getElementById(linkId);
        if(lnkEl) {
            lnkEl.href = urlData.fileUrl;
            lnkEl.style.display = 'inline-flex';
        }
        const dLnkBtn = document.getElementById('del_' + docId);
        if(dLnkBtn) dLnkBtn.style.display = 'inline-flex';
        alert('Documento subido. Recuerda Guardar Configuración.');
    } catch(e) {
        console.error(e);
        alert('Error: ' + e.message);
    } finally {
        if(spin) spin.style.display = 'none';
        input.value = '';
    }
};

window.eliminarDocumentoS3 = async function(hiddenId, linkId, btnId, docId) {
    if(!confirm('¿Estás seguro de eliminar este documento físico?')) return;
    
    const url = document.getElementById(hiddenId).value;
    if(!url) return;
    
    const spin = document.getElementById('spin_' + docId);
    if(spin) spin.style.display = 'inline-block';
    
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/documentos-flota/delete?url=' + encodeURIComponent(url), {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if(!res.ok) throw new Error('Error al eliminar en servidor');
        
        document.getElementById(hiddenId).value = '';
        var lnkEl = document.getElementById(linkId);
        if(lnkEl) {
            lnkEl.href = '#';
            lnkEl.style.display = 'none';
        }
        document.getElementById(btnId).style.display = 'none';
        
        alert('Documento eliminado temporalmente. Recuerda hacer clic en "Guardar Configuración" para aplicar este cambio.');
    } catch (e) {
        console.error(e);
        alert(e.message);
    } finally {
        if(spin) spin.style.display = 'none';
    }
};


function volverListaMovil() {
    const splitContainer = document.querySelector('.fleet-main-split');
    if(splitContainer) splitContainer.classList.remove('show-detail');
    const moduleContainer = document.getElementById('fleet-module-container');
    if(moduleContainer) moduleContainer.classList.remove('show-detail-mobile');
    const fab = document.querySelector('.mobile-fab-plus');
    if(fab) fab.style.display = 'flex';
}

window.abrirDocModal = function(title, contentRows, est, docUrl) {
    window._lastDocTitle = title;
    document.getElementById('dm-title').innerText = title;
    
    let html = '';
    contentRows.forEach(row => {
        html += `<div class="doc-modal-row"><span class="doc-modal-label">${row.label}</span><span class="doc-modal-val">${row.val}</span></div>`;
    });
    
    if(est.diff !== null) {
        let labelText = '';
        if (est.diff < 0) labelText = `Vencido hace ${Math.abs(est.diff)} días (Crítico)`;
        else if (est.diff === 0) labelText = `Vence hoy (Alerta)`;
        else labelText = `Faltan ${est.diff} días (${est.text})`;
        
        let color = '#475569';
        if(est.class === 's-green') color = '#10b981';
        else if(est.class === 's-yellow' || est.class === 's-orange') color = '#f59e0b';
        else if(est.class === 's-red') color = '#ef4444';

        html += `<div class="doc-modal-row" style="margin-top:0.5rem;"><span class="doc-modal-label">Estado Actual:</span><span class="doc-modal-val" style="color:${color};">${labelText}</span></div>`;
    }
    
    document.getElementById('dm-data').innerHTML = html;
    
    const btnVer = document.getElementById('dm-btn-ver');
    const btnDescargar = document.getElementById('dm-btn-descargar');
    
    if (btnVer && btnDescargar) {
        if (docUrl) {
            btnVer.style.setProperty('display', 'flex', 'important');
            btnDescargar.style.setProperty('display', 'flex', 'important');
            btnVer.onclick = () => window.procesarDocumento(docUrl, 'ver');
            btnDescargar.onclick = () => window.procesarDocumento(docUrl, 'descargar');
        } else {
            btnVer.style.setProperty('display', 'none', 'important');
            btnDescargar.style.setProperty('display', 'none', 'important');
            btnVer.onclick = null;
            btnDescargar.onclick = null;
        }
    }

    window.cargarHistorialDocModal(title);
    document.getElementById('docModalOverlay').classList.add('active');
};

window.cargarHistorialDocModal = function(tipoDocNombre) {
    if (!tipoDocNombre && window._lastDocTitle) tipoDocNombre = window._lastDocTitle;
    var container = document.getElementById('dm-historial-container');
    if (!container || !currentPlaca) return;

    container.innerHTML = '<div class="text-muted small text-center py-2" style="font-size:0.75rem;"><i class="bi bi-hourglass-split me-1"></i> Cargando historial...</div>';

    fetch('/api/documentos-flota/historial/' + encodeURIComponent(currentPlaca))
        .then(r => r.json())
        .then(res => {
            if (!res.ok || !Array.isArray(res.historial) || res.historial.length === 0) {
                container.innerHTML = '<div class="text-muted small text-center py-2" style="font-size:0.75rem;">Sin historial de documentos anteriores.</div>';
                return;
            }
            var filtrados = res.historial;
            if (tipoDocNombre) {
                var cleanTipo = tipoDocNombre.toLowerCase().replace(/[^a-z0-9]/g, '');
                var match = res.historial.filter(h => String(h.tipo_documento||'').toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanTipo));
                if (match.length > 0) filtrados = match;
            }
            var html = '';
            filtrados.forEach(h => {
                var fVen = formatearFechaVista(h.fecha_vencimiento);
                var fEm = formatearFechaVista(h.fecha_emision);
                html += `
                    <div class="p-2 mb-1 border rounded bg-white d-flex align-items-center justify-content-between" style="font-size:0.75rem; border-color:#e2e8f0 !important;">
                        <div>
                            <span class="fw-bold text-dark">${h.tipo_documento}</span> 
                            ${h.nro_constancia ? `<span class="badge bg-light text-dark border ms-1">N° ${h.nro_constancia}</span>` : ''}
                            <div class="text-muted" style="font-size:0.7rem;">
                                <span>Emisión: ${fEm}</span> • <span>Vencimiento: ${fVen}</span>
                                ${h.entidad ? ` • <span>${h.entidad}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        })
        .catch(e => {
            console.error('Error cargando historial:', e);
            if (container) container.innerHTML = '<div class="text-muted small text-center py-2" style="font-size:0.75rem;">Sin registros anteriores.</div>';
        });
};

window.cerrarDocModal = function(e) {
    if(e && e.target !== document.getElementById('docModalOverlay')) return;
    document.getElementById('docModalOverlay').classList.remove('active');
};


window.procesarDocumento = function(docUrl, accion) {
    if (!docUrl) return;
    
    // Obtener presigned URL del nuevo endpoint
    fetch('/api/documentos-flota/presign-read', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
        },
        body: JSON.stringify({ urls: [docUrl] })
    })
    .then(r => r.json())
    .then(data => {
        const presigned = data[docUrl];
        if (!presigned || presigned.error) {
            alert('No se pudo obtener acceso al documento.');
            return;
        }
        
        if (accion === 'ver') {
            window.open(presigned, '_blank');
        } else if (accion === 'descargar') {
            const a = document.createElement('a');
            a.href = presigned;
            a.download = docUrl.split('/').pop() || 'documento.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    })
    .catch(e => {
        console.error('Error presigning document:', e);
        alert('Ocurrió un error al intentar acceder al documento.');
    });
};
