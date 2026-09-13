// ================================================================
// MÓDULO: CENTROS DE COSTOS — TESORERÍA ERP AZKELL (LÓGICA SPA)
// ================================================================

window._ccData = [];
window._ccDataFiltrada = [];

window.init_tesoreria_centros_costos = function() {
    console.log('Inicializando módulo Centros de Costos...');
    window.ccCargarListado();
};

// Cargar Centros de Costos desde el backend
window.ccCargarListado = async function() {
    var tbody = document.getElementById('cc-tbody');
    if (!tbody) return;

    try {
        var resp = await fetch('/api/tesoreria/centros-costos');
        var res = await resp.json();
        if (res.ok && Array.isArray(res.data)) {
            window._ccData = res.data;
            window._ccDataFiltrada = res.data;
            window.ccRenderizarTabla(res.data);
            window.ccActualizarKPIs(res.data);
        } else {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger">Error al cargar centros de costos.</td></tr>';
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger">Error de conexión: ' + err.message + '</td></tr>';
    }
};

window.ccActualizarKPIs = function(list) {
    var badge = document.getElementById('cc-badge-total');
    if (badge) badge.textContent = list.length + ' Centros Registrados';
};

window.ccRenderizarTabla = function(rows) {
    var tbody = document.getElementById('cc-tbody');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted">No se encontraron centros de costos registrados.</td></tr>';
        return;
    }

    var esc = function(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    };

    var html = rows.map(function(item) {
        var estadoBadge = (item.estado === 'ACTIVO')
            ? '<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1">ACTIVO</span>'
            : '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1">INACTIVO</span>';

        var nivelBadge = (item.nivel === 'Principal')
            ? '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">Principal</span>'
            : '<span class="badge bg-light text-dark border">Subcentro</span>';

        var reqPlacaBadge = (item.requiere_placa == 1 || item.requiere_placa === true)
            ? '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle fw-bold"><i class="bi bi-truck me-1"></i>SÍ (Obligatorio)</span>'
            : '<span class="text-muted small">No</span>';

        return '<tr>' +
            '<td class="text-center">' +
                '<div class="d-inline-flex gap-1">' +
                    '<button type="button" class="btn btn-sm btn-outline-primary p-1 rounded-circle lh-1" onclick="window.ccAbrirModalEditar(' + item.id + ')" title="Editar Centro">' +
                        '<i class="bi bi-pencil-square" style="font-size:0.75rem;"></i>' +
                    '</button>' +
                    '<button type="button" class="btn btn-sm btn-outline-danger p-1 rounded-circle lh-1" onclick="window.ccEliminar(' + item.id + ')" title="Eliminar Centro">' +
                        '<i class="bi bi-trash" style="font-size:0.75rem;"></i>' +
                    '</button>' +
                '</div>' +
            '</td>' +
            '<td class="font-monospace fw-bold text-dark fs-6">' + esc(item.codigo) + '</td>' +
            '<td class="fw-bold text-primary">' + esc(item.nombre) + '</td>' +
            '<td>' + nivelBadge + '</td>' +
            '<td class="font-monospace text-secondary">' + (item.cuenta_contable ? esc(item.cuenta_contable) : '<span class="text-muted opacity-50">—</span>') + '</td>' +
            '<td class="text-center">' + reqPlacaBadge + '</td>' +
            '<td class="small text-muted" style="max-width:260px; overflow:hidden; text-overflow:ellipsis;" title="' + esc(item.descripcion) + '">' + (item.descripcion ? esc(item.descripcion) : '<span class="text-muted opacity-50">—</span>') + '</td>' +
            '<td class="text-center">' + estadoBadge + '</td>' +
        '</tr>';
    }).join('');

    tbody.innerHTML = html;
};

// Filtro instantáneo local en la tabla
window.ccFiltrarTabla = function(query) {
    var q = (query || '').trim().toLowerCase();
    if (!q) {
        window.ccRenderizarTabla(window._ccData);
        return;
    }
    var filtrados = (window._ccData || []).filter(function(item) {
        return (item.codigo && item.codigo.toLowerCase().includes(q)) ||
               (item.nombre && item.nombre.toLowerCase().includes(q)) ||
               (item.cuenta_contable && item.cuenta_contable.toLowerCase().includes(q)) ||
               (item.descripcion && item.descripcion.toLowerCase().includes(q));
    });
    window.ccRenderizarTabla(filtrados);
};

