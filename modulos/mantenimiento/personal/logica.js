// ================================================================
// Módulo Personal de Taller — Azkell ERP (Apple & Bento ERP)
// Control de Técnicos, Sueldos y Costo por Hora
// ================================================================

window._ptConductoresCache = [];
window._ptListaPersonal = [];

window.init_personal = function() {
    if (!window.checkPerm('pers_mant', 'l')) {
        var wrap = document.getElementById('moduloPersonalTaller') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    window.ptCargarSelectConductores();
    window.ptCargarLista();
};

window.init_mantenimiento_personal = window.init_personal;

window.ptCargarSelectConductores = function() {
    return fetch('/api/conductores')
        .then(function(res) { return res.json(); })
        .then(function(data) {
            var lista = Array.isArray(data) ? data : (data.data || []);
            window._ptConductoresCache = lista;
        })
        .catch(function(err) { console.error('Error cargando conductores:', err); });
};

function ptLlenarSelect() {
    var items = (window._ptConductoresCache || []).map(function(c) {
        var nom = (c.nombre_completo || c.nombre || '').trim();
        if (!nom) return null;
        var nFormateado = nom.split(' ').map(function(w) {
            return w ? (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) : '';
        }).join(' ');
        var label = nFormateado + (c.dni ? (' (DNI: ' + c.dni + ')') : '');
        return { value: nFormateado, label: label };
    }).filter(Boolean);
    
    if (typeof window._cbInit === 'function') {
        window._cbInit('pt-nombre', items, 'Buscar personal...');
    }
}

window.ptCargarLista = function() {
    var tbody = document.getElementById('pt-tbody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-success me-2"></div>Cargando personal...</td></tr>';
    }

    fetch('/api/taller-personal')
        .then(function(res) { return res.json(); })
        .then(function(data) {
            window._ptListaPersonal = Array.isArray(data) ? data : [];
            window.ptActualizarKPIs(window._ptListaPersonal);
            window.ptRenderTabla(window._ptListaPersonal);
        })
        .catch(function(err) {
            console.error('Error cargando personal:', err);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger"><i class="bi bi-exclamation-circle me-2"></i>Error al cargar personal</td></tr>';
            }
        });
};

window.ptActualizarKPIs = function(lista) {
    var total = lista.length;
    var sumaSueldos = 0;
    var sumaCostos = 0;

    lista.forEach(function(p) {
        sumaSueldos += parseFloat(p.sueldo_mensual || 0);
        sumaCostos += parseFloat(p.costo_hora || 0);
    });

    var promSueldo = total > 0 ? (sumaSueldos / total) : 0;
    var promCosto = total > 0 ? (sumaCostos / total) : 0;

    var elTotal = document.getElementById('pt-kpi-total');
    if (elTotal) elTotal.textContent = total;

    var elCosto = document.getElementById('pt-kpi-costo-prom');
    if (elCosto) elCosto.textContent = 'S/ ' + promCosto.toFixed(2);

    var elSueldo = document.getElementById('pt-kpi-sueldo-prom');
    if (elSueldo) elSueldo.textContent = 'S/ ' + promSueldo.toFixed(2);
};

window.ptFiltrar = function(q) {
    var query = (q != null ? String(q) : ((document.getElementById('pt-busqueda') || {}).value || '')).trim().toLowerCase();
    if (!query) {
        window.ptRenderTabla(window._ptListaPersonal || []);
        return;
    }
    var filtrados = (window._ptListaPersonal || []).filter(function(p) {
        return String(p.id).toLowerCase().indexOf(query) !== -1 ||
               (p.nombre || '').toLowerCase().indexOf(query) !== -1;
    });
    window.ptRenderTabla(filtrados);
};

