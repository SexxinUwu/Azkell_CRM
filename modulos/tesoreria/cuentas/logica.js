// ================================================================
// MÓDULO TESORERÍA / CUENTAS POR COBRAR Y PAGAR — Lógica SPA
// ================================================================

window._cuentasData = window._cuentasData || [];
window._cuentasFiltradas = window._cuentasFiltradas || [];

window.init_tesoreria_cuentas = function() {
    console.log('Inicializando módulo Cuentas por Cobrar y Pagar...');
    window.cargarCuentas();
};

window.cargarCuentas = function() {
    var tbody = document.getElementById('cuentas-tbody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="28" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm me-2 text-primary"></div> Cargando datos de Tesorería...</td></tr>';
    }

    fetch('/api/tesoreria/cuentas')
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function(res) {
            window._cuentasData = res.data || [];
            window.filtrarCuentas();
        })
        .catch(function(err) {
            console.error('Error al cargar cuentas:', err);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="28" class="text-center py-5 text-danger"><i class="bi bi-exclamation-triangle me-2"></i> Error al cargar datos: ' + err.message + '</td></tr>';
            }
        });
};

function _fmtMoney(val) {
    if (val == null || val === '') return '0.00';
    var num = parseFloat(val);
    if (isNaN(num)) return '0.00';
    return num.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _fmtDate(val) {
    if (!val) return '—';
    var str = String(val).split('T')[0];
    var parts = str.split('-');
    if (parts.length === 3) {
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    return str;
}

window.filtrarCuentas = function() {
    var buscar = ((document.getElementById('cuentas-buscar') || {}).value || '').toLowerCase().trim();
    var estado = ((document.getElementById('cuentas-filtro-estado') || {}).value || 'TODOS').toUpperCase();
    var mes = ((document.getElementById('cuentas-filtro-mes') || {}).value || 'TODOS').toUpperCase();

    window._cuentasFiltradas = (window._cuentasData || []).filter(function(item) {
        var matchB = !buscar ||
            (item.codigo_liquidacion || '').toLowerCase().includes(buscar) ||
            (item.numero_viaje || '').toLowerCase().includes(buscar) ||
            (item.razon_social || '').toLowerCase().includes(buscar) ||
            (item.placa_camion || '').toLowerCase().includes(buscar) ||
            (item.placa_carreta || '').toLowerCase().includes(buscar) ||
            (item.conductor || '').toLowerCase().includes(buscar) ||
            (item.cliente || '').toLowerCase().includes(buscar) ||
            (item.lugar || '').toLowerCase().includes(buscar) ||
            (item.serie || '').toLowerCase().includes(buscar) ||
            (item.factura || '').toLowerCase().includes(buscar) ||
            (item.observacion || '').toLowerCase().includes(buscar);

        var matchE = (estado === 'TODOS') || ((item.estado_servicio || '').toUpperCase() === estado);
        var matchM = (mes === 'TODOS') || ((item.mes_facturacion || '').toUpperCase() === mes);

        return matchB && matchE && matchM;
    });

    window._cuentasRenderKPIs(window._cuentasFiltradas);
    window._cuentasRenderTabla(window._cuentasFiltradas);
};

window.filtrarPorEstado = function(est) {
    var sel = document.getElementById('cuentas-filtro-estado');
    if (sel) {
        sel.value = est;
        window.filtrarCuentas();
    }
};

window._cuentasRenderKPIs = function(dataFiltrada) {
    var list = dataFiltrada || [];

    var totalFacturado = 0;
    var netoPendiente = 0;
    var totalPagado = 0;

    list.forEach(function(item) {
        var total = parseFloat(item.total) || 0;
        var neto = parseFloat(item.neto_cobrar) || 0;
        var est = (item.estado_servicio || '').toUpperCase();

        if (est !== 'ANULADO') {
            totalFacturado += total;
        }
        if (est === 'PAGADO') {
            totalPagado += (neto > 0 ? neto : total);
        } else if (est === 'PENDIENTE') {
            netoPendiente += (neto > 0 ? neto : total);
        }
    });

    var setEl = function(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setEl('kpi-total-facturado', 'S/ ' + _fmtMoney(totalFacturado));
    setEl('kpi-neto-pendiente', 'S/ ' + _fmtMoney(netoPendiente));
    setEl('kpi-total-pagado', 'S/ ' + _fmtMoney(totalPagado));
    setEl('kpi-conteo-registros', list.length + ' Registros');

    var contFilas = document.getElementById('cuentas-contador-filas');
    if (contFilas) contFilas.textContent = list.length + ' fila' + (list.length !== 1 ? 's' : '');
};

window._cuentasRenderTabla = function(data) {
    var tbody = document.getElementById('cuentas-tbody');
    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="30" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-2 d-block mb-2"></i>No se encontraron registros de cuentas con los filtros seleccionados.</td></tr>';
        return;
    }

    var html = data.map(function(item) {
        var est = (item.estado_servicio || 'PENDIENTE').toUpperCase();
        var esPagado = (est === 'PAGADO');
        var badgeClass = esPagado ? 'pagado' : (est === 'ANULADO' ? 'anulado' : 'pendiente');

        // 1. Sustento de Liquidación (Orden / Liquidación manual del flete)
        var sustentoLiqHtml = '<span class="text-muted small">—</span>';
        if (item.documento_view_url) {
            sustentoLiqHtml = '<a href="' + item.documento_view_url + '" target="_blank" rel="noopener noreferrer" class="fw-bold text-danger text-decoration-underline" style="font-size:0.8rem; cursor:pointer;" title="Abrir Sustento de Liquidación en nueva pestaña">VER</a>';
        }

        // 2. Sustento de Factura Activa (PDF o Imagen de Factura)
        var sustentoFacturaHtml = '<span class="text-muted small">—</span>';
        if (item.factura_documento_view_url) {
            sustentoFacturaHtml = '<a href="' + item.factura_documento_view_url + '" target="_blank" rel="noopener noreferrer" class="fw-bold text-danger text-decoration-underline" style="font-size:0.8rem; cursor:pointer;" title="Abrir Factura en nueva pestaña">VER</a>';
        } else if (item.factura && item.factura !== '—') {
            sustentoFacturaHtml = '<span class="badge bg-secondary-subtle text-secondary" style="font-size:0.7rem;">Sin PDF</span>';
        }

        // 3. Sustento de Pago / Constancia de Depósito
        var sustentoPagoHtml = '<span class="text-muted small">—</span>';
        if (item.sustento_pago_view_url) {
            sustentoPagoHtml = '<a href="' + item.sustento_pago_view_url + '" target="_blank" rel="noopener noreferrer" class="fw-bold text-danger text-decoration-underline" style="font-size:0.8rem; cursor:pointer;" title="Abrir Constancia o Sustento de Pago en nueva pestaña">VER</a>';
        }

        var iconEstado = esPagado ? '<i class="bi bi-check-circle-fill"></i> ' : (est === 'ANULADO' ? '<i class="bi bi-x-circle-fill"></i> ' : '<i class="bi bi-clock-fill"></i> ');

        // Badge plano no interactivo
        var btnEstadoHtml = '<span class="badge-estado ' + badgeClass + '">' +
            iconEstado + est +
        '</span>';

        // Determinar si tiene factura para permitir emitir Nota de Crédito
        var tieneFactura = !!(item.serie && item.factura);

        // Menú de 3 puntos (Dropdown con data-bs-strategy="fixed" para sobreponerse a todo)
        var accionesHtml = '<div class="dropdown d-inline-block">' +
            '<button class="btn btn-action-dots" type="button" data-bs-toggle="dropdown" data-bs-strategy="fixed" aria-expanded="false" title="Acciones">' +
                '<i class="bi bi-three-dots-vertical"></i>' +
            '</button>' +
            '<ul class="dropdown-menu dropdown-menu-actions shadow">' +
                '<li>' +
                    (esPagado ? 
                        '<span class="dropdown-item disabled text-muted" title="Bloqueado: Registro ya Pagado"><i class="bi bi-pencil me-1"></i> Editar (Bloqueado)</span>' :
                        '<a class="dropdown-item" href="javascript:void(0)" onclick="window.abrirEditarRegistro(' + item.id + ')"><i class="bi bi-pencil text-primary me-1"></i> Editar</a>'
                    ) +
                '</li>' +
                '<li>' +
                    '<a class="dropdown-item text-success fw-bold" href="javascript:void(0)" onclick="window.abrirModalRegistrarPago(' + item.id + ')">' +
                        '<i class="bi bi-credit-card-2-front text-success me-1"></i> ' + (esPagado ? 'Ver / Subir Sustento' : 'Registrar Pago / Sustento') +
                    '</a>' +
                '</li>' +
                '<li><hr class="dropdown-divider my-1"></li>' +
                '<li>' +
                    (tieneFactura ?
                        '<a class="dropdown-item text-danger fw-bold" href="javascript:void(0)" onclick="window.abrirModalCambiarFacturaNC(' + item.id + ')"><i class="bi bi-arrow-repeat text-danger me-1"></i> Cambiar Factura (Emitir NC)</a>' :
                        '<span class="dropdown-item disabled text-muted" title="Requiere factura para emitir NC"><i class="bi bi-arrow-repeat me-1"></i> Cambiar Factura (Sin Factura)</span>'
                    ) +
                '</li>' +
                '<li>' +
                    '<a class="dropdown-item text-secondary" href="javascript:void(0)" onclick="window.abrirModalHistorialFacturasNC(' + item.id + ')"><i class="bi bi-clock-history me-1"></i> Ver Historial NC</a>' +
                '</li>' +
                '<li><hr class="dropdown-divider my-1"></li>' +
                '<li>' +
                    (esPagado ? 
                        '<span class="dropdown-item disabled text-muted" title="Bloqueado: Registro ya Pagado"><i class="bi bi-trash me-1"></i> Eliminar (Bloqueado)</span>' :
                        '<a class="dropdown-item text-danger" href="javascript:void(0)" onclick="window.eliminarCuenta(' + item.id + ')"><i class="bi bi-trash text-danger me-1"></i> Eliminar</a>'
                    ) +
                '</li>' +
            '</ul>' +
        '</div>';

        // Cálculo de Neto Cobrado y Diferencia
        var netoCobrar = parseFloat(item.neto_cobrar) || 0;
        var netoCobrado = item.neto_cobrado != null ? parseFloat(item.neto_cobrado) : null;
        
        // Si hay neto cobrado registrado, calcular diferencia = cobrado - debido; si no, usar item.diferencia
        var diff = (netoCobrado != null) ? (netoCobrado - netoCobrar) : (parseFloat(item.diferencia) || 0);
        
        var diffClass = 'text-muted';
        var diffSign = '';
        if (diff < 0) {
            diffClass = 'text-danger fw-bold';
        } else if (diff > 0) {
            diffClass = 'text-success fw-bold';
            diffSign = '+';
        } else if (diff === 0 && (esPagado || netoCobrado != null)) {
            diffClass = 'text-success fw-semibold';
        }

        var netoCobradoHtml = (netoCobrado != null) ? 
            ('<span class="fw-bold text-dark">' + _fmtMoney(netoCobrado) + '</span>') : 
            '<span class="text-muted small">—</span>';

        // Detalle de Nota de Crédito en Factura si aplica
        var facturaHtml = (item.factura || '—');
        if (item.nota_credito) {
            facturaHtml += ' <span class="badge bg-danger-subtle text-danger border border-danger-subtle ms-1" style="font-size:0.65rem;" title="Rectificada con NC: ' + item.nota_credito + '">NC</span>';
        }

        return '<tr>' +
            '<td class="col-sticky-action text-center">' + accionesHtml + '</td>' +
            '<td><span class="badge bg-primary-subtle text-primary border border-primary-subtle fw-bold">' + (item.orden_servicio || '—') + '</span></td>' +
            '<td><span class="badge bg-light text-dark border fw-bold">' + (item.numero_viaje || '—') + '</span></td>' +
            '<td class="fw-bold text-primary">' + (item.codigo_liquidacion || '—') + '</td>' +
            '<td class="text-center">' + sustentoLiqHtml + '</td>' +
            '<td>' + _fmtDate(item.fecha_liquidacion) + '</td>' +
            '<td>' + _fmtDate(item.fecha_servicio) + '</td>' +
            '<td class="fw-bold text-dark">' + (item.razon_social || '—') + '</td>' +
            '<td><span class="badge bg-light text-dark border fw-bold">' + (item.placa_camion || '—') + '</span></td>' +
            '<td><span class="badge bg-light text-secondary border fw-bold">' + (item.placa_carreta || '—') + '</span></td>' +
            '<td>' + (item.conductor || '—') + '</td>' +
            '<td class="fw-semibold">' + (item.cliente || '—') + '</td>' +
            '<td>' + (item.lugar || '—') + '</td>' +
            '<td class="num-cell fw-semibold">' + _fmtMoney(item.flete) + '</td>' +
            '<td class="text-center"><span class="badge bg-light text-muted border">' + (item.comision_porcentaje != null ? item.comision_porcentaje : 0) + '%</span></td>' +
            '<td class="num-cell">' + _fmtMoney(item.tarifa) + '</td>' +
            '<td class="num-cell text-danger">' + _fmtMoney(item.gastos_operativos) + '</td>' +
            '<td class="num-cell">' + _fmtMoney(item.base_imponible) + '</td>' +
            '<td class="num-cell">' + _fmtMoney(item.igv) + '</td>' +
            '<td class="num-cell fw-bold text-primary">' + _fmtMoney(item.total) + '</td>' +
            '<td class="num-cell">' + _fmtMoney(item.adelanto) + '</td>' +
            '<td class="num-cell">' + _fmtMoney(item.detraccion) + '</td>' +
            '<td class="num-cell fw-bold text-success">' + _fmtMoney(item.neto_cobrar) + '</td>' +
            '<td><span class="badge bg-secondary-subtle text-secondary fw-semibold">' + (item.mes_facturacion || '—') + '</span></td>' +
            '<td>' + _fmtDate(item.fecha_factura) + '</td>' +
            '<td>' + (item.serie || '—') + '</td>' +
            '<td class="fw-bold">' + facturaHtml + '</td>' +
            '<td class="text-center">' + sustentoFacturaHtml + '</td>' +
            '<td class="text-center">' + (item.credito_dias != null ? item.credito_dias : '—') + '</td>' +
            '<td>' + _fmtDate(item.fecha_cobrar) + '</td>' +
            '<td>' + _fmtDate(item.fecha_deposito) + '</td>' +
            '<td class="text-center">' + btnEstadoHtml + '</td>' +
            '<td class="text-center">' + sustentoPagoHtml + '</td>' +
            '<td class="num-cell">' + netoCobradoHtml + '</td>' +
            '<td class="num-cell ' + diffClass + '">' + diffSign + _fmtMoney(diff) + '</td>' +
            '<td>' + (item.observacion || '') + '</td>' +
        '</tr>';
    }).join('');

    tbody.innerHTML = html;
};

// ── ALTERNAR ESTADO RÁPIDO (PENDIENTE <-> PAGADO) ─────────────────
window.toggleEstadoCuenta = function(id, estadoActual) {
    if (estadoActual === 'ANULADO') return; // Bloqueado para anulados

    var nuevoEstado = estadoActual === 'PENDIENTE' ? 'PAGADO' : 'PENDIENTE';

    // 1. Actualización optimista inmediata en memoria respetando el filtro y buscador activo
    var item = (window._cuentasData || []).find(function(c) { return c.id === id; });
    if (item) {
        item.estado_servicio = nuevoEstado;
    }
    window.filtrarCuentas();

    // 2. Persistir en la base de datos
    fetch('/api/tesoreria/cuentas/' + id + '/toggle-estado', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado_servicio: nuevoEstado })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.error) throw new Error(res.error);
    })
    .catch(function(err) {
        console.error('Error al cambiar estado:', err);
        // Revertir si falló
        if (item) {
            item.estado_servicio = estadoActual;
            window.filtrarCuentas();
        }
        alert('No se pudo actualizar el estado: ' + err.message);
    });
};

