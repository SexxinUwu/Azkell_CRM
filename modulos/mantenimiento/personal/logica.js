window.init_mantenimiento_personal = function() {
    ptCargarSelectConductores();
    ptCargarLista();
};

window._ptConductoresCache = [];

function ptCargarSelectConductores() {
    return fetch('/api/conductores')
        .then(res => res.json())
        .then(data => {
            const lista = Array.isArray(data) ? data : (data.data || []);
            window._ptConductoresCache = lista;
        })
        .catch(err => console.error('Error cargando conductores:', err));
}

function ptLlenarSelect() {
    const select = document.getElementById('pt-nombre');
    if (!select) return;
    
    // Si ya tiene opciones (además del placeholder), limpiar para evitar duplicados en caso de re-fetch
    select.innerHTML = '<option value="">Seleccione un personal...</option>';
    (window._ptConductoresCache || []).forEach(c => {
        var nom = (c.nombre_completo || c.nombre || '').trim();
        if (!nom) return;
        var nFormateado = nom.split(' ').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '').join(' ');
        
        const opt = document.createElement('option');
        opt.value = nFormateado;
        opt.textContent = nFormateado + (c.dni ? ` (DNI: ${c.dni})` : '');
        select.appendChild(opt);
    });
}

function ptCargarLista() {
    fetch('/api/taller-personal')
        .then(res => res.json())
        .then(data => {
            const tbody = document.getElementById('pt-tbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay personal registrado</td></tr>';
                return;
            }

            data.forEach(p => {
                const tr = document.createElement('tr');
                const inicial = (p.nombre || 'U').charAt(0).toUpperCase();
                tr.innerHTML = `
                    <td><span class="pt-id-badge">#${p.id}</span></td>
                    <td>
                        <div class="pt-avatar-wrapper">
                            <div class="pt-avatar">${inicial}</div>
                            <span class="pt-name">${p.nombre}</span>
                        </div>
                    </td>
                    <td>
                        <div class="pt-money-badge">
                            S/ ${parseFloat(p.sueldo_mensual || 0).toFixed(2)}
                        </div>
                    </td>
                    <td>
                        <div class="pt-money-badge hourly">
                            S/ ${parseFloat(p.costo_hora || 0).toFixed(2)}
                        </div>
                    </td>
                    <td class="text-center">
                        <button class="pt-action-btn edit" onclick="ptEditar(${p.id}, '${p.nombre.replace(/'/g, "\\'")}', ${p.sueldo_mensual}, ${p.costo_hora})" title="Editar">
                            <i class="bi bi-pencil-fill"></i>
                        </button>
                        <button class="pt-action-btn delete" onclick="ptEliminar(${p.id})" title="Eliminar">
                            <i class="bi bi-trash3-fill"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        })
        .catch(err => console.error('Error cargando personal:', err));
}

function ptAbrirModal() {
    document.getElementById('pt-id').value = '';
    document.getElementById('pt-sueldo').value = '';
    document.getElementById('pt-costo').value = '';
    document.getElementById('ptModalTitle').innerText = 'Registrar Técnico';
    
    // Cargar y llenar el select en el momento en que se abre el modal para garantizar que se renderice
    if (!window._ptConductoresCache || window._ptConductoresCache.length === 0) {
        ptCargarSelectConductores().then(() => {
            ptLlenarSelect();
            document.getElementById('pt-nombre').value = '';
        });
    } else {
        ptLlenarSelect();
        document.getElementById('pt-nombre').value = '';
    }

    var myModal = new bootstrap.Modal(document.getElementById('ptModal'));
    myModal.show();
}

function ptEditar(id, nombre, sueldo, costo) {
    document.getElementById('pt-id').value = id;
    
    // Llenar select si no se llenó
    if (!window._ptConductoresCache || window._ptConductoresCache.length === 0) {
        ptCargarSelectConductores().then(() => {
            ptLlenarSelect();
            ptEditarAsignar(nombre, sueldo, costo);
        });
    } else {
        ptLlenarSelect();
        ptEditarAsignar(nombre, sueldo, costo);
    }
}

function ptEditarAsignar(nombre, sueldo, costo) {
    const select = document.getElementById('pt-nombre');
    let found = false;
    for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value === nombre) {
            found = true; break;
        }
    }
    if (!found) {
        const opt = document.createElement('option');
        opt.value = nombre;
        opt.textContent = nombre;
        select.appendChild(opt);
    }
    
    select.value = nombre;
    document.getElementById('pt-sueldo').value = parseFloat(sueldo || 0).toFixed(2);
    document.getElementById('pt-costo').value = parseFloat(costo || 0).toFixed(2);
    document.getElementById('ptModalTitle').innerText = 'Editar Personal';
    var myModal = new bootstrap.Modal(document.getElementById('ptModal'));
    myModal.show();
}

function ptCalcularCosto() {
    const sueldo = parseFloat(document.getElementById('pt-sueldo').value) || 0;
    // 208 horas al mes
    const costoHora = sueldo / 208;
    document.getElementById('pt-costo').value = costoHora.toFixed(2);
}

function ptGuardar() {
    const id = document.getElementById('pt-id').value;
    const nombre = document.getElementById('pt-nombre').value.trim();
    const sueldo = parseFloat(document.getElementById('pt-sueldo').value) || 0;
    const costo = parseFloat(document.getElementById('pt-costo').value) || 0;

    if (!nombre) {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Por favor seleccione el técnico.', 'danger');
        } else {
            alert('Por favor seleccione el técnico.');
        }
        return;
    }

    const payload = {
        nombre: nombre,
        sueldo_mensual: sueldo,
        costo_hora: costo
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? '/api/taller-personal/' + id : '/api/taller-personal';

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert('Error al guardar: ' + data.error);
        } else {
            const modalEl = document.getElementById('ptModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            
            ptCargarLista();
        }
    })
    .catch(err => {
        console.error('Error:', err);
        alert('Ocurrió un error al guardar.');
    });
}

function ptEliminar(id) {
    if (!confirm('¿Está seguro de eliminar este técnico?')) return;

    fetch('/api/taller-personal/' + id, {
        method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert('Error al eliminar: ' + data.error);
        } else {
            ptCargarLista();
        }
    })
    .catch(err => {
        console.error('Error:', err);
        alert('Ocurrió un error al eliminar.');
    });
}
