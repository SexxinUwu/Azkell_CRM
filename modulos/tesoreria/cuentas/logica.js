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
        tbody.innerHTML = '<tr><td colspan="26" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm me-2 text-primary"></div> Cargando datos de Tesorería...</td></tr>';
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
                tbody.innerHTML = '<tr><td colspan="26" class="text-center py-5 text-danger"><i class="bi bi-exclamation-triangle me-2"></i> Error al cargar datos: ' + err.message + '</td></tr>';
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
            (item.razon_social || '').toLowerCase().includes(buscar) ||
            (item.placa || '').toLowerCase().includes(buscar) ||
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
        tbody.innerHTML = '<tr><td colspan="26" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-2 d-block mb-2"></i>No se encontraron registros de cuentas con los filtros seleccionados.</td></tr>';
        return;
    }

    var html = data.map(function(item) {
        var est = (item.estado_servicio || 'PENDIENTE').toUpperCase();
        var badgeClass = est === 'PAGADO' ? 'pagado' : (est === 'ANULADO' ? 'anulado' : 'pendiente');

        return '<tr>' +
            '<td class="col-sticky-action text-center">' +
                '<div class="btn-group btn-group-sm">' +
                    '<button class="btn btn-light border py-1 px-2 text-primary" title="Editar" onclick="window.abrirEditarRegistro(' + item.id + ')"><i class="bi bi-pencil-fill" style="font-size:0.75rem;"></i></button>' +
                    '<button class="btn btn-light border py-1 px-2 text-danger" title="Eliminar" onclick="window.eliminarCuenta(' + item.id + ')"><i class="bi bi-trash-fill" style="font-size:0.75rem;"></i></button>' +
                '</div>' +
            '</td>' +
            '<td>' + _fmtDate(item.fecha_liquidacion) + '</td>' +
            '<td>' + _fmtDate(item.fecha_servicio) + '</td>' +
            '<td class="fw-bold text-dark">' + (item.razon_social || '—') + '</td>' +
            '<td><span class="badge bg-light text-dark border fw-bold">' + (item.placa || '—') + '</span></td>' +
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
            '<td class="num-cell ' + ((parseFloat(item.diferencia) || 0) < 0 ? 'text-danger' : '') + '">' + _fmtMoney(item.diferencia) + '</td>' +
            '<td>' + (item.observacion || '') + '</td>' +
        '</tr>';
    }).join('');

    tbody.innerHTML = html;
};

// ── CRUD MODAL / FORM ──────────────────────────────────────────────
window.abrirModalNuevoRegistro = function() {
    var form = document.getElementById('form-cuenta');
    if (form) form.reset();
    document.getElementById('form-cuenta-id').value = '';
    document.getElementById('modalCuentaFormTitulo').textContent = 'Nuevo Registro de Cuenta';
    
    // Mes actual por defecto
    var meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SETIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    var mesAct = meses[new Date().getMonth()];
    var selMes = document.getElementById('fc-mes-facturacion');
    if (selMes) selMes.value = mesAct;

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
    setV('fc-fecha-liquidacion', item.fecha_liquidacion);
    setV('fc-fecha-servicio', item.fecha_servicio);
    setV('fc-razon-social', item.razon_social);
    setV('fc-placa', item.placa);
    setV('fc-conductor', item.conductor);
    setV('fc-cliente', item.cliente);
    setV('fc-lugar', item.lugar);
    setV('fc-tarifa', item.tarifa);
    setV('fc-gastos-operativos', item.gastos_operativos);
    setV('fc-base-imponible', item.base_imponible);
    setV('fc-igv', item.igv);
    setV('fc-total', item.total);
    setV('fc-adelanto', item.adelanto);
    setV('fc-detraccion', item.detraccion);
    setV('fc-neto-cobrar', item.neto_cobrar);
    setV('fc-mes-facturacion', item.mes_facturacion || 'ENERO');
    setV('fc-fecha-factura', item.fecha_factura);
    setV('fc-serie', item.serie);
    setV('fc-factura', item.factura);
    setV('fc-credito-dias', item.credito_dias);
    setV('fc-fecha-cobrar', item.fecha_cobrar);
    setV('fc-fecha-deposito', item.fecha_deposito);
    setV('fc-estado-servicio', item.estado_servicio || 'PENDIENTE');
    setV('fc-diferencia', item.diferencia);
    setV('fc-observacion', item.observacion);

    document.getElementById('modalCuentaFormTitulo').textContent = 'Editar Registro (ID ' + item.id + ')';
    var modal = new bootstrap.Modal(document.getElementById('modalCuentaForm'));
    modal.show();
};

