// ================================================================
// 🚗 MÓDULO CONDUCTORES - LÓGICA AISLADA
// ================================================================

var dataGlobalConductores = window.dataGlobalConductores || [];
window.dataGlobalConductores = dataGlobalConductores;
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
    window.dataGlobalConductores = datos;  // expose to global scope
    let html = '';
    let listOpciones = new Set();

    const limpiarN = (txt) => {
        if (!txt) return "";
        return txt.toString().replace(/Ã±/g, 'ñ').replace(/Ã'/g, 'Ñ');
    };

    if (!datos || datos.length === 0) {
        html = '<tr><td colspan="7" class="text-center py-4">No hay personal registrado.</td></tr>';
    } else {
        let mapEstados = new Map();

        datos.forEach(fila => {
            let estado = fila.estado || "Desconocido";
            if (!mapEstados.has(estado)) mapEstados.set(estado, []);
            mapEstados.get(estado).push(fila);

            if(estado.toLowerCase() === 'activo' && fila.nombre) {
                listOpciones.add(toTitleCase(limpiarN(fila.nombre.toString())));
            }
        });

        mapEstados.forEach((registros, estado) => {
            let claseE = normalizarClase(estado.toString());
            if (expandCondMap[claseE] === undefined) expandCondMap[claseE] = expandAllCondState;
            let isExpandido = expandCondMap[claseE];
            let iconClass = isExpandido ? 'bi bi-chevron-down' : 'bi bi-chevron-right';
            let colorEstado = estado === 'Activo' ? 'text-success' : (estado === 'Cesado' ? 'text-secondary' : 'text-danger');

            html += `<tr class="group-header" style="cursor:pointer;" onclick="toggleGroupRowCond('${claseE}')">
                <td colspan="7" class="text-start" style="padding-left: 20px;">
                    <i class="bi ${iconClass} ms-1 me-2 ${colorEstado}"></i>
                    <i class="bi bi-people-fill ${colorEstado} me-2"></i><span class="text-uppercase fw-bold">${estado}</span>
                    <span class="group-count badge bg-secondary ms-2">${registros.length}</span>
                </td>
            </tr>`;

            if (isExpandido) {
                registros.forEach(f => {
                    let nombreLimpio = limpiarN(f.nombre || "-");
                    let nombre = toTitleCase(nombreLimpio);
                    let empresa = f.empresa ? f.empresa.toString().replace(/TERCERO/gi, '3ro') : "-";
                    let telf = f.telefono ? f.telefono.toString().replace(/[^0-9]/g, '') : "";
                    let dni = f.dni ? f.dni.toString() : "-";
                    let licencia = f.licencia ? f.licencia.toString() : "-";

                    let linkTelf = "-";
                    if (telf.length >= 9) {
                        let wspLink = `https://wa.me/51${telf}`;
                        linkTelf = `
                            <div class="d-flex gap-1">
                                <a href="tel:${telf}" class="btn btn-sm btn-outline-primary p-1 px-2 shadow-sm" title="Llamar" onclick="event.stopPropagation();"><i class="bi bi-telephone-fill"></i></a>
                                <a href="${wspLink}" target="_blank" class="btn btn-sm btn-success p-1 px-2 shadow-sm" title="WhatsApp" onclick="event.stopPropagation();"><i class="bi bi-whatsapp"></i></a>
                                <span class="align-self-center ms-1 fw-bold" style="font-size:0.85rem;">${telf}</span>
                            </div>
                        `;
                    } else if (telf) {
                        linkTelf = `<span class="text-muted">${telf}</span>`;
                    }

                    let bEst = estado === 'Activo' ? '<span class="badge bg-success">Activo</span>' : (estado === 'Cesado' ? '<span class="badge bg-secondary">Cesado</span>' : '<span class="badge bg-danger">Bloqueado</span>');
                    let jsonSeguro = JSON.stringify(f).replace(/'/g, "&#39;");

                    html += `<tr class="clickable-row" onclick='abrirModalConductor(${jsonSeguro})'>
                        <td class="fw-bold" style="color: #1e293b;" data-value="${nombre}"><i class="bi bi-person-circle text-muted me-2"></i> ${nombre}</td>
                        <td class="d-none" data-value="${empresa}">${empresa}</td>
                        <td class="d-none" data-value="${licencia}">${licencia}</td>
                        <td data-value="${telf}">${linkTelf}</td>
                        <td class="d-none" data-value="${estado}">${estado}</td>
                        <td></td>
                    </tr>`;
                });
            }
        });
    }

    document.getElementById('cuerpoTablaConductores').innerHTML = html;
    rellenarDatalist('dl-conductores', listOpciones);
}

function abrirModalConductor(f = null) {
    document.getElementById('formConductor').reset();
    document.getElementById('c_foto_base64').value = "";
    document.getElementById('c_foto_preview').src = "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20120%20120'%3E%3Ccircle%20cx%3D'60'%20cy%3D'60'%20r%3D'60'%20fill%3D'%23e2e8f0'%2F%3E%3Ccircle%20cx%3D'60'%20cy%3D'45'%20r%3D'22'%20fill%3D'%2394a3b8'%2F%3E%3Cellipse%20cx%3D'60'%20cy%3D'105'%20rx%3D'38'%20ry%3D'32'%20fill%3D'%2394a3b8'%2F%3E%3C%2Fsvg%3E";

    const camposText = ['c_nombre', 'c_empresa', 'c_telefono', 'c_dni', 'c_licencia'];
    const camposSelect = ['c_estado'];

    if (f) {
        document.getElementById('tituloModalConductor').innerHTML = '<i class="bi bi-person-badge"></i> Ficha de Personal';

        const limpiar = t => t ? t.toString().replace(/Ã±/g, 'ñ').replace(/Ã'/g, 'Ñ') : "";

        document.getElementById('c_id').value = f.idConductor;
        document.getElementById('c_nombre').value = toTitleCase(limpiar(f.nombre));
        document.getElementById('c_empresa').value = f.empresa || "";
        document.getElementById('c_telefono').value = f.telefono || "";
        document.getElementById('c_dni').value = f.dni || "";
        document.getElementById('c_licencia').value = f.licencia || "";
        document.getElementById('c_estado').value = f.estado || "Activo";
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
        document.getElementById('tituloModalConductor').innerHTML = '<i class="bi bi-person-plus-fill"></i> Nuevo Personal';
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
    const camposText = ['c_nombre', 'c_empresa', 'c_telefono', 'c_dni', 'c_licencia'];
    const camposSelect = ['c_estado'];

    camposText.forEach(id => document.getElementById(id).readOnly = false);
    camposSelect.forEach(id => document.getElementById(id).disabled = false);
    document.getElementById('c_foto_preview').style.pointerEvents = 'auto';

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
