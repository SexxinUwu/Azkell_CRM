// ================================================================
// Módulo Frecuencias de Mantenimiento — Azkell Fleet
// Gestión de Tipos MP (frecuencias, intervalos, sistemas)
// ================================================================

function _bsModal(el) {
    if (!el) return { show: function(){}, hide: function(){} };
    return bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el);
}

window.cfgDataFlota    = window.cfgDataFlota    || [];
window.cfgDataFlotaFil = window.cfgDataFlotaFil || [];
window.cmpImportRows   = window.cmpImportRows   || [];
window._cfgSeleccionados = window._cfgSeleccionados || [];

// ── Entry point ───────────────────────────────────────────────────
window['init_configuracion-mp'] = function() {
    if (!window.checkPerm('cfg_mant', 'l')) {
        window.showNoPermMsg('root-dinamico');
        return;
    }
    var btnNuevo = document.querySelector('[onclick*="abrirModalConfigFlota"]');
    if (btnNuevo) btnNuevo.style.display = window.checkPerm('cfg_mant','c') ? '' : 'none';
    if (typeof window._cbOnSelect === 'function') {
        window._cbOnSelect('cfg-flota-fil-marca', function() { window.filtrarTablaConfigFlota(); });
    }
    var cfMarca = document.getElementById('cf-marca');
    if (cfMarca) {
        cfMarca.addEventListener('input', function(e) {
            if (window._cfPopularModelos) window._cfPopularModelos(e.target.value);
        });
    }
    window.cargarTablaConfigFlota();
};

// ── Helper datalists ──────────────────────────────────────────────
function _cfPopularDatalists() {
    var marcas = [];
    if (window.dataGlobalPlacas) {
        window.dataGlobalPlacas.forEach(function(p) {
            var m = (p[3] || '').trim().toUpperCase();
            if (m && !marcas.includes(m)) marcas.push(m);
        });
    }
    (window.cfgDataFlota || []).forEach(function(r) {
        var m = (r.marca || '').trim().toUpperCase();
        if (m && !marcas.includes(m)) marcas.push(m);
    });
    marcas.sort();

    var sistemas = [];
    (window.cfgDataFlota || []).forEach(function(r) {
        var s = (r.sistema || '').trim();
        if (s && !sistemas.includes(s)) sistemas.push(s);
    });
    sistemas.sort();

    var combustibles = [];
    if (window.dataGlobalPlacas) {
        window.dataGlobalPlacas.forEach(function(p) {
            var c = (p[14] || '').trim().toUpperCase();
            if (c && !combustibles.includes(c)) combustibles.push(c);
        });
    }
    (window.cfgDataFlota || []).forEach(function(r) {
        var c = (r.combustible || '').trim().toUpperCase();
        if (c && !combustibles.includes(c)) combustibles.push(c);
    });
    combustibles.sort();

    var tipos = [];
    (window.cfgDataFlota || []).forEach(function(r) {
        var t = (r.tipo || '').trim();
        if (t && !tipos.includes(t)) tipos.push(t);
    });
    tipos.sort();

    function _fill(id, vals) {
        var dl = document.getElementById(id);
        if (dl) dl.innerHTML = '<option value="">Seleccionar...</option>' + vals.map(function(v){ return '<option value="'+v+'">'+v+'</option>'; }).join('');
    }
    _fill('cf-marca',   marcas);
    _fill('cf-sistema', sistemas);
    _fill('cf-combustible', combustibles);
    _fill('cf-tipo', tipos);

    // Tipos de Preventivo: desde tabla maestra
    fetch('/api/tipos-preventivo')
        .then(function(r) { return r.ok ? r.json() : { data: [] }; })
        .then(function(j) { _fill('cf-tipo-mp', (j.data || []).map(function(t) { return t.nombre; })); })
        .catch(function() {});
}

