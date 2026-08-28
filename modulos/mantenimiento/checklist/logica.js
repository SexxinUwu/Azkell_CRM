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

    // Inicializar comboboxes de placas, conductores y órdenes de viaje
    window.poblarPlacasChecklist();
    window.poblarConductoresChecklist();
    window.ckCargarOrdenesViaje();

    // Renderizar acordeones completos
    window.ckRenderizarTodosAcordeones();

    // Inicializar firma digital
    window.initCanvasFirmaChecklist();

    // Cargar tabla principal
    window.cargarTablaChecklist(true);
};

// ── INTEGRACIÓN ÓRDENES DE VIAJE (OPERACIONES) ───────────────────
window.dataGlobalOrdenesViaje = [];

window.ckCargarOrdenesViaje = async function(forceSync) {
    try {
        let res = await fetch('/api/operaciones/ordenes-viaje?limit=300');
        let json = await res.json();
        if (json && json.ok && json.data && json.data.length > 0 && !forceSync) {
            window.dataGlobalOrdenesViaje = json.data;
        } else {
            // Si la tabla local aún no tiene viajes, sincronizar automáticamente
            const syncRes = await fetch('/api/operaciones/ordenes-viaje/sincronizar', { method: 'POST' });
            const syncJson = await syncRes.json();
            if (syncJson && syncJson.ok) {
                const retryRes = await fetch('/api/operaciones/ordenes-viaje?limit=300');
                const retryJson = await retryRes.json();
                window.dataGlobalOrdenesViaje = (retryJson && retryJson.data) || [];
            }
        }
    } catch(err) {
        console.warn('Error cargando ordenes de viaje:', err);
    }
};

window.ckSincronizarViajes = async function(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const icon = document.getElementById('ck-sync-viajes-icon');
    const btn = document.getElementById('btnCkSyncViajes');
    if (icon) icon.classList.add('bi-arrow-repeat-spin');
    if (btn) btn.disabled = true;

    try {
        const r = await fetch('/api/operaciones/ordenes-viaje/sincronizar', { method: 'POST' });
        const data = await r.json();
        if (data.ok) {
            await window.ckCargarOrdenesViaje(true);
            if (typeof window.showToastNotification === 'function') {
                window.showToastNotification(`Sincronización completa: ${data.insertados || 0} nuevos viajes`, 'success');
            }
            // Si el dropdown está abierto, refrescarlo
            window._cbFiltrarViaje();
        } else {
            throw new Error(data.error || 'Error desconocido');
        }
    } catch(err) {
        if (typeof window.showToastNotification === 'function') {
            window.showToastNotification('Error al sincronizar viajes: ' + err.message, 'error');
        }
    } finally {
        if (icon) icon.classList.remove('bi-arrow-repeat-spin');
        if (btn) btn.disabled = false;
    }
};