window.autoCalcularTotalesForm = function() {
    var tarifa = parseFloat(document.getElementById('fc-tarifa').value) || 0;
    var gastos = parseFloat(document.getElementById('fc-gastos-operativos').value) || 0;
    var bi = tarifa - gastos;
    if (bi < 0) bi = 0;
    document.getElementById('fc-base-imponible').value = bi.toFixed(2);
    window.autoCalcularDesdeBI();
};

window.autoCalcularDesdeBI = function() {
    var bi = parseFloat(document.getElementById('fc-base-imponible').value) || 0;
    var igv = bi * 0.18;
    var total = bi + igv;
    document.getElementById('fc-igv').value = igv.toFixed(2);
    document.getElementById('fc-total').value = total.toFixed(2);
    
    // Detracción aprox 4% por transporte de carga
    var detraccion = (total > 400) ? (total * 0.04) : 0;
    document.getElementById('fc-detraccion').value = detraccion.toFixed(2);
    window.autoCalcularNeto();
};

window.autoCalcularDesdeTotal = function() {
    var total = parseFloat(document.getElementById('fc-total').value) || 0;
    var bi = total / 1.18;
    var igv = total - bi;
    document.getElementById('fc-base-imponible').value = bi.toFixed(2);
    document.getElementById('fc-igv').value = igv.toFixed(2);
    var detraccion = (total > 400) ? (total * 0.04) : 0;
    document.getElementById('fc-detraccion').value = detraccion.toFixed(2);
    window.autoCalcularNeto();
};

window.autoCalcularNeto = function() {
    var total = parseFloat(document.getElementById('fc-total').value) || 0;
    var adelanto = parseFloat(document.getElementById('fc-adelanto').value) || 0;
    var detraccion = parseFloat(document.getElementById('fc-detraccion').value) || 0;
    var neto = total - adelanto - detraccion;
    document.getElementById('fc-neto-cobrar').value = neto.toFixed(2);
};

window.autoCalcularFechaCobro = function() {
    var fFactura = document.getElementById('fc-fecha-factura').value;
    var dias = parseInt(document.getElementById('fc-credito-dias').value, 10) || 0;
    if (fFactura && dias > 0) {
        var d = new Date(fFactura + 'T00:00:00');
        if (!isNaN(d.getTime())) {
            d.setDate(d.getDate() + dias);
            document.getElementById('fc-fecha-cobrar').value = d.toISOString().split('T')[0];
        }
    }
};