window._cfPopularModelos = function(marcaSeleccionada) {
    var modelos = [];
    var marcaFiltro = (marcaSeleccionada || '').trim().toUpperCase();
    if (window.dataGlobalPlacas) {
        window.dataGlobalPlacas.forEach(function(p) {
            var m = (p[3] || '').trim().toUpperCase(); // marca
            if (!marcaFiltro || m === marcaFiltro) {
                var mod = (p[4] || '').trim().toUpperCase(); // modelo
                if (mod && !modelos.includes(mod)) modelos.push(mod);
            }
        });
    }
    (window.cfgDataFlota || []).forEach(function(r) {
        var m = (r.marca || '').trim().toUpperCase();
        if (!marcaFiltro || m === marcaFiltro) {
            var mod = (r.modelo || '').trim().toUpperCase();
            if (mod && !modelos.includes(mod)) modelos.push(mod);
        }
    });
    modelos.sort();
    var dl = document.getElementById('cf-modelo');
    if (dl) dl.innerHTML = '<option value="">Seleccionar...</option>' + modelos.map(function(v){ return '<option value="'+v+'">'+v+'</option>'; }).join('');
};

// ── TIPOS DE MANTENIMIENTO ────────────────────────────────────────
window.cargarTablaConfigFlota = function() {
    var tb = document.getElementById('cfg-flota-tbody');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="13" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>';
    fetch('/api/tipos-mantenimiento')
        .then(function(r) { return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error || ('HTTP ' + r.status)); }); })
        .then(function(j) {
            window.cfgDataFlota = j.data || [];
            window._cfgSeleccionados = [];
            _cfgActualizarBtnMasivo();
            var prev = typeof window._cbGet === 'function' ? window._cbGet('cfg-flota-fil-marca') : '';
            var marcasMap = {};
            window.cfgDataFlota.forEach(function(r) {
                var up = (r.marca||'').trim().toUpperCase();
                if (up) marcasMap[up] = true;
            });
            var marcas = Object.keys(marcasMap).sort();
            var items = marcas.map(function(m) { return { value: m, label: m }; });
            if (typeof window._cbInit === 'function') window._cbInit('cfg-flota-fil-marca', items, 'Todas las marcas');
            if (prev && typeof window._cbSet === 'function') window._cbSet('cfg-flota-fil-marca', prev, prev);
            window.filtrarTablaConfigFlota();
        })
        .catch(function(e) {
            console.error('cargarTablaConfigFlota:', e);
            var tb2 = document.getElementById('cfg-flota-tbody');
            if (tb2) tb2.innerHTML = '<tr><td colspan="13" class="text-center py-4" style="color:#dc2626">'
                + '<i class="bi bi-exclamation-triangle me-1"></i>Error al cargar datos. '
                + '<a href="#" onclick="window.cargarTablaConfigFlota();return false">Reintentar</a>'
                + '</td></tr>';
        });
};

