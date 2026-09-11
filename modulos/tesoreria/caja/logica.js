// ================================================================
// MÓDULO TESORERÍA / CAJA — Lógica SPA
// ================================================================

window._cajaData = window._cajaData || [];
window._cajaDataFiltrada = window._cajaDataFiltrada || [];
window._cajaOrdenSort = { col: 'fecha', asc: false };

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
        var est = (r.estado || 'PENDIENTE').toUpperCase();
        if (est === 'APROBADO' || est === 'PAGADO') badgeEstadoClass = 'bg-success';
        else if (est === 'PENDIENTE') badgeEstadoClass = 'bg-warning text-dark';
        else if (est === 'RECHAZADO' || est === 'ANULADO') badgeEstadoClass = 'bg-danger';

        var numDoc = (r.serie && r.numero) ? (r.serie + '-' + r.numero) : (r.numero || '—');

        var archivoHtml = r.voucher_signed ? 
            '<a href="' + r.voucher_signed + '" target="_blank" class="btn btn-xs btn-outline-primary py-0 px-1.5" title="Ver Comprobante/Voucher" style="font-size:0.7rem;"><i class="bi bi-file-earmark-image"></i></a>' : '—';
        
        var sustentoHtml = r.sustento_signed ? 
            '<a href="' + r.sustento_signed + '" target="_blank" class="btn btn-xs btn-outline-secondary py-0 px-1.5" title="Ver Sustento" style="font-size:0.7rem;"><i class="bi bi-paperclip"></i></a>' : '—';

        html += '<tr>' +
            '<td class="text-center">' +
                '<button type="button" class="btn btn-outline-danger btn-sm p-1 rounded-circle lh-1" onclick="window.cajaEliminarRegistro(' + r.id + ')" title="Eliminar registro">' +
                    '<i class="bi bi-trash" style="font-size:0.75rem;"></i>' +
                '</button>' +
            '</td>' +
            '<td>' + fmtDate(r.fecha) + '</td>' +
            '<td><span class="badge ' + badgeEstadoClass + ' px-2 py-1" style="font-size:0.68rem;">' + esc(r.estado) + '</span></td>' +
            '<td class="font-monospace fw-bold text-primary">' + esc(numDoc) + '</td>' +
            '<td>' + esc(r.orden_viaje || '—') + '</td>' +
            '<td><span class="badge bg-light text-dark border font-monospace">' + esc(r.placa || '—') + '</span></td>' +
            '<td>' + esc(r.motivo || '—') + '</td>' +
            '<td>' + esc(r.sub_motivo || '—') + '</td>' +
            '<td>' + esc(r.modalidad_pago || '—') + '</td>' +
            '<td class="text-truncate" style="max-width:200px;" title="' + esc(r.descripcion) + '">' + esc(r.descripcion || '—') + '</td>' +
            '<td>' + esc(r.tipo_persona || '—') + '</td>' +
            '<td class="fw-semibold">' + esc(r.persona || '—') + '</td>' +
            '<td><span class="badge bg-danger-subtle text-danger border border-danger-subtle">' + esc(r.tipo_movimiento || 'EGRESO') + '</span></td>' +
            '<td class="text-end font-monospace">' + fmtMoney(r.subtotal) + '</td>' +
            '<td class="text-end font-monospace text-muted">' + fmtMoney(r.retencion_detraccion) + '</td>' +
            '<td class="text-end font-monospace fw-bold text-dark">' + fmtMoney(r.importe_total) + '</td>' +
            '<td class="text-center font-monospace">' + fmtMoney(r.tipo_cambio) + '</td>' +
            '<td>' + esc(r.tipo_comprobante || '—') + '</td>' +
            '<td class="text-center">' + archivoHtml + '</td>' +
            '<td>' + esc(r.usuario_creacion || '—') + '</td>' +
            '<td>' + esc(r.comentario || '—') + '</td>' +
            '<td>' + esc(r.usuario_aprobacion || '—') + '</td>' +
            '<td>' + esc(r.fecha_aprobacion || '—') + '</td>' +
            '<td>' + esc(r.cuenta_bancaria_empresa || '—') + '</td>' +
            '<td>' + esc(r.numero_factura || '—') + '</td>' +
            '<td>' + esc(r.motivo_anulacion || '—') + '</td>' +
            '<td class="text-center">' + sustentoHtml + '</td>' +
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

    var hoy = new Date();
    var ymd = hoy.toISOString().slice(0, 10);
    var hhmmss = hoy.toTimeString().slice(0, 8);

    var fEl = document.getElementById('caja-input-fecha');
    var hEl = document.getElementById('caja-input-hora');
    var fValEl = document.getElementById('caja-input-fecha-valuta');
    var hValEl = document.getElementById('caja-input-hora-valuta');
    var serieEl = document.getElementById('caja-input-serie');

    if (fEl) fEl.value = ymd;
    if (hEl) hEl.value = hhmmss;
    if (fValEl) fValEl.value = ymd;
    if (hValEl) hValEl.value = hhmmss;
    if (serieEl) serieEl.value = String(hoy.getFullYear());

    // Obtener siguiente correlativo automático
    window.cajaActualizarCorrelativo();

    // Cargar opciones para tipo persona
    var tipoPer = document.getElementById('caja-input-tipo-persona');
    if (tipoPer) {
        tipoPer.value = 'CONDUCTOR';
        window.cajaAlCambiarTipoPersona('CONDUCTOR');
    }

    var modalEl = document.getElementById('modalCajaForm');
    if (modalEl) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
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
        .catch(function(e) { console.warn('Error cargando datalist viajes:', e); });
};

