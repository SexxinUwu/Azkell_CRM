// ================================================================
// MÓDULO: REPORTE DE FALLAS MECÁNICAS (CHECKLIST F-MAN-001)
// Lógica aislada cargada dinámicamente por cargarModuloAislado
// ================================================================

var dataGlobalChecklist = window.dataGlobalChecklist || [];
var datosFiltradosChecklist = window.datosFiltradosChecklist || [];
var estadoFiltroActualChecklist = 'TODOS';
var fotosChecklistBase64 = [];
var canvasFirmaChecklist = null;
var ctxFirmaChecklist = null;
var estaFirmandoChecklist = false;

// ── DEFINICIÓN DE ÍTEMS F-MAN-001 POR SISTEMA ───────────────────
var SISTEMAS_TRACTO = window.SISTEMAS_TRACTO || {
    motor: [
        '01 Nivel de aceite motor', '02 Fugas de fluidos', '03 Filtro de aire', '04 Pérdida de potencia',
        '05 Compresora de aire', '06 Fajas, poleas, templadores', '07 Turbo', '08 Múltiple de escape',
        '09 Silenciador', '10 Cañerías de combustible'
    ],
    caja: [
        '11 Embrague', '12 Palanca de cambios', '13 Freno de Motor', '14 Ruido en la caja de cambios',
        '15 Ruido en las coronas', '16 Retenes de Corona', '17 Templadores, soportes', '18 Cardan y mechas'
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
        '37 Timón', '38 Espejos laterales', '39 Soportes de cabina', '40 Quinta rueda'
    ]
};

var SISTEMAS_REMOLQUE = window.SISTEMAS_REMOLQUE || {
    frenos: [
        '40 Revisar Zapatos', '41 Pulpo de Freno', '42 Tanque de Aire, líneas', '43 Fugas de aire',
        '44 Secador de aire', '45 Rachet de Freno'
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
    llantas: [
        '75 Reparación de llantas', '76 Cambio de llantas', '77 Rotación de llantas', '78 Presión de aire',
        '79 Seguro de tuercas', '80 Llanta de repuesto'
    ]
};

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

    // Callback de auto-consulta Wialon al seleccionar Placa Tracto
    if (typeof window._cbOnSelect === 'function') {
        window._cbOnSelect('ck_placa_tracto', function(val) {
            window.consultarGpsChecklist(val);
        });
    }

    // Renderizar grupos del checklist
    window.renderizarGruposChecklist('group-motor', SISTEMAS_TRACTO.motor, 'Tracto', 'Motor');
    window.renderizarGruposChecklist('group-caja', SISTEMAS_TRACTO.caja, 'Tracto', 'Caja/Coronas');
    window.renderizarGruposChecklist('group-refri', SISTEMAS_TRACTO.refri, 'Tracto', 'Refrigeración');
    window.renderizarGruposChecklist('group-direccion', SISTEMAS_TRACTO.direccion, 'Tracto', 'Dirección');
    window.renderizarGruposChecklist('group-cabina', SISTEMAS_TRACTO.cabina, 'Tracto', 'Cabina/Chasis');

    window.renderizarGruposChecklist('group-frenos', SISTEMAS_REMOLQUE.frenos, 'Remolque', 'Frenos');
    window.renderizarGruposChecklist('group-electrico', SISTEMAS_REMOLQUE.electrico, 'Remolque', 'Sistema Eléctrico');
    window.renderizarGruposChecklist('group-suspension', SISTEMAS_REMOLQUE.suspension, 'Remolque', 'Suspensión');
    window.renderizarGruposChecklist('group-llantas', SISTEMAS_REMOLQUE.llantas, 'Remolque', 'Llantas');

    // Inicializar firma digital
    window.initCanvasFirmaChecklist();

    // Cargar datos principales
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

    window._cbInit('ck_placa_tracto', tractos, 'Buscar placa tracto…');
    window._cbInit('ck_placa_remolque', carretas, 'Buscar placa carreta…');
};

// ── POBLAR CONDUCTORES DESDE API ─────────────────────────────────
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
            window._cbInit('ck_conductor', items, 'Buscar conductor de lista…');
        })
        .catch(err => console.warn('Error poblando conductores:', err.message));
};