window.filtrarTablaConfigFlota = function() {
    var filMarca  = ((document.getElementById('cfg-flota-fil-marca')||{}).value||'').toUpperCase();
    var filUts    = ((document.getElementById('cfg-flota-fil-uts')  ||{}).value||'');
    var buscar    = ((document.getElementById('cmp-tipos-buscar')   ||{}).value||'').toUpperCase().trim();
    window.cfgDataFlotaFil = (window.cfgDataFlota||[]).filter(function(r) {
        var matchMarca = !filMarca || (r.marca||'').toUpperCase() === filMarca;
        var matchUts   = !filUts   || (r.uts||'').toUpperCase() === filUts;
        var matchBus   = !buscar   || (r.tipo_mp||'').toUpperCase().includes(buscar) ||
                                      (r.descripcion||'').toUpperCase().includes(buscar) ||
                                      (r.sistema||'').toUpperCase().includes(buscar);
        return matchMarca && matchUts && matchBus;
    });
    var tb = document.getElementById('cfg-flota-tbody');
    if (!tb) return;
    if (!window.cfgDataFlotaFil.length) {
        tb.innerHTML = '<tr><td colspan="13" class="text-center py-4" style="color:var(--subtext)">Sin tipos de mantenimiento</td></tr>';
        return;
    }
    var sel = window._cfgSeleccionados || [];
    tb.innerHTML = window.cfgDataFlotaFil.map(function(r) {
        var checked = sel.indexOf(r.id) !== -1 ? 'checked' : '';
        var utsBadge = r.uts === 'LOCAL'
            ? '<span class="badge bg-info text-dark rounded-pill shadow-sm px-2">LOCAL</span>'
            : (r.uts === 'NACIONAL' ? '<span class="badge bg-warning text-dark rounded-pill shadow-sm px-2">NACIONAL</span>' : (r.uts || '—'));
        return '<tr class="align-middle" style="transition:background-color 0.2s">' +
            '<td class="ps-4 py-2"><input type="checkbox" class="form-check-input cfg-chk rounded-1" value="' + r.id + '" ' + checked + ' onchange="window._cfgToggleSel(' + r.id + ',this.checked)"></td>' +
            '<td class="fw-bold" style="color:var(--text)">' + (r.marca||'') + '</td>' +
            '<td><span class="badge bg-primary text-white shadow-sm px-2 py-1 rounded-pill" style="font-weight:600; letter-spacing:0.3px">' + (r.tipo_mp||'') + '</span></td>' +
            '<td>' + utsBadge + '</td>' +
            '<td style="color:var(--subtext)">' + (r.combustible || '—') + '</td>' +
            '<td style="color:var(--subtext)">' + (r.modelo || '—') + '</td>' +
            '<td>' + (r.frecuencia_km   ? (parseInt(r.frecuencia_km)||0).toLocaleString('es-PE') + ' km' : '—') + '</td>' +
            '<td>' + (r.frecuencia_horas ? (parseInt(r.frecuencia_horas)||0) + ' h'                      : '—') + '</td>' +
            '<td>' + (r.frecuencia_dias  ? (parseInt(r.frecuencia_dias)||0) + ' días'                    : '—') + '</td>' +
            '<td style="font-size:0.8rem; color:var(--primary)">' + (r.tipo    || '—') + '</td>' +
            '<td style="font-size:0.8rem; color:var(--subtext)">' + (r.sistema || '—') + '</td>' +
            '<td style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.8rem; color:var(--text)">' + (r.descripcion || '—') + '</td>' +
            '<td class="pe-4 text-end">' +
                '<button class="btn btn-sm btn-light text-primary border-0 me-1 rounded-circle shadow-sm" onclick="window.editarConfigFlota(' + r.id + ')" title="Editar" style="width:28px; height:28px; padding:0; display:inline-flex; align-items:center; justify-content:center"><i class="bi bi-pencil" style="font-size:0.85rem"></i></button>' +
                '<button class="btn btn-sm btn-light text-danger border-0 rounded-circle shadow-sm" onclick="window.eliminarConfigFlota(' + r.id + ',\'' + (r.marca + ' ' + r.tipo_mp).replace(/'/g,'') + '\')" title="Eliminar" style="width:28px; height:28px; padding:0; display:inline-flex; align-items:center; justify-content:center"><i class="bi bi-trash" style="font-size:0.85rem"></i></button>' +
            '</td></tr>';
    }).join('');
};

// ── Selección masiva ──────────────────────────────────────────────
window._cfgToggleSel = function(id, checked) {
    window._cfgSeleccionados = window._cfgSeleccionados || [];
    if (checked) {
        if (window._cfgSeleccionados.indexOf(id) === -1) window._cfgSeleccionados.push(id);
    } else {
        window._cfgSeleccionados = window._cfgSeleccionados.filter(function(x){ return x !== id; });
    }
    _cfgActualizarBtnMasivo();
};

window._cfgToggleSelAll = function(checked) {
    window._cfgSeleccionados = checked
        ? (window.cfgDataFlotaFil||[]).map(function(r){ return r.id; })
        : [];
    document.querySelectorAll('.cfg-chk').forEach(function(chk) { chk.checked = checked; });
    _cfgActualizarBtnMasivo();
};

function _cfgActualizarBtnMasivo() {
    var n = (window._cfgSeleccionados||[]).length;
    var btn = document.getElementById('cfg-btn-eliminar-masivo');
    if (btn) {
        btn.style.display = n > 0 ? '' : 'none';
        btn.textContent = 'Eliminar ' + n + ' seleccionado' + (n !== 1 ? 's' : '');
    }
    var chkAll = document.getElementById('cfg-chk-all');
    if (chkAll) chkAll.indeterminate = n > 0 && n < (window.cfgDataFlotaFil||[]).length;
}

window.eliminarMasivoConfigFlota = function() {
    var ids = window._cfgSeleccionados || [];
    if (!ids.length) return;
    if (!confirm('¿Eliminar ' + ids.length + ' registro(s) seleccionado(s)? Esta acción no se puede deshacer.')) return;
    fetch('/api/tipos-mantenimiento/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids })
    })
    .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
    .then(function(res){
        window.mostrarToast('Eliminados: ' + (res.eliminados||ids.length) + ' registros', 'success');
        window._cfgSeleccionados = [];
        window.cargarTablaConfigFlota();
    })
    .catch(function(e){ window.mostrarToast('Error: ' + e.message, 'danger'); });
};