window._cbFiltrarViaje = function() {
    const input = document.getElementById('ck_orden_viaje-txt');
    const dd = document.getElementById('ck_orden_viaje-dd');
    const btnClear = document.getElementById('ck_btn_clear_viaje');
    if (!input || !dd) return;

    const val = input.value || '';
    if (btnClear) {
        if (val.trim()) btnClear.classList.remove('d-none');
        else btnClear.classList.add('d-none');
    }

    // Si el usuario vació el texto manualmente, desvincular todo
    if (!val.trim()) {
        const inputHidden = document.getElementById('ck_orden_viaje');
        if (inputHidden && inputHidden.value) {
            window.ckLimpiarViajeVinculado(false);
        }
    }

    const q = val.trim().toUpperCase();
    const viajes = window.dataGlobalOrdenesViaje || [];

    let filtrados = viajes;
    if (q) {
        filtrados = viajes.filter(v => {
            const num = (v.viaje || '').toUpperCase();
            const tracto = (v.placa_tracto || '').toUpperCase();
            const carreta = (v.placa_remolque || '').toUpperCase();
            const cond = (v.conductor || '').toUpperCase();
            const ruta = (v.ruta || '').toUpperCase();
            return num.includes(q) || tracto.includes(q) || carreta.includes(q) || cond.includes(q) || ruta.includes(q);
        });
    }

    filtrados = filtrados.slice(0, 50);

    if (filtrados.length === 0) {
        dd.innerHTML = '<div class="p-3 text-center text-muted small"><i class="bi bi-search me-1"></i>No se encontraron órdenes de viaje coincidentes.<br><button type="button" class="btn btn-xs btn-outline-primary mt-2 rounded-pill" onclick="window.ckSincronizarViajes()">Sincronizar ahora</button></div>';
        dd.style.display = 'block';
        return;
    }

    let html = '';
    filtrados.forEach(v => {
        const fechaFmt = v.fecha_viaje ? new Date(v.fecha_viaje).toLocaleDateString('es-PE') : '';
        const carretaTxt = v.placa_remolque ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-1">${v.placa_remolque}</span>` : '<span class="text-muted fst-italic ms-1">Sin carreta</span>';
        
        const dataJson = JSON.stringify(v).replace(/"/g, '&quot;');

        html += `
            <div class="p-2 border-bottom cursor-pointer cb-item-viaje" style="transition:background 0.15s ease;" onmousedown="window.ckSeleccionarViaje(${dataJson})" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='#ffffff'">
                <div class="d-flex align-items-center justify-content-between mb-1">
                    <span class="fw-bold text-primary" style="font-size:0.88rem;"><i class="bi bi-diagram-3-fill me-1"></i>Viaje: ${v.viaje}</span>
                    <span class="badge bg-secondary-subtle text-secondary" style="font-size:0.7rem;">${fechaFmt}</span>
                </div>
                <div class="d-flex flex-wrap align-items-center gap-1 mb-1" style="font-size:0.75rem;">
                    <span class="badge bg-primary-subtle text-primary border border-primary-subtle">${v.placa_tracto || 'TRACTO'}</span>
                    ${carretaTxt}
                    <span class="text-secondary fw-semibold text-truncate ms-1" style="max-width:200px;"><i class="bi bi-person-fill me-1"></i>${v.conductor || '---'}</span>
                </div>
                ${v.ruta ? `<div class="text-truncate mt-1" style="font-size:0.72rem; color:#475569;"><i class="bi bi-signpost-2-fill text-primary me-1"></i><b>Ruta:</b> ${v.ruta}</div>` : ''}
            </div>
        `;
    });

    dd.innerHTML = html;
    dd.style.display = 'block';
};

window._cbHideViaje = function() {
    setTimeout(function() {
        const dd = document.getElementById('ck_orden_viaje-dd');
        if (dd) dd.style.display = 'none';
    }, 250);
};

window.ckSeleccionarViaje = function(v) {
    if (!v) return;
    const inputHidden = document.getElementById('ck_orden_viaje');
    const inputTxt = document.getElementById('ck_orden_viaje-txt');
    const btnClear = document.getElementById('ck_btn_clear_viaje');
    if (inputHidden) inputHidden.value = v.viaje || '';
    if (inputTxt) inputTxt.value = v.viaje || '';
    if (btnClear) btnClear.classList.remove('d-none');

    // Autocompletar Placa Tracto
    if (v.placa_tracto) {
        const ptHidden = document.getElementById('ck_placa_tracto');
        const ptTxt = document.getElementById('ck_placa_tracto-txt');
        if (ptHidden) ptHidden.value = v.placa_tracto;
        if (ptTxt) ptTxt.value = v.placa_tracto;
        if (typeof window.ckSyncPlacaTracto === 'function') window.ckSyncPlacaTracto();
    }

    // Autocompletar Placa Remolque
    if (v.placa_remolque) {
        const prHidden = document.getElementById('ck_placa_remolque');
        const prTxt = document.getElementById('ck_placa_remolque-txt');
        if (prHidden) prHidden.value = v.placa_remolque;
        if (prTxt) prTxt.value = v.placa_remolque;
        if (typeof window.ckSyncPlacaRemolque === 'function') window.ckSyncPlacaRemolque();
    } else {
        const prHidden = document.getElementById('ck_placa_remolque');
        const prTxt = document.getElementById('ck_placa_remolque-txt');
        if (prHidden) prHidden.value = '';
        if (prTxt) prTxt.value = '';
        if (typeof window.ckSyncPlacaRemolque === 'function') window.ckSyncPlacaRemolque();
    }

    // Autocompletar Conductor
    if (v.conductor) {
        const condHidden = document.getElementById('ck_conductor');
        const condTxt = document.getElementById('ck_conductor-txt');
        if (condHidden) condHidden.value = v.conductor;
        if (condTxt) condTxt.value = v.conductor;
    }

    // Autocompletar Procedencia / Ruta
    if (v.ruta) {
        const procInput = document.getElementById('ck_procedencia');
        if (procInput) procInput.value = v.ruta;
    }

    // Mostrar panel informativo de viaje vinculado
    const infoBox = document.getElementById('ck_viaje_seleccionado_info');
    const lblNum = document.getElementById('ck_lbl_viaje_num');
    const lblDet = document.getElementById('ck_lbl_viaje_detalles');
    if (infoBox) infoBox.classList.remove('d-none');
    if (lblNum) lblNum.textContent = v.viaje;
    if (lblDet) {
        lblDet.textContent = `Tracto: ${v.placa_tracto || '---'} | Carreta: ${v.placa_remolque || 'Ninguna'} | Conductor: ${v.conductor || '---'} ${v.ruta ? '| Ruta: ' + v.ruta : ''}`;
    }

    const dd = document.getElementById('ck_orden_viaje-dd');
    if (dd) dd.style.display = 'none';

    if (typeof window.showToastNotification === 'function') {
        window.showToastNotification(`Viaje ${v.viaje} vinculado con éxito. Datos autocompletados.`, 'success');
    }
};

window.ckLimpiarViajeVinculado = function(showToast) {
    const inputHidden = document.getElementById('ck_orden_viaje');
    const inputTxt = document.getElementById('ck_orden_viaje-txt');
    const btnClear = document.getElementById('ck_btn_clear_viaje');
    if (inputHidden) inputHidden.value = '';
    if (inputTxt) inputTxt.value = '';
    if (btnClear) btnClear.classList.add('d-none');

    // Vaciar Placa Tracto
    const ptHidden = document.getElementById('ck_placa_tracto');
    const ptTxt = document.getElementById('ck_placa_tracto-txt');
    if (ptHidden) ptHidden.value = '';
    if (ptTxt) ptTxt.value = '';

    // Vaciar Placa Remolque
    const prHidden = document.getElementById('ck_placa_remolque');
    const prTxt = document.getElementById('ck_placa_remolque-txt');
    if (prHidden) prHidden.value = '';
    if (prTxt) prTxt.value = '';

    // Vaciar Conductor
    const condHidden = document.getElementById('ck_conductor');
    const condTxt = document.getElementById('ck_conductor-txt');
    if (condHidden) condHidden.value = '';
    if (condTxt) condTxt.value = '';

    // Vaciar Procedencia
    const procInput = document.getElementById('ck_procedencia');
    if (procInput) procInput.value = '';

    // Vaciar Kilometraje y Horómetro
    const kmInput = document.getElementById('ck_kilometraje');
    if (kmInput) kmInput.value = '';
    const horoInput = document.getElementById('ck_horometro');
    if (horoInput) horoInput.value = '';

    // Ocultar tarjetas de documentos informativos
    const docTracto = document.getElementById('ck-doc-box-tracto');
    if (docTracto) docTracto.style.display = 'none';
    const docRemolque = document.getElementById('ck-doc-box-remolque');
    if (docRemolque) docRemolque.style.display = 'none';

    // Ocultar panel informativo de viaje vinculado
    const infoBox = document.getElementById('ck_viaje_seleccionado_info');
    if (infoBox) infoBox.classList.add('d-none');

    const dd = document.getElementById('ck_orden_viaje-dd');
    if (dd) dd.style.display = 'none';

    if (showToast && typeof window.showToastNotification === 'function') {
        window.showToastNotification('Se quitó la orden de viaje y se vaciaron los campos dependientes.', 'info');
    }
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

    const editIdEl = document.getElementById('ck_reporte_id_edit');
    if (editIdEl) editIdEl.value = '';

    const lblTitulo = document.getElementById('lbl-ck-modal-titulo');
    if (lblTitulo) lblTitulo.textContent = 'Nuevo Reporte de Fallas';

    const btn = document.getElementById('btnGuardarChecklist');
    if (btn) btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Guardar Reporte de Fallas';

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
                    <button type="button" class="btn-close position-absolute top-0 end-0 bg-white p-1" style="font-size:0.6rem;"></button>
                `;
                imgDiv.querySelector('.btn-close').onclick = function() {
                    const idx = fotosChecklistBase64.indexOf(base64);
                    if (idx > -1) fotosChecklistBase64.splice(idx, 1);
                    imgDiv.remove();
                };
                wrap.appendChild(imgDiv);
            }
        };
        reader.readAsDataURL(file);
    });
    input.value = '';
};

// ── CARGAR Y FILTRAR TABLA DE CHECKLIST ─────────────────────────
window.filtrarEstadoChecklist = function(estado, btn) {
    estadoFiltroActualChecklist = estado;
    const group = document.getElementById('btn-group-estados-checklist');
    if (group) {
        group.querySelectorAll('.ck-segment-item, .btn').forEach(b => b.classList.remove('active'));
    }
    if (btn) btn.classList.add('active');
    window.filtrarChecklist();
};

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
            const trac = (r.placa_tracto || '').toLowerCase();
            const rem = (r.placa_remolque || '').toLowerCase();
            const cond = (r.conductor || '').toLowerCase();
            const proc = (r.procedencia || '').toLowerCase();
            return fol.includes(query) || trac.includes(query) || rem.includes(query) || cond.includes(query) || proc.includes(query);
        });
    }

    window.renderizarTablaChecklist(list);
    window.actualizarKPIsChecklist(window.dataGlobalChecklist);
};

window.renderizarTablaChecklist = function(lista) {
    const c = document.getElementById('contenedorChecklistDinamico');
    const cardContainer = document.getElementById('checklistCardContainer');

    if (!lista || lista.length === 0) {
        if (c) c.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-3 d-block mb-2 text-secondary"></i>No se encontraron reportes registrados.</td></tr>`;
        if (cardContainer) cardContainer.innerHTML = `<div class="text-center py-5 text-muted"><i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>No se encontraron reportes registrados.</div>`;
        return;
    }

    let htmlTable = '';
    let htmlCards = '';

    lista.forEach(r => {
        let badgeEstado = '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-3 py-1 fw-bold text-uppercase" style="font-size:0.72rem; border-radius:8px;">Pendiente</span>';
        let badgeEstadoMobile = '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1 fw-bold text-uppercase" style="font-size:0.68rem; border-radius:6px;">Pendiente</span>';
        if (r.estado === 'En Proceso') {
            badgeEstado = '<span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle px-3 py-1 fw-bold text-uppercase" style="font-size:0.72rem; border-radius:8px;">En Taller</span>';
            badgeEstadoMobile = '<span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle px-2 py-1 fw-bold text-uppercase" style="font-size:0.68rem; border-radius:6px;">En Taller</span>';
        } else if (r.estado === 'Finalizado') {
            badgeEstado = '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle px-3 py-1 fw-bold text-uppercase" style="font-size:0.72rem; border-radius:8px;">Finalizado</span>';
            badgeEstadoMobile = '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle px-2 py-1 fw-bold text-uppercase" style="font-size:0.68rem; border-radius:6px;">Finalizado</span>';
        }

        let otsHtml = '<span class="text-muted small">Sin OTs</span>';
        if (r.ots_generadas_json) {
            try {
                const ots = typeof r.ots_generadas_json === 'string' ? JSON.parse(r.ots_generadas_json) : r.ots_generadas_json;
                if (Array.isArray(ots) && ots.length) {
                    otsHtml = ots.map(o => `<span class="badge bg-secondary-subtle text-dark border me-1 fw-semibold" style="font-size:0.72rem; border-radius:6px;">${o.idOt} (${o.placa})</span>`).join('');
                }
            } catch(e) {}
        }

        const fechaFmt = r.fecha_reporte ? new Date(r.fecha_reporte).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
        const fechaCorta = r.fecha_reporte ? new Date(r.fecha_reporte).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';

        // Conteo de fallas reportadas
        let countFallas = 0;
        try {
            const fT = r.fallas_tracto_json ? (typeof r.fallas_tracto_json === 'string' ? JSON.parse(r.fallas_tracto_json) : r.fallas_tracto_json) : [];
            const fR = r.fallas_remolque_json ? (typeof r.fallas_remolque_json === 'string' ? JSON.parse(r.fallas_remolque_json) : r.fallas_remolque_json) : [];
            countFallas = (Array.isArray(fT) ? fT.length : 0) + (Array.isArray(fR) ? fR.length : 0);
        } catch(e) {}

        const isFinalizado = (r.estado === 'Finalizado');

        // 1. Table row (Desktop)
        const viajeBadge = r.orden_viaje ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle me-1" style="font-size:0.7rem; font-weight:700;"><i class="bi bi-diagram-3-fill me-1"></i>${r.orden_viaje}</span>` : '';

        htmlTable += `
        <tr>
            <td class="ps-4 fw-bold text-primary font-monospace" style="min-width: 120px; font-size:0.9rem;">
                <div>${r.folio}</div>
                ${viajeBadge ? `<div class="mt-1">${viajeBadge}</div>` : ''}
            </td>
            <td style="min-width: 135px;"><span class="text-secondary fw-medium" style="font-size:0.82rem;">${fechaFmt}</span></td>
            <td style="min-width: 105px;">
                ${r.placa_tracto ? `<span class="badge bg-white text-dark border shadow-2xs fw-bolder px-2 py-2 text-center" style="min-width: 80px; font-size: 0.82rem; border-radius: 8px; letter-spacing: 0.5px;">${r.placa_tracto}</span>` : '<span class="text-muted small">—</span>'}
            </td>
            <td style="min-width: 105px;">
                ${r.placa_remolque ? `<span class="badge bg-white text-dark border shadow-2xs fw-bolder px-2 py-2 text-center" style="min-width: 80px; font-size: 0.82rem; border-radius: 8px; letter-spacing: 0.5px;">${r.placa_remolque}</span>` : '<span class="text-muted small">—</span>'}
            </td>
            <td style="min-width: 180px; white-space: nowrap;">
                <div class="fw-bold text-dark" style="font-size: 0.86rem; white-space: nowrap;">${r.conductor || 'Sin Conductor'}</div>
                <div class="text-muted" style="font-size: 0.76rem; white-space: nowrap;"><i class="bi bi-geo-alt me-1 text-primary"></i>${r.procedencia || 'En Ruta'}</div>
            </td>
            <td class="text-center" style="min-width: 110px;">${badgeEstado}</td>
            <td class="text-center" style="min-width: 130px;">${otsHtml}</td>
            <td class="pe-4 text-end" style="min-width: 110px;">
                <div class="d-inline-flex align-items-center justify-content-end gap-1">
                    <!-- Botón PDF directo afuera -->
                    <button type="button" class="ck-action-btn ck-btn-pdf" onclick="window.generarPDF_Checklist(${r.id})" title="Imprimir Formato PDF F-MAN-001">
                        <i class="bi bi-file-earmark-pdf"></i>
                    </button>

                    <!-- Menú Desplegable 3 Puntos (Opciones adicionales) -->
                    <div class="dropstart d-inline-block">
                        <button class="btn btn-light border shadow-2xs rounded-3 p-0 d-flex align-items-center justify-content-center" 
                                type="button" 
                                data-bs-toggle="dropdown" 
                                data-bs-boundary="viewport"
                                aria-expanded="false" 
                                style="width: 32px; height: 32px; color: #475569;" 
                                title="Más opciones">
                            <i class="bi bi-three-dots-vertical fs-6"></i>
                        </button>
                        <ul class="dropdown-menu shadow-lg border-0 rounded-3 p-1" style="font-size: 0.82rem; min-width: 170px; z-index: 1050;">
                            <li>
                                <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-medium text-dark" href="javascript:void(0)" onclick="window.abrirDetalleChecklist(${r.id})">
                                    <i class="bi bi-eye text-primary fs-6"></i> Ver Detalle
                                </a>
                            </li>
                            ${!isFinalizado ? `
                            <li>
                                <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-medium text-dark" href="javascript:void(0)" onclick="window.abrirEditarChecklist(${r.id})">
                                    <i class="bi bi-pencil text-secondary fs-6"></i> Editar Reporte
                                </a>
                            </li>
                            ` : ''}
                            <li>
                                <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-medium text-dark" href="javascript:void(0)" onclick="window.abrirModalGenerarOTs(${r.id})">
                                    <i class="bi bi-lightning-charge-fill text-warning fs-6"></i> Generar / Ver OTs
                                </a>
                            </li>
                            <li><hr class="dropdown-divider my-1"></li>
                            <li>
                                <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-semibold text-danger" href="javascript:void(0)" onclick="window.eliminarChecklist(${r.id})">
                                    <i class="bi bi-trash3 text-danger fs-6"></i> Eliminar
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
            </td>
        </tr>
        `;

        // 2. Mobile Native Card
        htmlCards += `
        <div class="ck-mobile-card">
            <!-- Header Card: Folio + Fecha + Estado -->
            <div class="d-flex align-items-center justify-content-between mb-2">
                <div class="d-flex align-items-center gap-2">
                    <span class="fw-bolder text-primary font-monospace" style="font-size:0.95rem;">${r.folio}</span>
                    <span class="text-muted small" style="font-size:0.75rem;">• ${fechaCorta}</span>
                </div>
                <div>${badgeEstadoMobile}</div>
            </div>

            <!-- Placas y Conductor -->
            <div class="d-flex align-items-center gap-2 mb-2">
                ${r.placa_tracto ? `<span class="badge bg-light text-dark border fw-bold px-2 py-1" style="font-size:0.8rem; border-radius:6px;">🚛 ${r.placa_tracto}</span>` : ''}
                ${r.placa_remolque ? `<span class="badge bg-light text-secondary border fw-bold px-2 py-1" style="font-size:0.8rem; border-radius:6px;">🚛 ${r.placa_remolque}</span>` : ''}
            </div>

            <div class="mb-2">
                <div class="fw-bold text-dark" style="font-size:0.88rem;">${r.conductor || 'Sin Conductor asignado'}</div>
                <div class="text-muted small" style="font-size:0.75rem;"><i class="bi bi-geo-alt-fill text-danger me-1"></i>${r.procedencia || 'Ruta no especificada'}</div>
            </div>

            <!-- Fallas & OTs pill -->
            <div class="d-flex align-items-center justify-content-between pt-2 border-top mb-3">
                <span class="badge bg-danger-subtle text-danger fw-semibold" style="font-size:0.72rem; border-radius:6px;">
                    <i class="bi bi-exclamation-triangle-fill me-1"></i>${countFallas} ${countFallas === 1 ? 'Falla reportada' : 'Fallas reportadas'}
                </span>
                ${r.km_inicial ? `<span class="text-muted small font-monospace" style="font-size:0.75rem;"><i class="bi bi-speedometer2 me-1"></i>${Number(r.km_inicial).toLocaleString()} km</span>` : ''}
            </div>

            <!-- Botones de Acción Móvil -->
            <div class="d-flex align-items-center justify-content-between gap-1 pt-2 border-top">
                <button type="button" class="btn btn-sm btn-outline-primary fw-bold flex-grow-1 d-flex align-items-center justify-content-center gap-1 py-1" onclick="window.abrirDetalleChecklist(${r.id})" style="border-radius:8px; font-size:0.78rem;">
                    <i class="bi bi-eye"></i> Detalle
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger fw-semibold px-3 py-1 d-flex align-items-center gap-1" onclick="window.generarPDF_Checklist(${r.id})" title="PDF" style="border-radius:8px; font-size:0.78rem;">
                    <i class="bi bi-file-earmark-pdf"></i> PDF
                </button>
                <div class="dropdown">
                    <button class="btn btn-sm btn-light border shadow-2xs rounded-3 px-2 py-1" type="button" data-bs-toggle="dropdown" data-bs-boundary="viewport" aria-expanded="false" style="border-radius:8px;">
                        <i class="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-3 p-1" style="font-size: 0.82rem; min-width: 170px; z-index: 1050;">
                        ${!isFinalizado ? `
                        <li>
                            <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-medium text-dark" href="javascript:void(0)" onclick="window.abrirEditarChecklist(${r.id})">
                                <i class="bi bi-pencil text-secondary fs-6"></i> Editar Reporte
                            </a>
                        </li>
                        ` : ''}
                        <li>
                            <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-medium text-dark" href="javascript:void(0)" onclick="window.abrirModalGenerarOTs(${r.id})">
                                <i class="bi bi-lightning-charge-fill text-warning fs-6"></i> Generar / Ver OTs
                            </a>
                        </li>
                        <li><hr class="dropdown-divider my-1"></li>
                        <li>
                            <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-semibold text-danger" href="javascript:void(0)" onclick="window.eliminarChecklist(${r.id})">
                                <i class="bi bi-trash3 text-danger fs-6"></i> Eliminar
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
        `;
    });

    if (c) c.innerHTML = htmlTable;
    if (cardContainer) cardContainer.innerHTML = htmlCards;
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

// ── ABRIR MODAL PARA EDITAR REPORTE EXISTENTE ────────────────────
window.abrirEditarChecklist = async function(id) {
    let r = (window.dataGlobalChecklist || []).find(item => item.id === id);
    if (!r) {
        try {
            const res = await fetch(`/api/checklist/${id}`);
            if (res.ok) r = await res.json();
        } catch(e) {}
    }
    if (!r) {
        alert('No se encontró la información del reporte a editar.');
        return;
    }

    if (r.estado === 'Finalizado') {
        alert('⚠️ Este reporte de fallas ya se encuentra FINALIZADO y no puede ser modificado.');
        return;
    }

    // Cerrar modal de detalle si estuviera abierto
    const modalDet = document.getElementById('modalDetalleChecklistFull');
    if (modalDet) {
        const inst = bootstrap.Modal.getInstance(modalDet);
        if (inst) inst.hide();
    }
    document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
    document.body.classList.remove('modal-open');

    // Resetear form y establecer ID de edición
    const form = document.getElementById('formNuevoChecklist');
    if (form) form.reset();

    const editIdEl = document.getElementById('ck_reporte_id_edit');
    if (editIdEl) editIdEl.value = r.id;

    const lblTitulo = document.getElementById('lbl-ck-modal-titulo');
    if (lblTitulo) lblTitulo.textContent = 'Editar Reporte de Fallas';

    const lblFolio = document.getElementById('lbl-ck-folio-header');
    if (lblFolio) lblFolio.textContent = r.folio || `N° ${r.id}`;

    const btn = document.getElementById('btnGuardarChecklist');
    if (btn) btn.innerHTML = '<i class="bi bi-save-fill me-1"></i> Actualizar Reporte de Fallas';

    // Fecha del reporte original
    const inputFecha = document.getElementById('ck_fecha_reporte');
    if (inputFecha && r.fecha_reporte) {
        inputFecha.value = r.fecha_reporte.split('T')[0];
    }

    // Población de Comboboxes
    window.poblarPlacasChecklist();
    window.poblarConductoresChecklist();

    setTimeout(() => {
        if (typeof window._cbSet === 'function') {
            window._cbSet('ck_placa_tracto', r.placa_tracto || '', r.placa_tracto || '');
            window._cbSet('ck_placa_remolque', r.placa_remolque || '', r.placa_remolque || '');
            window._cbSet('ck_conductor', r.conductor || '', r.conductor || '');
        }
        const txtT = document.getElementById('ck_placa_tracto-txt');
        if (txtT) txtT.value = r.placa_tracto || '';
        const txtR = document.getElementById('ck_placa_remolque-txt');
        if (txtR) txtR.value = r.placa_remolque || '';
        const txtC = document.getElementById('ck_conductor-txt');
        if (txtC) txtC.value = r.conductor || '';

        const txtViaje = document.getElementById('ck_orden_viaje-txt');
        const hidViaje = document.getElementById('ck_orden_viaje');
        if (txtViaje) txtViaje.value = r.orden_viaje || '';
        if (hidViaje) hidViaje.value = r.orden_viaje || '';
        if (r.orden_viaje) {
            const infoBox = document.getElementById('ck_viaje_seleccionado_info');
            const lblNum = document.getElementById('ck_lbl_viaje_num');
            const lblDet = document.getElementById('ck_lbl_viaje_detalles');
            if (infoBox) infoBox.classList.remove('d-none');
            if (lblNum) lblNum.textContent = r.orden_viaje;
            if (lblDet) lblDet.textContent = `Tracto: ${r.placa_tracto || '---'} | Carreta: ${r.placa_remolque || 'Ninguna'} | Conductor: ${r.conductor || '---'}`;
            const btnClear = document.getElementById('ck_btn_clear_viaje');
            if (btnClear) btnClear.classList.remove('d-none');
        }

        const inputKm = document.getElementById('ck_kilometraje');
        if (inputKm) inputKm.value = r.km_inicial || '';
        const inputHoras = document.getElementById('ck_horas_remolque');
        if (inputHoras) inputHoras.value = r.horas_motor || '';

        const inputProc = document.getElementById('ck_procedencia');
        if (inputProc) inputProc.value = r.procedencia || '';
        const inputGps = document.getElementById('ck_ubicacion_gps');
        if (inputGps) inputGps.value = r.ubicacion_gps || '';

        if (r.placa_tracto) window.ckSyncPlacaTracto();
        if (r.placa_remolque) window.ckSyncPlacaRemolque();
    }, 100);

    // Parsear fallas existentes
    let fallasT = [];
    let fallasR = [];
    try {
        if (r.fallas_tracto_json) fallasT = typeof r.fallas_tracto_json === 'string' ? JSON.parse(r.fallas_tracto_json) : r.fallas_tracto_json;
        else if (r.fallas_tracto) fallasT = typeof r.fallas_tracto === 'string' ? JSON.parse(r.fallas_tracto) : r.fallas_tracto;
    } catch(e) {}
    try {
        if (r.fallas_remolque_json) fallasR = typeof r.fallas_remolque_json === 'string' ? JSON.parse(r.fallas_remolque_json) : r.fallas_remolque_json;
        else if (r.fallas_remolque) fallasR = typeof r.fallas_remolque === 'string' ? JSON.parse(r.fallas_remolque) : r.fallas_remolque;
    } catch(e) {}

    if (!Array.isArray(fallasT)) fallasT = [];
    if (!Array.isArray(fallasR)) fallasR = [];

    // Renderizar acordeones limpios
    window.ckRenderizarTodosAcordeones();

    // Marcar checkboxes y observaciones existentes preservando su fecha original
    const todasF = [
        ...fallasT.map(f => ({ ...f, esTracto: true })),
        ...fallasR.map(f => ({ ...f, esTracto: false }))
    ];

    const wrapManuales = document.getElementById('ck_contenedor_fallas_manuales');
    if (wrapManuales) wrapManuales.innerHTML = '';
    window.fallasManualesChecklist = [];

    const fechaGenFmt = r.fecha_reporte ? new Date(r.fecha_reporte).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' }) : '';

    todasF.forEach(f => {
        const fechaOrig = f.fecha || fechaGenFmt;
        if (f.sistema === 'MANUAL' || (f.item || '').includes('Falla Manual')) {
            const rowId = 'manual_' + Date.now() + Math.floor(Math.random()*1000);
            const div = document.createElement('div');
            div.className = 'row g-2 mb-2 align-items-center ck-manual-falla-row';
            div.id = rowId;
            div.dataset.fecha = fechaOrig;
            div.innerHTML = `
                <div class="col-md-4">
                    <select class="form-select form-select-sm ck-manual-sistema fw-bold text-primary border-secondary-subtle">
                        <option value="${r.placa_tracto || 'TRACTO'}" ${f.esTracto ? 'selected' : ''}>🚛 TRACTO (${r.placa_tracto || '—'})</option>
                        <option value="${r.placa_remolque || 'SEMIRREMOLQUE'}" ${!f.esTracto ? 'selected' : ''}>🚛 SEMIRREMOLQUE (${r.placa_remolque || '—'})</option>
                    </select>
                </div>
                <div class="col-md-7">
                    <input type="text" class="form-control form-control-sm text-uppercase ck-manual-desc border-secondary-subtle" value="${f.obs || ''}" placeholder="Describa el componente / falla no listada...">
                    ${fechaOrig ? `<small class="text-muted d-block mt-1" style="font-size:0.7rem;"><i class="bi bi-clock-history me-1 text-primary"></i>Reportado el: <b>${fechaOrig}</b></small>` : ''}
                </div>
                <div class="col-md-1 text-end">
                    <button type="button" class="btn btn-outline-danger btn-sm rounded-circle p-1" onclick="document.getElementById('${rowId}').remove(); window.ckActualizarContadores();" title="Eliminar">
                        <i class="bi bi-trash-fill"></i>
                    </button>
                </div>
            `;
            wrapManuales.appendChild(div);
        } else {
            const itemLimpio = (f.item || '').toUpperCase().trim();
            document.querySelectorAll('.ck-checkbox-item').forEach(chk => {
                const itemId = chk.id.replace('chk_', '');
                const lblEl = document.getElementById(`lbl_${itemId}`);
                if (lblEl && lblEl.innerText.trim().toUpperCase() === itemLimpio) {
                    chk.checked = true;
                    chk.dataset.fecha = fechaOrig;
                    const txtEl = document.getElementById(`txt_${itemId}`);
                    const obsWrap = document.getElementById(`obs_${itemId}`);
                    if (obsWrap) obsWrap.classList.remove('d-none');
                    if (txtEl && f.obs && f.obs !== f.item) txtEl.value = f.obs;
                }
            });
        }
    });

    window.ckActualizarContadores();
    window.ckActualizarChipsFallas();

    // Fotos existentes
    fotosChecklistBase64 = [];
    const wrapFotos = document.getElementById('ck_preview_fotos');
    if (wrapFotos) {
        wrapFotos.innerHTML = '';
        if (Array.isArray(r.fotos)) {
            r.fotos.forEach(url => {
                fotosChecklistBase64.push(url);
                const div = document.createElement('div');
                div.className = 'position-relative';
                div.innerHTML = `<img src="${url}" style="width:60px; height:60px; object-fit:cover; border-radius:8px; border:1px solid #ccc;">`;
                wrapFotos.appendChild(div);
            });
        }
    }

    const modalEl = document.getElementById('modalNuevoChecklist');
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

// ── GUARDAR O ACTUALIZAR REPORTE ─────────────────────────────────
window.guardarChecklist = function(e) {
    if (e) e.preventDefault();
    if (!window.guardAction('checklist', 'c')) return;

    const editId = (document.getElementById('ck_reporte_id_edit') || {}).value;
    const btn = document.getElementById('btnGuardarChecklist');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> ${editId ? 'Actualizando...' : 'Guardando...'}`;
    }

    try {
        const placaTracto = (typeof window._cbGet === 'function' ? window._cbGet('ck_placa_tracto') : '') || (document.getElementById('ck_placa_tracto-txt') || {}).value || '';
        const placaRemolque = (typeof window._cbGet === 'function' ? window._cbGet('ck_placa_remolque') : '') || (document.getElementById('ck_placa_remolque-txt') || {}).value || '';
        const conductorNombre = (typeof window._cbGet === 'function' ? window._cbGet('ck_conductor') : '') || (document.getElementById('ck_conductor-txt') || {}).value || '';
        const kilometrajeVal = (document.getElementById('ck_kilometraje') || {}).value || 0;
        const horasMotorVal = (document.getElementById('ck_horas_remolque') || {}).value || (document.getElementById('ck_horas_motor') || {}).value || '';
        const fechaRep = (document.getElementById('ck_fecha_reporte') || {}).value || new Date().toISOString().split('T')[0];

        // Timestamp actual para nuevas fallas ingresadas hoy
        const nowFmt = new Date().toLocaleString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

        const fallasTracto = [];
        const fallasRemolque = [];

        // Recolectar checkboxes marcados con su fecha individual
        document.querySelectorAll('.ck-checkbox-item:checked').forEach(chk => {
            const itemId = chk.id.replace('chk_', '');
            const isTracto = itemId.includes('_Tracto_');
            const parts = itemId.split('_');
            const sysKey = parts[2] || parts[1] || 'GENERAL';
            const txtEl = document.getElementById(`txt_${itemId}`);
            const lblEl = document.getElementById(`lbl_${itemId}`);

            const itemNombre = lblEl ? lblEl.innerText.trim() : 'Falla Observada';
            const obsDesc = txtEl && txtEl.value.trim() ? txtEl.value.trim() : itemNombre;
            const fechaFalla = chk.dataset.fecha || nowFmt;

            const obj = { sistema: sysKey.toUpperCase(), item: itemNombre, obs: obsDesc, fecha: fechaFalla };
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
            const fechaFalla = row.dataset.fecha || nowFmt;

            if (obs) {
                const isRem = sysVal.toUpperCase().includes('REMOLQUE') || sysVal.toUpperCase().includes('CARRETA') || (placaRemolque && sysVal === placaRemolque);
                const obj = { sistema: 'MANUAL', item: 'Falla Manual', obs: obs, fecha: fechaFalla };
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
            folio: editId ? undefined : undefined,
            orden_viaje: (document.getElementById('ck_orden_viaje') || {}).value || '',
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

        const targetUrl = editId ? `/api/checklist/${editId}` : '/api/checklist';
        const targetMethod = editId ? 'PUT' : 'POST';

        fetch(targetUrl, {
            method: targetMethod,
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
                    window.rotToast(`✅ Reporte ${res.folio || ''} ${editId ? 'actualizado' : 'guardado'} con éxito.`, 'bg-success');
                }
            } else {
                alert(`❌ Error ${editId ? 'actualizando' : 'guardando'} reporte: ` + (res.error || 'Desconocido'));
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
        console.error('Error al procesar reporte:', errSync);
        alert('❌ Ocurrió un error al procesar el reporte: ' + errSync.message);
    }
};

// ── DETALLE DIGITAL COMPLETO DEL REPORTE (MODAL XL ESTILO REPORTES) ──
window.abrirDetalleChecklist = async function(id) {
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

    // Obtener URLs presignadas de S3 para fotos y firma
    let s3Urls = [];
    let fotosList = [];
    try {
        fotosList = typeof r.fotos_json === 'string' ? JSON.parse(r.fotos_json) : (r.fotos_json || []);
        if (Array.isArray(fotosList)) {
            fotosList.forEach(u => { if (u && typeof u === 'string') s3Urls.push(u); });
        }
    } catch(e) {}
    if (r.firma_conductor_url && typeof r.firma_conductor_url === 'string') {
        s3Urls.push(r.firma_conductor_url);
    }

    let signedMap = {};
    if (s3Urls.length > 0) {
        try {
            let reqPresign = await fetch('/api/checklist/presign-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls: s3Urls })
            });
            if (!reqPresign.ok) {
                reqPresign = await fetch('/api/documentos-flota/presign-read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ urls: s3Urls })
                });
            }
            if (!reqPresign.ok) {
                reqPresign = await fetch('/api/mantenimiento/inspecciones/presign-read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ urls: s3Urls })
                });
            }
            if (reqPresign.ok) {
                const resPresign = await reqPresign.json();
                if (resPresign.signed) {
                    signedMap = resPresign.signed;
                } else if (resPresign && typeof resPresign === 'object') {
                    signedMap = resPresign;
                }
            }
        } catch(e) {
            console.error('Error al obtener URLs presignadas de checklist:', e);
        }
    }

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
                    ${r.estado !== 'Finalizado' ? `
                    <button type="button" class="btn btn-outline-primary btn-sm fw-bold d-flex align-items-center gap-1 shadow-2xs" onclick="window.abrirEditarChecklist(${r.id})">
                        <i class="bi bi-pencil-square"></i> Editar Reporte
                    </button>
                    ` : ''}
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
                        ${fallaMatch.fecha ? `<div class="text-muted mt-1" style="font-size:0.7rem;"><i class="bi bi-clock-history me-1 text-primary"></i>Reportado el: <b>${fallaMatch.fecha}</b></div>` : ''}
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
                            ${fallaMatch.fecha ? `<div class="text-muted mt-1" style="font-size:0.7rem;"><i class="bi bi-clock-history me-1 text-primary"></i>Reportado el: <b>${fallaMatch.fecha}</b></div>` : ''}
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

    // ── 3. DETALLE DE FALLA (TABLA CON FECHA Y RESULTADOS) ──
    html += `
        <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #e2e8f0 !important;">
            <h6 class="fw-bold text-dark d-flex align-items-center gap-2 mb-3" style="font-size:1rem;">
                <i class="bi bi-tools text-primary"></i> Detalle de Falla
            </h6>
            <div class="table-responsive border rounded-3 overflow-hidden">
                <table class="table table-hover align-middle m-0 small">
                    <thead class="table-light sticky-top">
                        <tr>
                            <th class="py-2 ps-3" style="width: 140px;">FECHA REPORTE</th>
                            <th class="py-2">UNIDAD</th>
                            <th class="py-2">CATEGORÍA</th>
                            <th class="py-2">ÍTEM</th>
                            <th class="py-2 pe-3">DESCRIPCIÓN DE LA FALLA</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    if (todasFallas.length === 0) {
        html += `<tr><td colspan="5" class="text-center py-3 text-muted">Sin fallas observadas registradas.</td></tr>`;
    } else {
        todasFallas.forEach(f => {
            html += `
                <tr>
                    <td class="ps-3 fw-bold text-secondary font-monospace" style="font-size:0.78rem;">
                        <i class="bi bi-clock-history me-1 text-primary"></i>${f.fecha || fechaFmt}
                    </td>
                    <td class="fw-bold text-primary">${f.unidad || 'TRACTO'}</td>
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
    if (Array.isArray(fotosList) && fotosList.length) {
        fotosHtml = '<div class="d-flex flex-wrap gap-2">' + fotosList.map(rawUrl => {
            const signedUrl = signedMap[rawUrl] || rawUrl;
            return `
                <a href="${signedUrl}" target="_blank" class="border rounded overflow-hidden shadow-2xs d-inline-block" style="width:90px; height:90px;">
                    <img src="${signedUrl}" style="width:100%; height:100%; object-fit:cover;" onerror="this.onerror=null; this.src='https://via.placeholder.com/90?text=Error';">
                </a>
            `;
        }).join('') + '</div>';
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
        const signedFirma = signedMap[r.firma_conductor_url] || r.firma_conductor_url;
        html += `
            <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #e2e8f0 !important;">
                <h6 class="fw-bold text-dark mb-2"><i class="bi bi-pencil-fill text-primary me-1"></i>Firma del Conductor</h6>
                <div class="border rounded-3 p-2 text-center bg-light" style="max-width:320px;">
                    <img src="${signedFirma}" style="max-height:100px; object-fit:contain;">
                </div>
            </div>
        `;
    }

    body.innerHTML = html;
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window._idChecklistAEliminar = null;

window.eliminarChecklist = function(id) {
    if (!window.guardAction('checklist', 'd')) return;
    
    window._idChecklistAEliminar = id;
    const modalEl = document.getElementById('modalEliminarChecklistConfirm');
    if (modalEl) {
        const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
        modalInstance.show();
    }
};

// Listener para el botón confirmar eliminar del modal diseño B
document.addEventListener('DOMContentLoaded', () => {
    const btnDel = document.getElementById('btnEjecutarEliminarChecklist');
    if (btnDel) {
        btnDel.addEventListener('click', window._ejecutarEliminarChecklistConfirmado);
    }
});

window._ejecutarEliminarChecklistConfirmado = function() {
    const id = window._idChecklistAEliminar;
    if (!id) return;

    const modalEl = document.getElementById('modalEliminarChecklistConfirm');
    if (modalEl) {
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
    }

    fetch(`/api/checklist/${id}`, { method: 'DELETE' })
        .then(r => r.json())
        .then(res => {
            if (res.ok) {
                window.cargarTablaChecklist(true);
            } else {
                alert('Error al eliminar: ' + (res.error || 'Desconocido'));
            }
        })
        .catch(err => {
            console.error('Error al eliminar reporte:', err);
            alert('Error de red al intentar eliminar el reporte.');
        })
        .finally(() => {
            window._idChecklistAEliminar = null;
        });
};

// ── ESTADO GLOBAL DE GENERACIÓN DE OTs DESDE CHECKLIST ──────────────
window._genOT_Reporte = null;
window._genOT_Rampas = [];
window._genOT_Tecnicos = [];
window._genOT_TodasFallas = [];
window._genOT_Cards = [];

window.abrirModalGenerarOTs = async function(id) {
    const r = (window.dataGlobalChecklist || []).find(item => item.id === id);
    if (!r) {
        alert('No se encontró la información del reporte seleccionado.');
        return;
    }
    window._genOT_Reporte = r;

    const modalEl = document.getElementById('modalGenerarOTsFromChecklist');
    const inputId = document.getElementById('gen_reporte_id');
    const selRampa = document.getElementById('gen_id_rampa');

    if (inputId) inputId.value = id;

    // 1. Resumen informativo separado
    const folioTxt = document.getElementById('gen_folio_txt');
    if (folioTxt) folioTxt.value = r.folio || ('F-2026-' + String(r.id).padStart(4, '0'));

    const conductorTxt = document.getElementById('gen_conductor_txt');
    if (conductorTxt) conductorTxt.value = r.conductor || 'Conductor no especificado';

    const tractoTxt = document.getElementById('gen_tracto_txt');
    if (tractoTxt) tractoTxt.value = r.placa_tracto || '—';

    const remolqueTxt = document.getElementById('gen_remolque_txt');
    if (remolqueTxt) remolqueTxt.value = r.placa_remolque || '—';

    const kmTxt = document.getElementById('gen_km_txt');
    if (kmTxt) kmTxt.value = r.km_inicial ? Number(r.km_inicial).toLocaleString() + ' KM' : '—';

    const horasTxt = document.getElementById('gen_horas_txt');
    if (horasTxt) horasTxt.value = r.horas_motor ? r.horas_motor + ' Hrs' : '—';

    const rutaTxt = document.getElementById('gen_ruta_txt');
    if (rutaTxt) rutaTxt.value = r.procedencia || r.ruta || '—';

    // 2. Fechas por defecto (local)
    const now = new Date();
    const fIngreso = document.getElementById('gen_fecha_ingreso');
    if (fIngreso) {
        const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        fIngreso.value = localIso;
    }
    const fSalida = document.getElementById('gen_fecha_salida');
    if (fSalida) {
        const salDate = new Date(now.getTime() + 4 * 3600000 - now.getTimezoneOffset() * 60000);
        fSalida.value = salDate.toISOString().slice(0, 16);
    }

    // 3. Cargar Rampas reales desde cat_rampas
    try {
        let resRampas = await fetch('/api/cat-rampas');
        if (!resRampas.ok) resRampas = await fetch('/api/taller/rampas');
        if (!resRampas.ok) resRampas = await fetch('/api/taller-rampas');
        if (resRampas.ok) {
            const dataRampas = await resRampas.json();
            window._genOT_Rampas = Array.isArray(dataRampas) ? dataRampas : (dataRampas.data || []);
        }
    } catch(e) {
        console.warn('Error al cargar cat_rampas:', e);
    }

    // Inicializar combobox moderno para Rampa
    const rampaItems = (window._genOT_Rampas || []).map(rmp => {
        const nombre = rmp.nombre_rampa || rmp.nombre || rmp.rampa || `Rampa ${rmp.id}`;
        return { value: nombre, label: nombre };
    });
    if (!rampaItems.length) {
        ['Rampa 1', 'Rampa 2', 'Rampa 3', 'Zona Lavado', 'Zona de Espera', 'Taller Tercero', 'Auxilio Mecánico'].forEach(n => {
            rampaItems.push({ value: n, label: n });
        });
    }
    if (typeof window._cbInit === 'function') {
        window._cbInit('gen_id_rampa', rampaItems, 'SELECCIONE RAMPA...');
        if (r.id_rampa && r.id_rampa !== 'En Espera' && r.id_rampa !== 'En Ruta') {
            window._cbSet('gen_id_rampa', r.id_rampa, r.id_rampa);
        } else {
            window._cbSet('gen_id_rampa', '', '');
        }
    }

    // 4. Cargar Personal Técnico desde el Directorio de Personal (/api/conductores-lista)
    try {
        let resTec = await fetch('/api/conductores-lista');
        if (!resTec.ok) resTec = await fetch('/api/conductores');
        if (resTec.ok) {
            const dataTec = await resTec.json();
            const rawList = Array.isArray(dataTec) ? dataTec : (dataTec.data || []);
            window._genOT_Tecnicos = rawList.map(t => {
                if (typeof t === 'string') return t.trim();
                return (t.nombre || t.conductor || '').trim();
            }).filter(Boolean);
        }
    } catch(e) {
        console.warn('Error al cargar conductores-lista:', e);
    }

    if (!window._genOT_Tecnicos || !window._genOT_Tecnicos.length) {
        if (window.dataGlobalConductores && Array.isArray(window.dataGlobalConductores)) {
            window._genOT_Tecnicos = window.dataGlobalConductores.map(c => (c[1] || c.nombre || '').trim()).filter(Boolean);
        }
    }

    // 5. Extraer todas las fallas reportadas
    let fallasT = [];
    let fallasR = [];
    try {
        if (r.fallas_tracto_json) fallasT = typeof r.fallas_tracto_json === 'string' ? JSON.parse(r.fallas_tracto_json) : r.fallas_tracto_json;
        else if (r.fallas_tracto) fallasT = typeof r.fallas_tracto === 'string' ? JSON.parse(r.fallas_tracto) : r.fallas_tracto;
    } catch(e) {}
    try {
        if (r.fallas_remolque_json) fallasR = typeof r.fallas_remolque_json === 'string' ? JSON.parse(r.fallas_remolque_json) : r.fallas_remolque_json;
        else if (r.fallas_remolque) fallasR = typeof r.fallas_remolque === 'string' ? JSON.parse(r.fallas_remolque) : r.fallas_remolque;
    } catch(e) {}

    window._genOT_TodasFallas = [];
    (fallasT || []).forEach((f, idx) => {
        const isManual = f.sistema === 'MANUAL' || (f.item || '').toLowerCase().includes('falla manual');
        const itemClean = isManual ? (f.obs || 'Observación adicional') : (f.item || f.nombre || 'Falla observada');
        const obsClean = isManual ? 'Observación reportada' : (f.obs || f.descripcion || '');
        const motivoDesc = isManual ? (f.obs || itemClean) : `${f.sistema ? f.sistema + ' — ' : ''}${f.item || ''}${f.obs && f.obs !== f.item ? ': ' + f.obs : ''}`;

        window._genOT_TodasFallas.push({
            id: `ft_${idx}`,
            unidad: 'Tracto',
            placa: r.placa_tracto || 'TRACTO',
            sistema: f.sistema || 'TRACTO',
            item: itemClean,
            obs: obsClean,
            esManual: isManual,
            motivoDesc: motivoDesc
        });
    });
    (fallasR || []).forEach((f, idx) => {
        const isManual = f.sistema === 'MANUAL' || (f.item || '').toLowerCase().includes('falla manual');
        const itemClean = isManual ? (f.obs || 'Observación adicional') : (f.item || f.nombre || 'Falla observada');
        const obsClean = isManual ? 'Observación reportada' : (f.obs || f.descripcion || '');
        const motivoDesc = isManual ? (f.obs || itemClean) : `${f.sistema ? f.sistema + ' — ' : ''}${f.item || ''}${f.obs && f.obs !== f.item ? ': ' + f.obs : ''}`;

        window._genOT_TodasFallas.push({
            id: `fr_${idx}`,
            unidad: 'Remolque',
            placa: r.placa_remolque || 'REMOLQUE',
            sistema: f.sistema || 'REMOLQUE',
            item: itemClean,
            obs: obsClean,
            esManual: isManual,
            motivoDesc: motivoDesc
        });
    });
    if (r.fallas_libres_text && r.fallas_libres_text.trim()) {
        const lineasLibres = r.fallas_libres_text.split('\n').map(l => l.trim()).filter(Boolean);
        lineasLibres.forEach((ll, lIdx) => {
            const cleanTxt = ll.replace(/^[•\-\*]\s*/, '').replace(/^(Falla Manual|MANUAL):\s*/i, '');
            window._genOT_TodasFallas.push({
                id: `fl_${lIdx}`,
                unidad: r.placa_tracto ? 'Tracto' : 'Remolque',
                placa: r.placa_tracto || r.placa_remolque || 'UNIDAD',
                sistema: 'TRABAJO ADICIONAL',
                item: cleanTxt,
                obs: 'Observación reportada',
                esManual: true,
                motivoDesc: cleanTxt
            });
        });
    }

// Diccionario oficial de subtipos en cascada por Tipo de OT
window.CK_OT_SUBTIPOS = {
    'Correctivo': ['Falla', 'Varado', 'Programado', 'Garantía', 'Accidentabilidad', 'Mala Operación'],
    'Preventivo': ['Inspección Pre-PM', 'Campaña', 'Limpieza Integral', 'Rutina', 'Programado', 'Oportuno'],
    'Predictivo': ['Por condición', 'Prueba'],
    'Proactivo':  ['Mejora'],
    'Servicio':   ['Stock', 'Taller']
};

window.ckOnCambiarTipoOT = function(cardIndex, nuevoTipo) {
    const card = window._genOT_Cards[cardIndex];
    if (!card) return;
    card.tipo_ot = nuevoTipo;
    const subs = window.CK_OT_SUBTIPOS[nuevoTipo] || [];
    card.subtipo_ot = subs[0] || '';

    const selSub = document.getElementById(`gen_subtipo_${cardIndex}`);
    if (selSub) {
        selSub.innerHTML = subs.map(s => `<option value="${s}" ${s === card.subtipo_ot ? 'selected' : ''}>${s}</option>`).join('');
    }
};

    // 6. Inicializar tarjetas de OT (Supervisor vacío por defecto)
    window._genOT_Cards = [];
    if (r.placa_tracto && fallasT.length > 0) {
        window._genOT_Cards.push({
            cardId: 'ot_card_0',
            unidad: 'Tracto',
            placa: r.placa_tracto,
            tipo_ot: 'Correctivo',
            subtipo_ot: 'Falla',
            supervisor: '',
            situacion: 'En atención',
            fallasSeleccionadas: fallasT.map((_, idx) => `ft_${idx}`),
            tecnicoPorFalla: {}
        });
    }
    if (r.placa_remolque && fallasR.length > 0) {
        window._genOT_Cards.push({
            cardId: 'ot_card_1',
            unidad: 'Remolque',
            placa: r.placa_remolque,
            tipo_ot: 'Correctivo',
            subtipo_ot: 'Falla',
            supervisor: '',
            situacion: 'En atención',
            fallasSeleccionadas: fallasR.map((_, idx) => `fr_${idx}`),
            tecnicoPorFalla: {}
        });
    }
    if (window._genOT_Cards.length === 0) {
        window._genOT_Cards.push({
            cardId: 'ot_card_0',
            unidad: r.placa_tracto ? 'Tracto' : 'Remolque',
            placa: r.placa_tracto || r.placa_remolque || 'TRACTO',
            tipo_ot: 'Correctivo',
            subtipo_ot: 'Falla',
            supervisor: '',
            situacion: 'En atención',
            fallasSeleccionadas: window._genOT_TodasFallas.map(f => f.id),
            tecnicoPorFalla: {}
        });
    }

    window.ckRenderTarjetasOT();
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.ckRenderTarjetasOT = function() {
    const wrap = document.getElementById('contenedorTarjetasOTsGen');
    if (!wrap) return;

    const r = window._genOT_Reporte || {};
    const tecnicos = window._genOT_Tecnicos || [];

    if (window._genOT_Cards.length === 0) {
        wrap.innerHTML = '<div class="alert alert-light border text-center py-4 text-muted small">No hay órdenes de trabajo agregadas. Haz clic en "Agregar otra OT" para comenzar.</div>';
        return;
    }

    let html = '';
    window._genOT_Cards.forEach((card, cIdx) => {
        const isTracto = card.unidad === 'Tracto';
        
        // Estilo temático diferenciado y sutil (Azul para Tracto, Ámbar para Remolque)
        const cardBg = isTracto ? '#f0f9ff' : '#fffbeb';
        const cardBorder = isTracto ? '#bae6fd' : '#fde68a';
        const borderCls = isTracto ? 'border-primary' : 'border-warning';
        const badgeCls = isTracto ? 'bg-primary text-white' : 'bg-warning text-dark';
        const iconCls = isTracto ? 'bi-truck' : 'bi-truck-flatbed';
        const unidadNombre = isTracto ? 'Tracto' : 'Carreta / Remolque';
        
        // Medición específica según la placa seleccionada
        const metricaBadge = isTracto 
            ? `<span class="badge bg-white text-primary border border-primary-subtle fw-bold shadow-2xs"><i class="bi bi-speedometer2 me-1"></i> ${r.km_inicial ? Number(r.km_inicial).toLocaleString() + ' KM' : 'Sin KM'}</span>`
            : `<span class="badge bg-white text-warning-emphasis border border-warning-subtle fw-bold shadow-2xs"><i class="bi bi-clock-history me-1"></i> ${r.horas_motor ? r.horas_motor + ' Hrs' : 'Sin Horas'}</span>`;

        const tipos = ['Correctivo', 'Preventivo', 'Predictivo', 'Proactivo', 'Servicio'];
        const currentTipo = card.tipo_ot || 'Correctivo';
        const subtipos = window.CK_OT_SUBTIPOS[currentTipo] || [];
        if (!card.subtipo_ot && subtipos.length) card.subtipo_ot = subtipos[0];

        // Filtrar fallas relevantes para esta unidad (o todas si no hay filtro estricto)
        const fallasUnidad = window._genOT_TodasFallas.filter(f => f.unidad === card.unidad || !f.unidad);
        const fallasMostrar = fallasUnidad.length > 0 ? fallasUnidad : window._genOT_TodasFallas;

        // Generar lista de fallas con checkboxes y cb-dropdown para técnico
        let fallasHtml = '';
        if (fallasMostrar.length === 0) {
            fallasHtml = '<div class="text-muted small py-2 px-3 bg-white rounded-3 border">Sin fallas específicas observadas en el checklist. Se generará OT general.</div>';
        } else {
            fallasMostrar.forEach(f => {
                const isChecked = (card.fallasSeleccionadas || []).includes(f.id);
                const tecAsignado = (card.tecnicoPorFalla && card.tecnicoPorFalla[f.id]) || '';

                // Verificar si está asignada en otra tarjeta para exclusión
                let asignadaEnOtra = null;
                window._genOT_Cards.forEach((otherCard, otherIdx) => {
                    if (otherIdx !== cIdx && (otherCard.fallasSeleccionadas || []).includes(f.id)) {
                        asignadaEnOtra = otherIdx + 1;
                    }
                });

                const isDisabled = asignadaEnOtra !== null;
                const tecInputId = `gen_tec_${cIdx}_${f.id}`;

                fallasHtml += `
                    <div class="p-2 mb-2 rounded-3 border ${isChecked ? (isTracto ? 'bg-primary bg-opacity-10 border-primary-subtle' : 'bg-warning bg-opacity-15 border-warning-subtle') : (isDisabled ? 'bg-light opacity-50' : 'bg-white')} d-flex flex-wrap align-items-center justify-content-between gap-2" id="falla_row_${cIdx}_${f.id}">
                        <div class="d-flex align-items-start gap-2 flex-grow-1" style="min-width: 220px;">
                            <input type="checkbox" class="form-check-input mt-1 ck-falla-chk" 
                                   data-card-index="${cIdx}" 
                                   data-falla-id="${f.id}" 
                                   id="chk_${cIdx}_${f.id}" 
                                   ${isChecked ? 'checked' : ''} 
                                   ${isDisabled ? 'disabled' : ''} 
                                   onchange="window.ckToggleFallaOT(${cIdx}, '${f.id}', this.checked)">
                            <label class="form-check-label small m-0" for="chk_${cIdx}_${f.id}" style="cursor: pointer;">
                                <strong class="text-dark d-block">${f.item}</strong>
                                <span class="text-muted" style="font-size: 0.76rem;">${f.esManual ? 'Observación adicional' : (f.sistema + (f.obs && f.obs !== f.item && f.obs !== 'Observado en checklist' ? ' — ' + f.obs : ''))}</span>
                                ${isDisabled ? `<span class="badge bg-secondary-subtle text-secondary ms-1" style="font-size: 0.68rem;">Asignado en OT #${asignadaEnOtra}</span>` : ''}
                            </label>
                        </div>
                        
                        <!-- Selector individual de Técnico Responsable con cb-dropdown -->
                        <div class="d-flex align-items-center gap-1 ${isChecked ? '' : 'd-none'}" id="tec_wrap_${cIdx}_${f.id}" style="min-width: 200px; max-width: 280px; position: relative;">
                            <i class="bi bi-person-gear text-secondary" style="font-size: 0.85rem;"></i>
                            <div class="position-relative flex-grow-1">
                                <input type="text" id="${tecInputId}-txt" 
                                       class="form-control form-control-sm bg-white text-uppercase fw-bold" 
                                       style="font-size: 0.8rem; min-height: 36px !important; border-radius: 8px !important;"
                                       placeholder="SELECCIONE TÉCNICO..." 
                                       autocomplete="off" 
                                       oninput="window._cbFiltrar('${tecInputId}')" 
                                       onfocus="window._cbFiltrar('${tecInputId}')" 
                                       onblur="window._cbHide('${tecInputId}')">
                                <input type="hidden" id="${tecInputId}" value="${tecAsignado}">
                                <div id="${tecInputId}-dd" class="cb-dropdown"></div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        const supInputId = `gen_sup_${cIdx}`;

        html += `
            <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 border-start border-4 ${borderCls}" style="background: ${cardBg} !important; border: 1px solid ${cardBorder} !important; overflow: visible !important;" id="card_ot_${cIdx}">
                <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 border-bottom pb-2">
                    <div class="d-flex flex-wrap align-items-center gap-2 flex-grow-1">
                        <span class="badge ${badgeCls} px-3 py-2 fw-bold text-uppercase rounded-3 shadow-2xs text-nowrap flex-shrink-0" style="font-size: 0.82rem; white-space: nowrap !important;">
                            <i class="bi ${iconCls} me-1"></i> OT #${cIdx + 1} (${unidadNombre})
                        </span>
                        <span class="fw-bold text-dark text-nowrap flex-shrink-0" style="font-size: 0.92rem; white-space: nowrap !important;">Placa: <span class="${isTracto ? 'text-primary' : 'text-warning-emphasis'}">${card.placa || 'Sin Placa'}</span></span>
                        <div class="text-nowrap flex-shrink-0">${metricaBadge}</div>
                    </div>
                    ${window._genOT_Cards.length > 1 ? `
                        <button type="button" class="btn btn-outline-danger btn-sm rounded-pill px-3 py-1 fw-bold text-nowrap flex-shrink-0 d-flex align-items-center gap-1 shadow-2xs" style="white-space: nowrap !important; font-size: 0.78rem;" onclick="window.ckEliminarTarjetaOT(${cIdx})" title="Eliminar esta OT">
                            <i class="bi bi-trash"></i> <span>Quitar OT</span>
                        </button>
                    ` : ''}
                </div>

                <!-- Fila 1: Unidad, Tipo y Subtipo de OT (3 columnas uniformes) -->
                <div class="row g-2 g-md-3 mb-2">
                    <div class="col-12 col-md-4">
                        <label class="form-label" style="font-size: 0.74rem; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px; white-space: nowrap;">Unidad Destino</label>
                        <select class="form-select bg-white fw-bold" style="min-height: 42px !important; height: 42px !important; border-radius: 10px !important;" onchange="window.ckOnCambiarUnidadOT(${cIdx}, this)">
                            ${r.placa_tracto ? `<option value="Tracto" ${card.unidad === 'Tracto' ? 'selected' : ''}>🚛 Tracto (${r.placa_tracto})</option>` : ''}
                            ${r.placa_remolque ? `<option value="Remolque" ${card.unidad === 'Remolque' ? 'selected' : ''}>🚚 Carreta (${r.placa_remolque})</option>` : ''}
                        </select>
                    </div>
                    <div class="col-6 col-md-4">
                        <label class="form-label" style="font-size: 0.74rem; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px; white-space: nowrap;">Tipo de OT</label>
                        <select class="form-select bg-white fw-bold" style="min-height: 42px !important; height: 42px !important; border-radius: 10px !important;" onchange="window.ckOnCambiarTipoOT(${cIdx}, this.value)">
                            ${tipos.map(t => `<option value="${t}" ${t === currentTipo ? 'selected' : ''}>${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-6 col-md-4">
                        <label class="form-label" style="font-size: 0.74rem; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px; white-space: nowrap;">Sub Tipo de OT</label>
                        <select class="form-select bg-white fw-bold" id="gen_subtipo_${cIdx}" style="min-height: 42px !important; height: 42px !important; border-radius: 10px !important;" onchange="window.ckOnCambiarCampoOT(${cIdx}, 'subtipo_ot', this.value)">
                            ${subtipos.map(s => `<option value="${s}" ${s === card.subtipo_ot ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <!-- Fila 2: Supervisor Responsable y Situación (2 columnas amplias y alineadas) -->
                <div class="row g-2 g-md-3 mb-3">
                    <div class="col-12 col-md-7">
                        <label class="form-label" style="font-size: 0.74rem; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px; white-space: nowrap;">Supervisor Responsable (<span class="text-danger">*</span>)</label>
                        <div class="position-relative">
                            <input type="text" id="${supInputId}-txt" 
                                   class="form-control bg-white text-uppercase fw-bold" 
                                   style="min-height: 42px !important; height: 42px !important; border-radius: 10px !important;"
                                   placeholder="SELECCIONE SUPERVISOR..." 
                                   autocomplete="off" 
                                   oninput="window._cbFiltrar('${supInputId}')" 
                                   onfocus="window._cbFiltrar('${supInputId}')" 
                                   onblur="window._cbHide('${supInputId}')">
                            <input type="hidden" id="${supInputId}" value="${card.supervisor || ''}">
                            <div id="${supInputId}-dd" class="cb-dropdown"></div>
                        </div>
                    </div>
                    <div class="col-12 col-md-5">
                        <label class="form-label" style="font-size: 0.74rem; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px; white-space: nowrap;">Situación (Status Rampa)</label>
                        <select class="form-select bg-white fw-bold" style="min-height: 42px !important; height: 42px !important; border-radius: 10px !important;" onchange="window.ckOnCambiarCampoOT(${cIdx}, 'situacion', this.value)">
                            <option value="En atención" ${card.situacion === 'En atención' ? 'selected' : ''}>En atención</option>
                            <option value="Finalizado" ${card.situacion === 'Finalizado' ? 'selected' : ''}>Finalizado</option>
                            <option value="En espera de reparación" ${card.situacion === 'En espera de reparación' ? 'selected' : ''}>En espera de reparación</option>
                            <option value="Taller Tercero" ${card.situacion === 'Taller Tercero' ? 'selected' : ''}>Taller Tercero</option>
                            <option value="Inoperativo" ${card.situacion === 'Inoperativo' ? 'selected' : ''}>Inoperativo</option>
                            <option value="Anulado" ${card.situacion === 'Anulado' ? 'selected' : ''}>Anulado</option>
                            <option value="Operativo" ${card.situacion === 'Operativo' ? 'selected' : ''}>Operativo</option>
                        </select>
                    </div>
                </div>

                <div>
                    <div class="d-flex align-items-center justify-content-between mb-2">
                        <span class="fw-bold text-secondary text-uppercase small" style="font-size: 0.72rem; letter-spacing: 0.5px;">
                            Selecciona los Trabajos / Motivos para esta OT (${card.fallasSeleccionadas.length} seleccionados):
                        </span>
                    </div>
                    <div class="border rounded-3 p-2 bg-white" style="overflow: visible !important;">
                        ${fallasHtml}
                    </div>
                </div>
            </div>
        `;
    });

    wrap.innerHTML = html;

    // Inicializar comboboxes de Supervisor y Técnicos con el componente cb-dropdown
    const personalItems = (window._genOT_Tecnicos || []).map(t => ({ value: t, label: t }));
    window._genOT_Cards.forEach((card, cIdx) => {
        const supId = `gen_sup_${cIdx}`;
        if (typeof window._cbInit === 'function') {
            window._cbInit(supId, personalItems, 'SELECCIONE SUPERVISOR...');
            if (card.supervisor) {
                window._cbSet(supId, card.supervisor, card.supervisor);
            } else {
                window._cbSet(supId, '', '');
            }
            window._cbOnSelect(supId, function(val, lbl) {
                card.supervisor = val || lbl || '';
            });

            const fallasUnidad = window._genOT_TodasFallas.filter(f => f.unidad === card.unidad || !f.unidad);
            const fallasMostrar = fallasUnidad.length > 0 ? fallasUnidad : window._genOT_TodasFallas;
            fallasMostrar.forEach(f => {
                const tecId = `gen_tec_${cIdx}_${f.id}`;
                const tecVal = (card.tecnicoPorFalla && card.tecnicoPorFalla[f.id]) || '';
                window._cbInit(tecId, personalItems, 'SELECCIONE TÉCNICO...');
                if (tecVal) {
                    window._cbSet(tecId, tecVal, tecVal);
                } else {
                    window._cbSet(tecId, '', '');
                }
                window._cbOnSelect(tecId, function(val, lbl) {
                    if (!card.tecnicoPorFalla) card.tecnicoPorFalla = {};
                    card.tecnicoPorFalla[f.id] = val || lbl || '';
                });
            });
        }
    });
};

window.ckAgregarTarjetaOT = function() {
    const r = window._genOT_Reporte || {};
    const count = window._genOT_Cards.length;

    // Decidir unidad por defecto alternando si hay remolque
    let defUnidad = 'Tracto';
    let defPlaca = r.placa_tracto || 'TRACTO';
    if (count % 2 === 1 && r.placa_remolque) {
        defUnidad = 'Remolque';
        defPlaca = r.placa_remolque;
    }

    // Buscar fallas que aún no hayan sido asignadas en ninguna OT
    const yaAsignadas = [];
    window._genOT_Cards.forEach(c => {
        (c.fallasSeleccionadas || []).forEach(fid => yaAsignadas.push(fid));
    });

    const fallasDisponibles = window._genOT_TodasFallas
        .filter(f => (f.unidad === defUnidad || !f.unidad) && !yaAsignadas.includes(f.id))
        .map(f => f.id);

    window._genOT_Cards.push({
        cardId: `ot_card_${Date.now()}`,
        unidad: defUnidad,
        placa: defPlaca,
        tipo_ot: 'Correctivo',
        subtipo_ot: 'Falla',
        supervisor: '',
        situacion: 'En atención',
        fallasSeleccionadas: fallasDisponibles,
        tecnicoPorFalla: {}
    });

    window.ckRenderTarjetasOT();
};

window.ckEliminarTarjetaOT = function(index) {
    if (window._genOT_Cards.length <= 1) return;
    window._genOT_Cards.splice(index, 1);
    window.ckRenderTarjetasOT();
};

window.ckOnCambiarUnidadOT = function(cardIndex, selectEl) {
    const r = window._genOT_Reporte || {};
    const nuevaUnidad = selectEl.value;
    const card = window._genOT_Cards[cardIndex];
    if (!card) return;

    card.unidad = nuevaUnidad;
    card.placa = (nuevaUnidad === 'Remolque' ? r.placa_remolque : r.placa_tracto) || (nuevaUnidad === 'Remolque' ? 'REMOLQUE' : 'TRACTO');
    
    // Filtrar fallas correspondientes
    const yaAsignadas = [];
    window._genOT_Cards.forEach((c, idx) => {
        if (idx !== cardIndex) {
            (c.fallasSeleccionadas || []).forEach(fid => yaAsignadas.push(fid));
        }
    });

    card.fallasSeleccionadas = window._genOT_TodasFallas
        .filter(f => f.unidad === nuevaUnidad && !yaAsignadas.includes(f.id))
        .map(f => f.id);

    window.ckRenderTarjetasOT();
};

window.ckOnCambiarCampoOT = function(cardIndex, campo, val) {
    const card = window._genOT_Cards[cardIndex];
    if (card) {
        card[campo] = val;
    }
};

window.ckToggleFallaOT = function(cardIndex, fallaId, isChecked) {
    const card = window._genOT_Cards[cardIndex];
    if (!card) return;

    if (isChecked) {
        if (!card.fallasSeleccionadas.includes(fallaId)) {
            card.fallasSeleccionadas.push(fallaId);
        }
    } else {
        card.fallasSeleccionadas = card.fallasSeleccionadas.filter(id => id !== fallaId);
        if (card.tecnicoPorFalla) {
            delete card.tecnicoPorFalla[fallaId];
        }
    }

    window.ckRenderTarjetasOT();
};

window.ckOnCambiarTecnicoFalla = function(cardIndex, fallaId, tecnicoVal) {
    const card = window._genOT_Cards[cardIndex];
    if (card) {
        if (!card.tecnicoPorFalla) card.tecnicoPorFalla = {};
        card.tecnicoPorFalla[fallaId] = tecnicoVal;
    }
};

window.enviarGeneracionOTs = function(e) {
    e.preventDefault();
    const id = document.getElementById('gen_reporte_id').value;
    const rampaRaw = (typeof window._cbGet === 'function' ? window._cbGet('gen_id_rampa') : '') || (document.getElementById('gen_id_rampa-txt') || {}).value || (document.getElementById('gen_id_rampa') || {}).value || '';
    const rampa = rampaRaw.trim();
    const fIngreso = document.getElementById('gen_fecha_ingreso').value;
    const fSalida = document.getElementById('gen_fecha_salida').value;
    const r = window._genOT_Reporte || {};

    if (!rampa) {
        alert('⚠️ Por favor selecciona una ubicación o rampa de taller.');
        const rTxt = document.getElementById('gen_id_rampa-txt');
        if (rTxt) rTxt.focus();
        return;
    }

    // Validación estricta de Rampa en catálogo
    const rampaValida = (window._genOT_Rampas || []).some(rm => {
        const n = (rm.nombre_rampa || rm.nombre || rm.rampa || '').trim().toLowerCase();
        return n === rampa.toLowerCase();
    }) || ['rampa 1', 'rampa 2', 'rampa 3', 'zona lavado', 'zona de espera', 'taller tercero', 'auxilio mecánico', 'auxilio mecanico'].includes(rampa.toLowerCase());

    if (!rampaValida) {
        alert(`⚠️ La ubicación/rampa "${rampa}" no existe en el catálogo de rampas configuradas.\nPor favor selecciona una rampa válida de la lista.`);
        const rTxt = document.getElementById('gen_id_rampa-txt');
        if (rTxt) rTxt.focus();
        return;
    }

    if (!window._genOT_Cards || window._genOT_Cards.length === 0) {
        alert('⚠️ Debes configurar al menos una Orden de Trabajo.');
        return;
    }

    // Preparar el array de OTs estructurado
    const otsPayload = [];
    for (let i = 0; i < window._genOT_Cards.length; i++) {
        const c = window._genOT_Cards[i];

        // Validar Supervisor Obligatorio y Existencia Estricta
        const supVal = ((typeof window._cbGet === 'function' ? window._cbGet(`gen_sup_${i}`) : '') || (document.getElementById(`gen_sup_${i}-txt`) || {}).value || c.supervisor || '').trim();
        
        if (!supVal) {
            alert(`⚠️ Por favor selecciona el Supervisor Responsable para la OT #${i + 1} (${c.unidad}).`);
            const supTxt = document.getElementById(`gen_sup_${i}-txt`);
            if (supTxt) supTxt.focus();
            return;
        }

        const supValido = (window._genOT_Tecnicos || []).some(t => t.trim().toLowerCase() === supVal.toLowerCase());
        if (!supValido) {
            alert(`⚠️ El supervisor "${supVal}" asignado en la OT #${i + 1} no existe en el directorio de personal.\nPor favor selecciona un personal válido de la lista desplegable.`);
            const supTxt = document.getElementById(`gen_sup_${i}-txt`);
            if (supTxt) supTxt.focus();
            return;
        }

        // Validar Subtipo de OT
        if (!c.subtipo_ot) {
            alert(`⚠️ Por favor selecciona el Sub Tipo de OT para la OT #${i + 1} (${c.unidad}).`);
            return;
        }
        
        // Obtener motivos y técnicos específicos seleccionados
        const fallasObjs = window._genOT_TodasFallas.filter(f => (c.fallasSeleccionadas || []).includes(f.id));
        
        const motivosArray = [];
        for (let j = 0; j < fallasObjs.length; j++) {
            const f = fallasObjs[j];
            const tecRaw = (typeof window._cbGet === 'function' ? window._cbGet(`gen_tec_${i}_${f.id}`) : '') || (document.getElementById(`gen_tec_${i}_${f.id}-txt`) || {}).value || (c.tecnicoPorFalla && c.tecnicoPorFalla[f.id]) || '';
            const tec = tecRaw.trim();

            if (tec) {
                const tecValido = (window._genOT_Tecnicos || []).some(t => t.trim().toLowerCase() === tec.toLowerCase());
                if (!tecValido) {
                    alert(`⚠️ El técnico "${tec}" asignado al trabajo "${f.item}" en la OT #${i + 1} no existe en el directorio de personal.\nPor favor selecciona un técnico válido de la lista.`);
                    const tecTxt = document.getElementById(`gen_tec_${i}_${f.id}-txt`);
                    if (tecTxt) tecTxt.focus();
                    return;
                }
            }

            motivosArray.push({
                motivo: f.motivoDesc || f.item,
                sistema: f.sistema,
                item: f.item,
                obs: f.obs,
                tecnico: tec,
                tecnico_nombre: tec
            });
        }

        // Lista de técnicos únicos seleccionados para esta OT
        const tecnicosUnicos = Array.from(new Set(motivosArray.map(m => m.tecnico).filter(Boolean)));

        otsPayload.push({
            unidad: c.unidad,
            placa: c.placa,
            km: c.unidad === 'Tracto' ? (r.km_inicial || 0) : 0,
            horas_motor: (c.unidad === 'Remolque' || c.unidad === 'Carreta') ? (r.horas_motor || null) : null,
            tipo_ot: c.tipo_ot || 'Correctivo',
            subtipo_ot: c.subtipo_ot || 'Falla',
            supervisor: supVal,
            situacion: c.situacion || 'En atención',
            fallas_seleccionadas: fallasObjs.map(f => f.motivoDesc || f.item),
            motivos_array: motivosArray,
            tecnicos: tecnicosUnicos.length > 0 ? tecnicosUnicos : [supVal]
        });
    }

    const btnSubmit = document.getElementById('btnConfirmarGenerarOTs');
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Generando OTs...';
    }

    fetch(`/api/checklist/${id}/generar-ots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id_reporte: id,
            id_rampa: rampa,
            fecha_ingreso: fIngreso,
            fecha_salida: fSalida,
            ots: otsPayload
        })
    })
    .then(r => r.json())
    .then(res => {
        if (res.ok) {
            const modalEl = document.getElementById('modalGenerarOTsFromChecklist');
            if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();
            window.cargarTablaChecklist(true);
            const cant = (res.ots || res.ots_creadas || otsPayload).length;
            alert(`🚀 ¡Éxito! Se generaron ${cant} Orden(es) de Trabajo correctamente.`);
        } else {
            alert('Error al generar OTs: ' + (res.error || 'Desconocido'));
        }
    })
    .catch(err => alert('Error de conexión: ' + err.message))
    .finally(() => {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<i class="bi bi-rocket-takeoff-fill me-1"></i> Confirmar y Generar OTs';
        }
    });
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

    // Filas para la tabla "DETALLE DE FALLA DE TRACTO" (7 filas A y B)
    let detalleTractoRows = '';
    const maxFilasT = Math.max(7, Math.ceil(fallasT.length / 2));
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

    // Filas para la tabla "FALLAS CARRETA" (7 filas A y B)
    let detalleRemolqueRows = '';
    const maxFilasR = Math.max(7, Math.ceil(fallasR.length / 2));
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
    body { background-color: #f1f5f9; margin: 0; padding: 15px; display: flex; justify-content: center; }
    #btnPrint { position: fixed; top: 15px; right: 25px; background-color: #0284c7; color: #fff; border: none; padding: 10px 22px; border-radius: 8px; cursor: pointer; z-index: 9999; font-weight: bold; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.25); }
    #btnPrint:hover { background-color: #0369a1; }
    
    .page-a4 {
        width: 210mm;
        min-height: 292mm;
        height: 292mm;
        background: #ffffff;
        padding: 4mm 8mm;
        border: 1px solid #cbd5e1;
        box-shadow: 0 4px 15px rgba(0,0,0,0.08);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        color: #000;
        font-size: 9px;
        line-height: 1.25;
    }

    @media print {
        @page { size: A4 portrait; margin: 3mm 4mm; }
        body { background: transparent; padding: 0; margin: 0; display: block; }
        #btnPrint { display: none !important; }
        .page-a4 { border: none !important; box-shadow: none !important; padding: 0 !important; width: 100% !important; min-height: 288mm !important; height: 288mm !important; display: flex !important; flex-direction: column !important; justify-content: space-between !important; }
    }

    /* Tablas y encabezados estilo ISO */
    .iso-header { width: 100%; border-collapse: collapse; border: 2px solid #0056b3; margin-bottom: 2px; }
    .iso-header td { border: 1.5px solid #0056b3; text-align: center; vertical-align: middle; }
    .logo-cell { width: 22%; padding: 3px; }
    .title-cell { width: 56%; font-size: 20px; font-weight: 700; color: #0056b3; letter-spacing: 0.5px; text-transform: uppercase; }
    .qms-item { width: 22%; font-size: 9.5px; text-align: left !important; padding: 2px 6px; font-weight: 600; }

    .folio-banner { display: flex; justify-content: flex-end; font-size: 15px; font-weight: 700; color: #c00; margin: 2px 0; letter-spacing: 0.5px; }

    .blue-bar {
        background-color: #0056b3;
        color: #ffffff;
        font-weight: 700;
        font-size: 10.5px;
        letter-spacing: 0.5px;
        padding: 3px 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border: 1.5px solid #0056b3;
    }

    .sub-instructions {
        background-color: #0056b3;
        color: #ffffff;
        font-size: 8px;
        font-weight: 600;
        padding: 2.5px 6px;
        line-height: 1.15;
        border: 1.5px solid #0056b3;
    }

    .table-grid { width: 100%; border-collapse: collapse; border: 1.5px solid #0056b3; margin-bottom: 2px; }
    .table-grid td, .table-grid th { border: 1px solid #0056b3; padding: 3px 6px; font-size: 9.5px; }
    .bg-light-blue { background-color: #eaf2fc; font-weight: 700; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }
    .text-danger { color: #b91c1c !important; }

    /* Grillas de 4 columnas para ítems */
    .checklist-4col {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        border: 1.5px solid #0056b3;
        border-top: none;
        margin-bottom: 2px;
        gap: 0;
    }
    .col-sys {
        border-right: 1px solid #0056b3;
        padding: 2px 4px;
        display: flex;
        flex-direction: column;
    }
    .col-sys:last-child { border-right: none; }
    .sys-title {
        font-weight: 700;
        font-size: 9px;
        text-align: center;
        color: #0056b3;
        border-bottom: 1px solid #93c5fd;
        padding-bottom: 1.5px;
        margin-bottom: 2px;
        text-transform: uppercase;
    }
    .chk-item {
        font-size: 8.2px;
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
        gap: 3px;
        padding: 0.5px 0;
    }
    .box-v { color: #64748b; font-size: 8px; font-weight: bold; }
    .box-x { color: #dc2626; font-size: 9px; font-weight: 900; }
    .item-falla { background-color: #fee2e2; border-radius: 2px; padding: 0 1px; }

    /* Tablas de detalle de falla */
    .table-fallas { width: 100%; border-collapse: collapse; border: 1.5px solid #0056b3; margin-bottom: 2px; }
    .table-fallas th { background-color: #0056b3; color: #fff; font-size: 9px; font-weight: 700; padding: 2px 4px; border: 1px solid #0056b3; }
    .table-fallas td { border: 1px solid #0056b3; padding: 2px 5px; font-size: 8.8px; height: 18px; vertical-align: middle; }

    /* Firmas */
    .conformidad-box {
        display: grid;
        grid-template-columns: 1fr 1fr;
        border: 1.5px solid #0056b3;
        border-top: none;
        height: 70px;
    }
    .sign-col {
        border-right: 1px solid #0056b3;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 3px 6px;
        text-align: center;
    }
    .sign-col:last-child { border-right: none; }
    .sign-img-area { height: 48px; display: flex; align-items: center; justify-content: center; }
    .sign-img-area img { max-height: 44px; max-width: 170px; object-fit: contain; }
    .sign-footer-text { background-color: #eaf2fc; font-size: 9px; font-weight: 700; padding: 2.5px 0; color: #0056b3; border-top: 1px solid #93c5fd; }
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
                    <img src="${empLogoUrl}" alt="Logo" style="max-width: 100%; max-height: 44px; object-fit: contain;">
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
                <td class="text-center font-bold" style="color:#0056b3; font-size:11px;">${r.placa_tracto || '—'}</td>
                <td class="text-center">${r.km_inicial || '—'}</td>
                <td class="text-center">${r.km_final || r.km_inicial || '—'}</td>
            </tr>
            <tr>
                <td class="bg-light-blue">FECHA:</td>
                <td>${fechaFmt}</td>
                <td class="text-center font-bold">REMOLQUE</td>
                <td class="text-center font-bold" style="color:#0056b3; font-size:11px;">${r.placa_remolque || '—'}</td>
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
                <div class="sys-title" style="margin-top:2px;">DIRECCIÓN</div>
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
                <div class="sys-title" style="margin-top:2px;">CARRETA</div>
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
                <div class="sys-title" style="margin-top:2px;">FURGÓN</div>
                ${(SISTEMAS_REMOLQUE.furgon || []).map(it => renderItemR(it)).join('')}
            </div>
            <!-- Col 4: LLANTAS & TERMOKING -->
            <div class="col-sys">
                <div class="sys-title">LLANTAS & ACCESORIOS</div>
                ${(SISTEMAS_REMOLQUE.llantas || []).slice(0, 8).map(it => renderItemR(it)).join('')}
                <div class="sys-title" style="margin-top:2px;">TERMOKING / OTROS</div>
                ${(SISTEMAS_REMOLQUE.termoking || []).slice(0, 7).map(it => renderItemR(it)).join('')}
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
                    ${r.firma_conductor ? `<img src="${r.firma_conductor}" alt="Firma Conductor">` : '<span style="color:#94a3b8; font-size:9px;">(Sin firma digital)</span>'}
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

// ── EXPORTACIÓN PROFESIONAL A EXCEL (SHEETJS) ───────────────────
window.ckExportarExcel = async function() {
    const lista = window.dataGlobalChecklist || [];
    if (!lista || lista.length === 0) {
        if (typeof window.showToastNotification === 'function') {
            window.showToastNotification('No hay reportes de fallas disponibles para exportar.', 'warning');
        } else {
            alert('No hay reportes de fallas disponibles para exportar.');
        }
        return;
    }

    // Asegurar carga de librería SheetJS
    if (typeof XLSX === 'undefined') {
        try {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = '/libs/xlsx.full.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        } catch(e) {
            console.error('Error cargando SheetJS:', e);
            alert('No se pudo cargar la librería de exportación a Excel.');
            return;
        }
    }

    try {
        const rows = lista.map((r, idx) => {
            const fechaStr = r.fecha_reporte ? new Date(r.fecha_reporte).toLocaleDateString('es-PE') + ' ' + new Date(r.fecha_reporte).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '—';
            
            let countFallasTracto = 0;
            let countFallasRemolque = 0;
            try {
                const fT = r.fallas_tracto_json ? (typeof r.fallas_tracto_json === 'string' ? JSON.parse(r.fallas_tracto_json) : r.fallas_tracto_json) : [];
                const fR = r.fallas_remolque_json ? (typeof r.fallas_remolque_json === 'string' ? JSON.parse(r.fallas_remolque_json) : r.fallas_remolque_json) : [];
                countFallasTracto = Array.isArray(fT) ? fT.length : 0;
                countFallasRemolque = Array.isArray(fR) ? fR.length : 0;
            } catch(e) {}

            let otsTexto = '';
            if (r.ots_generadas_json) {
                try {
                    const ots = typeof r.ots_generadas_json === 'string' ? JSON.parse(r.ots_generadas_json) : r.ots_generadas_json;
                    if (Array.isArray(ots)) {
                        otsTexto = ots.map(o => `${o.idOt} (${o.placa || ''})`).join(', ');
                    }
                } catch(e) {}
            }

            return {
                'N°': idx + 1,
                'FOLIO': r.folio || `F-${r.id}`,
                'ORDEN DE VIAJE': r.orden_viaje || 'SIN VIAJE',
                'FECHA Y HORA': fechaStr,
                'PLACA TRACTO': r.placa_tracto || '—',
                'PLACA REMOLQUE / CARRETA': r.placa_remolque || '—',
                'CONDUCTOR': r.conductor || '—',
                'PROCEDENCIA / RUTA': r.procedencia || '—',
                'KILOMETRAJE': r.km_inicial ? Number(r.km_inicial) : 0,
                'HORAS MOTOR': r.horas_motor || '—',
                'FALLAS TRACTO': countFallasTracto,
                'FALLAS REMOLQUE': countFallasRemolque,
                'TOTAL FALLAS': countFallasTracto + countFallasRemolque,
                'ESTADO': (r.estado || 'Pendiente').toUpperCase(),
                'OTS GENERADAS': otsTexto || 'NINGUNA',
                'CREADO POR': r.creado_por || 'SISTEMA'
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        
        // Ajustar anchos de columnas
        const colWidths = [
            { wch: 6 },  // N°
            { wch: 16 }, // FOLIO
            { wch: 20 }, // ORDEN DE VIAJE
            { wch: 20 }, // FECHA
            { wch: 15 }, // PLACA TRACTO
            { wch: 25 }, // PLACA REMOLQUE
            { wch: 32 }, // CONDUCTOR
            { wch: 30 }, // RUTA
            { wch: 14 }, // KM
            { wch: 14 }, // HORAS
            { wch: 14 }, // FALLAS TRACTO
            { wch: 16 }, // FALLAS REMOLQUE
            { wch: 14 }, // TOTAL FALLAS
            { wch: 14 }, // ESTADO
            { wch: 30 }, // OTS
            { wch: 16 }  // CREADO POR
        ];
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reportes de Fallas");

        const fechaExport = new Date().toISOString().slice(0, 10);
        const fileName = `Reportes_Fallas_ERP_Azkell_${fechaExport}.xlsx`;
        XLSX.writeFile(wb, fileName);

        if (typeof window.showToastNotification === 'function') {
            window.showToastNotification('Archivo Excel exportado exitosamente con Órdenes de Viaje incluidas.', 'success');
        }
    } catch(errExport) {
        console.error('Error al exportar a Excel:', errExport);
        alert('Ocurrió un error al generar el archivo Excel: ' + errExport.message);
    }
};
