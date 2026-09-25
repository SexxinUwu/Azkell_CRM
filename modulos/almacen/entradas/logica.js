// ================================================================
// MÓDULO ALMACÉN / ENTRADAS — Lógica SPA Aislada
// ================================================================

// ── azkellHaptic: Feedback háptico nativo silencioso (vibración física)
window.azkellHaptic = function(type) {
    try {
        if (!navigator.vibrate) return;
        if (type === 'tap') navigator.vibrate(12);
        else if (type === 'pop') navigator.vibrate(20);
        else if (type === 'success') navigator.vibrate([15, 45, 25]);
        else if (type === 'error') navigator.vibrate([35, 50, 35]);
    } catch(e) {}
};

// ── _entCbFiltrar: asegura apertura y estilo de dropdown inmediato
window._entCbFiltrar = function(id) {
    window._cbFiltrar(id);
    var dd = document.getElementById(id + '-dd');
    if (!dd || dd.style.display === 'none') return;
    dd.style.position = 'absolute';
    dd.style.top      = 'calc(100% + 4px)';
    dd.style.left     = '0';
    dd.style.right    = '0';
    dd.style.width    = '100%';
    dd.style.maxWidth = '100%';
    dd.style.zIndex   = '999999';
};

window._entData      = window._entData      || [];
window._entFiltrados = window._entFiltrados || [];
window._entPagActual = window._entPagActual || 1;
window._entTC        = window._entTC        || 3.70;
window._entItemIdx   = window._entItemIdx   || 0;
window._entInvData   = window._entInvData   || [];
window._entProvItems = window._entProvItems || [];
window._entDetalleId = window._entDetalleId || null;
window._entIgvMode   = window._entIgvMode   || 'sin_igv';
var _ENT_POR_PAG = 20;

function _entFmtFechaHora(iso, createdAt) {
    var raw = createdAt || iso;
    if (!raw) return '—';
    try {
        var s = String(raw);
        var d;
        if (s.includes('T') || s.includes(' ')) {
            d = new Date(s.replace(' ', 'T'));
        } else {
            d = new Date(s + 'T00:00:00');
        }
        if (isNaN(d.getTime())) return String(raw);
        var dateStr = d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
        var timeStr = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
        if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
            return dateStr;
        }
        return dateStr + ' ' + timeStr;
    } catch(e) { return String(raw); }
}

window._entFmtFechaHora = _entFmtFechaHora;

function numeroALetras(num) {
    var data = { enteros: Math.floor(num), centavos: Math.round(num * 100) - Math.floor(num) * 100 };
    function Unidades(num){ switch(num) { case 1: return 'UN'; case 2: return 'DOS'; case 3: return 'TRES'; case 4: return 'CUATRO'; case 5: return 'CINCO'; case 6: return 'SEIS'; case 7: return 'SIETE'; case 8: return 'OCHO'; case 9: return 'NUEVE'; } return ''; }
    function Decenas(num){ var decena = Math.floor(num/10); var unidad = num - (decena * 10); switch(decena) { case 1: switch(unidad) { case 0: return 'DIEZ'; case 1: return 'ONCE'; case 2: return 'DOCE'; case 3: return 'TRECE'; case 4: return 'CATORCE'; case 5: return 'QUINCE'; default: return 'DIECI' + Unidades(unidad); } case 2: switch(unidad) { case 0: return 'VEINTE'; default: return 'VEINTI' + Unidades(unidad); } case 3: return DecenasY('TREINTA', unidad); case 4: return DecenasY('CUARENTA', unidad); case 5: return DecenasY('CINCUENTA', unidad); case 6: return DecenasY('SESENTA', unidad); case 7: return DecenasY('SETENTA', unidad); case 8: return DecenasY('OCHENTA', unidad); case 9: return DecenasY('NOVENTA', unidad); case 0: return Unidades(unidad); } return Unidades(num); }
    function DecenasY(strSin, numUnidades) { if (numUnidades > 0) return strSin + ' Y ' + Unidades(numUnidades); return strSin; }
    function Centenas(num) { var centenas = Math.floor(num / 100); var decenas = num - (centenas * 100); switch(centenas){ case 1: if (decenas > 0) return 'CIENTO ' + Decenas(decenas); return 'CIEN'; case 2: return 'DOSCIENTOS ' + Decenas(decenas); case 3: return 'TRESCIENTOS ' + Decenas(decenas); case 4: return 'CUATROCIENTOS ' + Decenas(decenas); case 5: return 'QUINIENTOS ' + Decenas(decenas); case 6: return 'SEISCIENTOS ' + Decenas(decenas); case 7: return 'SETECIENTOS ' + Decenas(decenas); case 8: return 'OCHOCIENTOS ' + Decenas(decenas); case 9: return 'NOVECIENTOS ' + Decenas(decenas); } return Decenas(decenas); }
    function Seccion(num, divisor, strSingular, strPlural) { var cientos = Math.floor(num / divisor); var resto = num - (cientos * divisor); var letras = ''; if (cientos > 0) if (cientos > 1) letras = Centenas(cientos) + ' ' + strPlural; else letras = strSingular; if (resto > 0) letras += ''; return letras; }
    function Miles(num) { var divisor = 1000; var cientos = Math.floor(num / divisor); var resto = num - (cientos * divisor); var strMiles = Seccion(num, divisor, 'UN MIL', 'MIL'); var strCentenas = Centenas(resto); if(strMiles == '') return strCentenas; return strMiles + ' ' + strCentenas; }
    function Millones(num) { var divisor = 1000000; var cientos = Math.floor(num / divisor); var resto = num - (cientos * divisor); var strMillones = Seccion(num, divisor, 'UN MILLON', 'MILLONES'); var strMiles = Miles(resto); if(strMillones == '') return strMiles; return strMillones + ' ' + strMiles; }
    if(data.enteros == 0) return 'CERO CON ' + (data.centavos<10?'0':'') + data.centavos + '/100'; return Millones(data.enteros) + ' CON ' + (data.centavos<10?'0':'') + data.centavos + '/100';
}

window.numeroALetras = numeroALetras;

window.init_entradas = function() {
    if (!window.checkPerm('ent_inv', 'l')) {
        var wrap = document.getElementById('mod-entradas') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    if (!window.checkPerm('ent_inv', 'l')) {
        var wrap = document.getElementById('mod-entradas') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    window._entDetalleId = null;
    window._entPagActual = 1;
    window.cargarEntradas();
    window._entCargarProveedores();
    window._entCargarPlacas();
    window._entCargarConfig();
    window._entMobileInit();
    if (!window._entInvData.length) window._entCargarInv();
    if (typeof window.initColPicker === 'function') {
        window.initColPicker('col-picker-ent', 'tabla-entradas', [
            {label: 'Fecha',       idx: 1, visible: true},
            {label: 'Proveedor',   idx: 2, visible: true},
            {label: 'Cód. Art.',   idx: 3, visible: true},
            {label: 'Artículo',    idx: 4, visible: true},
            {label: 'Cantidad',    idx: 5, visible: true},
            {label: 'Costo Unit.', idx: 6, visible: true},
            {label: 'Total',       idx: 7, visible: true}
        ], 'fleet_cols_entradas');
    }
};

// ── Mobile Init ───────────────────────────────────────────────────
window._entMobileInit = function() {
    var isMob = window.innerWidth < 768;
    var mHeader = document.getElementById('ent-m-header');
    var fabWrap = document.getElementById('ent-fab-wrap');
    if (mHeader) mHeader.style.display = isMob ? 'flex' : 'none';
    if (fabWrap) fabWrap.style.display = isMob ? 'flex' : 'none';
    // Iniciales del avatar
    var av = document.getElementById('ent-m-avatar');
    if (av) {
        var email = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
        var partes = email.split('@')[0].split(/[._-]/);
        var inits = partes.length >= 2 ? (partes[0][0]+partes[1][0]).toUpperCase() : email.substr(0,2).toUpperCase();
        av.textContent = inits || 'SA';
    }
};

window._entToggleFiltrosMobile = function() {
    var el = document.getElementById('ent-filtros-mobile');
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'flex' : 'none';
};

window.cargarEntradas = function() {
    var tbody = document.getElementById('tbody-entradas');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center py-5"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';
    fetch('/api/almacen/entradas')
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(data) {
            window._entData = data;
            window._entFiltrados = data;
            window._entRenderKPIs(data);
            window.filtrarEntradas();
        })
        .catch(function(err) {
            var t = document.getElementById('tbody-entradas');
            if (t) t.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-danger">Error: '+err.message+'</td></tr>';
        });
};

window._entOnMonedaChange = function() {
    var moneda = (document.getElementById('ent-f-moneda') || {}).value;
    var tcRow = document.getElementById('ent-f-tc-box');
    if (tcRow) tcRow.style.display = moneda === 'USD' ? 'block' : 'none';
    window._entActualizarTotal();
};

window._entCargarConfig = function() {
    fetch('/api/almacen/configuracion')
        .then(function(r) { return r.json(); })
        .then(function(cfg) {
            window._entTC = parseFloat(cfg.tipo_cambio) || 3.4;
            if (window._entTC === 3.7) window._entTC = 3.4;
            var tcEl = document.getElementById('ent-f-tc');
            if (tcEl) tcEl.value = window._entTC;
        }).catch(function() {});
};

window._entSubMotivosMap = {
    'Mantenimiento y Auxilio': [
        'Repuestos menores / Accesorios',
        'Mantenimiento preventivo programado',
        'Mantenimiento correctivo / Auxilio mecánico',
        'Llantas, neumáticos y enllante',
        'Frenos, suspensión y aire',
        'Aceites, filtros y lubricación',
        'Sistema eléctrico / Baterías',
        'Carrocería, pintura y soldadura'
    ],
    'Gastos Administrativos / Oficina': [
        'Útiles de escritorio y papelería',
        'Artículos de limpieza y aseo',
        'Comunicaciones, internet y telefonía',
        'Software, licencias y hosting',
        'Alquiler de locales / Oficinas',
        'Seguridad y vigilancia'
    ],
    'Combustibles y Fluidos': [
        'Diésel DB5 S-50',
        'Gasolina 90 / 95 / 97',
        'Gas Licuado / GNV',
        'Úrea / AdBlue',
        'Refrigerantes y anticongelantes'
    ],
    'Gastos de Viaje y Ruta': [
        'Peajes y pesajes',
        'Viáticos y alimentación en ruta',
        'Hospedaje y pernocte conductores',
        'Cocheras y estacionamientos',
        'Movilidad local / Taxis'
    ],
    'Servicios de Terceros': [
        'Servicios de tornería y rectificación',
        'Servicio técnico especializado externo',
        'Asesoría legal / Contable / Auditoría',
        'Fletes y transportes tercerizados',
        'Certificaciones y revisiones técnicas'
    ],
    'Activos Fijos / Equipamiento': [
        'Herramientas y maquinaria de taller',
        'Equipos de cómputo y tecnología',
        'Mobiliario y enseres',
        'Equipos de comunicación / GPS / Radios'
    ],
    'Compras Generales Almacén': [
        'Stock general de almacén',
        'EPPs y seguridad industrial',
        'Materiales de embalaje y estiba',
        'Insumos varios'
    ]
};

window._entCambiarMotivoGasto = function(subSeleccionado) {
    var motivoEl = document.getElementById('ent-f-motivo-gasto');
    var subEl = document.getElementById('ent-f-sub-motivo');
    var ccEl = document.getElementById('ent-f-centro-costo');
    if (!motivoEl || !subEl) return;

    var motivo = motivoEl.value;
    var subs = window._entSubMotivosMap[motivo] || [];
    subEl.innerHTML = '';
    subs.forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        if (subSeleccionado && subSeleccionado === s) opt.selected = true;
        subEl.appendChild(opt);
    });

    // Auto sugerir centro de costo según motivo si no se ha seleccionado manualmente
    if (ccEl) {
        if (motivo === 'Mantenimiento y Auxilio') ccEl.value = 'CC-400';
        else if (motivo === 'Gastos Administrativos / Oficina') ccEl.value = 'CC-100';
        else if (motivo === 'Combustibles y Fluidos' || motivo === 'Gastos de Viaje y Ruta') ccEl.value = 'CC-300';
        else if (motivo === 'Compras Generales Almacén') ccEl.value = 'CC-500';
    }
};

window._entCargarPlacas = function() {
    fetch('/api/placas-lista')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var items = data.map(function(v) { return { value: v.placa, label: v.placa }; })
                .filter(function(x) { return x.value; })
                .sort(function(a,b){ return a.label.localeCompare(b.label); });
            window._cbInit('ent-f-placa', items, 'Buscar placa...');

            window._cbOnSelect('ent-f-placa', function(placaVal) {
                if (placaVal) {
                    var ccEl = document.getElementById('ent-f-centro-costo');
                    if (ccEl) ccEl.value = 'CC-400';
                    var motEl = document.getElementById('ent-f-motivo-gasto');
                    if (motEl) motEl.value = 'Mantenimiento y Auxilio';
                    window._entCambiarMotivoGasto();
                }
            });
        }).catch(function() {});
};

// ── Helpers para Solicitantes y Cuentas Empresa ────────────────────
window._entCargarSolicitantesHistoricos = function() {
    try {
        var hist = JSON.parse(localStorage.getItem('fleet_ent_solicitantes') || '[]');
        var dl = document.getElementById('ent-solicitantes-list');
        if (dl) {
            dl.innerHTML = '';
            hist.forEach(function(s) {
                if (!s) return;
                var opt = document.createElement('option');
                opt.value = s;
                dl.appendChild(opt);
            });
        }
    } catch(e) {}
};

window._entGuardarSolicitanteHistorico = function(nombre) {
    if (!nombre || !nombre.trim()) return;
    nombre = nombre.trim();
    try {
        var hist = JSON.parse(localStorage.getItem('fleet_ent_solicitantes') || '[]');
        if (!hist.includes(nombre)) {
            hist.unshift(nombre);
            if (hist.length > 50) hist = hist.slice(0, 50);
            localStorage.setItem('fleet_ent_solicitantes', JSON.stringify(hist));
        }
        window._entCargarSolicitantesHistoricos();
    } catch(e) {}
};

window._entCargarCuentasEmpresa = function(cuentaSeleccionada) {
    var ctaEmpSelect = document.getElementById('ent-f-cuenta-empresa');
    if (!ctaEmpSelect) return;
    ctaEmpSelect.innerHTML = '<option value="">Seleccione cuenta de empresa...</option>';
    
    function renderCuentas(data) {
        var list = Array.isArray(data) ? data : (data && data.data ? data.data : []);
        ctaEmpSelect.innerHTML = '<option value="">Seleccione cuenta de empresa...</option>';
        if (!list || !list.length) return;

        list.forEach(function(c) {
            var mon = (c.moneda || 'SOLES').toUpperCase();
            var monLabel = (mon.includes('DOL') || mon === 'USD' || mon === 'US$') ? 'DÓLARES' : 'SOLES';
            var tipo = c.tipo_cuenta || 'CTA CTE';
            var detraccionTxt = c.detraccion ? ' [DETRACCIÓN]' : '';
            var num = (c.numero_cuenta || '').trim();
            var label = c.banco + ' - ' + tipo + ' [' + monLabel + '] - ' + num + detraccionTxt;
            
            var opt = document.createElement('option');
            opt.value = label;
            opt.textContent = label;
            if (cuentaSeleccionada && (
                cuentaSeleccionada === label || 
                (num && cuentaSeleccionada.includes(num))
            )) {
                opt.selected = true;
            }
            ctaEmpSelect.appendChild(opt);
        });
    }

    fetch('/api/almacen/empresa-cuentas')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var items = Array.isArray(data) ? data : (data && data.data ? data.data : []);
            if (!items || !items.length) {
                return fetch('/api/tesoreria/bancos')
                    .then(function(r2) { return r2.json(); })
                    .then(function(res2) {
                        var bList = (res2 && res2.ok && Array.isArray(res2.data)) ? res2.data : [];
                        renderCuentas(bList.filter(function(b){ return b.estado === 'ACTIVO' || !b.estado; }));
                    });
            }
            renderCuentas(items);
        })
        .catch(function(err) {
            console.warn('Error al cargar cuentas bancarias de la empresa:', err);
        });
};

window._entOnCondicionPagoChange = function() {
    var cond = (document.getElementById('ent-f-condicion-pago') || {}).value || 'Al contado';
    var box = document.getElementById('ent-f-dias-credito-box');
    var diasInput = document.getElementById('ent-f-dias-credito');
    if (cond === 'A crédito') {
        if (box) box.style.display = 'block';
        if (diasInput && (!diasInput.value || diasInput.value === '0')) {
            diasInput.value = '30';
        }
    } else {
        if (box) box.style.display = 'none';
        if (diasInput) diasInput.value = '0';
    }
};

function _entFechaHoyLocal() {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
}

window._entCargarProveedores = function() {
    var fechaEl = document.getElementById('ent-f-fecha');
    if (fechaEl && !fechaEl.value) fechaEl.value = _entFechaHoyLocal();
    if (window._entProvItems && window._entProvItems.length) {
        window._cbInit('ent-f-proveedor', window._entProvItems, 'Buscar proveedor…');
    }
    fetch('/api/ordenes-trabajo').then(r=>r.json()).then(d => {
        window._entCacheOT = d || [];
        var otItems = (d || []).map(function(o) {
            var idOt = (o.id_ot || '').toUpperCase();
            var placa = (o.placa || '').toUpperCase();
            if (!idOt) return null;
            return { value: idOt, label: placa ? idOt + ' — ' + placa : idOt };
        }).filter(Boolean);
        window._cbInit('ent-f-ot', otItems, 'Buscar OT...');
    fetch('/api/placas-lista').then(function(r){return r.json();}).then(function(d){
        var items = (d||[]).map(function(p){
            var placa = (p.placa||'').toUpperCase();
            return {value:placa, label:placa};
        }).filter(function(x){return x.value;}).sort(function(a,b){return a.label.localeCompare(b.label);});
        window._cbInit('ent-f-ot-placa', items, 'Buscar placa...');
    }).catch(function(){});

        
        window._cbOnSelect('ent-f-ot', function(val) {
            var ot = window._entCacheOT.find(function(x) { return (x.id_ot||'').toUpperCase() === val; });
            if (ot && ot.placa) {
                if (typeof window._cbSet === 'function') {
                    window._cbSet('ent-f-ot-placa', ot.placa, ot.placa);
                }
            } else {
                if (typeof window._cbReset === 'function') {
                    window._cbReset('ent-f-ot-placa');
                }
            }
        });
    }).catch(function(){});

        fetch('/api/almacen/proveedores')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._entProveedoresRaw = data || [];
            window._entProvItems = data.map(function(p) {
                var displayName = p.razon_social ? p.razon_social : p.nombre;
                return { value: p.id, label: displayName + (p.numero_documento ? ' (' + p.numero_documento + ')' : '') };
            });
            window._cbInit('ent-f-proveedor', window._entProvItems, 'Buscar proveedor…');

            // Al seleccionar un proveedor, actualizar automáticamente sus cuentas bancarias
            window._cbOnSelect('ent-f-proveedor', function(provId) {
                window._entCargarCuentasProveedor(provId);
            });
        }).catch(function() {});
};