// Modal Nuevo
window.ccAbrirModalNuevo = function() {
    var form = document.getElementById('formCentroCosto');
    if (form) form.reset();

    var idEl = document.getElementById('cc-input-id');
    if (idEl) idEl.value = '';

    var titulo = document.getElementById('modalCcTitulo');
    if (titulo) titulo.textContent = 'Nuevo Centro de Costos';

    var modalEl = document.getElementById('modalCentroCostoForm');
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

// Modal Editar
window.ccAbrirModalEditar = function(id) {
    var item = (window._ccData || []).find(function(c) { return c.id == id; });
    if (!item) return;

    var form = document.getElementById('formCentroCosto');
    if (form) form.reset();

    var idEl = document.getElementById('cc-input-id');
    if (idEl) idEl.value = item.id;

    var codEl = document.getElementById('cc-modal-codigo');
    if (codEl) codEl.value = item.codigo || '';

    var nomEl = document.getElementById('cc-modal-nombre');
    if (nomEl) nomEl.value = item.nombre || '';

    var nivEl = document.getElementById('cc-modal-nivel');
    if (nivEl) nivEl.value = item.nivel || 'Principal';

    var ctaEl = document.getElementById('cc-modal-cuenta');
    if (ctaEl) ctaEl.value = item.cuenta_contable || '';

    var reqEl = document.getElementById('cc-modal-requiere-placa');
    if (reqEl) reqEl.checked = (item.requiere_placa == 1 || item.requiere_placa === true);

    var estEl = document.getElementById('cc-modal-estado');
    if (estEl) estEl.value = item.estado || 'ACTIVO';

    var descEl = document.getElementById('cc-modal-descripcion');
    if (descEl) descEl.value = item.descripcion || '';

    var titulo = document.getElementById('modalCcTitulo');
    if (titulo) titulo.textContent = 'Editar Centro: ' + item.codigo;

    var modalEl = document.getElementById('modalCentroCostoForm');
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

// Guardar Centro de Costos
window.ccGuardarFormulario = async function(e) {
    if (e && e.preventDefault) e.preventDefault();

    var btn = document.getElementById('cc-modal-btn-submit');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
    }

    var id = (document.getElementById('cc-input-id') || {}).value;
    var payload = {
        codigo: ((document.getElementById('cc-modal-codigo') || {}).value || '').trim(),
        nombre: ((document.getElementById('cc-modal-nombre') || {}).value || '').trim(),
        nivel: ((document.getElementById('cc-modal-nivel') || {}).value || 'Principal').trim(),
        cuenta_contable: ((document.getElementById('cc-modal-cuenta') || {}).value || '').trim(),
        requiere_placa: (document.getElementById('cc-modal-requiere-placa') || {}).checked ? 1 : 0,
        estado: ((document.getElementById('cc-modal-estado') || {}).value || 'ACTIVO').trim(),
        descripcion: ((document.getElementById('cc-modal-descripcion') || {}).value || '').trim()
    };

    var url = id ? ('/api/tesoreria/centros-costos/' + id) : '/api/tesoreria/centros-costos';
    var method = id ? 'PUT' : 'POST';

    try {
        var resp = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var res = await resp.json();
        if (res.ok) {
            var modalEl = document.getElementById('modalCentroCostoForm');
            if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();

            await window.ccCargarListado();
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'success', title: '¡Completado!', text: res.message || 'Centro de costos guardado.', timer: 1800, showConfirmButton: false });
            } else {
                alert('Centro de costos guardado correctamente.');
            }
        } else {
            alert('Error: ' + (res.error || 'No se pudo guardar el centro de costos.'));
        }
    } catch (err) {
        alert('Error de conexión: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Guardar Centro de Costos';
        }
    }
};

// Eliminar Centro de Costos
window.ccEliminar = async function(id) {
    if (!confirm('¿Está seguro de eliminar este centro de costos? Los registros de caja existentes conservarán su referencia histórica.')) return;

    try {
        var resp = await fetch('/api/tesoreria/centros-costos/' + id, { method: 'DELETE' });
        var res = await resp.json();
        if (res.ok) {
            await window.ccCargarListado();
        } else {
            alert('Error: ' + (res.error || 'No se pudo eliminar el centro de costos.'));
        }
    } catch (err) {
        alert('Error de conexión: ' + err.message);
    }
};