// ── BLOQUEO DE TECLAS NO NUMÉRICAS EN MÓVILES Y DESKTOP ───────────
window.bloquearNoNumerico = function(e) {
    var permittedKeys = ['Backspace', 'Tab', 'Enter', 'Escape', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (permittedKeys.indexOf(e.key) !== -1 ||
        (e.ctrlKey === true || e.metaKey === true) ||
        (e.key === '.' || e.key === ',')
    ) {
        return;
    }
    if (e.key < '0' || e.key > '9') {
        e.preventDefault();
    }
};

// ── ACTUALIZAR MES SEGÚN FECHA FACTURA ─────────────────────────────
window.actualizarFechaFacturaYMes = function() {
    var fFactura = (document.getElementById('fc-fecha-factura') || {}).value;
    var elMes = document.getElementById('fc-mes-facturacion');
    if (fFactura) {
        var meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SETIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
        var parts = fFactura.split('-');
        if (parts.length === 3) {
            var mIndex = parseInt(parts[1], 10) - 1;
            if (mIndex >= 0 && mIndex < 12 && elMes) {
                elMes.value = meses[mIndex];
            }
        }
    } else if (elMes) {
        elMes.value = '';
    }
    window.autoCalcularFechaCobro();
};

window.autoCalcularFechaCobro = function() {
    var fFactura = (document.getElementById('fc-fecha-factura') || {}).value;
    var diasStr = (document.getElementById('fc-credito-dias') || {}).value;
    var dias = diasStr !== '' ? (parseInt(diasStr, 10) || 0) : 15;
    var elCobrar = document.getElementById('fc-fecha-cobrar');
    if (fFactura && dias >= 0 && elCobrar) {
        var d = new Date(fFactura + 'T00:00:00');
        if (!isNaN(d.getTime())) {
            d.setDate(d.getDate() + dias);
            elCobrar.value = d.toISOString().split('T')[0];
            return;
        }
    }
    if (elCobrar) elCobrar.value = '';
};

// ── CRUD MODAL / FORM ──────────────────────────────────────────────
window.abrirModalNuevoRegistro = function() {
    var form = document.getElementById('form-cuenta');
    if (form) form.reset();
    document.getElementById('form-cuenta-id').value = '';
    document.getElementById('modalCuentaFormTitulo').textContent = 'Nuevo Registro de Cuenta';
    
    var docWrap = document.getElementById('fc-doc-link-wrap');
    if (docWrap) docWrap.style.display = 'none';
    var docLink = document.getElementById('fc-doc-link');
    if (docLink) docLink.href = '#';

    var fileInput = document.getElementById('fc-archivo');
    if (fileInput) fileInput.value = '';

    // Valores por defecto
    var setV = function(id, val) {
        var el = document.getElementById(id);
        if (el) el.value = val;
    };
    setV('fc-codigo-liquidacion', '');
    setV('fc-orden-servicio', '');
    setV('fc-numero-viaje', '');
    setV('fc-flete', '');
    setV('fc-comision', '0');
    setV('fc-gastos-operativos', '');
    setV('fc-adelanto', '');
    setV('fc-tarifa', '0.00');
    setV('fc-base-imponible', '0.00');
    setV('fc-igv', '0.00');
    setV('fc-total', '0.00');
    setV('fc-detraccion', '0.00');
    setV('fc-neto-cobrar', '0.00');
    setV('fc-credito-dias', '15');
    setV('fc-mes-facturacion', '');
    setV('fc-fecha-cobrar', '');

    var facWrap = document.getElementById('fc-factura-link-wrap');
    if (facWrap) facWrap.style.display = 'none';
    var fileFac = document.getElementById('fc-archivo-factura');
    if (fileFac) fileFac.value = '';

    var modal = new bootstrap.Modal(document.getElementById('modalCuentaForm'));
    modal.show();
};

window.abrirEditarRegistro = function(id) {
    var item = (window._cuentasData || []).find(function(c) { return c.id === id; });
    if (!item) return;

    if ((item.estado_servicio || '').toUpperCase() === 'PAGADO') {
        alert('Este registro se encuentra en estado PAGADO y no puede ser editado.');
        return;
    }

    var setV = function(elId, val) {
        var el = document.getElementById(elId);
        if (el) el.value = val != null ? val : '';
    };

    setV('form-cuenta-id', item.id);
    setV('fc-codigo-liquidacion', item.codigo_liquidacion);
    setV('fc-orden-servicio', item.orden_servicio);
    setV('fc-fecha-liquidacion', item.fecha_liquidacion ? item.fecha_liquidacion.split('T')[0] : '');
    setV('fc-numero-viaje', item.numero_viaje);
    setV('fc-fecha-servicio', item.fecha_servicio ? item.fecha_servicio.split('T')[0] : '');
    setV('fc-razon-social', item.razon_social);
    setV('fc-placa-camion', item.placa_camion);
    setV('fc-placa-carreta', item.placa_carreta);
    setV('fc-conductor', item.conductor);
    setV('fc-cliente', item.cliente);
    setV('fc-lugar', item.lugar);

    // Flete y Comisión (por defecto 0%)
    var comisionVal = (item.comision_porcentaje != null && item.comision_porcentaje !== '') ? item.comision_porcentaje : 0;
    setV('fc-comision', comisionVal);

    var fleteVal = item.flete;
    if ((fleteVal == null || parseFloat(fleteVal) === 0) && item.tarifa && parseFloat(item.tarifa) > 0) {
        var factor = (1 - (parseFloat(comisionVal) || 0) / 100);
        fleteVal = factor > 0 ? (parseFloat(item.tarifa) / factor).toFixed(2) : item.tarifa;
    }
    setV('fc-flete', fleteVal != null ? fleteVal : '');

    setV('fc-gastos-operativos', item.gastos_operativos);
    setV('fc-adelanto', item.adelanto);

    // Calcular valores económicos
    window.autoCalcularTotalesForm();

    setV('fc-fecha-factura', item.fecha_factura ? item.fecha_factura.split('T')[0] : '');
    setV('fc-serie', item.serie);
    setV('fc-factura', item.factura);
    setV('fc-credito-dias', item.credito_dias != null ? item.credito_dias : 15);
    setV('fc-fecha-deposito', item.fecha_deposito ? item.fecha_deposito.split('T')[0] : '');
    setV('fc-estado-servicio', item.estado_servicio || 'PENDIENTE');
    setV('fc-diferencia', item.diferencia);
    setV('fc-observacion', item.observacion);

    // Actualizar mes y fecha de cobro según fecha factura
    window.actualizarFechaFacturaYMes();
    if (item.mes_facturacion) {
        setV('fc-mes-facturacion', item.mes_facturacion);
    }
    if (item.fecha_cobrar) {
        setV('fc-fecha-cobrar', item.fecha_cobrar.split('T')[0]);
    }

    var fileInput = document.getElementById('fc-archivo');
    if (fileInput) fileInput.value = '';

    var docWrap = document.getElementById('fc-doc-link-wrap');
    var docLink = document.getElementById('fc-doc-link');
    if (item.documento_view_url && docWrap && docLink) {
        docLink.href = item.documento_view_url;
        docWrap.style.display = 'inline-block';
    } else if (docWrap) {
        docWrap.style.display = 'none';
    }

    var facWrap = document.getElementById('fc-factura-link-wrap');
    var facLink = document.getElementById('fc-factura-link');
    if (item.factura_documento_view_url && facWrap && facLink) {
        facLink.href = item.factura_documento_view_url;
        facWrap.style.display = 'inline-block';
    } else if (facWrap) {
        facWrap.style.display = 'none';
    }
    var fileFac = document.getElementById('fc-archivo-factura');
    if (fileFac) fileFac.value = '';

    document.getElementById('modalCuentaFormTitulo').textContent = 'Editar Registro (ID ' + item.id + ')';
    var modal = new bootstrap.Modal(document.getElementById('modalCuentaForm'));
    modal.show();
};

// ── CÁLCULO AUTOMÁTICO DE LIQUIDACIÓN ECONÓMICA ─────────────────────
window.autoCalcularTotalesForm = function() {
    // 1. Flete
    var flete = parseFloat(document.getElementById('fc-flete').value) || 0;

    // 2. Comisión % (por defecto 0%)
    var comisionStr = (document.getElementById('fc-comision').value || '').trim();
    var comision = comisionStr !== '' ? (parseFloat(comisionStr) || 0) : 0;

    // 3. Tarifa = Flete - (Flete * Comision / 100)
    var montoComision = flete * (comision / 100);
    var tarifa = flete - montoComision;
    if (tarifa < 0) tarifa = 0;
    var elTarifa = document.getElementById('fc-tarifa');
    if (elTarifa) elTarifa.value = tarifa.toFixed(2);

    // 4. (-) Gastos Operativos
    var gastos = parseFloat(document.getElementById('fc-gastos-operativos').value) || 0;

    // 5. Base Imponible (B.I) = Tarifa - Gastos Operativos
    var bi = tarifa - gastos;
    if (bi < 0) bi = 0;
    var elBI = document.getElementById('fc-base-imponible');
    if (elBI) elBI.value = bi.toFixed(2);

    // 6. IGV (18%) = B.I * 18%
    var igv = bi * 0.18;
    var elIGV = document.getElementById('fc-igv');
    if (elIGV) elIGV.value = igv.toFixed(2);

    // 7. Total Factura = B.I + IGV
    var total = bi + igv;
    var elTotal = document.getElementById('fc-total');
    if (elTotal) elTotal.value = total.toFixed(2);

    // 8. Adelanto
    var adelanto = parseFloat(document.getElementById('fc-adelanto').value) || 0;

    // 9. Detracción (4% redondeado al entero según normativa SUNAT SPOT)
    var detraccion = (total > 0) ? Math.round(total * 0.04) : 0;
    var elDetraccion = document.getElementById('fc-detraccion');
    if (elDetraccion) elDetraccion.value = detraccion.toFixed(2);

    // 10. Neto por Cobrar = Total - Adelanto - Detracción
    var neto = total - adelanto - detraccion;
    var elNeto = document.getElementById('fc-neto-cobrar');
    if (elNeto) elNeto.value = neto.toFixed(2);
};

window.guardarCuentaForm = function(e) {
    if (e) e.preventDefault();
    var id = document.getElementById('form-cuenta-id').value;
    var getV = function(elId) { return (document.getElementById(elId) || {}).value || ''; };

    var formData = new FormData();
    formData.append('codigo_liquidacion', getV('fc-codigo-liquidacion').trim());
    formData.append('orden_servicio', getV('fc-orden-servicio').trim());
    formData.append('fecha_liquidacion', getV('fc-fecha-liquidacion') || '');
    formData.append('numero_viaje', getV('fc-numero-viaje').trim());
    formData.append('fecha_servicio', getV('fc-fecha-servicio') || '');
    formData.append('razon_social', getV('fc-razon-social').trim());
    formData.append('placa_camion', getV('fc-placa-camion').trim().toUpperCase());
    formData.append('placa_carreta', getV('fc-placa-carreta').trim().toUpperCase());
    formData.append('conductor', getV('fc-conductor').trim());
    formData.append('cliente', getV('fc-cliente').trim());
    formData.append('lugar', getV('fc-lugar').trim());
    formData.append('flete', parseFloat(getV('fc-flete')) || 0);
    formData.append('comision_porcentaje', parseFloat(getV('fc-comision')) || 0);
    formData.append('tarifa', parseFloat(getV('fc-tarifa')) || 0);
    formData.append('gastos_operativos', parseFloat(getV('fc-gastos-operativos')) || 0);
    formData.append('base_imponible', parseFloat(getV('fc-base-imponible')) || 0);
    formData.append('igv', parseFloat(getV('fc-igv')) || 0);
    formData.append('total', parseFloat(getV('fc-total')) || 0);
    formData.append('adelanto', parseFloat(getV('fc-adelanto')) || 0);
    formData.append('detraccion', parseFloat(getV('fc-detraccion')) || 0);
    formData.append('neto_cobrar', parseFloat(getV('fc-neto-cobrar')) || 0);
    formData.append('mes_facturacion', getV('fc-mes-facturacion'));
    formData.append('fecha_factura', getV('fc-fecha-factura') || '');
    formData.append('serie', getV('fc-serie').trim());
    formData.append('factura', getV('fc-factura').trim());
    formData.append('credito_dias', parseInt(getV('fc-credito-dias'), 10) || 15);
    formData.append('fecha_cobrar', getV('fc-fecha-cobrar') || '');
    formData.append('fecha_deposito', getV('fc-fecha-deposito') || '');
    formData.append('estado_servicio', getV('fc-estado-servicio') || 'PENDIENTE');
    formData.append('diferencia', parseFloat(getV('fc-diferencia')) || 0);
    formData.append('observacion', getV('fc-observacion').trim());

    var fileInput = document.getElementById('fc-archivo');
    if (fileInput && fileInput.files && fileInput.files[0]) {
        formData.append('archivo_adjunto', fileInput.files[0]);
    }

    var fileFac = document.getElementById('fc-archivo-factura');
    if (fileFac && fileFac.files && fileFac.files[0]) {
        formData.append('archivo_factura', fileFac.files[0]);
    }

    var url = id ? ('/api/tesoreria/cuentas/' + id) : '/api/tesoreria/cuentas';
    var method = id ? 'PUT' : 'POST';

    var submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
    }

    fetch(url, {
        method: method,
        body: formData
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i> Guardar Registro';
        }
        if (res.error) throw new Error(res.error);
        var modalEl = document.getElementById('modalCuentaForm');
        var modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        window.cargarCuentas();
    })
    .catch(function(err) {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i> Guardar Registro';
        }
        alert('Error al guardar registro: ' + err.message);
    });
};