window._entCargarCuentasProveedor = function(provId, cuentaSeleccionada) {
    var ctaSelect = document.getElementById('ent-f-cuenta-prov');
    if (!ctaSelect) return;
    ctaSelect.innerHTML = '<option value="">Seleccione cuenta de proveedor...</option>';

    if (!provId) return;
    var prov = (window._entProveedoresRaw || []).find(function(p) { return p.id === provId; });
    var cuentas = (prov && prov.cuentas) ? prov.cuentas : [];

    if (cuentas.length) {
        cuentas.forEach(function(c) {
            var detraccionTxt = c.detraccion ? ' [DETRACCIÓN]' : '';
            var label = c.banco + ' - ' + c.tipo_cuenta + ' (' + c.numero_cuenta + ')' + detraccionTxt;
            var opt = document.createElement('option');
            opt.value = label;
            opt.textContent = label;
            if (cuentaSeleccionada && (cuentaSeleccionada === label || cuentaSeleccionada === c.numero_cuenta)) {
                opt.selected = true;
            }
            ctaSelect.appendChild(opt);
        });
    } else {
        // Consultar por API si no vienen en memoria
        fetch('/api/almacen/proveedores/' + encodeURIComponent(provId) + '/cuentas')
            .then(function(r) { return r.json(); })
            .then(function(cuentasApi) {
                (cuentasApi || []).forEach(function(c) {
                    var detraccionTxt = c.detraccion ? ' [DETRACCIÓN]' : '';
                    var label = c.banco + ' - ' + c.tipo_cuenta + ' (' + c.numero_cuenta + ')' + detraccionTxt;
                    var opt = document.createElement('option');
                    opt.value = label;
                    opt.textContent = label;
                    if (cuentaSeleccionada && (cuentaSeleccionada === label || cuentaSeleccionada === c.numero_cuenta)) {
                        opt.selected = true;
                    }
                    ctaSelect.appendChild(opt);
                });
            }).catch(function() {});
    }
};


// ── Grid items (card-based) ───────────────────────────────────────
window._entAgregarItem = function() {
    var container = document.getElementById('ent-items-cards');
    if (!container) return;
    var idx  = window._entItemIdx++;
    var cbId = 'ent-art-' + idx;
    var card = document.createElement('div');
    card.id        = 'ent-item-' + idx;
    card.className = 'ent-item-card';
    
    var tipoOrden = ((document.getElementById('ent-f-tipo-orden') || {}).value || '').toLowerCase();
    var isServicio = tipoOrden === 'orden de servicio';
    var placeholderTxt = isServicio ? 'Buscar servicio…' : 'Buscar artículo…';

    card.innerHTML =
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
            '<div style="flex:1;position:relative;">' +
                '<input type="text" id="' + cbId + '-txt" class="ent-input-sm ent-item-desc" data-idx="' + idx + '"' +
                    ' placeholder="' + placeholderTxt + '" autocomplete="off"' +
                    ' oninput="window._entCbFiltrar(\'' + cbId + '\')"' +
                    ' onfocus="window._entCbFiltrar(\'' + cbId + '\')"' +
                    ' onblur="window._cbHide(\'' + cbId + '\')">' +
                '<input type="hidden" id="' + cbId + '" class="ent-item-inv-id" data-idx="' + idx + '">' +
                '<div id="' + cbId + '-dd" class="cb-dropdown"></div>' +
            '</div>' +
            (!isServicio ? 
            '<button type="button" onclick="window._entAbrirQR(' + idx + ')" title="Escanear QR"' +
                ' style="width:32px;height:32px;border-radius:10px;border:1.5px solid #2563eb;background:#eff6ff;' +
                'color:#2563eb;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.82rem;">' +
                '<i class="bi bi-qr-code-scan"></i>' +
            '</button>' : '') +
            '<button type="button" onclick="window._entQuitarItem(' + idx + ')"' +
                ' style="width:32px;height:32px;border-radius:10px;border:none;background:#fee2e2;' +
                'color:#ef4444;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.8rem;">' +
                '<i class="bi bi-x-lg"></i>' +
            '</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:72px 1fr 1fr 80px 1fr;gap:5px;">' +
            '<div><div class="ent-field-label">Cant.</div>' +
                '<input type="number" class="ent-input-sm ent-item-cant" data-idx="' + idx + '"' +
                    ' value="1" min="0.001" step="0.001" oninput="window._entCalcImporte(' + idx + ',\'cant\')">' +
            '</div>' +
            '<div><div class="ent-field-label ent-lbl-vu" data-idx="' + idx + '">Valor Unit.</div>' +
                '<input type="number" class="ent-input-sm ent-item-vu" data-idx="' + idx + '"' +
                    ' value="0" min="0" step="0.0001" placeholder="0.00" oninput="window._entCalcImporte(' + idx + ',\'vu\')">' +
            '</div>' +
            '<div><div class="ent-field-label ent-lbl-pu" data-idx="' + idx + '">Precio Unit.</div>' +
                '<input type="number" class="ent-input-sm ent-item-pu" data-idx="' + idx + '"' +
                    ' value="0" min="0" step="0.0001" placeholder="0.00" oninput="window._entCalcImporte(' + idx + ',\'pu\')">' +
            '</div>' +
            '<div><div class="ent-field-label">IGV</div>' +
                '<input type="number" class="ent-input-sm ent-item-igv" data-idx="' + idx + '"' +
                    ' value="0" readonly style="background:#f1f5f9;color:#94a3b8;">' +
            '</div>' +
            '<div><div class="ent-field-label">Importe</div>' +
                '<input type="number" class="ent-input-sm ent-item-imp" data-idx="' + idx + '"' +
                    ' value="0" step="0.01" placeholder="0.00" oninput="window._entCalcImporte(' + idx + ',\'imp\')">' +
            '</div>' +
        '</div>' +
        '<div id="ent-price-alert-' + idx + '" style="display:none;margin-top:6px;align-items:center;gap:.4rem;"></div>';

    container.appendChild(card);

    if (!window._entInvData || !window._entInvData.length) {
        window._entCargarInv(function() { window._entInitCbItem(idx, cbId); });
    } else {
        window._entInitCbItem(idx, cbId);
    }
};

window._entInitCbItem = function(idx, cbId) {
    var tipoEl = document.getElementById('ent-f-tipo-orden') || document.getElementById('ent-f-tipo-oc');
    var isServicio = tipoEl && ((tipoEl.value || '').toLowerCase() === 'orden de servicio' || tipoEl.value === 'Servicio');
    var dataFiltered = (window._entInvData || []).filter(function(d) {
        var isServId = d.id && String(d.id).toUpperCase().startsWith('SERV');
        var isFamServ = d.familia === 'Servicio' || d.familia === 'Servicios' || (d.tipo && String(d.tipo).toLowerCase() === 'servicio');
        var isTipoServ = d.es_servicio === 1 || d.es_servicio === true || d.tipo === 'Servicio' || (d.tipo && String(d.tipo).toLowerCase() === 'servicio');
        var isService = isServId || isFamServ || isTipoServ;
        return isServicio ? isService : !isService;
    });
    var items = dataFiltered.map(function(d) {
        return { value: d.id, label: d.id + ' — ' + (d.descripcion || '') };
    });
    window._cbInit(cbId, items, isServicio ? 'Buscar servicio…' : 'Buscar artículo…');
    window._cbOnSelect(cbId, function(val) {
        var item = (window._entInvData || []).find(function(d) { return d.id === val; });
        if (item) {
            var ref = parseFloat(item.costo_referencial || item.precio_referencial || item.costo_unitario || item.precio || 0);
            var puEl = document.querySelector('.ent-item-pu[data-idx="' + idx + '"]');
            var vuEl = document.querySelector('.ent-item-vu[data-idx="' + idx + '"]');
            var cantEl = document.querySelector('.ent-item-cant[data-idx="' + idx + '"]');
            if (cantEl && (!cantEl.value || parseFloat(cantEl.value) <= 0)) {
                cantEl.value = '1';
            }
            var mode = window._entIgvMode || 'incluido';
            if (mode === 'mas_igv') {
                if (vuEl) { vuEl.value = (ref / 1.18).toFixed(4); vuEl.dataset.oldCost = ref; }
                window._entCalcImporte(idx, 'vu');
            } else {
                if (puEl) { puEl.value = ref.toFixed(2); puEl.dataset.oldCost = ref; }
                window._entCalcImporte(idx, 'pu');
            }
        }
    });
};

window._entCargarInv = function(cb) {
    if (window._entInvData && window._entInvData.length) { if (cb) cb(); return; }
    fetch('/api/almacen/inventario')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            window._entInvData = data || [];
            if (cb) cb();
        }).catch(function() { if (cb) cb(); });
};

window._entCalcImporte = function(idx, source) {
    var r2 = function(v) { return Math.round(v * 100) / 100; };
    var r4 = function(v) { return Math.round(v * 10000) / 10000; };
    var mode = window._entIgvMode || 'incluido';
    var cantEl = document.querySelector('.ent-item-cant[data-idx="'+idx+'"]');
    var vuEl   = document.querySelector('.ent-item-vu[data-idx="'+idx+'"]');
    var puEl   = document.querySelector('.ent-item-pu[data-idx="'+idx+'"]');
    var igvEl  = document.querySelector('.ent-item-igv[data-idx="'+idx+'"]');
    var impEl  = document.querySelector('.ent-item-imp[data-idx="'+idx+'"]');
    if (!cantEl || !vuEl || !puEl || !igvEl || !impEl) return;

    var cant = parseFloat(cantEl.value) || 0;
    var vu   = parseFloat(vuEl.value)   || 0;
    var pu   = parseFloat(puEl.value)   || 0;
    var imp  = parseFloat(impEl.value)  || 0;

    if (mode === 'sin_igv') {
        if (source === 'imp') {
            pu = cant > 0 ? (imp / cant) : 0;
            vu = pu;
            if (source !== 'pu') puEl.value = (Math.round(pu * 100) / 100).toFixed(2);
            if (source !== 'vu') vuEl.value = (Math.round(vu * 10000) / 10000).toFixed(4);
        } else if (source === 'pu') {
            vu = pu;
            if (source !== 'vu') vuEl.value = (Math.round(vu * 10000) / 10000).toFixed(4);
            impEl.value = (Math.round(cant * pu * 100) / 100).toFixed(2);
        } else if (source === 'vu') {
            pu = vu;
            if (source !== 'pu') puEl.value = (Math.round(pu * 100) / 100).toFixed(2);
            impEl.value = (Math.round(cant * pu * 100) / 100).toFixed(2);
        } else { // cant
            impEl.value = (Math.round(cant * pu * 100) / 100).toFixed(2);
        }
        igvEl.value = (0).toFixed(2);

    } else if (mode === 'incluido') {
        if (source === 'imp') {
            pu = cant > 0 ? (imp / cant) : 0;
            vu = pu / 1.18;
            var igvRow = (imp) - (cant * vu);
            if (source !== 'pu') puEl.value = (Math.round(pu * 100) / 100).toFixed(2);
            if (source !== 'vu') vuEl.value = (Math.round(vu * 10000) / 10000).toFixed(4);
            igvEl.value = (Math.round(igvRow * 100) / 100).toFixed(2);
        } else if (source === 'pu') {
            vu = pu / 1.18;
            var totalRow = cant * pu;
            var igvRow = totalRow - (cant * vu);
            if (source !== 'vu') vuEl.value = (Math.round(vu * 10000) / 10000).toFixed(4);
            igvEl.value = (Math.round(igvRow * 100) / 100).toFixed(2);
            impEl.value = (Math.round(totalRow * 100) / 100).toFixed(2);
        } else if (source === 'vu') {
            pu = vu * 1.18;
            var totalRow = cant * pu;
            var igvRow = totalRow - (cant * vu);
            if (source !== 'pu') puEl.value = (Math.round(pu * 100) / 100).toFixed(2);
            igvEl.value = (Math.round(igvRow * 100) / 100).toFixed(2);
            impEl.value = (Math.round(totalRow * 100) / 100).toFixed(2);
        } else { // cant
            var totalRow = cant * pu;
            var igvRow = totalRow - (cant * vu);
            igvEl.value = (Math.round(igvRow * 100) / 100).toFixed(2);
            impEl.value = (Math.round(totalRow * 100) / 100).toFixed(2);
        }

    } else { // mas_igv
        if (source === 'imp') {
            pu = cant > 0 ? (imp / cant) : 0;
            vu = pu / 1.18;
            var igvRow = (imp) - (cant * vu);
            if (source !== 'pu') puEl.value = (Math.round(pu * 100) / 100).toFixed(2);
            if (source !== 'vu') vuEl.value = (Math.round(vu * 10000) / 10000).toFixed(4);
            igvEl.value = (Math.round(igvRow * 100) / 100).toFixed(2);
        } else if (source === 'pu') {
            vu = pu / 1.18;
            var totalRow = cant * pu;
            var igvRow = totalRow - (cant * vu);
            if (source !== 'vu') vuEl.value = (Math.round(vu * 10000) / 10000).toFixed(4);
            igvEl.value = (Math.round(igvRow * 100) / 100).toFixed(2);
            impEl.value = (Math.round(totalRow * 100) / 100).toFixed(2);
        } else if (source === 'vu') {
            pu = vu * 1.18;
            var totalRow = cant * pu;
            var igvRow = totalRow - (cant * vu);
            if (source !== 'pu') puEl.value = (Math.round(pu * 100) / 100).toFixed(2);
            igvEl.value = (Math.round(igvRow * 100) / 100).toFixed(2);
            impEl.value = (Math.round(totalRow * 100) / 100).toFixed(2);
        } else { // cant
            var totalRow = cant * pu;
            var igvRow = totalRow - (cant * vu);
            igvEl.value = (Math.round(igvRow * 100) / 100).toFixed(2);
            impEl.value = (Math.round(totalRow * 100) / 100).toFixed(2);
        }
    }

    // Alerta comparación de precio vs referencia
    var alertEl = document.getElementById('ent-price-alert-' + idx);
    var card    = document.getElementById('ent-item-' + idx);
    var oldCost = parseFloat((puEl.dataset && puEl.dataset.oldCost) || (vuEl.dataset && vuEl.dataset.oldCost));
    var compare = pu;
    if (alertEl && !isNaN(oldCost) && oldCost > 0 && Math.abs(compare - oldCost) > 0.001) {
        var diff = compare - oldCost;
        var pct  = (diff / oldCost * 100).toFixed(1);
        var isUp = diff > 0;
        alertEl.style.display = 'flex';
        alertEl.innerHTML =
            '<span style="display:inline-flex;align-items:center;gap:.3rem;padding:.25rem .65rem;border-radius:99px;font-size:.65rem;font-weight:800;' +
            'background:' + (isUp ? '#fee2e2;color:#ef4444' : '#dcfce7;color:#16a34a') + ';">' +
            '<i class="bi bi-arrow-' + (isUp ? 'up' : 'down') + '"></i>' +
            (isUp ? '¡Sube!' : 'Baja') + '</span>' +
            '<span style="font-size:.65rem;color:#94a3b8;font-weight:600;">Ref: S/ ' + oldCost.toFixed(2) + ' → ' + (isUp ? '+' : '') + pct + '%</span>';
        if (card) { card.classList.remove('price-up','price-down'); card.classList.add(isUp ? 'price-up' : 'price-down'); }
    } else if (alertEl) {
        alertEl.style.display = 'none';
        if (card) card.classList.remove('price-up','price-down');
    }
    window._entActualizarTotal();
};

window._entQuitarItem = function(idx) {
    var tr = document.getElementById('ent-item-'+idx);
    if (tr) tr.remove();
    window._entActualizarTotal();
};

// ── QR Scanner — usa el scanner global de la app ──────────────────
window._entQrScanner   = window._entQrScanner   || null;
window._entQrTargetIdx = window._entQrTargetIdx || null;

window._entAbrirQR = function(idx) {
    window._entQrTargetIdx = (idx !== undefined) ? idx : null;
    var targetIdx = window._entQrTargetIdx;
    window._abrirEscaner(function(text) {
        window._entSeleccionarItemPorQR(text, targetIdx);
    }, 'Escanear Artículo');
};

window._entCerrarQR = function() {
    window._cerrarEscaner();
    window._entQrTargetIdx = null;
};

// Rellena el artículo en el card correspondiente al idx dado
window._entSeleccionarItemPorQR = function(invId, idx) {
    var doSelect = function() {
        var item = (window._entInvData || []).find(function(d) {
            return d.id === invId || (d.codigo_barras && d.codigo_barras.trim() === invId);
        });
        if (!item) {
            alert('Artículo no encontrado: ' + invId);
            return;
        }
        var cbId = 'ent-art-' + idx;
        var lbl  = item.id + ' — ' + (item.descripcion || '');
        window._cbSet(cbId, item.id, lbl);
        if (window._cbCallbacks && window._cbCallbacks[cbId]) {
            window._cbCallbacks[cbId](item.id, lbl);
        }
        // Enfocar el campo de cantidad para agilizar el ingreso
        var cantEl = document.querySelector('.ent-item-cant[data-idx="' + idx + '"]');
        if (cantEl) { cantEl.focus(); cantEl.select(); }
    };
    if (!(window._entInvData || []).length) {
        window._entCargarInv(doSelect);
    } else {
        doSelect();
    }
};

// Función legacy mantenida por compatibilidad
window._entAgregarItemPorQR = function(invId) {
    var doAdd = function() {
        var item = (window._entInvData || []).find(function(d) { return d.id === invId; });
        if (!item) { alert('Artículo no encontrado: ' + invId); return; }
        var futureIdx = window._entItemIdx;
        var futureCbId = 'ent-art-' + futureIdx;
        window._entAgregarItem();
        var lbl = item.id + ' — ' + (item.descripcion || '');
        window._cbSet(futureCbId, item.id, lbl);
        if (window._cbCallbacks && window._cbCallbacks[futureCbId]) {
            window._cbCallbacks[futureCbId](item.id, lbl);
        }
    };
    if (!(window._entInvData || []).length) {
        window._entCargarInv(doAdd);
    } else {
        doAdd();
    }
};

window._entActualizarTotal = function() {
    var totalImp = 0, totalIgv = 0;
    document.querySelectorAll('.ent-item-imp').forEach(function(el) { totalImp += parseFloat(el.value) || 0; });
    document.querySelectorAll('.ent-item-igv').forEach(function(el) { totalIgv += parseFloat(el.value) || 0; });
    var totalGravado = totalImp - totalIgv;
    var moneda = (document.getElementById('ent-f-moneda') || {}).value || 'PEN';
    var mode   = window._entIgvMode || 'incluido';
    var mon    = moneda === 'USD' ? '$' : 'S/';
    var el     = document.getElementById('ent-total-display');
    if (!el) return;

    var desglose = document.getElementById('ent-igv-desglose');
    if (mode !== 'sin_igv') {
        var gravEl = document.getElementById('ent-total-gravado');
        var igvEl  = document.getElementById('ent-total-igv');
        if (gravEl) gravEl.textContent = mon + ' ' + totalGravado.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
        if (igvEl)  igvEl.textContent  = mon + ' ' + totalIgv.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
        if (desglose) desglose.style.display = 'block';
    } else {
        if (desglose) desglose.style.display = 'none';
    }

    if (moneda === 'USD') {
        var tc = parseFloat((document.getElementById('ent-f-tc')||{}).value) || window._entTC || 3.70;
        var pen = totalImp * tc;
        el.innerHTML = '<span style="font-weight:900;">$ ' + totalImp.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) +
            '</span><span style="font-size:.75rem;color:var(--subtext);margin-left:.4rem;">\u2248 S/ ' + pen.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span>';
    } else {
        el.textContent = 'S/ ' + totalImp.toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
    }
};

window._entActualizarTC = function() {
    var moneda = (document.getElementById('ent-f-moneda') || {}).value || 'PEN';
    var mon = moneda === 'USD' ? '$' : 'S/';
    var el = document.getElementById('ent-total-display');
    if (el) { var old = el.textContent.replace(/^[S\$\/\s\.]+/,''); el.textContent = mon + ' ' + (old || '0.00'); }
};

window._entSetIgvMode = function(mode) {
    var prevMode = window._entIgvMode || 'incluido';
    window._entIgvMode = mode;
    var cfg = { 'sin_igv': 'ent-igv-btn-sin', 'incluido': 'ent-igv-btn-inc', 'mas_igv': 'ent-igv-btn-mas' };
    Object.keys(cfg).forEach(function(m) {
        var btn = document.getElementById(cfg[m]);
        if (!btn) return;
        if (m === mode) { btn.style.background = '#16a34a'; btn.style.color = '#fff'; btn.style.borderColor = '#16a34a'; }
        else { btn.style.background = '#f1f5f9'; btn.style.color = '#64748b'; btn.style.borderColor = '#e2e8f0'; }
    });
    document.querySelectorAll('.ent-item-cant').forEach(function(el) {
        var idx = parseInt(el.dataset.idx);
        var vuEl = document.querySelector('.ent-item-vu[data-idx="'+idx+'"]');
        var puEl = document.querySelector('.ent-item-pu[data-idx="'+idx+'"]');
        if (vuEl && puEl && prevMode !== mode) {
            if (mode === 'mas_igv') {
                // PU actual pasa a ser el nuevo VU (base)
                vuEl.value = puEl.value;
            } else if (mode === 'incluido' && prevMode === 'mas_igv') {
                // VU actual pasa a ser el nuevo PU (precio inclusive)
                puEl.value = vuEl.value;
            }
        }
        if (vuEl) {
            vuEl.readOnly = false;
            vuEl.style.background = '';
            vuEl.style.color = '';
        }
        if (puEl) {
            puEl.readOnly = false;
            puEl.style.background = '';
            puEl.style.color = '';
        }
        var src = mode === 'mas_igv' ? 'vu' : 'pu';
        window._entCalcImporte(idx, src);
    });
};