// ================================================================
// TAB 2: GESTIÓN DE MOTIVOS Y SUBMOTIVOS DE GASTO
// ================================================================
window._ccMotivosData = [];
window._ccMotivosDataFiltrada = [];

window.ccCargarMotivosTab = async function() {
    var tbody = document.getElementById('cc-motivos-tab-tbody');
    var badge = document.getElementById('cc-badge-motivos-total');
    if (!tbody) return;

    try {
        var resp = await fetch('/api/tesoreria/motivos-gastos');
        var res = await resp.json();
        if (res.ok && Array.isArray(res.data)) {
            window._ccMotivosData = res.data;
            window._ccMotivosDataFiltrada = res.data;
            if (badge) badge.textContent = res.data.length + ' Conceptos de Gasto';
            window.ccRenderizarTablaMotivosTab(res.data);
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">Error cargando conceptos de gasto.</td></tr>';
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">Error de conexión: ' + err.message + '</td></tr>';
    }
};

window.ccRenderizarTablaMotivosTab = function(rows) {
    var tbody = document.getElementById('cc-motivos-tab-tbody');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">No se encontraron conceptos de gasto.</td></tr>';
        return;
    }

    var esc = function(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    };

    var html = rows.map(function(item) {
        var ccLabel = item.centro_costo_codigo
            ? ('<span class="badge bg-indigo-subtle text-primary border border-indigo-subtle font-monospace fw-bold">' + esc(item.centro_costo_codigo) + '</span>')
            : '<span class="text-muted opacity-50">—</span>';

        var estadoBadge = (item.estado === 'ACTIVO')
            ? '<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1">ACTIVO</span>'
            : '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1">INACTIVO</span>';

        return '<tr>' +
            '<td class="text-center">' +
                '<div class="d-inline-flex gap-1">' +
                    '<button type="button" class="btn btn-sm btn-outline-primary p-1 rounded-circle lh-1" onclick="window.ccAbrirModalEditarMotivo(' + item.id + ')" title="Editar Concepto">' +
                        '<i class="bi bi-pencil-square" style="font-size:0.75rem;"></i>' +
                    '</button>' +
                    '<button type="button" class="btn btn-sm btn-outline-danger p-1 rounded-circle lh-1" onclick="window.ccEliminarMotivoGastoTab(' + item.id + ')" title="Eliminar Concepto">' +
                        '<i class="bi bi-trash" style="font-size:0.75rem;"></i>' +
                    '</button>' +
                '</div>' +
            '</td>' +
            '<td class="fw-bold text-dark">' + esc(item.motivo) + '</td>' +
            '<td class="fw-semibold text-secondary">' + esc(item.sub_motivo) + '</td>' +
            '<td>' + ccLabel + '</td>' +
            '<td class="text-center">' + estadoBadge + '</td>' +
        '</tr>';
    }).join('');

    tbody.innerHTML = html;
};

window.ccFiltrarTablaMotivosTab = function(query) {
    var q = (query || '').trim().toLowerCase();
    if (!q) {
        window.ccRenderizarTablaMotivosTab(window._ccMotivosData);
        return;
    }
    var filtrados = (window._ccMotivosData || []).filter(function(item) {
        return (item.motivo && item.motivo.toLowerCase().includes(q)) ||
               (item.sub_motivo && item.sub_motivo.toLowerCase().includes(q)) ||
               (item.centro_costo_codigo && item.centro_costo_codigo.toLowerCase().includes(q));
    });
    window.ccRenderizarTablaMotivosTab(filtrados);
};

window.ccPoblarSelectorCCEnModalMotivo = function(selVal) {
    var sel = document.getElementById('motivo-modal-centro-costo');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Sin sugerencia automática --</option>';
    (window._ccData || []).forEach(function(c) {
        if (c.estado === 'INACTIVO') return;
        var opt = new Option(c.codigo + ' - ' + c.nombre, c.codigo);
        if (selVal && (c.codigo === selVal || (c.codigo + ': ' + c.nombre) === selVal)) {
            opt.selected = true;
        }
        sel.add(opt);
    });
};