window.eliminarCuenta = function(id) {
    var item = (window._cuentasData || []).find(function(c) { return c.id === id; });
    if (item && (item.estado_servicio || '').toUpperCase() === 'PAGADO') {
        alert('Este registro se encuentra en estado PAGADO y no puede ser eliminado.');
        return;
    }

    if (!confirm('¿Está seguro de eliminar este registro de cuenta?')) return;
    fetch('/api/tesoreria/cuentas/' + id, { method: 'DELETE' })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res.error) throw new Error(res.error);
            window.cargarCuentas();
        })
        .catch(function(err) {
            alert('Error al eliminar registro: ' + err.message);
        });
};

// ── REGISTRAR PAGO / SUBIR SUSTENTO (MODAL) ────────────────────────
window.abrirModalRegistrarPago = function(id) {
    var item = (window._cuentasData || []).find(function(c) { return c.id === id; });
    if (!item) return;

    var form = document.getElementById('formRegistrarPago');
    if (form) form.reset();

    var idEl = document.getElementById('pago-input-id');
    if (idEl) idEl.value = item.id;

    var lblSub = document.getElementById('modalRegistrarPagoSubtitulo');
    if (lblSub) lblSub.textContent = 'Liquidación: ' + (item.codigo_liquidacion || 'ID ' + item.id) + ' | N° Viaje: ' + (item.numero_viaje || '—');

    var rNeto = document.getElementById('pago-resumen-neto-cobrar');
    if (rNeto) rNeto.textContent = 'S/ ' + _fmtMoney(item.neto_cobrar);

    var rCli = document.getElementById('pago-resumen-cliente');
    if (rCli) rCli.textContent = (item.cliente || item.razon_social || '—') + (item.factura ? (' (Fact: ' + (item.serie ? item.serie + '-' : '') + item.factura + ')') : '');

    var inputNeto = document.getElementById('pago-input-neto-cobrado');
    if (inputNeto) {
        // Si ya tenía neto cobrado, precargar ese valor, sino sugerir el neto_cobrar completo
        var valDefecto = (item.neto_cobrado != null && item.neto_cobrado !== '') ? item.neto_cobrado : item.neto_cobrar;
        inputNeto.value = (valDefecto != null && valDefecto !== '') ? parseFloat(valDefecto).toFixed(2) : '';
    }

    var inputFecha = document.getElementById('pago-input-fecha-deposito');
    if (inputFecha) {
        if (item.fecha_deposito) {
            inputFecha.value = item.fecha_deposito.split('T')[0];
        } else {
            inputFecha.value = new Date().toISOString().split('T')[0];
        }
    }

    // Sustento actual
    var wrapAct = document.getElementById('pago-wrap-archivo-actual');
    var linkAct = document.getElementById('pago-link-archivo-actual');
    if (item.sustento_pago_view_url && wrapAct && linkAct) {
        linkAct.href = item.sustento_pago_view_url;
        wrapAct.style.display = 'block';
    } else if (wrapAct) {
        wrapAct.style.display = 'none';
    }

    window.calcularDiferenciaPagoModal();

    var modalEl = document.getElementById('modalRegistrarPago');
    if (modalEl) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
};