// ── Subida directa a S3 vía Pre-signed URLs (Ultra rápida, sin timeout de servidor) ──
window._entSubirArchivosDirectoS3 = async function(entradaId, listaArchivos) {
    var validos = (listaArchivos || []).filter(function(a) { return a && a.file; });
    if (!validos.length) return true;

    var archivosMetadata = validos.map(function(a) {
        return {
            fileName: a.file.name,
            contentType: a.file.type || 'application/pdf',
            tipo: a.tipo
        };
    });

    // 1. Obtener Presigned Upload URLs de S3
    var rPresigned = await fetch('/api/almacen/entradas/' + encodeURIComponent(entradaId) + '/archivos/presigned', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (localStorage.getItem('fleet_token') || '')
        },
        body: JSON.stringify({ archivos: archivosMetadata })
    });

    if (!rPresigned.ok) {
        var errTxt = await rPresigned.text().catch(function() { return ''; });
        throw new Error('Error solicitando permisos de subida: ' + (errTxt || rPresigned.statusText));
    }

    var data = await rPresigned.json();
    var urls = data.urls || [];
    if (!urls.length) throw new Error('No se generaron URLs de subida');

    // 2. Subir directamente a S3 en paralelo
    var exitosos = [];
    var uploadPromises = validos.map(async function(item, idx) {
        var uInfo = urls[idx];
        if (!uInfo || !uInfo.uploadUrl) return;

        var putRes = await fetch(uInfo.uploadUrl, {
            method: 'PUT',
            body: item.file
        });

        if (!putRes.ok) {
            throw new Error('Error al transferir ' + item.tipo + ' a AWS S3 (HTTP ' + putRes.status + ')');
        }

        exitosos.push({
            tipo: item.tipo,
            finalUrl: uInfo.finalUrl,
            s3Key: uInfo.s3Key,
            documento_referencia: item.documento_referencia || null
        });
    });

    await Promise.all(uploadPromises);

    // 3. Confirmar URLs en BD
    if (exitosos.length > 0) {
        var rConfirm = await fetch('/api/almacen/entradas/' + encodeURIComponent(entradaId) + '/archivos/confirmar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (localStorage.getItem('fleet_token') || '')
            },
            body: JSON.stringify({ exitosos: exitosos })
        });
        if (!rConfirm.ok) {
            throw new Error('Error confirmando registro de archivos en base de datos');
        }
    }

    return true;
};

// ── Guardar ───────────────────────────────────────────────────────
window.guardarEntrada = function() {
    if (window._isGuardandoEntrada) return;
    if (!window.guardAction('ent_inv', 'c')) return;
    var fecha      = (document.getElementById('ent-f-fecha')  || {}).value || '';
    var serie      = (document.getElementById('ent-f-serie')  || {}).value || '';
    var numero     = (document.getElementById('ent-f-numero') || {}).value || '';
    var provId     = window._cbGet('ent-f-proveedor');
    var provNombre = window._cbGetText('ent-f-proveedor');
    var ctaProv    = (document.getElementById('ent-f-cuenta-prov') || {}).value || '';
    var ctaEmpresa = (document.getElementById('ent-f-cuenta-empresa') || {}).value || '';
    var autoriza   = (document.getElementById('ent-f-autoriza') || {}).value || '';
    var solicitante= autoriza || (document.getElementById('ent-f-solicitante') || {}).value || '';
    var moneda     = (document.getElementById('ent-f-moneda')  || {}).value || 'PEN';
    var obs        = (document.getElementById('ent-f-obs')     || {}).value || '';
    var tipo_orden = (document.getElementById('ent-f-tipo-orden') || {}).value || 'Orden de compra';
    var condicion_pago = (document.getElementById('ent-f-condicion-pago') || {}).value || 'Al contado';
    var dias_credito = parseInt((document.getElementById('ent-f-dias-credito') || {}).value, 10) || 0;
    var prioridad  = (document.getElementById('ent-f-prioridad') || {}).value || 'Normal';
    var motivo     = (document.getElementById('ent-f-motivo')  || {}).value || '';
    var centro_costo = (document.getElementById('ent-f-centro-costo') || {}).value || 'CC-100';
    var sub_motivo = (document.getElementById('ent-f-sub-motivo') || {}).value || '';
    var placa      = window._cbGet('ent-f-placa') || '';
    var ot_id      = window._cbGet('ent-f-ot') || '';
    if (tipo_orden.toLowerCase() === 'orden de servicio') {
        placa = (document.getElementById('ent-f-ot-placa') || {}).value || '';
    } else {
        ot_id = null;
    }
      
    if (!fecha)  { alert('Falta la fecha.'); return; }
    if (!autoriza) { alert('Por favor seleccione el Directivo Autorizador / Solicitante.'); return; }
    if (!provId || (window._entProvItems && !window._entProvItems.find(function(p) { return p.value === provId; }))) {
        var typedProv = provNombre || window._cbGetText('ent-f-proveedor');
        if (typedProv) {
            window._entConfirmarNuevoProveedor(typedProv);
        } else {
            alert('Por favor selecciona o ingresa un proveedor.');
        }
        return;
    }

    var invIds = document.querySelectorAll('.ent-item-inv-id');
    var descs  = document.querySelectorAll('.ent-item-desc');
    var cants  = document.querySelectorAll('.ent-item-cant');
    var pus    = document.querySelectorAll('.ent-item-pu');
    var imps   = document.querySelectorAll('.ent-item-imp');
    var items  = [];
    for (var i = 0; i < cants.length; i++) {
        var invId = invIds[i] ? invIds[i].value : '';
        var desc  = descs[i]  ? descs[i].value  : '';
        if (!invId && !desc) continue;
        
        var validItem = window._entInvData && window._entInvData.find(function(it) { return it.id === invId; });
        var expectedLabel = validItem ? (validItem.id + ' — ' + (validItem.descripcion || '')) : '';
        if (!validItem || desc.trim() !== expectedLabel.trim()) { 
            alert('El artículo "' + desc + '" en la fila ' + (i+1) + ' no es válido o fue modificado. Seleccione uno correcto de la lista desplegable.'); 
            return; 
        }
        
        var cant = parseFloat(cants[i].value) || 0;
        var pu   = parseFloat(pus[i] ? pus[i].value : 0) || 0;
        var imp  = parseFloat(imps[i].value) || cant * pu;
        if (cant <= 0) { alert('Cantidad inválida en fila '+(i+1)); return; }
        // costo_unitario = precio unitario final (con IGV incluido)
        items.push({ inventario_id: invId||null, descripcion: desc, cantidad: cant, costo_unitario: pu, moneda: moneda, importe: imp });
    }
    if (!items.length) { alert('Agrega al menos un artículo.'); return; }

    // Guardar en el historial de solicitantes para futuros autocompletados
    if (solicitante) {
        window._entGuardarSolicitanteHistorico(solicitante);
    }

    var existingEnt = window._entEditId ? ((window._entData || []).find(function(e) { return e.id === window._entEditId; }) || {}) : {};
    var urlCotValue = document.getElementById('ent-f-url-cotizacion') ? document.getElementById('ent-f-url-cotizacion').value : '';

    var payload = {
        fecha: fecha,
        serie: serie,
        numero_correlativo: numero,
        proveedor_id: provId || null,
        proveedor_nombre: provNombre || null,
        cuenta_bancaria_proveedor: ctaProv || null,
        cuenta_bancaria_empresa: ctaEmpresa || null,
        solicitante: solicitante || null,
        centro_costo: centro_costo,
        sub_motivo: sub_motivo,
        autoriza: autoriza,
        documento_referencia: existingEnt.documento_referencia || null,
        estado_factura: existingEnt.estado_factura || 'Factura Pendiente',
        moneda: moneda,
        tipo_igv: window._entIgvMode || 'sin_igv',
        tipo_cambio: (parseFloat((document.getElementById('ent-f-tc')||{}).value) || window._entTC || 3.40),
        prioridad: prioridad,
        observaciones: obs,
        motivo_entrada: motivo,
        placa: placa,
        ot_id: ot_id,
        tipo_orden: tipo_orden,
        condicion_pago: condicion_pago,
        dias_credito: dias_credito,
        dias_pagar: dias_credito,
        creado_por: localStorage.getItem('fleet_nombre_usuario') || localStorage.getItem('fleet_user') || 'Daniel',
        url_cotizacion: urlCotValue || (window._entEditId ? undefined : null),
        items: items
    };

    var method = window._entEditId ? 'PUT' : 'POST';
    var url = window._entEditId ? '/api/almacen/entradas/' + window._entEditId : '/api/almacen/entradas';

    var btnGuardar = document.getElementById('btn-guardar-entrada');
    var originalBtnHtml = btnGuardar ? btnGuardar.innerHTML : '';
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<span class="spinner-border spinner-border-sm me-2" style="width: 1rem; height: 1rem;"></span>Procesando...';
    }
    window._isGuardandoEntrada = true;

    fetch(url, { method: method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(r) {
            // Cierre del formulario y recarga inmediata
            window._entCerrarModal();
            window._entEditId = null;
            window.cargarEntradas();
        })
        .catch(function(err) { 
            alert('Error al guardar orden: ' + err.message); 
        })
        .finally(function() {
            window._isGuardandoEntrada = false;
            if (btnGuardar) {
                btnGuardar.disabled = false;
                btnGuardar.innerHTML = originalBtnHtml;
            }
        });
};

// ── Subida inmediata de cotización al seleccionar archivo (Mismo patrón ultrarrápido que Documentos de Flota) ──
window._entSubirCotizacionInput = async function(input) {
    var preview = document.getElementById('ent-cotizacion-preview');
    var btnSel = document.getElementById('ent-btn-sel-cotizacion');
    var hiddenUrl = document.getElementById('ent-f-url-cotizacion');
    if (!input.files || !input.files[0]) return;

    var file = input.files[0];
    if (preview) {
        preview.innerHTML = '<span class="spinner-border spinner-border-sm text-danger me-1" style="width:0.85rem; height:0.85rem;"></span> <span class="text-primary fw-medium small">Subiendo ' + _entEsc(file.name) + ' a la nube...</span>';
    }
    if (btnSel) btnSel.classList.add('disabled');

    try {
        var token = localStorage.getItem('fleet_token') || localStorage.getItem('token') || '';
        var resUrl = await fetch('/api/almacen/entradas/upload-url?filename=' + encodeURIComponent(file.name) + '&contentType=' + encodeURIComponent(file.type || 'application/pdf') + '&tipo=cotizacion', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!resUrl.ok) throw new Error('Error solicitando permisos de subida');
        var urlData = await resUrl.json();
        if (!urlData.uploadUrl) throw new Error(urlData.error || 'No se obtuvo URL de subida');

        var resUp = await fetch(urlData.uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type || 'application/pdf' }
        });
        if (!resUp.ok) throw new Error('Error transfiriendo archivo a AWS S3');

        if (hiddenUrl) hiddenUrl.value = urlData.fileUrl;

        if (preview) {
            preview.innerHTML = '<span class="badge bg-success-subtle text-success border border-success-subtle fw-bold d-inline-flex align-items-center gap-1 py-1 px-2" style="border-radius:8px;">' +
                '<i class="bi bi-check2-circle"></i> ' + _entEsc(file.name) + ' (' + (file.size / 1024).toFixed(1) + ' KB)' +
                '</span>' +
                '<button type="button" class="btn btn-sm btn-link text-danger p-0 ms-2 text-decoration-none" title="Quitar archivo" onclick="window._entEliminarCotizacionTemp()"><i class="bi bi-x-circle-fill"></i></button>';
        }
    } catch(e) {
        console.error('Error al subir cotización:', e);
        if (hiddenUrl) hiddenUrl.value = '';
        if (preview) {
            preview.innerHTML = '<span class="text-danger small fw-semibold"><i class="bi bi-exclamation-triangle me-1"></i> Error al subir: ' + _entEsc(e.message) + '</span>';
        }
        alert('Error al subir cotización: ' + e.message);
    } finally {
        if (btnSel) btnSel.classList.remove('disabled');
    }
};

window._entEliminarCotizacionTemp = function() {
    var f = document.getElementById('ent-f-cotizacion');
    if (f) f.value = '';
    var hiddenUrl = document.getElementById('ent-f-url-cotizacion');
    if (hiddenUrl) hiddenUrl.value = '';
    var preview = document.getElementById('ent-cotizacion-preview');
    if (preview) preview.innerHTML = '<span class="text-muted small">Ningún archivo seleccionado</span>';
};

window._entOnFileChange = function(input, previewId) {
    window._entSubirCotizacionInput(input);
};

// ── Abrir panel ───────────────────────────────────────────────────
window.abrirModalEntrada = function() {
    window._entEditId = null;
    var cards = document.getElementById('ent-items-cards');
    if (cards) cards.innerHTML = '';
    window._entItemIdx = 0;
    var totalEl = document.getElementById('ent-total-display');
    if (totalEl) totalEl.textContent = 'S/ 0.00';

    var modalTitle = document.getElementById('ent-modal-title');
    if (modalTitle) modalTitle.textContent = 'Nueva Orden de Compra';

    var anioActual = new Date().getFullYear();
    var serieEl = document.getElementById('ent-f-serie');
    if (serieEl) serieEl.value = String(anioActual);
    var numEl = document.getElementById('ent-f-numero');
    if (numEl) numEl.value = '';
    var codInput = document.getElementById('ent-f-codigo-completo');
    var badgeCod = document.getElementById('ent-badge-correlativo');
    if (codInput) codInput.value = 'Calculando...';
    if (badgeCod) badgeCod.textContent = 'N° ' + anioActual + '-00001';

    // Obtener próximo correlativo desde el backend
    fetch('/api/almacen/entradas/proximo-codigo?anio=' + anioActual)
        .then(function(r) { return r.json(); })
        .then(function(d) {
            if (d && d.codigo) {
                var cleanCod = d.codigo.replace(/^ENT-/, '');
                if (codInput) codInput.value = cleanCod;
                if (badgeCod) badgeCod.textContent = 'N° ' + cleanCod;
                if (serieEl) serieEl.value = String(cleanCod.split('-')[0] || anioActual);
                if (numEl) numEl.value = d.codigo;
            } else {
                if (codInput) codInput.value = anioActual + '-00001';
            }
        })
        .catch(function() {
            if (codInput) codInput.value = anioActual + '-00001';
        });

    ['ent-f-obs', 'ent-f-placa-txt', 'ent-f-placa', 'ent-f-motivo', 'ent-f-solicitante'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
    });

    // Cargar historial de solicitantes en datalist
    window._entCargarSolicitantesHistoricos();

    var ctaProv = document.getElementById('ent-f-cuenta-prov');
    if (ctaProv) ctaProv.innerHTML = '<option value="">Seleccione cuenta de proveedor...</option>';
    
    // Cargar cuentas bancarias de la empresa limpias desde BD
    window._entCargarCuentasEmpresa();

    var prio = document.getElementById('ent-f-prioridad');
    if (prio) prio.value = 'Normal';
    
    var autorizaEl = document.getElementById('ent-f-autoriza');
    if (autorizaEl) autorizaEl.value = '';
    var ccEl = document.getElementById('ent-f-centro-costo');
    if (ccEl) ccEl.value = 'CC-100';
    var motGastoEl = document.getElementById('ent-f-motivo-gasto');
    if (motGastoEl) motGastoEl.value = 'Gastos Administrativos / Oficina';
    if (typeof window._entCambiarMotivoGasto === 'function') {
        window._entCambiarMotivoGasto();
    }

    var tipoOrden = document.getElementById('ent-f-tipo-orden');
    if (tipoOrden) tipoOrden.value = 'Orden de compra';
    var condPago = document.getElementById('ent-f-condicion-pago');
    if (condPago) condPago.value = 'Al contado';
    window._entOnCondicionPagoChange();
    setTimeout(window._entToggleTipoOrden, 50);

    var fCot = document.getElementById('ent-f-cotizacion');
    if (fCot) fCot.value = '';
    var fCotUrl = document.getElementById('ent-f-url-cotizacion');
    if (fCotUrl) fCotUrl.value = '';
    var fCotPrev = document.getElementById('ent-cotizacion-preview');
    if (fCotPrev) fCotPrev.textContent = 'Ningún archivo seleccionado';
    var fCotExist = document.getElementById('ent-cotizacion-existente');
    if (fCotExist) { fCotExist.style.display = 'none'; fCotExist.innerHTML = ''; }

    window._cbReset('ent-f-proveedor');
    var fecha = document.getElementById('ent-f-fecha');
    if (fecha) fecha.value = _entFechaHoyLocal();
    var mon = document.getElementById('ent-f-moneda');
    if (mon) mon.value = 'PEN';
    window._entOnMonedaChange();

    window._entAgregarItem();
    window._entSetIgvMode('incluido');

    var panel = document.getElementById('modal-entrada');
    var bd    = document.getElementById('ent-entrada-bd');
    if (panel) panel.classList.add('open');
    if (bd)    bd.style.display = 'block';
};

