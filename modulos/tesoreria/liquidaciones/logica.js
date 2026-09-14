// ================================================================
// MÓDULO TESORERÍA / LIQUIDACIONES — Lógica SPA
// ERP Azkell
// ================================================================

window._tliqViajesData = [];

// Inicialización del módulo
window.init_liquidaciones = function() {
    window.tliqCargarViajes();
};

// Cargar viajes con estado de liquidación
window.tliqCargarViajes = async function() {
    var tbody = document.getElementById('tliq-tbody-viajes');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="10" class="text-center py-5 text-muted">
                <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                Cargando estado de liquidaciones por viaje...
            </td>
        </tr>
    `;

    var q = (document.getElementById('tliq-filtro-buscar')?.value || '').trim();
    var est = document.getElementById('tliq-filtro-estado')?.value || 'TODOS';

    try {
        var url = `/api/tesoreria/liquidaciones-gastos?limit=100`;
        if (q) url += `&q=${encodeURIComponent(q)}`;
        if (est !== 'TODOS') url += `&estado_balance=${encodeURIComponent(est)}`;

        var res = await fetch(url);
        var json = await res.json();

        var lista = (json && json.ok && Array.isArray(json.data)) ? json.data : [];
        window._tliqViajesData = lista;

        if (lista.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center py-5 text-muted">
                        <i class="bi bi-inbox fs-4 d-block mb-2 text-secondary"></i>
                        No se encontraron viajes con los filtros seleccionados.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = lista.map((v, i) => {
            var totalDep = parseFloat(v.total_depositado || 0);
            var totalRen = parseFloat(v.total_rendido || 0);
            var diff = parseFloat(v.saldo_diferencia || 0);

            var badgeBal = '';
            if (v.estado_balance === 'CUADRADO') {
                badgeBal = '<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1"><i class="bi bi-check-circle-fill me-1"></i>Cuadrado</span>';
            } else if (v.estado_balance === 'SALDO_EMPRESA') {
                badgeBal = '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1"><i class="bi bi-arrow-down-left me-1"></i>Sobrante Conductor</span>';
            } else {
                badgeBal = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1"><i class="bi bi-arrow-up-right me-1"></i>Reembolso Pendiente</span>';
            }

            var diffColor = diff === 0 ? 'text-success' : (diff > 0 ? 'text-warning-emphasis' : 'text-danger');
            var diffSign = diff > 0 ? '+' : '';

            var placaStr = v.placa_tracto || '—';
            if (v.placa_remolque) placaStr += ` / ${v.placa_remolque}`;

            return `
                <tr class="align-middle">
                    <td class="ps-3 font-monospace fw-bold text-primary">${v.viaje}</td>
                    <td class="font-monospace text-secondary">${v.fecha || '—'}</td>
                    <td class="fw-semibold text-dark">${v.conductor || '—'}</td>
                    <td><span class="badge bg-light text-secondary border font-monospace">${placaStr}</span></td>
                    <td class="text-muted small text-truncate" style="max-width: 180px;" title="${v.ruta || ''}">${v.ruta || '—'}</td>
                    <td class="text-end font-monospace fw-semibold">S/ ${totalDep.toFixed(2)}</td>
                    <td class="text-end font-monospace fw-semibold">S/ ${totalRen.toFixed(2)}</td>
                    <td class="text-end font-monospace fw-bold ${diffColor}">${diffSign}S/ ${diff.toFixed(2)}</td>
                    <td>${badgeBal}</td>
                    <td class="text-center pe-3">
                        <button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3 py-0.5 fw-bold shadow-sm" onclick="window.tliqAbrirModalDetalle('${v.viaje}')">
                            <i class="bi bi-eye-fill me-1"></i> Auditar
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('Error cargando liquidaciones en tesorería:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-5 text-danger">
                    <i class="bi bi-exclamation-triangle fs-4 d-block mb-2"></i>
                    Ocurrió un error al cargar las liquidaciones: ${err.message}
                </td>
            </tr>
        `;
    }
};

// Abrir modal de detalle y auditoría para un viaje
window.tliqAbrirModalDetalle = async function(viajeCode) {
    var modalEl = document.getElementById('tliqModalDetalle');
    if (!modalEl) return;

    var title = document.getElementById('tliq-modal-title');
    var subtitle = document.getElementById('tliq-modal-subtitle');
    var body = document.getElementById('tliq-modal-body');

    if (title) title.textContent = `Liquidación del Viaje: ${viajeCode}`;
    if (subtitle) subtitle.textContent = 'Cargando depósitos, comprobantes y balance en tiempo real...';

    body.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-success mb-2" role="status"></div>
            <p class="text-muted">Obteniendo depósitos de caja y sustentos rendidos...</p>
        </div>
    `;

    var bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();

    try {
        var res = await fetch(`/api/tesoreria/liquidaciones-gastos?orden_viaje=${encodeURIComponent(viajeCode)}`);
        var json = await res.json();

        if (!json || !json.ok) {
            body.innerHTML = `<div class="alert alert-danger">No se pudo cargar la información del viaje ${viajeCode}</div>`;
            return;
        }

        var totalDep = parseFloat(json.total_depositado || 0);
        var totalRen = parseFloat(json.total_rendido || 0);
        var saldo = parseFloat(json.saldo_diferencia || 0);
        var gastos = json.gastos || [];

        // Traer cajas para mostrar vouchers
        var resCajas = await fetch(`/api/tesoreria/caja?orden_viaje=${encodeURIComponent(viajeCode)}`);
        var jsonCajas = await resCajas.json();
        var cajas = (jsonCajas && jsonCajas.ok && Array.isArray(jsonCajas.data)) ? jsonCajas.data : [];

        var conductor = cajas[0]?.conductor || cajas[0]?.persona || 'Conductor asignado';
        if (subtitle) subtitle.textContent = `Conductor: ${conductor} | Estado: ${json.estado_balance}`;

        var bannerCompHtml = '';
        if (saldo > 0) {
            bannerCompHtml = `
                <div class="alert alert-warning border-0 rounded-3 mb-3 d-flex align-items-center justify-content-between py-2 px-3">
                    <div class="d-flex align-items-center gap-2">
                        <i class="bi bi-cash-coin fs-5 text-warning"></i>
                        <span style="font-size:0.83rem;">
                            <strong>Sobrante de Viáticos:</strong> El conductor tiene un saldo a favor de la empresa por <strong>S/ ${saldo.toFixed(2)}</strong>.
                        </span>
                    </div>
                    <button type="button" class="btn btn-sm btn-warning text-dark fw-bold px-3 py-1 shadow-sm" onclick="window.tliqGenerarCompensacion('${viajeCode}', 'DEVOLUCION_EMPRESA', ${saldo}, '${conductor}')">
                        Generar Caja de Ingreso (Devolución)
                    </button>
                </div>
            `;
        } else if (saldo < 0) {
            var absS = Math.abs(saldo);
            bannerCompHtml = `
                <div class="alert alert-danger border-0 rounded-3 mb-3 d-flex align-items-center justify-content-between py-2 px-3">
                    <div class="d-flex align-items-center gap-2">
                        <i class="bi bi-arrow-down-left-circle-fill fs-5 text-danger"></i>
                        <span style="font-size:0.83rem;">
                            <strong>Gasto en Exceso:</strong> El conductor gastó <strong>S/ ${absS.toFixed(2)}</strong> de más que requiere reembolso.
                        </span>
                    </div>
                    <button type="button" class="btn btn-sm btn-danger fw-bold px-3 py-1 shadow-sm" onclick="window.tliqGenerarCompensacion('${viajeCode}', 'REEMBOLSO_CONDUCTOR', ${absS}, '${conductor}')">
                        Generar Caja de Reembolso (Egreso)
                    </button>
                </div>
            `;
        }

        var htmlCajasRows = cajas.length ? cajas.map(c => {
            var vUrl = c.voucher_view_url || c.voucher_url;
            var linkVoucher = vUrl ? `<a href="${vUrl}" target="_blank" class="text-danger fw-bold text-decoration-none"><i class="bi bi-file-earmark-arrow-down-fill"></i> Ver</a>` : '—';
            return `
                <tr>
                    <td class="font-monospace fw-bold text-primary">${c.serie}-${c.numero}</td>
                    <td class="font-monospace text-secondary">${c.fecha || ''}</td>
                    <td><span class="badge bg-light text-dark border">${c.motivo || ''}</span></td>
                    <td class="text-muted small">${c.sub_motivo || ''}</td>
                    <td class="font-monospace fw-bold text-end">S/ ${parseFloat(c.importe_total || 0).toFixed(2)}</td>
                    <td class="text-center">${linkVoucher}</td>
                    <td><span class="badge bg-${c.estado === 'PROCESADO' ? 'success' : 'warning'}-subtle text-${c.estado === 'PROCESADO' ? 'success' : 'dark'} border">${c.estado || 'PENDIENTE'}</span></td>
                </tr>
            `;
        }).join('') : '<tr><td colspan="7" class="text-center py-3 text-muted">No se registran cajas asignadas</td></tr>';

        var htmlGastosRows = gastos.length ? gastos.map((g, idx) => {
            var sUrl = g.sustento_view_url || g.sustento_url;
            var linkSustento = sUrl ? `<a href="${sUrl}" target="_blank" class="text-danger fw-bold text-decoration-none"><i class="bi bi-paperclip"></i> Ver</a>` : '—';
            return `
                <tr>
                    <td class="text-secondary font-monospace">${idx + 1}</td>
                    <td class="font-monospace">${g.fecha || ''}</td>
                    <td><span class="badge bg-light text-dark border">${g.tipo_gasto}</span></td>
                    <td class="text-muted small">${g.sub_motivo || '—'}</td>
                    <td class="font-monospace small">${g.tipo_comprobante} ${g.numero || ''}</td>
                    <td class="text-truncate" style="max-width:130px;">${g.proveedor_nombre || '—'}</td>
                    <td class="text-muted small text-truncate" style="max-width:140px;">${g.detalle || '—'}</td>
                    <td class="text-center">${linkSustento}</td>
                    <td class="font-monospace fw-bold text-end">S/ ${parseFloat(g.importe || 0).toFixed(2)}</td>
                </tr>
            `;
        }).join('') : '<tr><td colspan="9" class="text-center py-3 text-muted">No se registran gastos rendidos</td></tr>';

        body.innerHTML = `
            <!-- Bento Tiles -->
            <div class="row g-3 mb-3">
                <div class="col-md-4">
                    <div class="p-3 border rounded-3 bg-light d-flex align-items-center justify-content-between">
                        <div>
                            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Total Entregado (Cajas)</span>
                            <span class="fs-5 fw-bold font-monospace text-primary">S/ ${totalDep.toFixed(2)}</span>
                        </div>
                        <div class="rounded-circle bg-primary bg-opacity-10 text-primary p-2"><i class="bi bi-box-arrow-up-right fs-5"></i></div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="p-3 border rounded-3 bg-light d-flex align-items-center justify-content-between">
                        <div>
                            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Total Rendido (Comprobantes)</span>
                            <span class="fs-5 fw-bold font-monospace text-dark">S/ ${totalRen.toFixed(2)}</span>
                        </div>
                        <div class="rounded-circle bg-dark bg-opacity-10 text-dark p-2"><i class="bi bi-receipt fs-5"></i></div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="p-3 border rounded-3 bg-light d-flex align-items-center justify-content-between">
                        <div>
                            <span class="text-muted small fw-bold text-uppercase d-block mb-1">Saldo / Diferencia</span>
                            <span class="fs-5 fw-bold font-monospace ${saldo === 0 ? 'text-success' : (saldo > 0 ? 'text-warning-emphasis' : 'text-danger')}">
                                ${saldo > 0 ? '+' : ''}S/ ${saldo.toFixed(2)}
                            </span>
                        </div>
                        <div class="rounded-circle bg-${saldo === 0 ? 'success' : (saldo > 0 ? 'warning' : 'danger')} bg-opacity-10 text-${saldo === 0 ? 'success' : (saldo > 0 ? 'warning' : 'danger')} p-2">
                            <i class="bi bi-calculator-fill fs-5"></i>
                        </div>
                    </div>
                </div>
            </div>

            ${bannerCompHtml}

            <!-- Tabla 1: Cajas Asignadas -->
            <div class="mb-4">
                <h6 class="fw-bold text-dark mb-2"><i class="bi bi-cash-stack text-success me-1"></i> Cajas y Depósitos Asignados desde Tesorería</h6>
                <div class="table-responsive border rounded-3">
                    <table class="table table-sm table-hover align-middle mb-0" style="font-size:0.78rem;">
                        <thead class="table-light">
                            <tr>
                                <th>Caja</th>
                                <th>Fecha</th>
                                <th>Motivo</th>
                                <th>Submotivo</th>
                                <th class="text-end">Importe</th>
                                <th class="text-center">Voucher Depósito</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>${htmlCajasRows}</tbody>
                    </table>
                </div>
            </div>

            <!-- Tabla 2: Gastos Rendidos -->
            <div>
                <h6 class="fw-bold text-dark mb-2"><i class="bi bi-receipt-cutoff text-primary me-1"></i> Comprobantes y Gastos Rendidos por Conductor</h6>
                <div class="table-responsive border rounded-3">
                    <table class="table table-sm table-hover align-middle mb-0" style="font-size:0.78rem;">
                        <thead class="table-light">
                            <tr>
                                <th>#</th>
                                <th>Fecha</th>
                                <th>Tipo Gasto</th>
                                <th>Submotivo</th>
                                <th>Comprobante</th>
                                <th>Proveedor</th>
                                <th>Detalle</th>
                                <th class="text-center">Sustento</th>
                                <th class="text-end">Importe</th>
                            </tr>
                        </thead>
                        <tbody>${htmlGastosRows}</tbody>
                    </table>
                </div>
            </div>
        `;

    } catch (err) {
        console.error('Error abriendo modal auditoría:', err);
        body.innerHTML = `<div class="alert alert-danger">Error al cargar detalle: ${err.message}</div>`;
    }
};

// Generar compensación desde tesorería
window._tliqCompPendiente = null;

window.tliqGenerarCompensacion = function(viajeCode, tipoComp, monto, conductor) {
    window._tliqCompPendiente = { viajeCode, tipoComp, monto, conductor };

    var modalEl = document.getElementById('tliqModalCompensacion');
    if (!modalEl) return;

    var lblMonto = document.getElementById('tliq-comp-monto-label');
    var lblTipo = document.getElementById('tliq-comp-tipo-label');
    var bDev = document.getElementById('tliq-comp-bloque-devolucion');
    var bReemb = document.getElementById('tliq-comp-bloque-reembolso');

    if (lblMonto) lblMonto.textContent = `S/ ${parseFloat(monto).toFixed(2)}`;

    if (tipoComp === 'DEVOLUCION_EMPRESA') {
        if (lblTipo) {
            lblTipo.textContent = 'DEVOLUCIÓN A FAVOR DE EMPRESA';
            lblTipo.className = 'badge bg-warning text-dark fw-bold px-2 py-1';
        }
        if (bDev) bDev.classList.remove('d-none');
        if (bReemb) bReemb.classList.add('d-none');
    } else {
        if (lblTipo) {
            lblTipo.textContent = 'REEMBOLSO AL CONDUCTOR';
            lblTipo.className = 'badge bg-danger text-white fw-bold px-2 py-1';
        }
        if (bDev) bDev.classList.add('d-none');
        if (bReemb) bReemb.classList.remove('d-none');
    }

    var bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();
};

window.tliqConfirmarCajaCompensacion = async function() {
    if (!window._tliqCompPendiente) return;
    var p = window._tliqCompPendiente;

    var destino = 'CAJA_PRINCIPAL';
    if (p.tipoComp === 'DEVOLUCION_EMPRESA') {
        var opt = document.querySelector('input[name="tliq_destino_dev"]:checked');
        if (opt) destino = opt.value;
    } else {
        var optR = document.querySelector('input[name="tliq_destino_reemb"]:checked');
        if (optR) destino = optR.value;
    }

    var btnConfirm = document.getElementById('tliq-btn-confirmar-compensacion');
    if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Procesando...';
    }

    try {
        var userActual = (typeof window.usuarioLogueado !== 'undefined' && window.usuarioLogueado) || localStorage.getItem('fleet_user') || 'TESORERIA';

        var res = await fetch('/api/tesoreria/liquidaciones-gastos/generar-caja-compensacion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orden_viaje: p.viajeCode,
                tipo_compensacion: p.tipoComp,
                destino_devolucion: destino,
                importe: p.monto,
                conductor: p.conductor,
                usuario_creacion: userActual,
                descripcion: `Compensación automática liquidación viaje ${p.viajeCode} [Destino: ${destino}]`
            })
        });
        var json = await res.json();

        if (json && json.ok) {
            alert(json.message || 'Caja de compensación generada con éxito.');
            var modalEl = document.getElementById('tliqModalCompensacion');
            var bsModal = bootstrap.Modal.getInstance(modalEl);
            if (bsModal) bsModal.hide();

            window.tliqAbrirModalDetalle(p.viajeCode);
            window.tliqCargarViajes();
        } else {
            alert(json.error || 'Error al generar caja');
        }
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        if (btnConfirm) {
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Generar Registro de Caja';
        }
    }
};
