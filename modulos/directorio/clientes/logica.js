// ── Módulo Directorio / Clientes — Lógica Azkell ERP ──────────────────────
window.cliData = [];
window.cliFiltrados = [];
window.cliPaginaActual = 1;
window.cliFilasPorPagina = 30;
window.cliClienteSeleccionado = null;

window.init_clientes = function() {
    window.cliCargar();
};

// ── Cargar Clientes desde Backend ─────────────────────────────────────────────
window.cliCargar = function() {
    var tbody = document.getElementById('cli-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm me-2 text-primary"></div>Cargando clientes...</td></tr>';

    fetch('/api/clientes')
        .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function(data) {
            window.cliData = data || [];
            window.cliFiltrar();
        })
        .catch(function(err) {
            console.error('Error cargando clientes:', err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle me-1"></i>Error al cargar los clientes</td></tr>';
        });
};

// ── Filtrado y Paginación ────────────────────────────────────────────────────
window.cliFiltrar = function() {
    var busqueda = (document.getElementById('cliBuscador')?.value || '').trim().toLowerCase();
    
    window.cliFiltrados = window.cliData.filter(function(c) {
        var matchTxt = !busqueda || 
            (c.razon_social && c.razon_social.toLowerCase().includes(busqueda)) ||
            (c.ruc_dni && c.ruc_dni.toLowerCase().includes(busqueda)) ||
            (c.telefono && c.telefono.toLowerCase().includes(busqueda)) ||
            (c.email && c.email.toLowerCase().includes(busqueda));
        return matchTxt;
    });

    window.cliPaginaActual = 1;
    window.cliActualizarKPIs();
    window.cliRenderTabla();
};

window.cliActualizarKPIs = function() {
    var total = window.cliData.length;
    var activos = window.cliData.filter(function(c) { return (c.estado || '').toLowerCase() === 'activo'; }).length;
    var totalFlota = window.cliData.reduce(function(acc, c) { return acc + (parseInt(c.total_flota) || 0); }, 0);

    var elTotal = document.getElementById('cli-kpi-total');   if (elTotal) elTotal.textContent = total;
    var elAct = document.getElementById('cli-kpi-activos');   if (elAct) elAct.textContent = activos;
    var elFlota = document.getElementById('cli-kpi-flota');  if (elFlota) elFlota.textContent = totalFlota;
};

window.cliRenderTabla = function() {
    var tbody = document.getElementById('cli-tbody');
    if (!tbody) return;

    if (!window.cliFiltrados.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4"><i class="bi bi-inbox me-1"></i>No se encontraron clientes</td></tr>';
        document.getElementById('cli-paginacion').innerHTML = '';
        return;
    }

    var inicio = (window.cliPaginaActual - 1) * window.cliFilasPorPagina;
    var fin = inicio + window.cliFilasPorPagina;
    var paginaItems = window.cliFiltrados.slice(inicio, fin);

    var html = '';
    paginaItems.forEach(function(c) {
        var badgeEst = (c.estado || 'Activo').toLowerCase() === 'activo'
            ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill fw-bold">Activo</span>'
            : '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle rounded-pill fw-bold">Inactivo</span>';

        html += '<tr onclick="window.cliAbrirDetalle(' + c.id + ')">';
        html += '<td class="fw-bold text-dark"><i class="bi bi-building me-2 text-primary"></i>' + (c.razon_social || '-') + '</td>';
        html += '<td><code class="text-secondary">' + (c.ruc_dni || '-') + '</code></td>';
        html += '<td>' + (c.telefono || '-') + '</td>';
        html += '<td>' + (c.email || '-') + '</td>';
        html += '<td>' + (c.direccion || '-') + '</td>';
        html += '<td class="text-center"><span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill fw-bold px-2">' + (c.total_flota || 0) + ' veh.</span></td>';
        html += '<td>' + badgeEst + '</td>';
        html += '<td class="text-end" onclick="event.stopPropagation()">';
        html += '<button class="btn btn-sm btn-light me-1" onclick="window.cliAbrirEditar(' + c.id + ')" title="Editar"><i class="bi bi-pencil"></i></button>';
        html += '<button class="btn btn-sm btn-outline-danger" onclick="window.cliEliminar(' + c.id + ')" title="Eliminar"><i class="bi bi-trash"></i></button>';
        html += '</td>';
        html += '</tr>';
    });

    tbody.innerHTML = html;
    window.cliRenderPaginacion();
};

window.cliRenderPaginacion = function() {
    var cont = document.getElementById('cli-paginacion');
    if (!cont) return;

    var totalPaginas = Math.ceil(window.cliFiltrados.length / window.cliFilasPorPagina) || 1;
    var html = '<div class="text-muted small fw-bold">Mostrando ' + window.cliFiltrados.length + ' cliente(s)</div>';
    
    if (totalPaginas > 1) {
        html += '<div class="d-flex gap-1">';
        for (var i = 1; i <= totalPaginas; i++) {
            var active = i === window.cliPaginaActual ? 'btn-primary' : 'btn-outline-secondary';
            html += '<button class="btn btn-sm ' + active + ' fw-bold" onclick="window.cliIrPagina(' + i + ')">' + i + '</button>';
        }
        html += '</div>';
    }
    cont.innerHTML = html;
};

window.cliIrPagina = function(p) {
    window.cliPaginaActual = p;
    window.cliRenderTabla();
};

// ── Modales & Acciones ────────────────────────────────────────────────────────
window.cliAbrirNuevo = function() {
    window.cliLimpiarForm();
    var tit = document.getElementById('cli-modal-titulo'); if (tit) tit.textContent = 'Nuevo Cliente';
    document.getElementById('modalCliente').classList.add('open');
    document.getElementById('cliBackdrop').classList.add('open');
};

window.cliAbrirEditar = function(id) {
    var c = window.cliData.find(function(x) { return x.id === id; });
    if (!c) return;

    window.cliLimpiarForm();
    document.getElementById('cli-f-id').value = c.id;
    document.getElementById('cli-f-ruc').value = c.ruc_dni || '';
    document.getElementById('cli-f-razon').value = c.razon_social || '';
    document.getElementById('cli-f-telefono').value = c.telefono || '';
    document.getElementById('cli-f-email').value = c.email || '';
    document.getElementById('cli-f-direccion').value = c.direccion || '';
    document.getElementById('cli-f-estado').value = c.estado || 'Activo';
    document.getElementById('cli-f-notas').value = c.notas || '';

    var tit = document.getElementById('cli-modal-titulo'); if (tit) tit.textContent = 'Editar Cliente';
    document.getElementById('modalCliente').classList.add('open');
    document.getElementById('cliBackdrop').classList.add('open');
};

window.cliLimpiarForm = function() {
    document.getElementById('cli-f-id').value = '';
    document.getElementById('cli-f-ruc').value = '';
    document.getElementById('cli-f-razon').value = '';
    document.getElementById('cli-f-telefono').value = '';
    document.getElementById('cli-f-email').value = '';
    document.getElementById('cli-f-direccion').value = '';
    document.getElementById('cli-f-estado').value = 'Activo';
    document.getElementById('cli-f-notas').value = '';
};

window.cliCerrarTodo = function() {
    var m = document.getElementById('modalCliente'); if (m) m.classList.remove('open');
    var d = document.getElementById('drawerDetalleCliente'); if (d) d.classList.remove('open');
    var b = document.getElementById('cliBackdrop'); if (b) b.classList.remove('open');
};

// ── Consulta SUNAT / RENIEC ──────────────────────────────────────────────────
window.cliConsultarSUNAT = async function() {
    var rucInput = document.getElementById('cli-f-ruc');
    var razonInput = document.getElementById('cli-f-razon');
    if (!rucInput || !razonInput) return;

    var num = rucInput.value.trim();
    if (!num) { alert('Ingrese un RUC o DNI'); return; }

    var tipo = num.length === 11 ? 'RUC' : (num.length === 8 ? 'DNI' : 'RUC');
    var btnIcon = document.getElementById('cli-btn-sunat-icon');
    if (btnIcon) btnIcon.className = "spinner-border spinner-border-sm me-1";

    try {
        var res = await fetch('/api/proxy/documento?tipo=' + tipo + '&numero=' + num);
        if (!res.ok) throw new Error('No encontrado');
        var data = await res.json();
        if (data && (data.nombre || data.razon_social)) {
            razonInput.value = (data.nombre || data.razon_social).toUpperCase();
            if (typeof window.rotToast === 'function') window.rotToast("Datos SUNAT/RENIEC obtenidos", "bg-success");
        }
    } catch (err) {
        console.warn('Error consulta SUNAT:', err);
        if (typeof window.rotToast === 'function') window.rotToast("No se halló información en SUNAT/RENIEC", "bg-warning");
    } finally {
        if (btnIcon) btnIcon.className = "bi bi-search me-1";
    }
};

// ── Guardar Cliente ──────────────────────────────────────────────────────────
window.cliGuardar = function(ev) {
    if (ev) ev.preventDefault();

    var id = document.getElementById('cli-f-id').value;
    var razon = document.getElementById('cli-f-razon').value.trim().toUpperCase();
    if (!razon) { alert('La Razón Social es requerida'); return; }

    var payload = {
        ruc_dni: document.getElementById('cli-f-ruc').value.trim(),
        razon_social: razon,
        telefono: document.getElementById('cli-f-telefono').value.trim(),
        email: document.getElementById('cli-f-email').value.trim(),
        direccion: document.getElementById('cli-f-direccion').value.trim(),
        estado: document.getElementById('cli-f-estado').value,
        notas: document.getElementById('cli-f-notas').value.trim()
    };

    var url = id ? '/api/clientes/' + id : '/api/clientes';
    var method = id ? 'PUT' : 'POST';

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(function(res) {
        if (!res.ok) throw new Error('Error al guardar cliente');
        return res.json();
    })
    .then(function() {
        if (typeof window.rotToast === 'function') window.rotToast('Cliente guardado con éxito', 'bg-success');
        window.cliCerrarTodo();
        window.cliCargar();
    })
    .catch(function(err) {
        console.error('Error guardando cliente:', err);
        alert('Error al guardar el cliente');
    });
};

// ── Eliminar Cliente ─────────────────────────────────────────────────────────
window.cliEliminar = function(id) {
    if (!confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) return;

    fetch('/api/clientes/' + id, { method: 'DELETE' })
    .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    })
    .then(function() {
        if (typeof window.rotToast === 'function') window.rotToast('Cliente eliminado', 'bg-info');
        window.cliCargar();
    })
    .catch(function(err) {
        console.error('Error eliminando cliente:', err);
        alert('Error al eliminar cliente');
    });
};