window.abrirModalEditarEntrada = function(id) {
    var entrada = (window._entData || []).find(function(e) { return e.id === id; });
    if (!entrada) return alert('No se encontró la entrada');
    
    var st = String(entrada.estado || 'Registrado').toLowerCase().trim();
    if (st === 'aprobado' || st === 'aprobada' || st === 'procesado' || st === 'procesada' || st === 'despachado' || st === 'anulado' || st === 'rechazado') {
        alert('Esta Orden de Compra se encuentra en estado "' + (entrada.estado || 'Aprobado') + '" y ya no puede ser modificada.');
        return;
    }

    window.abrirModalEntrada(); // Resetea y abre el panel
    window._entEditId = id; // Sobrescribimos el reset

    var modalTitle = document.getElementById('ent-modal-title');
    if (modalTitle) modalTitle.textContent = 'Editar ' + (entrada.tipo_orden || 'Orden de Compra');

    var codInput = document.getElementById('ent-f-codigo-completo');
    var badgeCod = document.getElementById('ent-badge-correlativo');
    var numDisplay = (entrada.id || '').replace(/^ENT-/, '') || entrada.numero_correlativo || id;
    if (codInput) codInput.value = numDisplay;
    if (badgeCod) badgeCod.textContent = 'N° ' + numDisplay;

    var fFecha = document.getElementById('ent-f-fecha');
    if (fFecha && entrada.fecha) fFecha.value = String(entrada.fecha).split('T')[0];

    var fSerie = document.getElementById('ent-f-serie');
    if (fSerie) fSerie.value = entrada.serie || '';
    var fNum = document.getElementById('ent-f-numero');
    if (fNum) fNum.value = entrada.numero_correlativo || entrada.id || '';

    var fTipoOrden = document.getElementById('ent-f-tipo-orden');
    if (fTipoOrden) fTipoOrden.value = entrada.tipo_orden || 'Orden de compra';
    window._cbSet('ent-f-ot', entrada.ot_id || '', entrada.ot_id || '');
    setTimeout(window._entToggleTipoOrden, 50);

    var fCondPago = document.getElementById('ent-f-condicion-pago');
    if (fCondPago) {
        fCondPago.value = entrada.condicion_pago || 'Al contado';
    }
    window._entOnCondicionPagoChange();

    var fDiasCredito = document.getElementById('ent-f-dias-credito');
    if (fDiasCredito && (entrada.dias_pagar != null || entrada.dias_credito != null)) {
        fDiasCredito.value = entrada.dias_pagar != null ? entrada.dias_pagar : entrada.dias_credito;
    }

    var fPrio = document.getElementById('ent-f-prioridad');
    if (fPrio) fPrio.value = entrada.prioridad || 'Normal';

    var directivoVal = entrada.autoriza || entrada.solicitante || '';
    var fSoli = document.getElementById('ent-f-solicitante');
    if (fSoli) fSoli.value = directivoVal;

    var fAutoriza = document.getElementById('ent-f-autoriza');
    if (fAutoriza) fAutoriza.value = directivoVal;

    var fCC = document.getElementById('ent-f-centro-costo');
    if (fCC) fCC.value = entrada.centro_costo || 'CC-100';

    var fMotGasto = document.getElementById('ent-f-motivo-gasto');
    var subMot = entrada.sub_motivo || '';
    var motGastoEncontrado = 'Gastos Administrativos / Oficina';
    if (subMot && window._entSubMotivosMap) {
        Object.keys(window._entSubMotivosMap).forEach(function(m) {
            if (window._entSubMotivosMap[m].includes(subMot)) motGastoEncontrado = m;
        });
    } else if (entrada.placa) {
        motGastoEncontrado = 'Mantenimiento y Auxilio';
    }
    if (fMotGasto) fMotGasto.value = motGastoEncontrado;
    if (typeof window._entCambiarMotivoGasto === 'function') {
        window._entCambiarMotivoGasto(subMot);
    }

    window._entCargarCuentasEmpresa(entrada.cuenta_bancaria_empresa);

    var fObs = document.getElementById('ent-f-obs');
    if (fObs) fObs.value = entrada.observaciones || '';

    var fMotivo = document.getElementById('ent-f-motivo');
    if (fMotivo) fMotivo.value = entrada.motivo_entrada || '';
    
    if (entrada.placa) {
        window._cbSet('ent-f-placa', entrada.placa, entrada.placa);
    }

    if (entrada.ot_id) {
        window._cbSet('ent-f-ot', entrada.ot_id, entrada.ot_id + (entrada.placa ? ' — ' + entrada.placa : ''));
        var placaInput = document.getElementById('ent-f-ot-placa');
        if (placaInput) placaInput.value = entrada.placa || '';
    }
      
    if (entrada.proveedor_id) {
        window._cbSet('ent-f-proveedor', entrada.proveedor_id, entrada.proveedor_nombre);
        window._entCargarCuentasProveedor(entrada.proveedor_id, entrada.cuenta_bancaria_proveedor);
    } else if (entrada.proveedor_nombre) {
        var el = document.getElementById('ent-f-proveedor-txt');
        if (el) el.value = entrada.proveedor_nombre;
    }

    var mon = document.getElementById('ent-f-moneda');
    if (mon && entrada.moneda) mon.value = entrada.moneda;
    window._entOnMonedaChange();

    window._entSetIgvMode(entrada.tipo_igv || 'sin_igv');

    // Cargar visualmente los archivos adjuntos existentes
    var fCot = document.getElementById('ent-f-cotizacion');
    if (fCot) fCot.value = '';
    var fCotUrl = document.getElementById('ent-f-url-cotizacion');
    if (fCotUrl) fCotUrl.value = entrada.url_cotizacion || '';
    var fCotPrev = document.getElementById('ent-cotizacion-preview');
    if (fCotPrev) fCotPrev.textContent = entrada.url_cotizacion ? 'Cotización actual conservada' : 'Ningún archivo seleccionado';
    var fCotExist = document.getElementById('ent-cotizacion-existente');
    if (fCotExist) {
        var cotUrl = entrada.url_cotizacion_presigned || entrada.url_cotizacion;
        if (cotUrl) {
            fCotExist.style.display = 'block';
            fCotExist.innerHTML = '<a href="' + cotUrl + '" target="_blank" class="btn btn-sm btn-outline-danger fw-bold" style="border-radius:8px; font-size:0.75rem;"><i class="bi bi-file-earmark-pdf me-1"></i> Ver Cotización Guardada</a>';
        } else {
            fCotExist.style.display = 'none';
            fCotExist.innerHTML = '';
        }
    }

    var cards = document.getElementById('ent-items-cards');
    if (cards) cards.innerHTML = '';
    window._entItemIdx = 0;

    var items = entrada.items || [];
    items.forEach(function(it) {
        window._entAgregarItem();
        var idx = window._entItemIdx - 1;
        var cbId = 'ent-art-' + idx;
        
        setTimeout(function() {
            if (it.inventario_id) {
                window._cbSet(cbId, it.inventario_id, it.inventario_id + ' — ' + (it.descripcion || ''));
            } else {
                var txt = document.getElementById(cbId + '-txt');
                if (txt) txt.value = it.descripcion || '';
            }
            
            var cantEl = document.querySelector('.ent-item-cant[data-idx="'+idx+'"]');
            var puEl   = document.querySelector('.ent-item-pu[data-idx="'+idx+'"]');
            
            if (cantEl) cantEl.value = it.cantidad || 0;
            if (puEl) {
                puEl.value = it.costo_unitario || 0;
                puEl.dataset.oldCost = it.costo_unitario || 0;
            }
            window._entCalcImporte(idx, 'pu');
        }, 150);
    });
};

// ── Cerrar panel ──────────────────────────────────────────────────
window._entCerrarModal = function() {
    if (window._entQrScanner) window._entCerrarQR();
    var panel = document.getElementById('modal-entrada');
    var bd    = document.getElementById('ent-entrada-bd');
    if (panel) panel.classList.remove('open');
    if (bd)    bd.style.display = 'none';

    var f1 = document.getElementById('ent-f-voucher'); if (f1) f1.value = '';
    var f2 = document.getElementById('ent-f-cotizacion'); if (f2) f2.value = '';
    var f3 = document.getElementById('ent-f-factura'); if (f3) f3.value = '';
};

// ── Eliminar ──────────────────────────────────────────────────────
window.eliminarEntrada = function(id) {
    if (!window.guardAction('ent_inv', 'd')) return;
    if (!confirm('¿Eliminar entrada '+id+'? Se eliminarán sus detalles.')) return;
    fetch('/api/almacen/entradas/'+encodeURIComponent(id), {method:'DELETE'})
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function() {
            if (window._entDetalleId === id) window._entCerrarDetalle();
            window.cargarEntradas();
        })
        .catch(function(err) { alert('Error: '+err.message); });
};

window.anularEntrada = function(id) {
    if (!window.checkPerm('ent_inv', 'd')) return;
    var motivo = prompt('Motivo de anulación para la entrada ' + id + ':');
    if (motivo === null) return;
    if (!motivo.trim()) return alert('Debe ingresar un motivo para anular.');
    fetch('/api/almacen/entradas/' + encodeURIComponent(id) + '/anular', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ motivo: motivo })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(r) {
        if (window._entDetalleId === id) window._entCerrarDetalle();
        window.cargarEntradas();
    })
    .catch(function(err) { alert('Error: ' + err.message); });
};

