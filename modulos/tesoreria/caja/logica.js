// ================================================================
// MÓDULO TESORERÍA / CAJA — Lógica SPA
// ================================================================

window._cajaData = window._cajaData || [];
window._cajaDataFiltrada = window._cajaDataFiltrada || [];
window._cajaOrdenSort = { col: 'fecha', asc: false };

// ── CATÁLOGO MAESTRO DE MOTIVOS Y SUBMOTIVOS CON CENTRO DE COSTOS SUGERIDO ──
window.CATALOGO_GASTOS = {
    'Combustibles y Fluidos': {
        ccSugerido: 'CC-300',
        submotivos: [
            'Diésel B5 / Gasolina de ruta',
            'Úrea / AdBlue',
            'Gasolina vehículos auxiliares/supervisión',
            'Aceites y lubricantes de motor'
        ]
    },
    'Gastos de Viaje y Ruta': {
        ccSugerido: 'CC-300',
        submotivos: [
            'Peajes (físico / telepeaje)',
            'Viáticos / Alimentación choferes',
            'Pernocte / Hospedaje en ruta',
            'Estibadores / Carga y descarga menor',
            'Cochera / Parqueo de ruta',
            'Lavado y engrase de unidad en viaje',
            'Balanza y pesaje'
        ]
    },
    'Mantenimiento y Auxilio': {
        ccSugerido: 'CC-400',
        submotivos: [
            'Llantas y parchados de emergencia',
            'Lavado y engrase de unidad en taller',
            'Repuestos menores / Accesorios de viaje',
            'Grúa o auxilio mecánico en ruta',
            'Frenos, suspensión y aire',
            'Servicios de tornería y soldadura',
            'Mantenimiento preventivo programado'
        ]
    },
    'Servicios de Terceros': {
        ccSugerido: 'CC-100',
        submotivos: [
            'Asesoría contable / legal externa',
            'Mantenimiento de software / GPS satelital',
            'Notaría, trámites y legalizaciones',
            'Seguridad, monitoreo y vigilancia',
            'Consultoría y auditoría externa'
        ]
    },
    'Gastos Administrativos / Oficina': {
        ccSugerido: 'CC-100',
        submotivos: [
            'Útiles de escritorio y papelería',
            'Artículos de limpieza y aseo',
            'Servicios básicos oficina (Agua, Luz, Internet)',
            'Envíos de courier / correspondencia',
            'Alquiler de oficina o instalaciones',
            'Telefonía y comunicaciones móviles'
        ]
    },
    'Comercial y Representación': {
        ccSugerido: 'CC-200',
        submotivos: [
            'Movilidad local ejecutivos de cuenta',
            'Almuerzos de trabajo / Clientes',
            'Merchandising y publicidad física',
            'Comisiones por venta o corretaje'
        ]
    },
    'Personal y Planilla': {
        ccSugerido: 'CC-100',
        submotivos: [
            'Sueldos y jornales',
            'Adelantos de sueldo',
            'Gratificaciones / CTS',
            'Exámenes médicos ocupacionales',
            'Capacitación de personal y choferes',
            'EPPs e indumentaria de trabajo'
        ]
    },
    'Financieros y Bancarios': {
        ccSugerido: 'CC-100',
        submotivos: [
            'Comisiones bancarias y mantenimiento',
            'ITF (Impuesto a Transacciones Financieras)',
            'Intereses de préstamos / leasing',
            'Portes y transferencias interbancarias'
        ]
    },
    'Impuestos y Tributos': {
        ccSugerido: 'CC-100',
        submotivos: [
            'Pago IGV / Renta mensual SUNAT',
            'Detracciones SUNAT',
            'Arbitrios municipales y predial',
            'Tasas administrativas / MTC / SUTRAN'
        ]
    }
};

window._cajaCentrosCostosList = [];

window.init_tesoreria_caja = function() {
    console.log('Inicializando módulo Caja (Tesorería)...');
    
    // Configurar fechas por defecto del mes actual
    var hoy = new Date();
    var primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    var formatYMD = function(d) { return d.toISOString().slice(0, 10); };
    
    var fDesde = document.getElementById('caja-filtro-desde');
    var fHasta = document.getElementById('caja-filtro-hasta');
    if (fDesde && !fDesde.value) fDesde.value = formatYMD(primerDia);
    if (fHasta && !fHasta.value) fHasta.value = formatYMD(hoy);

    // Inicializar selectores dinámicos
    window.cajaCargarCentrosCostosSelect();
    window.cajaPoblarMotivosSelect();

    // Inicializar selector de columnas en el toolbar
    window.cajaInicializarColumnasSelector();

    // Precargar datalist de órdenes de viaje
    window.cajaCargarOrdenesViajeDatalist();

    // Cargar datos
    window.cajaCargarMovimientos();

    // Escuchador de envío de formulario
    var form = document.getElementById('formNuevaCaja');
    if (form) {
        form.onsubmit = window.cajaGuardarFormulario;
    }
};

// ── 1. Cargar Movimientos desde la API ───────────────────────────
window.cajaCargarMovimientos = async function() {
    var tbody = document.getElementById('caja-tbody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="28" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm me-2 text-primary"></div> Cargando datos de Caja...</td></tr>';
    }

    var fDesde = (document.getElementById('caja-filtro-desde') || {}).value || '';
    var fHasta = (document.getElementById('caja-filtro-hasta') || {}).value || '';
    var estado = (document.getElementById('caja-filtro-estado') || {}).value || 'TODOS';

    var params = new URLSearchParams();
    if (fDesde) params.append('fecha_desde', fDesde);
    if (fHasta) params.append('fecha_hasta', fHasta);
    if (estado) params.append('estado', estado);

    try {
        var resp = await fetch('/api/tesoreria/caja?' + params.toString());
        var res = await resp.json();
        if (res.ok) {
            window._cajaData = res.data || [];
            window.cajaFiltrarEnTabla();
        } else {
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="28" class="text-center py-4 text-danger"><i class="bi bi-exclamation-circle me-1"></i> ' + (res.error || 'No se pudo cargar la información de caja') + '</td></tr>';
            }
        }
    } catch (err) {
        console.error('Error al cargar caja:', err);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="28" class="text-center py-4 text-danger"><i class="bi bi-wifi-off me-1"></i> Error de conexión: ' + err.message + '</td></tr>';
        }
    }
};

// ── 2. Filtrado en tiempo real en tabla ─────────────────────────
window.cajaFiltrarEnTabla = function() {
    var term = ((document.getElementById('caja-filtro-tabla') || {}).value || '').toLowerCase().trim();
    if (!term) {
        window._cajaDataFiltrada = window._cajaData.slice();
    } else {
        window._cajaDataFiltrada = window._cajaData.filter(function(r) {
            return (r.numero || '').toLowerCase().includes(term) ||
                (r.serie || '').toLowerCase().includes(term) ||
                (r.orden_viaje || '').toLowerCase().includes(term) ||
                (r.placa || '').toLowerCase().includes(term) ||
                (r.motivo || '').toLowerCase().includes(term) ||
                (r.sub_motivo || '').toLowerCase().includes(term) ||
                (r.persona || '').toLowerCase().includes(term) ||
                (r.tipo_persona || '').toLowerCase().includes(term) ||
                (r.descripcion || '').toLowerCase().includes(term) ||
                (r.usuario_creacion || '').toLowerCase().includes(term) ||
                (r.numero_factura || '').toLowerCase().includes(term) ||
                (r.estado || '').toLowerCase().includes(term);
        });
    }

    window.cajaRenderizarTabla();
};