window.cajaAlSeleccionarOrdenViaje = function(val) {
    if (!val || !window._cajaOrdenesViajeList) return;
    var match = window._cajaOrdenesViajeList.find(function(o) {
        return o.viaje && o.viaje.toLowerCase() === val.toLowerCase().trim();
    });

    if (match) {
        var cEl = document.getElementById('caja-input-conductor');
        var rEl = document.getElementById('caja-input-ruta');
        var pEl = document.getElementById('caja-input-placa');
        if (cEl) cEl.value = match.conductor || '';
        if (rEl) rEl.value = match.ruta || '';
        if (pEl) pEl.value = match.placa_tracto || '';

        // Si el tipo de persona es Conductor, seleccionarlo automáticamente
        var perEl = document.getElementById('caja-input-persona');
        if (perEl && match.conductor) {
            // Verificar si existe en el select o agregarlo
            var found = Array.from(perEl.options).some(function(opt) { return opt.value === match.conductor; });
            if (!found) perEl.add(new Option(match.conductor, match.conductor));
            perEl.value = match.conductor;
        }
    }
};

// ── 7. Motivos y Sub Motivos Dinámicos ───────────────────────────
window.cajaAlCambiarMotivo = function(motivo) {
    var subEl = document.getElementById('caja-input-submotivo');
    if (!subEl) return;
    subEl.innerHTML = '<option value="">Seleccione...</option>';

    var mapaSub = {
        'ANTICIPO DE VIAJE': ['VIÁTICOS RUTA', 'ANTICIPO PEAJE', 'ANTICIPO COMBUSTIBLE', 'GASTOS DE DESPACHO'],
        'PEAJES': ['PEAJE ELECTRÓNICO (E-PASS/FACILPASS)', 'PEAJE EN EFECTIVO', 'PENALIDAD PEAJE'],
        'COMBUSTIBLE': ['DIESEL B5 S50', 'UREA LÍQUIDA', 'VALE DE EMERGENCIA'],
        'VIÁTICOS / ALIMENTACIÓN': ['DESAYUNO / ALMUERZO / CENA', 'HOSPEDAJE', 'MOVILIDAD LOCAL'],
        'GASTOS DE RUTA': ['COCHERA / GUARDIANÍA', 'LLANTERÍA / PARCHE', 'BALANZA / PESAJE', 'DESESTIBA / ESTIBA'],
        'REPUESTOS / COMPRAS TALLER': ['FILTROS', 'LUBRICANTES / ACEITES', 'NEUMÁTICOS', 'BATERÍAS', 'REPUESTOS VARIOS'],
        'SERVICIOS TERCEROS': ['SERVICIO DE TORNO', 'VULCANIZADO', 'GRÚA / AUXILIO MECÁNICO', 'LAVADO DE FLOTA'],
        'PAGO DE CONDUCTORES': ['PAGO POR KILÓMETRO', 'BONO DE DESPACHO', 'DESCUENTO POR DESCUADRE', 'LIQUIDACIÓN FINAL'],
        'SERVICIOS ADMINISTRATIVOS': ['ÚTILES DE OFICINA', 'MENSAJERÍA / ENCOMIENDAS', 'SERVICIOS PÚBLICOS', 'HONORARIOS LEGALES'],
        'OTROS EGRESOS': ['MULTAS / SANCIONES', 'GASTOS BANCARIOS', 'IMPREVISTOS']
    };

    var subOpciones = mapaSub[motivo] || ['GENERAL'];
    subOpciones.forEach(function(sub) {
        subEl.add(new Option(sub, sub));
    });
};