// ── Filtrar + Render ──────────────────────────────────────────────
window.filtrarEntradas = function() {
    var buscar  = ((document.getElementById('ent-buscar')     ||{}).value||'').toLowerCase();
    var desde   = ((document.getElementById('ent-fil-desde')  ||{}).value||'');
    var hasta   = ((document.getElementById('ent-fil-hasta')  ||{}).value||'');
    window._entFiltrados = (window._entData||[]).filter(function(d) {
        var matchB = !buscar||
            (d.id||'').toLowerCase().includes(buscar)||
            (d.proveedor_nombre||'').toLowerCase().includes(buscar)||
            (d.documento_referencia||'').toLowerCase().includes(buscar)||
            (d.creado_por||'').toLowerCase().includes(buscar)||
            (d.items||[]).some(function(it) {
                return (it.inventario_id||'').toLowerCase().includes(buscar) ||
                       (it.descripcion||'').toLowerCase().includes(buscar);
            });
        var fecha = d.fecha ? String(d.fecha).split('T')[0] : '';
        var matchD = !desde || fecha >= desde;
        var matchH = !hasta || fecha <= hasta;
        // Si solo hay una fecha: filtro exacto por ese día
        if (desde && !hasta) { matchD = fecha === desde; matchH = true; }
        if (!desde && hasta) { matchD = true; matchH = fecha === hasta; }
        return matchB && matchD && matchH;
    });
    window._entPagActual = 1;

    // Bento KPIs
    var totalOC = window._entFiltrados.length;
    var totalMonto = 0;
    var provsSet = {};
    var totalItems = 0;

    window._entFiltrados.forEach(function(d) {
        totalMonto += parseFloat(d.total_pen || 0);
        var prov = d.proveedor_nombre || d.proveedor_id;
        if (prov) provsSet[String(prov).trim()] = true;
        (d.items || []).forEach(function(it) {
            totalItems += parseFloat(it.cantidad || 0);
        });
    });

    var setKpi = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    setKpi('kpi-ent-total', totalOC);
    setKpi('kpi-ent-monto', 'S/ ' + totalMonto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setKpi('kpi-ent-provs', Object.keys(provsSet).length);
    setKpi('kpi-ent-items', Math.round(totalItems));

    window._entRender();
};

window._entLimpiarFechas = function() {
    var d = document.getElementById('ent-fil-desde');
    var h = document.getElementById('ent-fil-hasta');
    if (d) d.value = '';
    if (h) h.value = '';
    window.filtrarEntradas();
};

window._entRender = function() {
    var datos = window._entFiltrados || [];
    var total = datos.length;
    var totalPag = Math.max(1, Math.ceil(total / _ENT_POR_PAG));
    var pag = Math.min(window._entPagActual, totalPag);
    window._entPagActual = pag;
    var pagina = datos.slice((pag - 1) * _ENT_POR_PAG, pag * _ENT_POR_PAG);
    var canDelete = window.checkPerm('ent_inv', 'd');
    var canEdit = window.checkPerm('ent_inv', 'u');
    var isAdmin = localStorage.getItem('fleet_role') === 'Administrador';
    var todayStr = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Lima'});

    var cont = document.getElementById('ent-contador');
    if (cont) cont.textContent = total + ' registro' + (total !== 1 ? 's' : '');

    var tbody = document.getElementById('tbody-entradas');
    var cardContainer = document.getElementById('entCardContainer');
    if (!tbody) return;
    if (!pagina.length) {
        tbody.innerHTML = '<tr><td colspan="17" class="td-placeholder"><i class="bi bi-inbox" style="font-size:1.5rem;opacity:0.3"></i><br>Sin órdenes encontradas</td></tr>';
        if (cardContainer) cardContainer.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>No se encontraron órdenes registradas.</div>';
        var paginEl2 = document.getElementById('ent-paginacion');
        if (paginEl2) paginEl2.innerHTML = '';
        return;
    }

    tbody.innerHTML = '';
    var htmlCards = '';

    pagina.forEach(function(d) {
        var fecha = _entFmtFechaHora(d.fecha, d.created_at);
        var fechaCorta = d.fecha ? new Date(String(d.fecha).replace(' ', 'T')).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
        var isAnulado = d.estado === 'Anulado';
        var dCreated = d.created_at ? String(d.created_at).split('T')[0] : fecha;
        var estadoLimpio = String(d.estado || 'Registrado').toLowerCase().trim();
        var esModificable = (estadoLimpio === 'registrado' || estadoLimpio === 'registrada' || estadoLimpio === 'pendiente' || !d.estado);
        var canEditRow = canEdit && !isAnulado && esModificable && (isAdmin || dCreated === todayStr);

        var tp = parseFloat(d.total_pen || 0);
        var totalFmt = '<strong style="color:#16a34a;">S/ ' + tp.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</strong>';
        var estadoNorm = (d.estado || 'REGISTRADA').toUpperCase();
        var estadoHtml = '<span class="badge" style="background-color:#64748b !important; color:#ffffff !important; font-size:0.68rem; font-weight:700; letter-spacing:0.03em; border-radius:4px; padding:3px 8px; display:inline-block;">REGISTRADA</span>';
        if (estadoNorm === 'ANULADO' || estadoNorm === 'ANULADA' || estadoNorm === 'RECHAZADO' || estadoNorm === 'RECHAZADA') {
            estadoHtml = '<span class="badge" style="background-color:#dc2626 !important; color:#ffffff !important; font-size:0.68rem; font-weight:700; letter-spacing:0.03em; border-radius:4px; padding:3px 8px; display:inline-block;">' + estadoNorm + '</span>';
        } else if (estadoNorm === 'APROBADO' || estadoNorm === 'APROBADA' || estadoNorm === 'AUTORIZADO' || estadoNorm === 'AUTORIZADA') {
            estadoHtml = '<span class="badge" style="background-color:#16a34a !important; color:#ffffff !important; font-size:0.68rem; font-weight:700; letter-spacing:0.03em; border-radius:4px; padding:3px 8px; display:inline-block;">APROBADA</span>';
        } else if (estadoNorm === 'PROCESADO' || estadoNorm === 'PROCESADA' || estadoNorm === 'PAGADO' || estadoNorm === 'PAGADA') {
            estadoHtml = '<span class="badge" style="background-color:#0284c7 !important; color:#ffffff !important; font-size:0.68rem; font-weight:700; letter-spacing:0.03em; border-radius:4px; padding:3px 8px; display:inline-block;">PROCESADA</span>';
        } else if (estadoNorm === 'OBSERVADO' || estadoNorm === 'OBSERVADA') {
            estadoHtml = '<span class="badge" style="background-color:#f59e0b !important; color:#ffffff !important; font-size:0.68rem; font-weight:700; letter-spacing:0.03em; border-radius:4px; padding:3px 8px; display:inline-block;">OBSERVADA</span>';
        } else if (estadoNorm === 'REGISTRADA' || estadoNorm === 'REGISTRADO' || estadoNorm === 'PENDIENTE') {
            estadoHtml = '<span class="badge" style="background-color:#64748b !important; color:#ffffff !important; font-size:0.68rem; font-weight:700; letter-spacing:0.03em; border-radius:4px; padding:3px 8px; display:inline-block;">REGISTRADA</span>';
        } else {
            estadoHtml = '<span class="badge" style="background-color:#64748b !important; color:#ffffff !important; font-size:0.68rem; font-weight:700; letter-spacing:0.03em; border-radius:4px; padding:3px 8px; display:inline-block;">' + estadoNorm + '</span>';
        }

        var tipoOrdText = (d.tipo_orden && d.tipo_orden.toLowerCase() === 'orden de servicio') ? 'ORDEN DE SERVICIO' : 'ORDEN DE COMPRA';
        var tipoOrdBadge = '<span class="text-dark fw-bold text-nowrap" style="font-size:0.75rem; letter-spacing:0.02em;">' + tipoOrdText + '</span>';
        var placaHtml = d.placa ? '<span class="text-dark fw-bold text-nowrap" style="font-size:0.78rem;">' + _entEsc(d.placa) + '</span>' : '<span class="text-dark fw-bold small">—</span>';
        var motivoHtml = d.motivo_entrada ? '<span class="text-dark fw-semibold" style="font-size:0.78rem;">' + _entEsc(d.motivo_entrada) + '</span>' : '<span class="text-muted small">—</span>';
        
        var vUrl = d.url_voucher_presigned || d.url_voucher;
        var cUrl = d.url_cotizacion_presigned || d.url_cotizacion;
        var fUrl = d.url_factura_presigned || d.url_factura;
        var vHTML = vUrl ? '<a href="'+_entEsc(vUrl)+'" target="_blank" class="text-danger text-decoration-none fw-bold" style="font-size:0.75rem;"><i class="bi bi-file-earmark-pdf"></i> Ver Voucher</a>' : '<a href="#" onclick="event.preventDefault(); event.stopPropagation(); window.abrirModalSubirArchivos(\'' + _entEsc(d.id) + '\');" class="text-secondary text-decoration-none small opacity-75" title="Subir Voucher"><i class="bi bi-upload"></i> Subir</a>';
        var cHTML = cUrl ? '<a href="'+_entEsc(cUrl)+'" target="_blank" class="text-primary text-decoration-none fw-bold" style="font-size:0.75rem;"><i class="bi bi-file-earmark-text"></i> Ver Cotización</a>' : '<a href="#" onclick="event.preventDefault(); event.stopPropagation(); window.abrirModalSubirArchivos(\'' + _entEsc(d.id) + '\');" class="text-secondary text-decoration-none small opacity-75" title="Subir Cotización"><i class="bi bi-upload"></i> Subir</a>';
        var fHTML = fUrl ? '<a href="'+_entEsc(fUrl)+'" target="_blank" class="text-success text-decoration-none fw-bold" style="font-size:0.75rem;"><i class="bi bi-file-earmark-check"></i> Ver Factura</a>' : '<a href="#" onclick="event.preventDefault(); event.stopPropagation(); window.abrirModalSubirArchivos(\'' + _entEsc(d.id) + '\');" class="text-secondary text-decoration-none small opacity-75" title="Subir Factura"><i class="bi bi-upload"></i> Subir</a>';

        var items = d.items || [];
        var countItems = items.length;
        var totalCant = items.reduce(function(acc, it) { return acc + (parseFloat(it.cantidad) || 0); }, 0);
        var isActive = d.id === window._entDetalleId;
        var activeCls = isActive ? ' ent-row-active' : '';
        if (isAnulado) activeCls += ' text-muted opacity-75';

        var codLimpio = String(d.id || '').replace(/^ENT-/i, '');
        var estNorm = (d.estado || 'REGISTRADA').toUpperCase();
        var isAprobadoRow = estNorm === 'APROBADO' || estNorm === 'APROBADA' || estNorm === 'AUTORIZADO' || estNorm === 'AUTORIZADA' || estNorm === 'PROCESADO' || estNorm === 'PROCESADA' || estNorm === 'PAGADO' || estNorm === 'PAGADA';
        var isAnuladoRow = estNorm.includes('RECHAZAD') || estNorm.includes('ANULAD');
        var isObservadoRow = estNorm.includes('OBSERVAD');
        var aprobadorVal = (isAprobadoRow || isAnuladoRow || isObservadoRow) ? (d.aprobador_nombre || d.aprobado_por || '') : '';
        var labelAccion = 'Aprobado: ';
        var iconoAccion = 'bi-person-check-fill text-success';
        if (isAnuladoRow) {
            labelAccion = 'Rechazado: ';
            iconoAccion = 'bi-person-x-fill text-danger';
        } else if (isObservadoRow) {
            labelAccion = 'Observado: ';
            iconoAccion = 'bi-person-exclamation text-warning';
        }
        var aprobadorHtml = (aprobadorVal && (isAprobadoRow || isAnuladoRow || isObservadoRow)) ? '<span class="text-dark fw-bold text-nowrap" style="font-size:0.78rem;"><i class="bi ' + iconoAccion + ' me-1"></i>' + _entEsc(aprobadorVal) + '</span>' : '<span class="text-muted small">—</span>';

        // Construir Card Móvil
        htmlCards += `
        <div class="ent-mobile-card">
            <!-- Header Card: N° OC + Fecha + Estado -->
            <div class="d-flex align-items-center justify-content-between mb-2">
                <div class="d-flex align-items-center gap-2">
                    <span class="fw-bolder text-primary font-monospace" style="font-size:0.95rem;">${_entEsc(codLimpio)}</span>
                    <span class="text-muted small" style="font-size:0.75rem;">• ${fechaCorta}</span>
                </div>
                <div>${estadoHtml}</div>
            </div>

            <!-- Proveedor, Placa y Centro Costo -->
            <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
                <span class="badge font-monospace fw-bold px-2 py-1" style="font-size:0.75rem; border-radius:6px; background:#eff6ff; color:#0f172a !important; border:1px solid #bfdbfe;">🏢 ${_entEsc(d.centro_costo || 'CC-100')}</span>
                ${d.proveedor_nombre ? `<span class="badge bg-light text-dark border fw-bold px-2 py-1" style="font-size:0.8rem; border-radius:6px;">🏢 ${_entEsc(d.proveedor_nombre)}</span>` : ''}
                ${d.placa ? `<span class="badge bg-light text-dark border fw-bold px-2 py-1" style="font-size:0.8rem; border-radius:6px;">🚛 ${_entEsc(d.placa)}</span>` : ''}
                <span class="badge bg-secondary-subtle text-secondary border fw-semibold px-2 py-1" style="font-size:0.72rem; border-radius:6px;">${tipoOrdText}</span>
            </div>

            <!-- Motivo y Aprobación -->
            <div class="mb-2">
                ${d.motivo_entrada ? `<div class="fw-bold text-dark" style="font-size:0.88rem;">${_entEsc(d.motivo_entrada)}</div>` : ''}
                ${aprobadorVal ? `<div class="text-muted small" style="font-size:0.75rem;"><i class="bi ${iconoAccion} me-1"></i>${labelAccion}<strong>${_entEsc(aprobadorVal)}</strong></div>` : ''}
                ${d.documento_referencia ? `<div class="text-muted small mt-1" style="font-size:0.75rem;"><i class="bi bi-file-text me-1"></i>Doc: ${_entEsc(d.documento_referencia)}</div>` : ''}
            </div>

            <!-- Resumen de Artículos & Importe -->
            <div class="d-flex align-items-center justify-content-between pt-2 border-top mb-3">
                <span class="badge bg-light text-dark border fw-semibold" style="font-size:0.75rem; border-radius:6px;">
                    <i class="bi bi-box-seam me-1 text-primary"></i>${countItems} ${countItems === 1 ? 'Ítem' : 'Ítems'} (${totalCant.toLocaleString('es-PE', {maximumFractionDigits:2})} u.)
                </span>
                <span class="fw-bold text-success font-monospace" style="font-size:0.95rem;">${(d.moneda === 'USD' ? '$ ' : 'S/ ') + tp.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
            </div>

            <!-- Botones de Acción Móvil -->
            <div class="d-flex align-items-center justify-content-between gap-1 pt-2 border-top">
                <button type="button" class="btn btn-sm btn-outline-primary fw-bold flex-grow-1 d-flex align-items-center justify-content-center gap-1 py-1" onclick="window.abrirModalDetalleOC('${_entEsc(d.id)}')" style="border-radius:8px; font-size:0.78rem;">
                    <i class="bi bi-eye"></i> Detalle
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger fw-semibold px-3 py-1 d-flex align-items-center gap-1" onclick="window.generarComprobanteEntrada('${_entEsc(d.id)}')" title="PDF" style="border-radius:8px; font-size:0.78rem;">
                    <i class="bi bi-file-earmark-pdf"></i> PDF
                </button>
                <div class="dropdown">
                    <button class="btn btn-sm btn-light border shadow-2xs rounded-3 px-2 py-1" type="button" data-bs-toggle="dropdown" data-bs-boundary="viewport" aria-expanded="false" style="border-radius:8px;">
                        <i class="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-3 p-1" style="font-size: 0.82rem; min-width: 170px; z-index: 1050;">
                        <li>
                            <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-medium text-dark" href="javascript:void(0)" onclick="window.abrirModalDetalleOC('${_entEsc(d.id)}')">
                                <i class="bi bi-eye text-primary fs-6"></i> Ver Detalle
                            </a>
                        </li>
                        <li>
                            <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-medium text-dark" href="javascript:void(0)" onclick="window.abrirModalSubirArchivos('${_entEsc(d.id)}')">
                                <i class="bi bi-paperclip text-info fs-6"></i> Adjuntos / Sustentos
                            </a>
                        </li>
                        ${canEditRow ? `
                        <li>
                            <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-medium text-dark" href="javascript:void(0)" onclick="window.abrirModalEditarEntrada('${_entEsc(d.id)}')">
                                <i class="bi bi-pencil text-warning fs-6"></i> Editar Orden
                            </a>
                        </li>
                        ` : ''}
                        ${canDelete ? `
                        <li><hr class="dropdown-divider my-1"></li>
                        <li>
                            <a class="dropdown-item rounded-2 py-2 d-flex align-items-center gap-2 fw-semibold text-danger" href="javascript:void(0)" onclick="window.eliminarEntrada('${_entEsc(d.id)}')">
                                <i class="bi bi-trash text-danger fs-6"></i> Eliminar
                            </a>
                        </li>
                        ` : ''}
                    </ul>
                </div>
            </div>
        </div>
        `;

        if (!items.length) {
            var tr0 = document.createElement('tr');
            tr0.className = activeCls.trim();
            tr0.innerHTML =
                '<td class="ps-3 text-center" style="vertical-align:middle;"><span class="btn-oc-code" onclick="event.stopPropagation(); window.abrirModalDetalleOC(\'' + _entEsc(d.id) + '\')" title="Ver Detalle de la Orden"><i class="bi bi-eye"></i> ' + _entEsc(codLimpio) + '</span></td>' +
                '<td class="text-center" style="vertical-align:middle;">' + tipoOrdBadge + '</td>' +
                '<td style="white-space:nowrap;font-size:.80rem;color:#0f172a;font-weight:600;">' + fecha + '</td>' +
                '<td class="text-center">' + estadoHtml + '</td>' +
                '<td>' + aprobadorHtml + '</td>' +
                '<td><span class="badge font-monospace fw-bold" style="font-size:0.74rem; background:#eff6ff; color:#0f172a !important; border:1px solid #bfdbfe; border-radius:6px; padding:3px 8px;">' + _entEsc(d.centro_costo || 'CC-100') + '</span></td>' +
                '<td>' + placaHtml + '</td>' +
                '<td>' + motivoHtml + '</td>' +
                '<td>' + (d.proveedor_nombre ? '<span class="text-dark fw-bold" style="font-size:.8rem;">' + _entEsc(d.proveedor_nombre) + '</span>' : '<span class="text-muted small">—</span>') + '</td>' +
                '<td class="text-dark font-monospace fw-bold" style="font-size:.75rem;white-space:nowrap;"></td>' +
                '<td class="col-articulo text-muted fw-semibold" style="font-size:.78rem;">Sin artículos</td>' +
                '<td class="text-end"></td>' +
                '<td class="text-end"></td>' +
                '<td class="text-end" style="white-space:nowrap;">' + totalFmt + '</td>' +
                '<td class="text-center">' + vHTML + '</td>' +
                '<td class="text-center">' + cHTML + '</td>' +
                '<td class="text-center">' + fHTML + '</td>' +
                '<td class="pe-3 text-center" style="white-space:nowrap;" onclick="event.stopPropagation();">' +
                    '<div class="d-flex gap-1 justify-content-center">' +
                        '<button class="btn btn-xs btn-outline-info" onclick="event.stopPropagation(); window.abrirModalSubirArchivos(\'' + _entEsc(d.id) + '\')" title="Subir / Adjuntar Archivos"><i class="bi bi-paperclip"></i></button>' +
                        '<button class="btn btn-xs btn-outline-primary" onclick="event.stopPropagation(); window.generarComprobanteEntrada(\'' + _entEsc(d.id) + '\')" title="Ver PDF"><i class="bi bi-eye"></i></button>' +
                        (canEditRow ? '<button class="btn btn-xs btn-outline-warning" onclick="window.abrirModalEditarEntrada(\'' + _entEsc(d.id) + '\')" title="Editar"><i class="bi bi-pencil"></i></button>' : '<button class="btn btn-xs" style="visibility:hidden"><i class="bi bi-pencil"></i></button>') +
                        (canDelete ? '<button class="btn btn-xs btn-outline-secondary" onclick="window.eliminarEntrada(\'' + _entEsc(d.id) + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>' : '<button class="btn btn-xs" style="visibility:hidden"><i class="bi bi-trash"></i></button>') +
                    '</div>' +
                '</td>';
            tbody.appendChild(tr0);
            return;
        }

        var buscar = ((document.getElementById('ent-buscar') || {}).value || '').toLowerCase().trim();
        var itemsFiltrados = items;
        if (buscar) {
            var cabText = [d.id, d.proveedor_nombre, d.documento_referencia, d.centro_costo].join(' ').toLowerCase();
            if (cabText.indexOf(buscar) === -1) {
                itemsFiltrados = items.filter(function(it) {
                    return [(it.inventario_id || ''), (it.descripcion || '')].join(' ').toLowerCase().indexOf(buscar) !== -1;
                });
            }
        }

        itemsFiltrados.forEach(function(it, idx) {
            var isFirst = idx === 0;
            var isLast  = idx === itemsFiltrados.length - 1;
            var tr = document.createElement('tr');
            var cls = activeCls;
            if (!isFirst) cls += ' ent-item-sub';
            if (isLast && itemsFiltrados.length > 1) cls += ' ent-item-last';
            tr.className = cls.trim();

            var cant  = parseFloat(it.cantidad || 0);
            var cu    = parseFloat(it.costo_unitario || 0);
            var nombre = _entEsc(_entDescLimpia(it.descripcion, it.inventario_id));
            var invId  = _entEsc(it.inventario_id || '—');
            var provHtml = d.proveedor_nombre ? '<span class="text-dark fw-bold" style="font-size:.8rem;">' + _entEsc(d.proveedor_nombre) + '</span>' : '<span class="text-muted small">—</span>';

            tr.innerHTML =
                '<td class="ps-3 text-center" style="vertical-align:middle;"><span class="btn-oc-code" onclick="event.stopPropagation(); window.abrirModalDetalleOC(\'' + _entEsc(d.id) + '\')" title="Ver Detalle de la Orden"><i class="bi bi-eye"></i> ' + _entEsc(codLimpio) + '</span></td>' +
                '<td class="text-center" style="vertical-align:middle;">' + tipoOrdBadge + '</td>' +
                '<td style="white-space:nowrap;font-size:.80rem;color:#0f172a;font-weight:600;">' + fecha + '</td>' +
                '<td class="text-center">' + estadoHtml + '</td>' +
                '<td>' + aprobadorHtml + '</td>' +
                '<td><span class="badge font-monospace fw-bold" style="font-size:0.74rem; background:#eff6ff; color:#0f172a !important; border:1px solid #bfdbfe; border-radius:6px; padding:3px 8px;">' + _entEsc(d.centro_costo || 'CC-100') + '</span></td>' +
                '<td>' + placaHtml + '</td>' +
                '<td>' + motivoHtml + '</td>' +
                '<td>' + provHtml + '</td>' +
                '<td class="text-dark font-monospace fw-bold" style="font-size:.75rem;white-space:nowrap;">' + invId + '</td>' +
                '<td class="col-articulo text-dark fw-semibold" style="font-size:.80rem;">' + nombre + '</td>' +
                '<td class="text-end text-dark fw-bold" style="font-size:.80rem;">' + cant.toLocaleString('es-PE', {maximumFractionDigits:3}) + '</td>' +
                '<td class="text-end text-dark fw-semibold" style="font-size:.80rem;">' + (d.moneda === 'USD' ? '$ ' : 'S/ ') + cu.toLocaleString('es-PE', {minimumFractionDigits:2,maximumFractionDigits:2}) + '</td>' +
                '<td class="text-end" style="white-space:nowrap;">' + (isFirst ? totalFmt : '') + '</td>' +
                '<td class="text-center">' + (isFirst ? vHTML : '') + '</td>' +
                '<td class="text-center">' + (isFirst ? cHTML : '') + '</td>' +
                '<td class="text-center">' + (isFirst ? fHTML : '') + '</td>' +
                '<td class="pe-3 text-center" style="white-space:nowrap;" onclick="event.stopPropagation();">' +
                    (isFirst ?
                        '<div class="d-flex gap-1 justify-content-center">' +
                            '<button class="btn btn-xs btn-outline-info" onclick="event.stopPropagation(); window.abrirModalSubirArchivos(\'' + _entEsc(d.id) + '\')" title="Subir / Adjuntar Archivos"><i class="bi bi-paperclip"></i></button>' +
                            '<button class="btn btn-xs btn-outline-primary" onclick="event.stopPropagation(); window.generarComprobanteEntrada(\'' + _entEsc(d.id) + '\')" title="Ver PDF"><i class="bi bi-eye"></i></button>' +
                            (canEditRow ? '<button class="btn btn-xs btn-outline-warning" onclick="window.abrirModalEditarEntrada(\'' + _entEsc(d.id) + '\')" title="Editar"><i class="bi bi-pencil"></i></button>' : '<button class="btn btn-xs" style="visibility:hidden"><i class="bi bi-pencil"></i></button>') +
                            (canDelete ? '<button class="btn btn-xs btn-outline-secondary" onclick="window.eliminarEntrada(\'' + _entEsc(d.id) + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>' : '<button class="btn btn-xs" style="visibility:hidden"><i class="bi bi-trash"></i></button>') +
                        '</div>'
                    : '') +
                '</td>';
            tbody.appendChild(tr);
        });
    });

    if (cardContainer) cardContainer.innerHTML = htmlCards;

    var paginEl = document.getElementById('ent-paginacion');
    if (paginEl) {
        if (totalPag <= 1) { paginEl.innerHTML = ''; return; }
        var btns = '';
        btns += '<button style="width:38px;height:38px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:' + (pag<=1?'0.35':'1') + ';" ' + (pag<=1?'disabled':'') + ' onclick="window._entIrPag(' + (pag-1) + ')"><i class="bi bi-chevron-left"></i></button>';
        btns += '<span style="font-size:.8rem;font-weight:700;color:var(--subtext);">Pág. <b style="color:var(--text)">' + pag + '</b> / ' + totalPag + '</span>';
        btns += '<button style="width:38px;height:38px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:' + (pag>=totalPag?'0.35':'1') + ';" ' + (pag>=totalPag?'disabled':'') + ' onclick="window._entIrPag(' + (pag+1) + ')"><i class="bi bi-chevron-right"></i></button>';
        paginEl.innerHTML = '<div style="display:flex;align-items:center;gap:.6rem;padding:.5rem .75rem .75rem;">' + btns + '</div>';
    }
};

window._entIrPag = function(n) { window._entPagActual = n; window._entRender(); };

// ── Panel detalle modal centrado / bottom sheet ────────────────────
window._entAbrirDetalle = function(id) {
    if (!id) return;
    window._entDetalleId = id;
    window._entRender();

    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) return;

    var bd = document.getElementById('ent-det-backdrop');
    if (bd) bd.classList.add('open');

    var titulo = document.getElementById('ent-detalle-titulo');
    if (titulo) titulo.textContent = 'Orden ' + id;

    var fecha = d.fecha ? String(d.fecha).split('T')[0] : '—';
    var tp = parseFloat(d.total_pen || 0);
    var monSim = d.moneda === 'USD' ? 'USD' : 'PEN';
    var items = d.items || [];
    var totalCant = items.reduce(function(acc, it){ return acc + (parseFloat(it.cantidad)||0); }, 0);

    var igvMode = d.tipo_igv || 'sin_igv';
    var igvLabel = igvMode === 'incluido' ? 'Incluido IGV' : igvMode === 'mas_igv' ? '+ IGV 18%' : 'Sin IGV';

    var html = `
    <!-- Card 1: Bento Card Cabecera & Info General -->
    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid #e2e8f0 !important;">
        <div class="d-flex align-items-center justify-content-between mb-2.5 pb-2 border-bottom">
            <div>
                <span class="text-muted text-uppercase fw-bold d-block" style="font-size: 0.65rem; letter-spacing: 0.5px;">Folio de Orden de Compra</span>
                <span class="fw-bolder text-primary" style="font-size: 1.15rem; letter-spacing: -0.02em;">${_entEsc(id)}</span>
            </div>
            <div>
                <span class="badge bg-primary text-white rounded-pill px-2.5 py-1" style="font-size: 0.75rem; font-weight: 800;">
                    ${_entEsc(d.tipo_orden || 'ORDEN DE COMPRA')}
                </span>
            </div>
        </div>

        <div class="row g-2">
            <div class="col-6 col-md-4">
                <div class="p-2 rounded-3" style="background: #f8fafc; border: 1px solid #f1f5f9;">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size: 0.62rem;">Proveedor</span>
                    <div class="d-flex align-items-center gap-1 mt-0.5">
                        <i class="bi bi-building text-primary" style="font-size: 0.75rem;"></i>
                        <span class="fw-bold text-dark text-truncate" style="font-size: 0.82rem;">${_entEsc(d.proveedor_nombre || '—')}</span>
                    </div>
                </div>
            </div>

            <div class="col-6 col-md-4">
                <div class="p-2 rounded-3" style="background: #f8fafc; border: 1px solid #f1f5f9;">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size: 0.62rem;">Placa Asignada</span>
                    <div class="d-flex align-items-center gap-1 mt-0.5">
                        <i class="bi bi-truck text-secondary" style="font-size: 0.75rem;"></i>
                        <span class="fw-bold text-dark text-truncate" style="font-size: 0.82rem;">${_entEsc(d.placa || '—')}</span>
                    </div>
                </div>
            </div>

            <div class="col-12 col-md-4">
                <div class="p-2 rounded-3" style="background: #f8fafc; border: 1px solid #f1f5f9;">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size: 0.62rem;">Fecha</span>
                    <div class="d-flex align-items-center gap-1 mt-0.5">
                        <i class="bi bi-calendar3 text-muted" style="font-size: 0.75rem;"></i>
                        <span class="fw-semibold text-dark" style="font-size: 0.8rem;">${fecha}</span>
                    </div>
                </div>
            </div>

            <div class="col-6">
                <div class="p-2 rounded-3" style="background: #f8fafc; border: 1px solid #f1f5f9;">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size: 0.62rem;">Nº Documento / Factura</span>
                    <div class="d-flex align-items-center gap-1 mt-0.5">
                        <i class="bi bi-receipt text-muted" style="font-size: 0.75rem;"></i>
                        <span class="fw-bold text-dark text-truncate" style="font-size: 0.82rem;">${_entEsc(d.documento_referencia || '—')}</span>
                    </div>
                </div>
            </div>

            <div class="col-6">
                <div class="p-2 rounded-3" style="background: #f8fafc; border: 1px solid #f1f5f9;">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size: 0.62rem;">Condición de Pago</span>
                    <div class="d-flex align-items-center gap-1 mt-0.5">
                        <i class="bi bi-credit-card text-muted" style="font-size: 0.75rem;"></i>
                        <span class="fw-bold text-dark text-truncate" style="font-size: 0.82rem;">${_entEsc(d.condicion_pago || 'Al contado')}</span>
                    </div>
                </div>
            </div>
        </div>
        
        ${d.observaciones ? `
        <div class="mt-2.5 p-2 rounded-3" style="background: #f1f5f9;">
            <span class="text-muted text-uppercase fw-bold d-block mb-1" style="font-size: 0.62rem;"><i class="bi bi-chat-left-text me-1"></i>Observaciones / Motivo</span>
            <div class="text-dark fw-medium" style="font-size: 0.8rem;">${_entEsc(d.observaciones)}</div>
        </div>
        ` : ''}
    </div>

    <!-- Card 2: Lista de Artículos Comprados -->
    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid #e2e8f0 !important;">
        <div class="d-flex align-items-center justify-content-between mb-2.5 pb-2 border-bottom">
            <div class="d-flex align-items-center gap-1.5 fw-bold text-dark" style="font-size: 0.82rem; text-transform: uppercase;">
                <i class="bi bi-box-seam-fill text-primary"></i> Artículos Registrados (${items.length})
            </div>
            <span class="badge bg-light text-secondary border rounded-pill px-2.5 py-1" style="font-size: 0.7rem; font-weight: 700;">
                ${totalCant.toLocaleString('es-PE', {maximumFractionDigits:3})} Unidades
            </span>
        </div>

        <div class="d-flex flex-column gap-2">
    `;

    if (items.length) {
        items.forEach(function(it) {
            var cant = parseFloat(it.cantidad || 0);
            var cu   = parseFloat(it.costo_unitario || 0);
            var imp  = parseFloat(it.importe || cant * cu || 0);
            var mon  = d.moneda === 'USD' ? '$' : 'S/';

            html += `
            <div class="p-2.5 rounded-3 d-flex align-items-center justify-content-between gap-2" style="background: #f8fafc; border: 1px solid #f1f5f9;">
                <div class="d-flex align-items-center gap-2.5" style="min-width: 0;">
                    <div class="d-flex align-items-center justify-content-center rounded-2 flex-shrink-0" style="width: 36px; height: 36px; background: #e0f2fe; color: #0284c7;">
                        <i class="bi bi-box-seam"></i>
                    </div>
                    <div style="min-width: 0;">
                        <div class="fw-bold text-dark text-truncate" style="font-size: 0.85rem;" title="${_entEsc(it.descripcion || it.inventario_id || '—')}">
                            ${_entEsc(it.descripcion || it.inventario_id || '—')}
                        </div>
                        <div class="text-secondary small d-flex align-items-center gap-1.5 flex-wrap" style="font-size: 0.72rem;">
                            ${it.inventario_id ? `<span class="badge bg-white text-muted border rounded-1 px-1.5 py-0.5" style="font-size:0.65rem;">${_entEsc(it.inventario_id)}</span>` : ''}
                            <span>${cant.toLocaleString('es-PE', {maximumFractionDigits:3})} u.</span>
                            <span class="text-muted">·</span>
                            <span>${mon} ${cu.toFixed(2)} c/u</span>
                        </div>
                    </div>
                </div>
                <div class="text-end flex-shrink-0">
                    <span class="text-muted text-uppercase fw-bold d-block" style="font-size: 0.62rem;">Subtotal</span>
                    <span class="fw-bolder text-dark" style="font-size: 0.88rem;">${mon} ${imp.toFixed(2)}</span>
                </div>
            </div>
            `;
        });
    } else {
        html += '<div class="text-center py-3 text-muted small">No hay ítems registrados en esta orden.</div>';
    }

    html += `
        </div>

        <!-- Total General -->
        <div class="d-flex align-items-center justify-content-between mt-3 pt-2.5 border-top">
            <span class="fw-bold text-dark" style="font-size: 0.9rem;">Monto Total:</span>
            <span class="fw-bolder text-success" style="font-size: 1.25rem;">S/ ${tp.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
    </div>
    `;

    var scroll = document.getElementById('ent-detalle-scroll');
    if (scroll) scroll.innerHTML = html;

    var footer = document.getElementById('ent-detalle-footer');
    if (footer) {
        footer.style.display = 'flex';
        var eId = _entEsc(id);

        var btnPdfPrincipal = `
            <button type="button" class="btn w-100 fw-bold d-flex align-items-center justify-content-center gap-2"
                    style="border-radius: 9999px; height: 50px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #fff; font-size: 0.95rem; border: none; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);"
                    onclick="window.generarComprobanteEntrada('${eId}')">
                <i class="bi bi-file-earmark-pdf-fill fs-6"></i> Descargar Documento PDF
            </button>
        `;

        var btnVer = `
            <button type="button" class="btn flex-fill fw-bold d-flex align-items-center justify-content-center gap-1.5"
                    style="border-radius: 9999px; height: 46px; background: #ffffff; color: #1e293b; border: 1.5px solid #e2e8f0; font-size: 0.88rem; box-shadow: 0 2px 6px rgba(0,0,0,0.03);"
                    onclick="window.previsualizarComprobanteEntrada('${eId}')">
                <i class="bi bi-eye-fill text-primary"></i> Vista Previa
            </button>
        `;

        var btnEliminar = `
            <button type="button" class="btn flex-fill fw-bold d-flex align-items-center justify-content-center gap-1.5"
                    style="border-radius: 9999px; height: 46px; background: #fef2f2; color: #dc2626; border: 1.5px solid #fecaca; font-size: 0.88rem;"
                    onclick="window.eliminarEntrada('${eId}')">
                <i class="bi bi-trash"></i> Eliminar
            </button>
        `;

        footer.innerHTML = `
            <div class="d-flex flex-column gap-2 w-100">
                ${btnPdfPrincipal}
                <div class="d-flex align-items-center gap-2 w-100">
                    ${btnVer}
                    ${btnEliminar}
                </div>
            </div>
        `;
    }

    var panel = document.getElementById('ent-panel-detalle');
    if (panel) panel.classList.add('open');
};

window._entCerrarDetalle = function() {
    var panel = document.getElementById('ent-panel-detalle');
    if (panel) panel.classList.remove('open');
    var bd = document.getElementById('ent-det-backdrop');
    if (bd) bd.classList.remove('open');
    window._entDetalleId = null;
    window._entRender();
};


function _entEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _entDescLimpia(desc, invId) {
    if (!desc) return '—';
    if (invId && desc.indexOf(invId + ' — ') === 0) return desc.slice(invId.length + 3);
    var match = desc.match(/^[A-Z0-9]+-\d+\s*—\s*(.*)/i);
    if (match) return match[1];
    return desc;
}

// ── Comprobante PDF ───────────────────────────────────────────────


window._entGenerarHtmlPDF = function(d) {
    var fecha = d.fecha ? String(d.fecha).split('T')[0] : '';
    
    var subtotalItems = 0;
    (d.items || []).forEach(function(it) {
        var cant = parseFloat(it.cantidad || 0);
        var cu   = parseFloat(it.costo_unitario || 0);
        subtotalItems += (cant * cu);
    });
    
    var totalReal = subtotalItems;
    if (d.tipo_igv === 'mas_igv') {
        totalReal = subtotalItems * 1.18;
    }
    
    if (totalReal === 0 && d.total_pen) {
        totalReal = parseFloat(d.total_pen);
        if (d.moneda === 'USD') {
            var tc = parseFloat(d.tipo_cambio || 3.4);
            if (tc > 0) totalReal = totalReal / tc;
        }
    }
    
    var monSimbolo = d.moneda === 'USD' ? 'USD' : 'PEN';
    var txtMoneda = monSimbolo === 'USD' ? 'DÓLARES' : 'SOLES';
    var txtMonedaS = monSimbolo === 'USD' ? 'US$' : 'S/';
    var totalText = totalReal.toLocaleString('es-PE', {minimumFractionDigits: 2, maximumFractionDigits: 2});

    var itemsHTML = (d.items || []).map(function(it, i) {
        var cant = parseFloat(it.cantidad || 0);
        var cu   = parseFloat(it.costo_unitario || 0);
        var imp  = parseFloat(it.importe || (cant * cu) || 0);
        var bg   = i % 2 === 0 ? '#ffffff' : '#f8fafc';
        var um   = it.unidad_medida || it.unidad || 'UND';
        var desc = it.descripcion || it.inventario_id || '';

        return '<tr style="background-color: ' + bg + ';">' +
            '<td style="padding:10px 12px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;width:55px;">' + cant.toLocaleString('es-PE', {maximumFractionDigits:3}) + '</td>' +
            '<td style="padding:10px 12px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:600;color:#475569;font-size:11px;width:65px;">' + um + '</td>' +
            '<td style="padding:10px 12px;text-transform:uppercase;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;">' + desc + '</td>' +
            '<td style="padding:10px 12px;text-align:right;border-bottom:1px solid #e2e8f0;color:#334155;width:95px;">' + cu.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:4}) + '</td>' +
            '<td style="padding:10px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;width:115px;">' + imp.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>' +
        '</tr>';
    }).join('');

    var condPagoText = (d.condicion_pago || 'AL CONTADO').toUpperCase();
    if (d.condicion_pago && d.condicion_pago.toLowerCase() === 'a crédito') {
        condPagoText = 'CRÉDITO' + (d.dias_credito ? ' / ' + d.dias_credito + ' DÍAS' : '');
    }

    var numDisplay = (d.id || '').replace(/^ENT-/, '');
    var tipoDocTitle = (d.tipo_orden || 'ORDEN DE COMPRA').toUpperCase();

    var obsBlock = '';
    if (d.observaciones && d.observaciones.trim() !== '') {
        obsBlock = '<!-- OBSERVACIONES -->' +
        '<div style="background:#fffbeb;border:1px solid #fef3c7;border-left:4px solid #f59e0b;border-radius:6px;padding:10px 14px;font-size:11px;color:#92400e;margin-bottom:20px;">' +
            '<b style="display:block;margin-bottom:3px;font-size:10.5px;text-transform:uppercase;letter-spacing:0.5px;color:#b45309;">Observaciones / Especificaciones:</b>' +
            d.observaciones +
        '</div>';
    }

    // Datos de la Empresa emisora
    var empLogo = localStorage.getItem('fleet_empresa_logo') || localStorage.getItem('empresa_logo') || window._LOGO_BASE64 || '';
    var empNombre = (localStorage.getItem('fleet_empresa_nombre') || localStorage.getItem('empresa_nombre') || window._EMPRESA_NOMBRE || 'ROSYMAR PERU S.A.C.').toUpperCase();
    var empRuc = localStorage.getItem('fleet_empresa_ruc') || localStorage.getItem('empresa_ruc') || window._EMPRESA_RUC || '';
    var empDireccion = (localStorage.getItem('fleet_empresa_direccion') || localStorage.getItem('empresa_direccion') || '').toUpperCase();
    var empTelefono = localStorage.getItem('fleet_empresa_telefono') || localStorage.getItem('empresa_telefono') || '';
    var empCorreo = localStorage.getItem('fleet_empresa_correo') || localStorage.getItem('empresa_correo') || '';

    // Header Left: Logo + Info Empresa
    var headerLeftHtml = '<div style="display:flex;flex-direction:column;gap:3px;max-width:440px;">';
    if (empLogo) {
        headerLeftHtml += '<img src="' + empLogo + '" style="max-height:52px;max-width:180px;object-fit:contain;margin-bottom:4px;display:block;" alt="Logo Empresa" />';
    }
    headerLeftHtml += '<div style="font-size:16px;font-weight:900;color:#0f172a;letter-spacing:-0.3px;line-height:1.2;text-transform:uppercase;">' + empNombre + '</div>';
    if (empDireccion) {
        headerLeftHtml += '<div style="font-size:9.5px;color:#475569;line-height:1.35;text-transform:uppercase;">' + empDireccion + '</div>';
    }
    if (empTelefono) {
        headerLeftHtml += '<div style="font-size:9.5px;color:#475569;">' + empTelefono + '</div>';
    }
    if (empCorreo) {
        headerLeftHtml += '<div style="font-size:9.5px;color:#475569;">' + empCorreo + '</div>';
    }
    headerLeftHtml += '</div>';

    // Header Right: Tarjeta Recuadro RUC + Tipo Documento + Correlativo
    var headerRightHtml = '<div style="min-width:210px;max-width:260px;background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:12px;padding:12px 18px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.02);">' +
        (empRuc ? '<div style="font-size:12px;font-weight:700;color:#0284c7;letter-spacing:0.5px;margin-bottom:3px;">RUC: ' + empRuc + '</div>' : '') +
        '<div style="font-size:15px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">' + tipoDocTitle + '</div>' +
        '<div style="font-size:14px;font-weight:800;color:#2563eb;letter-spacing:0.5px;">N° ' + numDisplay + '</div>' +
    '</div>';

    // Formatear Fecha y Proveedor
    var fechaFmt = fecha ? fecha.split('-').reverse().join('/') : '';
    var provNombre = (d.proveedor_nombre || '').toUpperCase();
    var provRuc = d.proveedor_ruc ? (' (' + d.proveedor_ruc + ')') : '';

    var solicitante = d.solicitante || d.autoriza || '';
    var placaVehiculo = d.placa || '';
    var motivoEntrada = d.motivo_entrada || '';

    return '' +
    '<div style="font-family:\'Plus Jakarta Sans\', \'Inter\', Arial, sans-serif;width:100%;margin:0 auto;padding:35px 40px;color:#0f172a;box-sizing:border-box;">' +

        '<!-- HEADER -->' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:18px;margin-bottom:24px;">' +
            headerLeftHtml +
            headerRightHtml +
        '</div>' +

        '<!-- RESUMEN FECHA Y PROVEEDOR -->' +
        '<div style="display:flex;gap:15px;margin-bottom:22px;">' +
            '<div style="flex:0 0 30%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">' +
                '<div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px;margin-bottom:4px;">Fecha de Emisión</div>' +
                '<div style="font-size:14px;font-weight:800;color:#0f172a;">' + (fechaFmt || '') + '</div>' +
            '</div>' +
            '<div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">' +
                '<div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px;margin-bottom:4px;">Proveedor</div>' +
                '<div style="font-size:14px;font-weight:800;color:#0f172a;text-transform:uppercase;">' + provNombre + '<span style="font-weight:600;color:#475569;font-size:12px;">' + provRuc + '</span></div>' +
            '</div>' +
        '</div>' +

        '<!-- DETALLES DE LA ORDEN -->' +
        '<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;overflow:hidden;">' +
            '<div style="background:#f1f5f9;padding:9px 15px;font-size:11px;font-weight:800;color:#334155;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:0.5px;">' +
                'Detalles de la Orden' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;padding:14px 15px;font-size:12px;">' +
                '<div style="width:50%;margin-bottom:12px;">' +
                    '<span style="font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;">Tipo de Orden</span>' +
                    '<span style="font-weight:700;color:#0f172a;text-transform:uppercase;">' + (d.tipo_orden || 'ORDEN DE COMPRA') + '</span>' +
                '</div>' +
                '<div style="width:50%;margin-bottom:12px;">' +
                    '<span style="font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;">Condición de Pago</span>' +
                    '<span style="font-weight:700;color:#0f172a;text-transform:uppercase;">' + condPagoText + '</span>' +
                '</div>' +
                '<div style="width:50%;margin-bottom:12px;">' +
                    '<span style="font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;">Moneda</span>' +
                    '<span style="font-weight:700;color:#0f172a;text-transform:uppercase;">' + txtMoneda + (d.moneda === "USD" ? " (T/C: " + parseFloat(d.tipo_cambio||3.4).toFixed(3) + ")" : "") + '</span>' +
                '</div>' +
                '<div style="width:50%;margin-bottom:12px;">' +
                    '<span style="font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;">Placa / Vehículo</span>' +
                    '<span style="font-weight:700;color:#0f172a;text-transform:uppercase;">' + (placaVehiculo || '') + '</span>' +
                '</div>' +
                (solicitante ? '<div style="width:50%;margin-bottom:12px;"><span style="font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;">Solicitante</span><span style="font-weight:700;color:#0f172a;text-transform:uppercase;">' + solicitante + '</span></div>' : '') +
                (d.centro_costo ? '<div style="width:50%;margin-bottom:12px;"><span style="font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;">Centro de Costo</span><span style="font-weight:700;color:#0f172a;text-transform:uppercase;">' + d.centro_costo + '</span></div>' : '') +
                '<div style="width:100%;margin-top:2px;">' +
                    '<span style="font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;">Motivo</span>' +
                    '<span style="font-weight:700;color:#0f172a;text-transform:uppercase;">' + (motivoEntrada || '') + '</span>' +
                '</div>' +
            '</div>' +
        '</div>' +

        obsBlock +

        '<!-- TABLA DE ARTÍCULOS -->' +
        '<div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">' +
            '<table style="width:100%;font-size:12px;border-collapse:collapse;">' +
                '<thead>' +
                    '<tr style="background:#0f172a;color:#ffffff;">' +
                        '<th style="padding:11px 12px;text-align:center;width:55px;font-weight:700;letter-spacing:0.5px;">CANT</th>' +
                        '<th style="padding:11px 12px;text-align:center;width:65px;font-weight:700;letter-spacing:0.5px;">U.M.</th>' +
                        '<th style="padding:11px 12px;text-align:left;font-weight:700;letter-spacing:0.5px;">DESCRIPCIÓN</th>' +
                        '<th style="padding:11px 12px;text-align:right;width:95px;font-weight:700;letter-spacing:0.5px;">P. UNIT</th>' +
                        '<th style="padding:11px 12px;text-align:right;width:115px;font-weight:700;letter-spacing:0.5px;">IMPORTE</th>' +
                    '</tr>' +
                '</thead>' +
                '<tbody>' +
                    itemsHTML +
                '</tbody>' +
            '</table>' +
            '<div style="background:#f8fafc;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-top:2px solid #e2e8f0;">' +
                '<div style="font-size:11.5px;color:#64748b;max-width:380px;">' +
                    '<b style="color:#334155;">SON:</b> ' + numeroALetras(totalReal) + ' ' + txtMoneda +
                '</div>' +
                '<div style="font-size:18px;color:#0f172a;">' +
                    '<span style="font-weight:700;font-size:13px;color:#64748b;margin-right:12px;text-transform:uppercase;">Total General</span>' +
                    '<b>' + txtMonedaS + ' ' + totalText + '</b>' +
                '</div>' +
            '</div>' +
        '</div>' +

    '</div>';
};