// ── Ficha 360° del Cliente ────────────────────────────────────────────────────
window.cliAbrirDetalle = function(id) {
    var c = window.cliData.find(function(x) { return x.id === id; });
    if (!c) return;
    window.cliClienteSeleccionado = c;

    document.getElementById('cli-det-nombre').textContent = c.razon_social;
    document.getElementById('cli-det-subt').textContent = 'RUC/DNI: ' + (c.ruc_dni || 'No registrado');

    document.getElementById('cli-det-ruc').textContent = c.ruc_dni || '-';
    document.getElementById('cli-det-estado').textContent = c.estado || 'Activo';
    document.getElementById('cli-det-telefono').textContent = c.telefono || '-';
    document.getElementById('cli-det-email').textContent = c.email || '-';
    document.getElementById('cli-det-direccion').textContent = c.direccion || '-';
    document.getElementById('cli-det-notas').textContent = c.notas || 'Sin observaciones.';

    document.getElementById('cli-det-count-flota').textContent = c.total_flota || 0;
    document.getElementById('cli-det-flota-list').innerHTML = 'Haz clic en la pestaña para cargar vehículos...';
    document.getElementById('cli-det-ots-list').innerHTML = 'Haz clic en la pestaña para cargar historial...';
    document.getElementById('cli-det-backlog-list').innerHTML = 'Haz clic en la pestaña para cargar backlog...';

    document.getElementById('drawerDetalleCliente').classList.add('open');
    document.getElementById('cliBackdrop').classList.add('open');
};