// ── 3. Renderizar Filas de la Tabla ─────────────────────────────
window.cajaRenderizarTabla = function() {
    var tbody = document.getElementById('caja-tbody');
    if (!tbody) return;

    var rows = window._cajaDataFiltrada || [];
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="28" class="text-center py-4 text-muted">No hay datos disponibles en la tabla</td></tr>';
        return;
    }

    var esc = function(t) { return (t || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var fmtDate = function(v) {
        if (!v) return '—';
        var parts = String(v).split('-');
        return parts.length === 3 ? (parts[2] + '/' + parts[1] + '/' + parts[0]) : v;
    };
    var fmtMoney = function(v) {
        var num = parseFloat(v || 0);
        return isNaN(num) ? '0.00' : num.toFixed(2);
    };

    var html = '';
    rows.forEach(function(r) {
        var badgeEstadoClass = 'bg-secondary';
        var est = (r.estado || 'REGISTRADO').toUpperCase();
        if (est === 'APROBADO') badgeEstadoClass = 'bg-primary text-white';
        else if (est === 'PROCESADO' || est === 'PAGADO') badgeEstadoClass = 'bg-success text-white';
        else if (est === 'REGISTRADO' || est === 'PENDIENTE') badgeEstadoClass = 'bg-warning text-dark';
        else if (est === 'RECHAZADO' || est === 'ANULADO') badgeEstadoClass = 'bg-danger text-white';

        var numDoc = (r.serie && r.numero) ? (r.serie + '-' + r.numero) : (r.numero || '—');

        var archivoHtml = r.voucher_signed ? 
            '<a href="' + r.voucher_signed + '" target="_blank" class="btn btn-xs btn-outline-primary py-0 px-1.5" title="Ver Voucher" style="font-size:0.7rem;"><i class="bi bi-file-earmark-image"></i></a>' : '—';
        
        var sustentoHtml = r.sustento_signed ? 
            '<a href="' + r.sustento_signed + '" target="_blank" class="btn btn-xs btn-outline-secondary py-0 px-1.5" title="Ver Sustento" style="font-size:0.7rem;"><i class="bi bi-paperclip"></i></a>' : '—';

        // Acciones según estado:
        // Si está REGISTRADO: Editar, Aprobar, Eliminar
        // Si está APROBADO o PROCESADO: Subir Documentos, Eliminar
        var accionesHtml = '<div class="d-flex align-items-center justify-content-center gap-1">';
        if (est === 'REGISTRADO' || est === 'PENDIENTE') {
            accionesHtml += 
                '<button type="button" class="btn btn-sm btn-outline-primary p-1 rounded-circle lh-1" onclick="window.cajaAbrirModalEditar(' + r.id + ')" title="Editar Caja">' +
                    '<i class="bi bi-pencil" style="font-size:0.75rem;"></i>' +
                '</button>' +
                '<button type="button" class="btn btn-sm btn-outline-success p-1 rounded-circle lh-1" onclick="window.cajaAprobar(' + r.id + ')" title="Aprobar Caja">' +
                    '<i class="bi bi-check-lg" style="font-size:0.75rem;"></i>' +
                '</button>';
        } else {
            // Ya está aprobada o procesada: Botón Subir Documentos
            accionesHtml += 
                '<button type="button" class="btn btn-xs btn-outline-info py-0 px-1.5 fw-bold" onclick="window.cajaAbrirModalSubirDocs(' + r.id + ')" title="Subir Documentos" style="font-size:0.68rem;">' +
                    '<i class="bi bi-upload me-0.5"></i> Subir Docs' +
                '</button>';
        }
        accionesHtml += 
            '<button type="button" class="btn btn-outline-danger btn-sm p-1 rounded-circle lh-1" onclick="window.cajaEliminarRegistro(' + r.id + ')" title="Eliminar">' +
                '<i class="bi bi-trash" style="font-size:0.75rem;"></i>' +
            '</button>' +
        '</div>';

        html += '<tr>' +
            '<td class="text-center">' + accionesHtml + '</td>' +
            '<td>' + fmtDate(r.fecha) + '</td>' +
            '<td><span class="badge ' + badgeEstadoClass + ' px-2 py-1" style="font-size:0.68rem;">' + esc(est) + '</span></td>' +
            '<td class="font-monospace fw-bold text-primary">' + esc(numDoc) + '</td>' +
            '<td>' + esc(r.orden_viaje || '—') + '</td>' +
            '<td>' + esc(r.conductor || '—') + '</td>' +
            '<td>' + esc(r.ruta_viaje || '—') + '</td>' +
            '<td class="font-monospace fw-bold">' + esc(r.placa || '—') + '</td>' +
            '<td>' + esc(r.autoriza || '—') + '</td>' +
            '<td>' + esc(r.motivo || '—') + '</td>' +
            '<td>' + esc(r.sub_motivo || '—') + '</td>' +
            '<td><span class="badge bg-indigo-subtle text-indigo border fw-semibold" style="font-size:0.7rem; background:#eef2ff; color:#4f46e5;">' + esc(r.centro_costo || '—') + '</span></td>' +
            '<td>' + esc(r.tipo_persona || '—') + '</td>' +
            '<td class="fw-semibold">' + esc(r.persona || '—') + '</td>' +
            '<td><span class="badge bg-light text-dark border">' + esc(r.moneda || 'SOLES') + '</span></td>' +
            '<td class="text-end font-monospace fw-bold text-dark">' + fmtMoney(r.importe_total) + '</td>' +
            '<td class="text-center font-monospace">' + fmtMoney(r.tipo_cambio) + '</td>' +
            '<td>' + esc(r.modalidad_pago || '—') + '</td>' +
            '<td>' + esc(r.cuenta_bancaria_persona || '—') + '</td>' +
            '<td>' + esc(r.cuenta_bancaria_empresa || '—') + '</td>' +
            '<td>' + esc(r.tipo_comprobante || '—') + '</td>' +
            '<td>' + esc(r.numero_factura || '—') + '</td>' +
            '<td>' + esc(r.numero_constancia_deposito || '—') + '</td>' +
            '<td class="text-center">' + archivoHtml + '</td>' +
            '<td class="text-center">' + sustentoHtml + '</td>' +
            '<td>' + esc(r.usuario_creacion || '—') + '</td>' +
            '<td>' + esc(r.usuario_aprobacion || '—') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;
};

// ── 4. Ordenamiento de Columnas ─────────────────────────────────
window.cajaOrdenarTabla = function(colName) {
    if (window._cajaOrdenSort.col === colName) {
        window._cajaOrdenSort.asc = !window._cajaOrdenSort.asc;
    } else {
        window._cajaOrdenSort.col = colName;
        window._cajaOrdenSort.asc = true;
    }

    var asc = window._cajaOrdenSort.asc;
    window._cajaDataFiltrada.sort(function(a, b) {
        var va = a[colName] != null ? a[colName] : '';
        var vb = b[colName] != null ? b[colName] : '';
        if (typeof va === 'number' && typeof vb === 'number') {
            return asc ? va - vb : vb - va;
        }
        return asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });

    window.cajaRenderizarTabla();
};

// ── 5. Abrir Modal y Limpiar Formulario ──────────────────────────
window.cajaAbrirModalNuevo = function() {
    var form = document.getElementById('formNuevaCaja');
    if (form) form.reset();

    var idEl = document.getElementById('caja-input-id');
    if (idEl) idEl.value = '';

    var lbl = document.getElementById('modalCajaFormLabel');
    if (lbl) lbl.textContent = 'Nueva Caja';

    var hoy = new Date();
    var ymd = hoy.toISOString().slice(0, 10);
    var hhmmss = hoy.toTimeString().slice(0, 8);

    var fEl = document.getElementById('caja-input-fecha');
    var hEl = document.getElementById('caja-input-hora');
    var serieEl = document.getElementById('caja-input-serie');

    if (fEl) fEl.value = ymd;
    if (hEl) hEl.value = hhmmss;
    if (serieEl) serieEl.value = String(hoy.getFullYear());

    // Tipo de Persona por defecto ADMINISTRATIVO (si no se selecciona viaje)
    var tipoPerEl = document.getElementById('caja-input-tipo-persona');
    if (tipoPerEl) tipoPerEl.value = 'ADMINISTRATIVO';
    window.cajaAlCambiarTipoPersona('ADMINISTRATIVO');

    // Reiniciar moneda y TC
    window.cajaAlCambiarMoneda('SOLES');

    // Cargar cuentas de bancos de empresa
    window.cajaCargarBancosSelect();

    // Poblar catálogo de Motivos y Submotivos
    window.cajaPoblarMotivosSelect('');

    // Cargar selector de Centros de Costos
    window.cajaCargarCentrosCostosSelect('');
    window.cajaAlCambiarCentroCosto('');

    // Obtener siguiente correlativo automático
    window.cajaActualizarCorrelativo();

    var modalEl = document.getElementById('modalCajaForm');
    if (modalEl) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
};

// Abrir modal en modo edición
window.cajaAbrirModalEditar = function(id) {
    var r = (window._cajaData || []).find(function(item) { return item.id == id; });
    if (!r) return;

    var est = (r.estado || 'REGISTRADO').toUpperCase();
    if (est !== 'REGISTRADO' && est !== 'PENDIENTE') {
        alert('Esta caja ya está en estado ' + est + ' y no puede ser editada.');
        return;
    }

    var form = document.getElementById('formNuevaCaja');
    if (form) form.reset();

    var idEl = document.getElementById('caja-input-id');
    if (idEl) idEl.value = r.id;

    var lbl = document.getElementById('modalCajaFormLabel');
    if (lbl) lbl.textContent = 'Editar Caja: ' + (r.serie ? (r.serie + '-' + r.numero) : r.numero);

    if (document.getElementById('caja-input-serie')) document.getElementById('caja-input-serie').value = r.serie || '2026';
    if (document.getElementById('caja-input-numero')) document.getElementById('caja-input-numero').value = r.numero || '';
    if (document.getElementById('caja-input-num-factura')) document.getElementById('caja-input-num-factura').value = r.numero_factura || '';
    if (document.getElementById('caja-input-constancia')) document.getElementById('caja-input-constancia').value = r.numero_constancia_deposito || '';
    if (document.getElementById('caja-input-fecha')) document.getElementById('caja-input-fecha').value = r.fecha || '';
    if (document.getElementById('caja-input-hora')) document.getElementById('caja-input-hora').value = r.hora || '';
    if (document.getElementById('caja-input-orden-viaje')) document.getElementById('caja-input-orden-viaje').value = r.orden_viaje || '';
    if (document.getElementById('caja-input-conductor')) document.getElementById('caja-input-conductor').value = r.conductor || '';
    if (document.getElementById('caja-input-ruta')) document.getElementById('caja-input-ruta').value = r.ruta_viaje || '';
    if (document.getElementById('caja-input-placa')) document.getElementById('caja-input-placa').value = r.placa || '';
    if (document.getElementById('caja-input-autoriza')) document.getElementById('caja-input-autoriza').value = r.autoriza || '';
    if (document.getElementById('caja-input-tipo-persona')) document.getElementById('caja-input-tipo-persona').value = r.tipo_persona || '';
    if (document.getElementById('caja-input-persona')) document.getElementById('caja-input-persona').value = r.persona || '';
    if (document.getElementById('caja-input-importe-total')) document.getElementById('caja-input-importe-total').value = r.importe_total || 0;
    if (document.getElementById('caja-input-moneda')) document.getElementById('caja-input-moneda').value = r.moneda || 'SOLES';
    if (document.getElementById('caja-input-modalidad')) document.getElementById('caja-input-modalidad').value = r.modalidad_pago || 'TRANSFERENCIA BANCARIA';
    if (document.getElementById('caja-input-cuenta-persona')) document.getElementById('caja-input-cuenta-persona').value = r.cuenta_bancaria_persona || '';
    if (document.getElementById('caja-input-tipo-comprobante')) document.getElementById('caja-input-tipo-comprobante').value = r.tipo_comprobante || '';
    if (document.getElementById('caja-input-observacion')) document.getElementById('caja-input-observacion').value = r.observacion || '';
    if (document.getElementById('caja-check-no-aplica-liq')) document.getElementById('caja-check-no-aplica-liq').checked = !!r.no_aplica_liquidacion;

    // Poblar Motivos y Submotivos guardados
    window.cajaPoblarMotivosSelect(r.motivo, r.sub_motivo);

    // Cargar Centros de Costos con el valor guardado
    window.cajaCargarCentrosCostosSelect(r.centro_costo);
    setTimeout(function() {
        window.cajaAlCambiarCentroCosto(r.centro_costo);
    }, 250);

    window.cajaAlCambiarMoneda(r.moneda || 'SOLES');
    if (document.getElementById('caja-input-tipo-cambio') && r.tipo_cambio) {
        document.getElementById('caja-input-tipo-cambio').value = r.tipo_cambio;
    }

    window.cajaCargarBancosSelect(r.cuenta_bancaria_empresa);

    var modalEl = document.getElementById('modalCajaForm');
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

// Cambio de moneda (mostrar TC si es DOLARES)
window.cajaAlCambiarMoneda = function(moneda) {
    var wrapTc = document.getElementById('caja-wrap-tc');
    var tcInput = document.getElementById('caja-input-tipo-cambio');
    if (!wrapTc) return;

    if (moneda === 'DOLARES') {
        wrapTc.style.display = 'block';
        if (tcInput && (!tcInput.value || tcInput.value == '1' || tcInput.value == '1.0000')) {
            tcInput.value = '3.400';
        }
    } else {
        wrapTc.style.display = 'none';
        if (tcInput) tcInput.value = '1.000';
    }
};

// ── CARGA Y ENLACE INTELIGENTE DE MOTIVOS Y CENTROS DE COSTOS ───
window.cajaCargarCentrosCostosSelect = async function(seleccionado) {
    var sel = document.getElementById('caja-input-centro-costo');
    if (!sel) return;
    try {
        var resp = await fetch('/api/tesoreria/centros-costos');
        var res = await resp.json();
        sel.innerHTML = '<option value="">-- Seleccione Centro de Costos --</option>';
        if (res.ok && Array.isArray(res.data)) {
            window._cajaCentrosCostosList = res.data;
            res.data.forEach(function(c) {
                if (c.estado === 'INACTIVO') return;
                var label = c.codigo + ' - ' + c.nombre + (c.cuenta_contable ? (' (' + c.cuenta_contable + ')') : '');
                var val = c.codigo + ': ' + c.nombre;
                var opt = new Option(label, val);
                opt.dataset.codigo = c.codigo;
                opt.dataset.requierePlaca = c.requiere_placa;
                if (seleccionado && (val === seleccionado || c.codigo === seleccionado || c.nombre === seleccionado)) {
                    opt.selected = true;
                }
                sel.add(opt);
            });
        }
    } catch(e) {
        console.warn('Error cargando centros de costos:', e);
    }
};

window._cajaMotivosGastosRaw = [];

window.cajaCargarCatalogoMotivosAPI = async function() {
    try {
        var resp = await fetch('/api/tesoreria/motivos-gastos?solo_activos=1');
        var res = await resp.json();
        if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
            window._cajaMotivosGastosRaw = res.data;
            var catObj = {};
            res.data.forEach(function(item) {
                var m = item.motivo;
                if (!catObj[m]) {
                    catObj[m] = {
                        ccSugerido: item.centro_costo_codigo || null,
                        submotivos: [],
                        mapSubmotivos: {}
                    };
                }
                if (!catObj[m].submotivos.includes(item.sub_motivo)) {
                    catObj[m].submotivos.push(item.sub_motivo);
                }
                catObj[m].mapSubmotivos[item.sub_motivo] = item.centro_costo_codigo || catObj[m].ccSugerido;
            });
            window.CATALOGO_GASTOS = catObj;
        }
    } catch(e) {
        console.warn('Error cargando motivos desde backend, usando catálogo base:', e);
    }
};

window.cajaPoblarMotivosSelect = async function(motivoSel, submotivoSel) {
    var selMot = document.getElementById('caja-input-motivo');
    var selSub = document.getElementById('caja-input-submotivo');
    if (!selMot) return;

    if (!window._cajaMotivosGastosRaw || !window._cajaMotivosGastosRaw.length) {
        await window.cajaCargarCatalogoMotivosAPI();
    }

    selMot.innerHTML = '<option value="">-- Seleccione Motivo --</option>';
    Object.keys(window.CATALOGO_GASTOS).forEach(function(cat) {
        var opt = new Option(cat, cat);
        if (motivoSel && cat === motivoSel) opt.selected = true;
        selMot.add(opt);
    });

    if (motivoSel) {
        window.cajaPoblarSubmotivosSelect(motivoSel, submotivoSel);
    } else if (selSub) {
        selSub.innerHTML = '<option value="">-- Primero elija Motivo --</option>';
    }
};

window.cajaPoblarSubmotivosSelect = function(motivo, submotivoSel) {
    var selSub = document.getElementById('caja-input-submotivo');
    if (!selSub) return;

    var catObj = window.CATALOGO_GASTOS[motivo];
    if (!catObj || !catObj.submotivos) {
        selSub.innerHTML = '<option value="">-- Seleccione Sub Motivo --</option>';
        return;
    }

    selSub.innerHTML = '<option value="">-- Seleccione Sub Motivo --</option>';
    catObj.submotivos.forEach(function(sub) {
        var opt = new Option(sub, sub);
        if (submotivoSel && sub === submotivoSel) opt.selected = true;
        selSub.add(opt);
    });
};

window.cajaAlCambiarMotivo = function(motivo) {
    window.cajaPoblarSubmotivosSelect(motivo);

    // Sugerir automáticamente el Centro de Costos correspondiente si está configurado
    var catObj = window.CATALOGO_GASTOS[motivo];
    if (catObj && catObj.ccSugerido) {
        window.cajaSugerirCentroCosto(catObj.ccSugerido);
    }
};

window.cajaAlCambiarSubmotivo = function(submotivo) {
    var mot = (document.getElementById('caja-input-motivo') || {}).value;
    var catObj = window.CATALOGO_GASTOS[mot];
    if (catObj && catObj.mapSubmotivos && catObj.mapSubmotivos[submotivo]) {
        window.cajaSugerirCentroCosto(catObj.mapSubmotivos[submotivo]);
    } else if (catObj && catObj.ccSugerido) {
        window.cajaSugerirCentroCosto(catObj.ccSugerido);
    }
};

window.cajaSugerirCentroCosto = function(codigoCC) {
    if (!codigoCC) return;
    var selCC = document.getElementById('caja-input-centro-costo');
    if (!selCC) return;
    for (var i = 0; i < selCC.options.length; i++) {
        var opt = selCC.options[i];
        if (opt.dataset && opt.dataset.codigo === codigoCC) {
            selCC.selectedIndex = i;
            window.cajaAlCambiarCentroCosto(opt.value);
            break;
        }
    }
};

// ── Métodos para Modal Rápido de Gestión de Motivos ──
window.cajaAbrirModalGestionMotivos = async function() {
    var selCC = document.getElementById('caja-quick-centro-costo');
    if (selCC) {
        selCC.innerHTML = '<option value="">-- Sin sugerencia --</option>';
        (window._cajaCentrosCostosList || []).forEach(function(c) {
            if (c.estado === 'INACTIVO') return;
            selCC.add(new Option(c.codigo + ' - ' + c.nombre, c.codigo));
        });
    }

    await window.cajaCargarTablaMotivosModal();
    var modalEl = document.getElementById('modalCajaGestionMotivos');
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.cajaCargarTablaMotivosModal = async function() {
    var tbody = document.getElementById('caja-motivos-tbody');
    var badgeCount = document.getElementById('caja-badge-motivos-count');
    var dl = document.getElementById('caja-dl-motivos-existentes');
    if (!tbody) return;

    try {
        var resp = await fetch('/api/tesoreria/motivos-gastos');
        var res = await resp.json();
        if (res.ok && Array.isArray(res.data)) {
            window._cajaTodosMotivosList = res.data;
            if (badgeCount) badgeCount.textContent = res.data.length + ' Conceptos Registrados';

            // Datalist de motivos principales para autocompletar
            if (dl) {
                var unicos = Array.from(new Set(res.data.map(function(d) { return d.motivo; })));
                dl.innerHTML = unicos.map(function(m) { return '<option value="' + m + '">'; }).join('');
            }

            window.cajaRenderizarFilasMotivos(res.data);
        }
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-danger">Error: ' + e.message + '</td></tr>';
    }
};

window.cajaRenderizarFilasMotivos = function(items) {
    var tbody = document.getElementById('caja-motivos-tbody');
    if (!tbody) return;

    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted">No hay motivos registrados.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(function(item) {
        var ccLabel = item.centro_costo_codigo ? ('<span class="badge" style="background:#eff6ff; color:#2563eb; font-weight:700; border-radius:6px; padding:3px 8px; font-family:monospace;">' + item.centro_costo_codigo + '</span>') : '<span class="text-muted opacity-50">—</span>';
        var est = item.estado === 'ACTIVO' ? '<span class="badge" style="background:#ecfdf5; color:#059669; font-weight:700; border-radius:8px; padding:4px 10px; font-size:0.75rem;">ACTIVO</span>' : '<span class="badge" style="background:#f1f5f9; color:#64748b; font-weight:700; border-radius:8px; padding:4px 10px; font-size:0.75rem;">INACTIVO</span>';
        return '<tr>' +
            '<td class="fw-bold text-dark" style="font-size:0.86rem;">' + item.motivo + '</td>' +
            '<td class="fw-semibold text-secondary" style="font-size:0.85rem;">' + item.sub_motivo + '</td>' +
            '<td>' + ccLabel + '</td>' +
            '<td class="text-center">' + est + '</td>' +
            '<td class="text-center">' +
                '<button type="button" class="btn-action-pastel btn-delete" onclick="window.cajaEliminarMotivoGasto(' + item.id + ')" title="Eliminar concepto">' +
                    '<i class="bi bi-trash"></i>' +
                '</button>' +
            '</td>' +
        '</tr>';
    }).join('');
};

window.cajaFiltrarTablaMotivos = function(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) {
        window.cajaRenderizarFilasMotivos(window._cajaTodosMotivosList || []);
        return;
    }
    var filtrados = (window._cajaTodosMotivosList || []).filter(function(item) {
        return (item.motivo && item.motivo.toLowerCase().includes(q)) ||
               (item.sub_motivo && item.sub_motivo.toLowerCase().includes(q)) ||
               (item.centro_costo_codigo && item.centro_costo_codigo.toLowerCase().includes(q));
    });
    window.cajaRenderizarFilasMotivos(filtrados);
};

window.cajaGuardarNuevoMotivo = async function(e) {
    if (e && e.preventDefault) e.preventDefault();
    var mot = ((document.getElementById('caja-quick-motivo') || {}).value || '').trim();
    var sub = ((document.getElementById('caja-quick-submotivo') || {}).value || '').trim();
    var cc = ((document.getElementById('caja-quick-centro-costo') || {}).value || '').trim();

    if (!mot || !sub) return alert('Motivo Principal y Sub Motivo son obligatorios.');

    var btn = document.getElementById('caja-btn-guardar-motivo');
    if (btn) { btn.disabled = true; btn.innerHTML = 'Guardando...'; }

    try {
        var resp = await fetch('/api/tesoreria/motivos-gastos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo: mot, sub_motivo: sub, centro_costo_codigo: cc, estado: 'ACTIVO' })
        });
        var res = await resp.json();
        if (res.ok) {
            document.getElementById('caja-quick-submotivo').value = '';
            await window.cajaCargarCatalogoMotivosAPI();
            await window.cajaCargarTablaMotivosModal();
            // Actualizar selectores del formulario principal de Caja
            window.cajaPoblarMotivosSelect(mot, sub);
            if (cc) window.cajaSugerirCentroCosto(cc);
        } else {
            alert('Error: ' + res.error);
        }
    } catch(err) {
        alert('Error: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Guardar Concepto'; }
    }
};