window.generarComprobanteEntrada = async function(id) {
    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) { alert('No se encontró la entrada ' + id); return; }

    // Sincronizar datos de empresa si no están en localStorage
    try {
        if (!localStorage.getItem('fleet_empresa_ruc') || !localStorage.getItem('fleet_empresa_direccion')) {
            const r = await fetch('/api/configuracion');
            if (r.ok) {
                const cfg = await r.json();
                if (cfg.empresa_ruc) localStorage.setItem('fleet_empresa_ruc', cfg.empresa_ruc);
                if (cfg.empresa_nombre) localStorage.setItem('fleet_empresa_nombre', cfg.empresa_nombre);
                if (cfg.empresa_direccion) localStorage.setItem('fleet_empresa_direccion', cfg.empresa_direccion);
                if (cfg.empresa_telefono) localStorage.setItem('fleet_empresa_telefono', cfg.empresa_telefono);
                if (cfg.empresa_correo) localStorage.setItem('fleet_empresa_correo', cfg.empresa_correo);
                if (cfg.empresa_logo) localStorage.setItem('fleet_empresa_logo', cfg.empresa_logo);
            }
        }
    } catch(e) {}

    var htmlContent = window._entGenerarHtmlPDF(d);
    
    var htmlCompleto = '<!DOCTYPE html><html><head><title>Orden de Compra ' + d.id + '</title>' +
        '<link rel="preconnect" href="https://fonts.googleapis.com">' +
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
        '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">' +
        '<style>' +
        'body { background-color: #cbd5e1; margin: 0; padding: 30px 20px; font-family: "Plus Jakarta Sans", "Inter", Arial, sans-serif; }' +
        '#btnPrint { position: fixed; top: 20px; right: 20px; background-color: #0f172a; color: #fff; border: none; padding: 12px 24px; border-radius: 50px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.25); z-index: 1000; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }' +
        '#btnPrint:hover { background-color: #1e293b; transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.35); }' +
        '.page-container { background: #fff; padding: 0; box-shadow: 0 10px 30px rgba(0,0,0,0.12); margin: 0 auto; width: 210mm; min-height: 297mm; box-sizing: border-box; border-radius: 4px; }' +
        '@media print { ' +
        '  @page { size: A4 portrait; margin: 0; }' +
        '  body { background: none; padding: 0; margin: 0; }' +
        '  #btnPrint { display: none; }' +
        '  .page-container { box-shadow: none; width: 100%; height: auto; margin: 0; border-radius: 0; }' +
        '}' +
        '</style>' +
        '</head><body>' +
        '<button id="btnPrint" onclick="window.print()"><svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5 1a2 2 0 0 0-2 2v1h10V3a2 2 0 0 0-2-2H5zm6 8H5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1z"/><path d="M0 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v-2a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2H2a2 2 0 0 1-2-2V7zm2.5 1a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/></svg> Imprimir / Guardar PDF</button>' +
        '<div class="page-container">' + htmlContent + '</div>' +
        '</body></html>';

    var win = window.open('', '_blank');
    if (win) {
        win.document.open();
        win.document.write(htmlCompleto);
        win.document.close();
    } else {
        alert("Por favor habilite las ventanas emergentes (pop-ups) para ver el PDF.");
    }
};

