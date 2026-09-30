// =================================================================
// ⛽ MÓDULO: VALES DE COMBUSTIBLE — ERP AZKELL FLEET (OPERACIONES)
// Lógica moderna estilo Reporte de Fallas / Checklist
// =================================================================

(function() {
    window._cvData = [];
    window._cvCatalogos = { placas: [], conductores: [], proveedores: [], combustibles: [] };
    window._cvPaginaActual = 1;
    window._cvLimitePorPagina = 50;
    window._cvTotalPaginas = 1;
    window._cvTotalRegistros = 0;
    window._cvSeleccionados = new Set();
    window._cvParsedImportData = [];
    window._cvEstadoFiltro = 'TODOS';
    window._cvSortBy = 'correlativo';
    window._cvSortDir = 'DESC';
    window._cvIdAEliminar = null;
    let _cvSearchTimeout = null;

    // Helpers defensivos para evitar errores de DOM nulo
    const getEl = (id) => document.getElementById(id);
    const getVal = (id, def = '') => { const el = getEl(id); return el ? el.value : def; };
    const setVal = (id, val) => { const el = getEl(id); if (el) el.value = (val !== null && val !== undefined) ? val : ''; };
    const setText = (id, text) => { const el = getEl(id); if (el) el.textContent = (text !== null && text !== undefined) ? text : ''; };
    const esc = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Inicializador del módulo para SPA
    window.init_combustible_vales = function() {
        window.inicializarModuloCombustibleVales();
    };
    window.init_operaciones_combustible_vales = function() {
        window.inicializarModuloCombustibleVales();
    };

    window.inicializarModuloCombustibleVales = function() {
        // Inicializar fecha de hoy (Perú UTC-5)
        const getTodayPeru = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const today = getTodayPeru();
        const fd = getEl('cv-filter-fecha-desde');
        const fh = getEl('cv-filter-fecha-hasta');
        if (fd && !fd.value) fd.value = today;
        if (fh && !fh.value) fh.value = today;

        window.cvCargarCatalogos();
        window.cvCargarDatos(1);
    };

    // ── CARGAR CATÁLOGOS (PLACAS, CONDUCTORES, PROVEEDORES) ────────────
    window.cvCargarCatalogos = async function() {
        try {
            const res = await fetch('/api/combustible/catalogos?modulo=operaciones');
            const data = await res.json();
            if (data.ok) {
                window._cvCatalogos = data;
                const selP = getEl('cv-filter-placa');
                if (selP && data.placas) {
                    selP.innerHTML = '<option value="ALL">Todas las Placas</option>' +
                        data.placas.map(p => `<option value="${p}">${p}</option>`).join('');
                }
            }
        } catch (e) {
            console.warn('Error cargando catálogos de combustible:', e);
        }
    };

    // ── CARGA DE DATOS PAGINADOS & KPIS ────────────────────────────────
    window.cvCargarDatos = async function(pagina = 1) {
        window._cvPaginaActual = pagina;
        const tbody = getEl('cv-tbody');
        const cardCont = getEl('cvCardContainer');

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" class="text-center py-5 text-muted">
                        <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                        Cargando vales de combustible...
                    </td>
                </tr>
            `;
        }
        if (cardCont) {
            cardCont.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <div class="spinner-border spinner-border-sm me-2 text-primary"></div> Cargando vales...
                </div>
            `;
        }

        const params = new URLSearchParams({
            modulo: 'operaciones',
            page: window._cvPaginaActual,
            limit: window._cvLimitePorPagina,
            sort_by: window._cvSortBy || 'correlativo',
            sort_dir: window._cvSortDir || 'DESC'
        });

        const s = getVal('cv-buscador');
        const p = getVal('cv-filter-placa');
        const fd = getVal('cv-filter-fecha-desde');
        const fh = getVal('cv-filter-fecha-hasta');
        const e = window._cvEstadoFiltro;

        if (s) params.append('search', s.trim());
        if (p && p !== 'ALL') params.append('placa', p);
        if (e && e !== 'TODOS') params.append('estado', e);
        if (fd) params.append('fecha_desde', fd);
        if (fh) params.append('fecha_hasta', fh);

        try {
            const res = await fetch(`/api/combustible/vales?${params.toString()}`);
            const data = await res.json();

            if (data.ok) {
                window._cvData = data.data || [];
                window._cvTotalRegistros = data.total || 0;
                window._cvTotalPaginas = data.totalPages || 1;

                window.cvRenderKPIs(data.kpis);
                window.cvRenderTabla();
                window.cvRenderCardsMobile();
                window.cvRenderPaginacion();
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="13" class="text-center text-danger py-4">Error: ${data.error || 'No se pudieron obtener los datos'}</td></tr>`;
                if (cardCont) cardCont.innerHTML = `<div class="alert alert-danger">Error: ${data.error || 'No se pudieron obtener los datos'}</div>`;
            }
        } catch (err) {
            console.error('Error al obtener vales:', err);
            if (tbody) tbody.innerHTML = `<tr><td colspan="13" class="text-center text-danger py-4">Error de conexión con el servidor.</td></tr>`;
            if (cardCont) cardCont.innerHTML = `<div class="alert alert-danger">Error de conexión con el servidor.</div>`;
        }
    };

    // ── RENDERIZAR KPIS ────────────────────────────────────────────────
    window.cvRenderKPIs = function(kpis = {}) {
        const totalV = kpis.totalVales || 0;
        const totalG = kpis.totalGalones || 0;
        const totalI = kpis.totalGasto || 0;
        const promC  = kpis.costoPromedioGalon || (totalG > 0 ? (totalI / totalG) : 0);

        setText('kpi-cv-total', totalV.toLocaleString());
        setText('kpi-cv-galones', totalG.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Gln');
        setText('kpi-cv-gasto', 'S/ ' + totalI.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        setText('kpi-cv-promedio', 'S/ ' + promC.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    };

    // Formatear fecha bonita
    const formatFecha = (f) => {
        if (!f) return '—';
        if (typeof f === 'string') {
            const s = f.trim().replace('T', ' ').replace('.000Z', '');
            if (s.length >= 16) {
                const partes = s.slice(0, 10).split('-');
                if (partes.length === 3) {
                    const hora = s.slice(11, 16);
                    return `${partes[2]}/${partes[1]}/${partes[0]} ${hora}`;
                }
            }
        }
        const d = new Date(f);
        if (isNaN(d.getTime())) return f;
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    // ── RENDERIZAR TABLA ESCRITORIO ────────────────────────────────────
    window.cvRenderTabla = function() {
        const tbody = getEl('cv-tbody');
        const badge = getEl('cv-tabla-total-badge');
        const pagInfo = getEl('cv-paginacion-leyenda');

        if (badge) badge.textContent = `${window._cvTotalRegistros.toLocaleString()} Vales`;
        if (pagInfo) pagInfo.textContent = `Página ${window._cvPaginaActual} de ${window._cvTotalPaginas}`;

        if (!tbody) return;

        if (window._cvData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" class="text-center py-5 text-muted">
                        <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                        No se encontraron vales de combustible con los filtros actuales.
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        window._cvData.forEach(row => {
            const isSelected = window._cvSeleccionados.has(row.id);
            const estadoBadge = row.estado === 'VÁLIDO'
                ? '<span class="badge" style="background:#059669; color:#fff; font-size:0.72rem; font-weight:700; border-radius:6px; padding: 4px 8px;">VÁLIDO</span>'
                : '<span class="badge" style="background:#dc2626; color:#fff; font-size:0.72rem; font-weight:700; border-radius:6px; padding: 4px 8px;">ANULADO</span>';

            const pagoBadge = (row.estado_pago || '').toUpperCase() === 'PAGADO'
                ? '<span class="badge bg-success-subtle text-success border border-success-subtle fw-bold px-2 py-1" style="font-size:0.7rem;">PAGADO</span>'
                : '<span class="badge bg-danger-subtle text-danger border border-danger-subtle fw-bold px-2 py-1" style="font-size:0.7rem;">NO PAGADO</span>';

            const gal = parseFloat(row.galones || 0);
            const costoGl = parseFloat(row.costo_gl || 0);
            const importe = parseFloat(row.importe || 0);

            html += `
                <tr class="${isSelected ? 'cv-row-selected' : ''}" id="cv-tr-${row.id}">
                    <td class="text-center">
                        <input type="checkbox" class="form-check-input" ${isSelected ? 'checked' : ''} onchange="window.cvToggleSelectRow(${row.id}, this)">
                    </td>
                    <td class="ps-3">
                        <span class="font-monospace fw-bold text-dark" style="font-size:0.85rem;">
                            ${esc(row.correlativo || ('#' + row.id))}
                        </span>
                    </td>
                    <td>
                        <span class="text-secondary small fw-medium">${formatFecha(row.fecha)}</span>
                    </td>
                    <td class="text-center">${estadoBadge}</td>
                    <td class="text-center">${pagoBadge}</td>
                    <td>
                        <span class="badge bg-dark font-monospace px-2.5 py-1" style="font-size:0.78rem; letter-spacing:0.5px;">
                            ${esc(row.vehiculo || '—')}
                        </span>
                    </td>
                    <td>
                        <div class="fw-bold text-dark text-truncate" style="max-width: 170px;" title="${esc(row.conductor)}">${esc(row.conductor || '—')}</div>
                        <small class="text-muted text-truncate d-block" style="max-width: 170px;" title="${esc(row.ruta)}">${esc(row.ruta || '—')}</small>
                    </td>
                    <td>
                        <div class="fw-semibold text-dark text-truncate" style="max-width: 150px;" title="${esc(row.estacion)}">${esc(row.estacion || '—')}</div>
                        <small class="text-muted">${esc(row.tipo_combustible || 'D2')}</small>
                    </td>
                    <td class="text-end font-monospace fw-bold text-primary">${gal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace text-secondary">S/ ${costoGl.toFixed(2)}</td>
                    <td class="text-end font-monospace fw-bold text-success" style="font-size:0.88rem;">S/ ${importe.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>
                        <span class="font-monospace small text-secondary">${esc(row.numero_comprobante || '—')}</span>
                    </td>
                    <td class="pe-3 text-end">
                        <div class="d-inline-flex align-items-center gap-1">
                            <button type="button" class="cv-action-btn cv-btn-view" onclick="window.cvVerDetalle(${row.id})" title="Ver Voucher">
                                <i class="bi bi-eye"></i>
                            </button>
                            <button type="button" class="cv-action-btn cv-btn-edit" onclick="window.cvAbrirEditar(${row.id})" title="Editar Vale">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button type="button" class="cv-action-btn cv-btn-delete" onclick="window.cvSolicitarEliminar(${row.id})" title="Eliminar Vale">
                                <i class="bi bi-trash3"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        window.cvActualizarBotonEliminarMasivo();
    };

    // ── RENDERIZAR CARDS MÓVIL ─────────────────────────────────────────
    window.cvRenderCardsMobile = function() {
        const container = getEl('cvCardContainer');
        if (!container) return;

        if (window._cvData.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                    No se encontraron vales de combustible.
                </div>
            `;
            return;
        }

        let html = '';
        window._cvData.forEach(row => {
            const gal = parseFloat(row.galones || 0);
            const importe = parseFloat(row.importe || 0);
            const estadoBadge = row.estado === 'VÁLIDO'
                ? '<span class="badge bg-success" style="font-size:0.68rem;">VÁLIDO</span>'
                : '<span class="badge bg-danger" style="font-size:0.68rem;">ANULADO</span>';

            html += `
                <div class="cv-mobile-card">
                    <div class="d-flex align-items-center justify-content-between mb-2">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-dark font-monospace px-2 py-1" style="font-size:0.8rem;">${esc(row.vehiculo || '—')}</span>
                            <span class="font-monospace fw-bold text-secondary" style="font-size:0.8rem;">${esc(row.correlativo || ('#' + row.id))}</span>
                        </div>
                        ${estadoBadge}
                    </div>

                    <div class="mb-2">
                        <div class="fw-bold text-dark" style="font-size:0.9rem;">${esc(row.conductor || 'Sin conductor')}</div>
                        <small class="text-muted d-block">${esc(row.ruta || 'Sin ruta')}</small>
                        <small class="text-secondary d-block"><i class="bi bi-geo-alt text-warning"></i> ${esc(row.estacion || 'Estación N/D')}</small>
                    </div>

                    <div class="p-2 rounded-3 bg-light border d-flex align-items-center justify-content-between mb-2" style="font-size:0.82rem;">
                        <div>
                            <span class="text-muted d-block" style="font-size:0.7rem;">GALONES</span>
                            <strong class="text-primary font-monospace">${gal.toFixed(2)} Gln</strong>
                        </div>
                        <div>
                            <span class="text-muted d-block" style="font-size:0.7rem;">COMBUSTIBLE</span>
                            <strong class="text-dark">${esc(row.tipo_combustible || 'D2')}</strong>
                        </div>
                        <div class="text-end">
                            <span class="text-muted d-block" style="font-size:0.7rem;">TOTAL</span>
                            <strong class="text-success font-monospace fs-6">S/ ${importe.toFixed(2)}</strong>
                        </div>
                    </div>

                    <div class="d-flex align-items-center justify-content-between pt-1">
                        <small class="text-muted" style="font-size:0.72rem;">${formatFecha(row.fecha)}</small>
                        <div class="d-flex align-items-center gap-1.5">
                            <button class="btn btn-sm btn-light border px-2.5 py-1 text-primary fw-semibold" onclick="window.cvVerDetalle(${row.id})">
                                <i class="bi bi-eye me-1"></i> Ver
                            </button>
                            <button class="btn btn-sm btn-light border px-2.5 py-1 text-dark fw-semibold" onclick="window.cvAbrirEditar(${row.id})">
                                <i class="bi bi-pencil me-1"></i> Editar
                            </button>
                            <button class="btn btn-sm btn-light border px-2 py-1 text-danger" onclick="window.cvSolicitarEliminar(${row.id})">
                                <i class="bi bi-trash3"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    };

    // ── RENDERIZAR PAGINACIÓN ──────────────────────────────────────────
    window.cvRenderPaginacion = function() {
        const container = getEl('cv-paginacion-botones');
        const leyenda = getEl('cv-paginacion-leyenda');

        const inicio = (window._cvPaginaActual - 1) * window._cvLimitePorPagina + 1;
        const fin = Math.min(window._cvTotalRegistros, window._cvPaginaActual * window._cvLimitePorPagina);

        if (leyenda) {
            leyenda.textContent = window._cvTotalRegistros > 0 
                ? `Mostrando ${inicio.toLocaleString()} a ${fin.toLocaleString()} de ${window._cvTotalRegistros.toLocaleString()} vales`
                : `Mostrando 0 vales`;
        }

        if (!container) return;
        if (window._cvTotalPaginas <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = `
            <button class="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-1" ${window._cvPaginaActual <= 1 ? 'disabled' : ''} onclick="window.cvCargarDatos(${window._cvPaginaActual - 1})">
                <i class="bi bi-chevron-left"></i>
            </button>
        `;

        const maxButtons = 5;
        let startPage = Math.max(1, window._cvPaginaActual - 2);
        let endPage = Math.min(window._cvTotalPaginas, startPage + maxButtons - 1);
        if (endPage - startPage < maxButtons - 1) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        for (let p = startPage; p <= endPage; p++) {
            const isAct = (p === window._cvPaginaActual);
            html += `
                <button class="btn btn-sm ${isAct ? 'btn-primary text-white fw-bold' : 'btn-outline-secondary'} rounded-pill px-2.5 py-1 font-monospace" onclick="window.cvCargarDatos(${p})">
                    ${p}
                </button>
            `;
        }

        html += `
            <button class="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-1" ${window._cvPaginaActual >= window._cvTotalPaginas ? 'disabled' : ''} onclick="window.cvCargarDatos(${window._cvPaginaActual + 1})">
                <i class="bi bi-chevron-right"></i>
            </button>
        `;

        container.innerHTML = html;
    };

    // ── FILTROS Y BÚSQUEDA ─────────────────────────────────────────────
    window.cvFiltrarDebounced = function() {
        clearTimeout(_cvSearchTimeout);
        _cvSearchTimeout = setTimeout(() => {
            window.cvCargarDatos(1);
        }, 300);
    };

    window.cvFiltrarEstado = function(estado, btn) {
        window._cvEstadoFiltro = estado;
        document.querySelectorAll('#btn-group-estados-vales .cv-segment-item').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        window.cvCargarDatos(1);
    };

    // ── SELECCIÓN MÚLTIPLE ─────────────────────────────────────────────
    window.cvToggleSelectAll = function(chk) {
        const checked = chk.checked;
        window._cvData.forEach(row => {
            if (checked) window._cvSeleccionados.add(row.id);
            else window._cvSeleccionados.delete(row.id);
        });
        window.cvRenderTabla();
    };

    window.cvToggleSelectRow = function(id, chk) {
        if (chk.checked) window._cvSeleccionados.add(id);
        else window._cvSeleccionados.delete(id);
        
        const tr = getEl(`cv-tr-${id}`);
        if (tr) tr.className = chk.checked ? 'cv-row-selected' : '';
        window.cvActualizarBotonEliminarMasivo();
    };

    window.cvActualizarBotonEliminarMasivo = function() {
        const btn = getEl('cv-btn-eliminar-masivo');
        const countSpan = getEl('cv-count-seleccionados');
        const count = window._cvSeleccionados.size;

        if (countSpan) countSpan.textContent = count;
        if (btn) {
            if (count > 0) {
                btn.classList.remove('d-none');
                btn.classList.add('d-inline-flex');
            } else {
                btn.classList.add('d-none');
                btn.classList.remove('d-inline-flex');
            }
        }
    };

    // ── FORMULARIO DRAWER (NUEVO / EDITAR) ─────────────────────────────
    window.cvAbrirNuevo = function(viajeAsignado = '', origen = 'modulo_propio') {
        const form = getEl('cv-form-vale');
        if (form) form.reset();

        setVal('cv-f-id', '');
        setText('lbl-cv-modal-titulo', 'Nuevo Vale de Combustible');

        // Asignar fecha y hora local actual
        const now = new Date();
        const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        setVal('cv-f-fecha', localIso);
        setVal('cv-f-clase', 'TRACTO');
        setVal('cv-f-tipo', 'RECARGA VUELTA');
        setVal('cv-f-estado', 'VÁLIDO');
        setVal('cv-f-tipo-pago', 'ANTICIPO');
        setVal('cv-f-estado-pago', 'NO PAGADO');
        setVal('cv-f-moneda', 'SOLES');
        setVal('cv-f-kilometraje', '0');
        setVal('cv-f-peso', '0');
        setVal('cv-f-galones', '');
        setVal('cv-f-costo-gl', '');
        setVal('cv-f-importe', '');

        // Obtener siguiente correlativo
        const siguienteCorr = window._cvCatalogos?.siguienteCorrelativo || `${now.getFullYear()}-00000001`;
        setVal('cv-f-correlativo', siguienteCorr);
        setText('lbl-cv-correlativo-header', `(N° ${siguienteCorr})`);

        if (viajeAsignado && String(viajeAsignado).trim()) {
            window.cvSeleccionarViaje(String(viajeAsignado).trim(), '', '', '');
            const col = getEl('cv_collapse_viaje_asociado');
            if (col) col.style.display = 'block';
        } else {
            window.cvLimpiarViajeVinculado(true);
        }

        const modalEl = getEl('cvModalForm');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    window.cvAbrirModalNuevo = window.cvAbrirNuevo;
    window.cvAbrirModalEditar = function(id) { window.cvAbrirEditar(id); };
    window.cvEliminarVale = function(id) { window.cvSolicitarEliminar(id); };
    window.cvAplicarFiltros = function() { window.cvCargarDatos(1); };
    window.cvLimpiarFiltros = function() {
        const getTodayPeru = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const today = getTodayPeru();
        setVal('cv-buscador', '');
        setVal('cv-filter-placa', 'ALL');
        setVal('cv-filter-fecha-desde', today);
        setVal('cv-filter-fecha-hasta', today);
        window._cvEstadoFiltro = 'TODOS';
        document.querySelectorAll('#btn-group-estados-vales .cv-segment-item').forEach(b => b.classList.remove('active'));
        const primerB = document.querySelector('#btn-group-estados-vales .cv-segment-item');
        if (primerB) primerB.classList.add('active');
        window.cvCargarDatos(1);
    };

    window.cvAbrirEditar = async function(id) {
        let item = (window._cvData || []).find(r => r.id === id || String(r.id) === String(id));
        if (!item) {
            try {
                const r = await fetch(`/api/combustible/vales/${id}`);
                const j = await r.json();
                if (j && j.ok && j.data) item = j.data;
            } catch (e) {
                console.warn('No se pudo cargar el vale individual:', e);
            }
        }
        if (!item) return;

        setVal('cv-f-id', item.id);
        setText('lbl-cv-modal-titulo', `Editar Vale #${item.id}`);
        setText('lbl-cv-correlativo-header', item.correlativo ? `(${item.correlativo})` : '');

        if (item.fecha) {
            const dt = new Date(item.fecha);
            const localIso = new Date(dt.getTime() - (dt.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setVal('cv-f-fecha', localIso);
        }
        setVal('cv-f-correlativo', item.correlativo || '');
        setVal('cv-f-estado', item.estado || 'VÁLIDO');
        setVal('cv-f-vehiculo', item.vehiculo || '');
        setVal('cv-f-vehiculo-txt', item.vehiculo || '');
        setVal('cv-f-clase', item.clase_vehiculo || 'TRACTO');
        setVal('cv-f-tipo', item.tipo || 'RECARGA VUELTA');
        setVal('cv-f-conductor', item.conductor || '');
        setVal('cv-f-conductor-txt', item.conductor || '');
        setVal('cv-f-ruta', item.ruta || '');
        setVal('cv-f-estacion', item.estacion || '');
        setVal('cv-f-proveedor', item.proveedor || '');
        setVal('cv-f-combustible', item.tipo_combustible || 'D2');
        setVal('cv-f-departamento', item.departamento || '');
        setVal('cv-f-provincia', item.provincia || '');
        setVal('cv-f-distrito', item.distrito || '');
        setVal('cv-f-kilometraje', item.kilometraje || 0);
        setVal('cv-f-peso', item.peso_tn || 0);
        setVal('cv-f-galones', item.galones || '');
        setVal('cv-f-costo-gl', item.costo_gl || '');
        setVal('cv-f-importe', item.importe || '');
        setVal('cv-f-comprobante', item.numero_comprobante || '');
        setVal('cv-f-tipo-pago', item.tipo_pago || 'ANTICIPO');
        setVal('cv-f-estado-pago', item.estado_pago || 'NO PAGADO');
        setVal('cv-f-dias-credito', item.dias_credito || 0);
        setVal('cv-f-moneda', item.moneda || 'SOLES');
        setVal('cv-f-obs', item.observacion || '');

        // Viaje vinculado
        if (item.viaje) {
            setVal('cv-f-viaje', item.viaje);
            setVal('cv_orden_viaje-txt', item.viaje);
            const infoBox = getEl('cv_viaje_seleccionado_info');
            const lblNum = getEl('cv_lbl_viaje_num');
            const lblDet = getEl('cv_lbl_viaje_detalles');
            if (infoBox) infoBox.classList.remove('d-none');
            if (lblNum) lblNum.textContent = item.viaje;
            if (lblDet) lblDet.textContent = `Vehículo: ${item.vehiculo || '—'} | Conductor: ${item.conductor || '—'}`;
        } else {
            window.cvLimpiarViajeVinculado(false);
        }

        const modalEl = getEl('cvModalForm');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    // Recalcular Importe Total
    window.cvRecalcularImporte = function() {
        const gal = parseFloat(getVal('cv-f-galones') || 0);
        const cgl = parseFloat(getVal('cv-f-costo-gl') || 0);
        if (gal > 0 && cgl > 0) {
            setVal('cv-f-importe', (gal * cgl).toFixed(2));
        }
    };

    // ── GUARDAR FORMULARIO ─────────────────────────────────────────────
    window.cvGuardarFormulario = async function(e) {
        if (e && e.preventDefault) e.preventDefault();

        const id = getVal('cv-f-id');
        const isEdit = !!id;

        const vehiculo = (getVal('cv-f-vehiculo') || getVal('cv-f-vehiculo-txt')).toUpperCase().trim();
        if (!vehiculo) {
            alert('⚠️ La placa del vehículo es obligatoria.');
            return;
        }

        const payload = {
            fecha: getVal('cv-f-fecha'),
            correlativo: getVal('cv-f-correlativo'),
            estado: getVal('cv-f-estado'),
            vehiculo,
            viaje: getVal('cv-f-viaje'),
            clase_vehiculo: getVal('cv-f-clase'),
            tipo: getVal('cv-f-tipo'),
            conductor: getVal('cv-f-conductor') || getVal('cv-f-conductor-txt'),
            ruta: getVal('cv-f-ruta'),
            estacion: getVal('cv-f-estacion'),
            proveedor: getVal('cv-f-proveedor'),
            tipo_combustible: getVal('cv-f-combustible'),
            departamento: getVal('cv-f-departamento'),
            provincia: getVal('cv-f-provincia'),
            distrito: getVal('cv-f-distrito'),
            kilometraje: parseFloat(getVal('cv-f-kilometraje') || 0),
            peso_tn: parseFloat(getVal('cv-f-peso') || 0),
            galones: parseFloat(getVal('cv-f-galones') || 0),
            costo_gl: parseFloat(getVal('cv-f-costo-gl') || 0),
            importe: parseFloat(getVal('cv-f-importe') || 0),
            numero_comprobante: getVal('cv-f-comprobante'),
            tipo_pago: getVal('cv-f-tipo-pago'),
            estado_pago: getVal('cv-f-estado-pago'),
            dias_credito: parseInt(getVal('cv-f-dias-credito') || 0, 10),
            moneda: getVal('cv-f-moneda'),
            observacion: getVal('cv-f-obs'),
            modulo: 'operaciones'
        };

        try {
            const url = isEdit ? `/api/combustible/vales/${id}?modulo=operaciones` : '/api/combustible/vales';
            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.ok) {
                const modalEl = getEl('cvModalForm');
                if (modalEl) {
                    const inst = bootstrap.Modal.getInstance(modalEl);
                    if (inst) inst.hide();
                }
                window.cvCargarCatalogos();
                window.cvCargarDatos(window._cvPaginaActual);
            } else {
                alert(`Error: ${data.error || 'No se pudo guardar el vale'}`);
            }
        } catch (err) {
            alert('Error al conectar con el servidor al guardar el vale.');
        }
    };

    // ── VINCULACIÓN CON ORDEN DE VIAJE (COLLAPSE & DROPDOWN) ───────────
    window.cvToggleCollapseViaje = function() {
        const col = getEl('cv_collapse_viaje_asociado');
        const icon = getEl('cv-icon-btn-vincular-viaje');
        if (!col) return;

        if (col.style.display === 'none' || !col.style.display) {
            col.style.display = 'block';
            if (icon) icon.className = 'bi bi-chevron-up';
        } else {
            col.style.display = 'none';
            if (icon) icon.className = 'bi bi-chevron-down';
        }
    };

    window.cvFiltrarViajeDropdown = async function() {
        const input = getEl('cv_orden_viaje-txt');
        const dd = getEl('cv_orden_viaje-dd');
        const btnClear = getEl('cv_btn_clear_viaje');
        if (!input || !dd) return;

        const q = (input.value || '').trim();
        if (btnClear) {
            if (q) btnClear.classList.remove('d-none');
            else btnClear.classList.add('d-none');
        }

        try {
            const res = await fetch(`/api/checklist/buscar-viajes?limit=5&q=${encodeURIComponent(q)}`);
            const data = await res.json();
            const viajes = (data && data.data) || [];

            if (viajes.length === 0) {
                dd.innerHTML = `<div class="p-2 text-muted small">No se encontraron órdenes de viaje</div>`;
                dd.classList.remove('d-none');
                return;
            }

            dd.innerHTML = viajes.map(v => `
                <div class="cv-dd-item" onmousedown="window.cvSeleccionarViaje('${esc(v.viaje)}', '${esc(v.placa_tracto || '')}', '${esc(v.conductor || '')}', '${esc(v.ruta || '')}')">
                    <div class="d-flex justify-content-between">
                        <strong class="text-primary font-monospace">${esc(v.viaje)}</strong>
                        <span class="badge bg-light text-dark border">${esc(v.placa_tracto || 'Sin Placa')}</span>
                    </div>
                    <small class="text-secondary d-block text-truncate">${esc(v.conductor || 'Sin conductor')} | ${esc(v.ruta || '')}</small>
                </div>
            `).join('');
            dd.classList.remove('d-none');
        } catch (e) {
            dd.classList.add('d-none');
        }
    };

    window.cvHideViajeDropdown = function() {
        setTimeout(() => {
            const dd = getEl('cv_orden_viaje-dd');
            if (dd) dd.classList.add('d-none');
        }, 200);
    };

    window.cvSeleccionarViaje = function(numViaje, placa, conductor, ruta) {
        setVal('cv-f-viaje', numViaje);
        setVal('cv_orden_viaje-txt', numViaje);

        if (placa) {
            setVal('cv-f-vehiculo', placa);
            setVal('cv-f-vehiculo-txt', placa);
        }
        if (conductor) {
            setVal('cv-f-conductor', conductor);
            setVal('cv-f-conductor-txt', conductor);
        }
        if (ruta) {
            setVal('cv-f-ruta', ruta);
        }

        const infoBox = getEl('cv_viaje_seleccionado_info');
        const lblNum = getEl('cv_lbl_viaje_num');
        const lblDet = getEl('cv_lbl_viaje_detalles');
        if (infoBox) infoBox.classList.remove('d-none');
        if (lblNum) lblNum.textContent = numViaje;
        if (lblDet) lblDet.textContent = `Tracto: ${placa || '—'} | Conductor: ${conductor || '—'} | Ruta: ${ruta || '—'}`;

        window.cvHideViajeDropdown();
    };

    window.cvLimpiarViajeVinculado = function(limpiarCampos = false) {
        setVal('cv-f-viaje', '');
        setVal('cv_orden_viaje-txt', '');
        const btnClear = getEl('cv_btn_clear_viaje');
        if (btnClear) btnClear.classList.add('d-none');
        const infoBox = getEl('cv_viaje_seleccionado_info');
        if (infoBox) infoBox.classList.add('d-none');

        if (limpiarCampos) {
            setVal('cv-f-vehiculo', '');
            setVal('cv-f-vehiculo-txt', '');
            setVal('cv-f-conductor', '');
            setVal('cv-f-conductor-txt', '');
            setVal('cv-f-ruta', '');
        }
    };

    // ── DROPDOWNS PARA PLACAS Y CONDUCTORES ────────────────────────────
    window.cvFiltrarPlacaDropdown = function() {
        const txt = getVal('cv-f-vehiculo-txt').toUpperCase().trim();
        const dd = getEl('cv-f-vehiculo-dd');
        if (!dd) return;

        const placas = (window._cvCatalogos?.placas || []).filter(p => p.includes(txt));
        if (placas.length === 0) {
            dd.classList.add('d-none');
            return;
        }

        dd.innerHTML = placas.slice(0, 10).map(p => `
            <div class="cv-dd-item" onmousedown="window.cvSeleccionarPlaca('${p}')">
                <strong class="font-monospace">${p}</strong>
            </div>
        `).join('');
        dd.classList.remove('d-none');
    };

    window.cvHidePlacaDropdown = function() {
        setTimeout(() => {
            const dd = getEl('cv-f-vehiculo-dd');
            if (dd) dd.classList.add('d-none');
            const txt = getVal('cv-f-vehiculo-txt').toUpperCase().trim();
            setVal('cv-f-vehiculo', txt);
        }, 200);
    };

    window.cvSeleccionarPlaca = function(placa) {
        setVal('cv-f-vehiculo', placa);
        setVal('cv-f-vehiculo-txt', placa);
        window.cvHidePlacaDropdown();
    };

    window.cvFiltrarConductorDropdown = function() {
        const txt = getVal('cv-f-conductor-txt').toUpperCase().trim();
        const dd = getEl('cv-f-conductor-dd');
        if (!dd) return;

        const conductores = (window._cvCatalogos?.conductores || []).filter(c => c.toUpperCase().includes(txt));
        if (conductores.length === 0) {
            dd.classList.add('d-none');
            return;
        }

        dd.innerHTML = conductores.slice(0, 10).map(c => `
            <div class="cv-dd-item" onmousedown="window.cvSeleccionarConductor('${esc(c)}')">
                <span>${esc(c)}</span>
            </div>
        `).join('');
        dd.classList.remove('d-none');
    };

    window.cvHideConductorDropdown = function() {
        setTimeout(() => {
            const dd = getEl('cv-f-conductor-dd');
            if (dd) dd.classList.add('d-none');
            const txt = getVal('cv-f-conductor-txt').trim();
            setVal('cv-f-conductor', txt);
        }, 200);
    };

    window.cvSeleccionarConductor = function(c) {
        setVal('cv-f-conductor', c);
        setVal('cv-f-conductor-txt', c);
        window.cvHideConductorDropdown();
    };

    // ── VER DETALLE (VOUCHER IMPRIMIBLE) ───────────────────────────────
    window.cvVerDetalle = async function(id) {
        let item = (window._cvData || []).find(r => r.id === id || String(r.id) === String(id));
        if (!item) {
            try {
                const r = await fetch(`/api/combustible/vales/${id}`);
                const j = await r.json();
                if (j && j.ok && j.data) item = j.data;
            } catch (e) {}
        }
        if (!item) return;

        setText('cv-det-folio-lbl', `VALE DE COMBUSTIBLE ${item.correlativo || ('#' + item.id)}`);
        setText('cv-det-fecha-lbl', formatFecha(item.fecha));
        setText('cv-det-placa', item.vehiculo || '—');
        setText('cv-det-viaje', item.viaje || 'SIN VIAJE');
        setText('cv-det-conductor', item.conductor || '—');
        setText('cv-det-ruta', item.ruta || '—');
        setText('cv-det-estacion', item.estacion || item.proveedor || '—');
        setText('cv-det-combustible', item.tipo_combustible || 'D2');
        setText('cv-det-km', `${parseFloat(item.kilometraje || 0).toLocaleString()} Km`);
        setText('cv-det-galones', `${parseFloat(item.galones || 0).toFixed(2)} Gln`);
        setText('cv-det-costo-gl', `S/ ${parseFloat(item.costo_gl || 0).toFixed(2)}`);
        setText('cv-det-importe', `S/ ${parseFloat(item.importe || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        setText('cv-det-comprobante', item.numero_comprobante || '—');

        const badgePago = getEl('cv-det-estado-pago');
        if (badgePago) {
            const esPagado = (item.estado_pago || '').toUpperCase() === 'PAGADO';
            badgePago.className = esPagado ? 'badge bg-success' : 'badge bg-danger';
            badgePago.textContent = esPagado ? 'PAGADO' : 'NO PAGADO';
        }

        const obsBox = getEl('cv-det-obs-box');
        if (obsBox) {
            if (item.observacion) {
                obsBox.style.display = 'block';
                setText('cv-det-obs', item.observacion);
            } else {
                obsBox.style.display = 'none';
            }
        }

        const modalEl = getEl('cvModalDetalle');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    window.cvImprimirDetalle = function() {
        window.print();
    };

    // ── ELIMINACIÓN INDIVIDUAL (APPLE CIRCULAR DIALOG) ─────────────────
    window.cvSolicitarEliminar = function(id) {
        window._cvIdAEliminar = id;
        setText('lbl-cv-delete-subtext', `¿Estás seguro de que deseas anular/eliminar el vale #${id}? Esta acción actualizará los registros.`);
        const modalEl = getEl('modalEliminarValeConfirm');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    window.cvEjecutarEliminacion = async function() {
        const id = window._cvIdAEliminar;
        if (!id) return;

        try {
            const res = await fetch(`/api/combustible/vales/${id}?hard=true&modulo=operaciones`, { method: 'DELETE' });
            const data = await res.json();
            if (data.ok) {
                const modalEl = getEl('modalEliminarValeConfirm');
                if (modalEl) {
                    const inst = bootstrap.Modal.getInstance(modalEl);
                    if (inst) inst.hide();
                }
                window._cvSeleccionados.delete(id);
                window.cvCargarDatos(window._cvPaginaActual);
            } else {
                alert(`Error: ${data.error || 'No se pudo eliminar el vale'}`);
            }
        } catch (e) {
            alert('Error al conectar con el servidor.');
        }
    };

    // ── ELIMINACIÓN MASIVA ─────────────────────────────────────────────
    window.cvEliminarSeleccionados = async function() {
        const count = window._cvSeleccionados.size;
        if (count === 0) return;

        if (!confirm(`¿Estás seguro de eliminar los ${count} vales seleccionados?`)) return;

        try {
            const res = await fetch('/api/combustible/vales/eliminar-masivo?hard=true&modulo=operaciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(window._cvSeleccionados), modulo: 'operaciones' })
            });
            const data = await res.json();
            if (data.ok) {
                window._cvSeleccionados.clear();
                window.cvCargarDatos(window._cvPaginaActual);
            } else {
                alert(`Error: ${data.error || 'No se pudieron eliminar los vales'}`);
            }
        } catch (e) {
            alert('Error de conexión al eliminar vales.');
        }
    };

    // ── IMPORTACIÓN EXCEL ──────────────────────────────────────────────
    window.cvAbrirModalImportar = function() {
        window._cvParsedImportData = [];
        const box = getEl('cv-import-preview-box');
        if (box) box.classList.add('d-none');
        const btn = getEl('cv-btn-confirmar-import');
        if (btn) btn.disabled = true;
        const input = getEl('cv-file-input');
        if (input) input.value = '';

        const modalEl = getEl('cvModalImportar');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    window.cvProcesarArchivoExcel = function(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (typeof XLSX === 'undefined') {
            alert('La librería SheetJS (XLSX) no está cargada.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                if (rows.length === 0) {
                    alert('El archivo no contiene filas de datos.');
                    return;
                }

                window._cvParsedImportData = rows;
                setText('cv-import-filename', file.name);
                setText('cv-import-count-badge', `${rows.length.toLocaleString()} vales detectados`);

                const tbody = getEl('cv-import-preview-tbody');
                if (tbody) {
                    tbody.innerHTML = rows.slice(0, 5).map(r => `
                        <tr>
                            <td>${esc(r.FECHA || r.fecha || '—')}</td>
                            <td><strong>${esc(r.VEHICULO || r.vehiculo || r.PLACA || r.placa || '—')}</strong></td>
                            <td>${esc(r.CONDUCTOR || r.conductor || '—')}</td>
                            <td>${esc(r.RUTA || r.ruta || '—')}</td>
                            <td>${esc(r.ESTACIÓN || r.ESTACION || r.estacion || r.PROVEEDOR || '—')}</td>
                            <td class="text-end text-primary fw-bold">${esc(r.GALONES || r.galones || '0')}</td>
                            <td class="text-end text-success fw-bold">${esc(r.IMPORTE || r.importe || '0')}</td>
                        </tr>
                    `).join('');
                }

                const box = getEl('cv-import-preview-box');
                if (box) box.classList.remove('d-none');
                const btn = getEl('cv-btn-confirmar-import');
                if (btn) btn.disabled = false;
            } catch (err) {
                alert('Error al leer el archivo Excel: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    window.cvConfirmarImportacion = async function() {
        if (!window._cvParsedImportData || window._cvParsedImportData.length === 0) return;

        const btn = getEl('cv-btn-confirmar-import');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Importando...`;
        }

        try {
            const res = await fetch('/api/combustible/vales/importar-masivo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vales: window._cvParsedImportData, modulo: 'operaciones' })
            });
            const data = await res.json();

            if (data.ok) {
                alert(`✅ ${data.mensaje || 'Importación completada'}`);
                const modalEl = getEl('cvModalImportar');
                if (modalEl) {
                    const inst = bootstrap.Modal.getInstance(modalEl);
                    if (inst) inst.hide();
                }
                window.cvCargarCatalogos();
                window.cvCargarDatos(1);
            } else {
                alert(`Error al importar: ${data.error || 'Falló la inserción'}`);
            }
        } catch (e) {
            alert('Error de conexión al importar los vales.');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="bi bi-check-lg"></i> Importar Vales al ERP`;
            }
        }
    };

    // ── EXPORTACIÓN EXCEL ──────────────────────────────────────────────
    window.cvExportarExcel = async function() {
        if (typeof XLSX === 'undefined') {
            alert('Librería SheetJS no disponible.');
            return;
        }

        const params = new URLSearchParams({ limit: 5000, modulo: 'operaciones' });
        const s = getVal('cv-buscador');
        const p = getVal('cv-filter-placa');
        const fd = getVal('cv-filter-fecha-desde');
        const fh = getVal('cv-filter-fecha-hasta');
        const e = window._cvEstadoFiltro;

        if (s) params.append('search', s.trim());
        if (p && p !== 'ALL') params.append('placa', p);
        if (e && e !== 'TODOS') params.append('estado', e);
        if (fd) params.append('fecha_desde', fd);
        if (fh) params.append('fecha_hasta', fh);

        try {
            const res = await fetch(`/api/combustible/vales?${params.toString()}`);
            const data = await res.json();
            const rows = data.ok ? data.data : window._cvData;

            if (!rows || rows.length === 0) {
                alert('No hay vales para exportar.');
                return;
            }

            const exportData = rows.map(r => ({
                "CORRELATIVO": r.correlativo || ('#' + r.id),
                "FECHA": r.fecha,
                "ESTADO": r.estado,
                "ESTADO PAGO": r.estado_pago,
                "VEHÍCULO": r.vehiculo,
                "VIAJE": r.viaje,
                "CONDUCTOR": r.conductor,
                "RUTA": r.ruta,
                "ESTACIÓN": r.estacion,
                "TIPO COMBUSTIBLE": r.tipo_combustible,
                "PROVEEDOR": r.proveedor,
                "KILOMETRAJE": r.kilometraje,
                "PESO (Tn)": r.peso_tn,
                "GALONES": r.galones,
                "COSTO/GL": r.costo_gl,
                "IMPORTE": r.importe,
                "NÚMERO COMPROBANTE": r.numero_comprobante,
                "TIPO PAGO": r.tipo_pago,
                "MONEDA": r.moneda,
                "OBSERVACIÓN": r.observacion
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Vales_Combustible");
            XLSX.writeFile(wb, `Vales_Combustible_${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (e) {
            alert('Error exportando vales a Excel.');
        }
    };

    // Auto-ejecución al cargar el script
    window.inicializarModuloCombustibleVales();
})();