window.cliCargarFlotaDetalle = function() {
    if (!window.cliClienteSeleccionado) return;
    var cont = document.getElementById('cli-det-flota-list');
    cont.innerHTML = '<div class="spinner-border spinner-border-sm text-primary me-2"></div>Cargando unidades del cliente...';

    fetch('/api/clientes/' + window.cliClienteSeleccionado.id + '/flota')
        .then(function(res) { return res.json(); })
        .then(function(placas) {
            document.getElementById('cli-det-count-flota').textContent = placas.length;
            if (!placas.length) {
                cont.innerHTML = '<div class="text-muted small py-3"><i class="bi bi-truck me-1"></i>No hay vehículos registrados para este cliente.</div>';
                return;
            }
            var html = '<div class="list-group list-group-flush border rounded-3 overflow-hidden">';
            placas.forEach(function(p) {
                var badge = (p.estado || 'Activa').toLowerCase() === 'activa'
                    ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill">Activa</span>'
                    : '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle rounded-pill">' + p.estado + '</span>';

                html += '<div class="list-group-item d-flex align-items-center justify-content-between py-2">';
                html += '<div>';
                html += '<div class="fw-bold text-dark"><i class="bi bi-truck me-2 text-primary"></i>' + p.placa + '</div>';
                html += '<div class="text-muted" style="font-size:0.73rem;">' + (p.marca || '') + ' ' + (p.modelo_uts || p.modelo || '') + ' — ' + (p.tipo || '') + '</div>';
                html += '</div>';
                html += badge;
                html += '</div>';
            });
            html += '</div>';
            cont.innerHTML = html;
        })
        .catch(function(err) {
            console.error('Error cargando flota cliente:', err);
            cont.innerHTML = '<div class="text-danger small py-2">Error al cargar flota</div>';
        });
};