window.abrirModalConfigFlota = function() {
    ['cf-id','cf-marca','cf-tipo-mp','cf-combustible','cf-modelo','cf-frec-km','cf-frec-horas','cf-frec-dias','cf-tipo','cf-sistema','cf-descripcion'].forEach(function(id){
        var el=document.getElementById(id); if(el) el.value='';
    });
    var el = document.getElementById('cf-uts'); if(el) el.value='LOCAL';
    var t = document.getElementById('modalConfigFlota-titulo');
    if(t) t.innerHTML='<i class="bi bi-plus-circle me-1 text-primary"></i>Nuevo Tipo de Mantenimiento';
    _cfPopularDatalists();
    if (window._cfPopularModelos) window._cfPopularModelos('');
    _bsModal(document.getElementById('modalConfigFlota')).show();
};

window.editarConfigFlota = function(id) {
    var _doEdit = function() {
        var r = (window.cfgDataFlota||[]).find(function(x){ return x.id==id; });
        if (!r) return;
        var set    = function(elId, v){ var el=document.getElementById(elId); if(el) el.value = v != null ? v : ''; };
        var setStr = function(elId, v){ var el=document.getElementById(elId); if(el) el.value = v || ''; };
        set('cf-id',             r.id);
        setStr('cf-marca',       r.marca);
        setStr('cf-tipo-mp',     r.tipo_mp);
        setStr('cf-uts',         r.uts || 'LOCAL');
        setStr('cf-combustible', r.combustible);
        setStr('cf-modelo',      r.modelo);
        set('cf-frec-km',        r.frecuencia_km);
        set('cf-frec-horas',     r.frecuencia_horas);
        set('cf-frec-dias',      r.frecuencia_dias);
        setStr('cf-tipo',        r.tipo);
        setStr('cf-sistema',     r.sistema);
        setStr('cf-descripcion', r.descripcion);
        var t = document.getElementById('modalConfigFlota-titulo');
        if(t) t.innerHTML='<i class="bi bi-pencil me-1 text-primary"></i>Editar — ' + r.marca + ' ' + r.tipo_mp;
        _cfPopularDatalists();
        if (window._cfPopularModelos) window._cfPopularModelos(r.marca);
        _bsModal(document.getElementById('modalConfigFlota')).show();
    };
    fetch('/api/tipos-mantenimiento')
        .then(function(r){ return r.ok ? r.json() : {data:[]}; })
        .then(function(j){ window.cfgDataFlota = j.data || []; _doEdit(); })
        .catch(_doEdit);
};