window.cajaEliminarMotivoGasto = async function(id) {
    if (!confirm('¿Está seguro de eliminar este concepto de gasto?')) return;
    try {
        var resp = await fetch('/api/tesoreria/motivos-gastos/' + id, { method: 'DELETE' });
        var res = await resp.json();
        if (res.ok) {
            await window.cajaCargarCatalogoMotivosAPI();
            await window.cajaCargarTablaMotivosModal();
            window.cajaPoblarMotivosSelect();
        } else {
            alert('Error al eliminar: ' + res.error);
        }
    } catch(e) {
        alert('Error: ' + e.message);
    }
};

window.cajaAlCambiarCentroCosto = function(valorCC) {
    var selCC = document.getElementById('caja-input-centro-costo');
    var reqPlacaEl = document.getElementById('caja-req-placa');
    var inputPlaca = document.getElementById('caja-input-placa');

    var reqPlaca = false;
    if (selCC && selCC.selectedOptions && selCC.selectedOptions[0]) {
        reqPlaca = (selCC.selectedOptions[0].dataset.requierePlaca == 1);
    }

    if (reqPlacaEl) reqPlacaEl.style.display = reqPlaca ? 'inline' : 'none';
    if (inputPlaca) {
        if (reqPlaca) {
            inputPlaca.classList.add('border-warning');
            inputPlaca.placeholder = 'Requerido para este CC (ej: B00835)';
        } else {
            inputPlaca.classList.remove('border-warning');
            inputPlaca.placeholder = 'Opcional (ej: B00835)';
        }
    }
};