// ── RENDERIZAR FILAS DE CHECKLIST DINÁMICAS (MOBILE FIRST) ──────
window.renderizarGruposChecklist = function(containerId, items, unidad, sistema) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;

    let html = '';
    items.forEach((itemText, idx) => {
        const itemId = `${unidad}_${sistema}_${idx}`.replace(/[^a-zA-Z0-9_]/g, '_');
        html += `
        <div class="ck-item-card p-2 mb-2 rounded-3 border bg-white" id="card_${itemId}">
            <div class="d-flex align-items-center justify-content-between gap-2">
                <span class="fw-bold text-dark small flex-grow-1">${itemText}</span>
                <div class="btn-group btn-group-sm" role="group">
                    <input type="radio" class="btn-check" name="st_${itemId}" id="ok_${itemId}" value="BIEN" checked onchange="window.toggleObsItem('${itemId}', false)">
                    <label class="btn btn-outline-success fw-bold py-1 px-2" for="ok_${itemId}">✓ Bien</label>

                    <input type="radio" class="btn-check" name="st_${itemId}" id="obs_${itemId}" value="OBSERVADO" onchange="window.toggleObsItem('${itemId}', true)">
                    <label class="btn btn-outline-warning fw-bold py-1 px-2" for="obs_${itemId}">⚠️ Obs</label>
                </div>
            </div>
            
            <div class="ck-obs-box mt-2 d-none" id="box_${itemId}">
                <div class="input-group input-group-sm">
                    <input type="text" class="form-control text-uppercase" id="input_${itemId}" data-item="${itemText}" data-sistema="${sistema}" data-unidad="${unidad}" placeholder="Detalle de la falla...">
                    <button class="btn btn-outline-danger" type="button" onclick="window.dictarVoz('input_${itemId}')" title="Dictar por voz">
                        <i class="bi bi-mic-fill"></i>
                    </button>
                </div>
            </div>
        </div>
        `;
    });
    wrap.innerHTML = html;
};

window.toggleObsItem = function(itemId, show) {
    const box = document.getElementById(`box_${itemId}`);
    const card = document.getElementById(`card_${itemId}`);
    if (box) box.classList.toggle('d-none', !show);
    if (card) {
        card.style.borderColor = show ? 'var(--bs-warning, #f59e0b)' : 'var(--bs-border-color, #e2e8f0)';
        card.style.background = show ? '#fffbeb' : '#ffffff';
    }
};

// ── DICTADO POR VOZ (WEB SPEECH API) ────────────────────────────
window.dictarVoz = function(targetInputId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert('El dictado por voz no está soportado en este navegador. Por favor escribe el texto manualmente.');
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-PE';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const el = document.getElementById(targetInputId);
    if (!el) return;

    el.placeholder = '🎙️ Escuchando... Habla ahora...';
    el.style.background = '#fef2f2';

    recognition.start();

    recognition.onresult = function(event) {
        const text = event.results[0][0].transcript;
        el.value = (el.value ? el.value + ' ' : '') + text;
        el.placeholder = 'Detalle de la falla...';
        el.style.background = '';
    };

    recognition.onerror = function() {
        el.placeholder = 'Detalle de la falla...';
        el.style.background = '';
    };

    recognition.onend = function() {
        el.placeholder = 'Detalle de la falla...';
        el.style.background = '';
    };
};