window.guardarConfigFlota = function() {
    var get = function(id){ var el=document.getElementById(id); return el?el.value.trim():''; };
    var cfId = get('cf-id');
    var body = {
        marca:            get('cf-marca').toUpperCase(),
        tipo_mp:          get('cf-tipo-mp').toUpperCase(),
        uts:              get('cf-uts').toUpperCase(),
        combustible:      get('cf-combustible').toUpperCase(),
        modelo:           get('cf-modelo').toUpperCase(),
        frecuencia_km:    parseInt(get('cf-frec-km'))    || null,
        frecuencia_horas: parseInt(get('cf-frec-horas')) || null,
        frecuencia_dias:  parseInt(get('cf-frec-dias'))  || null,
        tipo:             get('cf-tipo')        || null,
        sistema:          get('cf-sistema')     || null,
        descripcion:      get('cf-descripcion') || null
    };
    if (!body.marca || !body.tipo_mp) return window.mostrarToast('Marca y Tipo MP son requeridos', 'warning');
    var url    = cfId ? '/api/tipos-mantenimiento/' + cfId : '/api/tipos-mantenimiento';
    var method = cfId ? 'PUT' : 'POST';
    fetch(url, { method:method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
        .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
        .then(function(){
            _bsModal(document.getElementById('modalConfigFlota')).hide();
            window.mostrarToast('Tipo de mantenimiento guardado', 'success');
            window.cargarTablaConfigFlota();
        })
        .catch(function(e){ window.mostrarToast('Error: ' + e.message, 'error'); });
};

window.eliminarConfigFlota = function(id, label) {
    if (!confirm('¿Eliminar "' + label + '"?')) return;
    fetch('/api/tipos-mantenimiento/' + id, { method:'DELETE' })
        .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
        .then(function(){ window.mostrarToast('Tipo de mantenimiento eliminado', 'success'); window.cargarTablaConfigFlota(); })
        .catch(function(e){ window.mostrarToast('Error: ' + e.message, 'error'); });
};

// ── EXPORT ────────────────────────────────────────────────────────
window.cmpExportarExcel = function() {
    if (!window.cfgDataFlota || !window.cfgDataFlota.length) {
        return window.mostrarToast('No hay datos para exportar', 'warning');
    }
    var headers = ['MARCA','TIPO MP','UTS','COMBUSTIBLE','MODELO','FREC. KM','FREC. HORAS','FREC. DÍAS','TIPO','SISTEMA','DESCRIPCIÓN'];
    var rows = [headers];
    window.cfgDataFlota.forEach(function(r) {
        rows.push([
            r.marca        || '',
            r.tipo_mp      || '',
            r.uts          || '',
            r.combustible  || '',
            r.modelo       || '',
            r.frecuencia_km    != null ? parseInt(r.frecuencia_km)    : '',
            r.frecuencia_horas != null ? parseInt(r.frecuencia_horas) : '',
            r.frecuencia_dias  != null ? parseInt(r.frecuencia_dias)  : '',
            r.tipo         || '',
            r.sistema      || '',
            r.descripcion  || ''
        ]);
    });
    var ws = XLSX.utils.aoa_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tipos_MP');
    XLSX.writeFile(wb, 'Tipos_Mantenimiento_' + new Date().toISOString().split('T')[0] + '.xlsx');
    window.mostrarToast('Archivo Excel generado', 'success');
};

window.cmpDescargarPlantilla = function() {
    var rows = [
        ['MARCA','TIPO MP','UTS','COMBUSTIBLE','MODELO','FREC. KM','FREC. HORAS','FREC. DÍAS','TIPO','SISTEMA','DESCRIPCIÓN'],
        ['ISUZU','MP1','NACIONAL','DIESEL','MODELO 1',10000,'',35,'Cambio','Motor','Cambio de aceite de motor'],
        ['ISUZU','MP1','LOCAL','DIESEL','MODELO 2',6000,'','','Cambio','Motor','Cambio de aceite de motor LOCAL'],
        ['VOLVO','MP2','NACIONAL','DIESEL','MODELO 3',20000,500,180,'Cambio','Transmisión','Cambio de aceite de caja']
    ];
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [12,18,10,12,12,10,10,12,10,12,14,35].map(function(w){ return {wch:w}; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, 'Plantilla_Tipos_Mantenimiento.xlsx');
    window.mostrarToast('Plantilla descargada', 'success');
};

window.cmpImportarExcel = function(input) {
    var file = input.files[0];
    if (!file) return;
    input.value = '';
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var wb  = XLSX.read(e.target.result, { type:'binary' });
            var ws  = wb.Sheets[wb.SheetNames[0]];
            var raw = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
            if (raw.length < 2) return window.mostrarToast('El archivo está vacío', 'warning');

            var hdr = raw[0].map(function(h){ return (h+'').trim().toUpperCase(); });
            var idx = {
                marca:       hdr.indexOf('MARCA'),
                tipo_mp:     hdr.indexOf('TIPO MP'),
                uts:         ['UTS','CATEGORÍA','CATEGORIA'].reduce(function(r,k){ return r>=0?r:hdr.indexOf(k); }, -1),
                combustible: hdr.indexOf('COMBUSTIBLE'),
                modelo:      hdr.indexOf('MODELO'),
                frec_km:     ['FREC. KM','FREC KM','FRECUENCIA KM','FRECUENCIA_KM'].reduce(function(r,k){ return r>=0?r:hdr.indexOf(k); }, -1),
                frec_h:      ['FREC. HORAS','FREC HORAS','FRECUENCIA HORAS'].reduce(function(r,k){ return r>=0?r:hdr.indexOf(k); }, -1),
                frec_d:      ['FREC. DÍAS','FREC DÍAS','FREC. DIAS','FRECUENCIA DÍAS'].reduce(function(r,k){ return r>=0?r:hdr.indexOf(k); }, -1),
                tipo:        hdr.indexOf('TIPO'),
                sistema:     hdr.indexOf('SISTEMA'),
                desc:        ['DESCRIPCIÓN','DESCRIPCION'].reduce(function(r,k){ return r>=0?r:hdr.indexOf(k); }, -1)
            };

            if (idx.marca < 0 || idx.tipo_mp < 0) {
                return window.mostrarToast('El archivo no tiene columnas MARCA y TIPO MP', 'danger');
            }

            function limpiarNumero(val) {
                if (val === null || val === undefined || val === '') return null;
                if (typeof val === 'number') return Math.round(val);
                var str = (val+'').replace(/,/g, '').trim();
                var num = parseFloat(str);
                return isNaN(num) ? null : Math.round(num);
            }

            var registros = [];
            for (var i = 1; i < raw.length; i++) {
                var row = raw[i];
                var marca = (row[idx.marca]+'').trim().toUpperCase();
                var tipo  = (row[idx.tipo_mp]+'').trim().toUpperCase();
                if (!marca || !tipo) continue;
                registros.push({
                    marca:            marca,
                    tipo_mp:          tipo,
                    uts:              idx.uts >= 0     ? ((row[idx.uts]+'').trim().toUpperCase()||'LOCAL') : 'LOCAL',
                    combustible:      idx.combustible >= 0 ? ((row[idx.combustible]+'').trim().toUpperCase()||null) : null,
                    modelo:           idx.modelo >= 0      ? ((row[idx.modelo]+'').trim().toUpperCase()||null) : null,
                    frecuencia_km:    idx.frec_km >= 0 ? limpiarNumero(row[idx.frec_km]) : null,
                    frecuencia_horas: idx.frec_h >= 0  ? limpiarNumero(row[idx.frec_h]) : null,
                    frecuencia_dias:  idx.frec_d >= 0  ? limpiarNumero(row[idx.frec_d]) : null,
                    tipo:             idx.tipo >= 0    ? ((row[idx.tipo]+'').trim()||null) : null,
                    sistema:          idx.sistema >= 0 ? ((row[idx.sistema]+'').trim()||null) : null,
                    descripcion:      idx.desc >= 0    ? ((row[idx.desc]+'').trim()||null) : null
                });
            }

            if (!registros.length) return window.mostrarToast('No se encontraron registros válidos', 'warning');

            window.cmpImportRows = registros;
            var prev = document.getElementById('cmp-import-preview');
            if (prev) {
                prev.innerHTML =
                    '<div class="d-flex gap-3 mb-2">' +
                    '<span class="badge bg-primary px-3 py-2">' + registros.length + ' filas leídas</span>' +
                    '<span class="badge bg-secondary px-3 py-2">' + [...new Set(registros.map(function(r){ return r.marca; }))].length + ' marcas</span>' +
                    '</div>' +
                    '<table class="table table-sm table-bordered" style="font-size:0.78rem">' +
                    '<thead><tr><th>Marca</th><th>Tipo MP</th><th>UTS</th><th>Frec. KM</th></tr></thead>' +
                    '<tbody>' +
                    registros.slice(0,8).map(function(r){
                        return '<tr><td>'+r.marca+'</td><td>'+r.tipo_mp+'</td><td>'+r.uts+'</td><td>'+(r.frecuencia_km||'—')+'</td></tr>';
                    }).join('') +
                    (registros.length > 8 ? '<tr><td colspan="4" class="text-center text-muted">... y '+(registros.length-8)+' más</td></tr>' : '') +
                    '</tbody></table>';
            }
            _bsModal(document.getElementById('cmpModalImport')).show();
        } catch(err) {
            window.mostrarToast('Error al leer el archivo: ' + err.message, 'danger');
        }
    };
    reader.readAsBinaryString(file);
};

window.cmpConfirmarImport = function() {
    var registros = window.cmpImportRows || [];
    if (!registros.length) return;

    var btn = document.getElementById('cmp-btn-confirmar-import');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Importando...'; }

    fetch('/api/tipos-mantenimiento/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registros: registros })
    })
    .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
    .then(function(res) {
        _bsModal(document.getElementById('cmpModalImport')).hide();
        window.mostrarToast('Importación completada: ' + res.insertados + ' insertados, ' + res.actualizados + ' actualizados', 'success');
        window.cmpImportRows = [];
        window.cargarTablaConfigFlota();
    })
    .catch(function(e){
        window.mostrarToast('Error al importar: ' + e.message, 'danger');
    })
    .finally(function(){
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-upload me-1"></i>Importar'; }
    });
};