window.calcularDiferenciaPagoModal = function() {
    var id = parseInt((document.getElementById('pago-input-id') || {}).value, 10);
    var item = (window._cuentasData || []).find(function(c) { return c.id === id; });
    var netoCobrar = item ? (parseFloat(item.neto_cobrar) || 0) : 0;

    var cobradoVal = parseFloat((document.getElementById('pago-input-neto-cobrado') || {}).value) || 0;
    var diff = cobradoVal - netoCobrar;

    var preview = document.getElementById('pago-preview-diferencia');
    if (preview) {
        var sign = diff > 0 ? '+' : '';
        preview.textContent = sign + 'S/ ' + _fmtMoney(diff);
        if (diff < 0) {
            preview.className = 'fw-bold text-danger';
        } else if (diff > 0) {
            preview.className = 'fw-bold text-success';
        } else {
            preview.className = 'fw-bold text-success';
        }
    }
};

window.guardarRegistroPago = async function(e) {
    if (e && e.preventDefault) e.preventDefault();

    var id = (document.getElementById('pago-input-id') || {}).value;
    if (!id) return;

    var btn = document.getElementById('pago-btn-submit');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
    }

    var formData = new FormData();
    formData.append('neto_cobrado', (document.getElementById('pago-input-neto-cobrado') || {}).value || '0');
    formData.append('fecha_deposito', (document.getElementById('pago-input-fecha-deposito') || {}).value || '');

    var fileEl = document.getElementById('pago-input-archivo');
    if (fileEl && fileEl.files && fileEl.files[0]) {
        formData.append('archivo_sustento', fileEl.files[0]);
    }

    try {
        var resp = await fetch('/api/tesoreria/cuentas/' + id + '/registrar-pago', {
            method: 'POST',
            body: formData
        });
        var res = await resp.json();
        if (res.error) throw new Error(res.error);

        var modalEl = document.getElementById('modalRegistrarPago');
        if (modalEl) {
            var modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }

        window.cargarCuentas();
    } catch(err) {
        alert('Error al registrar pago: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check2-circle fs-5"></i> Guardar y Marcar PAGADO';
        }
    }
};