window.abrirModalSubirArchivos = function(id) {
    var entrada = (window._entData || []).find(function(e) { return e.id === id; });
    if (!entrada) return alert('No se encontró la entrada ' + id);

    var ocIdInput = document.getElementById('subir-archivos-oc-id');
    if (ocIdInput) ocIdInput.value = entrada.id;

    var ocCodInput = document.getElementById('subir-archivos-oc-codigo');
    if (ocCodInput) ocCodInput.value = entrada.id;

    var ocProvInput = document.getElementById('subir-archivos-oc-proveedor');
    if (ocProvInput) ocProvInput.value = entrada.proveedor_nombre || 'Sin Proveedor';

    // Helper para renderizar archivo existente con botón de eliminar X
    var renderizarArchivoExistente = function(containerId, url, presignedUrl, label, tipo, colorClass, iconClass) {
        var el = document.getElementById(containerId);
        if (!el) return;
        var fileUrl = presignedUrl || url;
        if (fileUrl) {
            el.innerHTML = '<div class="d-flex align-items-center justify-content-between p-1.5 px-2 rounded-2 bg-light border" style="font-size:0.75rem;">' +
                '<a href="' + fileUrl + '" target="_blank" class="' + colorClass + ' fw-bold text-decoration-none text-truncate" title="Ver ' + label + '">' +
                    '<i class="bi ' + iconClass + ' me-1"></i> Ver ' + label + ' Actual' +
                '</a>' +
                '<button type="button" class="btn btn-sm btn-outline-danger p-0 ms-1 d-flex align-items-center justify-content-center rounded-circle flex-shrink-0" style="width:20px;height:20px;font-size:0.65rem;" onclick="window.eliminarArchivoOCModal(\'' + _entEsc(entrada.id) + '\', \'' + tipo + '\')" title="Eliminar ' + label + '">' +
                    '<i class="bi bi-x-lg"></i>' +
                '</button>' +
            '</div>';
        } else {
            el.innerHTML = '<span class="text-muted fst-italic" style="font-size:0.75rem;">Sin archivo adjunto</span>';
        }
    };

    // Cotización
    renderizarArchivoExistente('subir-existente-cotizacion', entrada.url_cotizacion, entrada.url_cotizacion_presigned, 'Cotización', 'cotizacion', 'text-primary', 'bi-file-earmark-text');
    var fCot = document.getElementById('subir-file-cotizacion');
    if (fCot) fCot.value = '';

    // Factura
    renderizarArchivoExistente('subir-existente-factura', entrada.url_factura, entrada.url_factura_presigned, 'Factura', 'factura', 'text-success', 'bi-file-earmark-check');
    var fFac = document.getElementById('subir-file-factura');
    if (fFac) fFac.value = '';
    var fNumFact = document.getElementById('subir-factura-numero');
    if (fNumFact) fNumFact.value = entrada.documento_referencia || '';

    var modalEl = document.getElementById('modalSubirArchivosOC');
    if (modalEl) {
        var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
};

window.eliminarArchivoOCModal = async function(id, tipo) {
    var nombres = { cotizacion: 'la Cotización', factura: 'la Factura' };
    var nom = nombres[tipo] || 'el archivo';
    if (!confirm('¿Está seguro de eliminar ' + nom + ' de esta Orden de Compra?')) return;

    try {
        var r = await fetch('/api/almacen/entradas/' + encodeURIComponent(id) + '/archivo/' + tipo, {
            method: 'DELETE'
        });
        if (!r.ok) {
            var txt = await r.text();
            throw new Error(txt);
        }
        
        // Actualizar dataset local
        var entrada = (window._entData || []).find(function(e) { return e.id === id; });
        if (entrada) {
            entrada['url_' + tipo] = null;
            entrada['url_' + tipo + '_presigned'] = null;
            if (tipo === 'factura') {
                entrada.documento_referencia = null;
                entrada.estado_factura = 'Factura Pendiente';
            }
        }

        alert('🗑️ Se eliminó ' + nom + ' correctamente.');
        window.abrirModalSubirArchivos(id);
        window.cargarEntradas();
    } catch(e) {
        alert('Error al eliminar archivo: ' + e.message);
    }
};

window.guardarArchivosOCModal = async function() {
    var id = (document.getElementById('subir-archivos-oc-id') || {}).value;
    if (!id) return alert('No se ha seleccionado una Orden de Compra.');

    var fCot = document.getElementById('subir-file-cotizacion') ? document.getElementById('subir-file-cotizacion').files[0] : null;
    var fFac = document.getElementById('subir-file-factura') ? document.getElementById('subir-file-factura').files[0] : null;
    var numFactura = (document.getElementById('subir-factura-numero') ? document.getElementById('subir-factura-numero').value : '').trim();

    if (!fCot && !fFac) {
        alert('Por favor seleccione al menos un archivo (Cotización o Factura) para subir.');
        return;
    }

    if (fFac && !numFactura) {
        alert('⚠️ El N° de Comprobante / Factura (Ej: F001-0004523) es OBLIGATORIO al adjuntar la Factura.');
        var fInp = document.getElementById('subir-factura-numero');
        if (fInp) fInp.focus();
        return;
    }

    var btn = document.getElementById('btn-guardar-archivos-modal');
    var origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
    }

    try {
        var lista = [];
        if (fCot) lista.push({ file: fCot, tipo: 'cotizacion' });
        if (fFac) lista.push({ file: fFac, tipo: 'factura', documento_referencia: numFactura });

        await window._entSubirArchivosDirectoS3(id, lista);

        var modalEl = document.getElementById('modalSubirArchivosOC');
        if (modalEl) {
            bootstrap.Modal.getInstance(modalEl)?.hide();
        }

        alert('✅ Archivos adjuntados exitosamente a la Orden ' + id);
        window.cargarEntradas();
    } catch(e) {
        alert('Error al subir archivos: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
};

window._liveStepTimer = null;
window._liveCurrentStep = 1;
window._liveStepIsPlaying = false;
window._liveStepsData = [];

window.setLiveStepOC = function(stepNum) {
    if (!window._liveStepsData || !window._liveStepsData.length) return;
    stepNum = Math.max(1, Math.min(4, stepNum));
    window._liveCurrentStep = stepNum;

    var stepBadge = document.getElementById('det-oc-live-step-badge');
    if (stepBadge) stepBadge.innerText = 'Paso ' + stepNum + ' de 4';

    // Update the 4 progress indicators
    for (var i = 1; i <= 4; i++) {
        var progEl = document.getElementById('det-oc-prog-step-' + i);
        if (progEl) {
            if (i < stepNum) {
                progEl.style.background = '#10b981'; // Completed
                progEl.style.opacity = '1';
            } else if (i === stepNum) {
                progEl.style.background = '#0284c7'; // Active
                progEl.style.opacity = '1';
            } else {
                progEl.style.background = '#e2e8f0'; // Inactive
                progEl.style.opacity = '0.7';
            }
        }
    }

    var data = window._liveStepsData[stepNum - 1];
    if (!data) return;

    var iconBox = document.getElementById('det-oc-live-icon-box');
    var titleEl = document.getElementById('det-oc-live-title');
    var subtitleEl = document.getElementById('det-oc-live-subtitle');
    var statusBadgeEl = document.getElementById('det-oc-live-status-badge');
    var descEl = document.getElementById('det-oc-live-desc');
    var userEl = document.getElementById('det-oc-live-user');
    var dateEl = document.getElementById('det-oc-live-date');

    if (iconBox) {
        iconBox.innerHTML = data.iconHtml;
        iconBox.style.background = data.iconBg || '#0284c7';
    }
    if (titleEl) titleEl.innerText = data.title;
    if (subtitleEl) subtitleEl.innerText = data.subtitle;
    if (statusBadgeEl) {
        statusBadgeEl.className = 'badge rounded-pill fw-bold px-2.5 py-1 ' + (data.badgeClass || 'bg-primary-subtle text-primary border border-primary-subtle');
        statusBadgeEl.innerText = data.badgeText;
    }
    if (descEl) descEl.innerText = data.desc;
    if (userEl) userEl.innerHTML = '<i class="bi bi-person me-1"></i> ' + _entEsc(data.user);
    if (dateEl) dateEl.innerText = data.date || '—';
};

window.navLiveStepOC = function(delta) {
    window.pauseAutoplayOC();
    var next = window._liveCurrentStep + delta;
    if (next < 1) next = 4;
    if (next > 4) next = 1;
    window.setLiveStepOC(next);
};

window.pauseAutoplayOC = function() {
    if (window._liveStepTimer) {
        clearInterval(window._liveStepTimer);
        window._liveStepTimer = null;
    }
    window._liveStepIsPlaying = false;
    var btn = document.getElementById('det-oc-btn-autoplay');
    var icon = document.getElementById('det-oc-icon-autoplay');
    var txt = document.getElementById('det-oc-txt-autoplay');
    if (btn) btn.className = 'btn btn-sm btn-light border rounded-pill px-2.5 py-1 text-muted fw-bold d-flex align-items-center gap-1 shadow-2xs';
    if (icon) icon.className = 'bi bi-play-fill';
    if (txt) txt.innerText = 'Pausado';
};

window.startAutoplayOC = function() {
    window.pauseAutoplayOC();
    window._liveStepIsPlaying = true;
    var btn = document.getElementById('det-oc-btn-autoplay');
    var icon = document.getElementById('det-oc-icon-autoplay');
    var txt = document.getElementById('det-oc-txt-autoplay');
    if (btn) btn.className = 'btn btn-sm btn-light border rounded-pill px-2.5 py-1 text-secondary fw-bold d-flex align-items-center gap-1 shadow-2xs';
    if (icon) icon.className = 'bi bi-pause-fill';
    if (txt) txt.innerText = 'Auto';

    window._liveStepTimer = setInterval(function() {
        var next = window._liveCurrentStep + 1;
        if (next > 4) next = 1;
        window.setLiveStepOC(next);
    }, 4500);
};

window.toggleAutoplayOC = function() {
    if (window._liveStepIsPlaying) {
        window.pauseAutoplayOC();
    } else {
        window.startAutoplayOC();
    }
};

window.abrirModalDetalleOC = function(id) {
    var d = (window._entData || []).find(function(e) { return e.id === id; });
    if (!d) return alert('No se encontró la orden de compra ' + id);

    window._ocSeleccionadaDetalle = d.id;

    var codLimpio = String(d.id || '').replace(/^ENT-/i, '');
    var titEl = document.getElementById('det-oc-titulo-num');
    if (titEl) titEl.innerText = codLimpio;

    // Items y cálculos
    var items = d.items || [];
    var totalCalc = 0;
    var totalItemsOC = 0;
    var totalRenglones = items.length;
    var sym = d.moneda === 'USD' ? '$ ' : 'S/ ';

    items.forEach(function(it) {
        var cant = parseFloat(it.cantidad || 0);
        var cu = parseFloat(it.costo_unitario || 0);
        totalItemsOC += cant;
        totalCalc += (cant * cu);
    });

    var totalRecibido = parseFloat(d.total_recibido || 0);
    var receptionPct = (totalItemsOC > 0) ? Math.min(100, Math.round((totalRecibido / totalItemsOC) * 100)) : 0;
    var totalReal = (d.total_pen != null && parseFloat(d.total_pen) > 0) ? parseFloat(d.total_pen) : totalCalc;

    // Normalización de Estados
    var estNorm = (d.estado || 'REGISTRADA').toUpperCase().trim();
    var isAnulado = estNorm.includes('ANULAD') || estNorm.includes('RECHAZAD');
    var isObservado = estNorm.includes('OBSERVAD');
    var isAprobado = estNorm === 'APROBADO' || estNorm === 'APROBADA' || estNorm === 'AUTORIZADO' || estNorm === 'AUTORIZADA';
    var isProcesado = estNorm === 'PROCESADO' || estNorm === 'PROCESADA' || estNorm === 'PAGADO' || estNorm === 'PAGADA';
    var isRecepcionadoCompleto = isProcesado && totalItemsOC > 0 && totalRecibido >= totalItemsOC;
    var isRecepcionadoParcial = isProcesado && totalRecibido > 0 && totalRecibido < totalItemsOC;
    var isAprobadoReal = isAprobado || isProcesado || isRecepcionadoCompleto;

    // 1. Banner de Estado y Recepción
    var badgeEstado = document.getElementById('det-oc-badge-estado');
    var descEstado = document.getElementById('det-oc-desc-estado');
    if (isAnulado) {
        if (badgeEstado) {
            badgeEstado.style.cssText = 'background: #fee2e2 !important; color: #dc2626 !important; border: 1px solid #fca5a5 !important; font-size: 0.75rem; padding: 6px 12px;';
            badgeEstado.innerHTML = '<i class="bi bi-x-circle me-1"></i> ANULADA';
        }
        if (descEstado) descEstado.innerText = 'Orden de compra anulada o rechazada.';
    } else if (isObservado) {
        if (badgeEstado) {
            badgeEstado.style.cssText = 'background: #fef3c7 !important; color: #d97706 !important; border: 1px solid #fcd34d !important; font-size: 0.75rem; padding: 6px 12px;';
            badgeEstado.innerHTML = '<i class="bi bi-exclamation-triangle me-1"></i> OBSERVADA';
        }
        if (descEstado) descEstado.innerText = 'Requiere subsanación o visto bueno directivo.';
    } else if (isRecepcionadoCompleto) {
        if (badgeEstado) {
            badgeEstado.style.cssText = 'background: #dcfce7 !important; color: #15803d !important; border: 1px solid #86efac !important; font-size: 0.75rem; padding: 6px 12px;';
            badgeEstado.innerHTML = '<i class="bi bi-box-seam me-1"></i> RECEPCIONADA 100%';
        }
        if (descEstado) descEstado.innerText = 'Mercadería recepcionada en su totalidad en almacén central.';
    } else if (isRecepcionadoParcial) {
        if (badgeEstado) {
            badgeEstado.style.cssText = 'background: #e0f2fe !important; color: #0369a1 !important; border: 1px solid #7dd3fc !important; font-size: 0.75rem; padding: 6px 12px;';
            badgeEstado.innerHTML = '<i class="bi bi-boxes me-1"></i> RECEPCIÓN PARCIAL (' + receptionPct + '%)';
        }
        if (descEstado) descEstado.innerText = 'Recepción física en curso: ' + totalRecibido + ' de ' + totalItemsOC + ' unidades recibidas.';
    } else if (isProcesado) {
        if (badgeEstado) {
            badgeEstado.style.cssText = 'background: #e0f2fe !important; color: #0284c7 !important; border: 1px solid #38bdf8 !important; font-size: 0.75rem; padding: 6px 12px;';
            badgeEstado.innerHTML = '<i class="bi bi-credit-card me-1"></i> PROCESADA';
        }
        if (descEstado) descEstado.innerText = 'Pago registrado por Tesorería · En camino a almacén.';
    } else if (isAprobado) {
        if (badgeEstado) {
            badgeEstado.style.cssText = 'background: #dcfce7 !important; color: #15803d !important; border: 1px solid #86efac !important; font-size: 0.75rem; padding: 6px 12px;';
            badgeEstado.innerHTML = '<i class="bi bi-shield-check me-1"></i> APROBADA';
        }
        if (descEstado) descEstado.innerText = 'V°B° presupuestario concedido por Gerencia.';
    } else {
        if (badgeEstado) {
            badgeEstado.style.cssText = 'background: #f1f5f9 !important; color: #475569 !important; border: 1px solid #cbd5e1 !important; font-size: 0.75rem; padding: 6px 12px;';
            badgeEstado.innerHTML = '<i class="bi bi-clock me-1"></i> REGISTRADA';
        }
        if (descEstado) descEstado.innerText = 'En espera de visto bueno presupuestario por Gerencia.';
    }

    // 2. Stepper de Trazabilidad (4 Nodos)
    var fechaFmt = _entFmtFechaHora(d.fecha, d.created_at);
    var dateEl1 = document.getElementById('det-oc-step-date-1');
    if (dateEl1) dateEl1.innerText = fechaFmt;

    var aprobadorTxt = isAprobadoReal ? (d.aprobador_nombre || d.aprobado_por || 'Gerencia') : '—';
    var userEl2 = document.getElementById('det-oc-step-user-2');
    if (userEl2) userEl2.innerText = aprobadorTxt;

    var node2 = document.getElementById('det-oc-step-node-2');
    if (node2) node2.style.background = isAprobadoReal ? '#10b981' : '#cbd5e1';

    var statusEl3 = document.getElementById('det-oc-step-status-3');
    if (statusEl3) statusEl3.innerText = (isProcesado || isRecepcionadoCompleto) ? 'Pago Registrado' : 'Por Liquidar';
    var node3 = document.getElementById('det-oc-step-node-3');
    if (node3) node3.style.background = (isProcesado || isRecepcionadoCompleto) ? '#10b981' : '#cbd5e1';

    var recepEl4 = document.getElementById('det-oc-step-reception-4');
    if (recepEl4) recepEl4.innerText = isRecepcionadoCompleto ? '100% Recepcionado' : (isRecepcionadoParcial ? (receptionPct + '% Recepcionado') : '0% Recepcionado');
    var node4 = document.getElementById('det-oc-step-node-4');
    if (node4) node4.style.background = isRecepcionadoCompleto ? '#10b981' : (isRecepcionadoParcial ? '#0284c7' : '#cbd5e1');

    var stepLine = document.getElementById('det-oc-stepper-line');
    if (stepLine) {
        var lineWidth = isRecepcionadoCompleto ? '100%' : (isProcesado ? '66%' : (isAprobadoReal ? '33%' : '0%'));
        stepLine.style.width = lineWidth;
    }

    var progResumen = document.getElementById('det-oc-prog-resumen');
    if (progResumen) progResumen.innerText = totalRecibido + ' de ' + totalItemsOC + ' unidades recepcionadas (' + totalRenglones + ' ' + (totalRenglones === 1 ? 'renglón' : 'renglones') + ')';

    var progPct = document.getElementById('det-oc-prog-pct');
    if (progPct) progPct.innerText = receptionPct + '%';

    var progFill = document.getElementById('det-oc-prog-fill');
    if (progFill) {
        progFill.style.width = receptionPct + '%';
        progFill.style.background = receptionPct === 100 ? '#10b981' : '#0284c7';
    }

    // 3. Cuatro Bento Cards de Información
    var cardSolicitante = document.getElementById('det-oc-card-solicitante');
    if (cardSolicitante) cardSolicitante.innerText = d.solicitante || d.autoriza || '—';

    var cardCreador = document.getElementById('det-oc-card-creador');
    if (cardCreador) cardCreador.innerText = (d.creador_nombre || d.creado_por || 'DANIEL').toUpperCase();

    var cardFecha = document.getElementById('det-oc-card-fecha');
    if (cardFecha) cardFecha.innerText = fechaFmt;

    var cardDestino = document.getElementById('det-oc-card-destino');
    if (cardDestino) cardDestino.innerText = d.placa ? ('UNIDAD ' + d.placa) : (d.centro_costo || 'SEDE PRINCIPAL / ALMACÉN').toUpperCase();

    var cardProveedor = document.getElementById('det-oc-card-proveedor');
    if (cardProveedor) {
        var provText = d.proveedor_nombre || 'PROVEEDOR GENERAL';
        if (d.proveedor_ruc) provText += ' (' + d.proveedor_ruc + ')';
        cardProveedor.innerText = provText;
        cardProveedor.title = provText;
    }

    var cardMotivo = document.getElementById('det-oc-card-motivo');
    if (cardMotivo) cardMotivo.innerText = (d.motivo_entrada || 'STOCK - COMPRA DE CONSUMIBLES').toUpperCase();

    var pagoTxt = (d.moneda === 'USD' ? 'DÓLARES (USD)' : 'SOLES (PEN)') + ' • ' + (d.condicion_pago || 'AL CONTADO').toUpperCase();
    if (d.dias_credito && (pagoTxt.includes('CRÉDITO') || pagoTxt.includes('CREDITO'))) {
        pagoTxt += ' (' + d.dias_credito + ' DÍAS)';
    }
    var cardPago = document.getElementById('det-oc-card-pago');
    if (cardPago) cardPago.innerText = pagoTxt;

    var pillsDocs = document.getElementById('det-oc-card-pills-docs');
    if (pillsDocs) {
        var cotUrl = d.url_cotizacion_presigned || d.url_cotizacion;
        var facUrl = d.url_factura_presigned || d.url_factura;
        var vouUrl = d.url_voucher_presigned || d.url_voucher;

        var pillCot = cotUrl 
            ? '<a href="' + _entEsc(cotUrl) + '" target="_blank" class="badge rounded-pill fw-bold text-decoration-none" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-size:0.70rem;"><i class="bi bi-file-earmark-check me-1"></i> Cotización</a>'
            : '<span class="badge rounded-pill text-muted bg-light border fw-normal" style="font-size:0.70rem;">Sin cotización</span>';

        var pillFac = facUrl 
            ? '<a href="' + _entEsc(facUrl) + '" target="_blank" class="badge rounded-pill fw-bold text-decoration-none" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-size:0.70rem;"><i class="bi bi-file-earmark-check me-1"></i> Factura</a>'
            : '<span class="badge rounded-pill text-muted bg-light border fw-normal" style="font-size:0.70rem;">Sin factura</span>';

        var pillVou = vouUrl 
            ? '<a href="' + _entEsc(vouUrl) + '" target="_blank" class="badge rounded-pill fw-bold text-decoration-none" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; font-size:0.70rem;"><i class="bi bi-file-earmark-check me-1"></i> Voucher</a>'
            : '<span class="badge rounded-pill text-muted bg-light border fw-normal" style="font-size:0.70rem;">Sin voucher</span>';

        pillsDocs.innerHTML = pillCot + ' ' + pillFac + ' ' + pillVou;
    }

    // 4. Tabla de Artículos Requeridos
    var tblRenglonesBadge = document.getElementById('det-oc-table-renglones-badge');
    if (tblRenglonesBadge) tblRenglonesBadge.innerText = totalRenglones + ' ' + (totalRenglones === 1 ? 'Renglón' : 'Renglones') + ' (' + totalItemsOC + ' unids)';

    var tbodyEl = document.getElementById('det-oc-table-tbody');
    if (tbodyEl) {
        if (!items.length) {
            tbodyEl.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">No hay artículos en esta orden.</td></tr>';
        } else {
            tbodyEl.innerHTML = items.map(function(it, idx) {
                var cant = parseFloat(it.cantidad || 0);
                var cu = parseFloat(it.costo_unitario || 0);
                var imp = cant * cu;
                var nombre = _entDescLimpia(it.descripcion, it.inventario_id);
                var invId = it.inventario_id || ('ART-' + (idx + 1));
                var um = (it.unidad_medida || it.unidad || 'UND').toUpperCase();

                return '<tr>' +
                    '<td class="ps-3 text-muted fw-bold">' + (idx + 1) + '</td>' +
                    '<td><span class="badge bg-light text-dark border font-monospace fw-bold" style="font-size:0.75rem;">' + _entEsc(invId) + '</span></td>' +
                    '<td class="fw-bold text-dark">' + _entEsc(nombre) + '</td>' +
                    '<td class="text-center"><span class="badge bg-light text-secondary border font-monospace" style="font-size:0.70rem;">' + _entEsc(um) + '</span></td>' +
                    '<td class="text-center fw-bold font-monospace">' + cant.toLocaleString('es-PE') + '</td>' +
                    '<td class="text-end font-monospace text-secondary">' + sym + cu.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>' +
                    '<td class="pe-3 text-end fw-bold font-monospace text-dark">' + sym + imp.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>' +
                '</tr>';
            }).join('');
        }
    }

    // 5. Total en Letras y Total Neto
    var letrasEl = document.getElementById('det-oc-total-letras');
    if (letrasEl) {
        var monedaTxt = d.moneda === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES';
        letrasEl.innerText = (typeof window.numeroALetras === 'function' ? window.numeroALetras(totalReal) : '') + ' ' + monedaTxt;
    }

    var totalNetoEl = document.getElementById('det-oc-total-neto');
    if (totalNetoEl) {
        totalNetoEl.innerText = sym + totalReal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    var modalEl = document.getElementById('modalDetalleEntradaOC');
    if (modalEl) {
        var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
};

window.imprimirPDFDesdeDetalleOC = function() {
    if (window._ocSeleccionadaDetalle) {
        window.generarComprobanteEntrada(window._ocSeleccionadaDetalle);
    }
};

window.previsualizarComprobanteEntrada = window.generarComprobanteEntrada;


window.exportarEntradasExcel = function() {
    var datos = window._entFiltrados || window._entData || [];
    if (!datos.length) { alert('No hay datos para exportar.'); return; }

    // Una fila por artículo (detalle completo)
    var cab = ['Código Entrada','Fecha','Proveedor','Nº Factura','Tipo de Orden','Condición Pago','Días Crédito','Moneda',
               'Código Artículo','Descripción Artículo','Cantidad','Costo Unit.','Importe','Total Entrada PEN','Observaciones'];
    var filas = [];
    datos.forEach(function(d) {
        var items = d.items || [];
        if (!items.length) {
            filas.push([d.id, d.fecha?String(d.fecha).split('T')[0]:'', d.proveedor_nombre||'',
                d.documento_referencia||'', d.tipo_orden||'Orden de compra', d.condicion_pago||'Al contado', d.condicion_pago === 'A crédito' ? (d.dias_credito||30) : '', d.moneda||'PEN',
                '','', 0, 0, 0, parseFloat(d.total_pen||0), d.observaciones||'']);
        } else {
            items.forEach(function(it, i) {
                filas.push([
                    i===0 ? d.id : '',
                    i===0 ? (d.fecha?String(d.fecha).split('T')[0]:'') : '',
                    i===0 ? (d.proveedor_nombre||'') : '',
                    i===0 ? (d.documento_referencia||'') : '',
                    i===0 ? (d.tipo_orden||'Orden de compra') : '',
                    i===0 ? (d.condicion_pago||'Al contado') : '',
                    i===0 ? (d.condicion_pago === 'A crédito' ? (d.dias_credito||30) : '') : '',
                    d.moneda||'PEN',
                    it.inventario_id||'',
                    it.descripcion||'',
                    parseFloat(it.cantidad||0),
                    parseFloat(it.costo_unitario||0),
                    parseFloat(it.importe||0),
                    i===0 ? parseFloat(d.total_pen||0) : '',
                    i===0 ? (d.observaciones||'') : ''
                ]);
            });
        }
    });

    var ws = XLSX.utils.aoa_to_sheet([cab].concat(filas));
    ws['!cols'] = [12,12,22,18,8,14,28,10,12,12,14,24].map(function(w){return{wch:w};});
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Entradas');
    XLSX.writeFile(wb, 'Entradas_Almacen.xlsx');
};

window.descargarPlantillaEntradas = function() {
    var wsData = [
        ['fecha','proveedor_nombre','documento_referencia','inventario_id','descripcion','cantidad','costo_unitario','moneda'],
        ['2025-01-15','PROVEEDOR EJEMPLO','FACTURA F001-12345','INV-0001','FILTRO ACEITE MOTOR','5','45.00','PEN'],
        ['2025-01-15','PROVEEDOR EJEMPLO','FACTURA F001-12345','INV-0002','ACEITE MOTOR 15W40','20','12.50','PEN']
    ];
    var ws = XLSX.utils.aoa_to_sheet(wsData);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, 'Plantilla_Entradas.xlsx');
};

window.importarExcelEntradas = function(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var rawJson = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rawJson.length) { alert('Archivo sin datos.'); return; }

        // Agrupar por fecha+proveedor+documento (una entrada por grupo)
        var grupos = {};
        rawJson.forEach(function(row) {
            var norm = {};
            Object.keys(row).forEach(function(k) { norm[k.toLowerCase().trim()] = row[k]; });
            var key = (norm['fecha']||'')+'|'+(norm['proveedor_nombre']||norm['proveedor']||'')+'|'+(norm['documento_referencia']||norm['doc. referencia']||'');
            if (!grupos[key]) grupos[key] = { fecha: norm['fecha']||new Date().toISOString().split('T')[0],
                proveedor_nombre: norm['proveedor_nombre']||norm['proveedor']||null,
                documento_referencia: norm['documento_referencia']||norm['doc. referencia']||null,
                moneda: (norm['moneda']||'PEN').toUpperCase(), items: [] };
            grupos[key].items.push({
                inventario_id: norm['inventario_id']||norm['codigo']||null,
                descripcion: norm['descripcion']||'',
                cantidad: parseFloat(norm['cantidad'])||0,
                costo_unitario: parseFloat(norm['costo_unitario']||norm['costo'])||0,
                moneda: (norm['moneda']||'PEN').toUpperCase(),
                importe: (parseFloat(norm['cantidad'])||0) * (parseFloat(norm['costo_unitario']||norm['costo'])||0)
            });
        });

        var entradas = Object.values(grupos).filter(function(e) { return e.items.length > 0; });
        if (!confirm('Se crearán '+entradas.length+' entradas con '+rawJson.length+' líneas totales. ¿Continuar?')) { event.target.value=''; return; }

        document.body.style.cursor='wait';
        var promises = entradas.map(function(ent) {
            return fetch('/api/almacen/entradas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ent)}).then(function(r){return r.json();});
        });
        Promise.allSettled(promises).then(function(res) {
            document.body.style.cursor='default';
            event.target.value='';
            var ok = res.filter(function(r){return r.status==='fulfilled';}).length;
            var err = res.filter(function(r){return r.status==='rejected';}).length;
            alert('✅ Importadas: '+ok+' entradas.'+(err?' ❌ Errores: '+err:''));
            window.cargarEntradas();
        });
    };
    reader.readAsArrayBuffer(file);
};

// ── KPI Row ───────────────────────────────────────────────────────
window._entRenderKPIs = function(data) {
    var el = document.getElementById('ent-kpi-row');
    if (!el) return;
    var total = data.length;
    var hoy = new Date();
    var mesActual = hoy.getFullYear() + '-' + String(hoy.getMonth()+1).padStart(2,'0');
    var esteMes = data.filter(function(d) {
        return (d.fecha || '').slice(0, 7) === mesActual;
    }).length;
    var totalPEN = data.reduce(function(s, d) { return s + parseFloat(d.total_pen || 0); }, 0);
    var card = 'flex:0 0 auto;min-width:130px;display:flex;justify-content:space-between;align-items:center;' +
               'padding:.85rem 1rem;border-radius:18px;border:1.5px solid;gap:.6rem;';
    var lbl  = 'font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.2rem;';
    var num  = 'font-size:1.6rem;font-weight:900;line-height:1;';
    var ico  = 'width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;';
    el.innerHTML =
        '<div style="' + card + 'background:var(--surface,#fff);border-color:var(--border,#e2e8f0);">' +
          '<div><div style="' + lbl + 'color:var(--subtext,#64748b);">Total Entradas</div><div style="' + num + 'color:var(--text,#0f172a);">' + total + '</div></div>' +
          '<div style="' + ico + 'background:#dcfce7;color:#16a34a;"><i class="bi bi-arrow-down-circle-fill" style="font-size:1.2rem;"></i></div>' +
        '</div>' +
        '<div style="' + card + 'background:#1e293b;border-color:#1e293b;">' +
          '<div><div style="' + lbl + 'color:#94a3b8;">Este Mes</div><div style="' + num + 'color:#fff;">' + esteMes + '</div></div>' +
          '<div style="' + ico + 'background:rgba(255,255,255,.12);color:#fff;"><i class="bi bi-calendar-check" style="font-size:1.2rem;"></i></div>' +
        '</div>' +
        '<div style="' + card + 'background:#fffbeb;border-color:#fde68a;">' +
          '<div><div style="' + lbl + 'color:#92400e;">Valor Total S/</div>' +
          '<div style="' + num + 'color:#d97706;font-size:1.25rem;">S/ ' +
          totalPEN.toLocaleString('es-PE', {minimumFractionDigits:0, maximumFractionDigits:0}) + '</div></div>' +
          '<div style="' + ico + 'background:#fef3c7;color:#d97706;"><i class="bi bi-coin" style="font-size:1.2rem;"></i></div>' +
        '</div>';
};

window._entToggleTipoOrden = function() {
    var tipo = ((document.getElementById('ent-f-tipo-orden') || {}).value || '').toLowerCase();
    var isServicio = tipo === 'orden de servicio';
    var elPlaca = document.getElementById('ent-placa-container');
    var elOt = document.getElementById('ent-ot-container');
    var titleEl = document.getElementById('ent-modal-title');
    if (titleEl) {
        titleEl.textContent = isServicio ? (window._entEditId ? 'Editar Orden de Servicio' : 'Nueva Orden de Servicio') : (window._entEditId ? 'Editar Orden de Compra' : 'Nueva Orden de Compra');
    }

    if (elPlaca && elOt) {
        if (isServicio) { elPlaca.style.display = 'none'; elOt.style.display = 'block'; }
        else { elPlaca.style.display = 'block'; elOt.style.display = 'none'; }
    }

    var itemsDesc = document.querySelectorAll('.ent-item-desc');
    for (var i = 0; i < itemsDesc.length; i++) {
        var idx = itemsDesc[i].getAttribute('data-idx');
        var cbId = 'ent-art-' + idx;
        itemsDesc[i].placeholder = isServicio ? 'Buscar servicio…' : 'Buscar artículo…';
        if (typeof window._entInitCbItem === 'function') {
            window._entInitCbItem(idx, cbId);
        }
    }
    window._entActualizarTotal();
};

window._entSyncServiceCost = function(idx, val) {
    var v = parseFloat(val) || 0;
    var mode = window._entIgvMode || 'incluido';
    var pu = v, vu = v;
    if (mode === 'mas_igv') {
        pu = v * 1.18;
        vu = v;
    } else if (mode === 'sin_igv') {
        pu = v;
        vu = v;
    } else {
        pu = v;
        vu = v / 1.18;
    }
    var puEl = document.querySelector('.ent-item-pu[data-idx="'+idx+'"]');
    var vuEl = document.querySelector('.ent-item-vu[data-idx="'+idx+'"]');
    var igvEl = document.querySelector('.ent-item-igv[data-idx="'+idx+'"]');
    if (puEl) puEl.value = pu.toFixed(4);
    if (vuEl) vuEl.value = vu.toFixed(4);
    if (igvEl) igvEl.value = (pu - vu).toFixed(2);
    window._entCalcTotales();
};

window._entConfirmarNuevoProveedor = function(typedText) {
    if (!typedText) return;
    var cleanRuc = typedText.replace(/\D/g, '');
    var rucToPass = cleanRuc.length >= 8 ? cleanRuc : typedText.trim();
    
    var modalId = 'entModalConfirmarProveedor';
    var el = document.getElementById(modalId);
    if (!el) {
        var div = document.createElement('div');
        div.id = modalId;
        div.className = 'modal fade';
        div.tabIndex = -1;
        div.style.zIndex = '1065';
        div.innerHTML = 
            '<div class="modal-dialog modal-dialog-centered" style="max-width:440px;">' +
            '<div class="modal-content border-0 shadow-lg" style="border-radius:16px; overflow:hidden;">' +
            '<div class="modal-header border-0 bg-light p-3">' +
            '<h5 class="modal-title fs-6 fw-bold text-dark d-flex align-items-center gap-2">' +
            '<i class="bi bi-building-add text-primary fs-5"></i> Registrar Nuevo Proveedor' +
            '</h5>' +
            '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
            '</div>' +
            '<div class="modal-body p-4 text-center">' +
            '<div class="mb-3"><span class="badge bg-primary-subtle text-primary fw-bold px-3 py-2 fs-6" style="border-radius:12px;">' + _entEsc(rucToPass) + '</span></div>' +
            '<p class="mb-1 text-secondary font-medium">El RUC / Proveedor no se encuentra registrado en el catálogo.</p>' +
            '<p class="fw-bold text-dark mb-0">¿Deseas registrar este nuevo proveedor ahora?</p>' +
            '</div>' +
            '<div class="modal-footer border-0 p-3 bg-light d-flex justify-content-end gap-2">' +
            '<button type="button" class="btn btn-light fw-bold px-4" data-bs-dismiss="modal" style="border-radius:10px;">No</button>' +
            '<button type="button" id="btnConfirmRegProvYes" class="btn btn-primary fw-bold px-4" style="border-radius:10px;">Sí, Registrar</button>' +
            '</div>' +
            '</div></div>';
        document.body.appendChild(div);
        el = div;
    } else {
        var badge = el.querySelector('.badge');
        if (badge) badge.textContent = rucToPass;
    }
    
    var btnYes = el.querySelector('#btnConfirmRegProvYes');
    if (btnYes) {
        btnYes.onclick = function() {
            var bsModal = bootstrap.Modal.getInstance(el);
            if (bsModal) bsModal.hide();
            window.asegurarModalProveedorYAbrir(rucToPass);
        };
    }
    
    var bsM = bootstrap.Modal.getOrCreateInstance(el);
    bsM.show();
};

window.asegurarModalProveedorYAbrir = function(rucTyped) {
    var raw = (rucTyped || '').trim();
    var cleanRuc = raw.replace(/\D/g, '');
    var isNumericDoc = cleanRuc.length >= 8;

    var openForm = function() {
        if (typeof window.abrirModalProveedor === 'function') {
            window._onProveedorCreado = function(newId, provNombre, provRuc) {
                if (typeof window._entCargarProveedores === 'function') {
                    window._entCargarProveedores();
                }
                setTimeout(function() {
                    var displayTxt = provNombre + (provRuc ? ' (' + provRuc + ')' : '');
                    if (typeof window._cbSet === 'function') {
                        window._cbSet('ent-f-proveedor', newId, displayTxt);
                    }
                    if (typeof window.rotToast === 'function') {
                        window.rotToast('Proveedor "' + provNombre + '" registrado y seleccionado.', 'bg-success');
                    }
                }, 300);
            };

            window.abrirModalProveedor();

            var mEl = document.getElementById('modal-proveedor');
            if (mEl) {
                mEl.style.zIndex = '1150';
            }
            var bEl = document.getElementById('prov-backdrop');
            if (bEl) {
                bEl.style.zIndex = '1140';
            }

            setTimeout(function() {
                var docEl = document.getElementById('prov-f-num-doc');
                var tipoEl = document.getElementById('prov-f-tipo-doc');
                var nomEl = document.getElementById('prov-f-nombre');
                if (isNumericDoc) {
                    if (tipoEl) tipoEl.value = (cleanRuc.length === 11) ? 'RUC' : (cleanRuc.length === 8 ? 'DNI' : 'RUC');
                    if (docEl) {
                        docEl.value = cleanRuc;
                        if (typeof window.consultarDocProveedor === 'function') {
                            window.consultarDocProveedor();
                        }
                    }
                } else if (nomEl && raw) {
                    nomEl.value = raw;
                }
            }, 150);
        }
    };

    document.querySelectorAll('#prov-injected-container, body > #mod-proveedores').forEach(function(el) {
        el.remove();
    });

    if (document.getElementById('modal-proveedor')) {
        openForm();
    } else {
        fetch('/modulos/almacen/proveedores/vista.html')
            .then(function(r) { return r.text(); })
            .then(function(htmlText) {
                if (!document.getElementById('modal-proveedor')) {
                    var tempDiv = document.createElement('div');
                    tempDiv.innerHTML = htmlText;
                    
                    var styleEl = tempDiv.querySelector('style');
                    if (styleEl) {
                        document.head.appendChild(styleEl.cloneNode(true));
                    }
                    var backdropEl = tempDiv.querySelector('#prov-backdrop');
                    if (backdropEl && !document.getElementById('prov-backdrop')) {
                        backdropEl.style.zIndex = '1140';
                        document.body.appendChild(backdropEl.cloneNode(true));
                    }
                    var modalEl = tempDiv.querySelector('#modal-proveedor');
                    if (modalEl && !document.getElementById('modal-proveedor')) {
                        modalEl.style.zIndex = '1150';
                        document.body.appendChild(modalEl.cloneNode(true));
                    }
                }

                if (typeof window.abrirModalProveedor === 'function') {
                    openForm();
                } else {
                    var script = document.createElement('script');
                    script.src = '/modulos/almacen/proveedores/logica.js?v=' + Date.now();
                    script.onload = openForm;
                    document.body.appendChild(script);
                }
            })
            .catch(function(err) {
                alert('No se pudo cargar el formulario de Proveedores: ' + err.message);
            });
    }
};