window.cliCargarOTsDetalle = function() {
    if (!window.cliClienteSeleccionado) return;
    var cont = document.getElementById('cli-det-ots-list');
    cont.innerHTML = '<div class="spinner-border spinner-border-sm text-primary me-2"></div>Cargando OTs del cliente...';

    fetch('/api/clientes/' + window.cliClienteSeleccionado.id + '/ots')
        .then(function(res) { return res.json(); })
        .then(function(ots) {
            document.getElementById('cli-det-count-ots').textContent = ots.length;
            if (!ots.length) {
                cont.innerHTML = '<div class="text-muted small py-3"><i class="bi bi-tools me-1"></i>No hay OTs registradas para los vehículos de este cliente.</div>';
                return;
            }
            var html = '<div class="list-group list-group-flush border rounded-3 overflow-hidden">';
            ots.forEach(function(ot) {
                html += '<div class="list-group-item d-flex align-items-center justify-content-between py-2">';
                html += '<div>';
                html += '<div class="fw-bold text-primary">OT-' + (ot.id_ot || ot.id) + ' <span class="text-dark font-monospace ms-2">[' + ot.placa + ']</span></div>';
                html += '<div class="text-muted" style="font-size:0.73rem;">' + (ot.trabajo_realizar || ot.descripcion || 'Mantenimiento') + '</div>';
                html += '</div>';
                html += '<span class="badge bg-info-subtle text-info border border-info-subtle rounded-pill">' + (ot.estado || 'Atención') + '</span>';
                html += '</div>';
            });
            html += '</div>';
            cont.innerHTML = html;
        })
        .catch(function(err) {
            console.error('Error cargando OTs cliente:', err);
            cont.innerHTML = '<div class="text-danger small py-2">Error al cargar historial de OTs</div>';
        });
};

window.cliCargarBacklogDetalle = function() {
    if (!window.cliClienteSeleccionado) return;
    var cont = document.getElementById('cli-det-backlog-list');
    cont.innerHTML = '<div class="spinner-border spinner-border-sm text-primary me-2"></div>Cargando backlog del cliente...';

    fetch('/api/clientes/' + window.cliClienteSeleccionado.id + '/backlog')
        .then(function(res) { return res.json(); })
        .then(function(backlog) {
            document.getElementById('cli-det-count-backlog').textContent = backlog.length;
            if (!backlog.length) {
                cont.innerHTML = '<div class="text-muted small py-3"><i class="bi bi-clock-history me-1"></i>No hay tareas pendientes en backlog para este cliente.</div>';
                return;
            }
            var html = '<div class="list-group list-group-flush border rounded-3 overflow-hidden">';
            backlog.forEach(function(b) {
                html += '<div class="list-group-item d-flex align-items-center justify-content-between py-2">';
                html += '<div>';
                html += '<div class="fw-bold text-dark"><span class="badge bg-warning text-dark me-2">' + b.placa + '</span> ' + (b.tema || 'Mantenimiento') + '</div>';
                html += '<div class="text-muted" style="font-size:0.73rem;">' + (b.tarea || '') + '</div>';
                html += '</div>';
                html += '<span class="badge bg-secondary-subtle text-secondary rounded-pill">' + (b.estado || 'Pendiente') + '</span>';
                html += '</div>';
            });
            html += '</div>';
            cont.innerHTML = html;
        })
        .catch(function(err) {
            console.error('Error cargando backlog cliente:', err);
            cont.innerHTML = '<div class="text-danger small py-2">Error al cargar backlog</div>';
        });
};

// ── Exportar a Excel ─────────────────────────────────────────────────────────
window.cliExportarExcel = function() {
    if (typeof window.descargarExcelDinamico === 'function') {
        window.descargarExcelDinamico('moduloClientes', 'Directorio_Clientes');
    } else {
        alert('Exportación a Excel lista');
    }
};