// ── 8. Tipo Persona y Personas Dinámicas ─────────────────────────
window.cajaAlCambiarTipoPersona = function(tipo) {
    var perEl = document.getElementById('caja-input-persona');
    if (!perEl) return;
    perEl.innerHTML = '<option value="">Seleccione...</option>';

    if (tipo === 'CONDUCTOR') {
        fetch('/api/conductores')
            .then(function(r) { return r.json(); })
            .then(function(res) {
                var list = Array.isArray(res) ? res : (res.data || []);
                list.forEach(function(c) {
                    var nom = c.nombres ? (c.nombres + ' ' + (c.apellidos || '')) : (c.nombre || c.nombre_completo || '');
                    if (nom) perEl.add(new Option(nom.trim(), nom.trim()));
                });
            })
            .catch(function(e) { console.warn(e); });
    } else if (tipo === 'PROVEEDOR') {
        fetch('/api/proveedores')
            .then(function(r) { return r.json(); })
            .then(function(res) {
                var list = Array.isArray(res) ? res : (res.data || []);
                list.forEach(function(p) {
                    var nom = p.razon_social || p.nombre || '';
                    if (nom) perEl.add(new Option(nom.trim(), nom.trim()));
                });
            })
            .catch(function(e) { console.warn(e); });
    } else if (tipo === 'COLABORADOR / EMPLEADO') {
        fetch('/api/usuarios')
            .then(function(r) { return r.json(); })
            .then(function(res) {
                var list = Array.isArray(res) ? res : (res.data || []);
                list.forEach(function(u) {
                    var nom = u.nombre || '';
                    if (nom) perEl.add(new Option(nom.trim(), nom.trim()));
                });
            })
            .catch(function(e) { console.warn(e); });
    } else {
        perEl.add(new Option('CLIENTE / TERCERO GENERAL', 'CLIENTE / TERCERO GENERAL'));
    }
};

window.cajaAlSeleccionarPersona = function(persona) {
    // Si la persona tiene cuenta registrada en proveedores o conductores, autocompletar
};