window.ptRenderTabla = function(lista) {
    var tbody = document.getElementById('pt-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted"><i class="bi bi-person-x fs-3 d-block mb-2 text-muted"></i>No hay personal de taller registrado.</td></tr>';
        return;
    }

    lista.forEach(function(p) {
        var tr = document.createElement('tr');
        var inicial = (p.nombre || 'T').trim().charAt(0).toUpperCase();
        var sueldoFmt = parseFloat(p.sueldo_mensual || 0).toFixed(2);
        var costoFmt = parseFloat(p.costo_hora || 0).toFixed(2);
        var nombreEsc = (p.nombre || '').replace(/'/g, "\\'");

        tr.innerHTML = 
            '<td><span class="badge bg-light border text-secondary fw-bold px-2 py-1" style="font-size:0.75rem;">#' + p.id + '</span></td>' +
            '<td>' +
                '<div class="d-flex align-items-center gap-2">' +
                    '<div class="pt-avatar">' + inicial + '</div>' +
                    '<span class="fw-bold text-dark" style="font-size:0.9rem;">' + (p.nombre || '—') + '</span>' +
                '</div>' +
            '</td>' +
            '<td>' +
                '<span class="badge rounded-pill fw-bold text-success" style="background:#ecfdf5; border:1px solid #a7f3d0; font-size:0.82rem; padding:5px 12px;">' +
                    'S/ ' + sueldoFmt +
                '</span>' +
            '</td>' +
            '<td>' +
                '<span class="badge rounded-pill fw-bold text-primary" style="background:#eff6ff; border:1px solid #bfdbfe; font-size:0.82rem; padding:5px 12px;">' +
                    'S/ ' + costoFmt + ' / h' +
                '</span>' +
            '</td>' +
            '<td class="text-end">' +
                '<div class="d-inline-flex align-items-center gap-1">' +
                    '<button type="button" class="btn btn-sm btn-light border shadow-2xs rounded-3 text-primary p-1 px-2" onclick="window.ptEditar(' + p.id + ', \'' + nombreEsc + '\', ' + p.sueldo_mensual + ', ' + p.costo_hora + ')" title="Editar">' +
                        '<i class="bi bi-pencil-square"></i>' +
                    '</button>' +
                    '<button type="button" class="btn btn-sm btn-light border shadow-2xs rounded-3 text-danger p-1 px-2" onclick="window.ptEliminar(' + p.id + ')" title="Eliminar">' +
                        '<i class="bi bi-trash3"></i>' +
                    '</button>' +
                '</div>' +
            '</td>';
        tbody.appendChild(tr);
    });
};

window.ptAbrirModal = function() {
    document.getElementById('pt-id').value = '';
    document.getElementById('pt-sueldo').value = '';
    document.getElementById('pt-costo').value = '';
    document.getElementById('ptModalTitle').innerText = 'Registrar Técnico';
    
    if (typeof window._cbReset === 'function') window._cbReset('pt-nombre');
    var txtBox = document.getElementById('pt-nombre-txt');
    if (txtBox) txtBox.value = '';
    var hiddenVal = document.getElementById('pt-nombre');
    if (hiddenVal) hiddenVal.value = '';

    if (!window._ptConductoresCache || window._ptConductoresCache.length === 0) {
        window.ptCargarSelectConductores().then(function() {
            ptLlenarSelect();
        });
    } else {
        ptLlenarSelect();
    }

    var myModal = new bootstrap.Modal(document.getElementById('ptModal'));
    myModal.show();
};

window.ptEditar = function(id, nombre, sueldo, costo) {
    document.getElementById('pt-id').value = id;
    
    if (!window._ptConductoresCache || window._ptConductoresCache.length === 0) {
        window.ptCargarSelectConductores().then(function() {
            ptLlenarSelect();
            ptEditarAsignar(nombre, sueldo, costo);
        });
    } else {
        ptLlenarSelect();
        ptEditarAsignar(nombre, sueldo, costo);
    }
};

function ptEditarAsignar(nombre, sueldo, costo) {
    if (typeof window._cbSet === 'function') {
        window._cbSet('pt-nombre', nombre, nombre);
    } else {
        var txtBox = document.getElementById('pt-nombre-txt');
        if (txtBox) txtBox.value = nombre;
    }
    
    document.getElementById('pt-sueldo').value = parseFloat(sueldo || 0).toFixed(2);
    document.getElementById('pt-costo').value = parseFloat(costo || 0).toFixed(2);
    document.getElementById('ptModalTitle').innerText = 'Editar Personal de Taller';
    var myModal = new bootstrap.Modal(document.getElementById('ptModal'));
    myModal.show();
}

window.ptCalcularCosto = function() {
    var sueldo = parseFloat(document.getElementById('pt-sueldo').value) || 0;
    var costoHora = sueldo > 0 ? (sueldo / 208) : 0;
    document.getElementById('pt-costo').value = costoHora.toFixed(2);
};

window.ptGuardar = function() {
    var id = document.getElementById('pt-id').value;
    var nombre = '';
    if (typeof window._cbGetText === 'function') {
        nombre = window._cbGetText('pt-nombre') || document.getElementById('pt-nombre-txt').value.trim();
    } else {
        nombre = document.getElementById('pt-nombre-txt').value.trim();
    }
    
    var sueldo = parseFloat(document.getElementById('pt-sueldo').value) || 0;
    var costo = parseFloat(document.getElementById('pt-costo').value) || 0;

    if (!nombre) {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Por favor seleccione o ingrese el nombre del técnico.', 'danger');
        } else {
            alert('Por favor seleccione o ingrese el nombre del técnico.');
        }
        return;
    }

    var payload = {
        nombre: nombre,
        sueldo_mensual: sueldo,
        costo_hora: costo
    };

    var method = id ? 'PUT' : 'POST';
    var url = id ? ('/api/taller-personal/' + id) : '/api/taller-personal';

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.error) {
            alert('Error al guardar: ' + data.error);
        } else {
            var modalEl = document.getElementById('ptModal');
            var modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('Técnico guardado correctamente', 'success');
            }
            window.ptCargarLista();
        }
    })
    .catch(function(err) {
        console.error('Error:', err);
        alert('Ocurrió un error al guardar.');
    });
};

window.ptEliminar = function(id) {
    if (!confirm('¿Está seguro de eliminar este técnico?')) return;

    fetch('/api/taller-personal/' + id, { method: 'DELETE' })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.error) {
                alert('Error al eliminar: ' + data.error);
            } else {
                if (typeof window.mostrarAlerta === 'function') {
                    window.mostrarAlerta('Técnico eliminado', 'success');
                }
                window.ptCargarLista();
            }
        })
        .catch(function(err) {
            console.error('Error:', err);
            alert('Ocurrió un error al eliminar.');
        });
};