// ── DESCARGA DE PLANTILLA EXCEL ────────────────────────────────────
window.descargarPlantillaExcel = function() {
    if (typeof XLSX === 'undefined') {
        alert('La librería XLSX se está cargando. Intente en unos segundos.');
        return;
    }

    var cabeceras = [
        'COD DE LIQUIDACION',
        'FECHA DE LIQUIDACION',
        'N° DE VIAJE',
        'FECHA SERVICIO',
        'RAZON SOCIAL',
        'PLACA (CAMION)',
        'PLACA (CARRETA)',
        'CONDUCTOR',
        'CLIENTE',
        'LUGAR',
        'TARIFA -10% Y/O 20% POR TIPO DE CAMION',
        '(-) GASTOS OPERATIVOS',
        'B.I',
        'IGV',
        'TOTAL',
        'ADELANTO',
        'DETRACCION',
        'NETO POR COBRAR',
        'MES FACTURACION',
        'FECHA',
        'SERIE',
        'FACTURA',
        'CREDITO DIAS',
        'FECHA A COBRAR',
        'FECHA DE DEPOSITO O TRANSF.',
        'ESTADO SERVICIO',
        'DIFERENCIA',
        'OBSERVACION'
    ];

    var ejemplo1 = [
        'LIQ-2026-0001', '05/01/2026', 'VIAJE-101', '12/12/2025', 'TRAHESA SAC', 'T8S942', 'AWB973', 'KENNY ALEXANDER ARTEAGA MARQUEZ',
        'AJINOMOTO DEL PERU', 'CALLAO - TARAPOTO', 8357.63, 237.29, 8120.34, 1461.66, 9582.00,
        0.00, 383.28, 9198.72, 'ENERO', '05/01/2026', 'E001', '0160', 45, '20/02/2026', '20/02/2026', 'PAGADO', -0.28, 'LIQ.01'
    ];

    var ejemplo2 = [
        'LIQ-2026-0002', '05/01/2026', 'VIAJE-102', '05/01/2026', 'JHOSTIL PERU', 'AMV803', 'AZO983', 'JOSE UZURIAGA GALARZA',
        '', 'ATE', 0.00, 0.00, 15254.24, 2745.76, 18000.00,
        0.00, 720.00, 17280.00, 'ENERO', '05/01/2026', 'E001', '0161', 15, '05/01/2026', '', 'PENDIENTE', 0.00, 'LLANTAS'
    ];

    var wsData = [cabeceras, ejemplo1, ejemplo2];
    var ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
        { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 30 },
        { wch: 25 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 14 },
        { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
        { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
        { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 25 }
    ];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cuentas_Cobrar_Pagar');
    XLSX.writeFile(wb, 'Plantilla_Cuentas_Tesoreria.xlsx');
};

// ── IMPORTACIÓN MASIVA DESDE EXCEL ─────────────────────────────────
window.importarExcelMasivo = function(event) {
    var file = event.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
        alert('Librería XLSX no cargada. Actualice la página.');
        event.target.value = '';
        return;
    }

    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = new Uint8Array(e.target.result);
            var workbook = XLSX.read(data, { type: 'array', cellDates: false });
            var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            var rawJson = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });

            if (!rawJson || rawJson.length === 0) {
                alert('El archivo Excel no contiene filas o está vacío.');
                event.target.value = '';
                return;
            }

            var normalizarClave = function(k) {
                return k.toString().toUpperCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^A-Z0-9]/g, '');
            };

            var procesadas = [];

            rawJson.forEach(function(row) {
                var rowNorm = {};
                Object.keys(row).forEach(function(origKey) {
                    rowNorm[normalizarClave(origKey)] = row[origKey];
                });

                var getVal = function(possibleKeys) {
                    for (var i = 0; i < possibleKeys.length; i++) {
                        var k = normalizarClave(possibleKeys[i]);
                        if (rowNorm[k] !== undefined && rowNorm[k] !== '') {
                            return rowNorm[k];
                        }
                    }
                    return '';
                };

            var parseFechaExcel = function(val) {
                if (!val) return '';
                if (typeof val === 'number') {
                    if (typeof XLSX !== 'undefined' && XLSX.SSF && XLSX.SSF.parse_date_code) {
                        var d = XLSX.SSF.parse_date_code(val);
                        if (d) {
                            var y = d.y;
                            var m = String(d.m).padStart(2, '0');
                            var day = String(d.d).padStart(2, '0');
                            return y + '-' + m + '-' + day;
                        }
                    }
                }
                var s = String(val).trim();
                if (!s || s === '-' || s === '—') return '';

                var matchRange = s.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
                if (matchRange && (s.includes(' - ') || s.includes('-2') || s.includes('-0') || s.includes('-1'))) {
                    s = matchRange[1];
                }

                if (s.includes('/')) {
                    var p = s.split('/');
                    if (p.length === 3) {
                        var dia = p[0].trim().padStart(2, '0');
                        var mes = p[1].trim().padStart(2, '0');
                        var anio = p[2].trim();
                        if (anio.length === 2) anio = '20' + anio;
                        return anio + '-' + mes + '-' + dia;
                    }
                }
                if (s.includes('-')) {
                    var p2 = s.split('-').map(function(x) { return x.trim(); });
                    if (p2.length === 3) {
                        if (p2[0].length === 4) {
                            var anio2 = p2[0];
                            var mVal = parseInt(p2[1], 10);
                            var dVal = parseInt(p2[2], 10);
                            if (mVal > 12) {
                                return anio2 + '-' + String(dVal).padStart(2, '0') + '-' + String(mVal).padStart(2, '0');
                            }
                            return anio2 + '-' + String(mVal).padStart(2, '0') + '-' + String(dVal).padStart(2, '0');
                        } else {
                            var dia2 = p2[0].padStart(2, '0');
                            var mes2 = p2[1].padStart(2, '0');
                            var anio2b = p2[2];
                            if (anio2b.length === 2) anio2b = '20' + anio2b;
                            return anio2b + '-' + mes2 + '-' + dia2;
                        }
                    }
                }
                return s;
            };

            var parseNumExcel = function(val) {
                if (val == null || val === '') return 0;
                if (typeof val === 'number') return isNaN(val) ? 0 : val;
                var str = String(val).trim();
                if (str.includes('.') && str.includes(',')) {
                    str = str.replace(/\./g, '').replace(',', '.');
                } else if (str.includes(',')) {
                    str = str.replace(',', '.');
                }
                var num = parseFloat(str);
                return isNaN(num) ? 0 : num;
            };

            var placaRaw = getVal(['PLACA', 'PLACAS', 'UNIDAD']);
            var camRaw = getVal(['PLACA CAMION', 'PLACACAMION', 'CAMION', 'TRACTO', 'PLACA TRACTO']);
            var carRaw = getVal(['PLACA CARRETA', 'PLACACARRETA', 'CARRETA', 'REMOLQUE', 'PLACA REMOLQUE']);

            // Si la placa del camión o la placa global trae guion o barra (ej: T8S942-AWB973), separar camión y carreta
            var camFinal = camRaw || '';
            var carFinal = carRaw || '';

            if (!carFinal) {
                var fuentePlaca = camFinal || placaRaw || '';
                if (fuentePlaca.includes('-')) {
                    var partesPlaca = fuentePlaca.split('-').map(function(p) { return p.trim(); }).filter(Boolean);
                    if (partesPlaca.length >= 2) {
                        camFinal = partesPlaca[0];
                        carFinal = partesPlaca[1];
                    } else if (partesPlaca.length === 1) {
                        camFinal = partesPlaca[0];
                    }
                } else if (fuentePlaca.includes('/')) {
                    var partesSlash = fuentePlaca.split('/').map(function(p) { return p.trim(); }).filter(Boolean);
                    camFinal = partesSlash[0] || '';
                    carFinal = partesSlash[1] || '';
                }
            }

            var item = {
                codigo_liquidacion: getVal(['COD DE LIQUIDACION', 'CODLIQUIDACION', 'CODIGO LIQUIDACION', 'CODIGO']),
                fecha_liquidacion: parseFechaExcel(getVal(['FECHA DE LIQUIDACION', 'FECHALIQUIDACION', 'LIQUIDACION'])),
                numero_viaje: getVal(['N DE VIAJE', 'NUMERO DE VIAJE', 'NRO VIAJE', 'VIAJE', 'ORDEN VIAJE', 'N VIAJE', 'NUMERO VIAJE']),
                fecha_servicio: parseFechaExcel(getVal(['FECHA SERVICIO', 'FECHASERVICIO'])),
                razon_social: getVal(['RAZON SOCIAL', 'RAZONSOCIAL', 'PROVEEDOR', 'EMPRESA']),
                placa: placaRaw,
                placa_camion: camFinal,
                placa_carreta: carFinal,
                conductor: getVal(['CONDUCTOR', 'CHOFER']),
                cliente: getVal(['CLIENTE']),
                lugar: getVal(['LUGAR', 'ORIGEN DESTINO', 'RUTA']),
                tarifa: parseNumExcel(getVal(['TARIFA 10 YO 20 POR TIPO DE CAMION', 'TARIFA', 'FLETE'])),
                gastos_operativos: parseNumExcel(getVal(['GASTOS OPERATIVOS', 'GASTOS'])),
                base_imponible: parseNumExcel(getVal(['BI', 'BASE IMPONIBLE', 'SUBTOTAL'])),
                igv: parseNumExcel(getVal(['IGV'])),
                total: parseNumExcel(getVal(['TOTAL'])),
                adelanto: parseNumExcel(getVal(['ADELANTO'])),
                detraccion: parseNumExcel(getVal(['DETRACCION'])),
                neto_cobrar: parseNumExcel(getVal(['NETO POR COBRAR', 'NETO COBRAR', 'SALDO'])),
                mes_facturacion: getVal(['MES FACTURACION', 'MES']),
                fecha_factura: parseFechaExcel(getVal(['FECHA', 'FECHA FACTURA'])),
                serie: getVal(['SERIE']),
                factura: getVal(['FACTURA', 'NUMERO FACTURA', 'NRO FACTURA']),
                credito_dias: parseInt(getVal(['CREDITO DIAS', 'DIAS CREDITO', 'CREDITO']), 10) || 0,
                fecha_cobrar: parseFechaExcel(getVal(['FECHA A COBRAR', 'FECHA COBRAR', 'VENCIMIENTO'])),
                fecha_deposito: parseFechaExcel(getVal(['FECHA DE DEPOSITO O TRANSF', 'FECHA DEPOSITO', 'FECHA PAGO'])),
                estado_servicio: getVal(['ESTADO SERVICIO', 'ESTADO', 'ESTADO PAGO']) || 'PENDIENTE',
                diferencia: parseNumExcel(getVal(['DIFERENCIA'])),
                observacion: getVal(['OBSERVACION', 'OBSERVACIONES', 'DETALLE'])
            };

                if (item.codigo_liquidacion || item.razon_social || item.factura || item.placa || item.placa_camion || item.total || item.fecha_liquidacion) {
                    procesadas.push(item);
                }
            });

            if (procesadas.length === 0) {
                alert('No se pudieron reconocer columnas válidas en el archivo.');
                event.target.value = '';
                return;
            }

            if (!confirm('Se detectaron ' + procesadas.length + ' registros en el Excel.\n¿Desea importarlos a la base de datos ahora?')) {
                event.target.value = '';
                return;
            }

            document.body.style.cursor = 'wait';

            fetch('/api/tesoreria/cuentas/importar-masivo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filas: procesadas })
            })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                document.body.style.cursor = 'default';
                event.target.value = '';
                if (res.error) throw new Error(res.error);
                alert('✅ ' + (res.message || 'Importación completada con éxito.'));
                window.cargarCuentas();
            })
            .catch(function(err) {
                document.body.style.cursor = 'default';
                event.target.value = '';
                alert('Error al importar archivo: ' + err.message);
            });

        } catch (err) {
            event.target.value = '';
            alert('Error leyendo archivo Excel: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
};

// ── EXPORTACIÓN A EXCEL ────────────────────────────────────────────
window.exportarCuentasExcel = function() {
    var datos = window._cuentasFiltradas || window._cuentasData || [];
    if (!datos.length) {
        alert('No hay datos disponibles para exportar.');
        return;
    }

    var cabeceras = [
        'COD DE LIQUIDACION', 'FECHA DE LIQUIDACION', 'N° DE VIAJE', 'FECHA SERVICIO', 'RAZON SOCIAL',
        'PLACA (CAMION)', 'PLACA (CARRETA)', 'CONDUCTOR', 'CLIENTE', 'LUGAR',
        'TARIFA -10% Y/O 20% POR TIPO DE CAMION', '(-) GASTOS OPERATIVOS', 'B.I', 'IGV',
        'TOTAL', 'ADELANTO', 'DETRACCION', 'NETO POR COBRAR', 'MES FACTURACION', 'FECHA',
        'SERIE', 'FACTURA', 'CREDITO DIAS', 'FECHA A COBRAR', 'FECHA DE DEPOSITO O TRANSF.',
        'ESTADO SERVICIO', 'DIFERENCIA', 'OBSERVACION'
    ];

    var filas = datos.map(function(d) {
        return [
            d.codigo_liquidacion || '',
            _fmtDate(d.fecha_liquidacion),
            d.numero_viaje || '',
            _fmtDate(d.fecha_servicio),
            d.razon_social || '',
            d.placa_camion || '',
            d.placa_carreta || '',
            d.conductor || '',
            d.cliente || '',
            d.lugar || '',
            parseFloat(d.tarifa) || 0,
            parseFloat(d.gastos_operativos) || 0,
            parseFloat(d.base_imponible) || 0,
            parseFloat(d.igv) || 0,
            parseFloat(d.total) || 0,
            parseFloat(d.adelanto) || 0,
            parseFloat(d.detraccion) || 0,
            parseFloat(d.neto_cobrar) || 0,
            d.mes_facturacion || '',
            _fmtDate(d.fecha_factura),
            d.serie || '',
            d.factura || '',
            d.credito_dias != null ? d.credito_dias : '',
            _fmtDate(d.fecha_cobrar),
            _fmtDate(d.fecha_deposito),
            d.estado_servicio || '',
            parseFloat(d.diferencia) || 0,
            d.observacion || ''
        ];
    });

    var ws = XLSX.utils.aoa_to_sheet([cabeceras].concat(filas));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cuentas');
    XLSX.writeFile(wb, 'Cuentas_Cobrar_Pagar_' + new Date().toISOString().split('T')[0] + '.xlsx');
};

// ── CAMBIAR FACTURA (EMITIR NOTA DE CRÉDITO) ──────────────────────
window.abrirModalCambiarFacturaNC = function(id) {
    var item = (window._cuentasData || []).find(function(c) { return c.id === id; });
    if (!item) return;

    if (!item.serie || !item.factura) {
        alert('Este registro aún no cuenta con Serie y Factura asignada.');
        return;
    }

    var form = document.getElementById('formCambiarFacturaNC');
    if (form) form.reset();

    var idEl = document.getElementById('nc-input-cuenta-id');
    if (idEl) idEl.value = item.id;

    var txtFac = document.getElementById('nc-txt-factura-actual');
    if (txtFac) txtFac.textContent = item.serie + '-' + item.factura;

    var txtTot = document.getElementById('nc-txt-total-actual');
    if (txtTot) txtTot.textContent = 'S/ ' + _fmtMoney(item.total);

    var inputFecha = document.getElementById('nc-input-nueva-fecha');
    if (inputFecha) inputFecha.value = new Date().toISOString().split('T')[0];

    var modal = new bootstrap.Modal(document.getElementById('modalCambiarFacturaNC'));
    modal.show();
};

window.guardarCambioFacturaNC = function(e) {
    if (e) e.preventDefault();
    var id = document.getElementById('nc-input-cuenta-id').value;
    if (!id) return;

    var serieNC = (document.getElementById('nc-input-serie').value || '').trim();
    var numNC = (document.getElementById('nc-input-numero').value || '').trim();
    var motivo = (document.getElementById('nc-input-motivo').value || '').trim();
    var nuevaSerie = (document.getElementById('nc-input-nueva-serie').value || '').trim();
    var nuevoNum = (document.getElementById('nc-input-nuevo-numero').value || '').trim();
    var nuevaFecha = (document.getElementById('nc-input-nueva-fecha').value || '').trim();

    var fileNC = document.getElementById('nc-input-archivo');
    var fileNuevaFac = document.getElementById('nc-input-archivo-nueva-factura');

    if (!fileNC || !fileNC.files || !fileNC.files[0]) {
        alert('Debe adjuntar el archivo PDF o Imagen de la Nota de Crédito.');
        return;
    }
    if (!fileNuevaFac || !fileNuevaFac.files || !fileNuevaFac.files[0]) {
        alert('Debe adjuntar el archivo PDF o Imagen de la Nueva Factura.');
        return;
    }

    var formData = new FormData();
    formData.append('nc_serie', serieNC);
    formData.append('nc_numero', numNC);
    formData.append('motivo_anulacion', motivo);
    formData.append('nueva_serie', nuevaSerie);
    formData.append('nuevo_numero', nuevoNum);
    formData.append('nueva_fecha_factura', nuevaFecha);
    formData.append('archivo_nc', fileNC.files[0]);
    formData.append('archivo_nueva_factura', fileNuevaFac.files[0]);

    var btnSubmit = document.getElementById('nc-btn-submit');
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando cambios...';
    }

    fetch('/api/tesoreria/cuentas/' + id + '/cambiar-factura-nc', {
        method: 'POST',
        body: formData
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<i class="bi bi-arrow-repeat fs-5"></i> Aplicar NC y Reemplazar Factura';
        }
        if (res.error) throw new Error(res.error);

        var modalEl = document.getElementById('modalCambiarFacturaNC');
        var modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        alert(res.message || 'Factura cambiada exitosamente.');
        window.cargarCuentas();
    })
    .catch(function(err) {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<i class="bi bi-arrow-repeat fs-5"></i> Aplicar NC y Reemplazar Factura';
        }
        alert('Error al cambiar factura: ' + err.message);
    });
};