window.guardarCuentaForm = function(e) {
    if (e) e.preventDefault();
    var id = document.getElementById('form-cuenta-id').value;
    var getV = function(elId) { return (document.getElementById(elId) || {}).value || ''; };

    var payload = {
        fecha_liquidacion: getV('fc-fecha-liquidacion') || null,
        fecha_servicio: getV('fc-fecha-servicio') || null,
        razon_social: getV('fc-razon-social').trim(),
        placa: getV('fc-placa').trim().toUpperCase(),
        conductor: getV('fc-conductor').trim(),
        cliente: getV('fc-cliente').trim(),
        lugar: getV('fc-lugar').trim(),
        tarifa: parseFloat(getV('fc-tarifa')) || 0,
        gastos_operativos: parseFloat(getV('fc-gastos-operativos')) || 0,
        base_imponible: parseFloat(getV('fc-base-imponible')) || 0,
        igv: parseFloat(getV('fc-igv')) || 0,
        total: parseFloat(getV('fc-total')) || 0,
        adelanto: parseFloat(getV('fc-adelanto')) || 0,
        detraccion: parseFloat(getV('fc-detraccion')) || 0,
        neto_cobrar: parseFloat(getV('fc-neto-cobrar')) || 0,
        mes_facturacion: getV('fc-mes-facturacion'),
        fecha_factura: getV('fc-fecha-factura') || null,
        serie: getV('fc-serie').trim(),
        factura: getV('fc-factura').trim(),
        credito_dias: parseInt(getV('fc-credito-dias'), 10) || 0,
        fecha_cobrar: getV('fc-fecha-cobrar') || null,
        fecha_deposito: getV('fc-fecha-deposito') || null,
        estado_servicio: getV('fc-estado-servicio') || 'PENDIENTE',
        diferencia: parseFloat(getV('fc-diferencia')) || 0,
        observacion: getV('fc-observacion').trim()
    };

    var url = id ? ('/api/tesoreria/cuentas/' + id) : '/api/tesoreria/cuentas';
    var method = id ? 'PUT' : 'POST';

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.error) throw new Error(res.error);
        var modalEl = document.getElementById('modalCuentaForm');
        var modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        window.cargarCuentas();
    })
    .catch(function(err) {
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
        'FECHA DE LIQUIDACION',
        'FECHA SERVICIO',
        'RAZON SOCIAL',
        'PLACA',
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
        '05/01/2026', '12/12/2025', 'TRAHESA SAC', 'T8S942-AWB973', 'KENNY ALEXANDER ARTEAGA MARQUEZ',
        'AJINOMOTO DEL PERU', 'CALLAO - TARAPOTO', 8357.63, 237.29, 8120.34, 1461.66, 9582.00,
        0.00, 383.28, 9198.72, 'ENERO', '05/01/2026', 'E001', '0160', 45, '20/02/2026', '20/02/2026', 'PAGADO', -0.28, 'LIQ.01'
    ];

    var ejemplo2 = [
        '05/01/2026', '05/01/2026', 'JHOSTIL PERU', 'AMV803-AZO983', 'JOSE UZURIAGA GALARZA',
        '', 'ATE', 0.00, 0.00, 15254.24, 2745.76, 18000.00,
        0.00, 720.00, 17280.00, 'ENERO', '05/01/2026', 'E001', '0161', 15, '05/01/2026', '', 'PENDIENTE', 0.00, 'LLANTAS'
    ];

    var wsData = [cabeceras, ejemplo1, ejemplo2];
    var ws = XLSX.utils.aoa_to_sheet(wsData);

    // Ajustar anchos de columnas
    ws['!cols'] = [
        { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 30 },
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
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // sin tildes
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
                    fecha_liquidacion: getVal(['FECHA DE LIQUIDACION', 'FECHALIQUIDACION', 'LIQUIDACION']),
                    fecha_servicio: getVal(['FECHA SERVICIO', 'FECHASERVICIO']),
                    razon_social: getVal(['RAZON SOCIAL', 'RAZONSOCIAL', 'PROVEEDOR', 'EMPRESA']),
                    placa: getVal(['PLACA', 'UNIDAD', 'VEHICULO']),
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

                // Si al menos tiene fecha, razón social, factura, placa o total
                if (item.razon_social || item.factura || item.placa || item.total || item.fecha_liquidacion) {
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
        'FECHA DE LIQUIDACION', 'FECHA SERVICIO', 'RAZON SOCIAL', 'PLACA', 'CONDUCTOR',
        'CLIENTE', 'LUGAR', 'TARIFA -10% Y/O 20% POR TIPO DE CAMION', '(-) GASTOS OPERATIVOS',
        'B.I', 'IGV', 'TOTAL', 'ADELANTO', 'DETRACCION', 'NETO POR COBRAR', 'MES FACTURACION',
        'FECHA', 'SERIE', 'FACTURA', 'CREDITO DIAS', 'FECHA A COBRAR', 'FECHA DE DEPOSITO O TRANSF.',
        'ESTADO SERVICIO', 'DIFERENCIA', 'OBSERVACION'
    ];

    var filas = datos.map(function(d) {
        return [
            _fmtDate(d.fecha_liquidacion),
            _fmtDate(d.fecha_servicio),
            d.razon_social || '',
            d.placa || '',
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

// Autocarga si el script se monta de forma dinámica
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.init_tesoreria_cuentas();
} else {
    document.addEventListener('DOMContentLoaded', window.init_tesoreria_cuentas);
}
