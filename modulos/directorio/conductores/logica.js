// ================================================================
// 🚗 MÓDULO CONDUCTORES - LÓGICA AISLADA
// ================================================================

var dataGlobalConductores = window.dataGlobalConductores || [];
window.dataGlobalConductores = dataGlobalConductores;
var _masterConductores = window._masterConductores || [];
window._masterConductores = _masterConductores;
var expandCondMap = window.expandCondMap || {};
window.expandCondMap = expandCondMap;
var expandAllCondState = (window.expandAllCondState !== undefined) ? window.expandAllCondState : true;

function toTitleCase(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
}

function toggleGroupRowCond(claseEst) {
    expandCondMap[claseEst] = !expandCondMap[claseEst];
    mostrarConductores(dataGlobalConductores);
}

function toggleAllCondGroups() {
    expandAllCondState = !expandAllCondState;
    for (let key in expandCondMap) expandCondMap[key] = expandAllCondState;
    mostrarConductores(dataGlobalConductores);
}

function mostrarConductores(datos) {
    dataGlobalConductores = datos;
    window.dataGlobalConductores = datos;

    var grid  = document.getElementById('cond-grid');
    var tbody = document.getElementById('cuerpoTablaConductores');
    var listOpciones = new Set();

    var limpiarN = function(txt) {
        if (!txt) return '';
        return txt.toString().replace(/ñ/g, 'ñ').replace(/Ã'/g, 'Ñ');
    };

    if (!datos || !datos.length) {
        if (grid)  grid.innerHTML  = '<div style="text-align:center;padding:3rem 1rem;color:var(--subtext);font-size:.9rem;">No hay personal registrado.</div>';
        if (tbody) tbody.innerHTML = '';
        return;
    }

    var mapEstados = new Map();
    datos.forEach(function(f) {
        var estado = f.estado || 'Desconocido';
        if (!mapEstados.has(estado)) mapEstados.set(estado, []);
        mapEstados.get(estado).push(f);
        if (estado.toLowerCase() === 'activo' && f.nombre) {
            listOpciones.add(toTitleCase(limpiarN(f.nombre.toString())));
        }
    });

    var colorMap = { 'Activo': '#2563eb', 'Cesado': '#64748b', 'Bloqueado': '#dc2626' };
    var htmlGrid  = '';
    var htmlTable = '';

    mapEstados.forEach(function(registros, estado) {
        var claseE   = normalizarClase(estado.toString());
        if (expandCondMap[claseE] === undefined) expandCondMap[claseE] = expandAllCondState;
        var isExp    = expandCondMap[claseE];
        var colorEst = colorMap[estado] || '#94a3b8';
        var chevron  = isExp ? 'bi-chevron-down' : 'bi-chevron-right';

        htmlGrid += '<div class="cond-group-lbl" onclick="toggleGroupRowCond(\'' + claseE + '\')">'
            + '<i class="bi ' + chevron + '" style="font-size:.78rem;color:' + colorEst + '"></i>'
            + '<i class="bi bi-people-fill" style="color:' + colorEst + '"></i>'
            + '<span style="color:' + colorEst + '">' + estado + '</span>'
            + '<span class="cond-group-cnt" style="background:' + colorEst + '22;color:' + colorEst + '">' + registros.length + '</span>'
            + '</div>';

        if (isExp) {
            registros.forEach(function(f) {
                var nombre   = toTitleCase(limpiarN(f.nombre || '-'));
                var empresa  = f.empresa  ? f.empresa.toString().replace(/TERCERO/gi, '3ro') : '';
                var telf     = f.telefono ? f.telefono.toString().replace(/[^0-9]/g, '') : '';
                var dni      = f.dni      ? f.dni.toString() : '';
                var licencia = f.licencia ? f.licencia.toString() : '';

                var parts    = nombre.trim().split(/\s+/);
                var initials = ((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '');

                var subParts = [];
                if (empresa) subParts.push(empresa);
                if (dni)     subParts.push('DNI ' + dni);

                var actHtml;
                if (telf.length >= 9) {
                    actHtml = '<div class="cond-actions">'
                        + '<a href="tel:' + telf + '" class="cond-btn cond-call" onclick="event.stopPropagation()" title="Llamar"><i class="bi bi-telephone-fill"></i></a>'
                        + '<a href="https://wa.me/51' + telf + '" target="_blank" class="cond-btn cond-wsp" onclick="event.stopPropagation()" title="WhatsApp"><i class="bi bi-whatsapp"></i></a>'
                        + '</div>';
                } else {
                    actHtml = '<div class="cond-no-tel"><i class="bi bi-telephone-slash" title="Sin teléfono"></i></div>';
                }

                var jsonSeguro = JSON.stringify(f).replace(/'/g, "&#39;");
                htmlGrid += '<div class="cond-card" onclick=\'abrirModalConductor(' + jsonSeguro + ')\'>'
                    + '<div class="cond-avatar" style="background:' + colorEst + '">' + initials.toUpperCase() + '</div>'
                    + '<div class="cond-info">'
                        + '<div class="cond-name" title="' + nombre + '">' + nombre + '</div>'
                        + (subParts.length ? '<div class="cond-sub">' + subParts.join(' · ') + '</div>' : '')
                        + (licencia ? '<span class="cond-lic">' + licencia + '</span>' : '')
                    + '</div>'
                    + actHtml
                    + '</div>';

                htmlTable += '<tr>'
                    + '<td data-value="' + nombre + '">' + nombre + '</td>'
                    + '<td>' + (empresa || '-') + '</td>'
                    + '<td>' + (dni || '-') + '</td>'
                    + '<td>' + (licencia || '-') + '</td>'
                    + '<td>' + (telf || '-') + '</td>'
                    + '<td>' + estado + '</td>'
                    + '<td></td>'
                    + '</tr>';
            });
        }
    });

    if (grid)  grid.innerHTML  = htmlGrid;
    if (tbody) tbody.innerHTML = htmlTable;
    rellenarDatalist('dl-conductores', listOpciones);
}

window.filtrarConductores = function() {
    var elDesk = document.getElementById('buscadorConductores');
    var elMob = document.getElementById('buscadorConductoresMob');
    var qDesk = elDesk ? elDesk.value.toLowerCase().trim() : '';
    var qMob = elMob ? elMob.value.toLowerCase().trim() : '';
    var q = qMob || qDesk;
    
    // Sync inputs if needed
    if (elDesk && elMob) {
        if (document.activeElement === elMob) elDesk.value = elMob.value;
        if (document.activeElement === elDesk) elMob.value = elDesk.value;
    }

    if (!q) {
        // Restaurar datos originales completos
        var source = (window._masterConductores && window._masterConductores.length > 0) ? window._masterConductores : window.dataGlobalConductores;
        window.dataGlobalConductores = source;
        mostrarConductores(source);
        return;
    }
    // Filtrar siempre desde la copia master, no desde los ya filtrados
    var sourceData = (window._masterConductores && window._masterConductores.length > 0) ? window._masterConductores : window.dataGlobalConductores;
    var filtered = sourceData.filter(function(f) {
        var n = (f.nombre   || '').toLowerCase();
        var d = (f.dni      || '').toLowerCase();
        var e = (f.empresa  || '').toLowerCase();
        var t = (f.telefono || '').toString().toLowerCase();
        return n.includes(q) || d.includes(q) || e.includes(q) || t.includes(q);
    });
    mostrarConductores(filtered);
};

function abrirModalConductor(f = null) {
    document.getElementById('formConductor').reset();
    document.getElementById('c_foto_base64').value = "";
    document.getElementById('c_foto_preview').src = "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20120%20120'%3E%3Ccircle%20cx%3D'60'%20cy%3D'60'%20r%3D'60'%20fill%3D'%23e2e8f0'%2F%3E%3Ccircle%20cx%3D'60'%20cy%3D'45'%20r%3D'22'%20fill%3D'%2394a3b8'%2F%3E%3Cellipse%20cx%3D'60'%20cy%3D'105'%20rx%3D'38'%20ry%3D'32'%20fill%3D'%2394a3b8'%2F%3E%3C%2Fsvg%3E";

    var colorMap = { 'Activo': '#2563eb', 'Cesado': '#64748b', 'Bloqueado': '#dc2626' };
    const camposText   = ['c_nombre', 'c_empresa', 'c_telefono', 'c_dni', 'c_licencia'];
    const camposSelect = ['c_estado'];
    var hdr = document.getElementById('cond-modal-header');
    if (hdr) hdr.classList.remove('verde', 'gris', 'rojo');

    if (f) {
        const limpiar = t => t ? t.toString().replace(/ñ/g, 'ñ').replace(/Ã'/g, 'Ñ') : "";
        var nombre   = toTitleCase(limpiar(f.nombre || ''));
        var empresa  = f.empresa || '';
        var telf     = f.telefono ? f.telefono.toString().replace(/[^0-9]/g, '') : '';
        var estado   = f.estado || 'Activo';
        var colorEst = colorMap[estado] || '#2563eb';
        var parts    = nombre.trim().split(/\s+/);
        var initials = ((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '');

        // Header color según estado
        if (hdr) {
            if (estado === 'Activo')    hdr.classList.add('verde');
            else if (estado === 'Cesado')    hdr.classList.add('gris');
            else if (estado === 'Bloqueado') hdr.classList.add('rojo');
        }
        var iconEl = document.getElementById('cond-modal-icon');
        if (iconEl) iconEl.innerHTML = '<i class="bi bi-person-badge-fill"></i>';
        var subtEl = document.getElementById('cond-modal-subt');
        if (subtEl) subtEl.textContent = 'Ficha de Personal';
        var titEl = document.getElementById('tituloModalConductor');
        if (titEl) titEl.textContent = nombre || 'Conductor';

        // Hero ficha (modo vista)
        var hero = document.getElementById('cond-ficha-hero');
        if (hero) hero.style.display = 'flex';
        var avatarHero = document.getElementById('cond-ficha-avatar-hero');
        if (avatarHero) {
            avatarHero.textContent = initials.toUpperCase() || '?';
            avatarHero.style.background = colorEst;
        }
        var nombreHero = document.getElementById('cond-ficha-nombre-hero');
        if (nombreHero) nombreHero.textContent = nombre || '—';
        var empHero = document.getElementById('cond-ficha-emp-hero');
        if (empHero) empHero.textContent = empresa || '—';
        var badgesHero = document.getElementById('cond-ficha-badges-hero');
        if (badgesHero) {
            var badgeBg  = estado === 'Activo' ? '#dcfce7' : estado === 'Bloqueado' ? '#fee2e2' : '#f1f5f9';
            var badgeClr = estado === 'Activo' ? '#15803d' : estado === 'Bloqueado' ? '#dc2626' : '#475569';
            badgesHero.innerHTML = '<span style="display:inline-block;font-size:.6rem;font-weight:800;padding:2px 9px;border-radius:99px;background:' + badgeBg + ';color:' + badgeClr + ';text-transform:uppercase;letter-spacing:.06em;">' + estado + '</span>';
        }

        // Botones contacto
        var telRow = document.getElementById('cond-ficha-tel-row');
        if (telRow) {
            if (telf.length >= 9) {
                telRow.style.display = 'flex';
                var btnTel = document.getElementById('cond-ficha-btn-tel');
                if (btnTel) btnTel.href = 'tel:' + telf;
                var btnWsp = document.getElementById('cond-ficha-btn-wsp');
                if (btnWsp) btnWsp.href = 'https://wa.me/51' + telf;
            } else {
                telRow.style.display = 'none';
            }
        }

        // Avatar edit oculto en modo vista
        var avatarEdit = document.getElementById('cond-avatar-edit');
        if (avatarEdit) avatarEdit.style.display = 'none';

        // Rellenar campos (para edición posterior)
        document.getElementById('c_id').value       = f.idConductor;
        document.getElementById('c_nombre').value   = nombre;
        document.getElementById('c_empresa').value  = empresa;
        document.getElementById('c_telefono').value = f.telefono || "";
        document.getElementById('c_dni').value      = f.dni || "";
        document.getElementById('c_licencia').value = f.licencia || "";
        document.getElementById('c_estado').value   = estado;
        if (f.foto) {
            document.getElementById('c_foto_preview').src = f.foto;
            document.getElementById('c_foto_base64').value = f.foto;
        }

        camposText.forEach(id => document.getElementById(id).readOnly = true);
        camposSelect.forEach(id => document.getElementById(id).disabled = true);
        document.getElementById('c_foto_preview').style.pointerEvents = 'none';

        document.getElementById('btnEditarConductor').style.display = window.checkPerm('cond', 'e') ? 'inline-block' : 'none';
        document.getElementById('btnGuardarConductor').style.display = 'none';

    } else {
        // Modo nuevo
        var iconElN = document.getElementById('cond-modal-icon');
        if (iconElN) iconElN.innerHTML = '<i class="bi bi-person-plus-fill"></i>';
        var subtElN = document.getElementById('cond-modal-subt');
        if (subtElN) subtElN.textContent = 'Directorio de Personal';
        var titElN = document.getElementById('tituloModalConductor');
        if (titElN) titElN.textContent = 'Nuevo Personal';

        var heroN = document.getElementById('cond-ficha-hero');
        if (heroN) heroN.style.display = 'none';
        var telRowN = document.getElementById('cond-ficha-tel-row');
        if (telRowN) telRowN.style.display = 'none';
        var avatarEditN = document.getElementById('cond-avatar-edit');
        if (avatarEditN) avatarEditN.style.display = 'block';

        document.getElementById('c_id').value = "";
        camposText.forEach(id => document.getElementById(id).readOnly = false);
        camposSelect.forEach(id => document.getElementById(id).disabled = false);
        document.getElementById('c_foto_preview').style.pointerEvents = 'auto';

        document.getElementById('btnEditarConductor').style.display = 'none';
        document.getElementById('btnGuardarConductor').style.display = 'inline-block';
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalConductor')).show();
}

function activarEdicionConductor() {
    const camposText   = ['c_nombre', 'c_empresa', 'c_telefono', 'c_dni', 'c_licencia'];
    const camposSelect = ['c_estado'];

    camposText.forEach(id => document.getElementById(id).readOnly = false);
    camposSelect.forEach(id => document.getElementById(id).disabled = false);
    document.getElementById('c_foto_preview').style.pointerEvents = 'auto';

    // Cambiar a modo edición: ocultar hero, mostrar avatar editable
    var hero = document.getElementById('cond-ficha-hero');
    if (hero) hero.style.display = 'none';
    var telRow = document.getElementById('cond-ficha-tel-row');
    if (telRow) telRow.style.display = 'none';
    var avatarEdit = document.getElementById('cond-avatar-edit');
    if (avatarEdit) avatarEdit.style.display = 'block';

    // Restaurar header a azul (modo edición)
    var hdr = document.getElementById('cond-modal-header');
    if (hdr) hdr.classList.remove('verde', 'gris', 'rojo');
    var subtEl = document.getElementById('cond-modal-subt');
    if (subtEl) subtEl.textContent = 'Editando Personal';

    document.getElementById('btnEditarConductor').style.display = 'none';
    document.getElementById('btnGuardarConductor').style.display = 'inline-block';
}

function previsualizarFotoConductor(input) {
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('c_foto_preview').src = e.target.result;
            document.getElementById('c_foto_base64').value = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function guardarConductor(event, formObj) {
    event.preventDefault();
    var isNew = !document.getElementById('c_id').value;
    var reqPerm = isNew ? 'c' : 'e';
    if (!window.guardAction('cond', reqPerm)) return;
    const btn = document.getElementById('btnGuardarConductor');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';

    let datos = {
        idConductor: document.getElementById('c_id').value,
        c_nombre: document.getElementById('c_nombre').value,
        c_empresa: document.getElementById('c_empresa').value,
        c_telefono: document.getElementById('c_telefono').value,
        c_dni: document.getElementById('c_dni').value,
        c_licencia: document.getElementById('c_licencia').value,
        c_estado: document.getElementById('c_estado').value,
        c_foto_base64: document.getElementById('c_foto_base64').value
    };

    fetch('/api/script/guardarConductor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [datos] })
    })
    .then(res => res.json())
    .then(r => {
        if (r.data === 'Éxito') {
            bootstrap.Modal.getInstance(document.getElementById('modalConductor')).hide();
            recargarModulo('conductores');
        } else {
            alert("Error: " + r.data);
        }
        btn.disabled = false;
        btn.innerHTML = 'Guardar Personal';
    }).catch(e => {
        alert("Error: " + e.message);
        btn.disabled = false;
        btn.innerHTML = 'Guardar Personal';
    });
}

// ================================================================
// 🎯 MÓDULO INIT Y EXPOSICIÓN GLOBAL
// ================================================================
window.dataGlobalConductores = dataGlobalConductores;

function _cargarClientesCond() {
    fetch('/api/almacen/clientes-placas')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var dl = document.getElementById('dl-clientes');
            if (!dl) return;
            dl.innerHTML = (data || []).map(function(c) {
                return '<option value="' + (c || '').replace(/"/g, '&quot;') + '">';
            }).join('');
        })
        .catch(function() {});
}

window.init_conductores = function() {
    if (!window.checkPerm('cond', 'l')) {
        window.showNoPermMsg('moduloConductores');
        return;
    }
    var btnNuevo = document.querySelector('#moduloConductores .btn-primary[onclick*="abrirModalConductor"]');
    if (btnNuevo) btnNuevo.style.display = window.checkPerm('cond','c') ? '' : 'none';
    var btnImportar = document.querySelector('#moduloConductores .btn-outline-info');
    if (btnImportar) btnImportar.style.display = window.checkPerm('cond','c') ? '' : 'none';
    // Carga directa vía REST (evita race condition con GoogleRunner en primera visita)
    var tbody = document.getElementById('cuerpoTablaConductores');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Cargando...</td></tr>';
    fetch('/api/conductores')
        .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(data) {
            CACHE['conductores'] = data;
            window._masterConductores = data.slice();
            mostrarConductores(data);
        })
        .catch(function(err) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-danger">Error: '+err.message+'</td></tr>';
        });
    _cargarClientesCond();
};

// ── Importación masiva ────────────────────────────────────────────
window.descargarPlantillaConductores = function() {
    var wb = XLSX.utils.book_new();
    var filas = [
        ['Nombre Completo','Empresa','Teléfono','DNI','Licencia','Estado'],
        ['JUAN PEREZ GARCIA','EMPRESA SAC','+51 999 000 111','12345678','B-IIb','Activo']
    ];
    var ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = [28,22,16,10,10,10].map(function(w){ return {wch:w}; });
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, 'Plantilla_Personal.xlsx');
};

window.importarExcelConductores = function(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var wb = XLSX.read(e.target.result, { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
            if (!rows.length) { alert('El archivo está vacío.'); return; }
            var payload = rows.map(function(r) {
                return {
                    nombre:   String(r['Nombre Completo'] || r.nombre   || '').trim().toUpperCase(),
                    empresa:  String(r['Empresa']         || r.empresa  || '').trim().toUpperCase(),
                    telefono: String(r['Teléfono']        || r['Telefono'] || r.telefono || '').trim(),
                    dni:      String(r['DNI']             || r.dni      || '').trim(),
                    licencia: String(r['Licencia']        || r.licencia || '').trim().toUpperCase(),
                    estado:   String(r['Estado']          || r.estado   || 'Activo').trim()
                };
            }).filter(function(r) { return r.nombre; });
            if (!payload.length) { alert('No se encontraron filas con Nombre válido.'); return; }
            if (!confirm('Se importarán '+payload.length+' personas. ¿Continuar?')) return;
            fetch('/api/conductores/importarMasivo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conductores: payload })
            })
            .then(function(r) { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
            .then(function(res) {
                alert('Importados: '+res.insertados+' nuevos'+(res.errores?' ('+res.errores+' con error)':'')+'.');
                CACHE['conductores'] = null;
                if (typeof cargarModulo === 'function') cargarModulo('conductores', mostrarConductores, 'obtenerDatosConductores');
            })
            .catch(function(err) { alert('Error: '+err.message); });
        } catch(ex) { alert('Error leyendo Excel: '+ex.message); }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
};