// ── CARGAR Y FILTRAR TABLA DE CHECKLIST ─────────────────────────
window.cargarTablaChecklist = function(forzarRefresh = false) {
    const c = document.getElementById('contenedorChecklistDinamico');
    if (c) c.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2 text-primary"></span> Cargando reportes...</td></tr>';

    fetch('/api/checklist')
        .then(r => r.json())
        .then(data => {
            window.dataGlobalChecklist = data || [];
            window.filtrarChecklist();
        })
        .catch(err => {
            console.error('Error cargando checklist:', err);
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

    let list = window.dataGlobalChecklist || [];

    if (estadoFiltroActualChecklist !== 'TODOS') {
        list = list.filter(r => (r.estado || 'Pendiente').toUpperCase() === estadoFiltroActualChecklist.toUpperCase());
    }

    if (query) {
        list = list.filter(r => 
            (r.folio || '').toLowerCase().includes(query) ||
            (r.placa_tracto || '').toLowerCase().includes(query) ||
            (r.placa_remolque || '').toLowerCase().includes(query) ||
            (r.conductor || '').toLowerCase().includes(query)
        );
    }

    window.datosFiltradosChecklist = list;
    window.renderizarTablaChecklist(list);
    window.actualizarKPIsChecklist(window.dataGlobalChecklist);
};

window.renderizarTablaChecklist = function(datos) {
    const c = document.getElementById('contenedorChecklistDinamico');
    if (!c) return;

    if (!datos || datos.length === 0) {
        c.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-3 d-block mb-2"></i>No se encontraron reportes de falla.</td></tr>';
        return;
    }

    let html = '';
    datos.forEach(r => {
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

// ── FIRMA CANVAS DIGITAL ─────────────────────────────────────────
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
                imgDiv.className = 'position-relative border rounded-3 overflow-hidden';
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

// ── CONSULTAR GPS DESDE WIALON (KILOMETRAJE + UBICACIÓN AUTOMÁTICA) ──
window.consultarGpsChecklist = function(placaManual) {
    const placaTxt = (document.getElementById('ck_placa_tracto-txt') || {}).value || '';
    const placaCb = typeof window._cbGet === 'function' ? window._cbGet('ck_placa_tracto') : '';
    const placa = (placaManual || placaCb || placaTxt).toString().trim().toUpperCase();

    if (!placa) return;

    const inputGps = document.getElementById('ck_ubicacion_gps');
    const inputKm = document.getElementById('ck_kilometraje');

    if (inputGps) inputGps.value = 'Consultando GPS Wialon...';

    // 1. Intentar obtener datos Wialon directamente desde caché o buscarWialonPorPlaca
    const wD = (typeof buscarWialonPorPlaca === 'function') ? buscarWialonPorPlaca(placa) : null;
    if (wD) {
        if (inputKm && wD.km > 0) {
            inputKm.value = Math.round(wD.km);
        }

        if (wD.lat && wD.lng && inputGps) {
            (async () => {
                let dirTxt = `${wD.lat.toFixed(5)}, ${wD.lng.toFixed(5)}`;
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${wD.lat}&lon=${wD.lng}`);
                    const data = await res.json();
                    const calle  = data.address?.road || data.address?.suburb || data.address?.neighbourhood || '';
                    const ciudad = data.address?.city || data.address?.town || data.address?.county || '';
                    if (calle || ciudad) {
                        dirTxt = ciudad ? `${calle}, ${ciudad}` : calle;
                    }
                } catch(e) {}
                if (inputGps) inputGps.value = dirTxt || 'Ubicación actual en ruta';
            })();
            return;
        }
    }

    // 2. Fallback a obtenerDatosStatusFlota
    fetch('/api/script/obtenerDatosStatusFlota', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json())
        .then(j => {
            const rows = j.data || [];
            const match = rows.find(r => (r[3] || '').toString().trim().toUpperCase() === placa);
            if (match) {
                if (match[7] && inputGps) inputGps.value = match[7];
                if (match[11] && inputKm && !inputKm.value) inputKm.value = match[11];
            } else {
                if (inputGps) inputGps.value = 'Ubicación actual en ruta';
            }
        })
        .catch(() => {
            if (inputGps) inputGps.value = 'Ubicación actual en ruta';
        });
};

// ── ABRIR MODAL NUEVO REPORTE ────────────────────────────────────
window.abrirModalNuevoChecklist = function() {
    const form = document.getElementById('formNuevoChecklist');
    if (form) form.reset();

    fotosChecklistBase64 = [];
    const wrapFotos = document.getElementById('ck_preview_fotos');
    if (wrapFotos) wrapFotos.innerHTML = '';

    window.limpiarFirmaChecklist();
    window.poblarPlacasChecklist();
    window.poblarConductoresChecklist();

    const modalEl = document.getElementById('modalNuevoChecklist');
    if (modalEl) new bootstrap.Modal(modalEl).show();
};

// ── GUARDAR NUEVO REPORTE ────────────────────────────────────────
window.guardarChecklist = function(event) {
    event.preventDefault();
    if (!window.guardAction('checklist', 'c')) return;

    const btn = document.getElementById('btnGuardarChecklist');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Guardando...';

    // Recolectar fallas de Tracto y Remolque observadas
    const fallasTracto = [];
    const fallasRemolque = [];

    document.querySelectorAll('.ck-obs-box:not(.d-none) input').forEach(input => {
        const obsText = (input.value || '').trim();
        if (obsText) {
            const item = input.getAttribute('data-item');
            const sistema = input.getAttribute('data-sistema');
            const unidad = input.getAttribute('data-unidad');

            const obj = { sistema, item, obs: obsText };
            if (unidad === 'Remolque' || unidad === 'Carreta') {
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

    const placaTracto = (typeof window._cbGet === 'function' ? window._cbGet('ck_placa_tracto') : '') || (document.getElementById('ck_placa_tracto-txt') || {}).value || '';
    const placaRemolque = (typeof window._cbGet === 'function' ? window._cbGet('ck_placa_remolque') : '') || (document.getElementById('ck_placa_remolque-txt') || {}).value || '';
    const conductorNombre = (typeof window._cbGet === 'function' ? window._cbGet('ck_conductor') : '') || (document.getElementById('ck_conductor-txt') || {}).value || '';
    const kilometrajeVal = (document.getElementById('ck_kilometraje') || {}).value || 0;

    const payload = {
        placa_tracto: placaTracto,
        placa_remolque: placaRemolque,
        km_inicial: kilometrajeVal,
        km_final: kilometrajeVal,
        conductor: conductorNombre,
        procedencia: (document.getElementById('ck_procedencia') || {}).value || '',
        ubicacion_gps: (document.getElementById('ck_ubicacion_gps') || {}).value || '',
        fallas_tracto: fallasTracto,
        fallas_remolque: fallasRemolque,
        fallas_libres_text: (document.getElementById('ck_fallas_libres') || {}).value || '',
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
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Guardar Reporte de Fallas';

        if (res.ok) {
            const modalEl = document.getElementById('modalNuevoChecklist');
            if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();

            window.cargarTablaChecklist(true);

            // Si se registraron fallas, preguntar si desea generar OTs de inmediato
            if (fallasTracto.length > 0 || fallasRemolque.length > 0 || payload.fallas_libres_text) {
                if (confirm(`✅ Reporte ${res.folio} guardado con éxito. ¿Deseas asignar rampa y generar las Órdenes de Trabajo (OT) ahora mismo?`)) {
                    window.abrirModalGenerarOTs(res.id);
                }
            } else {
                alert(`✅ Reporte de Fallas ${res.folio} guardado correctamente.`);
            }
        } else {
            alert('❌ Error guardando reporte: ' + (res.error || 'Desconocido'));
        }
    })
    .catch(err => {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Guardar Reporte de Fallas';
        alert('❌ Error de conexión: ' + err.message);
    });
};

// ── ABRIR MODAL GENERACIÓN DE OTS ────────────────────────────────
// ── MAPA DE SUBTIPOS POR TIPO DE OT ──────────────────────────────
var CK_OT_SUBTIPOS = window.CK_OT_SUBTIPOS || {
    'Preventivo': ['Inspección Pre-PM','Campaña','Limpieza Integral','Rutina','Programado','Oportuno'],
    'Correctivo': ['Falla','Varado','Programado','Garantía','Accidentabilidad','Mala Operación'],
    'Predictivo': ['Por condición','Prueba'],
    'Proactivo':  ['Mejora'],
    'Servicio':   ['Stock','Taller']
};

window.ckCambiarTipoOT = function(selectEl) {
    const tipo = selectEl.value;
    const card = selectEl.closest('.card-body');
    if (!card) return;
    const subSel = card.querySelector('.ot-subtipo');
    if (!subSel) return;

    const opts = CK_OT_SUBTIPOS[tipo] || [];
    subSel.innerHTML = '<option value="">-- Seleccionar Subtipo --</option>' + opts.map(s => `<option value="${s}">${s}</option>`).join('');
    subSel.disabled = !opts.length;
    if (opts.length > 0) subSel.value = opts[0];
};

window.filtrarTecnicosDropdown = function(inputEl) {
    const q = inputEl.value.toLowerCase().trim();
    const items = inputEl.closest('.dropdown-menu').querySelectorAll('.list-tecnicos-items .form-check');
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(q) ? 'block' : 'none';
    });
};

window.actualizarLabelTecnicos = function(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;

    const chks = card.querySelectorAll('.chk-tecnico:checked');
    const label = card.querySelector('.sel-tec-label');
    const cnt = card.querySelector('.cnt-tec-sel');

    const selected = Array.from(chks).map(c => c.value);
    if (label) {
        label.textContent = selected.length > 0 ? selected.join(', ') : 'Selecciona técnico(s)...';
    }
    if (cnt) {
        cnt.textContent = `${selected.length} seleccionados`;
    }
};

window.limpiarTecnicosDropdown = function(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.querySelectorAll('.chk-tecnico').forEach(c => c.checked = false);
    window.actualizarLabelTecnicos(cardId);
};

// ── ABRIR MODAL GENERACIÓN DE OTS ────────────────────────────────
window.abrirModalGenerarOTs = function(idReporte) {
    fetch('/api/checklist/' + idReporte)
        .then(r => r.json())
        .then(rep => {
            document.getElementById('gen_reporte_id').value = rep.id;
            const wrap = document.getElementById('contenedorTarjetasOTsGen');
            if (!wrap) return;

            let fallasTracto = rep.fallas_tracto_json || [];
            let fallasRemolque = rep.fallas_remolque_json || [];

            // Obtener lista de personal / técnicos
            fetch('/api/conductores')
                .then(r => r.ok ? r.json() : [])
                .then(conductoresData => {
                    const listTecs = [];
                    const listRaw = Array.isArray(conductoresData) ? conductoresData : (conductoresData.data || []);
                    listRaw.forEach(c => {
                        let name = typeof c === 'string' ? c : (c.nombres_apellidos || c.nombre || c.conductor || '');
                        name = String(name).trim();
                        if (name && !listTecs.includes(name)) listTecs.push(name);
                    });
                    listTecs.sort();

                    let html = '';
                    let cardCounter = 0;

                    const renderOtCard = (unidad, placa, fallas, esSegunda = false) => {
                        cardCounter++;
                        const cardId = `ot_card_${cardCounter}`;

                        let fallasHtml = '';
                        if (fallas.length > 0) {
                            fallasHtml = fallas.map((f, idx) => `
                                <div class="form-check py-1">
                                    <input class="form-check-input chk-falla-ot" type="checkbox" value="[${f.sistema || 'SISTEMA'}] ${f.item}: ${f.obs}" id="${cardId}_falla_${idx}" checked>
                                    <label class="form-check-label small text-dark fw-semibold" for="${cardId}_falla_${idx}">
                                        <strong>[${f.sistema || 'SISTEMA'}]</strong> ${f.item}: <span class="text-danger">${f.obs}</span>
                                    </label>
                                </div>
                            `).join('');
                        } else if (rep.fallas_libres_text) {
                            fallasHtml = `
                                <div class="form-check py-1">
                                    <input class="form-check-input chk-falla-ot" type="checkbox" value="[REPORTE LIBRE] ${rep.fallas_libres_text}" id="${cardId}_falla_libre" checked>
                                    <label class="form-check-label small text-danger fw-bold" for="${cardId}_falla_libre">
                                        [REPORTE LIBRE]: ${rep.fallas_libres_text}
                                    </label>
                                </div>
                            `;
                        } else {
                            fallasHtml = '<div class="text-muted small">Sin fallas registradas en checklist.</div>';
                        }

                        const badgeBg = unidad === 'Tracto' ? 'bg-primary' : 'bg-success';
                        const titleIcon = unidad === 'Tracto' ? 'bi-truck' : 'bi-truck-flatbed';

                        return `
                        <div class="card border mb-3 shadow-sm rounded-3 card-ot-gen" id="${cardId}">
                            <div class="card-header ${badgeBg} bg-opacity-10 fw-bold ${unidad === 'Tracto' ? 'text-primary' : 'text-success'} d-flex justify-content-between align-items-center py-2">
                                <span><i class="bi ${titleIcon} me-1"></i> OT para ${unidad} (${placa})</span>
                                <span class="badge ${badgeBg} rounded-pill">${fallas.length} trabajos reportados</span>
                            </div>
                            <div class="card-body p-3">
                                <input type="hidden" class="ot-unidad" value="${unidad}">
                                <input type="hidden" class="ot-placa" value="${placa}">
                                
                                <div class="row g-2 mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold small">Tipo de OT *</label>
                                        <select class="form-select form-select-sm ot-tipo" onchange="window.ckCambiarTipoOT(this)" required>
                                            <option value="Correctivo" selected>Correctivo</option>
                                            <option value="Preventivo">Preventivo</option>
                                            <option value="Predictivo">Predictivo</option>
                                            <option value="Proactivo">Proactivo</option>
                                            <option value="Servicio">Servicio</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold small">Subtipo de OT *</label>
                                        <select class="form-select form-select-sm ot-subtipo" required>
                                            <option value="Falla" selected>Falla</option>
                                            <option value="Varado">Varado</option>
                                            <option value="Programado">Programado</option>
                                            <option value="Garantía">Garantía</option>
                                            <option value="Accidentabilidad">Accidentabilidad</option>
                                            <option value="Mala Operación">Mala Operación</option>
                                        </select>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label fw-bold small">Personal / Técnico(s) Asignados *</label>
                                        <div id="${cardId}_tecnicos_container"></div>
                                    </div>
                                </div>

                                <!-- Selección de Fallas para esta OT -->
                                <div class="p-2 border rounded-3 bg-light mb-2">
                                    <label class="form-label fw-bold small text-dark d-block mb-1">
                                        <i class="bi bi-check2-square text-primary me-1"></i> Selecciona los trabajos / fallas a incluir en esta OT:
                                    </label>
                                    <div class="list-fallas-ot-container bg-white p-2 rounded border" style="max-height: 140px; overflow-y: auto;">
                                        ${fallasHtml}
                                    </div>
                                    <div class="mt-2">
                                        <input type="text" class="form-control form-control-sm ot-trabajo-custom" placeholder="✍️ Agregar otra falla o nota adicional manual para esta OT...">
                                    </div>
                                </div>
                            </div>
                        </div>
                        `;
                    };

                    if (rep.placa_tracto) {
                        html += renderOtCard('Tracto', rep.placa_tracto, fallasTracto);
                    }

                    if (rep.placa_remolque && (fallasRemolque.length > 0 || !rep.placa_tracto)) {
                        html += renderOtCard('Remolque', rep.placa_remolque, fallasRemolque);
                    }

                    wrap.innerHTML = html;

                    // Renderizar los dropdowns de multi-técnicos
                    for (let i = 1; i <= cardCounter; i++) {
                        window.renderMultiTecnicosOptions(`ot_card_${i}`, listTecs);
                    }

                    new bootstrap.Modal(document.getElementById('modalGenerarOTsFromChecklist')).show();
                });
        })
        .catch(err => alert('Error obteniendo reporte: ' + err.message));
};

window.enviarGeneracionOTs = function(event) {
    event.preventDefault();
    const idReporte = document.getElementById('gen_reporte_id').value;
    const rampa = document.getElementById('gen_id_rampa').value;

    const ots = [];
    document.querySelectorAll('#contenedorTarjetasOTsGen .card-ot-gen').forEach(card => {
        const unidad = card.querySelector('.ot-unidad').value;
        const placa = card.querySelector('.ot-placa').value;
        const tipo_ot = card.querySelector('.ot-tipo').value;
        const subtipo_ot = card.querySelector('.ot-subtipo').value;
        const trabajo_custom = (card.querySelector('.ot-trabajo-custom') || {}).value || '';

        // Recolectar fallas seleccionadas
        const fallasSeleccionadas = [];
        card.querySelectorAll('.chk-falla-ot:checked').forEach(chk => {
            fallasSeleccionadas.push(chk.value);
        });

        // Recolectar técnicos seleccionados
        const tecnicos = [];
        card.querySelectorAll('.chk-tecnico:checked').forEach(chk => {
            tecnicos.push(chk.value);
        });

        ots.push({
            unidad,
            placa,
            tipo_ot,
            subtipo_ot,
            tecnicos,
            fallas_seleccionadas: fallasSeleccionadas,
            trabajo_custom
        });
    });

    if (ots.length === 0) { alert('No hay OTs para generar.'); return; }

    const btn = document.getElementById('btnConfirmarGenerarOTs');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Generando OTs...';

    fetch(`/api/checklist/${idReporte}/generar-ots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ots,
            id_rampa: rampa,
            creado_por: window.usuarioLogueado || 'Sistema'
        })
    })
    .then(r => r.json())
    .then(res => {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-rocket-takeoff-fill me-1"></i> Confirmar y Generar OTs';

        if (res.ok) {
            bootstrap.Modal.getInstance(document.getElementById('modalGenerarOTsFromChecklist')).hide();
            window.cargarTablaChecklist(true);
            alert(`🚀 Se generaron exitosamente ${res.total} Órdenes de Trabajo (OT) e integró con Status Rampa.`);
        } else {
            alert('❌ Error al generar OTs: ' + (res.error || 'Desconocido'));
        }
    })
    .catch(err => {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-rocket-takeoff-fill me-1"></i> Confirmar y Generar OTs';
        alert('❌ Error de conexión: ' + err.message);
    });
};

// ── VER DETALLE DIGITAL REPORTE F-MAN-001 ────────────────────────
window.abrirDetalleChecklist = function(idReporte) {
    fetch('/api/checklist/' + idReporte)
        .then(r => r.json())
        .then(rep => {
            document.getElementById('det-ck-folio').textContent = rep.folio;
            const body = document.getElementById('det-ck-body');
            if (!body) return;

            let fallasT = rep.fallas_tracto_json || [];
            let fallasR = rep.fallas_remolque_json || [];
            let fotos = rep.fotos || [];

            let htmlT = fallasT.map(f => `<div class="p-2 border-bottom small"><strong>[${f.sistema}]</strong> ${f.item}: <span class="text-danger fw-bold">${f.obs}</span></div>`).join('') || '<div class="text-muted small p-2">Sin fallas observadas en Tracto.</div>';
            let htmlR = fallasR.map(f => `<div class="p-2 border-bottom small"><strong>[${f.sistema}]</strong> ${f.item}: <span class="text-danger fw-bold">${f.obs}</span></div>`).join('') || '<div class="text-muted small p-2">Sin fallas observadas en Remolque.</div>';

            let htmlFotos = fotos.map(u => `<a href="${u}" target="_blank"><img src="${u}" style="width:90px; height:90px; object-fit:cover;" class="rounded-3 border shadow-sm me-2 mb-2"></a>`).join('') || '<span class="text-muted small">Sin evidencias fotográficas.</span>';

            body.innerHTML = `
                <div class="card border-0 shadow-sm p-3 mb-3 bg-light">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="fw-bold m-0 text-primary">${rep.folio}</h6>
                        <span class="badge bg-primary rounded-pill">${rep.estado}</span>
                    </div>
                    <div class="small text-muted"><strong>Conductor:</strong> ${rep.conductor || '—'} | <strong>Ruta:</strong> ${rep.procedencia || '—'}</div>
                    <div class="small text-muted"><strong>Tracto:</strong> ${rep.placa_tracto || '—'} | <strong>Carreta:</strong> ${rep.placa_remolque || '—'}</div>
                    <div class="small text-muted"><strong>Ubicación GPS:</strong> ${rep.ubicacion_gps || '—'}</div>
                </div>

                <h6 class="fw-bold text-dark border-bottom pb-2">🚚 Fallas Observadas - Tracto</h6>
                <div class="mb-3 bg-white border rounded-3">${htmlT}</div>

                <h6 class="fw-bold text-dark border-bottom pb-2">🚛 Fallas Observadas - Remolque / Carreta</h6>
                <div class="mb-3 bg-white border rounded-3">${htmlR}</div>

                ${rep.fallas_libres_text ? `
                <h6 class="fw-bold text-dark border-bottom pb-2">💡 Observaciones Generales / No Clasificadas</h6>
                <div class="p-3 mb-3 bg-white border rounded-3 text-danger fw-bold small">${rep.fallas_libres_text}</div>
                ` : ''}

                <h6 class="fw-bold text-dark border-bottom pb-2">📷 Evidencia Fotográfica (AWS S3)</h6>
                <div class="mb-3">${htmlFotos}</div>

                ${rep.firma_conductor ? `
                <h6 class="fw-bold text-dark border-bottom pb-2">✍️ Firma Digital del Conductor</h6>
                <div class="p-2 border rounded-3 bg-white text-center mb-3">
                    <img src="${rep.firma_conductor}" style="max-width:250px; max-height:100px;">
                </div>
                ` : ''}

                <button class="btn btn-outline-secondary w-100 fw-bold mt-2" onclick="window.print()">
                    <i class="bi bi-printer me-1"></i> Imprimir Reporte F-MAN-001
                </button>
            `;

            new bootstrap.Offcanvas(document.getElementById('offcanvasDetalleChecklist')).show();
        });
};

window.eliminarChecklist = function(id) {
    if (!confirm('¿Estás seguro de eliminar este reporte de fallas?')) return;
    fetch('/api/checklist/' + id, { method: 'DELETE' })
        .then(r => r.json())
        .then(() => window.cargarTablaChecklist(true));
};
