// Módulo: Bancos — Tesorería ERP Azkell
window._bancosData = [];

window.init_tesoreria_bancos = function() {
    window.bancosCargarListado();
};

window.bancosCargarListado = async function() {
    var tbody = document.getElementById('bancos-tbody');
    if (!tbody) return;
    try {
        var resp = await fetch('/api/tesoreria/bancos');
        var res = await resp.json();
        if (res.ok && Array.isArray(res.data)) {
            window._bancosData = res.data;
            window.bancosRenderizarTabla(res.data);
        } else {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger">Error cargando cuentas bancarias</td></tr>';
        }
    } catch(err) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger">Error de conexión: ' + err.message + '</td></tr>';
    }
};

window.bancosRenderizarTabla = function(rows) {
    var tbody = document.getElementById('bancos-tbody');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No hay cuentas bancarias registradas en el sistema.</td></tr>';
        return;
    }

    var esc = function(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    };

    var html = rows.map(function(r) {
        var badgeMoneda = r.moneda === 'DOLARES' ? 'bg-success text-white' : 'bg-light text-dark border';
        var badgeEstado = r.estado === 'ACTIVO' ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-secondary-subtle text-secondary border';

        return '<tr>' +
            '<td class="text-center">' +
                '<button type="button" class="btn btn-outline-danger btn-sm p-1 rounded-circle lh-1" onclick="window.bancosEliminar(' + r.id + ')" title="Eliminar cuenta">' +
                    '<i class="bi bi-trash" style="font-size:0.75rem;"></i>' +
                '</button>' +
            '</td>' +
            '<td class="fw-bold text-primary">' + esc(r.banco) + '</td>' +
            '<td>' + esc(r.titular || '—') + '</td>' +
            '<td><span class="badge ' + badgeMoneda + '">' + esc(r.moneda) + '</span></td>' +
            '<td>' + esc(r.tipo_cuenta) + '</td>' +
            '<td class="font-monospace fw-semibold">' + esc(r.numero_cuenta) + '</td>' +
            '<td class="font-monospace text-muted">' + esc(r.cci || '—') + '</td>' +
            '<td><span class="badge ' + badgeEstado + ' px-2 py-1" style="font-size:0.68rem;">' + esc(r.estado) + '</span></td>' +
        '</tr>';
    }).join('');

    tbody.innerHTML = html;
};

window.bancosAbrirModalNuevo = function() {
    var form = document.getElementById('formNuevaCuentaBanco');
    if (form) form.reset();

    var idEl = document.getElementById('banco-modal-id');
    if (idEl) idEl.value = '';

    var modalEl = document.getElementById('modalBancoForm');
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.bancosGuardarFormulario = async function(e) {
    if (e && e.preventDefault) e.preventDefault();

    var btn = document.getElementById('banco-modal-btn-submit');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...';
    }

    var payload = {
        banco: (document.getElementById('banco-modal-nombre') || {}).value,
        titular: (document.getElementById('banco-modal-titular') || {}).value,
        moneda: (document.getElementById('banco-modal-moneda') || {}).value,
        tipo_cuenta: (document.getElementById('banco-modal-tipo') || {}).value,
        estado: (document.getElementById('banco-modal-estado') || {}).value,
        numero_cuenta: (document.getElementById('banco-modal-numero') || {}).value,
        cci: (document.getElementById('banco-modal-cci') || {}).value
    };

    try {
        var resp = await fetch('/api/tesoreria/bancos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var res = await resp.json();
        if (res.ok) {
            var modalEl = document.getElementById('modalBancoForm');
            if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();

            await window.bancosCargarListado();
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'success', title: '¡Guardado!', text: 'La cuenta bancaria fue registrada.', timer: 1800, showConfirmButton: false });
            } else {
                alert('Cuenta bancaria guardada con éxito.');
            }
        } else {
            alert('Error al guardar: ' + (res.error || 'No se pudo procesar'));
        }
    } catch(err) {
        alert('Error de conexión: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Guardar Cuenta';
        }
    }
};

window.bancosEliminar = async function(id) {
    if (!confirm('¿Está seguro de eliminar esta cuenta bancaria?')) return;
    try {
        var resp = await fetch('/api/tesoreria/bancos/' + id, { method: 'DELETE' });
        var res = await resp.json();
        if (res.ok) {
            window.bancosCargarListado();
        } else {
            alert('Error al eliminar: ' + res.error);
        }
    } catch(err) {
        alert('Error: ' + err.message);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.init_tesoreria_bancos);
} else {
    window.init_tesoreria_bancos();
}