// Cargar Cuentas Bancarias de Empresa en el selector
window.cajaCargarBancosSelect = async function(seleccionado) {
    var sel = document.getElementById('caja-input-cuenta-empresa');
    if (!sel) return;
    try {
        var resp = await fetch('/api/tesoreria/bancos');
        var res = await resp.json();
        sel.innerHTML = '<option value="">Seleccionar cuenta...</option>';
        if (res.ok && Array.isArray(res.data)) {
            res.data.forEach(function(b) {
                var label = b.banco + ' - ' + b.numero_cuenta + ' (' + b.moneda + ')';
                var opt = new Option(label, label);
                if (seleccionado && label === seleccionado) opt.selected = true;
                sel.add(opt);
            });
        }
    } catch(e) {
        console.warn('Error cargando bancos:', e);
    }
};

// Generar correlativo siguiente
window.cajaActualizarCorrelativo = function() {
    var serie = ((document.getElementById('caja-input-serie') || {}).value || '2026').trim();
    fetch('/api/tesoreria/caja/siguiente-numero?serie=' + encodeURIComponent(serie))
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res.ok && res.numero) {
                var numEl = document.getElementById('caja-input-numero');
                if (numEl) numEl.value = res.numero;
            }
        })
        .catch(function(err) { console.warn('Error al generar correlativo:', err); });
};

