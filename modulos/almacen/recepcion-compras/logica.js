// =========================================================================
// MÓDULO ALMACÉN: RECEPCIÓN DE COMPRAS (Lógica SPA - ERP Azkell)
// Diseño y Funcionamiento 1:1 Reporte de Fallas
// =========================================================================

(function() {
    'use strict';

    window._recCompras = window._recCompras || {
        filtroEstado: 'TODOS', // 'TODOS' | 'PENDIENTE' | 'PARCIAL' | 'COMPLETO'
        ordenes: [],
        ordenSeleccionada: null,
        almacenesDisponibles: ['ALM CENTRAL', 'ALMACÉN PRINCIPAL', 'TALLER']
    };

    function _escHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Formato de Fecha y Hora local para el input
    function obtenerFechaHoraActualLocal() {
        const ahora = new Date();
        const yyyy = ahora.getFullYear();
        const mm = String(ahora.getMonth() + 1).padStart(2, '0');
        const dd = String(ahora.getDate()).padStart(2, '0');
        const hh = String(ahora.getHours()).padStart(2, '0');
        const min = String(ahora.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
    }

    function _fmtFechaCorta(f) {
        if (!f) return '—';
        try {
            const raw = String(f).replace('T', ' ').slice(0, 16);
            const parts = raw.split(' ');
            if (parts.length === 2) {
                const [yyyy, mm, dd] = parts[0].split('-');
                return `${dd}/${mm}/${yyyy} ${parts[1]}`;
            }
            const d = new Date(f);
            if (isNaN(d.getTime())) return f;
            return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch(e) {
            return f;
        }
    }

    window.init_recepcion_compras = function() {
        window._recCompras.filtroEstado = 'TODOS';

        // Cargar almacenes dinámicos
        fetch('/api/almacen/almacenes-lista')
            .then(r => r.ok ? r.json() : [])
            .then(alms => {
                if (Array.isArray(alms) && alms.length) {
                    window._recCompras.almacenesDisponibles = alms.map(a => a.nombre || a.id);
                }
            }).catch(() => {});

        window.cargarRecepcionesOC();
    };

    // ── 1. Cargar Órdenes desde la API ──────────────────────────────
    window.cargarRecepcionesOC = function(forzar = false) {
        const tbody = document.getElementById('tbody-rec-compras');
        const cardCont = document.getElementById('recCardContainer');

        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-secondary"><div class="spinner-border spinner-border-sm text-primary me-2"></div> Consultando recepciones del ERP...</td></tr>`;
        }
        if (cardCont) {
            cardCont.innerHTML = `<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div> Cargando recepciones...</div>`;
        }

        fetch('/api/almacen/recepciones-oc')
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(data => {
                window._recCompras.ordenes = Array.isArray(data) ? data : [];
                window.actualizarKPICards();
                window.filtrarTablaRecepciones();
            })
            .catch(err => {
                console.error('Error al cargar recepciones:', err);
                if (tbody) {
                    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger"><i class="bi bi-exclamation-triangle me-2"></i> Error: ${err.message}</td></tr>`;
                }
                if (cardCont) {
                    cardCont.innerHTML = `<div class="text-center py-4 text-danger"><i class="bi bi-exclamation-triangle me-2"></i> Error: ${err.message}</div>`;
                }
            });
    };

    // ── 2. Actualizar Métricas Bento KPIs ───────────────────────────
    window.actualizarKPICards = function() {
        const ocs = window._recCompras.ordenes || [];
        const total = ocs.length;
        const pendientes = ocs.filter(o => o.estado_recepcion === 'PENDIENTE' || !o.estado_recepcion).length;
        const parciales = ocs.filter(o => o.estado_recepcion === 'PARCIAL').length;
        const completos = ocs.filter(o => o.estado_recepcion === 'COMPLETO').length;

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        setVal('kpi-rec-total', total);
        setVal('kpi-rec-pendientes', pendientes);
        setVal('kpi-rec-parciales', parciales);
        setVal('kpi-rec-completos', completos);
    };

    // ── 3. Filtro por Estado (Cards Superiores y Segmented Control) ──
    window.filtrarEstadoRecepcion = function(estado, btn) {
        window._recCompras.filtroEstado = estado || 'TODOS';

        // Actualizar clase activa en segmented control
        document.querySelectorAll('#btn-group-estados-rec .rec-segment-item').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-estado') === window._recCompras.filtroEstado);
        });

        // Actualizar clase activa en cards superiores
        const cardMap = {
            'TODOS': 'rec-kpi-card-total',
            'PENDIENTE': 'rec-kpi-card-pendientes',
            'PARCIAL': 'rec-kpi-card-parciales',
            'COMPLETO': 'rec-kpi-card-completos'
        };
        const targetCardId = cardMap[window._recCompras.filtroEstado] || 'rec-kpi-card-total';
        document.querySelectorAll('#moduloRecepcionCompras .rec-kpi-card').forEach(c => {
            c.classList.toggle('active', c.id === targetCardId);
        });

        window.filtrarTablaRecepciones();
    };

    // ── 4. Filtrar y Renderizar Tabla Desktop y Móvil ───────────────
    window.filtrarTablaRecepciones = function() {
        const filtro = window._recCompras.filtroEstado || 'TODOS';
        const q = (document.getElementById('filtro-buscar-rec')?.value || '').toLowerCase().trim();
        const ocs = window._recCompras.ordenes || [];

        const filtradas = ocs.filter(o => {
            // Filtro por Estado
            if (filtro === 'PENDIENTE' && (o.estado_recepcion !== 'PENDIENTE' && o.estado_recepcion)) return false;
            if (filtro === 'PARCIAL' && o.estado_recepcion !== 'PARCIAL') return false;
            if (filtro === 'COMPLETO' && o.estado_recepcion !== 'COMPLETO') return false;

            // Filtro de Búsqueda Rápida
            if (q) {
                const match = (o.id && o.id.toLowerCase().includes(q)) ||
                              (o.proveedor && o.proveedor.toLowerCase().includes(q)) ||
                              (o.solicitante && o.solicitante.toLowerCase().includes(q)) ||
                              (o.estado_oc && o.estado_oc.toLowerCase().includes(q)) ||
                              (o.items && o.items.some(it => (it.descripcion || '').toLowerCase().includes(q) || (it.inventario_id || '').toLowerCase().includes(q)));
                if (!match) return false;
            }

            return true;
        });

        const tbody = document.getElementById('tbody-rec-compras');
        const cardCont = document.getElementById('recCardContainer');
        const txtContador = document.getElementById('txt-rec-contador');

        if (txtContador) {
            txtContador.innerText = `Mostrando ${filtradas.length ? 1 : 0} a ${filtradas.length} de ${filtradas.length} registros`;
        }

        // Renderizar Vista Desktop
        if (tbody) {
            if (filtradas.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-secondary"><i class="bi bi-inbox fs-3 d-block mb-2 text-muted"></i> No se encontraron órdenes de compra para el filtro seleccionado.</td></tr>`;
            } else {
                tbody.innerHTML = filtradas.map(oc => {
                    let badgeProgreso = '';
                    const totRec = parseFloat(oc.total_recibido || 0);
                    const totPed = parseFloat(oc.total_pedido || 0);

                    if (oc.estado_recepcion === 'COMPLETO') {
                        badgeProgreso = `<span class="rec-badge rec-badge-completo"><i class="bi bi-check-circle-fill"></i> Completo (${totRec}/${totPed})</span>`;
                    } else if (oc.estado_recepcion === 'PARCIAL') {
                        badgeProgreso = `<span class="rec-badge rec-badge-parcial"><i class="bi bi-hourglass-split"></i> Parcial (${totRec}/${totPed})</span>`;
                    } else {
                        badgeProgreso = `<span class="rec-badge rec-badge-pendiente"><i class="bi bi-clock"></i> Pendiente (0/${totPed})</span>`;
                    }

                    const estOcNorm = (oc.estado_oc || 'REGISTRADO').toUpperCase();
                    let badgeOc = `<span class="badge" style="background:#0284c7;color:#fff;font-size:0.68rem;font-weight:800;border-radius:4px;padding:3px 7px;">${estOcNorm}</span>`;
                    if (estOcNorm === 'PROCESADO' || estOcNorm === 'PROCESADA') {
                        badgeOc = `<span class="badge" style="background:#0284c7;color:#fff;font-size:0.68rem;font-weight:800;border-radius:4px;padding:3px 7px;">PROCESADO</span>`;
                    }

                    const esCompleto = oc.estado_recepcion === 'COMPLETO';
                    const codLimpio = String(oc.id || '').replace(/^ENT-/i, '');

                    return `
                    <tr>
                        <td class="ps-4 fw-bolder text-primary text-nowrap font-monospace" style="font-size:0.88rem;">
                            <span style="cursor:pointer;" onclick="window.abrirModalRecepcion('${_escHtml(oc.id)}', ${esCompleto})" title="Ver Detalle">${oc.id}</span>
                        </td>
                        <td class="text-secondary fw-semibold text-nowrap" style="font-size:0.78rem;">${_fmtFechaCorta(oc.fecha)}</td>
                        <td class="fw-bold text-dark">
                            <div class="text-truncate" style="max-width: 280px;" title="${_escHtml(oc.proveedor)}">${_escHtml(oc.proveedor || 'Sin Proveedor')}</div>
                        </td>
                        <td class="text-secondary fw-semibold text-nowrap" style="font-size:0.78rem;">
                            <div class="text-truncate d-flex align-items-center gap-1.5" style="max-width: 170px;" title="${_escHtml(oc.solicitante)}">
                                <i class="bi bi-person text-muted"></i> <span>${_escHtml(oc.solicitante || 'SISTEMA')}</span>
                            </div>
                        </td>
                        <td class="fw-bolder text-dark text-nowrap text-end" style="font-size:0.86rem;">
                            <span class="${oc.moneda === 'USD' ? 'text-primary' : 'text-success'}">${oc.moneda || 'PEN'} ${(parseFloat(oc.importe) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                        </td>
                        <td class="text-center text-nowrap">${badgeOc}</td>
                        <td class="text-center text-nowrap">${badgeProgreso}</td>
                        <td class="pe-4 text-end text-nowrap">
                            ${esCompleto ? `
                                <button class="rec-action-btn rec-btn-ver" onclick="window.abrirModalRecepcion('${_escHtml(oc.id)}', true)">
                                    <i class="bi bi-eye-fill"></i> Ver Detalle
                                </button>
                            ` : `
                                <button class="rec-action-btn rec-btn-recepcionar" onclick="window.abrirModalRecepcion('${_escHtml(oc.id)}', false)">
                                    <i class="bi bi-box-arrow-in-down"></i> Recepcionar
                                </button>
                            `}
                        </td>
                    </tr>
                    `;
                }).join('');
            }
        }

        // Renderizar Vista Móvil Native Bento Cards
        if (cardCont) {
            if (filtradas.length === 0) {
                cardCont.innerHTML = `<div class="text-center py-5 text-muted"><i class="bi bi-inbox fs-3 d-block mb-2 text-muted"></i> No hay órdenes para mostrar.</div>`;
            } else {
                cardCont.innerHTML = filtradas.map(oc => {
                    const esCompleto = oc.estado_recepcion === 'COMPLETO';
                    const totRec = parseFloat(oc.total_recibido || 0);
                    const totPed = parseFloat(oc.total_pedido || 0);
                    const pct = totPed > 0 ? Math.min(100, Math.round((totRec / totPed) * 100)) : 0;

                    let badgeProgreso = '';
                    if (esCompleto) {
                        badgeProgreso = `<span class="rec-badge rec-badge-completo"><i class="bi bi-check-circle-fill"></i> Completo</span>`;
                    } else if (oc.estado_recepcion === 'PARCIAL') {
                        badgeProgreso = `<span class="rec-badge rec-badge-parcial"><i class="bi bi-hourglass-split"></i> Parcial (${pct}%)</span>`;
                    } else {
                        badgeProgreso = `<span class="rec-badge rec-badge-pendiente"><i class="bi bi-clock"></i> Pendiente</span>`;
                    }

                    return `
                    <div class="rec-mobile-card">
                        <!-- Top Header Card -->
                        <div class="d-flex align-items-center justify-content-between mb-2 pb-2 border-bottom">
                            <div class="d-flex align-items-center gap-2">
                                <span class="fw-bolder text-primary font-monospace" style="font-size:0.95rem;">${oc.id}</span>
                                <span class="text-muted small">• ${_fmtFechaCorta(oc.fecha)}</span>
                            </div>
                            <div>${badgeProgreso}</div>
                        </div>

                        <!-- Card Body Info -->
                        <div class="mb-3" style="font-size:0.84rem;">
                            <div class="fw-bold text-dark mb-1 text-truncate" title="${_escHtml(oc.proveedor)}">
                                <i class="bi bi-building text-secondary me-1"></i> ${_escHtml(oc.proveedor || 'Sin Proveedor')}
                            </div>
                            <div class="d-flex align-items-center justify-content-between text-secondary mb-2">
                                <span><i class="bi bi-person me-1"></i> ${_escHtml(oc.solicitante || 'SISTEMA')}</span>
                                <span class="fw-bolder text-dark">${oc.moneda || 'PEN'} ${(parseFloat(oc.importe) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                            </div>

                            <!-- Progress Bar -->
                            <div class="bg-light rounded-pill p-1 border">
                                <div class="d-flex justify-content-between text-muted small px-1 mb-1" style="font-size:0.72rem;">
                                    <span>Progreso: <b>${totRec}</b> de <b>${totPed}</b> ítems</span>
                                    <span class="fw-bold">${pct}%</span>
                                </div>
                                <div class="progress" style="height: 6px;">
                                    <div class="progress-bar ${esCompleto ? 'bg-success' : 'bg-warning'}" role="progressbar" style="width: ${pct}%;"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Full-width Action Button -->
                        <div>
                            ${esCompleto ? `
                                <button class="btn btn-light border w-100 fw-bold py-2 rounded-3 text-primary d-flex align-items-center justify-content-center gap-2 shadow-2xs" onclick="window.abrirModalRecepcion('${_escHtml(oc.id)}', true)">
                                    <i class="bi bi-eye-fill"></i> Ver Detalle de Recepción
                                </button>
                            ` : `
                                <button class="btn btn-primary w-100 fw-bold py-2 rounded-3 d-flex align-items-center justify-content-center gap-2 shadow-sm" style="background:#ea580c;border-color:#ea580c;" onclick="window.abrirModalRecepcion('${_escHtml(oc.id)}', false)">
                                    <i class="bi bi-box-arrow-in-down"></i> Recepcionar Artículos
                                </button>
                            `}
                        </div>
                    </div>
                    `;
                }).join('');
            }
        }
    };

    // ── 5. Abrir Modal de Recepción (Amplio y Responsivo) ────────────
    window.abrirModalRecepcion = function(ocId, soloVer = false) {
        const oc = (window._recCompras.ordenes || []).find(o => o.id === ocId);
        if (!oc) return;
        window._recCompras.ordenSeleccionada = oc;

        // Inyectar datos en el encabezado del modal
        const badgeFolio = document.getElementById('modal-rec-badge-folio');
        if (badgeFolio) badgeFolio.innerText = oc.id;

        const ordenEl = document.getElementById('modal-rec-orden');
        if (ordenEl) ordenEl.innerText = oc.id;

        const provEl = document.getElementById('modal-rec-proveedor');
        if (provEl) {
            provEl.innerText = oc.proveedor || 'Sin Proveedor';
            provEl.title = oc.proveedor || '';
        }

        const solEl = document.getElementById('modal-rec-solicitante');
        if (solEl) solEl.innerText = oc.solicitante || 'SISTEMA';

        const impEl = document.getElementById('modal-rec-importe');
        if (impEl) impEl.innerText = `${oc.moneda || 'PEN'} ${(parseFloat(oc.importe) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;

        const condEl = document.getElementById('modal-rec-condicion');
        if (condEl) condEl.innerText = (oc.condicion_pago || 'Al Contado').toUpperCase();

        // Reset de campos de entrada
        const fInput = document.getElementById('modal-rec-fecha');
        if (fInput) fInput.value = obtenerFechaHoraActualLocal();
        const obsInput = document.getElementById('modal-rec-obs');
        if (obsInput) obsInput.value = '';
        const fileInput = document.getElementById('modal-rec-file');
        if (fileInput) fileInput.value = '';

        const inputsBox = document.getElementById('modal-rec-inputs-box');
        const btnEjecutar = document.getElementById('btn-modal-ejecutar-recepcion');
        const btnAutofill = document.getElementById('btn-rec-autofill-all');

        const esCompleto = oc.estado_recepcion === 'COMPLETO';
        if (soloVer || esCompleto) {
            if (inputsBox) inputsBox.style.display = 'none';
            if (btnEjecutar) btnEjecutar.style.display = 'none';
            if (btnAutofill) btnAutofill.style.display = 'none';
        } else {
            if (inputsBox) inputsBox.style.display = 'block';
            if (btnEjecutar) btnEjecutar.style.display = 'inline-flex';
            if (btnAutofill) btnAutofill.style.display = 'inline-flex';
        }

        // Renderizar tabla de productos a recepcionar
        const itemsBody = document.getElementById('modal-rec-items-body');
        const badgeItems = document.getElementById('modal-rec-items-badge');
        if (badgeItems) badgeItems.innerText = `${(oc.items || []).length} Ítems`;

        const almacenesOpts = (window._recCompras.almacenesDisponibles || ['ALM CENTRAL']).map(alm => 
            `<option value="${_escHtml(alm)}">${_escHtml(alm)}</option>`
        ).join('');

        if (itemsBody) {
            itemsBody.innerHTML = (oc.items || []).map((it, idx) => {
                const pend = parseFloat(it.pendiente || 0);
                const ped = parseFloat(it.pedido || 0);
                const rec = parseFloat(it.recepcionado || 0);

                return `
                <tr>
                    <td>
                        <div class="fw-bolder text-dark" style="font-size:0.86rem;">${_escHtml(it.descripcion || 'Artículo')}</div>
                        ${it.inventario_id ? `<small class="text-primary font-monospace fw-semibold">${_escHtml(it.inventario_id)}</small>` : ''}
                    </td>
                    <td class="text-center text-secondary fw-semibold">${_escHtml(it.unidad || 'UND')}</td>
                    <td class="text-center fw-bold text-dark">${ped.toFixed(2)}</td>
                    <td class="text-center text-success fw-bold">${rec.toFixed(2)}</td>
                    <td class="text-center">
                        ${pend > 0 ? `<span class="badge bg-danger text-white fw-bold px-2 py-1" style="font-size:0.75rem;">${pend.toFixed(2)}</span>` : `<span class="badge bg-light text-muted border">0.00</span>`}
                    </td>
                    <td class="text-center">
                        ${pend > 0 && !soloVer && !esCompleto ? `
                            <div class="input-group input-group-sm mx-auto" style="max-width: 130px;">
                                <input type="number" step="any" min="0" max="${pend}" 
                                       class="form-control text-center fw-bolder border-warning rec-item-cant-input" 
                                       data-idx="${idx}" 
                                       data-pend="${pend}"
                                       value="${pend}" 
                                       style="background:#fffbeb; font-size:0.88rem;">
                                <button class="btn btn-outline-warning btn-sm" type="button" onclick="window.autoCompletarFila(${idx}, ${pend})" title="Cargar saldo completo">
                                    <i class="bi bi-check2"></i>
                                </button>
                            </div>
                        ` : `
                            <span class="badge bg-light text-success border"><i class="bi bi-check-all"></i> Completo</span>
                        `}
                    </td>
                    <td>
                        ${pend > 0 && !soloVer && !esCompleto ? `
                            <select class="form-select form-select-sm fw-semibold rec-item-alm-select rounded-3 border" data-idx="${idx}" style="font-size:0.8rem;">
                                ${almacenesOpts}
                            </select>
                        ` : `
                            <span class="text-secondary small fw-semibold">${_escHtml(oc.almacen || 'ALM CENTRAL')}</span>
                        `}
                    </td>
                </tr>
                `;
            }).join('');
        }

        // Renderizar tabla de historial de entregas con fotos S3
        const histBody = document.getElementById('modal-rec-historial-body');
        const historial = oc.historial_recepciones || [];

        if (histBody) {
            if (historial.length === 0) {
                histBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><i class="bi bi-inbox fs-4 d-block mb-1 text-secondary"></i>Aún no se han registrado entregas para esta orden de compra.</td></tr>`;
            } else {
                histBody.innerHTML = historial.map(h => {
                    const fotoBtn = h.sustento_url_presigned || h.sustento_url ? `
                        <a href="${h.sustento_url_presigned || h.sustento_url}" target="_blank" class="btn btn-sm btn-outline-primary py-0 px-2 fw-semibold d-inline-flex align-items-center gap-1" style="font-size:0.75rem;">
                            <i class="bi bi-file-earmark-image"></i> Ver Sustento
                        </a>
                    ` : `<span class="text-muted small">Sin archivo</span>`;

                    const delBtn = `
                        <button type="button" class="btn btn-sm btn-outline-danger p-1 d-inline-flex align-items-center justify-content-center rounded-2" onclick="window.eliminarRegistroRecepcion(${h.recepcion_id}, '${_escHtml(h.descripcion||'')}', ${parseFloat(h.cantidad_recibida || 0)})" title="Eliminar y revertir esta entrega">
                            <i class="bi bi-trash"></i>
                        </button>
                    `;

                    return `
                    <tr>
                        <td class="fw-semibold text-nowrap" style="font-size:0.75rem;">${_fmtFechaCorta(h.fecha_recepcion)}</td>
                        <td class="fw-bold text-dark text-nowrap" style="font-size:0.75rem;"><i class="bi bi-person text-muted me-1"></i>${_escHtml(h.usuario || 'Almacén')}</td>
                        <td class="fw-semibold text-dark" style="font-size:0.78rem;">${_escHtml(h.descripcion || '—')}</td>
                        <td class="text-center fw-bolder text-success" style="font-size:0.82rem;">+${parseFloat(h.cantidad_recibida || 0).toFixed(2)}</td>
                        <td><span class="badge bg-light text-dark border">${_escHtml(h.almacen || 'ALM CENTRAL')}</span></td>
                        <td class="text-secondary small">${_escHtml(h.observacion || '—')}</td>
                        <td class="text-center">${fotoBtn}</td>
                        <td class="text-center">${delBtn}</td>
                    </tr>
                    `;
                }).join('');
            }
        }

        // Mostrar Modal
        const modalEl = document.getElementById('modalRecepcionOC');
        if (modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    };

    // ── Helper: Autocompletar Saldo en Modal ─────────────────────────
    window.autoCompletarFila = function(idx, val) {
        const inp = document.querySelector(`.rec-item-cant-input[data-idx="${idx}"]`);
        if (inp) inp.value = val;
    };

    window.autoCompletarTodoSaldo = function() {
        const inputs = document.querySelectorAll('.rec-item-cant-input');
        inputs.forEach(inp => {
            const pend = inp.getAttribute('data-pend') || inp.getAttribute('max');
            if (pend) inp.value = pend;
        });
    };

    // ── 6. Eliminar / Revertir Entrega Parcial o Total (Modal Diseño B) ──
    let _itemRecepcionAEliminar = null;

    window.eliminarRegistroRecepcion = function(recepcionId, desc, cant) {
        if (!recepcionId) return;
        _itemRecepcionAEliminar = { recepcionId, desc, cant };

        const descEl = document.getElementById('lbl-rec-eliminar-desc');
        if (descEl) {
            descEl.innerHTML = `¿Eliminar entrega de <strong>+${cant} ${desc}</strong>?<br><span class="text-muted" style="font-size:0.78rem;">Se revertirá el stock ingresado y el saldo pendiente quedará disponible.</span>`;
        }

        const modalEl = document.getElementById('modalEliminarRecepcionConfirm');
        if (modalEl) {
            const m = bootstrap.Modal.getOrCreateInstance(modalEl);
            m.show();
        }
    };

    window._ejecutarEliminarRecepcionConfirmado = async function() {
        if (!_itemRecepcionAEliminar || !_itemRecepcionAEliminar.recepcionId) return;
        const { recepcionId } = _itemRecepcionAEliminar;
        _itemRecepcionAEliminar = null;

        const modalDelEl = document.getElementById('modalEliminarRecepcionConfirm');
        if (modalDelEl) {
            bootstrap.Modal.getInstance(modalDelEl)?.hide();
        }

        try {
            const usuario = localStorage.getItem('fleet_user_nombre') || localStorage.getItem('fleet_user') || 'Usuario';
            const res = await fetch(`/api/almacen/recepciones-oc/${recepcionId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'No se pudo eliminar el registro de entrega');
            }

            // Recargar datos actualizados del backend
            const resReload = await fetch('/api/almacen/recepciones-oc');
            const dataReload = await resReload.json();
            window._recCompras.ordenes = Array.isArray(dataReload) ? dataReload : [];
            window.actualizarKPICards();
            window.filtrarTablaRecepciones();

            // Refrescar modal si está abierto
            const currentOcId = window._recCompras.ordenSeleccionada?.id;
            if (currentOcId) {
                const ocActualizada = (window._recCompras.ordenes || []).find(o => o.id === currentOcId);
                if (ocActualizada) {
                    window.abrirModalRecepcion(ocActualizada.id);
                } else {
                    const modalEl = document.getElementById('modalRecepcionOC');
                    if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
                }
            }
        } catch(err) {
            alert('Error: ' + err.message);
        }
    };

    // ── 7. Ejecutar y Registrar Recepción Física ─────────────────────
    window.ejecutarRegistroRecepcion = function() {
        const oc = window._recCompras.ordenSeleccionada;
        if (!oc) return;

        const inputsCant = document.querySelectorAll('.rec-item-cant-input');
        const itemsARecepcionar = [];
        let sumaCantidades = 0;

        inputsCant.forEach(inp => {
            const idx = parseInt(inp.getAttribute('data-idx'), 10);
            const cant = parseFloat(inp.value) || 0;
            const itemBase = (oc.items || [])[idx];

            if (cant > 0 && itemBase) {
                if (cant > itemBase.pendiente) {
                    alert(`La cantidad a recepcionar (${cant}) no puede superar el saldo pendiente (${itemBase.pendiente}) para "${itemBase.descripcion}".`);
                    return;
                }
                const selAlm = document.querySelector(`.rec-item-alm-select[data-idx="${idx}"]`);
                const almDestino = selAlm ? selAlm.value : (oc.almacen || 'ALM CENTRAL');

                itemsARecepcionar.push({
                    inventario_id: itemBase.inventario_id,
                    descripcion: itemBase.descripcion,
                    cantidad_recibida: cant,
                    costo_unitario: itemBase.costo_unitario,
                    moneda: itemBase.moneda,
                    almacen: almDestino
                });
                sumaCantidades += cant;
            }
        });

        if (itemsARecepcionar.length === 0 || sumaCantidades <= 0) {
            alert('Por favor ingrese al menos una cantidad mayor a 0 para recepcionar.');
            return;
        }

        const fechaRecepcion = document.getElementById('modal-rec-fecha')?.value || obtenerFechaHoraActualLocal();
        const observacion = document.getElementById('modal-rec-obs')?.value || '';
        const fileInput = document.getElementById('modal-rec-file');
        const usuarioActual = localStorage.getItem('fleet_user_nombre') || localStorage.getItem('fleet_user') || 'Responsable Almacén';

        // Determinar si completa la totalidad de los saldos pendientes
        const totalPendienteOriginal = (oc.items || []).reduce((acc, it) => acc + (parseFloat(it.pendiente) || 0), 0);
        const tipoRecepcion = (sumaCantidades >= totalPendienteOriginal) ? 'TOTAL' : 'PARCIAL';

        // Multi-part FormData para soporte de AWS S3
        const formData = new FormData();
        formData.append('oc_id', oc.id);
        formData.append('fecha_recepcion', fechaRecepcion);
        formData.append('usuario', usuarioActual);
        formData.append('observacion', observacion);
        formData.append('almacen', itemsARecepcionar[0].almacen || 'ALM CENTRAL');
        formData.append('tipo_recepcion', tipoRecepcion);
        formData.append('items_json', JSON.stringify(itemsARecepcionar));

        if (fileInput && fileInput.files && fileInput.files[0]) {
            formData.append('sustento', fileInput.files[0]);
        }

        const btnConfirmar = document.getElementById('btn-modal-ejecutar-recepcion');
        const origBtnHtml = btnConfirmar ? btnConfirmar.innerHTML : '';
        if (btnConfirmar) {
            btnConfirmar.disabled = true;
            btnConfirmar.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Procesando recepción...`;
        }

        fetch('/api/almacen/recepciones-oc/registrar', {
            method: 'POST',
            body: formData
        })
        .then(res => {
            if (!res.ok) throw new Error('Error en el servidor al registrar la recepción');
            return res.json();
        })
        .then(data => {
            // Cerrar modal
            const modalEl = document.getElementById('modalRecepcionOC');
            if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

            alert('✅ Recepción registrada exitosamente. Se ha actualizado el inventario y Kardex.');

            // Recargar datos actualizados
            window.cargarRecepcionesOC();
        })
        .catch(err => {
            alert('Error al registrar recepción: ' + err.message);
        })
        .finally(() => {
            if (btnConfirmar) {
                btnConfirmar.disabled = false;
                btnConfirmar.innerHTML = origBtnHtml || `<i class="bi bi-check2-circle fs-6"></i> <span>Registrar Recepción</span>`;
            }
        });
    };

    // ── 8. Exportar a Excel ─────────────────────────────────────────
    window.exportarRecepcionesExcel = function() {
        const ocs = window._recCompras.ordenes || [];
        if (!ocs.length) return alert('No hay órdenes de compra para exportar.');

        let csv = 'Orden;Fecha;Proveedor;Solicitante;Importe;Moneda;Estado OC;Estado Recepcion;Total Pedido;Total Recibido;Pendiente\n';
        ocs.forEach(o => {
            const row = [
                o.id,
                o.fecha || '',
                `"${(o.proveedor || '').replace(/"/g, '""')}"`,
                `"${(o.solicitante || '').replace(/"/g, '""')}"`,
                o.importe || 0,
                o.moneda || 'PEN',
                o.estado_oc || '',
                o.estado_recepcion || 'PENDIENTE',
                o.total_pedido || 0,
                o.total_recibido || 0,
                (parseFloat(o.total_pedido || 0) - parseFloat(o.total_recibido || 0))
            ];
            csv += row.join(';') + '\n';
        });

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Recepciones_Compras_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // Inicialización automática
    window.init_recepcion_compras();

})();
