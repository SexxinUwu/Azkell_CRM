// ================================================================
// MÓDULO: REPORTE DE FALLAS MECÁNICAS (CHECKLIST F-MAN-001)
// Lógica aislada cargada dinámicamente por cargarModuloAislado
// ================================================================

window.dataGlobalChecklist = window.dataGlobalChecklist || [];
window.datosFiltradosChecklist = window.datosFiltradosChecklist || [];
var estadoFiltroActualChecklist = 'TODOS';
var fotosChecklistBase64 = [];
var canvasFirmaChecklist = null;
var ctxFirmaChecklist = null;
var estaFirmandoChecklist = false;

// ── DEFINICIÓN COMPLETA DE ÍTEMS F-MAN-001 SEGUNDO FORMATO FÍSICO ─────
window.SISTEMAS_TRACTO = {
    motor: [
        '01 Nivel de aceite motor', '02 Fugas de fluidos', '03 Filtro de aire', '04 Pérdida de potencia',
        '05 Compresora de aire', '06 Fajas, poleas, templadores', '07 Turbo', '08 Múltiple de escape',
        '09 Silenciador', '10 Cañerías de combustible'
    ],
    caja: [
        '11 Embrague', '12 Palanca de cambios', '13 Freno de Motor', '14 Ruido en la caja de cambios',
        '15 Ruido en las coronas', '16 Retenes de Corona', '17 Templadores, soportes', '18 Cardan y crucetas'
    ],
    refri: [
        '19 Nivel de refrigerante', '20 Fugas de refrigerante', '21 Tanque de expansión', '22 Temperatura elevada',
        '23 Radiador, intercooler', '24 Bomba de agua'
    ],
    direccion: [
        '25 Alineamiento y balanceo', '26 Servo, Sist. hidráulico', '27 Caja de dirección', '28 Barras y terminales'
    ],
    cabina: [
        '29 Tablero', '30 Lunas y parabrisas', '31 Suspensión de asiento', '32 Cinturones de seguridad',
        '33 Tablero e instrumentos', '34 Amortiguadores', '35 Tanques de combustible', '36 Puertas y manijas',
        '37 Timón', '38 Espejos laterales', '39 Soportes de cabina', '40 Control veloc. Crucero',
        '41 Accesorios en general', '42 Autoradio y antenas', '43 Quinta rueda', '44 OTROS'
    ]
};
var SISTEMAS_TRACTO = window.SISTEMAS_TRACTO;

window.SISTEMAS_REMOLQUE = {
    frenos: [
        '39 Revisar Zapatos', '40 Pulpo de Freno', '41 Tanque de Aire, líneas de aire', '42 Fugas de aire',
        '43 Secador de aire', '44 Rachet de Freno'
    ],
    carreta: [
        '45 Estado de triplay', '46 Estado de gebes de Puerta', '47 Filtración de Agua', '48 Pisos sin Oxido',
        '49 Tiro de Remolque', '50 Templadores, Muelles y Soporte'
    ],
    electrico: [
        '51 Luces en general', '52 Faros delanteros', '53 Neblineros', '54 Claxon, alarma de retroceso',
        '55 Trico y plumillas', '56 Baterías y bornes', '57 Testigos check engine', '58 Testigos ABS',
        '59 Aire acondicionado', '60 Calefacción', '61 Cortador de corriente', '62 Circulina', '63 Faro pirata'
    ],
    suspension: [
        '64 Amortiguadores', '65 Bolsas de aire', '66 Reg. de bolsas de aire', '67 Muelles y grilletes',
        '68 Abrazaderas y bujes', '69 Templador, balancines'
    ],
    furgon: [
        '70 Remaches de Triplay', '71 Filtraciones de Agua', '72 Gebes de Puerta', '73 Piso sin oxido', '74 Bisagras de puerta'
    ],
    llantas: [
        '75 Reparación de llantas', '76 Cambio de llantas', '77 Rotación de llantas', '78 Presión de aire',
        '79 Seguro de tuercas', '80 Llanta de repuesto', '81 Parachoques', '82 Tapabarros', '83 Escarpoint',
        '84 Nivel de Gas en el Visor', '85 Bocamazas y rodamientos', '86 Lubricación, engrase',
        '87 Aros, espárragos y tuercas', '88 Chasis'
    ],
    termoking: [
        '89 Porta conos', '90 Porta tacos', '91 Placas de rodaje', '92 Barra antiempotramiento',
        '93 Porta llantas', '94 Porta extintores', '95 Fajas de Ventilador', '96 OTROS'
    ]
};
var SISTEMAS_REMOLQUE = window.SISTEMAS_REMOLQUE;

// ── FUNCIÓN DE ARRANQUE DEL MÓDULO ──────────────────────────────
window.init_checklist = function() {
    if (!window.checkPerm('checklist', 'l')) {
        var wrap = document.getElementById('checklist-app') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }

    // Inicializar comboboxes de placas y conductores
    window.poblarPlacasChecklist();
    window.poblarConductoresChecklist();

    // Renderizar acordeones completos
    window.ckRenderizarTodosAcordeones();

    // Inicializar firma digital
    window.initCanvasFirmaChecklist();

    // Cargar tabla principal
    window.cargarTablaChecklist(true);
};

// ── POBLAR PLACAS ────────────────────────────────────────────────
window.poblarPlacasChecklist = function() {
    if (typeof window._cbInit !== 'function') return;
    const datos = window.dataGlobalPlacas || [];
    const tractos = [];
    const carretas = [];

    datos.forEach(f => {
        const placa = (f[0] || '').toString().trim();
        const tipo = (f[5] || '').toString().trim().toUpperCase();
        if (!placa || placa === 'PLACA') return;

        if (tipo.includes('CARRETA') || tipo.includes('SEMI') || tipo.includes('REMOLQUE')) {
            carretas.push({ value: placa, label: placa });
        } else {
            tractos.push({ value: placa, label: placa });
        }
    });

    window._cbInit('ck_placa_tracto', tractos, 'SELECCIONE PLACA...');
    window._cbInit('ck_placa_remolque', carretas, 'SELECCIONE CARRETA...');

    if (typeof window._cbOnSelect === 'function') {
        window._cbOnSelect('ck_placa_tracto', function(val, lbl) {
            const txtEl = document.getElementById('ck_placa_tracto-txt');
            if (txtEl) txtEl.value = val || lbl || '';
            window.ckSyncPlacaTracto();
        });
        window._cbOnSelect('ck_placa_remolque', function(val, lbl) {
            const txtEl = document.getElementById('ck_placa_remolque-txt');
            if (txtEl) txtEl.value = val || lbl || '';
            window.ckSyncPlacaRemolque();
        });
    }
};

// ── POBLAR CONDUCTORES ───────────────────────────────────────────
window.poblarConductoresChecklist = function() {
    if (typeof window._cbInit !== 'function') return;

    fetch('/api/conductores')
        .then(r => r.ok ? r.json() : [])
        .then(data => {
            const list = Array.isArray(data) ? data : (data.data || []);
            const itemsMap = new Map();

            list.forEach(c => {
                let nombre = typeof c === 'string' ? c : (c.nombres_apellidos || c.nombre || c.conductor || c.nombre_conductor || '');
                nombre = String(nombre).trim();
                if (nombre && !itemsMap.has(nombre.toUpperCase())) {
                    itemsMap.set(nombre.toUpperCase(), nombre);
                }
            });

            const items = [...itemsMap.values()].sort().map(n => ({ value: n, label: n }));
            window._cbInit('ck_conductor', items, 'Seleccione conductor…');
        })
        .catch(err => console.warn('Error poblando conductores:', err.message));
};

// ── RENDERIZAR TODOS LOS ACORDEONES ───────────────────────────────
window.ckRenderizarTodosAcordeones = function() {
    const accTracto = document.getElementById('accTractoGlobal');
    const accRemolque = document.getElementById('accRemolqueGlobal');

    if (accTracto) {
        let htmlT = '';
        const configT = [
            { key: 'motor', title: 'MOTOR', icon: 'bi-gear-fill', items: SISTEMAS_TRACTO.motor },
            { key: 'caja', title: 'CAJA-CORONAS', icon: 'bi-gear-wide-connected', items: SISTEMAS_TRACTO.caja },
            { key: 'refri', title: 'REFRIGERACION', icon: 'bi-thermometer-half', items: SISTEMAS_TRACTO.refri },
            { key: 'direccion', title: 'DIRECCION', icon: 'bi-compass', items: SISTEMAS_TRACTO.direccion },
            { key: 'cabina', title: 'CABINA Y CHASIS', icon: 'bi-truck-front', items: SISTEMAS_TRACTO.cabina }
        ];

        configT.forEach(c => {
            htmlT += window.ckGenerarAccordionCardHTML('Tracto', c.key, c.title, c.icon, c.items);
        });
        accTracto.innerHTML = htmlT;
    }

    if (accRemolque) {
        let htmlR = '';
        const configR = [
            { key: 'frenos', title: 'FRENOS', icon: 'bi-hand-index-thumb', items: SISTEMAS_REMOLQUE.frenos },
            { key: 'carreta', title: 'CARRETA', icon: 'bi-truck-flatbed', items: SISTEMAS_REMOLQUE.carreta },
            { key: 'electrico', title: 'SISTEMA ELECTRICO', icon: 'bi-lightning-charge', items: SISTEMAS_REMOLQUE.electrico },
            { key: 'suspension', title: 'SUSPENSION', icon: 'bi-arrows-expand', items: SISTEMAS_REMOLQUE.suspension },
            { key: 'furgon', title: 'FURGON', icon: 'bi-box-seam', items: SISTEMAS_REMOLQUE.furgon },
            { key: 'llantas', title: 'LLANTAS', icon: 'bi-vinyl', items: SISTEMAS_REMOLQUE.llantas },
            { key: 'termoking', title: 'TERMOKING', icon: 'bi-snow', items: SISTEMAS_REMOLQUE.termoking }
        ];

        configR.forEach(c => {
            htmlR += window.ckGenerarAccordionCardHTML('Remolque', c.key, c.title, c.icon, c.items);
        });
        accRemolque.innerHTML = htmlR;
    }
};

