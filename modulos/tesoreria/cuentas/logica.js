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

window._cuentasRenderKPIs = function(data) {
    var list = data || [];
    var totalFacturado = 0;
    var netoPendiente = 0;
    var totalPagado = 0;

    list.forEach(function(item) {
        var total = parseFloat(item.total) || 0;
        var neto = parseFloat(item.neto_cobrar) || 0;
        var est = (item.estado_servicio || '').toUpperCase();

        totalFacturado += total;
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
        var badgeClass = est === 'PAGADO' ? 'pagado' : (est === 'ANULADO' ? 'anulado' : 'pendiente');

        var docHtml = '<span class="text-muted small">—</span>';
        if (item.documento_view_url) {
            var esPdf = (item.documento_url || '').toLowerCase().includes('.pdf');
            var iconClass = esPdf ? 'bi-file-earmark-pdf-fill text-danger' : 'bi-file-earmark-image-fill text-primary';
            docHtml = '<a href="' + item.documento_view_url + '" target="_blank" class="btn btn-sm btn-light border py-0 px-2 fw-semibold d-inline-flex align-items-center gap-1 shadow-sm" style="font-size:0.75rem;" title="Ver Orden / Documento Adjunto">' +
                '<i class="bi ' + iconClass + '"></i> Ver' +
            '</a>';
        }

        return '<tr>' +
            '<td class="col-sticky-action text-center">' +
                '<div class="btn-group btn-group-sm">' +
                    '<button class="btn btn-light border py-1 px-2 text-primary" title="Editar" onclick="window.abrirEditarRegistro(' + item.id + ')"><i class="bi bi-pencil-fill" style="font-size:0.75rem;"></i></button>' +
                    '<button class="btn btn-light border py-1 px-2 text-danger" title="Eliminar" onclick="window.eliminarCuenta(' + item.id + ')"><i class="bi bi-trash-fill" style="font-size:0.75rem;"></i></button>' +
                '</div>' +
            '</td>' +
            '<td class="fw-bold text-primary">' + (item.codigo_liquidacion || '—') + '</td>' +
            '<td>' + _fmtDate(item.fecha_liquidacion) + '</td>' +
            '<td><span class="badge bg-light text-dark border fw-bold">' + (item.numero_viaje || '—') + '</span></td>' +
            '<td>' + _fmtDate(item.fecha_servicio) + '</td>' +
            '<td class="fw-bold text-dark">' + (item.razon_social || '—') + '</td>' +
            '<td><span class="badge bg-light text-dark border fw-bold">' + (item.placa_camion || '—') + '</span></td>' +
            '<td><span class="badge bg-light text-secondary border fw-bold">' + (item.placa_carreta || '—') + '</span></td>' +
            '<td>' + (item.conductor || '—') + '</td>' +
            '<td class="fw-semibold">' + (item.cliente || '—') + '</td>' +
            '<td>' + (item.lugar || '—') + '</td>' +
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
            '<td class="fw-bold">' + (item.factura || '—') + '</td>' +
            '<td class="text-center">' + (item.credito_dias != null ? item.credito_dias : '—') + '</td>' +
            '<td>' + _fmtDate(item.fecha_cobrar) + '</td>' +
            '<td>' + _fmtDate(item.fecha_deposito) + '</td>' +
            '<td class="text-center"><span class="badge-estado ' + badgeClass + '">' + est + '</span></td>' +
            '<td class="text-center">' + docHtml + '</td>' +
            '<td class="num-cell ' + ((parseFloat(item.diferencia) || 0) < 0 ? 'text-danger' : '') + '">' + _fmtMoney(item.diferencia) + '</td>' +
            '<td>' + (item.observacion || '') + '</td>' +
        '</tr>';
    }).join('');

    tbody.innerHTML = html;
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
    setV('fc-numero-viaje', '');
    setV('fc-flete', '');
    setV('fc-comision', '10');
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

    var modal = new bootstrap.Modal(document.getElementById('modalCuentaForm'));
    modal.show();
};