// ── 6. Datalist y Autocompletado de Órdenes de Viaje ─────────────
window.cajaCargarOrdenesViajeDatalist = function() {
    fetch('/api/tesoreria/caja/buscar-ordenes-viaje')
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res.ok && res.data) {
                window._cajaOrdenesViajeList = res.data;
                var dl = document.getElementById('caja-dl-ordenes-viaje');
                if (dl) {
                    dl.innerHTML = res.data.map(function(o) {
                        return '<option value="' + o.viaje + '">' + (o.conductor || '') + ' (' + (o.placa_tracto || '') + ' - ' + (o.ruta || '') + ')</option>';
                    }).join('');
                }
            }
        })
        .catch(function(err) { console.warn('Error cargando órdenes de viaje:', err); });
};

window.cajaAlSeleccionarOrdenViaje = function(viaje) {
    if (!viaje || !window._cajaOrdenesViajeList) return;
    var encontrado = window._cajaOrdenesViajeList.find(function(o) {
        return o.viaje.trim().toLowerCase() === viaje.trim().toLowerCase();
    });

    if (encontrado) {
        var cEl = document.getElementById('caja-input-conductor');
        var rEl = document.getElementById('caja-input-ruta');
        var pEl = document.getElementById('caja-input-placa');
        var perEl = document.getElementById('caja-input-persona');
        var tipoPerEl = document.getElementById('caja-input-tipo-persona');

        if (cEl) cEl.value = encontrado.conductor || '';
        if (rEl) rEl.value = encontrado.ruta || '';
        if (pEl) pEl.value = encontrado.placa_tracto || '';
        
        // Al vincular una orden de viaje, cambiar automáticamente a CONDUCTOR y poner el nombre
        if (tipoPerEl) {
            tipoPerEl.value = 'CONDUCTOR';
            window.cajaAlCambiarTipoPersona('CONDUCTOR');
        }
        if (perEl && encontrado.conductor) {
            perEl.value = encontrado.conductor;
        }

        // Sugerir automáticamente Centro de Costos de Operaciones de Ruta (CC-300)
        window.cajaSugerirCentroCosto('CC-300');

        // Si el motivo está vacío, preseleccionar Gastos de Viaje y Ruta
        var motEl = document.getElementById('caja-input-motivo');
        if (motEl && !motEl.value) {
            motEl.value = 'Gastos de Viaje y Ruta';
            window.cajaPoblarSubmotivosSelect('Gastos de Viaje y Ruta');
        }
    }
};