// ── VER HISTORIAL DE FACTURAS Y NOTAS DE CRÉDITO ───────────────────
window.abrirModalHistorialFacturasNC = function(id) {
    var tbody = document.getElementById('nc-historial-tbody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2 text-primary"></div> Cargando historial de comprobantes...</td></tr>';
    }

    var modal = new bootstrap.Modal(document.getElementById('modalHistorialFacturasNC'));
    modal.show();

    fetch('/api/tesoreria/cuentas/' + id + '/historial-facturas')
        .then(function(r) { return r.json(); })
        .then(function(res) {
            var list = res.data || [];
            if (!list.length) {
                if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No se registran cambios ni Notas de Crédito emitidas para este servicio.</td></tr>';
                return;
            }

            var html = list.map(function(h) {
                var facAntHtml = h.factura_anterior_serie + '-' + h.factura_anterior_numero;
                if (h.factura_anterior_view_url) {
                    facAntHtml += ' <a href="' + h.factura_anterior_view_url + '" target="_blank" class="fw-bold text-danger ms-1 text-decoration-underline" style="font-size:0.75rem;">VER</a>';
                }

                var ncHtml = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle fw-bold">' + h.nota_credito_serie + '-' + h.nota_credito_numero + '</span>';
                if (h.nota_credito_view_url) {
                    ncHtml += ' <a href="' + h.nota_credito_view_url + '" target="_blank" class="fw-bold text-danger ms-1 text-decoration-underline" style="font-size:0.75rem;">VER</a>';
                }

                var facNuevaHtml = h.factura_nueva_serie + '-' + h.factura_nueva_numero;
                if (h.factura_nueva_view_url) {
                    facNuevaHtml += ' <a href="' + h.factura_nueva_view_url + '" target="_blank" class="fw-bold text-success ms-1 text-decoration-underline" style="font-size:0.75rem;">VER</a>';
                }

                var fechaStr = h.fecha_registro ? _fmtDate(h.fecha_registro) : '—';

                return '<tr>' +
                    '<td>' + fechaStr + '</td>' +
                    '<td>' + facAntHtml + '</td>' +
                    '<td>' + ncHtml + '</td>' +
                    '<td><span class="small fw-semibold text-secondary">' + (h.motivo_anulacion || '—') + '</span></td>' +
                    '<td class="fw-bold text-primary">' + facNuevaHtml + '</td>' +
                    '<td><small class="text-muted">' + (h.usuario_registro || 'ADMIN') + '</small></td>' +
                '</tr>';
            }).join('');

            if (tbody) tbody.innerHTML = html;
        })
        .catch(function(err) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-danger">Error al cargar historial: ' + err.message + '</td></tr>';
        });
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.init_tesoreria_cuentas();
} else {
    document.addEventListener('DOMContentLoaded', window.init_tesoreria_cuentas);
}