window.abrirEditarRegistro = function(id) {
    var item = (window._cuentasData || []).find(function(c) { return c.id === id; });
    if (!item) return;

    var setV = function(elId, val) {
        var el = document.getElementById(elId);
        if (el) el.value = val != null ? val : '';
    };

    setV('form-cuenta-id', item.id);
    setV('fc-codigo-liquidacion', item.codigo_liquidacion);
    setV('fc-fecha-liquidacion', item.fecha_liquidacion ? item.fecha_liquidacion.split('T')[0] : '');
    setV('fc-numero-viaje', item.numero_viaje);
    setV('fc-fecha-servicio', item.fecha_servicio ? item.fecha_servicio.split('T')[0] : '');
    setV('fc-razon-social', item.razon_social);
    setV('fc-placa-camion', item.placa_camion);
    setV('fc-placa-carreta', item.placa_carreta);
    setV('fc-conductor', item.conductor);
    setV('fc-cliente', item.cliente);
    setV('fc-lugar', item.lugar);

    // Flete y Comisión
    var comisionVal = (item.comision_porcentaje != null && item.comision_porcentaje !== '') ? item.comision_porcentaje : 10;
    setV('fc-comision', comisionVal);

    var fleteVal = item.flete;
    if ((fleteVal == null || parseFloat(fleteVal) === 0) && item.tarifa && parseFloat(item.tarifa) > 0) {
        var factor = (1 - (parseFloat(comisionVal) || 10) / 100);
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

    document.getElementById('modalCuentaFormTitulo').textContent = 'Editar Registro (ID ' + item.id + ')';
    var modal = new bootstrap.Modal(document.getElementById('modalCuentaForm'));
    modal.show();
};

// ── CÁLCULO AUTOMÁTICO DE LIQUIDACIÓN ECONÓMICA ─────────────────────
window.autoCalcularTotalesForm = function() {
    // 1. Flete
    var flete = parseFloat(document.getElementById('fc-flete').value) || 0;

    // 2. Comisión % (por defecto 10%)
    var comisionStr = (document.getElementById('fc-comision').value || '').trim();
    var comision = comisionStr !== '' ? (parseFloat(comisionStr) || 0) : 10;

    // 3. Tarifa (-10% / 20%) = Flete - (Flete * Comision / 100)
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
    formData.append('comision_porcentaje', parseFloat(getV('fc-comision')) || 10);
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
            var workbook = XLSX.read(data, { type: 'array', cellDates: true });
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

                var item = {
                    codigo_liquidacion: getVal(['COD DE LIQUIDACION', 'CODLIQUIDACION', 'CODIGO LIQUIDACION', 'CODIGO']),
                    fecha_liquidacion: getVal(['FECHA DE LIQUIDACION', 'FECHALIQUIDACION', 'LIQUIDACION']),
                    numero_viaje: getVal(['N DE VIAJE', 'NUMERO DE VIAJE', 'NRO VIAJE', 'VIAJE', 'ORDEN VIAJE', 'N VIAJE', 'NUMERO VIAJE']),
                    fecha_servicio: getVal(['FECHA SERVICIO', 'FECHASERVICIO']),
                    razon_social: getVal(['RAZON SOCIAL', 'RAZONSOCIAL', 'PROVEEDOR', 'EMPRESA']),
                    placa: getVal(['PLACA', 'PLACAS', 'UNIDAD']),
                    placa_camion: getVal(['PLACA CAMION', 'PLACACAMION', 'CAMION', 'TRACTO', 'PLACA TRACTO']),
                    placa_carreta: getVal(['PLACA CARRETA', 'PLACACARRETA', 'CARRETA', 'REMOLQUE', 'PLACA REMOLQUE']),
                    conductor: getVal(['CONDUCTOR', 'CHOFER']),
                    cliente: getVal(['CLIENTE']),
                    lugar: getVal(['LUGAR', 'ORIGEN DESTINO', 'RUTA']),
                    tarifa: getVal(['TARIFA 10 YO 20 POR TIPO DE CAMION', 'TARIFA', 'FLETE']),
                    gastos_operativos: getVal(['GASTOS OPERATIVOS', 'GASTOS']),
                    base_imponible: getVal(['BI', 'BASE IMPONIBLE', 'SUBTOTAL']),
                    igv: getVal(['IGV']),
                    total: getVal(['TOTAL']),
                    adelanto: getVal(['ADELANTO']),
                    detraccion: getVal(['DETRACCION']),
                    neto_cobrar: getVal(['NETO POR COBRAR', 'NETO COBRAR', 'SALDO']),
                    mes_facturacion: getVal(['MES FACTURACION', 'MES']),
                    fecha_factura: getVal(['FECHA', 'FECHA FACTURA']),
                    serie: getVal(['SERIE']),
                    factura: getVal(['FACTURA', 'NUMERO FACTURA', 'NRO FACTURA']),
                    credito_dias: getVal(['CREDITO DIAS', 'DIAS CREDITO', 'CREDITO']),
                    fecha_cobrar: getVal(['FECHA A COBRAR', 'FECHA COBRAR', 'VENCIMIENTO']),
                    fecha_deposito: getVal(['FECHA DE DEPOSITO O TRANSF', 'FECHA DEPOSITO', 'FECHA PAGO']),
                    estado_servicio: getVal(['ESTADO SERVICIO', 'ESTADO', 'ESTADO PAGO']) || 'PENDIENTE',
                    diferencia: getVal(['DIFERENCIA']),
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

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.init_tesoreria_cuentas();
} else {
    document.addEventListener('DOMContentLoaded', window.init_tesoreria_cuentas);
}