// ── 9. Guardar Formulario (POST /api/tesoreria/caja) ────────────
window.cajaGuardarFormulario = async function(e) {
    if (e && e.preventDefault) e.preventDefault();

    var btnSubmit = document.getElementById('caja-btn-submit');
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
    }

    var formData = new FormData();
    formData.append('fecha', (document.getElementById('caja-input-fecha') || {}).value || '');
    formData.append('hora', (document.getElementById('caja-input-hora') || {}).value || '');
    formData.append('fecha_valuta', (document.getElementById('caja-input-fecha-valuta') || {}).value || '');
    formData.append('hora_valuta', (document.getElementById('caja-input-hora-valuta') || {}).value || '');
    formData.append('numero_constancia_deposito', (document.getElementById('caja-input-constancia') || {}).value || '');
    formData.append('numero_factura', (document.getElementById('caja-input-num-factura') || {}).value || '');
    formData.append('serie', (document.getElementById('caja-input-serie') || {}).value || '2026');
    formData.append('numero', (document.getElementById('caja-input-numero') || {}).value || '');
    formData.append('orden_viaje', (document.getElementById('caja-input-orden-viaje') || {}).value || '');
    formData.append('conductor', (document.getElementById('caja-input-conductor') || {}).value || '');
    formData.append('ruta_viaje', (document.getElementById('caja-input-ruta') || {}).value || '');
    formData.append('placa', (document.getElementById('caja-input-placa') || {}).value || '');
    formData.append('autoriza', (document.getElementById('caja-input-autoriza') || {}).value || '');
    formData.append('motivo', (document.getElementById('caja-input-motivo') || {}).value || '');
    formData.append('sub_motivo', (document.getElementById('caja-input-submotivo') || {}).value || '');
    formData.append('modalidad_pago', (document.getElementById('caja-input-modalidad') || {}).value || '');
    formData.append('moneda', (document.getElementById('caja-input-moneda') || {}).value || 'SOLES');
    formData.append('tipo_persona', (document.getElementById('caja-input-tipo-persona') || {}).value || '');
    formData.append('persona', (document.getElementById('caja-input-persona') || {}).value || '');
    formData.append('importe_total', (document.getElementById('caja-input-importe-total') || {}).value || '0');
    formData.append('descripcion', (document.getElementById('caja-input-descripcion') || {}).value || '');
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
        var resp = await fetch('/api/tesoreria/caja', {
            method: 'POST',
            body: formData
        });
        var res = await resp.json();
        if (res.ok) {
            // Cerrar modal
            var modalEl = document.getElementById('modalCajaForm');
            if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();

            // Recargar datos
            await window.cajaCargarMovimientos();
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'success', title: '¡Guardado!', text: 'El registro de caja fue creado correctamente.', timer: 2000, showConfirmButton: false });
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

// ── 10. Eliminar Registro ───────────────────────────────────────
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

// ── 11. Imprimir y Exportar Excel ───────────────────────────────
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
            'PLACA': r.placa,
            'MOTIVO': r.motivo,
            'SUB MOTIVO': r.sub_motivo,
            'MODALIDAD': r.modalidad_pago,
            'DESCRIPCION': r.descripcion,
            'TIPO PERSONA': r.tipo_persona,
            'PERSONA': r.persona,
            'TIPO': r.tipo_movimiento,
            'SUBTOTAL': r.subtotal,
            'RETENCION/DETRACCION': r.retencion_detraccion,
            'IMPORTE': r.importe_total,
            'TIPO CAMBIO': r.tipo_cambio,
            'TIPO DOCUMENTO': r.tipo_comprobante,
            'USUARIO CREACION': r.usuario_creacion,
            'COMENTARIO': r.comentario,
            'USUARIO APROBACIÓN': r.usuario_aprobacion,
            'FECHA APROBACIÓN': r.fecha_aprobacion,
            'BANCO': r.cuenta_bancaria_empresa,
            'FACTURA': r.numero_factura,
            'FECHA VALUTA': r.fecha_valuta,
            'MOTIVO ANULACION': r.motivo_anulacion
        };
    });

    var ws = XLSX.utils.json_to_sheet(dataExport);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Caja');
    XLSX.writeFile(wb, 'Tesoreria_Caja_' + new Date().toISOString().slice(0, 10) + '.xlsx');
};

// ── 12. Selector de Columnas Dinámicas ───────────────────────────
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
