// ================================================================
// 🚗 MÓDULO CONDUCTORES - LÓGICA AISLADA
// ================================================================

let dataGlobalConductores = [];
let expandCondMap = {};
let expandAllCondState = true;

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
        html = '<tr><td colspan="7" class="text-center py-4">No hay conductores registrados.</td></tr>';
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
    document.getElementById('c_foto_preview').src = "https://via.placeholder.com/120";

    const camposText = ['c_nombre', 'c_empresa', 'c_telefono', 'c_dni', 'c_licencia'];
    const camposSelect = ['c_estado'];

    if (f) {
        document.getElementById('tituloModalConductor').innerHTML = '<i class="bi bi-person-badge"></i> Ficha de Conductor';

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

        document.getElementById('btnEditarConductor').style.display = 'inline-block';
        document.getElementById('btnGuardarConductor').style.display = 'none';

    } else {
        document.getElementById('tituloModalConductor').innerHTML = '<i class="bi bi-person-plus-fill"></i> Nuevo Conductor';
        document.getElementById('c_id').value = "";

        camposText.forEach(id => document.getElementById(id).readOnly = false);
        camposSelect.forEach(id => document.getElementById(id).disabled = false);
        document.getElementById('c_foto_preview').style.pointerEvents = 'auto';

        document.getElementById('btnEditarConductor').style.display = 'none';
        document.getElementById('btnGuardarConductor').style.display = 'inline-block';
    }

    new bootstrap.Modal(document.getElementById('modalConductor')).show();
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
        btn.innerHTML = 'Guardar Conductor';
    }).catch(e => {
        alert("Error: " + e.message);
        btn.disabled = false;
        btn.innerHTML = 'Guardar Conductor';
    });
}

// ================================================================
// 🎯 MÓDULO INIT Y EXPOSICIÓN GLOBAL
// ================================================================
window.dataGlobalConductores = dataGlobalConductores;

window.init_conductores = function() {
    if(typeof cargarModulo === 'function') {
        cargarModulo('conductores', mostrarConductores, 'obtenerDatosConductores');
    }
};
