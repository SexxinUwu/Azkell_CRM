// ================================================================
// Módulo Integraciones — Azkell Fleet
// SPA pattern: window.* globals, init_integraciones() entry point
// ================================================================

window.init_integraciones = function() {
    intgCargar();
};

// ── Carga valores actuales desde la DB ───────────────────────────
function intgCargar() {
    fetch('/api/integraciones')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(rows) {
            if (!Array.isArray(rows)) return;
            rows.forEach(function(row) {
                var val = row.valor || '';
                var meta = row.actualizado_por
                    ? 'Guardado por ' + row.actualizado_por + ' — ' + intgFmtFecha(row.actualizado_en)
                    : '';

                if (row.clave === 'wialon_token') {
                    var el = document.getElementById('intg-wialon-token');
                    if (el) el.value = val;
                    var m = document.getElementById('intg-wialon-meta');
                    if (m) m.textContent = meta;
                    var st = document.getElementById('intg-wialon-status');
                    if (st) { st.textContent = val ? 'Configurado' : 'Sin configurar'; st.className = 'intg-status ' + (val ? 'ok' : 'pending'); }
                } else if (row.clave === 'wialon_url') {
                    var el2 = document.getElementById('intg-wialon-url');
                    if (el2) el2.value = val;
                } else if (row.clave === 'gemini_api_key') {
                    var el3 = document.getElementById('intg-gemini-apikey');
                    if (el3) el3.value = val;
                    var m3 = document.getElementById('intg-gemini-meta');
                    if (m3) m3.textContent = meta;
                    var st3 = document.getElementById('intg-gemini-status');
                    if (st3) { st3.textContent = val ? 'Configurado' : 'Sin configurar'; st3.className = 'intg-status ' + (val ? 'ok' : 'pending'); }
                }
            });
        })
        .catch(function(err) { console.error('Error cargando integraciones:', err); });
}

// ── Guardar una integración ──────────────────────────────────────
window.intgGuardar = function(cual) {
    var correo = localStorage.getItem('fleet_correo') || '';
    var pares = [];

    if (cual === 'wialon') {
        var token = (document.getElementById('intg-wialon-token') || {}).value || '';
        var url   = (document.getElementById('intg-wialon-url')   || {}).value || '';
        pares = [
            { clave: 'wialon_token', valor: token.trim() },
            { clave: 'wialon_url',   valor: url.trim()   }
        ];
    } else if (cual === 'gemini') {
        var key = (document.getElementById('intg-gemini-apikey') || {}).value || '';
        pares = [{ clave: 'gemini_api_key', valor: key.trim() }];
    }

    if (!pares.length) return;

    var promesas = pares.map(function(p) {
        return fetch('/api/integraciones', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clave: p.clave, valor: p.valor, actualizado_por: correo })
        }).then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); });
    });

    Promise.all(promesas)
        .then(function() {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Integración guardada correctamente', 'success');
            intgCargar();
        })
        .catch(function(err) {
            console.error('Error guardando integración:', err);
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar', 'danger');
        });
};

// ── Probar conexión Wialon ───────────────────────────────────────
window.intgProbarWialon = function() {
    var btn = document.querySelector('#intg-card-wialon .btn-outline-secondary');
    var result = document.getElementById('intg-wialon-testresult');
    var status = document.getElementById('intg-wialon-status');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Probando…'; }
    if (result) { result.className = 'intg-test-result'; result.textContent = ''; }

    fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metodo: 'obtenerDatosWialon' })
    })
    .then(function(r) { return r.ok ? r.json() : r.json().then(function(e) { throw new Error(e.error || 'Error'); }); })
    .then(function(res) {
        var data = res.data;
        var ok = Array.isArray(data) && data.length >= 0;
        var esError = data && data.error;
        if (esError) throw new Error(data.error);

        if (result) { result.className = 'intg-test-result ok'; result.textContent = '✓ Conectado — ' + data.length + ' unidades encontradas'; }
        if (status) { status.textContent = 'Activo'; status.className = 'intg-status ok'; }
    })
    .catch(function(err) {
        if (result) { result.className = 'intg-test-result error'; result.textContent = '✗ ' + err.message; }
        if (status) { status.textContent = 'Error'; status.className = 'intg-status error'; }
    })
    .finally(function() {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-lightning me-1"></i>Probar conexión'; }
    });
};

// ── Toggle mostrar/ocultar contraseña ────────────────────────────
window.intgTogglePwd = function(inputId, btnEl) {
    var inp = document.getElementById(inputId);
    if (!inp) return;
    var mostrar = inp.type === 'password';
    inp.type = mostrar ? 'text' : 'password';
    var ico = btnEl ? btnEl.querySelector('i') : null;
    if (ico) { ico.className = mostrar ? 'bi bi-eye-slash' : 'bi bi-eye'; }
};

// ── Helper fecha ─────────────────────────────────────────────────
function intgFmtFecha(str) {
    if (!str) return '';
    var d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