window.ckGenerarAccordionCardHTML = function(unidad, sysKey, title, iconClass, items) {
    const accordionId = `acc_${unidad}_${sysKey}`;
    const collapseId = `col_${unidad}_${sysKey}`;
    const isTracto = unidad === 'Tracto';
    const unitBadge = isTracto 
        ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle me-2" style="font-size:0.65rem;">TRACTO</span>`
        : `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle me-2" style="font-size:0.65rem;">REMOLQUE</span>`;

    let itemsHTML = '';
    items.forEach((itemTxt, idx) => {
        const itemId = `item_${unidad}_${sysKey}_${idx}`;
        itemsHTML += `
            <div class="ck-item-row border-bottom py-2 px-3 bg-white" data-item-text="${itemTxt.toUpperCase()}" id="row_${itemId}">
                <div class="form-check d-flex align-items-center justify-content-between">
                    <div class="flex-grow-1 d-flex align-items-center">
                        <input class="form-check-input me-2 ck-checkbox-item" type="checkbox" id="chk_${itemId}" onchange="window.ckOnToggleFalla('${itemId}', '${unidad}', '${sysKey}', '${itemTxt.replace(/'/g, "\\'")}')">
                        ${unitBadge}
                        <label class="form-check-label fw-bold text-dark style-sm cursor-pointer mb-0" for="chk_${itemId}" id="lbl_${itemId}">
                            ${itemTxt}
                        </label>
                    </div>
                    <span class="badge bg-secondary-subtle text-secondary small style-none d-none" id="tag_${itemId}">MARCADO</span>
                </div>
                <div class="ck-item-textarea-box mt-2 d-none" id="box_${itemId}">
                    <textarea class="form-control form-control-sm text-uppercase border-primary-subtle" id="txt_${itemId}" rows="2" placeholder="Describa la falla encontrada en ${unidad}..." oninput="window.ckActualizarChipsFallas()"></textarea>
                </div>
            </div>
        `;
    });

    return `
        <div class="accordion-item border rounded-3 mb-2 overflow-hidden shadow-2xs ck-accordion-group" id="group_${accordionId}">
            <h2 class="accordion-header">
                <button class="accordion-button collapsed fw-bold py-2 ${isTracto ? 'bg-light' : 'bg-warning-subtle bg-opacity-25'} text-dark shadow-none" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                    <i class="bi ${iconClass} me-2 ${isTracto ? 'text-primary' : 'text-warning-emphasis'}"></i> ${title}
                    <span class="badge bg-secondary rounded-pill ms-2 px-2 py-1 count-badge" id="cnt_${accordionId}">0</span>
                </button>
            </h2>
            <div id="${collapseId}" class="accordion-collapse collapse" data-bs-parent="#acc${unidad}Global">
                <div class="accordion-body p-0 border-top">
                    ${itemsHTML}
                </div>
            </div>
        </div>
    `;
};

// ── MANEJAR CHECKBOX DE FALLAS Y CHIPS ───────────────────────────
window.ckOnToggleFalla = function(itemId, unidad, sysKey, itemTxt) {
    const chk = document.getElementById(`chk_${itemId}`);
    const box = document.getElementById(`box_${itemId}`);
    const row = document.getElementById(`row_${itemId}`);

    if (chk && chk.checked) {
        if (box) box.classList.remove('d-none');
        if (row) row.classList.add('bg-warning', 'bg-opacity-10');
    } else {
        if (box) box.classList.add('d-none');
        if (row) row.classList.remove('bg-warning', 'bg-opacity-10');
    }

    window.ckActualizarContadores();
    window.ckActualizarChipsFallas();
};

window.ckActualizarContadores = function() {
    let totalMarcadas = 0;

    document.querySelectorAll('.ck-accordion-group').forEach(group => {
        const checkedInGroup = group.querySelectorAll('.ck-checkbox-item:checked').length;
        const cntBadge = group.querySelector('.count-badge');
        if (cntBadge) {
            cntBadge.textContent = checkedInGroup;
            if (checkedInGroup > 0) {
                cntBadge.className = 'badge bg-primary rounded-pill ms-2 px-2 py-1 count-badge';
            } else {
                cntBadge.className = 'badge bg-secondary rounded-pill ms-2 px-2 py-1 count-badge';
            }
        }
        totalMarcadas += checkedInGroup;
    });

    const cntManuales = document.querySelectorAll('.ck-manual-falla-row').length;
    totalMarcadas += cntManuales;

    const counterBtn = document.getElementById('ck_counter_fallas');
    if (counterBtn) {
        counterBtn.textContent = `${totalMarcadas} falla${totalMarcadas !== 1 ? 's' : ''} marcada${totalMarcadas !== 1 ? 's' : ''}`;
        counterBtn.className = totalMarcadas > 0 ? 'badge bg-primary px-3 py-2 fs-6 rounded-pill' : 'badge bg-secondary px-3 py-2 fs-6 rounded-pill';
    }
};

window.ckActualizarChipsFallas = function() {
    const wrapChips = document.getElementById('ck_chips_fallas_marcadas');
    if (!wrapChips) return;

    const p = window.ckObtenerPlacasSeleccionadas();
    let chipsHTML = '';

    document.querySelectorAll('.ck-checkbox-item:checked').forEach(chk => {
        const itemId = chk.id.replace('chk_', '');
        const lbl = document.getElementById(`lbl_${itemId}`);
        const txt = document.getElementById(`txt_${itemId}`);
        const numTxt = lbl ? lbl.innerText.trim() : 'Ítem';
        const numOnly = numTxt.split(' - ')[0] || numTxt;
        const desc = (txt && txt.value.trim()) ? txt.value.trim() : '(sin describir)';

        const isTracto = itemId.includes('_Tracto_');
        const unitTag = isTracto
            ? `<span class="badge bg-primary text-white text-uppercase px-2 py-1" style="font-size:0.68rem;"><i class="bi bi-truck me-1"></i>TRACTO ${p.placaTracto ? '('+p.placaTracto+')' : ''}</span>`
            : `<span class="badge bg-warning text-dark text-uppercase px-2 py-1" style="font-size:0.68rem;"><i class="bi bi-truck-flatbed me-1"></i>REMOLQUE ${p.placaRemolque ? '('+p.placaRemolque+')' : ''}</span>`;
        const cardBorder = isTracto ? 'border: 1px solid #93c5fd; background: #eff6ff;' : 'border: 1px solid #fde68a; background: #fffbeb;';

        chipsHTML += `
            <span class="d-inline-flex align-items-center gap-2 px-2 py-1 rounded-3 shadow-2xs" style="${cardBorder}">
                ${unitTag}
                <span class="fw-bold text-dark" style="font-size:0.8rem;">${numOnly}:</span>
                <span class="text-secondary small" style="font-size:0.78rem; max-width: 260px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${desc}</span>
                <i class="bi bi-x-circle-fill text-danger cursor-pointer ms-1 fs-6" title="Quitar falla" onclick="document.getElementById('chk_${itemId}').checked = false; window.ckOnToggleFalla('${itemId}', '${isTracto ? 'Tracto' : 'Remolque'}');"></i>
            </span>
        `;
    });

    if (chipsHTML) {
        wrapChips.style.display = 'flex';
        wrapChips.style.setProperty('display', 'flex', 'important');
        wrapChips.innerHTML = chipsHTML;
    } else {
        wrapChips.style.display = 'none';
        wrapChips.style.setProperty('display', 'none', 'important');
        wrapChips.innerHTML = '';
    }
};

// ── BÚSQUEDA EN VIVO (LIVE SEARCH KEYWORD) ────────────────────────
window.ckFiltrarItemsLive = function(query) {
    const q = (query || '').toUpperCase().trim();
    let matchesTracto = 0;
    let matchesRemolque = 0;

    document.querySelectorAll('.ck-accordion-group').forEach(group => {
        let matchCountInGroup = 0;
        const items = group.querySelectorAll('.ck-item-row');
        const collapseEl = group.querySelector('.accordion-collapse');
        const isTractoGroup = group.id.includes('_Tracto_');

        items.forEach(row => {
            const text = row.getAttribute('data-item-text') || row.innerText.toUpperCase();
            if (!q || text.includes(q)) {
                row.style.display = 'block';
                matchCountInGroup++;
            } else {
                row.style.display = 'none';
            }
        });

        if (q) {
            if (matchCountInGroup > 0) {
                group.style.display = 'block';
                if (isTractoGroup) matchesTracto += matchCountInGroup;
                else matchesRemolque += matchCountInGroup;
                if (collapseEl && typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
                    bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false }).show();
                }
            } else {
                group.style.display = 'none';
            }
        } else {
            group.style.display = 'block';
            if (collapseEl && typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
                bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false }).hide();
            }
        }
    });

    const emptyT = document.getElementById('ck_empty_search_tracto');
    const emptyR = document.getElementById('ck_empty_search_remolque');
    if (emptyT) emptyT.style.display = (q && matchesTracto === 0) ? 'block' : 'none';
    if (emptyR) emptyR.style.display = (q && matchesRemolque === 0) ? 'block' : 'none';
};

window.ckExpandirTodosAccordeones = function(expand = true) {
    document.querySelectorAll('.ck-accordion-group').forEach(group => {
        group.style.display = 'block';
        const collapseEl = group.querySelector('.accordion-collapse');
        const items = group.querySelectorAll('.ck-item-row');
        items.forEach(r => r.style.display = 'block');

        if (collapseEl && typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
            const inst = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
            if (expand) inst.show(); else inst.hide();
        }
    });
};

// ── FALLAS ADICIONALES MANUALES ──────────────────────────────────
window.ckObtenerPlacasSeleccionadas = function() {
    const pT = (typeof window._cbGet === 'function' ? window._cbGet('ck_placa_tracto') : '') || (document.getElementById('ck_placa_tracto-txt') || {}).value || '';
    const pR = (typeof window._cbGet === 'function' ? window._cbGet('ck_placa_remolque') : '') || (document.getElementById('ck_placa_remolque-txt') || {}).value || '';

    const tractoLabel = pT ? `TRACTO (${pT.toUpperCase()})` : 'TRACTO';
    const remolqueLabel = pR ? `SEMIRREMOLQUE / CARRETA (${pR.toUpperCase()})` : 'SEMIRREMOLQUE / CARRETA';

    return {
        placaTracto: pT ? pT.toUpperCase() : '',
        placaRemolque: pR ? pR.toUpperCase() : '',
        tractoLabel,
        remolqueLabel
    };
};

window.ckActualizarEncabezadosPlacas = function() {
    const p = window.ckObtenerPlacasSeleccionadas();
    const elT = document.getElementById('ck_header_tracto_placa');
    const elR = document.getElementById('ck_header_remolque_placa');

    if (elT) elT.innerHTML = `<i class="bi bi-truck fs-6 me-1"></i> <span>TRACTO ${p.placaTracto ? `(${p.placaTracto})` : '(Placa Principal)'}</span>`;
    if (elR) elR.innerHTML = `<i class="bi bi-truck-flatbed fs-6 me-1"></i> <span>SEMIRREMOLQUE / CARRETA ${p.placaRemolque ? `(${p.placaRemolque})` : '(Placa Secundaria)'}</span>`;

    document.querySelectorAll('.ck-manual-falla-row').forEach(row => {
        const select = row.querySelector('.ck-manual-sistema');
        if (select) {
            const valActual = select.value;
            select.innerHTML = `
                <option value="${p.placaTracto || 'TRACTO'}">🚛 ${p.tractoLabel}</option>
                <option value="${p.placaRemolque || 'SEMIRREMOLQUE'}">🚛 ${p.remolqueLabel}</option>
            `;
            if (valActual) select.value = valActual;
        }
    });

    window.ckActualizarChipsFallas();
};

window.ckAgregarFallaManual = function() {
    const container = document.getElementById('ck_contenedor_fallas_manuales');
    if (!container) return;

    const p = window.ckObtenerPlacasSeleccionadas();
    const rowId = 'manual_' + Date.now();
    const div = document.createElement('div');
    div.className = 'row g-2 mb-2 align-items-center ck-manual-falla-row';
    div.id = rowId;
    div.innerHTML = `
        <div class="col-md-4">
            <select class="form-select form-select-sm ck-manual-sistema fw-bold text-primary border-secondary-subtle">
                <option value="${p.placaTracto || 'TRACTO'}">🚛 ${p.tractoLabel}</option>
                <option value="${p.placaRemolque || 'SEMIRREMOLQUE'}">🚛 ${p.remolqueLabel}</option>
            </select>
        </div>
        <div class="col-md-7">
            <input type="text" class="form-control form-control-sm text-uppercase ck-manual-desc border-secondary-subtle" placeholder="Describa el componente / falla no listada...">
        </div>
        <div class="col-md-1 text-end">
            <button type="button" class="btn btn-outline-danger btn-sm rounded-circle p-1" onclick="document.getElementById('${rowId}').remove(); window.ckActualizarContadores();" title="Eliminar">
                <i class="bi bi-trash-fill"></i>
            </button>
        </div>
    `;
    container.appendChild(div);
    window.ckActualizarContadores();
};

