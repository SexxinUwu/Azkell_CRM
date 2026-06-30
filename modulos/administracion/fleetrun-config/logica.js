window.init_fleetrun_config = function() {
    cargarFleetrunConfig();
};

window.cargarFleetrunConfig = function() {
    let swalFire = (typeof Swal !== 'undefined') ? Swal.fire : function(){};
    let swalClose = (typeof Swal !== 'undefined') ? Swal.close : function(){};
    let swalShowLoading = (typeof Swal !== 'undefined') ? Swal.showLoading : function(){};

    swalFire({ title: 'Cargando...', allowOutsideClick: false, didOpen: () => { swalShowLoading(); }});
    fetch('/api/configuracion')
        .then(r => r.json())
        .then(data => {
            swalClose();
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
            if(typeof Swal !== 'undefined') Swal.fire('Error', 'Error cargando configuración', 'error');
            else alert('Error cargando configuración');
        });
};

window.renderFleetrunConfigUtsTable = function(umbrales) {
    let tbody = document.getElementById('fleetrunConfigUtsTbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    let keys = Object.keys(umbrales);
    if(keys.length === 0) {
        addFleetrunConfigUtsRow('Nacional', 2000, 'KM');
        addFleetrunConfigUtsRow('Local', 100, 'HORAS');
    } else {
        keys.forEach(k => {
            let partes = k.split('_');
            let metrica = 'KM';
            let utsN = k;
            if (partes.length > 1 && (partes[partes.length-1] === 'KM' || partes[partes.length-1] === 'HORAS')) {
                metrica = partes.pop();
                utsN = partes.join('_');
            }
            addFleetrunConfigUtsRow(utsN, umbrales[k], metrica);
        });
    }
};

window.addFleetrunConfigUtsRow = function(utsNombre = 'Nacional', umbral = 2000, metrica = 'KM') {
    let tbody = document.getElementById('fleetrunConfigUtsTbody');
    if(!tbody) return;
    
    if(!utsNombre) utsNombre = 'Nacional';
    let isNacional = utsNombre.toUpperCase() === 'NACIONAL' ? 'selected' : '';
    let isLocal = utsNombre.toUpperCase() === 'LOCAL' ? 'selected' : '';
    let isOther = !isNacional && !isLocal ? `<option value="${utsNombre}" selected>${utsNombre}</option>` : '';
    let isKm = metrica.toUpperCase() === 'KM' ? 'selected' : '';
    let isHoras = metrica.toUpperCase() === 'HORAS' ? 'selected' : '';

    let tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="ps-4">
            <select class="form-select form-select-sm fleetrun-cfg-uts fw-bold text-primary border-primary">
                <option value="Nacional" ${isNacional}>Nacional</option>
                <option value="Local" ${isLocal}>Local</option>
                ${isOther}
            </select>
        </td>
        <td>
            <select class="form-select form-select-sm fleetrun-cfg-metrica fw-bold text-secondary border-secondary">
                <option value="KM" ${isKm}>KMs</option>
                <option value="HORAS" ${isHoras}>Horas</option>
            </select>
        </td>
        <td>
            <div class="badge bg-danger bg-opacity-10 text-danger border border-danger w-100 p-2 text-start fs-6">
                <i class="bi bi-exclamation-circle-fill me-1"></i> &le; 0
            </div>
        </td>
        <td>
            <div class="d-flex align-items-center bg-warning bg-opacity-10 text-dark border border-warning rounded p-1 w-100">
                <span class="ms-1 me-2 fw-bold text-warning-emphasis">> 0 y &le;</span>
                <input type="number" class="form-control form-control-sm fleetrun-cfg-umbral fw-bold text-center" style="max-width: 100px;" value="${umbral}" oninput="updateFleetrunCfgIndicators(this)">
            </div>
        </td>
        <td>
            <div class="badge bg-success bg-opacity-10 text-success border border-success w-100 p-2 text-start fs-6">
                <i class="bi bi-check-circle-fill me-1"></i> > <span class="ind-val">${umbral}</span>
            </div>
        </td>
        <td class="text-center pe-4 align-middle">
            <button class="btn btn-sm btn-outline-danger border-0 rounded-circle" onclick="this.closest('tr').remove()" title="Eliminar fila">
                <i class="bi bi-trash"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
};

window.updateFleetrunCfgIndicators = function(input) {
    let val = input.value || '0';
    let tr = input.closest('tr');
    tr.querySelectorAll('.ind-val').forEach(el => el.textContent = val);
};

window.guardarFleetrunConfig = function() {
    let swalFire = (typeof Swal !== 'undefined') ? Swal.fire : function(title, text){ alert(title + ': ' + text); };
    let swalShowLoading = (typeof Swal !== 'undefined') ? Swal.showLoading : function(){};

    let tbody = document.getElementById('fleetrunConfigUtsTbody');
    if(!tbody) return;
    let trs = tbody.querySelectorAll('tr');
    let umbrales = {};
    let error = false;
    
    trs.forEach(tr => {
        let utsInput = tr.querySelector('.fleetrun-cfg-uts').value.trim().toUpperCase();
        let metricaInput = tr.querySelector('.fleetrun-cfg-metrica').value.toUpperCase();
        let umbralInput = parseFloat(tr.querySelector('.fleetrun-cfg-umbral').value);
        if (utsInput) {
            let key = utsInput + '_' + metricaInput;
            if (isNaN(umbralInput) || umbralInput < 0) {
                error = true;
            } else {
                umbrales[key] = umbralInput;
            }
        }
    });

    if (error) {
        return swalFire('Error', 'Todos los umbrales ingresados deben ser numéricos y mayores a 0.', 'error');
    }

    let payload = {
        fleetrun_uts_umbrales: JSON.stringify(umbrales)
    };

    if(typeof Swal !== 'undefined') Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
    fetch('/api/configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
        if(typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'success',
                title: 'Guardado',
                text: 'Configuración actualizada correctamente',
                timer: 1500,
                showConfirmButton: false
            });
        } else {
            alert('Guardado exitosamente');
        }
        
        // Refrescar variable global si Fleetrun ya está inicializado (opcional)
        if(window._fleetrun_umbrales_uts !== undefined) {
            window._fleetrun_umbrales_uts = umbrales;
        }
    })
    .catch(err => {
        console.error(err);
        if(typeof Swal !== 'undefined') Swal.fire('Error', 'No se pudo guardar la configuración.', 'error');
        else alert('Error: No se pudo guardar la configuración.');
    });
};
