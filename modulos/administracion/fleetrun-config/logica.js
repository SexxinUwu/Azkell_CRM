window.init_fleetrun_config = function() {
    cargarFleetrunConfig();
};

window.cargarFleetrunConfig = function() {
    Swal.fire({ title: 'Cargando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
    fetch('/api/configuracion')
        .then(r => r.json())
        .then(data => {
            Swal.close();
            let config = data['fleetrun_uts_umbrales'] || '{}';
            let umbrales = {};
            try {
                umbrales = JSON.parse(config);
            } catch(e) {
                umbrales = {};
            }
            renderFleetrunConfigUtsTable(umbrales);
        })
        .catch(err => {
            console.error(err);
            Swal.fire('Error', 'Error cargando configuración', 'error');
        });
};

window.renderFleetrunConfigUtsTable = function(umbrales) {
    let tbody = document.getElementById('fleetrunConfigUtsTbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    let keys = Object.keys(umbrales);
    if(keys.length === 0) {
        // Al menos una fila vacía por defecto
        addFleetrunConfigUtsRow('', 2000);
    } else {
        keys.forEach(k => {
            addFleetrunConfigUtsRow(k, umbrales[k]);
        });
    }
};

window.addFleetrunConfigUtsRow = function(utsNombre = '', umbral = 2000) {
    let tbody = document.getElementById('fleetrunConfigUtsTbody');
    if(!tbody) return;
    let tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="ps-4">
            <input type="text" class="form-control form-control-sm fleetrun-cfg-uts" placeholder="Ej: Nacional" value="${utsNombre}">
        </td>
        <td>
            <input type="number" class="form-control form-control-sm fleetrun-cfg-umbral" placeholder="2000" value="${umbral}">
        </td>
        <td class="text-center pe-4">
            <button class="btn btn-sm btn-outline-danger border-0 rounded-circle" onclick="this.closest('tr').remove()" title="Eliminar fila">
                <i class="bi bi-trash"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
};

window.guardarFleetrunConfig = function() {
    let tbody = document.getElementById('fleetrunConfigUtsTbody');
    if(!tbody) return;
    let trs = tbody.querySelectorAll('tr');
    let umbrales = {};
    let error = false;
    
    trs.forEach(tr => {
        let utsInput = tr.querySelector('.fleetrun-cfg-uts').value.trim().toUpperCase();
        let umbralInput = parseFloat(tr.querySelector('.fleetrun-cfg-umbral').value);
        if (utsInput) {
            if (isNaN(umbralInput) || umbralInput < 0) {
                error = true;
            } else {
                umbrales[utsInput] = umbralInput;
            }
        }
    });

    if (error) {
        return Swal.fire('Error', 'Todos los umbrales ingresados deben ser numéricos y mayores a 0.', 'error');
    }

    let payload = {
        fleetrun_uts_umbrales: JSON.stringify(umbrales)
    };

    Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
    fetch('/api/configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
        Swal.fire({
            icon: 'success',
            title: 'Guardado',
            text: 'Configuración actualizada correctamente',
            timer: 1500,
            showConfirmButton: false
        });
        
        // Refrescar variable global si Fleetrun ya está inicializado (opcional)
        if(window._fleetrun_umbrales_uts !== undefined) {
            window._fleetrun_umbrales_uts = umbrales;
        }
    })
    .catch(err => {
        console.error(err);
        Swal.fire('Error', 'No se pudo guardar la configuración.', 'error');
    });
};