window.ckObtenerSiguienteFolio = function() {
    const list = Array.isArray(window.dataGlobalChecklist) ? window.dataGlobalChecklist : [];
    let maxNum = 0;

    list.forEach(r => {
        const fol = (r.folio || '').toString();
        const matches = fol.match(/\d+/g);
        if (matches && matches.length > 0) {
            const lastPart = matches[matches.length - 1];
            const val = parseInt(lastPart, 10);
            if (!isNaN(val) && val > maxNum && val < 99999) {
                maxNum = val;
            }
        } else if (r.id && typeof r.id === 'number') {
            if (r.id > maxNum) maxNum = r.id;
        }
    });

    const nextNum = maxNum + 1;
    const padded = String(nextNum).padStart(5, '0');
    const anio = new Date().getFullYear();
    return `N° ${anio}-${padded}`;
};

// ── ABRIR MODAL NUEVO REPORTE ────────────────────────────────────
window.abrirModalNuevoChecklist = function() {
    document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
    document.body.classList.remove('modal-open');

    const form = document.getElementById('formNuevoChecklist');
    if (form) form.reset();

    // Resetear comboboxes explícitamente
    if (typeof window._cbSet === 'function') {
        window._cbSet('ck_placa_tracto', '', '');
        window._cbSet('ck_placa_remolque', '', '');
        window._cbSet('ck_conductor', '', '');
    }
    const txtT = document.getElementById('ck_placa_tracto-txt');
    if (txtT) txtT.value = '';
    const hidT = document.getElementById('ck_placa_tracto');
    if (hidT) hidT.value = '';

    const txtR = document.getElementById('ck_placa_remolque-txt');
    if (txtR) txtR.value = '';
    const hidR = document.getElementById('ck_placa_remolque');
    if (hidR) hidR.value = '';

    const txtC = document.getElementById('ck_conductor-txt');
    if (txtC) txtC.value = '';

    // Ocultar tarjetas de documentos y limpiar inputs GPS
    const docT = document.getElementById('ck-doc-box-tracto');
    if (docT) docT.style.display = 'none';
    const docR = document.getElementById('ck-doc-box-remolque');
    if (docR) docR.style.display = 'none';

    const inputKm = document.getElementById('ck_kilometraje');
    if (inputKm) inputKm.value = '';
    const inputHoras = document.getElementById('ck_horas_remolque');
    if (inputHoras) inputHoras.value = '';

    // Re-vincular selects
    window.poblarPlacasChecklist();
    window.poblarConductoresChecklist();

    const lblFolio = document.getElementById('lbl-ck-folio-header');
    if (lblFolio) {
        lblFolio.textContent = window.ckObtenerSiguienteFolio();
    }

    const inputFecha = document.getElementById('ck_fecha_reporte');
    if (inputFecha) {
        inputFecha.value = new Date().toISOString().split('T')[0];
    }

    // Resetear acordeones y campos
    window.ckRenderizarTodosAcordeones();
    window.ckActualizarContadores();
    window.ckActualizarChipsFallas();

    const buscador = document.getElementById('ck_buscador_items');
    if (buscador) {
        buscador.value = '';
        window.ckFiltrarItemsLive('');
    }

    const wrapManuales = document.getElementById('ck_contenedor_fallas_manuales');
    if (wrapManuales) wrapManuales.innerHTML = '';
    window.fallasManualesChecklist = [];

    fotosChecklistBase64 = [];
    const wrapFotos = document.getElementById('ck_preview_fotos');
    if (wrapFotos) wrapFotos.innerHTML = '';

    window.limpiarFirmaChecklist();
    window.poblarPlacasChecklist();
    window.poblarConductoresChecklist();

    const colViaje = document.getElementById('ck_collapse_viaje_asociado');
    if (colViaje && typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
        bootstrap.Collapse.getOrCreateInstance(colViaje, { toggle: false }).hide();
    }

    const modalEl = document.getElementById('modalNuevoChecklist');
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

// ── CONSULTAR GPS WIALON & DOCUMENTOS VIGENTES (POR PLACA) ────────
window.formatFechaVisual = function(rawDate) {
    if (!rawDate) return '';
    const str = String(rawDate).trim();
    if (str.includes('C3') || str.includes('Diésel') || str.includes('DIESEL')) return '';
    if (str.includes('/')) return str;
    try {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}/${month}/${year}`;
        }
    } catch(e) {}
    return str;
};

window.calcularEstadoDoc = function(rawDate) {
    if (!rawDate) return 'VIGENTE';
    try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
            const hoy = new Date();
            hoy.setHours(0,0,0,0);
            return d < hoy ? 'VENCIDO' : 'VIGENTE';
        }
    } catch(e) {}
    return 'VIGENTE';
};

window.ckObtenerTelemetryGPS = async function(placa) {
    if (!placa) return { km: 0, horas: 0 };
    const pStr = placa.toString().trim().toUpperCase();

    // 1. Probar CACHE.wialon local
    if (typeof buscarWialonPorPlaca === 'function') {
        const w = buscarWialonPorPlaca(pStr);
        if (w && (w.km > 0 || w.horas > 0)) {
            return { km: w.km || 0, horas: w.horas || 0 };
        }
    }

    // 2. Fetch /api/disponibilidad-flota
    try {
        const r = await fetch('/api/disponibilidad-flota');
        if (r.ok) {
            const data = await r.json();
            const list = Array.isArray(data) ? data : (data.data || []);
            const match = list.find(v => (v.placa || '').toString().trim().toUpperCase() === pStr);
            if (match) {
                return {
                    km: parseFloat(match.km || match.kilometraje || match.km_wialon || 0),
                    horas: parseFloat(match.horas_motor || match.horas_wialon || match.horas || 0)
                };
            }
        }
    } catch(e) {}

    // 3. Fetch /api/vehiculos-flota
    try {
        const r2 = await fetch('/api/vehiculos-flota');
        if (r2.ok) {
            const data2 = await r2.json();
            const list2 = Array.isArray(data2) ? data2 : [];
            const match2 = list2.find(v => (v.placa || '').toString().trim().toUpperCase() === pStr);
            if (match2) {
                return {
                    km: parseFloat(match2.km || match2.kilometraje || match2.km_inicial || 0),
                    horas: parseFloat(match2.horas_motor || match2.horas || 0)
                };
            }
        }
    } catch(e) {}

    return { km: 0, horas: 0 };
};

window.calcularEstadoDocumentoOInsp = function(rawDate) {
    if (!rawDate) return { estado: 'VIGENTE', badgeClass: 'bg-success text-white', fechaFmt: '' };
    
    try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
            const hoy = new Date();
            hoy.setHours(0,0,0,0);
            d.setHours(0,0,0,0);
            
            const diffTime = d.getTime() - hoy.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            const fechaFmt = `${day}/${month}/${year}`;
            
            if (diffDays < 0) {
                return { estado: 'VENCIDO', badgeClass: 'bg-danger text-white', fechaFmt };
            } else if (diffDays <= 15) {
                return { estado: 'PRÓXIMO A VENCER', badgeClass: 'bg-warning text-dark', fechaFmt };
            } else {
                return { estado: 'VIGENTE', badgeClass: 'bg-success text-white', fechaFmt };
            }
        }
    } catch(e) {}
    
    return { estado: 'VIGENTE', badgeClass: 'bg-success text-white', fechaFmt: window.formatFechaVisual(rawDate) };
};

window.ckObtenerFechasDocVehiculo = async function(placa) {
    if (!placa) return null;
    const pStr = placa.toString().trim().toUpperCase();

    let soatData = { estado: 'VIGENTE', badgeClass: 'bg-success text-white', fechaFmt: '11/01/2027' };
    let rtData   = { estado: 'VIGENTE', badgeClass: 'bg-success text-white', fechaFmt: '16/12/2026' };
    let inspData = { estado: 'VIGENTE', badgeClass: 'bg-success text-white', fechaFmt: '28/08/2026' };

    // 1. Consultar en vehículos flota
    try {
        const res = await fetch('/api/vehiculos-flota?t=' + Date.now());
        if (res.ok) {
            const list = await res.json();
            const veh = Array.isArray(list) ? list.find(v => (v.placa || '').toString().trim().toUpperCase() === pStr) : null;
            if (veh) {
                const sF = veh.soat_f_vencimiento || veh.soat_vencimiento || veh.fecha_vencimiento_soat;
                const rF = veh.rt_f_vencimiento || veh.rt_vencimiento || veh.fecha_vencimiento_rt || veh.citv_vencimiento;
                const iF = veh.insp_vencimiento || veh.inspeccion_vencimiento || veh.fum_vencimiento;

                if (sF) soatData = window.calcularEstadoDocumentoOInsp(sF);
                if (rF) rtData   = window.calcularEstadoDocumentoOInsp(rF);
                if (iF) inspData = window.calcularEstadoDocumentoOInsp(iF);
            }
        }
    } catch(e) {}

    return { soat: soatData, rt: rtData, insp: inspData };
};

window.ckEsPlacaValida = function(placaInput) {
    if (!placaInput) return false;
    const pStr = placaInput.toString().trim().toUpperCase();
    if (pStr.length < 5) return false;
    if (pStr.includes('SELECCIONE') || pStr.includes('BUSCAR') || pStr.includes('PLACA')) return false;

    const list = window.dataGlobalPlacas || [];
    if (list.length > 0) {
        return list.some(p => {
            const val = (p[0] || p.placa || '').toString().trim().toUpperCase();
            return val === pStr;
        });
    }

    const cbItems = (window._cbData && window._cbData['ck_placa_tracto']) || [];
    if (cbItems.length > 0) {
        return cbItems.some(it => (it.value || it.label || '').toString().trim().toUpperCase() === pStr);
    }

    return /^[A-Z0-9]{5,7}$/.test(pStr);
};

window.ckSyncPlacaTracto = async function() {
    const txtEl = document.getElementById('ck_placa_tracto-txt');
    const hidEl = document.getElementById('ck_placa_tracto');
    const docBox = document.getElementById('ck-doc-box-tracto');
    const inputKm = document.getElementById('ck_kilometraje');

    const visibleText = (txtEl ? txtEl.value : '').trim().toUpperCase();
    const esValida = window.ckEsPlacaValida(visibleText);

    if (!esValida) {
        if (hidEl) hidEl.value = '';
        if (docBox) docBox.style.display = 'none';
        if (inputKm) inputKm.value = '';
        if (window.ckActualizarEncabezadosPlacas) window.ckActualizarEncabezadosPlacas();
        return;
    }

    if (hidEl) hidEl.value = visibleText;
    if (docBox) docBox.style.display = 'block';
    const lblT = document.getElementById('ck-lbl-doc-tracto-placa');
    if (lblT) lblT.textContent = visibleText;

    if (window.ckActualizarEncabezadosPlacas) window.ckActualizarEncabezadosPlacas();

    // 1. Cargar fechas de documentos e inspección
    window.ckObtenerFechasDocVehiculo(visibleText).then(d => {
        if (!d) return;

        // SOAT
        const elSoatV = document.getElementById('ck-soat-venc-t');
        const elSoatB = document.getElementById('ck-soat-badge-t');
        if (elSoatV) elSoatV.textContent = d.soat.fechaFmt ? `Vence el ${d.soat.fechaFmt}` : 'Vence el 11/01/2027';
        if (elSoatB) {
            elSoatB.textContent = d.soat.estado;
            elSoatB.className = `badge ${d.soat.badgeClass} text-uppercase px-2 py-1`;
        }

        // REVISIÓN TÉCNICA
        const elRtV = document.getElementById('ck-rt-venc-t');
        const elRtB = document.getElementById('ck-rt-badge-t');
        if (elRtV) elRtV.textContent = d.rt.fechaFmt ? `Vence el ${d.rt.fechaFmt}` : 'Vence el 16/12/2026';
        if (elRtB) {
            elRtB.textContent = d.rt.estado;
            elRtB.className = `badge ${d.rt.badgeClass} text-uppercase px-2 py-1`;
        }

        // INSPECCIÓN GENERAL
        const elInspV = document.getElementById('ck-insp-venc-t');
        const elInspB = document.getElementById('ck-insp-badge-t');
        if (elInspV) elInspV.textContent = d.insp.fechaFmt ? `Vence el ${d.insp.fechaFmt}` : 'Vence el 28/08/2026';
        if (elInspB) {
            elInspB.textContent = d.insp.estado;
            elInspB.className = `badge ${d.insp.badgeClass} text-uppercase px-2 py-1`;
        }
    });

    // 2. Cargar GPS Kilometraje
    const tele = await window.ckObtenerTelemetryGPS(visibleText);
    if (inputKm && tele && tele.km > 0) {
        inputKm.value = Math.round(tele.km);
    }
};

window.ckSyncPlacaRemolque = async function() {
    const txtEl = document.getElementById('ck_placa_remolque-txt');
    const hidEl = document.getElementById('ck_placa_remolque');
    const docBox = document.getElementById('ck-doc-box-remolque');
    const inputHoras = document.getElementById('ck_horas_remolque');

    const visibleText = (txtEl ? txtEl.value : '').trim().toUpperCase();
    const esValida = window.ckEsPlacaValida(visibleText);

    if (!esValida) {
        if (hidEl) hidEl.value = '';
        if (docBox) docBox.style.display = 'none';
        if (inputHoras) inputHoras.value = '';
        if (window.ckActualizarEncabezadosPlacas) window.ckActualizarEncabezadosPlacas();
        return;
    }

    if (hidEl) hidEl.value = visibleText;
    if (docBox) docBox.style.display = 'block';
    const lblR = document.getElementById('ck-lbl-doc-remolque-placa');
    if (lblR) lblR.textContent = visibleText;

    if (window.ckActualizarEncabezadosPlacas) window.ckActualizarEncabezadosPlacas();

    // 1. Cargar fechas de documentos e inspección
    window.ckObtenerFechasDocVehiculo(visibleText).then(d => {
        if (!d) return;

        // SOAT / SEGURO
        const elSoatV = document.getElementById('ck-soat-venc-r');
        const elSoatB = document.getElementById('ck-soat-badge-r');
        if (elSoatV) elSoatV.textContent = d.soat.fechaFmt ? `Vence el ${d.soat.fechaFmt}` : 'Vence el 15/05/2027';
        if (elSoatB) {
            elSoatB.textContent = d.soat.estado;
            elSoatB.className = `badge ${d.soat.badgeClass} text-uppercase px-2 py-1`;
        }

        // REVISIÓN TÉCNICA / CITV
        const elRtV = document.getElementById('ck-rt-venc-r');
        const elRtB = document.getElementById('ck-rt-badge-r');
        if (elRtV) elRtV.textContent = d.rt.fechaFmt ? `Vence el ${d.rt.fechaFmt}` : 'Vence el 20/11/2026';
        if (elRtB) {
            elRtB.textContent = d.rt.estado;
            elRtB.className = `badge ${d.rt.badgeClass} text-uppercase px-2 py-1`;
        }

        // INSPECCIÓN GENERAL
        const elInspV = document.getElementById('ck-insp-venc-r');
        const elInspB = document.getElementById('ck-insp-badge-r');
        if (elInspV) elInspV.textContent = d.insp.fechaFmt ? `Vence el ${d.insp.fechaFmt}` : 'Vence el 28/08/2026';
        if (elInspB) {
            elInspB.textContent = d.insp.estado;
            elInspB.className = `badge ${d.insp.badgeClass} text-uppercase px-2 py-1`;
        }
    });

    // 2. Cargar GPS Horas de motor
    const tele = await window.ckObtenerTelemetryGPS(visibleText);
    if (inputHoras && tele && tele.horas > 0) {
        inputHoras.value = Math.round(tele.horas);
    }
};

window.consultarGpsChecklist = function(placaManual) {
    if (window.ckConsultarDocumentosYGPS) window.ckConsultarDocumentosYGPS();
};

window.ckConsultarDocumentosYGPS = function() {
    window.ckSyncPlacaTracto();
    window.ckSyncPlacaRemolque();
};

// ── FIRMA DIGITAL CANVAS ──────────────────────────────────────────
window.initCanvasFirmaChecklist = function() {
    canvasFirmaChecklist = document.getElementById('ck_canvas_firma');
    if (!canvasFirmaChecklist) return;
    ctxFirmaChecklist = canvasFirmaChecklist.getContext('2d');

    function getPos(e) {
        const rect = canvasFirmaChecklist.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    function startDraw(e) {
        estaFirmandoChecklist = true;
        const pos = getPos(e);
        ctxFirmaChecklist.beginPath();
        ctxFirmaChecklist.moveTo(pos.x, pos.y);
    }

    function draw(e) {
        if (!estaFirmandoChecklist) return;
        e.preventDefault();
        const pos = getPos(e);
        ctxFirmaChecklist.lineWidth = 2;
        ctxFirmaChecklist.lineCap = 'round';
        ctxFirmaChecklist.strokeStyle = '#0f172a';
        ctxFirmaChecklist.lineTo(pos.x, pos.y);
        ctxFirmaChecklist.stroke();
    }

    function stopDraw() {
        estaFirmandoChecklist = false;
    }

    canvasFirmaChecklist.addEventListener('mousedown', startDraw);
    canvasFirmaChecklist.addEventListener('mousemove', draw);
    canvasFirmaChecklist.addEventListener('mouseup', stopDraw);
    canvasFirmaChecklist.addEventListener('touchstart', startDraw);
    canvasFirmaChecklist.addEventListener('touchmove', draw);
    canvasFirmaChecklist.addEventListener('touchend', stopDraw);
};

window.limpiarFirmaChecklist = function() {
    if (canvasFirmaChecklist && ctxFirmaChecklist) {
        ctxFirmaChecklist.clearRect(0, 0, canvasFirmaChecklist.width, canvasFirmaChecklist.height);
    }
};

// ── PROCESAR FOTOS AWS S3 PREVIEW ────────────────────────────────
window.procesarFotosChecklist = function(input) {
    const files = input.files;
    if (!files || !files.length) return;

    const wrap = document.getElementById('ck_preview_fotos');
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64 = e.target.result;
            fotosChecklistBase64.push(base64);

            if (wrap) {
                const imgDiv = document.createElement('div');
                imgDiv.className = 'position-relative border rounded-3 overflow-hidden shadow-2xs';
                imgDiv.style.width = '75px';
                imgDiv.style.height = '75px';
                imgDiv.innerHTML = `
                    <img src="${base64}" style="width:100%; height:100%; object-fit:cover;">
                    <button type="button" class="btn-close position-absolute top-0 end-0 bg-white p-1" style="font-size:0.6rem;" onclick="this.parentElement.remove();"></button>
                `;
                wrap.appendChild(imgDiv);
            }
        };
        reader.readAsDataURL(file);
    });
};

// ── CARGAR Y FILTRAR TABLA DE CHECKLIST ─────────────────────────
window.cargarTablaChecklist = function(forzarRefresh = false) {
    const c = document.getElementById('contenedorChecklistDinamico');
    if (c) c.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2 text-primary"></span> Cargando reportes...</td></tr>';

    fetch('/api/checklist')
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(data => {
            window.dataGlobalChecklist = Array.isArray(data) ? data : [];
            window.filtrarChecklist();
        })
        .catch(err => {
            console.error('Error cargando checklist:', err);
            window.dataGlobalChecklist = [];
            if (c) c.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger"><i class="bi bi-exclamation-circle me-1"></i> Error al cargar reportes.</td></tr>';
        });
};

window.filtrarEstadoChecklist = function(estado, btn) {
    estadoFiltroActualChecklist = estado;
    const group = document.getElementById('btn-group-estados-checklist');
    if (group) {
        group.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    }
    if (btn) btn.classList.add('active');
    window.filtrarChecklist();
};

window.filtrarChecklist = function() {
    const q = (document.getElementById('buscadorChecklist') || {}).value || '';
    const query = q.toLowerCase().trim();

    let list = Array.isArray(window.dataGlobalChecklist) ? window.dataGlobalChecklist : [];

    if (estadoFiltroActualChecklist !== 'TODOS') {
        list = list.filter(r => (r.estado || 'Pendiente') === estadoFiltroActualChecklist);
    }

    if (query) {
        list = list.filter(r => {
            const fol = (r.folio || '').toLowerCase();
            const pt = (r.placa_tracto || '').toLowerCase();
            const pr = (r.placa_remolque || '').toLowerCase();
            const cond = (r.conductor || '').toLowerCase();
            return fol.includes(query) || pt.includes(query) || pr.includes(query) || cond.includes(query);
        });
    }

    window.actualizarKPIsChecklist(window.dataGlobalChecklist);

    const c = document.getElementById('contenedorChecklistDinamico');
    if (!c) return;

    if (!list.length) {
        c.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-3 d-block mb-2"></i>No se encontraron reportes de falla.</td></tr>';
        return;
    }

    let html = '';
    list.forEach(r => {
        let badgeEstado = '<span class="badge bg-warning text-dark rounded-pill fw-bold"><i class="bi bi-clock me-1"></i>Pendiente</span>';
        if (r.estado === 'En Proceso') badgeEstado = '<span class="badge bg-info rounded-pill fw-bold"><i class="bi bi-tools me-1"></i>En Taller</span>';
        if (r.estado === 'Finalizado') badgeEstado = '<span class="badge bg-success rounded-pill fw-bold"><i class="bi bi-check-circle me-1"></i>Finalizado</span>';

        let otsHtml = '<span class="text-muted small">Sin OTs</span>';
        if (r.ots_generadas_json) {
            try {
                const ots = typeof r.ots_generadas_json === 'string' ? JSON.parse(r.ots_generadas_json) : r.ots_generadas_json;
                if (Array.isArray(ots) && ots.length) {
                    otsHtml = ots.map(o => `<span class="badge bg-secondary me-1 fw-normal">${o.idOt} (${o.placa})</span>`).join('');
                }
            } catch(e) {}
        }

        const fechaFmt = r.fecha_reporte ? new Date(r.fecha_reporte).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';

        html += `
        <tr>
            <td class="ps-3 fw-bold text-primary" style="min-width: 110px;">${r.folio}</td>
            <td style="min-width: 140px;"><small class="text-muted fw-semibold">${fechaFmt}</small></td>
            <td style="min-width: 110px;">
                ${r.placa_tracto ? `<span class="badge bg-white text-dark border shadow-2xs fw-bolder px-2 py-2 text-center" style="min-width: 85px; font-size: 0.82rem; border-radius: 6px; letter-spacing: 0.5px;">${r.placa_tracto}</span>` : '<span class="text-muted small">—</span>'}
            </td>
            <td style="min-width: 110px;">
                ${r.placa_remolque ? `<span class="badge bg-white text-dark border shadow-2xs fw-bolder px-2 py-2 text-center" style="min-width: 85px; font-size: 0.82rem; border-radius: 6px; letter-spacing: 0.5px;">${r.placa_remolque}</span>` : '<span class="text-muted small">—</span>'}
            </td>
            <td>
                <div class="fw-bold text-dark" style="font-size: 0.85rem;">${r.conductor || 'Sin Conductor'}</div>
                <div class="text-muted small" style="font-size: 0.75rem;"><i class="bi bi-geo-alt me-1"></i>${r.procedencia || 'En Ruta'}</div>
            </td>
            <td class="text-center" style="min-width: 110px;">${badgeEstado}</td>
            <td class="text-center" style="min-width: 140px;">${otsHtml}</td>
            <td class="pe-3 text-end" style="min-width: 180px;">
                <div class="btn-group btn-group-sm shadow-2xs">
                    <button class="btn btn-outline-primary fw-bold" onclick="window.abrirDetalleChecklist(${r.id})" title="Ver Reporte F-MAN-001">
                        <i class="bi bi-eye-fill"></i> Detalle
                    </button>
                    <button class="btn btn-outline-secondary fw-bold" onclick="window.generarPDF_Checklist(${r.id})" title="Imprimir Formato PDF F-MAN-001">
                        <i class="bi bi-file-earmark-pdf-fill text-danger"></i> PDF
                    </button>
                    ${r.estado !== 'Finalizado' ? `
                    <button class="btn btn-warning fw-bold text-dark" onclick="window.abrirModalGenerarOTs(${r.id})" title="Generar OTs e Integrar Taller">
                        <i class="bi bi-lightning-charge-fill me-1"></i> Generar OTs
                    </button>
                    ` : ''}
                    <button class="btn btn-outline-danger" onclick="window.eliminarChecklist(${r.id})" title="Eliminar Reporte">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
        `;
    });
    c.innerHTML = html;
};

window.actualizarKPIsChecklist = function(datos) {
    if (!datos) return;
    const total = datos.length;
    const pendientes = datos.filter(r => (r.estado || 'Pendiente') === 'Pendiente').length;
    const proceso = datos.filter(r => r.estado === 'En Proceso').length;
    const finalizados = datos.filter(r => r.estado === 'Finalizado').length;

    const elTotal = document.getElementById('kpi-ck-total');
    const elPend = document.getElementById('kpi-ck-pendientes');
    const elProc = document.getElementById('kpi-ck-proceso');
    const elFin = document.getElementById('kpi-ck-finalizados');

    if (elTotal) elTotal.textContent = total;
    if (elPend) elPend.textContent = pendientes;
    if (elProc) elProc.textContent = proceso;
    if (elFin) elFin.textContent = finalizados;
};

// ── GUARDAR REPORTE ──────────────────────────────────────────────
window.guardarChecklist = function(e) {
    if (e) e.preventDefault();
    if (!window.guardAction('checklist', 'c')) return;

    const btn = document.getElementById('btnGuardarChecklist');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Guardando...';
    }

    try {
        const placaTracto = (typeof window._cbGet === 'function' ? window._cbGet('ck_placa_tracto') : '') || (document.getElementById('ck_placa_tracto-txt') || {}).value || '';
        const placaRemolque = (typeof window._cbGet === 'function' ? window._cbGet('ck_placa_remolque') : '') || (document.getElementById('ck_placa_remolque-txt') || {}).value || '';
        const conductorNombre = (typeof window._cbGet === 'function' ? window._cbGet('ck_conductor') : '') || (document.getElementById('ck_conductor-txt') || {}).value || '';
        const kilometrajeVal = (document.getElementById('ck_kilometraje') || {}).value || 0;
        const horasMotorVal = (document.getElementById('ck_horas_remolque') || {}).value || (document.getElementById('ck_horas_motor') || {}).value || '';
        const fechaRep = (document.getElementById('ck_fecha_reporte') || {}).value || new Date().toISOString().split('T')[0];

        const fallasTracto = [];
        const fallasRemolque = [];

        // Recolectar checkboxes marcados
        document.querySelectorAll('.ck-checkbox-item:checked').forEach(chk => {
            const itemId = chk.id.replace('chk_', '');
            const isTracto = itemId.includes('_Tracto_');
            const parts = itemId.split('_');
            const sysKey = parts[2] || parts[1] || 'GENERAL';
            const txtEl = document.getElementById(`txt_${itemId}`);
            const lblEl = document.getElementById(`lbl_${itemId}`);

            const itemNombre = lblEl ? lblEl.innerText.trim() : 'Falla Observada';
            const obsDesc = txtEl && txtEl.value.trim() ? txtEl.value.trim() : itemNombre;

            const obj = { sistema: sysKey.toUpperCase(), item: itemNombre, obs: obsDesc };
            if (isTracto) {
                fallasTracto.push(obj);
            } else {
                fallasRemolque.push(obj);
            }
        });

        // Recolectar fallas manuales adicionadas
        document.querySelectorAll('.ck-manual-falla-row').forEach(row => {
            const selectEl = row.querySelector('.ck-manual-sistema');
            const descEl = row.querySelector('.ck-manual-desc') || row.querySelector('input[type="text"]');
            const sysVal = selectEl ? selectEl.value : 'TRACTO';
            const obs = descEl ? descEl.value.trim() : '';

            if (obs) {
                const isRem = sysVal.toUpperCase().includes('REMOLQUE') || sysVal.toUpperCase().includes('CARRETA') || (placaRemolque && sysVal === placaRemolque);
                const obj = { sistema: 'MANUAL', item: 'Falla Manual', obs: obs };
                if (isRem) {
                    fallasRemolque.push(obj);
                } else {
                    fallasTracto.push(obj);
                }
            }
        });

        let firmaData = null;
        if (canvasFirmaChecklist) {
            firmaData = canvasFirmaChecklist.toDataURL();
        }

        const payload = {
            fecha_reporte: fechaRep,
            placa_tracto: placaTracto,
            placa_remolque: placaRemolque,
            km_inicial: kilometrajeVal,
            km_final: kilometrajeVal,
            horas_motor: horasMotorVal,
            conductor: conductorNombre,
            procedencia: (document.getElementById('ck_procedencia') || {}).value || '',
            ubicacion_gps: (document.getElementById('ck_ubicacion_gps') || {}).value || '',
            fallas_tracto: fallasTracto,
            fallas_remolque: fallasRemolque,
            fallas_libres_text: '',
            fotos_base64: fotosChecklistBase64,
            firma_conductor: firmaData,
            creado_por: window.usuarioLogueado || 'Sistema'
        };

        fetch('/api/checklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(res => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Guardar Reporte de Fallas';
            }

            if (res.ok) {
                const modalEl = document.getElementById('modalNuevoChecklist');
                if (modalEl) {
                    const inst = bootstrap.Modal.getInstance(modalEl);
                    if (inst) inst.hide();
                }
                document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
                document.body.classList.remove('modal-open');

                window.cargarTablaChecklist(true);

                if (typeof window.rotToast === 'function') {
                    window.rotToast(`✅ Reporte de Fallas ${res.folio || ''} guardado con éxito.`, 'bg-success');
                }
            } else {
                alert('❌ Error guardando reporte: ' + (res.error || 'Desconocido'));
            }
        })
        .catch(err => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Guardar Reporte de Fallas';
            }
            alert('❌ Error de conexión: ' + err.message);
        });

    } catch (errSync) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Guardar Reporte de Fallas';
        }
        console.error('Error al preparar reporte:', errSync);
        alert('❌ Ocurrió un error al procesar el reporte: ' + errSync.message);
    }
};

// ── DETALLE DIGITAL COMPLETO DEL REPORTE (MODAL XL ESTILO REPORTES) ──
window.abrirDetalleChecklist = function(id) {
    const modalEl = document.getElementById('modalDetalleChecklistFull');
    const body = document.getElementById('det-full-body');
    const folioEl = document.getElementById('det-full-folio');

    if (!modalEl || !body) return;

    const r = (window.dataGlobalChecklist || []).find(item => item.id === id);
    if (!r) {
        alert('No se encontró la información del reporte seleccionado.');
        return;
    }

    if (folioEl) folioEl.textContent = `Reporte de Fallas ${r.folio || ('2026-' + String(id).padStart(8, '0'))}`;

    // Extraer array de fallas de Tracto y Remolque
    let fallasT = [];
    let fallasR = [];
    try {
        if (r.fallas_tracto_json) {
            fallasT = typeof r.fallas_tracto_json === 'string' ? JSON.parse(r.fallas_tracto_json) : r.fallas_tracto_json;
        } else if (r.fallas_tracto) {
            fallasT = typeof r.fallas_tracto === 'string' ? JSON.parse(r.fallas_tracto) : r.fallas_tracto;
        }
    } catch(e) {}
    try {
        if (r.fallas_remolque_json) {
            fallasR = typeof r.fallas_remolque_json === 'string' ? JSON.parse(r.fallas_remolque_json) : r.fallas_remolque_json;
        } else if (r.fallas_remolque) {
            fallasR = typeof r.fallas_remolque === 'string' ? JSON.parse(r.fallas_remolque) : r.fallas_remolque;
        }
    } catch(e) {}

    if (!Array.isArray(fallasT)) fallasT = [];
    if (!Array.isArray(fallasR)) fallasR = [];

    const todasFallas = [
        ...fallasT.map(f => ({ ...f, unidad: 'TRACTO ' + (r.placa_tracto ? '(' + r.placa_tracto + ')' : '') })),
        ...fallasR.map(f => ({ ...f, unidad: 'REMOLQUE ' + (r.placa_remolque ? '(' + r.placa_remolque + ')' : '') }))
    ];

    // Badge Estado
    let badgeEstado = '<span class="badge bg-warning text-dark px-3 py-2 fw-bold text-uppercase" style="font-size:0.75rem;">PENDIENTE</span>';
    if (r.estado === 'En Proceso') badgeEstado = '<span class="badge bg-primary px-3 py-2 fw-bold text-uppercase" style="font-size:0.75rem;">EN TALLER</span>';
    if (r.estado === 'Finalizado') badgeEstado = '<span class="badge bg-success px-3 py-2 fw-bold text-uppercase" style="font-size:0.75rem;">FINALIZADO</span>';

    const fechaFmt = r.fecha_reporte ? new Date(r.fecha_reporte).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';

    // ── 1. DATOS DEL REPORTE ──
    let html = `
        <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #e2e8f0 !important;">
            <div class="d-flex align-items-center justify-content-between mb-3">
                <h6 class="fw-bold text-dark m-0 d-flex align-items-center gap-2" style="font-size:1rem;">
                    <i class="bi bi-file-earmark-text-fill text-primary"></i> Datos del Reporte
                </h6>
                <div class="d-flex align-items-center gap-2">
                    <button type="button" class="btn btn-outline-danger btn-sm fw-bold d-flex align-items-center gap-1 shadow-2xs" onclick="window.generarPDF_Checklist(${r.id})">
                        <i class="bi bi-printer-fill"></i> Imprimir PDF (F-MAN-001)
                    </button>
                    <div>${badgeEstado}</div>
                </div>
            </div>
            <div class="row g-2 style-sm" style="font-size:0.85rem; color:#334155;">
                <div class="col-12 col-md-6"><strong>Fecha:</strong> ${fechaFmt}</div>
                <div class="col-12 col-md-6"><strong>Placa Principal:</strong> <span class="fw-bold text-dark">${r.placa_tracto || '-'}</span></div>
                <div class="col-12 col-md-6"><strong>Placa Remolque:</strong> <span class="fw-bold text-dark">${r.placa_remolque || '-'}</span></div>
                <div class="col-12 col-md-6"><strong>Conductor:</strong> ${r.conductor || '-'}</div>
                <div class="col-12 col-md-6"><strong>Ruta:</strong> ${r.procedencia || '-'}</div>
                <div class="col-12 col-md-6"><strong>Procedencia:</strong> ${r.procedencia || '-'}</div>
                <div class="col-12 col-md-6"><strong>Orden de Viaje:</strong> ${r.orden_viaje || '-'}</div>
                <div class="col-12 col-md-6"><strong>Orden de Servicio:</strong> ${r.orden_servicio || '-'}</div>
                <div class="col-12 col-md-6"><strong>Kilometraje (Tracto):</strong> ${r.km_inicial || '-'}</div>
                <div class="col-12 col-md-6"><strong>Horas de Motor (Remolque):</strong> ${r.horas_motor || '-'}</div>
            </div>
        </div>
    `;

    // ── 2. CHECKLIST (CARDS POR SISTEMA) ──
    html += `
        <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #e2e8f0 !important;">
            <h6 class="fw-bold text-dark d-flex align-items-center gap-2 mb-3" style="font-size:1rem;">
                <i class="bi bi-card-checklist text-primary"></i> Checklist
            </h6>
    `;

    // TRACTO
    html += `<div class="fw-bold text-dark small mb-2"><i class="bi bi-truck me-1 text-primary"></i> TRACTO (Placa Principal)</div>`;
    html += `<div class="row g-2 mb-3">`;

    const configT = [
        { key: 'MOTOR', items: SISTEMAS_TRACTO.motor },
        { key: 'CAJA-CORONAS', items: SISTEMAS_TRACTO.caja },
        { key: 'REFRIGERACION', items: SISTEMAS_TRACTO.refri },
        { key: 'DIRECCION', items: SISTEMAS_TRACTO.direccion },
        { key: 'CABINA Y CHASIS', items: SISTEMAS_TRACTO.cabina }
    ];

    configT.forEach(sys => {
        html += `
            <div class="col-12 col-md-6">
                <div class="card border rounded-3 overflow-hidden shadow-2xs">
                    <div class="card-header bg-light fw-bold text-dark small py-2 px-3">${sys.key}</div>
                    <div class="list-group list-group-flush small">
        `;
        sys.items.forEach(itemTxt => {
            const fallaMatch = fallasT.find(f => (f.item || '').toUpperCase().includes(itemTxt.toUpperCase()) || ((f.sistema || '').toUpperCase() === sys.key && (f.obs || '').toUpperCase().includes(itemTxt.toUpperCase())));
            if (fallaMatch) {
                const obsTxt = (fallaMatch.obs && fallaMatch.obs.trim() && fallaMatch.obs.trim().toUpperCase() !== itemTxt.toUpperCase()) ? fallaMatch.obs.trim() : '';
                html += `
                    <div class="list-group-item py-2 px-3 bg-danger bg-opacity-10 border-start border-3 border-danger">
                        <div class="d-flex align-items-center justify-content-between">
                            <span class="text-danger fw-bold">❌ ${itemTxt}</span>
                            <span class="badge bg-danger text-uppercase px-2 py-1" style="font-size:0.65rem;">OBSERVADO</span>
                        </div>
                        ${obsTxt ? `<div class="small text-dark fw-semibold mt-1 ps-2 border-start border-2 border-danger-subtle" style="font-size:0.78rem;">Obs: ${obsTxt}</div>` : ''}
                    </div>
                `;
            } else {
                html += `<div class="list-group-item py-2 px-3 text-secondary">✓ ${itemTxt}</div>`;
            }
        });
        html += `</div></div></div>`;
    });
    html += `</div>`;

    // REMOLQUE
    if (r.placa_remolque || fallasR.length > 0) {
        html += `<div class="fw-bold text-dark small mb-2"><i class="bi bi-truck-flatbed me-1 text-warning"></i> SEMIRREMOLQUE / CARRETA (Placa Secundaria)</div>`;
        html += `<div class="row g-2 mb-3">`;

        const configR = [
            { key: 'FRENOS', items: SISTEMAS_REMOLQUE.frenos },
            { key: 'CARRETA', items: SISTEMAS_REMOLQUE.carreta },
            { key: 'SISTEMA ELECTRICO', items: SISTEMAS_REMOLQUE.electrico },
            { key: 'SUSPENSION', items: SISTEMAS_REMOLQUE.suspension },
            { key: 'FURGON', items: SISTEMAS_REMOLQUE.furgon },
            { key: 'LLANTAS', items: SISTEMAS_REMOLQUE.llantas },
            { key: 'TERMOKING', items: SISTEMAS_REMOLQUE.termoking }
        ];

        configR.forEach(sys => {
            html += `
                <div class="col-12 col-md-6">
                    <div class="card border rounded-3 overflow-hidden shadow-2xs">
                        <div class="card-header bg-light fw-bold text-dark small py-2 px-3">${sys.key}</div>
                        <div class="list-group list-group-flush small">
            `;
            sys.items.forEach(itemTxt => {
                const fallaMatch = fallasR.find(f => (f.item || '').toUpperCase().includes(itemTxt.toUpperCase()) || ((f.sistema || '').toUpperCase() === sys.key && (f.obs || '').toUpperCase().includes(itemTxt.toUpperCase())));
                if (fallaMatch) {
                    const obsTxt = (fallaMatch.obs && fallaMatch.obs.trim() && fallaMatch.obs.trim().toUpperCase() !== itemTxt.toUpperCase()) ? fallaMatch.obs.trim() : '';
                    html += `
                        <div class="list-group-item py-2 px-3 bg-danger bg-opacity-10 border-start border-3 border-danger">
                            <div class="d-flex align-items-center justify-content-between">
                                <span class="text-danger fw-bold">❌ ${itemTxt}</span>
                                <span class="badge bg-danger text-uppercase px-2 py-1" style="font-size:0.65rem;">OBSERVADO</span>
                            </div>
                            ${obsTxt ? `<div class="small text-dark fw-semibold mt-1 ps-2 border-start border-2 border-danger-subtle" style="font-size:0.78rem;">Obs: ${obsTxt}</div>` : ''}
                        </div>
                    `;
                } else {
                    html += `<div class="list-group-item py-2 px-3 text-secondary">✓ ${itemTxt}</div>`;
                }
            });
            html += `</div></div></div>`;
        });
        html += `</div>`;
    }

    html += `</div>`;

    // ── 3. DETALLE DE FALLA (TABLA CON RESULTADOS) ──
    html += `
        <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #e2e8f0 !important;">
            <h6 class="fw-bold text-dark d-flex align-items-center gap-2 mb-3" style="font-size:1rem;">
                <i class="bi bi-tools text-primary"></i> Detalle de Falla
            </h6>
            <div class="table-responsive border rounded-3 overflow-hidden">
                <table class="table table-hover align-middle m-0 small">
                    <thead class="table-light sticky-top">
                        <tr>
                            <th class="py-2 ps-3">UNIDAD</th>
                            <th class="py-2">CATEGORÍA</th>
                            <th class="py-2">ÍTEM</th>
                            <th class="py-2 pe-3">DESCRIPCIÓN DE LA FALLA</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    if (todasFallas.length === 0) {
        html += `<tr><td colspan="4" class="text-center py-3 text-muted">Sin fallas observadas registradas.</td></tr>`;
    } else {
        todasFallas.forEach(f => {
            html += `
                <tr>
                    <td class="ps-3 fw-bold text-primary">${f.unidad || 'TRACTO'}</td>
                    <td class="fw-semibold text-dark">${f.sistema || 'GENERAL'}</td>
                    <td class="fw-bold text-danger">${f.item || '—'}</td>
                    <td class="pe-3 fw-semibold text-dark">${f.obs || 'SIN DESCRIPCIÓN'}</td>
                </tr>
            `;
        });
    }

    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // ── 4. EVIDENCIAS FOTOGRÁFICAS ──
    let fotosHtml = '<div class="text-muted small">Sin evidencias adjuntas.</div>';
    if (r.fotos_json) {
        try {
            const fotos = typeof r.fotos_json === 'string' ? JSON.parse(r.fotos_json) : r.fotos_json;
            if (Array.isArray(fotos) && fotos.length) {
                fotosHtml = '<div class="d-flex flex-wrap gap-2">' + fotos.map(url => `
                    <a href="${url}" target="_blank" class="border rounded overflow-hidden shadow-2xs" style="width:90px; height:90px;">
                        <img src="${url}" style="width:100%; height:100%; object-fit:cover;">
                    </a>
                `).join('') + '</div>';
            }
        } catch(e) {}
    }

    html += `
        <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #e2e8f0 !important;">
            <h6 class="fw-bold text-dark d-flex align-items-center gap-2 mb-2" style="font-size:1rem;">
                <i class="bi bi-camera-fill text-primary"></i> Evidencias
            </h6>
            ${fotosHtml}
        </div>
    `;

    // ── 5. ÓRDENES DE TRABAJO GENERADAS ──
    let otsHtml = '<div class="text-muted small">Sin órdenes de trabajo generadas.</div>';
    if (r.ots_generadas_json) {
        try {
            const ots = typeof r.ots_generadas_json === 'string' ? JSON.parse(r.ots_generadas_json) : r.ots_generadas_json;
            if (Array.isArray(ots) && ots.length) {
                otsHtml = ots.map(o => `
                    <span class="badge bg-primary px-3 py-2 fs-6 rounded-3 me-2">
                        ${o.idOt} <span class="badge bg-info text-dark ms-1">EN PROCESO</span>
                    </span>
                `).join('');
            }
        } catch(e) {}
    }

    html += `
        <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #e2e8f0 !important;">
            <h6 class="fw-bold text-dark d-flex align-items-center gap-2 mb-2" style="font-size:1rem;">
                <i class="bi bi-tools text-primary"></i> Órdenes de Trabajo Generadas
            </h6>
            <div>${otsHtml}</div>
        </div>
    `;

    // ── 6. FIRMA DIGITAL DEL CONDUCTOR (SI EXISTE) ──
    if (r.firma_conductor_url) {
        html += `
            <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #e2e8f0 !important;">
                <h6 class="fw-bold text-dark mb-2"><i class="bi bi-pencil-fill text-primary me-1"></i>Firma del Conductor</h6>
                <div class="border rounded-3 p-2 text-center bg-light" style="max-width:320px;">
                    <img src="${r.firma_conductor_url}" style="max-height:100px; object-fit:contain;">
                </div>
            </div>
        `;
    }

    body.innerHTML = html;
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.eliminarChecklist = function(id) {
    if (!window.guardAction('checklist', 'd')) return;
    if (!confirm('¿Estás seguro de eliminar este reporte de fallas?')) return;

    fetch(`/api/checklist/${id}`, { method: 'DELETE' })
        .then(r => r.json())
        .then(res => {
            if (res.ok) {
                window.cargarTablaChecklist(true);
            } else {
                alert('Error al eliminar: ' + (res.error || 'Desconocido'));
            }
        })
        .catch(err => alert('Error de red: ' + err.message));
};

window.abrirModalGenerarOTs = function(id) {
    const r = (window.dataGlobalChecklist || []).find(item => item.id === id);
    if (!r) return;

    const modalEl = document.getElementById('modalGenerarOTsFromChecklist');
    const inputId = document.getElementById('gen_reporte_id');
    const wrapCards = document.getElementById('contenedorTarjetasOTsGen');

    if (inputId) inputId.value = id;

    let html = '';
    if (r.placa_tracto) {
        html += `
            <div class="card border-0 shadow-sm p-3 mb-3 bg-white rounded-3 border-start border-4 border-primary">
                <div class="fw-bold text-primary mb-2"><i class="bi bi-truck me-1"></i> OT Tracto — Placa ${r.placa_tracto}</div>
                <div class="row g-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-semibold">Tipo OT</label>
                        <select class="form-select form-select-sm" name="tipo_ot_tracto">
                            <option value="Correctivo">Correctivo</option>
                            <option value="Preventivo">Preventivo</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-semibold">Prioridad</label>
                        <select class="form-select form-select-sm" name="prioridad_tracto">
                            <option value="Alta">Alta</option>
                            <option value="Media" selected>Media</option>
                            <option value="Baja">Baja</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    }
    if (r.placa_remolque) {
        html += `
            <div class="card border-0 shadow-sm p-3 mb-3 bg-white rounded-3 border-start border-4 border-warning">
                <div class="fw-bold text-warning mb-2"><i class="bi bi-truck-flatbed me-1"></i> OT Remolque — Placa ${r.placa_remolque}</div>
                <div class="row g-2">
                    <div class="col-md-6">
                        <label class="form-label small fw-semibold">Tipo OT</label>
                        <select class="form-select form-select-sm" name="tipo_ot_remolque">
                            <option value="Correctivo">Correctivo</option>
                            <option value="Preventivo">Preventivo</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-semibold">Prioridad</label>
                        <select class="form-select form-select-sm" name="prioridad_remolque">
                            <option value="Alta">Alta</option>
                            <option value="Media" selected>Media</option>
                            <option value="Baja">Baja</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    }

    if (wrapCards) wrapCards.innerHTML = html;
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.enviarGeneracionOTs = function(e) {
    e.preventDefault();
    const id = document.getElementById('gen_reporte_id').value;
    const rampa = document.getElementById('gen_id_rampa').value;

    fetch('/api/checklist/generar-ots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_reporte: id, rampa })
    })
    .then(r => r.json())
    .then(res => {
        if (res.ok) {
            const modalEl = document.getElementById('modalGenerarOTsFromChecklist');
            if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();
            window.cargarTablaChecklist(true);
            alert('🚀 Órdenes de Trabajo generadas correctamente.');
        } else {
            alert('Error al generar OTs: ' + (res.error || 'Desconocido'));
        }
    })
    .catch(err => alert('Error de conexión: ' + err.message));
};

// ── GENERADOR DE PDF A4 F-MAN-001 REPORTE DE FALLAS FLOTA PESADA ───
window.generarPDF_Checklist = async function(id) {
    if (typeof window.rotToast === 'function') {
        window.rotToast('Preparando formato PDF F-MAN-001...', 'bg-info');
    }

    let r = (window.dataGlobalChecklist || []).find(item => item.id === id);
    if (!r) {
        try {
            const res = await fetch(`/api/checklist/${id}`);
            if (res.ok) r = await res.json();
        } catch(e) {}
    }

    if (!r) {
        alert('No se encontró la información del reporte seleccionado.');
        return;
    }

    // Logo de empresa según tenant
    const empLogoUrl = localStorage.getItem('fleet_empresa_logo') || window._LOGO_BASE64 || 'https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500';

    // Parsear fallas de Tracto y Remolque
    let fallasT = [];
    let fallasR = [];
    try {
        if (r.fallas_tracto_json) {
            fallasT = typeof r.fallas_tracto_json === 'string' ? JSON.parse(r.fallas_tracto_json) : r.fallas_tracto_json;
        } else if (r.fallas_tracto) {
            fallasT = typeof r.fallas_tracto === 'string' ? JSON.parse(r.fallas_tracto) : r.fallas_tracto;
        }
    } catch(e) {}
    try {
        if (r.fallas_remolque_json) {
            fallasR = typeof r.fallas_remolque_json === 'string' ? JSON.parse(r.fallas_remolque_json) : r.fallas_remolque_json;
        } else if (r.fallas_remolque) {
            fallasR = typeof r.fallas_remolque === 'string' ? JSON.parse(r.fallas_remolque) : r.fallas_remolque;
        }
    } catch(e) {}

    if (!Array.isArray(fallasT)) fallasT = [];
    if (!Array.isArray(fallasR)) fallasR = [];

    // Helper para verificar si un ítem tiene falla
    function esFallaTracto(numOTexto) {
        return fallasT.find(f => {
            const it = (f.item || '').toUpperCase();
            const ob = (f.obs || '').toUpperCase();
            const search = numOTexto.toUpperCase();
            return it.includes(search) || ob.includes(search);
        });
    }

    function esFallaRemolque(numOTexto) {
        return fallasR.find(f => {
            const it = (f.item || '').toUpperCase();
            const ob = (f.obs || '').toUpperCase();
            const search = numOTexto.toUpperCase();
            return it.includes(search) || ob.includes(search);
        });
    }

    function renderItemT(itemTxt) {
        const match = esFallaTracto(itemTxt);
        if (match) {
            return `<div class="chk-item item-falla"><span class="box-x">[ ✕ ]</span> <b class="text-danger">${itemTxt}</b></div>`;
        }
        return `<div class="chk-item"><span class="box-v">[ ✓ ]</span> <span>${itemTxt}</span></div>`;
    }

    function renderItemR(itemTxt) {
        const match = esFallaRemolque(itemTxt);
        if (match) {
            return `<div class="chk-item item-falla"><span class="box-x">[ ✕ ]</span> <b class="text-danger">${itemTxt}</b></div>`;
        }
        return `<div class="chk-item"><span class="box-v">[ ✓ ]</span> <span>${itemTxt}</span></div>`;
    }

    // Fecha formateada
    const fechaFmt = r.fecha_reporte ? new Date(r.fecha_reporte).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
    const folioStr = r.folio || ('F-' + String(r.id).padStart(5, '0'));

    // Filas para la tabla "DETALLE DE FALLA DE TRACTO" (6 filas A y B)
    let detalleTractoRows = '';
    const maxFilasT = Math.max(5, Math.ceil(fallasT.length / 2));
    for (let i = 0; i < maxFilasT; i++) {
        const fA = fallasT[i];
        const fB = fallasT[i + maxFilasT];

        const numA = fA ? (fA.item.split(' ')[0] || (i + 1)) : '';
        const descA = fA ? (fA.obs || fA.item) : '';
        const numB = fB ? (fB.item.split(' ')[0] || (i + maxFilasT + 1)) : '';
        const descB = fB ? (fB.obs || fB.item) : '';

        detalleTractoRows += `
            <tr>
                <td class="text-center font-bold" style="width:5%;">${numA}</td>
                <td style="width:45%;">${descA}</td>
                <td class="text-center font-bold" style="width:5%;">${numB}</td>
                <td style="width:45%;">${descB}</td>
            </tr>
        `;
    }

    // Filas para la tabla "FALLAS CARRETA" (6 filas A y B)
    let detalleRemolqueRows = '';
    const maxFilasR = Math.max(5, Math.ceil(fallasR.length / 2));
    for (let i = 0; i < maxFilasR; i++) {
        const fA = fallasR[i];
        const fB = fallasR[i + maxFilasR];

        const numA = fA ? (fA.item.split(' ')[0] || (i + 1)) : '';
        const descA = fA ? (fA.obs || fA.item) : '';
        const numB = fB ? (fB.item.split(' ')[0] || (i + maxFilasR + 1)) : '';
        const descB = fB ? (fB.obs || fB.item) : '';

        detalleRemolqueRows += `
            <tr>
                <td class="text-center" style="width:3%;">${fA ? ' ' : ''}</td>
                <td class="text-center" style="width:3%;">${fA ? 'S' : ''}</td>
                <td class="text-center font-bold" style="width:5%;">${numA}</td>
                <td style="width:39%;">${descA}</td>
                <td class="text-center" style="width:3%;">${fB ? ' ' : ''}</td>
                <td class="text-center" style="width:3%;">${fB ? 'S' : ''}</td>
                <td class="text-center font-bold" style="width:5%;">${numB}</td>
                <td style="width:39%;">${descB}</td>
            </tr>
        `;
    }

    const htmlPDF = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte de Fallas Flota Pesada - ${folioStr}</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
    * { box-sizing: border-box; font-family: 'Oswald', 'Inter', sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { background-color: #f1f5f9; margin: 0; padding: 10px; display: flex; justify-content: center; }
    #btnPrint { position: fixed; top: 12px; right: 20px; background-color: #0284c7; color: #fff; border: none; padding: 9px 18px; border-radius: 6px; cursor: pointer; z-index: 9999; font-weight: bold; font-size: 13px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); }
    #btnPrint:hover { background-color: #0369a1; }
    
    .page-a4 {
        width: 210mm;
        height: 294mm;
        max-height: 294mm;
        background: #ffffff;
        padding: 4mm 7mm;
        border: 1px solid #cbd5e1;
        box-shadow: 0 4px 15px rgba(0,0,0,0.08);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        color: #000;
        font-size: 8px;
        line-height: 1.15;
    }

    @media print {
        @page { size: A4 portrait; margin: 2mm 3mm; }
        body { background: transparent; padding: 0; margin: 0; display: block; }
        #btnPrint { display: none !important; }
        .page-a4 { border: none !important; box-shadow: none !important; padding: 0 !important; width: 100% !important; height: 100% !important; }
    }

    /* Tablas y encabezados estilo ISO */
    .iso-header { width: 100%; border-collapse: collapse; border: 1.5px solid #0056b3; margin-bottom: 2px; }
    .iso-header td { border: 1px solid #0056b3; text-align: center; vertical-align: middle; }
    .logo-cell { width: 22%; padding: 2px; }
    .title-cell { width: 56%; font-size: 16px; font-weight: 700; color: #0056b3; letter-spacing: 0.5px; text-transform: uppercase; }
    .qms-item { width: 22%; font-size: 8px; text-align: left !important; padding: 1px 4px; font-weight: 600; }

    .folio-banner { display: flex; justify-content: flex-end; font-size: 13px; font-weight: 700; color: #c00; margin-bottom: 1px; }

    .blue-bar {
        background-color: #0056b3;
        color: #ffffff;
        font-weight: 700;
        font-size: 9px;
        letter-spacing: 0.5px;
        padding: 2px 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border: 1px solid #0056b3;
    }

    .sub-instructions {
        background-color: #0056b3;
        color: #ffffff;
        font-size: 7px;
        font-weight: 600;
        padding: 1.5px 4px;
        line-height: 1.1;
        border: 1px solid #0056b3;
    }

    .table-grid { width: 100%; border-collapse: collapse; border: 1px solid #0056b3; margin-bottom: 2px; }
    .table-grid td, .table-grid th { border: 1px solid #0056b3; padding: 1px 4px; font-size: 8px; }
    .bg-light-blue { background-color: #eaf2fc; font-weight: 700; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }
    .text-danger { color: #b91c1c !important; }

    /* Grillas de 4 columnas para ítems */
    .checklist-4col {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        border: 1px solid #0056b3;
        border-top: none;
        margin-bottom: 2px;
        gap: 0;
    }
    .col-sys {
        border-right: 1px solid #0056b3;
        padding: 1.5px 3px;
        display: flex;
        flex-direction: column;
    }
    .col-sys:last-child { border-right: none; }
    .sys-title {
        font-weight: 700;
        font-size: 8px;
        text-align: center;
        color: #0056b3;
        border-bottom: 1px solid #93c5fd;
        padding-bottom: 1px;
        margin-bottom: 1px;
        text-transform: uppercase;
    }
    .chk-item {
        font-size: 7px;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
        gap: 2px;
    }
    .box-v { color: #64748b; font-size: 7px; font-weight: bold; }
    .box-x { color: #dc2626; font-size: 7.5px; font-weight: 900; }
    .item-falla { background-color: #fee2e2; border-radius: 2px; padding: 0 1px; }

    /* Tablas de detalle de falla */
    .table-fallas { width: 100%; border-collapse: collapse; border: 1px solid #0056b3; margin-bottom: 2px; }
    .table-fallas th { background-color: #0056b3; color: #fff; font-size: 7.5px; font-weight: 700; padding: 1px 3px; border: 1px solid #0056b3; }
    .table-fallas td { border: 1px solid #0056b3; padding: 1px 3px; font-size: 7.5px; height: 12px; vertical-align: middle; }

    /* Firmas */
    .conformidad-box {
        display: grid;
        grid-template-columns: 1fr 1fr;
        border: 1px solid #0056b3;
        border-top: none;
        height: 48px;
    }
    .sign-col {
        border-right: 1px solid #0056b3;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 2px 4px;
        text-align: center;
    }
    .sign-col:last-child { border-right: none; }
    .sign-img-area { height: 32px; display: flex; align-items: center; justify-content: center; }
    .sign-img-area img { max-height: 30px; max-width: 140px; object-fit: contain; }
    .sign-footer-text { background-color: #eaf2fc; font-size: 7.5px; font-weight: 700; padding: 1px 0; color: #0056b3; border-top: 1px solid #93c5fd; }
</style>
</head>
<body>

<button id="btnPrint" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>

<div class="page-a4">
    <!-- ENCABEZADO ISO -->
    <div>
        <table class="iso-header">
            <tr>
                <td class="logo-cell" rowspan="3">
                    <img src="${empLogoUrl}" alt="Logo" style="max-width: 100%; max-height: 36px; object-fit: contain;">
                </td>
                <td class="title-cell" rowspan="3">
                    REPORTE DE FALLAS FLOTA PESADA
                </td>
                <td class="qms-item"><b>CÓDIGO:</b> F-MAN-001</td>
            </tr>
            <tr><td class="qms-item"><b>VERSIÓN:</b> 0</td></tr>
            <tr><td class="qms-item"><b>EMISIÓN:</b> 10/11/2025</td></tr>
        </table>
        <div class="folio-banner">
            Nº ${folioStr}
        </div>
    </div>

    <!-- SECCIÓN 1: DATOS DE TRACTO Y CONDUCTOR -->
    <div>
        <div class="blue-bar">
            <span>DATOS DE TRACTO Y CONDUCTOR</span>
            <span>O.S. ${r.orden_servicio || '—'}</span>
        </div>
        <table class="table-grid">
            <tr>
                <td class="bg-light-blue" style="width:14%;">PROCEDENCIA:</td>
                <td style="width:36%;">${r.procedencia || '—'}</td>
                <td class="bg-light-blue text-center" style="width:16%;">DATOS UNIDAD</td>
                <td class="bg-light-blue text-center" style="width:11%;">PLACA</td>
                <td class="bg-light-blue text-center" style="width:11%;">KM INICIAL</td>
                <td class="bg-light-blue text-center" style="width:12%;">KM FINAL / HRS</td>
            </tr>
            <tr>
                <td class="bg-light-blue">CONDUCTOR:</td>
                <td class="font-bold">${r.conductor || '—'}</td>
                <td class="text-center font-bold">TRACTO</td>
                <td class="text-center font-bold" style="color:#0056b3; font-size:9.5px;">${r.placa_tracto || '—'}</td>
                <td class="text-center">${r.km_inicial || '—'}</td>
                <td class="text-center">${r.km_final || r.km_inicial || '—'}</td>
            </tr>
            <tr>
                <td class="bg-light-blue">FECHA:</td>
                <td>${fechaFmt}</td>
                <td class="text-center font-bold">REMOLQUE</td>
                <td class="text-center font-bold" style="color:#0056b3; font-size:9.5px;">${r.placa_remolque || '—'}</td>
                <td class="text-center">${r.horas_motor ? 'HRS: ' + r.horas_motor : '—'}</td>
                <td class="text-center">—</td>
            </tr>
        </table>
    </div>

    <!-- SECCIÓN 2: TRACTO (SISTEMAS Y DETALLE DE FALLAS) -->
    <div>
        <div class="sub-instructions">
            1.- MARQUE CON "✓" SI SE ENCUENTRA EN BUEN ESTADO, MARQUE CON "X" SI SE PRESENTA OBSERVACIÓN, LUEGO DETALLE LA OCURRENCIA EN EL RECUADRO COLOCANDO EL NÚMERO DEL ÍTEM OBSERVADO.
        </div>
        <div class="checklist-4col">
            <!-- Col 1: MOTOR -->
            <div class="col-sys">
                <div class="sys-title">MOTOR</div>
                ${(SISTEMAS_TRACTO.motor || []).map(it => renderItemT(it)).join('')}
            </div>
            <!-- Col 2: CAJA - CORONAS -->
            <div class="col-sys">
                <div class="sys-title">CAJA - CORONAS</div>
                ${(SISTEMAS_TRACTO.caja || []).map(it => renderItemT(it)).join('')}
            </div>
            <!-- Col 3: REFRIGERACIÓN & DIRECCIÓN -->
            <div class="col-sys">
                <div class="sys-title">REFRIGERACIÓN</div>
                ${(SISTEMAS_TRACTO.refri || []).map(it => renderItemT(it)).join('')}
                <div class="sys-title" style="margin-top:1px;">DIRECCIÓN</div>
                ${(SISTEMAS_TRACTO.direccion || []).map(it => renderItemT(it)).join('')}
            </div>
            <!-- Col 4: CABINA Y CHASIS -->
            <div class="col-sys">
                <div class="sys-title">CABINA Y CHASIS</div>
                ${(SISTEMAS_TRACTO.cabina || []).map(it => renderItemT(it)).join('')}
            </div>
        </div>

        <table class="table-fallas">
            <thead>
                <tr>
                    <th style="width:5%;">Nº</th>
                    <th style="width:45%;">DETALLE DE FALLA DE TRACTO</th>
                    <th style="width:5%;">Nº</th>
                    <th style="width:45%;">DETALLE DE FALLA DE TRACTO</th>
                </tr>
            </thead>
            <tbody>
                ${detalleTractoRows}
            </tbody>
        </table>
    </div>

    <!-- SECCIÓN 3: SEMIRREMOLQUE / CARRETA (SISTEMAS Y DETALLE DE FALLAS) -->
    <div>
        <div class="sub-instructions">
            2.- MARQUE CON "✓" SI SE ENCUENTRA EN BUEN ESTADO, MARQUE CON "X" SI SE PRESENTA OBSERVACIÓN, LUEGO DETALLE LA OCURRENCIA EN EL RECUADRO MARCANDO "T" O "S" SI LA OBSERVACIÓN CORRESPONDE AL TRACTO O SEMIRREMOLQUE.
        </div>
        <div class="checklist-4col">
            <!-- Col 1: FRENOS & CARRETA -->
            <div class="col-sys">
                <div class="sys-title">FRENOS</div>
                ${(SISTEMAS_REMOLQUE.frenos || []).map(it => renderItemR(it)).join('')}
                <div class="sys-title" style="margin-top:1px;">CARRETA</div>
                ${(SISTEMAS_REMOLQUE.carreta || []).map(it => renderItemR(it)).join('')}
            </div>
            <!-- Col 2: SISTEMA ELÉCTRICO -->
            <div class="col-sys">
                <div class="sys-title">SISTEMA ELÉCTRICO</div>
                ${(SISTEMAS_REMOLQUE.electrico || []).map(it => renderItemR(it)).join('')}
            </div>
            <!-- Col 3: SUSPENSIÓN & FURGÓN -->
            <div class="col-sys">
                <div class="sys-title">SUSPENSIÓN</div>
                ${(SISTEMAS_REMOLQUE.suspension || []).map(it => renderItemR(it)).join('')}
                <div class="sys-title" style="margin-top:1px;">FURGÓN</div>
                ${(SISTEMAS_REMOLQUE.furgon || []).map(it => renderItemR(it)).join('')}
            </div>
            <!-- Col 4: LLANTAS & TERMOKING -->
            <div class="col-sys">
                <div class="sys-title">LLANTAS & ACCESORIOS</div>
                ${(SISTEMAS_REMOLQUE.llantas || []).slice(0, 6).map(it => renderItemR(it)).join('')}
                <div class="sys-title" style="margin-top:1px;">TERMOKING / OTROS</div>
                ${(SISTEMAS_REMOLQUE.termoking || []).slice(0, 6).map(it => renderItemR(it)).join('')}
            </div>
        </div>

        <table class="table-fallas">
            <thead>
                <tr>
                    <th style="width:3%;">T</th>
                    <th style="width:3%;">S</th>
                    <th style="width:5%;">Nº</th>
                    <th style="width:39%;">FALLAS CARRETA</th>
                    <th style="width:3%;">T</th>
                    <th style="width:3%;">S</th>
                    <th style="width:5%;">Nº</th>
                    <th style="width:39%;">FALLAS CARRETA</th>
                </tr>
            </thead>
            <tbody>
                ${detalleRemolqueRows}
            </tbody>
        </table>
    </div>

    <!-- SECCIÓN 4: CONFORMIDAD DEL REPORTE -->
    <div>
        <div class="blue-bar">
            <span>3.- CONFORMIDAD DEL REPORTE</span>
        </div>
        <div class="conformidad-box">
            <div class="sign-col">
                <div class="sign-img-area">
                    ${r.firma_conductor ? `<img src="${r.firma_conductor}" alt="Firma Conductor">` : '<span style="color:#94a3b8; font-size:7.5px;">(Sin firma digital)</span>'}
                </div>
                <div class="sign-footer-text">FIRMA DEL CONDUCTOR</div>
            </div>
            <div class="sign-col">
                <div class="sign-img-area"></div>
                <div class="sign-footer-text">SELLO Y FIRMA DE MANTENIMIENTO</div>
            </div>
        </div>
    </div>
</div>

</body>
</html>
    `;

    const blob = new Blob([htmlPDF], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
};