// ── 6.1 Catálogos dinámicos para Tipo de Persona y Beneficiarios ───
window._cajaPersonalList = window._cajaPersonalList || [];
window._cajaProveedoresList = window._cajaProveedoresList || [];

window.cajaCargarDirectorioYProveedores = async function() {
    // 1. Cargar Personal / Conductores
    if (!window._cajaPersonalList.length) {
        try {
            var rPersonal = await fetch('/api/seguridad/recursos');
            var dataP = await rPersonal.json();
            if (dataP && Array.isArray(dataP.conductores)) {
                window._cajaPersonalList = dataP.conductores;
            }
        } catch(e) {
            console.warn('Error cargando personal:', e);
        }
    }
    // 2. Cargar Proveedores y sus cuentas bancarias
    if (!window._cajaProveedoresList.length) {
        try {
            var rProv = await fetch('/api/almacen/proveedores');
            var dataProv = await rProv.json();
            if (Array.isArray(dataProv)) {
                window._cajaProveedoresList = dataProv;
            }
        } catch(e) {
            console.warn('Error cargando proveedores:', e);
        }
    }
};

window.cajaAlCambiarTipoPersona = function(tipo) {
    tipo = (tipo || '').toUpperCase();
    var dlBen = document.getElementById('caja-dl-beneficiarios');
    var dlCuentas = document.getElementById('caja-dl-cuentas-persona');
    var inputPersona = document.getElementById('caja-input-persona');
    var inputCuentaPersona = document.getElementById('caja-input-cuenta-persona');

    if (dlCuentas) dlCuentas.innerHTML = '';

    if (tipo === 'CONDUCTOR' || tipo === 'ADMINISTRATIVO') {
        // Asegurar carga de personal
        window.cajaCargarDirectorioYProveedores().then(function() {
            if (dlBen) {
                dlBen.innerHTML = (window._cajaPersonalList || []).map(function(nombre) {
                    return '<option value="' + nombre + '">';
                }).join('');
            }
        });
        if (inputPersona) inputPersona.placeholder = 'Seleccione o escriba personal / conductor...';
    } else if (tipo === 'PROVEEDOR') {
        window.cajaCargarDirectorioYProveedores().then(function() {
            if (dlBen) {
                dlBen.innerHTML = (window._cajaProveedoresList || []).map(function(p) {
                    var display = (p.razon_social || p.nombre || '') + (p.numero_documento ? (' (' + p.numero_documento + ')') : '');
                    return '<option value="' + (p.razon_social || p.nombre || '') + '" label="' + display + '">';
                }).join('');
            }
        });
        if (inputPersona) inputPersona.placeholder = 'Seleccione o escriba nombre de proveedor...';
    } else if (tipo === 'BANCO') {
        if (dlBen) dlBen.innerHTML = '';
        if (inputPersona) {
            inputPersona.placeholder = 'Nombre de banco o entidad financiera...';
        }
        if (inputCuentaPersona) {
            inputCuentaPersona.placeholder = 'N° de cuenta bancaria...';
        }
    }
};

window.cajaAlSeleccionarPersona = function(nombrePersona) {
    if (!nombrePersona) return;
    var tipo = ((document.getElementById('caja-input-tipo-persona') || {}).value || '').toUpperCase();
    var dlCuentas = document.getElementById('caja-dl-cuentas-persona');
    var inputCuentaPersona = document.getElementById('caja-input-cuenta-persona');
    if (!dlCuentas) return;

    if (tipo === 'PROVEEDOR' && window._cajaProveedoresList) {
        var cleanNom = nombrePersona.trim().toLowerCase();
        var prov = window._cajaProveedoresList.find(function(p) {
            return (p.razon_social && p.razon_social.toLowerCase() === cleanNom) ||
                   (p.nombre && p.nombre.toLowerCase() === cleanNom);
        });

        if (prov && Array.isArray(prov.cuentas) && prov.cuentas.length > 0) {
            dlCuentas.innerHTML = prov.cuentas.map(function(c) {
                var cLabel = (c.banco || '') + ' - ' + (c.numero_cuenta || '') + (c.tipo_cuenta ? (' (' + c.tipo_cuenta + ')') : '');
                return '<option value="' + cLabel + '">';
            }).join('');

            // Si hay exactamente una cuenta bancaria o el campo está vacío, sugerir la primera
            if (inputCuentaPersona && (!inputCuentaPersona.value || prov.cuentas.length === 1)) {
                var first = prov.cuentas[0];
                inputCuentaPersona.value = (first.banco || '') + ' - ' + (first.numero_cuenta || '');
            }
        } else {
            dlCuentas.innerHTML = '';
        }
    }
};

