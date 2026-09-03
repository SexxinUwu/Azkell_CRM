// =========================================================================
// MÓDULO SEGURIDAD: CHECKLIST "ENTREGA DE VEHÍCULOS"
// Formato Oficial: Inventario Físico Estado de Vehículo
// =========================================================================

(function() {
    'use strict';

    window.dataGlobalEntregaVehiculos = [];
    window._evEmpresaActiva = 'TODAS';
    window._evCatalogoPlacas = [];
    window._evCatalogoConductores = [];

    // Estructura de Partes y Accesorios fiel al formato impreso
    const PARTES_SECCIONES = [
        {
            columna: 1,
            grupos: [
                {
                    titulo: 'Frente Exterior',
                    items: ['Emblemas', 'Persianas', 'Defensa Delantera', 'Luz Chica', 'Unidades', 'Direccionales']
                },
                {
                    titulo: 'Interior del Motor',
                    items: ['Batería Marca', 'Tapa Radiador', 'Tapa Aceite', 'Varilla Medidora de Aceite', 'Correas de Ventilador', 'Corneta', 'Sirenas']
                },
                {
                    titulo: 'Frente Superior',
                    items: ['Vidrio Panorámico', 'Brazos Limpia Brisas', 'Cuchillas Limpia Brisas', 'Antena Radio']
                },
                {
                    titulo: 'Costado Izquierdo',
                    items: ['Vidrios Laterales', 'Manija', 'Cerraduras', 'Copas Ruedas']
                },
                {
                    titulo: 'Estribos',
                    items: ['Derecho', 'Izquierdo']
                },
                {
                    titulo: 'Costado Trasero',
                    items: ['Emblemas', 'Defensa Trasera', 'Steps Frenos', 'Luces de Parqueo', 'Freno Auxiliar']
                }
            ]
        },
        {
            columna: 2,
            grupos: [
                {
                    titulo: 'Direccionales y Luces',
                    items: ['Direccionales', 'Reversos', 'Vidrios Traseros', 'Tapa Tanque Combustible']
                },
                {
                    titulo: 'Costado Derecho',
                    items: ['Vidrios Laterales', 'Manijas', 'Cerraduras', 'Copas Ruedas']
                },
                {
                    titulo: 'Llaves',
                    items: ['Puertas', 'Ignición', 'Baúl']
                },
                {
                    titulo: 'Interior del Vehículo',
                    items: ['Consola', 'Autoradio', 'Guantera', 'Seguro Puerta', 'Manija Puerta', 'Manija Vidrio', 'Luz Interior', 'Cojinería', 'Forros', 'Tapetes', 'Cenicero', 'Descansabrazos', 'Descansacabezas', 'Radio Teléfono', 'Intercomunicador', 'Espejo Retrovisor']
                },
                {
                    titulo: 'Tablero de Controles',
                    items: ['Switch Ignición', 'Interruptor Luces Delanteras', 'Interruptor Luces Parqueo', 'Direccionales', 'Claxon']
                }
            ]
        },
        {
            columna: 3,
            grupos: [
                {
                    titulo: 'Instrumentos y Cabina',
                    items: ['Sirena', 'Calefacción', 'Tacómetro', 'Encendedor Cigarrillos', 'Velocímetro', 'Medidor de Combustible', 'Medidor de Temperatura', 'Medidor de Aceite']
                },
                {
                    titulo: 'Herramientas',
                    items: ['Gata', 'Llave de Ruedas', 'Cable de Corriente', 'Palancas', 'Destornillador', 'Desarmador Mixto', 'Llaves Fijas', 'Alicate', 'Linterna (Pilas o Conexión)', 'Kit de Herramientas', 'Llave Allen para Semirremolque', 'Llave Allen para Doble Nivel', 'Pernos de Seguridad']
                },
                {
                    titulo: 'Señales de Advertencia de Peligro',
                    items: ['Triángulos', 'Lámparas de Luz Intermitente', 'Tacos para Bloquear Vehículo', 'Extintor (Expira)', 'Conos']
                },
                {
                    titulo: 'Otros',
                    items: ['Bonificación Vehicular', 'Mando']
                }
            ]
        }
    ];

    // Variables de canvas para firmas
    let _canvasEntrega, _ctxEntrega, _dibujandoEntrega = false;
    let _canvasRecibe, _ctxRecibe, _dibujandoRecibe = false;

    window.inicializarModuloEntregaVehiculos = function() {
        window.evRenderizarPartesAccesorios();
        window.evCargarRecursos();
        window.evCargarDatos();
        window.evInitCanvasFirmas();
    };

    // ── CARGAR RECURSOS PARA AUTOCOMPLETADO ────────────────────────
    window.evCargarRecursos = async function() {
        try {
            const res = await fetch('/api/seguridad/recursos');
            const data = await res.json();
            if (data) {
                window._evCatalogoPlacas = data.placas || [];
                window._evCatalogoConductores = data.conductores || [];

                const dlP = document.getElementById('ev-dl-placas');
                const dlC = document.getElementById('ev-dl-conductores');

                if (dlP) dlP.innerHTML = (data.placas || []).map(p => `<option value="${p}">`).join('');
                if (dlC) dlC.innerHTML = (data.conductores || []).map(c => `<option value="${c}">`).join('');
            }
        } catch(e) {
            console.warn('Error cargando recursos de entrega:', e);
        }
    };

    // ── RENDERIZAR PARTES Y ACCESORIOS FIEL AL FORMATO IMPRESO ────
    window.evRenderizarPartesAccesorios = function() {
        const cont = document.getElementById('ev-partes-accesorios-container');
        if (!cont) return;

        let html = '';
        PARTES_SECCIONES.forEach(col => {
            html += `<div class="col-12 col-md-4">`;
            html += `<table class="ev-grid-table" style="font-size:0.75rem;">`;
            html += `
                <thead>
                    <tr>
                        <th>PARTES Y ACCESORIOS</th>
                        <th style="width:36px;">CANT</th>
                        <th style="width:75px;">ESTADO<br><span style="font-size:0.65rem;">B \| R \| M</span></th>
                    </tr>
                </thead>
                <tbody>
            `;

            col.grupos.forEach(grp => {
                html += `<tr><td colspan="3" style="background:#f1f5f9; font-weight:800; text-transform:uppercase; color:#0f172a; padding:3px 6px;">${grp.titulo}</td></tr>`;
                grp.items.forEach(it => {
                    const cleanKey = it.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    html += `
                        <tr>
                            <td class="fw-semibold text-dark">${it}</td>
                            <td style="padding:1px;"><input type="text" id="ev-cant-${cleanKey}" class="ev-input-field text-center p-0" placeholder="1" style="font-size:0.75rem;"></td>
                            <td class="text-center" style="padding:1px; white-space:nowrap;">
                                <div class="d-inline-flex gap-1 justify-content-center">
                                    <button type="button" class="ev-chk-state-btn" id="ev-btn-${cleanKey}-b" onclick="window.evSetItemState('${cleanKey}', 'B')" title="Bueno">B</button>
                                    <button type="button" class="ev-chk-state-btn" id="ev-btn-${cleanKey}-r" onclick="window.evSetItemState('${cleanKey}', 'R')" title="Regular">R</button>
                                    <button type="button" class="ev-chk-state-btn" id="ev-btn-${cleanKey}-m" onclick="window.evSetItemState('${cleanKey}', 'M')" title="Malo">M</button>
                                </div>
                            </td>
                        </tr>
                    `;
                });
            });

            html += `</tbody></table></div>`;
        });

        cont.innerHTML = html;
    };

    window._evItemsStates = {};
    window.evSetItemState = function(key, state) {
        const cur = window._evItemsStates[key];
        ['b', 'r', 'm'].forEach(s => {
            const btn = document.getElementById(`ev-btn-${key}-${s}`);
            if (btn) btn.className = 'ev-chk-state-btn';
        });

        if (cur === state) {
            delete window._evItemsStates[key];
        } else {
            window._evItemsStates[key] = state;
            const btn = document.getElementById(`ev-btn-${key}-${state.toLowerCase()}`);
            if (btn) btn.classList.add(`active-${state.toLowerCase()}`);
        }
    };

    // ── VISTAS: PORTAL / LISTADO / FORMULARIO ─────────────────────
    window.evIrAPortal = function() {
        document.getElementById('ev-view-portal')?.classList.remove('d-none');
        document.getElementById('ev-view-list')?.classList.add('d-none');
        document.getElementById('ev-view-form')?.classList.add('d-none');
        window.evCargarDatos();
    };

    window.evSeleccionarEmpresa = function(empresa) {
        window._evEmpresaActiva = empresa;
        document.getElementById('ev-view-portal')?.classList.add('d-none');
        document.getElementById('ev-view-list')?.classList.remove('d-none');
        document.getElementById('ev-view-form')?.classList.add('d-none');

        const tit = document.getElementById('ev-list-empresa-titulo');
        const sub = document.getElementById('ev-list-empresa-sub');
        if (tit) tit.textContent = empresa === 'TODAS' ? 'TODAS LAS EMPRESAS' : empresa;
        if (sub) sub.textContent = `Registros de entrega de unidades — ${empresa}`;

        window.evRenderizarTablaLista();
    };

    window.evAbrirNuevoFormulario = function(empresa) {
        if (empresa) window._evEmpresaActiva = empresa;
        document.getElementById('ev-view-portal')?.classList.add('d-none');
        document.getElementById('ev-view-list')?.classList.add('d-none');
        document.getElementById('ev-view-form')?.classList.remove('d-none');

        // Limpiar Formulario
        const hoy = new Date().toISOString().slice(0, 10);
        const fFecha = document.getElementById('ev-f-fecha');
        if (fFecha) fFecha.value = hoy;
        const metaF = document.getElementById('ev-f-meta-fecha');
        if (metaF) metaF.textContent = new Date().toLocaleDateString('es-PE');

        const year = new Date().getFullYear();
        const rand = String(Math.floor(Math.random() * 9000) + 1000);
        const invEl = document.getElementById('ev-f-nro-inv');
        if (invEl) invEl.value = `ENT-${year}-${rand}`;

        // Reset inputs
        ['ev-f-entrega', 'ev-f-recibe', 'ev-f-clase', 'ev-f-marca', 'ev-f-tipo', 'ev-f-modelo', 'ev-f-placa', 'ev-f-color', 'ev-f-cilindros', 'ev-f-motor', 'ev-f-serie', 'ev-f-km', 'ev-f-ll-del-der', 'ev-f-ll-del-izq', 'ev-f-ll-tra-der', 'ev-f-ll-tra-izq', 'ev-f-ll-rep', 'ev-f-obs', 'ev-f-doc-entrega', 'ev-f-doc-recibe'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        window._evItemsStates = {};
        window.evRenderizarPartesAccesorios();
        window.evLimpiarFirma('entrega');
        window.evLimpiarFirma('recibe');
    };

    window.evCancelarFormulario = function() {
        if (window._evEmpresaActiva && window._evEmpresaActiva !== 'TODAS') {
            window.evSeleccionarEmpresa(window._evEmpresaActiva);
        } else {
            window.evIrAPortal();
        }
    };

    // ── AUTOCOMPLETADO DE FICHA TÉCNICA AL INGRESAR PLACA ──────────
    window.evOnPlacaInput = async function(placa) {
        const cleanP = String(placa || '').trim().toUpperCase();
        if (cleanP.length < 3) return;

        try {
            const res = await fetch(`/api/placas/${encodeURIComponent(cleanP)}`);
            const json = await res.json();
            if (json && json.ok && json.data) {
                const d = json.data;
                const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
                setVal('ev-f-clase', d.tipo || d.sub_tipo || 'TRACTO');
                setVal('ev-f-marca', d.marca);
                setVal('ev-f-modelo', d.modelo || d.modelo_uts);
                setVal('ev-f-color', d.color);
                setVal('ev-f-motor', d.nro_motor || d.modelo_motor);
                setVal('ev-f-serie', d.nro_vin);
                setVal('ev-f-km', d.odometro || d.km_inicial);
                setVal('ev-f-tipo', d.sub_tipo || d.tipo);
            }
        } catch(e) {}
    };

    // ── CARGAR DATOS DESDE LA API ─────────────────────────────────
    window.evCargarDatos = async function() {
        try {
            const token = localStorage.getItem('fleet_token') || sessionStorage.getItem('fleet_token');
            const res = await fetch('/api/seguridad/entrega-vehiculos', {
                headers: { 'Authorization': token ? `Bearer ${token}` : '' }
            });
            const json = await res.json();
            if (json.ok && Array.isArray(json.data)) {
                window.dataGlobalEntregaVehiculos = json.data;
                window.evActualizarPortalCards(json.data);
                window.evRenderizarHistorialPortal(json.data);
            }
        } catch(e) {
            console.error('Error cargando entregas de vehiculos:', e);
        }
    };

    window.evActualizarPortalCards = function(data) {
        const grid = document.getElementById('ev-portal-companies-grid');
        if (!grid) return;

        const empresas = ['MARSISA', 'TRAHESA', 'SEÑOR DE LUREN'];
        const empStats = {};
        empresas.forEach(e => empStats[e] = 0);

        data.forEach(r => {
            const emp = (r.empresa || 'MARSISA').toUpperCase().trim();
            empStats[emp] = (empStats[emp] || 0) + 1;
        });

        let html = '';

        // Card "Todas las Empresas"
        html += `
            <div class="col-12 col-md-6 col-lg-3">
                <div class="ev-company-card" onclick="window.evSeleccionarEmpresa('TODAS')">
                    <div>
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <div class="ev-company-icon" style="background:#eff6ff; color:#0284c7;"><i class="bi bi-grid-fill"></i></div>
                            <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2 py-1">${data.length} Entregas</span>
                        </div>
                        <h5 class="fw-bold text-dark m-0">TODAS LAS EMPRESAS</h5>
                        <small class="text-muted">Panorama corporativo consolidado</small>
                    </div>
                </div>
            </div>
        `;

        const colors = [
            { bg: '#f0fdf4', col: '#16a34a', icon: 'bi-truck-front-fill' },
            { bg: '#fffbeb', col: '#d97706', icon: 'bi-building-fill' },
            { bg: '#faf5ff', col: '#7c3aed', icon: 'bi-box-seam-fill' }
        ];

        empresas.forEach((emp, i) => {
            const c = colors[i % colors.length];
            const cnt = empStats[emp] || 0;
            html += `
                <div class="col-12 col-md-6 col-lg-3">
                    <div class="ev-company-card" onclick="window.evSeleccionarEmpresa('${emp}')">
                        <div>
                            <div class="d-flex align-items-center justify-content-between mb-2">
                                <div class="ev-company-icon" style="background:${c.bg}; color:${c.col};"><i class="bi ${c.icon}"></i></div>
                                <span class="badge bg-light text-secondary border rounded-pill px-2 py-1">${cnt} Registros</span>
                            </div>
                            <h5 class="fw-bold text-dark m-0">${emp}</h5>
                            <small class="text-muted">Actas de entrega de flota</small>
                        </div>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
    };

    window.evRenderizarHistorialPortal = function(data) {
        const tbody = document.getElementById('ev-portal-historial-tbody');
        const count = document.getElementById('ev-lbl-historial-count');
        if (!tbody) return;

        if (count) count.textContent = `${data.length} entregas registradas`;

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No hay entregas registradas aún. Haz clic en "Nueva Entrega de Unidad".</td></tr>`;
            return;
        }

        let html = '';
        data.slice(0, 15).forEach(r => {
            let fechaFmt = r.fecha || '---';
            if (r.fecha && r.fecha.includes('-')) {
                const p = r.fecha.slice(0, 10).split('-');
                if (p.length === 3) fechaFmt = `${p[2]}/${p[1]}/${p[0]}`;
            }

            html += `
                <tr>
                    <td><span class="badge bg-light text-dark border font-monospace fw-bold px-2 py-1">${r.numero_inventario || r.id}</span></td>
                    <td><span class="font-monospace fw-semibold">${fechaFmt}</span></td>
                    <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace fw-bold px-2 py-1">${r.placa}</span></td>
                    <td><div class="fw-bold text-dark small"><i class="bi bi-person-fill text-secondary me-1"></i>${r.quien_entrega}</div></td>
                    <td><div class="fw-bold text-dark small"><i class="bi bi-person-check-fill text-success me-1"></i>${r.quien_recibe}</div></td>
                    <td><span class="badge bg-secondary-subtle text-secondary small fw-bold">${r.empresa || 'MARSISA'}</span></td>
                    <td><span class="font-monospace fw-bold text-dark">${parseFloat(r.kilometraje || 0).toLocaleString('es-PE')} km</span></td>
                    <td style="text-align:center;">
                        <button type="button" class="btn btn-sm btn-outline-primary rounded-2 px-2 py-1 fw-bold" onclick="window.evImprimirPDF('${r.id}')" title="Generar / Imprimir PDF">
                            <i class="bi bi-file-earmark-pdf-fill me-1"></i> PDF
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    };

    window.evRenderizarTablaLista = function() {
        const tbody = document.getElementById('ev-list-tbody');
        if (!tbody) return;

        const data = window.dataGlobalEntregaVehiculos.filter(r => {
            if (window._evEmpresaActiva !== 'TODAS' && (r.empresa || 'MARSISA').toUpperCase() !== window._evEmpresaActiva) return false;
            return true;
        });

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No se encontraron actas para ${window._evEmpresaActiva}.</td></tr>`;
            return;
        }

        let html = '';
        data.forEach(r => {
            let fechaFmt = r.fecha || '---';
            if (r.fecha && r.fecha.includes('-')) {
                const p = r.fecha.slice(0, 10).split('-');
                if (p.length === 3) fechaFmt = `${p[2]}/${p[1]}/${p[0]}`;
            }

            html += `
                <tr>
                    <td><span class="badge bg-light text-dark border font-monospace fw-bold px-2 py-1">${r.numero_inventario || r.id}</span></td>
                    <td><span class="font-monospace fw-semibold">${fechaFmt}</span></td>
                    <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace fw-bold px-2 py-1">${r.placa}</span></td>
                    <td><div class="fw-bold text-dark small">${r.quien_entrega}</div></td>
                    <td><div class="fw-bold text-dark small">${r.quien_recibe}</div></td>
                    <td><span class="font-monospace fw-bold text-dark">${parseFloat(r.kilometraje || 0).toLocaleString('es-PE')} km</span></td>
                    <td><small class="text-muted text-truncate d-block" style="max-width:200px;">${r.observaciones || 'Sin observaciones'}</small></td>
                    <td style="text-align:center;">
                        <button type="button" class="btn btn-sm btn-outline-primary rounded-2 px-2 py-1 fw-bold" onclick="window.evImprimirPDF('${r.id}')" title="Generar / Imprimir PDF">
                            <i class="bi bi-file-earmark-pdf-fill me-1"></i> PDF
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    };

    // ── GESTIÓN DE FIRMAS EN CANVAS ───────────────────────────────
    window.evInitCanvasFirmas = function() {
        _canvasEntrega = document.getElementById('ev-canvas-entrega');
        _canvasRecibe = document.getElementById('ev-canvas-recibe');

        const setupCanvas = (canvas, type) => {
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.offsetWidth || 300;
            canvas.height = canvas.offsetHeight || 110;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#0f172a';

            const start = (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
                const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
                if (type === 'entrega') _dibujandoEntrega = true; else _dibujandoRecibe = true;
                ctx.beginPath();
                ctx.moveTo(x, y);
            };
            const move = (e) => {
                const isDraw = type === 'entrega' ? _dibujandoEntrega : _dibujandoRecibe;
                if (!isDraw) return;
                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
                const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
                ctx.lineTo(x, y);
                ctx.stroke();
            };
            const stop = () => {
                if (type === 'entrega') _dibujandoEntrega = false; else _dibujandoRecibe = false;
            };

            canvas.addEventListener('mousedown', start);
            canvas.addEventListener('mousemove', move);
            canvas.addEventListener('mouseup', stop);
            canvas.addEventListener('mouseleave', stop);
            canvas.addEventListener('touchstart', start, { passive: true });
            canvas.addEventListener('touchmove', move, { passive: true });
            canvas.addEventListener('touchend', stop);
        };

        setupCanvas(_canvasEntrega, 'entrega');
        setupCanvas(_canvasRecibe, 'recibe');
    };

    window.evLimpiarFirma = function(tipo) {
        const c = tipo === 'entrega' ? _canvasEntrega : _canvasRecibe;
        if (c) {
            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, c.width, c.height);
        }
    };

    // ── GUARDAR FORMULARIO EN BASE DE DATOS ───────────────────────
    window.evGuardarFormulario = async function() {
        const getVal = id => document.getElementById(id)?.value || '';

        const placa = getVal('ev-f-placa').trim().toUpperCase();
        const entrega = getVal('ev-f-entrega').trim().toUpperCase();
        const recibe = getVal('ev-f-recibe').trim().toUpperCase();

        if (!placa || !entrega || !recibe) {
            alert('Por favor completa la Placa, Quien Entrega y Quien Recibe.');
            return;
        }

        const payload = {
            numero_inventario: getVal('ev-f-nro-inv'),
            fecha: getVal('ev-f-fecha') || new Date().toISOString().slice(0, 10),
            motivo: getVal('ev-f-motivo'),
            quien_entrega: entrega,
            quien_recibe: recibe,
            clase: getVal('ev-f-clase'),
            marca: getVal('ev-f-marca'),
            tipo: getVal('ev-f-tipo'),
            modelo: getVal('ev-f-modelo'),
            placa: placa,
            color: getVal('ev-f-color'),
            cilindros: getVal('ev-f-cilindros'),
            numero_motor: getVal('ev-f-motor'),
            numero_serie: getVal('ev-f-serie'),
            kilometraje: parseFloat(getVal('ev-f-km')) || 0,
            llantas_del_der_marca: getVal('ev-f-ll-del-der'),
            llantas_del_izq_marca: getVal('ev-f-ll-del-izq'),
            llantas_tra_der_marca: getVal('ev-f-ll-tra-der'),
            llantas_tra_izq_marca: getVal('ev-f-ll-tra-izq'),
            llantas_repuesto_marca: getVal('ev-f-ll-rep'),
            inventario_partes_json: window._evItemsStates,
            observaciones: getVal('ev-f-obs'),
            doc_entrega: getVal('ev-f-doc-entrega'),
            doc_recibe: getVal('ev-f-doc-recibe'),
            firma_entrega: _canvasEntrega ? _canvasEntrega.toDataURL() : null,
            firma_recibe: _canvasRecibe ? _canvasRecibe.toDataURL() : null,
            empresa: window._evEmpresaActiva === 'TODAS' ? 'MARSISA' : window._evEmpresaActiva
        };

        try {
            const token = localStorage.getItem('fleet_token') || sessionStorage.getItem('fleet_token');
            const res = await fetch('/api/seguridad/entrega-vehiculos', {
                method: 'POST',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const json = await res.json();
            if (json.ok) {
                alert('✅ Acta de Entrega de Vehículo guardada exitosamente.');
                window.evImprimirPDF(json.id);
                window.evIrAPortal();
            } else {
                alert('Error al guardar: ' + (json.error || 'Ocurrió un problema'));
            }
        } catch(e) {
            console.error('Error al guardar entrega:', e);
            alert('Error de conexión al servidor.');
        }
    };

    // ── GENERACIÓN E IMPRESIÓN DEL PDF OFICIAL ────────────────────
    window.evImprimirPDF = async function(id) {
        try {
            const token = localStorage.getItem('fleet_token') || sessionStorage.getItem('fleet_token');
            const res = await fetch(`/api/seguridad/entrega-vehiculos/${encodeURIComponent(id)}`, {
                headers: { 'Authorization': token ? `Bearer ${token}` : '' }
            });
            const json = await res.json();
            if (!json.ok || !json.data) {
                alert('No se pudo obtener la información del registro.');
                return;
            }

            const r = json.data;
            let partes = {};
            try { partes = typeof r.inventario_partes_json === 'string' ? JSON.parse(r.inventario_partes_json) : (r.inventario_partes_json || {}); } catch(e) {}

            // Ventana de impresión con el diseño idéntico al documento físico A4
            const printWin = window.open('', '_blank');
            printWin.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Inventario Físico Estado de Vehículo - ${r.numero_inventario || r.id}</title>
                    <style>
                        @page { size: A4; margin: 8mm; }
                        body { font-family: Arial, sans-serif; font-size: 8.5px; color: #000; margin: 0; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
                        th, td { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; }
                        th { background: #e5e5e5; font-weight: bold; text-align: center; }
                        .text-center { text-align: center; }
                        .text-end { text-align: right; }
                        .fw-bold { font-weight: bold; }
                        .header-table td { border: 2px solid #000; }
                        .col-3-table td { border: 1px solid #000; }
                    </style>
                </head>
                <body>
                    <!-- Header -->
                    <table class="header-table" style="margin-bottom: 6px;">
                        <tr>
                            <td style="width: 25%; text-align: center; padding: 5px;">
                                <strong style="font-size: 14px;">MARSISA</strong><br><small>TRANSPORTES</small>
                            </td>
                            <td style="width: 55%; text-align: center;">
                                <div style="font-size: 8px;">FORMATO</div>
                                <div style="font-size: 11px; font-weight: bold;">INVENTARIO FÍSICO ESTADO DE VEHÍCULO</div>
                            </td>
                            <td style="width: 20%; font-size: 8px; line-height: 1.3;">
                                <strong>Versión:</strong> 0<br>
                                <strong>Fecha:</strong> ${r.fecha ? r.fecha.slice(0,10) : ''}
                            </td>
                        </tr>
                    </table>

                    <!-- General Info -->
                    <table>
                        <tr>
                            <td style="width: 25%;"><strong>Número de Inventario:</strong></td>
                            <td style="width: 35%;">${r.numero_inventario || r.id}</td>
                            <td style="width: 15%;"><strong>Fecha:</strong></td>
                            <td style="width: 25%;">${r.fecha ? r.fecha.slice(0,10) : ''}</td>
                        </tr>
                        <tr>
                            <td><strong>Motivo:</strong></td>
                            <td colspan="3">${r.motivo || 'ENTREGA DE UNIDAD'}</td>
                        </tr>
                        <tr>
                            <td><strong>Nombre de quien entrega:</strong></td>
                            <td>${r.quien_entrega}</td>
                            <td><strong>Nombre de quien recibe:</strong></td>
                            <td>${r.quien_recibe}</td>
                        </tr>
                    </table>

                    <!-- Vehículo -->
                    <table>
                        <thead>
                            <tr>
                                <th>CLASE</th><th>MARCA</th><th>TIPO</th><th>MODELO</th><th>PLACAS</th><th>COLOR</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="text-center">
                                <td>${r.clase || 'TRACTO'}</td>
                                <td>${r.marca || '---'}</td>
                                <td>${r.tipo || '---'}</td>
                                <td>${r.modelo || '---'}</td>
                                <td class="fw-bold">${r.placa}</td>
                                <td>${r.color || '---'}</td>
                            </tr>
                        </tbody>
                    </table>

                    <table>
                        <thead>
                            <tr>
                                <th>CILINDROS</th><th>NÚMERO DEL MOTOR</th><th>NÚMERO DE SERIE</th><th>KILOMETRAJE</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="text-center">
                                <td>${r.cilindros || '6'}</td>
                                <td>${r.numero_motor || '---'}</td>
                                <td>${r.numero_serie || '---'}</td>
                                <td class="fw-bold">${parseFloat(r.kilometraje || 0).toLocaleString('es-PE')} km</td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Llantas -->
                    <table>
                        <thead>
                            <tr>
                                <th rowspan="2" style="width: 15%;">LLANTAS</th>
                                <th colspan="2">DELANTERAS</th>
                                <th colspan="2">TRASERAS</th>
                                <th rowspan="2" style="width: 15%;">REPUESTO</th>
                            </tr>
                            <tr>
                                <th>DERECHA</th><th>IZQUIERDA</th><th>DERECHA</th><th>IZQUIERDA</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="text-center">
                                <td class="fw-bold">MARCA</td>
                                <td>${r.llantas_del_der_marca || '---'}</td>
                                <td>${r.llantas_del_izq_marca || '---'}</td>
                                <td>${r.llantas_tra_der_marca || '---'}</td>
                                <td>${r.llantas_tra_izq_marca || '---'}</td>
                                <td>${r.llantas_repuesto_marca || '---'}</td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Partes y Accesorios Matriz 3 Columnas -->
                    <div style="display: flex; gap: 4px; margin-bottom: 4px;">
                        ${PARTES_SECCIONES.map(col => `
                            <div style="flex: 1;">
                                <table style="font-size: 7.5px;">
                                    <thead>
                                        <tr>
                                            <th>PARTES Y ACCESORIOS</th>
                                            <th style="width: 20px;">Cant</th>
                                            <th style="width: 35px;">Estado<br>B|R|M</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${col.grupos.map(grp => `
                                            <tr><td colspan="3" style="background:#e5e5e5; font-weight:bold;">${grp.titulo}</td></tr>
                                            ${grp.items.map(it => {
                                                const k = it.toLowerCase().replace(/[^a-z0-9]/g, '_');
                                                const est = partes[k] || '';
                                                return `
                                                    <tr>
                                                        <td>${it}</td>
                                                        <td class="text-center">1</td>
                                                        <td class="text-center fw-bold">${est === 'B' ? '✓' : (est === 'R' ? 'R' : (est === 'M' ? 'X' : ''))}</td>
                                                    </tr>
                                                `;
                                            }).join('')}
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `).join('')}
                    </div>

                    <!-- Observaciones -->
                    <div style="border: 1px solid #000; padding: 4px; margin-bottom: 4px;">
                        <strong>OBSERVACIONES:</strong> ${r.observaciones || 'Sin observaciones adicionales registradas al momento de la entrega.'}
                    </div>

                    <!-- Firmas -->
                    <table style="margin-top: 6px;">
                        <tr>
                            <td style="width: 50%; height: 60px; vertical-align: bottom; text-align: center;">
                                ${r.firma_entrega ? `<img src="${r.firma_entrega}" style="max-height: 45px;"><br>` : ''}
                                ____________________________________<br>
                                <strong>Entregado por:</strong> ${r.quien_entrega}<br>
                                <small>Doc: ${r.doc_entrega || '---'}</small>
                            </td>
                            <td style="width: 50%; height: 60px; vertical-align: bottom; text-align: center;">
                                ${r.firma_recibe ? `<img src="${r.firma_recibe}" style="max-height: 45px;"><br>` : ''}
                                ____________________________________<br>
                                <strong>Recibido por:</strong> ${r.quien_recibe}<br>
                                <small>Doc: ${r.doc_recibe || '---'}</small>
                            </td>
                        </tr>
                    </table>

                    <script>
                        window.onload = function() {
                            window.print();
                        };
                    </script>
                </body>
                </html>
            `);
            printWin.document.close();
        } catch(e) {
            console.error('Error generando PDF:', e);
            alert('Error al generar PDF.');
        }
    };

    // Auto inicializar si está cargado en el DOM
    if (document.getElementById('moduloEntregaVehiculos')) {
        window.inicializarModuloEntregaVehiculos();
    }
})();
