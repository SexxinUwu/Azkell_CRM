// ================================================================
// MÓDULO ALMACÉN / ALMACENES — Lógica SPA Aislada
// ================================================================

(function() {
    'use strict';

    window._almacenesData = window._almacenesData || [];
    window._almacenesFiltrados = window._almacenesFiltrados || [];

    window.init_almacenes = window.init_almacenes_config = function() {
        window.cargarAlmacenesConfig();
    };

    window.cargarAlmacenesConfig = function() {
        var tbody = document.getElementById('cuerpo-tabla-almacenes');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="spinner-border spinner-border-sm me-2"></div>Cargando almacenes…</td></tr>';
        
        fetch('/api/almacen/almacenes')
            .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function(data) {
                var list = Array.isArray(data) ? data : [];
                if (!list.length) {
                    list = [{ id: 1, nombre: 'Principal', descripcion: 'Almacén Principal Central del ERP', es_sistema: 1, activo: 1, orden: 1 }];
                }
                window._almacenesData = list;
                window._almacenesFiltrados = window._almacenesData;
                window.filtrarAlmacenesConfig();
            })
            .catch(function(err) {
                window._almacenesData = [{ id: 1, nombre: 'Principal', descripcion: 'Almacén Principal Central del ERP', es_sistema: 1, activo: 1, orden: 1 }];
                window._almacenesFiltrados = window._almacenesData;
                window.renderTablaAlmacenesConfig();
            });
    };

    window.filtrarAlmacenesConfig = function() {
        var q = (document.getElementById('alm-buscar')?.value || '').toLowerCase().trim();
        window._almacenesFiltrados = window._almacenesData.filter(function(a) {
            return !q || (a.nombre || '').toLowerCase().includes(q) || (a.descripcion || '').toLowerCase().includes(q);
        });
        window.renderTablaAlmacenesConfig();
    };

    window.renderTablaAlmacenesConfig = function() {
        var tbody = document.getElementById('cuerpo-tabla-almacenes');
        var cont = document.getElementById('alm-contador');
        var data = window._almacenesFiltrados;

        if (cont) cont.textContent = data.length + ' almacén(es)';
        if (!tbody) return;

        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No se encontraron almacenes</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(function(alm) {
            var esSistema = alm.es_sistema == 1 || (alm.nombre || '').toLowerCase() === 'principal';
            var badgeTipo = esSistema ? '<span class="badge bg-primary text-white rounded-pill px-2 py-0.5" style="font-size:0.7rem;"><i class="bi bi-lock-fill me-1"></i>Sistema</span>' : '<span class="badge bg-light text-secondary border rounded-pill px-2 py-0.5" style="font-size:0.7rem;">Personalizado</span>';
            var badgeEstado = alm.activo == 1 ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-0.5" style="font-size:0.72rem;">Activo</span>' : '<span class="badge bg-secondary-subtle text-secondary border rounded-pill px-2 py-0.5" style="font-size:0.72rem;">Inactivo</span>';

            var btnEditar = `<button class="btn btn-sm btn-light border py-0 px-2 text-primary" onclick="window.abrirModalAlmacenConfig(${alm.id})" title="Editar"><i class="bi bi-pencil"></i></button>`;
            var btnEliminar = esSistema ? `<button class="btn btn-sm btn-light border py-0 px-2 text-muted" disabled title="El almacén Principal no se puede eliminar"><i class="bi bi-lock"></i></button>` : `<button class="btn btn-sm btn-light border py-0 px-2 text-danger" onclick="window.eliminarAlmacenConfig(${alm.id}, '${alm.nombre}')" title="Eliminar"><i class="bi bi-trash"></i></button>`;

            return `
            <tr>
                <td class="ps-3 fw-bold text-dark"><i class="bi bi-building me-2 text-primary"></i>${alm.nombre}</td>
                <td class="text-secondary">${alm.descripcion || '<span class="text-muted fst-italic">Sin descripción</span>'}</td>
                <td>${badgeTipo}</td>
                <td class="text-center">${badgeEstado}</td>
                <td class="pe-3 text-end">
                    <div class="d-inline-flex gap-1">
                        ${btnEditar}
                        ${btnEliminar}
                    </div>
                </td>
            </tr>
            `;
        }).join('');
    };

    window.abrirModalAlmacenConfig = function(id) {
        var modalEl = document.getElementById('modal-almacen-config');
        var form = document.getElementById('form-almacen-config');
        if (!modalEl || !form) return;

        form.reset();
        document.getElementById('alm-edit-id').value = id || '';
        var inputNombre = document.getElementById('alm-f-nombre');
        var helpNombre = document.getElementById('alm-f-nombre-help');

        if (id) {
            var item = window._almacenesData.find(function(x) { return x.id == id; });
            if (item) {
                document.getElementById('modal-alm-titulo').innerHTML = '<i class="bi bi-pencil-square me-1 text-primary"></i>Editar Almacén';
                inputNombre.value = item.nombre || '';
                document.getElementById('alm-f-descripcion').value = item.descripcion || '';
                document.getElementById('alm-f-activo').value = item.activo != null ? item.activo : '1';

                var esSistema = item.es_sistema == 1 || (item.nombre || '').toLowerCase() === 'principal';
                if (esSistema) {
                    inputNombre.readOnly = true;
                    if (helpNombre) helpNombre.textContent = '🔒 El nombre del almacén Principal está protegido por el sistema.';
                } else {
                    inputNombre.readOnly = false;
                    if (helpNombre) helpNombre.textContent = '';
                }
            }
        } else {
            document.getElementById('modal-alm-titulo').innerHTML = '<i class="bi bi-building me-1 text-primary"></i>Nuevo Almacén';
            inputNombre.readOnly = false;
            if (helpNombre) helpNombre.textContent = '';
        }

        var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    };

    window.guardarAlmacenConfig = function(e) {
        if (e) e.preventDefault();
        var id = document.getElementById('alm-edit-id')?.value;
        var nombre = document.getElementById('alm-f-nombre')?.value.trim();
        var descripcion = document.getElementById('alm-f-descripcion')?.value.trim();
        var activo = document.getElementById('alm-f-activo')?.value;

        if (!nombre) { alert('El nombre es obligatorio'); return; }

        var url = id ? '/api/almacen/almacenes/' + id : '/api/almacen/almacenes';
        var method = id ? 'PUT' : 'POST';

        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nombre, descripcion: descripcion, activo: parseInt(activo, 10), usuario: localStorage.getItem('fleet_user') })
        })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res.error) { alert('Error: ' + res.error); return; }
            var modalEl = document.getElementById('modal-almacen-config');
            if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
            window.cargarAlmacenesConfig();
        })
        .catch(function(err) { alert('Error de conexión: ' + err.message); });
    };

    window.eliminarAlmacenConfig = function(id, nombre) {
        if (!confirm(`¿Estás seguro de eliminar el almacén "${nombre}"?`)) return;

        fetch('/api/almacen/almacenes/' + id, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: localStorage.getItem('fleet_user') })
        })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res.error) { alert('Error: ' + res.error); return; }
            window.cargarAlmacenesConfig();
        })
        .catch(function(err) { alert('Error: ' + err.message); });
    };

    window.init_almacenes();
})();