// ── 8. Guardar Formulario (Crear o Editar) ──────────────────────
window.cajaGuardarFormulario = async function(e) {
    if (e && e.preventDefault) e.preventDefault();

    var centroCostoVal = (document.getElementById('caja-input-centro-costo') || {}).value || '';
    var placaVal = ((document.getElementById('caja-input-placa') || {}).value || '').trim();

    // Validar si el centro de costos seleccionado exige placa
    var selCC = document.getElementById('caja-input-centro-costo');
    var reqPlaca = false;
    if (selCC && selCC.selectedOptions && selCC.selectedOptions[0]) {
        reqPlaca = (selCC.selectedOptions[0].dataset.requierePlaca == 1);
    }
    if (reqPlaca && !placaVal) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({ icon: 'warning', title: 'Placa Requerida', text: 'El Centro de Costos seleccionado requiere especificar la Placa de la unidad.' });
        } else {
            alert('El Centro de Costos seleccionado requiere especificar la Placa de la unidad.');
        }
        var pInput = document.getElementById('caja-input-placa');
        if (pInput) pInput.focus();
        return;
    }

    var btnSubmit = document.getElementById('caja-btn-submit');
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
    }

    var editId = (document.getElementById('caja-input-id') || {}).value;
    var formData = new FormData();
    formData.append('fecha', (document.getElementById('caja-input-fecha') || {}).value || '');
    formData.append('hora', (document.getElementById('caja-input-hora') || {}).value || '');
    formData.append('numero_constancia_deposito', (document.getElementById('caja-input-constancia') || {}).value || '');
    formData.append('numero_factura', (document.getElementById('caja-input-num-factura') || {}).value || '');
    formData.append('serie', (document.getElementById('caja-input-serie') || {}).value || '2026');
    formData.append('numero', (document.getElementById('caja-input-numero') || {}).value || '');
    formData.append('orden_viaje', (document.getElementById('caja-input-orden-viaje') || {}).value || '');
    formData.append('conductor', (document.getElementById('caja-input-conductor') || {}).value || '');
    formData.append('ruta_viaje', (document.getElementById('caja-input-ruta') || {}).value || '');
    formData.append('placa', placaVal);
    formData.append('autoriza', (document.getElementById('caja-input-autoriza') || {}).value || '');
    formData.append('motivo', (document.getElementById('caja-input-motivo') || {}).value || '');
    formData.append('sub_motivo', (document.getElementById('caja-input-submotivo') || {}).value || '');
    formData.append('centro_costo', centroCostoVal);
    formData.append('modalidad_pago', (document.getElementById('caja-input-modalidad') || {}).value || '');
    formData.append('moneda', (document.getElementById('caja-input-moneda') || {}).value || 'SOLES');
    formData.append('tipo_cambio', (document.getElementById('caja-input-tipo-cambio') || {}).value || '1.000');
    formData.append('tipo_persona', (document.getElementById('caja-input-tipo-persona') || {}).value || '');
    formData.append('persona', (document.getElementById('caja-input-persona') || {}).value || '');
    formData.append('importe_total', (document.getElementById('caja-input-importe-total') || {}).value || '0');
    formData.append('descripcion', (document.getElementById('caja-input-descripcion') || {}).value || 'Movimiento de Caja');
    formData.append('tipo_comprobante', (document.getElementById('caja-input-tipo-comprobante') || {}).value || '');
    formData.append('cuenta_bancaria_persona', (document.getElementById('caja-input-cuenta-persona') || {}).value || '');
    formData.append('cuenta_bancaria_empresa', (document.getElementById('caja-input-cuenta-empresa') || {}).value || '');
    formData.append('observacion', (document.getElementById('caja-input-observacion') || {}).value || '');
    formData.append('no_aplica_liquidacion', (document.getElementById('caja-check-no-aplica-liq') || {}).checked ? 1 : 0);

    // Archivos adjuntos
    var fVoucher = (document.getElementById('caja-input-file-voucher') || {}).files;
    if (fVoucher && fVoucher[0]) formData.append('voucher', fVoucher[0]);

    var fSustento = (document.getElementById('caja-input-file-sustento') || {}).files;
    if (fSustento && fSustento[0]) formData.append('sustento', fSustento[0]);

    try {
        var url = editId ? ('/api/tesoreria/caja/' + editId) : '/api/tesoreria/caja';
        var method = editId ? 'PUT' : 'POST';

        var resp = await fetch(url, {
            method: method,
            body: formData
        });
        var res = await resp.json();
        if (res.ok) {
            var modalEl = document.getElementById('modalCajaForm');
            if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();

            await window.cajaCargarMovimientos();
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'success', title: '¡Guardado!', text: 'El registro de caja fue guardado correctamente.', timer: 2000, showConfirmButton: false });
            } else {
                alert('Registro de caja guardado con éxito.');
            }
        } else {
            alert('Error al guardar: ' + (res.error || 'No se pudo procesar la solicitud'));
        }
    } catch (err) {
        console.error('Error al enviar formulario de caja:', err);
        alert('Error de conexión: ' + err.message);
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = 'Guardar';
        }
    }
};

// ── 9. Aprobar Caja ─────────────────────────────────────────────
window.cajaAprobar = async function(id) {
    if (!confirm('¿Desea aprobar este registro de caja? Una vez aprobado ya no podrá ser editado directamente.')) return;
    try {
        var resp = await fetch('/api/tesoreria/caja/' + id + '/aprobar', { method: 'POST' });
        var res = await resp.json();
        if (res.ok) {
            await window.cajaCargarMovimientos();
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'success', title: '¡Aprobado!', text: 'La caja fue aprobada con éxito.', timer: 1800, showConfirmButton: false });
            } else {
                alert('Caja aprobada con éxito.');
            }
        } else {
            alert('Error al aprobar: ' + (res.error || 'No se pudo procesar'));
        }
    } catch(e) {
        alert('Error: ' + e.message);
    }
};

// ── 10. Subir Documentos (Para cajas aprobadas) ──────────────────
window.cajaAbrirModalSubirDocs = function(id) {
    var r = (window._cajaData || []).find(function(item) { return item.id == id; });
    if (!r) return;

    var idEl = document.getElementById('caja-docs-id');
    var numEl = document.getElementById('caja-docs-numero');
    var fecEl = document.getElementById('caja-docs-fecha');
    var constEl = document.getElementById('caja-docs-constancia');
    var factEl = document.getElementById('caja-docs-factura');

    if (idEl) idEl.value = r.id;
    if (numEl) numEl.value = (r.serie && r.numero) ? (r.serie + '-' + r.numero) : r.numero;
    if (fecEl) fecEl.value = r.fecha || '';
    if (constEl) constEl.value = r.numero_constancia_deposito || '';
    if (factEl) factEl.value = r.numero_factura || '';

    // Limpiar inputs file
    if (document.getElementById('caja-docs-voucher')) document.getElementById('caja-docs-voucher').value = '';
    if (document.getElementById('caja-docs-sustento')) document.getElementById('caja-docs-sustento').value = '';

    var modalEl = document.getElementById('modalCajaSubirDocs');
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.cajaGuardarSubirDocumentos = async function(e) {
    if (e && e.preventDefault) e.preventDefault();

    var id = (document.getElementById('caja-docs-id') || {}).value;
    if (!id) return;

    var btn = document.getElementById('caja-docs-btn-submit');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Subiendo...';
    }

    var formData = new FormData();
    formData.append('numero_constancia_deposito', (document.getElementById('caja-docs-constancia') || {}).value || '');
    formData.append('numero_factura', (document.getElementById('caja-docs-factura') || {}).value || '');

    var vFile = (document.getElementById('caja-docs-voucher') || {}).files;
    if (vFile && vFile[0]) formData.append('voucher', vFile[0]);

    var sFile = (document.getElementById('caja-docs-sustento') || {}).files;
    if (sFile && sFile[0]) formData.append('sustento', sFile[0]);

    try {
        var resp = await fetch('/api/tesoreria/caja/' + id + '/subir-documentos', {
            method: 'POST',
            body: formData
        });
        var res = await resp.json();
        if (res.ok) {
            var modalEl = document.getElementById('modalCajaSubirDocs');
            if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();

            await window.cajaCargarMovimientos();
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'success', title: '¡Comprobantes Subidos!', text: 'El estado ha pasado a PROCESADO.', timer: 2000, showConfirmButton: false });
            } else {
                alert('Documentos guardados con éxito. Estado actualizado a PROCESADO.');
            }
        } else {
            alert('Error al subir: ' + (res.error || 'No se pudo guardar'));
        }
    } catch(err) {
        alert('Error de conexión: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Guardar';
        }
    }
};