window.ccAbrirModalNuevoMotivo = function() {
    var form = document.getElementById('formMotivoGasto');
    if (form) form.reset();

    var idEl = document.getElementById('motivo-input-id');
    if (idEl) idEl.value = '';

    var titulo = document.getElementById('modalMotivoTitulo');
    if (titulo) titulo.textContent = 'Nuevo Concepto de Gasto';

    // Datalist de motivos principales existentes
    var dl = document.getElementById('cc-dl-motivos-principales');
    if (dl && window._ccMotivosData) {
        var unicos = Array.from(new Set(window._ccMotivosData.map(function(d) { return d.motivo; })));
        dl.innerHTML = unicos.map(function(m) { return '<option value="' + m + '">'; }).join('');
    }

    window.ccPoblarSelectorCCEnModalMotivo();

    var modalEl = document.getElementById('modalMotivoForm');
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.ccAbrirModalEditarMotivo = function(id) {
    var item = (window._ccMotivosData || []).find(function(m) { return m.id == id; });
    if (!item) return;

    var form = document.getElementById('formMotivoGasto');
    if (form) form.reset();

    var idEl = document.getElementById('motivo-input-id');
    if (idEl) idEl.value = item.id;

    var motEl = document.getElementById('motivo-modal-motivo');
    if (motEl) motEl.value = item.motivo || '';

    var subEl = document.getElementById('motivo-modal-submotivo');
    if (subEl) subEl.value = item.sub_motivo || '';

    var estEl = document.getElementById('motivo-modal-estado');
    if (estEl) estEl.value = item.estado || 'ACTIVO';

    var titulo = document.getElementById('modalMotivoTitulo');
    if (titulo) titulo.textContent = 'Editar Concepto: ' + item.sub_motivo;

    window.ccPoblarSelectorCCEnModalMotivo(item.centro_costo_codigo);

    var modalEl = document.getElementById('modalMotivoForm');
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.ccGuardarMotivoGasto = async function(e) {
    if (e && e.preventDefault) e.preventDefault();

    var id = (document.getElementById('motivo-input-id') || {}).value;
    var mot = ((document.getElementById('motivo-modal-motivo') || {}).value || '').trim();
    var sub = ((document.getElementById('motivo-modal-submotivo') || {}).value || '').trim();
    var cc = ((document.getElementById('motivo-modal-centro-costo') || {}).value || '').trim();
    var est = ((document.getElementById('motivo-modal-estado') || {}).value || 'ACTIVO').trim();

    if (!mot || !sub) return alert('Motivo Principal y Sub Motivo son obligatorios.');

    var btn = document.getElementById('motivo-modal-btn-submit');
    if (btn) { btn.disabled = true; btn.innerHTML = 'Guardando...'; }

    var url = id ? ('/api/tesoreria/motivos-gastos/' + id) : '/api/tesoreria/motivos-gastos';
    var method = id ? 'PUT' : 'POST';

    try {
        var resp = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo: mot, sub_motivo: sub, centro_costo_codigo: cc, estado: est })
        });
        var res = await resp.json();
        if (res.ok) {
            var modalEl = document.getElementById('modalMotivoForm');
            if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();

            await window.ccCargarMotivosTab();
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'success', title: '¡Guardado!', text: 'El concepto de gasto fue guardado correctamente.', timer: 1800, showConfirmButton: false });
            } else {
                alert('Concepto guardado con éxito.');
            }
        } else {
            alert('Error: ' + res.error);
        }
    } catch (err) {
        alert('Error de conexión: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Guardar Concepto'; }
    }
};

window.ccEliminarMotivoGastoTab = async function(id) {
    if (!confirm('¿Está seguro de eliminar este concepto de gasto?')) return;
    try {
        var resp = await fetch('/api/tesoreria/motivos-gastos/' + id, { method: 'DELETE' });
        var res = await resp.json();
        if (res.ok) {
            await window.ccCargarMotivosTab();
        } else {
            alert('Error al eliminar: ' + res.error);
        }
    } catch(e) {
        alert('Error: ' + e.message);
    }
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    window.init_tesoreria_centros_costos();
} else {
    document.addEventListener('DOMContentLoaded', window.init_tesoreria_centros_costos);
}
