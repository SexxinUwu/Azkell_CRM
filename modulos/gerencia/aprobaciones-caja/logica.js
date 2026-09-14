// =========================================================================
// MÓDULO: GERENCIA - APROBACIÓN DE CAJA (ERP AZKELL)
// =========================================================================

(function() {
    'use strict';

    // Detección inicial de vista: tabla por defecto en escritorio, cards en móvil
    const isMobile = window.innerWidth <= 768;
    const modoGuardado = localStorage.getItem('erp_gerencia_caja_vista');
    const modoInicial = modoGuardado || (isMobile ? 'cards' : 'table');

    window._gerenciaCaja = window._gerenciaCaja || {
        tabActivo: 'pendiente',
        modoVista: modoInicial,
        cajas: [],
        cajaSeleccionada: null
    };

    function formatearFecha(iso) {
        if (!iso) return '—';
        try {
            const s = String(iso);
            let d;
            if (s.includes('T') || s.includes(' ')) {
                d = new Date(s.replace(' ', 'T'));
            } else {
                d = new Date(s + 'T00:00:00');
            }
            if (isNaN(d.getTime())) return String(iso).slice(0, 10);
            return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch(e) {
            return String(iso).slice(0, 10);
        }
    }

    function formatearMoneda(monto, moneda) {
        const val = parseFloat(monto) || 0;
        const sim = (moneda === 'DOLARES' || moneda === 'USD') ? '$' : 'S/';
        return `${sim} ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function obtenerUsuarioActual() {
        return localStorage.getItem('fleet_nombre_usuario') || 
               localStorage.getItem('fleet_user') || 
               (typeof usuarioLogueado !== 'undefined' && usuarioLogueado) || 
               'Sthefano Avila';
    }

    // ── Cargar Cajas desde API ──────────────────────────────────────
    window.recargarAprobacionesCaja = async function() {
        const tbody = document.getElementById('cuerpo-tabla-aprobaciones-caja');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Cargando movimientos de caja...</td></tr>';
        }

        try {
            const resp = await fetch('/api/tesoreria/caja');
            const res = await resp.json();

            let lista = [];
            if (res && Array.isArray(res.data)) {
                lista = res.data;
            } else if (Array.isArray(res)) {
                lista = res;
            }

            window._gerenciaCaja.cajas = lista;
            poblarFiltroMotivos(lista);
            window.actualizarKPIsCaja();
            window.renderizarListaCajas();
        } catch(err) {
            console.error('Error cargando movimientos de caja:', err);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="12" class="text-center py-4 text-danger"><i class="bi bi-exclamation-circle me-1"></i> Error al cargar datos: ' + escapeHtml(err.message) + '</td></tr>';
            }
        }
    };

    function poblarFiltroMotivos(lista) {
        const sel = document.getElementById('filtro-caja-motivo');
        if (!sel) return;
        const actual = sel.value;
        const motivos = new Set();
        lista.forEach(c => {
            if (c.motivo && c.motivo.trim()) motivos.add(c.motivo.trim());
        });

        sel.innerHTML = '<option value="">Todos los Motivos</option>';
        Array.from(motivos).sort().forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            if (m === actual) opt.selected = true;
            sel.appendChild(opt);
        });
    }

    // ── KPIs y Filtros ──────────────────────────────────────────────
    window.actualizarKPIsCaja = function() {
        const cajas = window._gerenciaCaja.cajas || [];

        let cPend = 0, mPend = 0;
        let cAprob = 0, mAprob = 0;
        let cAnul = 0, mAnul = 0;
        let cTotal = cajas.length, mTotal = 0;

        cajas.forEach(c => {
            const est = (c.estado || 'REGISTRADO').toUpperCase();
            const monto = parseFloat(c.importe_total) || 0;
            mTotal += monto;

            if (est === 'PENDIENTE' || est === 'REGISTRADO') {
                cPend++;
                mPend += monto;
            } else if (est === 'APROBADO' || est === 'PAGADO') {
                cAprob++;
                mAprob += monto;
            } else if (est === 'ANULADO' || est === 'RECHAZADO') {
                cAnul++;
                mAnul += monto;
            }
        });

        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setTxt('kpi-caja-count-pendientes', cPend);
        setTxt('kpi-caja-monto-pendientes', formatearMoneda(mPend, 'SOLES'));
        setTxt('kpi-caja-count-aprobadas', cAprob);
        setTxt('kpi-caja-monto-aprobadas', formatearMoneda(mAprob, 'SOLES'));
        setTxt('kpi-caja-count-anuladas', cAnul);
        setTxt('kpi-caja-monto-anuladas', formatearMoneda(mAnul, 'SOLES'));
        setTxt('kpi-caja-count-todos', cTotal);
        setTxt('kpi-caja-monto-todos', formatearMoneda(mTotal, 'SOLES'));

        setTxt('tab-badge-caja-todos', cTotal);
        setTxt('tab-badge-caja-pendiente', cPend);
        setTxt('tab-badge-caja-aprobado', cAprob);
        setTxt('tab-badge-caja-anulado', cAnul);

        // Actualizar badge en sidebar si existe
        const sidebarBadge = document.getElementById('badge-count-caja-pend');
        if (sidebarBadge) {
            sidebarBadge.textContent = `${cPend} Pend.`;
            sidebarBadge.style.display = cPend > 0 ? 'inline-block' : 'none';
        }
    };

    window.filtrarPorTabCaja = function(tab) {
        window._gerenciaCaja.tabActivo = tab;
        document.querySelectorAll('.caja-tab-btn').forEach(b => {
            if (b.getAttribute('data-tab') === tab) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
        window.renderizarListaCajas();
    };

    window.cambiarModoVistaCaja = function(modo) {
        window._gerenciaCaja.modoVista = modo;
        localStorage.setItem('erp_gerencia_caja_vista', modo);

        const btnTable = document.getElementById('btn-caja-view-table');
        const btnCards = document.getElementById('btn-caja-view-cards');
        const contTable = document.getElementById('contenedor-caja-vista-table');
        const contCards = document.getElementById('contenedor-caja-vista-cards');

        if (modo === 'table') {
            btnTable?.classList.add('active', 'btn-white');
            btnTable?.classList.remove('btn-transparent', 'text-secondary');
            btnCards?.classList.remove('active', 'btn-white');
            btnCards?.classList.add('btn-transparent', 'text-secondary');

            contTable?.classList.remove('d-none');
            contCards?.classList.add('d-none');
        } else {
            btnCards?.classList.add('active', 'btn-white');
            btnCards?.classList.remove('btn-transparent', 'text-secondary');
            btnTable?.classList.remove('active', 'btn-white');
            btnTable?.classList.add('btn-transparent', 'text-secondary');

            contTable?.classList.add('d-none');
            contCards?.classList.remove('d-none');
        }

        window.renderizarListaCajas();
    };

    window.aplicarFiltrosCaja = function() {
        window.renderizarListaCajas();
    };

    window.limpiarFiltrosCaja = function() {
        const d = document.getElementById('filtro-caja-fecha-desde');
        const h = document.getElementById('filtro-caja-fecha-hasta');
        const b = document.getElementById('filtro-caja-buscar');
        const m = document.getElementById('filtro-caja-motivo');
        if (d) d.value = '';
        if (h) h.value = '';
        if (b) b.value = '';
        if (m) m.value = '';
        window.filtrarPorTabCaja('pendiente');
    };

    function obtenerCajasFiltradas() {
        const todas = window._gerenciaCaja.cajas || [];
        const tab = window._gerenciaCaja.tabActivo;
        const desde = document.getElementById('filtro-caja-fecha-desde')?.value || '';
        const hasta = document.getElementById('filtro-caja-fecha-hasta')?.value || '';
        const busq = (document.getElementById('filtro-caja-buscar')?.value || '').toLowerCase().trim();
        const motivo = document.getElementById('filtro-caja-motivo')?.value || '';

        return todas.filter(c => {
            const est = (c.estado || 'REGISTRADO').toUpperCase();

            // Filtro por Tab
            if (tab === 'pendiente' && (est !== 'PENDIENTE' && est !== 'REGISTRADO')) return false;
            if (tab === 'aprobado' && (est !== 'APROBADO' && est !== 'PAGADO')) return false;
            if (tab === 'anulado' && (est !== 'ANULADO' && est !== 'RECHAZADO')) return false;

            // Filtro por Fechas
            const fItem = (c.fecha || '').slice(0, 10);
            if (desde && fItem && fItem < desde) return false;
            if (hasta && fItem && fItem > hasta) return false;

            // Filtro por Motivo
            if (motivo && (c.motivo || '').trim() !== motivo) return false;

            // Filtro por Búsqueda de Texto
            if (busq) {
                const numComp = `${c.serie || ''}-${c.numero || ''}`.toLowerCase();
                const pers = (c.persona || '').toLowerCase();
                const cond = (c.conductor || '').toLowerCase();
                const plac = (c.placa || '').toLowerCase();
                const mot = (c.motivo || '').toLowerCase();
                const sub = (c.sub_motivo || '').toLowerCase();
                const via = (c.orden_viaje || '').toLowerCase();
                const cre = (c.usuario_creacion || '').toLowerCase();
                const apr = (c.usuario_aprobacion || '').toLowerCase();

                const match = numComp.includes(busq) || pers.includes(busq) || cond.includes(busq) ||
                              plac.includes(busq) || mot.includes(busq) || sub.includes(busq) ||
                              via.includes(busq) || cre.includes(busq) || apr.includes(busq);
                if (!match) return false;
            }

            return true;
        });
    }

    // ── Renderizado de la lista (Tabla / Tarjetas) ─────────────────
    window.renderizarListaCajas = function() {
        const filtradas = obtenerCajasFiltradas();
        const emptyState = document.getElementById('empty-state-aprobaciones-caja');
        const contTable = document.getElementById('contenedor-caja-vista-table');
        const contCards = document.getElementById('contenedor-caja-vista-cards');

        if (filtradas.length === 0) {
            emptyState?.classList.remove('d-none');
            contTable?.classList.add('d-none');
            contCards?.classList.add('d-none');
            return;
        }

        emptyState?.classList.add('d-none');

        if (window._gerenciaCaja.modoVista === 'table') {
            contTable?.classList.remove('d-none');
            contCards?.classList.add('d-none');
            renderizarTabla(filtradas);
        } else {
            contTable?.classList.add('d-none');
            contCards?.classList.remove('d-none');
            renderizarTarjetas(filtradas);
        }
    };

    function getBadgeEstado(estado) {
        const st = (estado || 'REGISTRADO').toUpperCase();
        if (st === 'APROBADO' || st === 'PAGADO') {
            return `<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill fw-bold" style="font-size:0.7rem;"><i class="bi bi-check-circle-fill me-1"></i>${st}</span>`;
        } else if (st === 'ANULADO' || st === 'RECHAZADO') {
            return `<span class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill fw-bold" style="font-size:0.7rem;"><i class="bi bi-x-circle-fill me-1"></i>${st}</span>`;
        } else {
            return `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill fw-bold" style="font-size:0.7rem;"><i class="bi bi-clock-history me-1"></i>POR APROBAR</span>`;
        }
    }

    function renderizarTabla(cajas) {
        const tbody = document.getElementById('cuerpo-tabla-aprobaciones-caja');
        if (!tbody) return;

        tbody.innerHTML = cajas.map(c => {
            const id = c.id;
            const num = `${c.serie || ''}-${c.numero || ''}`;
            const est = (c.estado || 'REGISTRADO').toUpperCase();
            const esPendiente = (est === 'PENDIENTE' || est === 'REGISTRADO');
            const esAprobado = (est === 'APROBADO' || est === 'PAGADO');

            let btnAcciones = `
                <button class="btn btn-sm btn-outline-primary py-1 px-2 fw-semibold" title="Ver Detalle" onclick="window.verDetalleCaja(${id})">
                    <i class="bi bi-eye"></i> Detalle
                </button>
            `;

            if (esPendiente) {
                btnAcciones = `
                    <div class="d-flex align-items-center gap-1">
                        <button class="btn btn-sm btn-caja-autorizar" title="Aprobar Caja" onclick="window.prepararAprobarCaja(${id})">
                            <i class="bi bi-check2"></i> Aprobar
                        </button>
                        <button class="btn btn-sm btn-caja-anular" title="Anular Caja" onclick="window.prepararAnularCaja(${id})">
                            <i class="bi bi-x-lg"></i> Anular
                        </button>
                        <button class="btn btn-sm btn-outline-secondary py-1 px-2" title="Ver Detalle" onclick="window.verDetalleCaja(${id})">
                            <i class="bi bi-eye"></i>
                        </button>
                    </div>
                `;
            } else if (esAprobado) {
                btnAcciones = `
                    <div class="d-flex align-items-center gap-1">
                        <button class="btn btn-sm btn-caja-anular" title="Anular Caja Aprobada" onclick="window.prepararAnularCaja(${id})">
                            <i class="bi bi-slash-circle"></i> Anular
                        </button>
                        <button class="btn btn-sm btn-outline-secondary py-1 px-2" title="Ver Detalle" onclick="window.verDetalleCaja(${id})">
                            <i class="bi bi-eye"></i>
                        </button>
                    </div>
                `;
            }

            const motivoTxt = escapeHtml(c.motivo || '—');
            const subMotivoTxt = c.sub_motivo ? `<div class="text-secondary small">${escapeHtml(c.sub_motivo)}</div>` : '';
            const beneficiarioTxt = escapeHtml(c.persona || c.conductor || '—');
            const placaViaje = [c.placa ? `Placa: ${c.placa}` : '', c.orden_viaje ? `Viaje: ${c.orden_viaje}` : ''].filter(Boolean).join('<br>') || '—';
            const ctaOrigen = escapeHtml(c.cuenta_bancaria_empresa || '—');
            const ctaDestino = escapeHtml(c.cuenta_bancaria_persona || '—');
            const usuarioReg = escapeHtml(c.usuario_creacion || 'Sistema');
            const usuarioAprob = escapeHtml(c.usuario_aprobacion || '—');

            return `
                <tr>
                    <td>${btnAcciones}</td>
                    <td class="text-secondary fw-semibold">${formatearFecha(c.fecha)}</td>
                    <td>
                        <button class="btn-caja-code" onclick="window.verDetalleCaja(${id})">
                            <i class="bi bi-hash"></i> ${escapeHtml(num)}
                        </button>
                    </td>
                    <td>${getBadgeEstado(c.estado)}</td>
                    <td class="fw-bold text-dark">${beneficiarioTxt}</td>
                    <td>
                        <div class="fw-semibold text-dark">${motivoTxt}</div>
                        ${subMotivoTxt}
                    </td>
                    <td class="small text-secondary">${placaViaje}</td>
                    <td class="small text-secondary" style="max-width:180px; overflow:hidden; text-overflow:ellipsis;" title="${ctaOrigen}">${ctaOrigen}</td>
                    <td class="small text-secondary" style="max-width:180px; overflow:hidden; text-overflow:ellipsis;" title="${ctaDestino}">${ctaDestino}</td>
                    <td class="text-end fw-black text-dark" style="font-size:0.92rem;">${formatearMoneda(c.importe_total, c.moneda)}</td>
                    <td class="small text-secondary"><i class="bi bi-person me-1"></i>${usuarioReg}</td>
                    <td class="small text-secondary"><i class="bi bi-shield-check text-success me-1"></i>${usuarioAprob}</td>
                </tr>
            `;
        }).join('');
    }

    function renderizarTarjetas(cajas) {
        const cont = document.getElementById('contenedor-caja-vista-cards');
        if (!cont) return;

        cont.innerHTML = cajas.map(c => {
            const id = c.id;
            const num = `${c.serie || ''}-${c.numero || ''}`;
            const est = (c.estado || 'REGISTRADO').toUpperCase();
            const esPendiente = (est === 'PENDIENTE' || est === 'REGISTRADO');
            const statusClass = (est === 'APROBADO' || est === 'PAGADO') ? 'status-aprobado' :
                                (est === 'ANULADO' || est === 'RECHAZADO') ? 'status-anulado' : 'status-pendiente';

            return `
                <div class="col-12 col-md-6 col-xl-4">
                    <div class="caja-approval-card ${statusClass}">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div>
                                <button class="btn-caja-code mb-1" onclick="window.verDetalleCaja(${id})">
                                    <i class="bi bi-hash"></i> ${escapeHtml(num)}
                                </button>
                                <div class="text-secondary small"><i class="bi bi-calendar3 me-1"></i>${formatearFecha(c.fecha)}</div>
                            </div>
                            <div>${getBadgeEstado(c.estado)}</div>
                        </div>

                        <div class="mb-3">
                            <div class="text-secondary small text-uppercase fw-bold">Beneficiario</div>
                            <div class="fw-bold text-dark fs-6">${escapeHtml(c.persona || c.conductor || '—')}</div>
                            <div class="text-secondary small mt-1"><strong>Motivo:</strong> ${escapeHtml(c.motivo || '—')} ${c.sub_motivo ? '(' + escapeHtml(c.sub_motivo) + ')' : ''}</div>
                            ${c.placa ? `<div class="text-secondary small"><strong>Placa:</strong> ${escapeHtml(c.placa)} ${c.orden_viaje ? '| Viaje: ' + escapeHtml(c.orden_viaje) : ''}</div>` : ''}
                        </div>

                        <div class="p-2 rounded-3 bg-light border mb-3 d-flex justify-content-between align-items-center">
                            <span class="text-secondary small fw-bold">IMPORTE TOTAL</span>
                            <span class="fw-black text-dark fs-5">${formatearMoneda(c.importe_total, c.moneda)}</span>
                        </div>

                        <div class="d-flex justify-content-between align-items-center border-top pt-2" style="font-size:0.76rem;">
                            <span class="text-secondary"><i class="bi bi-person me-1"></i>Reg: <strong>${escapeHtml(c.usuario_creacion || 'Sistema')}</strong></span>
                            ${c.usuario_aprobacion ? `<span class="text-success"><i class="bi bi-shield-check me-1"></i>${escapeHtml(c.usuario_aprobacion)}</span>` : ''}
                        </div>

                        <div class="mt-3 pt-2 border-top d-flex gap-2">
                            <button class="btn btn-outline-secondary btn-sm flex-grow-1 fw-semibold" onclick="window.verDetalleCaja(${id})">
                                <i class="bi bi-eye"></i> Detalle
                            </button>
                            ${esPendiente ? `
                                <button class="btn btn-caja-anular btn-sm fw-bold" onclick="window.prepararAnularCaja(${id})">
                                    <i class="bi bi-x-lg"></i> Anular
                                </button>
                                <button class="btn btn-caja-autorizar btn-sm fw-bold" onclick="window.prepararAprobarCaja(${id})">
                                    <i class="bi bi-check2"></i> Aprobar
                                </button>
                            ` : `
                                <button class="btn btn-caja-anular btn-sm fw-bold" onclick="window.prepararAnularCaja(${id})">
                                    <i class="bi bi-slash-circle"></i> Anular
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ── Modal de Detalle de Caja ───────────────────────────────────
    window.verDetalleCaja = function(id) {
        const item = (window._gerenciaCaja.cajas || []).find(c => c.id == id);
        if (!item) return;
        window._gerenciaCaja.cajaSeleccionada = item;

        const setTxt = (elId, val) => { const el = document.getElementById(elId); if (el) el.textContent = val; };
        const num = `${item.serie || ''}-${item.numero || ''}`;
        setTxt('det-caja-numero', `CAJA-${num}`);
        setTxt('det-caja-fecha-emision', `Registrado el ${formatearFecha(item.fecha)} ${item.hora || ''}`);

        const badgeEst = document.getElementById('det-caja-badge-estado');
        if (badgeEst) {
            badgeEst.className = 'badge rounded-pill fw-bold';
            const est = (item.estado || 'REGISTRADO').toUpperCase();
            if (est === 'APROBADO' || est === 'PAGADO') {
                badgeEst.classList.add('bg-success', 'text-white');
                badgeEst.textContent = est;
            } else if (est === 'ANULADO' || est === 'RECHAZADO') {
                badgeEst.classList.add('bg-danger', 'text-white');
                badgeEst.textContent = est;
            } else {
                badgeEst.classList.add('bg-warning', 'text-dark');
                badgeEst.textContent = 'POR APROBAR';
            }
        }

        setTxt('det-caja-persona', item.persona || item.conductor || 'No especificado');
        setTxt('det-caja-tipo-persona', `Tipo: ${item.tipo_persona || 'PERSONA'}`);
        setTxt('det-caja-cta-destino', `Cta Destino: ${item.cuenta_bancaria_persona || 'No registrada'}`);

        setTxt('det-caja-placa-viaje', `Placa: ${item.placa || 'No asignada'} ${item.orden_viaje ? '| Viaje: ' + item.orden_viaje : ''}`);
        setTxt('det-caja-ruta', `Ruta: ${item.ruta_viaje || 'No especificada'}`);
        setTxt('det-caja-centro-costo', `Centro de Costos: ${item.centro_costo || 'General'}`);

        setTxt('det-caja-motivo', item.motivo || '—');
        setTxt('det-caja-submotivo', item.sub_motivo || '—');
        setTxt('det-caja-descripcion', item.descripcion || 'Sin descripción adicional');
        setTxt('det-caja-observacion', item.observacion || 'Ninguna');

        setTxt('det-caja-modalidad', item.modalidad_pago || 'TRANSFERENCIA BANCARIA');
        setTxt('det-caja-moneda-tc', `${item.moneda || 'SOLES'} (TC: ${item.tipo_cambio || '1.000'})`);
        setTxt('det-caja-tipo-comp', item.tipo_comprobante || 'SIN COMPROBANTE');
        setTxt('det-caja-cta-empresa', item.cuenta_bancaria_empresa || 'Caja Efectivo / Por definir');
        setTxt('det-caja-monto-total', formatearMoneda(item.importe_total, item.moneda));

        setTxt('det-caja-usuario-reg', item.usuario_creacion || 'Sistema');
        setTxt('det-caja-usuario-aprob', item.usuario_aprobacion || 'En espera');
        setTxt('det-caja-fecha-aprob', item.fecha_aprobacion ? formatearFecha(item.fecha_aprobacion) : 'Pendiente');

        // Documentos Adjuntos
        const adjWrap = document.getElementById('det-caja-adjuntos-wrap');
        if (adjWrap) {
            let adjHtml = '';
            if (item.voucher_url) {
                adjHtml += `
                    <div class="col-12 col-md-6">
                        <div class="p-3 rounded-3 bg-light border text-center">
                            <div class="fw-bold small text-secondary mb-2"><i class="bi bi-receipt me-1"></i> Voucher de Pago</div>
                            <a href="${item.voucher_url}" target="_blank" class="btn btn-sm btn-outline-primary rounded-3 px-3">
                                <i class="bi bi-box-arrow-up-right me-1"></i> Ver Voucher Completo
                            </a>
                        </div>
                    </div>
                `;
            }
            if (item.sustento_url) {
                adjHtml += `
                    <div class="col-12 col-md-6">
                        <div class="p-3 rounded-3 bg-light border text-center">
                            <div class="fw-bold small text-secondary mb-2"><i class="bi bi-file-earmark-pdf me-1"></i> Documento de Sustento</div>
                            <a href="${item.sustento_url}" target="_blank" class="btn btn-sm btn-outline-primary rounded-3 px-3">
                                <i class="bi bi-box-arrow-up-right me-1"></i> Ver Sustento Adjunto
                            </a>
                        </div>
                    </div>
                `;
            }
            if (!adjHtml) {
                adjHtml = '<div class="col-12"><div class="p-3 rounded-3 bg-light border text-center text-muted small"><i class="bi bi-paperclip me-1"></i> No se adjuntaron comprobantes ni vouchers en este registro.</div></div>';
            }
            adjWrap.innerHTML = adjHtml;
        }

        // Acciones en el modal
        const actionsDiv = document.getElementById('det-caja-modal-actions');
        if (actionsDiv) {
            const est = (item.estado || 'REGISTRADO').toUpperCase();
            if (est === 'ANULADO' || est === 'RECHAZADO') {
                actionsDiv.style.display = 'none';
            } else {
                actionsDiv.style.display = 'flex';
            }
        }

        const modalEl = document.getElementById('modalDetalleCaja');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    };

    // ── Preparar Aprobación ─────────────────────────────────────────
    window.prepararAprobarCaja = function(id) {
        const item = (window._gerenciaCaja.cajas || []).find(c => c.id == id);
        if (!item) return;
        window._gerenciaCaja.cajaSeleccionada = item;
        window.abrirModalAutorizarCaja();
    };

    window.abrirModalAutorizarCaja = function() {
        const item = window._gerenciaCaja.cajaSeleccionada;
        if (!item) return;

        const num = `${item.serie || ''}-${item.numero || ''}`;
        const setTxt = (elId, val) => { const el = document.getElementById(elId); if (el) el.textContent = val; };
        setTxt('modal-caja-autorizar-codigo', `CAJA-${num}`);
        setTxt('modal-caja-autorizar-monto', formatearMoneda(item.importe_total, item.moneda));
        setTxt('modal-caja-autorizar-beneficiario', `Beneficiario: ${item.persona || item.conductor || '—'}`);

        const chk = document.getElementById('modal-caja-check-autorizar');
        if (chk) chk.checked = false;

        const modalEl = document.getElementById('modalAutorizarCaja');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    };

    window.confirmarAprobacionCaja = async function() {
        const item = window._gerenciaCaja.cajaSeleccionada;
        if (!item) return;

        const chk = document.getElementById('modal-caja-check-autorizar');
        if (chk && !chk.checked) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'warning', title: 'Confirmación requerida', text: 'Marque la casilla para confirmar la aprobación de esta caja.' });
            } else {
                alert('Por favor, marque la casilla para confirmar la aprobación de esta caja.');
            }
            return;
        }

        const btn = document.getElementById('btn-submit-aprobar-caja');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Aprobando...';
        }

        const usuarioActual = obtenerUsuarioActual();

        try {
            const resp = await fetch(`/api/tesoreria/caja/${item.id}/aprobar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario_aprobacion: usuarioActual })
            });
            const res = await resp.json();

            if (res.ok) {
                // Cerrar modales
                const mAut = bootstrap.Modal.getInstance(document.getElementById('modalAutorizarCaja'));
                if (mAut) mAut.hide();
                const mDet = bootstrap.Modal.getInstance(document.getElementById('modalDetalleCaja'));
                if (mDet) mDet.hide();

                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: '¡Caja Aprobada!',
                        text: `El movimiento CAJA-${item.serie}-${item.numero} ha sido aprobado con éxito por ${usuarioActual}.`,
                        timer: 2500,
                        showConfirmButton: false
                    });
                } else {
                    alert(`¡Caja CAJA-${item.serie}-${item.numero} aprobada exitosamente por ${usuarioActual}!`);
                }

                await window.recargarAprobacionesCaja();
            } else {
                alert('Error al aprobar caja: ' + (res.error || 'No se pudo completar la operación'));
            }
        } catch(err) {
            console.error('Error aprobando caja:', err);
            alert('Error de conexión: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Aprobar Ahora!';
            }
        }
    };

    // ── Preparar Anulación ──────────────────────────────────────────
    window.prepararAnularCaja = function(id) {
        const item = (window._gerenciaCaja.cajas || []).find(c => c.id == id);
        if (!item) return;
        window._gerenciaCaja.cajaSeleccionada = item;
        window.abrirModalAnularCaja();
    };

    window.abrirModalAnularCaja = function() {
        const item = window._gerenciaCaja.cajaSeleccionada;
        if (!item) return;

        const num = `${item.serie || ''}-${item.numero || ''}`;
        const sub = document.getElementById('modal-anular-caja-subtitulo');
        if (sub) sub.textContent = `Caja: CAJA-${num} (${formatearMoneda(item.importe_total, item.moneda)})`;

        const txt = document.getElementById('modal-anular-caja-motivo');
        if (txt) txt.value = '';

        const modalEl = document.getElementById('modalAnularCaja');
        if (modalEl) {
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }
    };

    window.confirmarAnulacionCaja = async function() {
        const item = window._gerenciaCaja.cajaSeleccionada;
        if (!item) return;

        const motivo = (document.getElementById('modal-anular-caja-motivo')?.value || '').trim();
        if (!motivo) {
            alert('Por favor ingrese el motivo de la anulación.');
            return;
        }

        const btn = document.getElementById('btn-submit-anular-caja');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Anulando...';
        }

        const usuarioActual = obtenerUsuarioActual();

        try {
            const resp = await fetch(`/api/tesoreria/caja/${item.id}/anular`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    motivo: motivo,
                    usuario_anulacion: usuarioActual
                })
            });
            const res = await resp.json();

            if (res.ok) {
                const mAnul = bootstrap.Modal.getInstance(document.getElementById('modalAnularCaja'));
                if (mAnul) mAnul.hide();
                const mDet = bootstrap.Modal.getInstance(document.getElementById('modalDetalleCaja'));
                if (mDet) mDet.hide();

                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'info',
                        title: 'Caja Anulada',
                        text: `El movimiento CAJA-${item.serie}-${item.numero} ha sido anulado correctamente.`,
                        timer: 2500,
                        showConfirmButton: false
                    });
                } else {
                    alert(`¡Caja CAJA-${item.serie}-${item.numero} anulada correctamente!`);
                }

                await window.recargarAprobacionesCaja();
            } else {
                alert('Error al anular caja: ' + (res.error || 'No se pudo anular'));
            }
        } catch(err) {
            console.error('Error anulando caja:', err);
            alert('Error de conexión: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Confirmar Anulación';
            }
        }
    };

    // Auto-inicializar al montar la vista
    window.recargarAprobacionesCaja();

})();