// ── 11. Gestión de Bancos Modal ─────────────────────────────────
window.cajaAbrirModalBancos = function() {
    window.cajaCargarTablaBancos();
    var modalEl = document.getElementById('modalCajaBancos');
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.cajaCargarTablaBancos = async function() {
    var tbody = document.getElementById('caja-bancos-tbody');
    if (!tbody) return;
    try {
        var resp = await fetch('/api/tesoreria/bancos');
        var res = await resp.json();
        if (res.ok && Array.isArray(res.data)) {
            if (!res.data.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-3 text-muted">No hay cuentas bancarias registradas.</td></tr>';
                return;
            }
            tbody.innerHTML = res.data.map(function(b) {
                return '<tr>' +
                    '<td class="fw-bold">' + (b.banco || '') + '</td>' +
                    '<td>' + (b.titular || '—') + '</td>' +
                    '<td><span class="badge bg-light text-dark border">' + (b.moneda || 'SOLES') + '</span></td>' +
                    '<td class="font-monospace fw-semibold">' + (b.numero_cuenta || '') + '</td>' +
                    '<td class="font-monospace text-muted">' + (b.cci || '—') + '</td>' +
                    '<td>' + (b.tipo_cuenta || 'CORRIENTE') + '</td>' +
                    '<td class="text-center">' +
                        '<button type="button" class="btn btn-outline-danger btn-xs py-0 px-1" onclick="window.cajaEliminarBanco(' + b.id + ')" title="Eliminar cuenta">' +
                            '<i class="bi bi-trash"></i>' +
                        '</button>' +
                    '</td>' +
                '</tr>';
            }).join('');
        }
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-3 text-danger">Error cargando cuentas bancarias</td></tr>';
    }
};

window.cajaGuardarNuevoBanco = async function(e) {
    if (e && e.preventDefault) e.preventDefault();
    var bNombre = (document.getElementById('banco-input-nombre') || {}).value;
    var bNum = (document.getElementById('banco-input-numero') || {}).value;
    if (!bNombre || !bNum) return alert('Banco y Número de cuenta son obligatorios.');

    var payload = {
        banco: bNombre,
        titular: (document.getElementById('banco-input-titular') || {}).value,
        moneda: (document.getElementById('banco-input-moneda') || {}).value,
        numero_cuenta: bNum,
        cci: (document.getElementById('banco-input-cci') || {}).value,
        tipo_cuenta: (document.getElementById('banco-input-tipo') || {}).value
    };

    try {
        var resp = await fetch('/api/tesoreria/bancos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var res = await resp.json();
        if (res.ok) {
            document.getElementById('formNuevoBanco').reset();
            window.cajaCargarTablaBancos();
            window.cajaCargarBancosSelect();
        } else {
            alert('Error al guardar cuenta: ' + res.error);
        }
    } catch(err) {
        alert('Error: ' + err.message);
    }
};

window.cajaEliminarBanco = async function(id) {
    if (!confirm('¿Eliminar esta cuenta bancaria?')) return;
    try {
        var resp = await fetch('/api/tesoreria/bancos/' + id, { method: 'DELETE' });
        var res = await resp.json();
        if (res.ok) {
            window.cajaCargarTablaBancos();
            window.cajaCargarBancosSelect();
        } else {
            alert('Error al eliminar: ' + res.error);
        }
    } catch(e) {
        alert('Error: ' + e.message);
    }
};

// ── 12. Eliminar Registro ───────────────────────────────────────
window.cajaEliminarRegistro = async function(id) {
    if (!confirm('¿Está seguro de eliminar este registro de caja?')) return;
    try {
        var resp = await fetch('/api/tesoreria/caja/' + id, { method: 'DELETE' });
        var res = await resp.json();
        if (res.ok) {
            window.cajaCargarMovimientos();
        } else {
            alert('Error al eliminar: ' + (res.error || 'No se pudo eliminar'));
        }
    } catch (err) {
        alert('Error: ' + err.message);
    }
};

// ── 13. Imprimir y Exportar Excel ───────────────────────────────
window.cajaImprimirTabla = function() {
    window.print();
};

window.cajaExportarExcel = function() {
    if (typeof XLSX === 'undefined') {
        alert('Librería de exportación no cargada');
        return;
    }
    var rows = window._cajaDataFiltrada || [];
    if (!rows.length) {
        alert('No hay datos para exportar');
        return;
    }

    var dataExport = rows.map(function(r) {
        return {
            'FECHA': r.fecha,
            'HORA': r.hora,
            'ESTADO': r.estado,
            'NÚMERO': (r.serie && r.numero) ? (r.serie + '-' + r.numero) : r.numero,
            'VIAJE': r.orden_viaje,
            'CONDUCTOR': r.conductor,
            'RUTA': r.ruta_viaje,
            'AUTORIZA': r.autoriza,
            'PLACA': r.placa || '',
            'CENTRO DE COSTOS': r.centro_costo || '',
            'MOTIVO': r.motivo,
            'SUB MOTIVO': r.sub_motivo,
            'TIPO PERSONA': r.tipo_persona,
            'PERSONA': r.persona,
            'MONEDA': r.moneda,
            'IMPORTE TOTAL': r.importe_total,
            'TC': r.tipo_cambio,
            'MODALIDAD': r.modalidad_pago,
            'CUENTA DESTINO': r.cuenta_bancaria_persona,
            'CUENTA ORIGEN': r.cuenta_bancaria_empresa,
            'COMPROBANTE': r.tipo_comprobante,
            'N° FACTURA': r.numero_factura,
            'N° CONSTANCIA': r.numero_constancia_deposito,
            'USUARIO REGISTRO': r.usuario_creacion,
            'USUARIO APROBACIÓN': r.usuario_aprobacion
        };
    });

    var ws = XLSX.utils.json_to_sheet(dataExport);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Caja');
    XLSX.writeFile(wb, 'Tesoreria_Caja_' + new Date().toISOString().slice(0, 10) + '.xlsx');
};

// ── 14. Selector de Columnas Dinámicas ───────────────────────────
window.cajaInicializarColumnasSelector = function() {
    var menu = document.getElementById('caja-menu-columnas');
    var ths = document.querySelectorAll('#caja-tabla-principal thead th');
    if (!menu || !ths.length) return;

    var html = '';
    ths.forEach(function(th, idx) {
        var colKey = th.getAttribute('data-col');
        var colName = th.innerText.trim();
        if (!colKey) return;

        html += '<div class="form-check my-1">' +
            '<input class="form-check-input" type="checkbox" checked id="chk-col-' + colKey + '" onchange="window.cajaToggleColumna(\'' + colKey + '\', this.checked)">' +
            '<label class="form-check-label" for="chk-col-' + colKey + '">' + colName + '</label>' +
        '</div>';
    });

    menu.innerHTML = html;
};

window.cajaToggleColumna = function(colKey, visible) {
    var ths = document.querySelectorAll('#caja-tabla-principal [data-col="' + colKey + '"]');
    var colIdx = -1;
    document.querySelectorAll('#caja-tabla-principal thead th').forEach(function(th, i) {
        if (th.getAttribute('data-col') === colKey) colIdx = i;
    });

    if (colIdx === -1) return;

    // Toggle header
    document.querySelectorAll('#caja-tabla-principal thead th')[colIdx].style.display = visible ? '' : 'none';

    // Toggle celdas del tbody
    document.querySelectorAll('#caja-tabla-principal tbody tr').forEach(function(tr) {
        if (tr.children[colIdx]) {
            tr.children[colIdx].style.display = visible ? '' : 'none';
        }
    });
};

window.cajaAbrirImportacion = function() {
    alert('Importación masiva de caja disponible próximamente.');
};
