window.init_mantenimiento_personal = function() {
    ptCargarLista();
};

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
                tr.innerHTML = `
                    <td>${p.id}</td>
                    <td><strong>${p.nombre}</strong></td>
                    <td>S/ ${parseFloat(p.sueldo_mensual || 0).toFixed(2)}</td>
                    <td>S/ ${parseFloat(p.costo_hora || 0).toFixed(2)}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="ptEditar(${p.id}, '${p.nombre.replace(/'/g, "\\'")}', ${p.sueldo_mensual}, ${p.costo_hora})"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="ptEliminar(${p.id})"><i class="bi bi-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        })
        .catch(err => console.error('Error cargando personal:', err));
}

function ptAbrirModal() {
    document.getElementById('pt-id').value = '';
    document.getElementById('pt-nombre').value = '';
    document.getElementById('pt-sueldo').value = '';
    document.getElementById('pt-costo').value = '';
    document.getElementById('ptModalTitle').innerText = 'Nuevo Personal';
    var myModal = new bootstrap.Modal(document.getElementById('ptModal'));
    myModal.show();
}

function ptEditar(id, nombre, sueldo, costo) {
    document.getElementById('pt-id').value = id;
    document.getElementById('pt-nombre').value = nombre;
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
        alert('Por favor ingrese el nombre del técnico.');
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
            // Cerrar modal
            const modalEl = document.getElementById('ptModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            
            // Recargar lista
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
