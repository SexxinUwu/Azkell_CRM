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
                } else if (row.clave === 'sunat_ruc_emisor') {
                    var elRuc = document.getElementById('intg-sunat-ruc');
                    if (elRuc) elRuc.value = val;
                } else if (row.clave === 'sunat_usuario_sol') {
                    var elUsr = document.getElementById('intg-sunat-usuario');
                    if (elUsr) elUsr.value = val;
                } else if (row.clave === 'sunat_clave_sol') {
                    var elPwd = document.getElementById('intg-sunat-clave');
                    if (elPwd) elPwd.value = val;
                } else if (row.clave === 'sunat_client_id') {
                    var elCid = document.getElementById('intg-sunat-client-id');
                    if (elCid) elCid.value = val;
                    var stSunat = document.getElementById('intg-sunat-status');
                    if (stSunat) { stSunat.textContent = val ? 'Configurado' : 'Sin configurar'; stSunat.className = 'intg-status ' + (val ? 'ok' : 'pending'); }
                    var mSunat = document.getElementById('intg-sunat-meta');
                    if (mSunat) mSunat.textContent = meta;
                } else if (row.clave === 'sunat_client_secret') {
                    var elCsc = document.getElementById('intg-sunat-client-secret');
                    if (elCsc) elCsc.value = val;
                } else if (row.clave === 'sunat_modo_entorno') {
                    var elEnt = document.getElementById('intg-sunat-entorno');
                    if (elEnt) elEnt.value = val || 'produccion';
                }
            });
        })
        .catch(function(err) { console.error('Error cargando integraciones:', err); });
}

// ── Guardar una integración ──────────────────────────────────────
window.intgGuardar = function(cual, callback) {
    var correo = localStorage.getItem('fleet_correo') || '';
    var pares = [];

    if (cual === 'wialon') {
        var token = (document.getElementById('intg-wialon-token') || {}).value || '';
        var url   = (document.getElementById('intg-wialon-url')   || {}).value || '';
        pares = [
            { clave: 'wialon_token', valor: token.trim() },
            { clave: 'wialon_url',   valor: url.trim()   }
        ];
    } else if (cual === 'sunat') {
        var ruc          = (document.getElementById('intg-sunat-ruc')           || {}).value || '';
        var usuarioSol   = (document.getElementById('intg-sunat-usuario')       || {}).value || '';
        var claveSol     = (document.getElementById('intg-sunat-clave')         || {}).value || '';
        var clientId     = (document.getElementById('intg-sunat-client-id')     || {}).value || '';
        var clientSecret = (document.getElementById('intg-sunat-client-secret') || {}).value || '';
        var entorno      = (document.getElementById('intg-sunat-entorno')       || {}).value || 'produccion';

        pares = [
            { clave: 'sunat_ruc_emisor',     valor: ruc.trim() },
            { clave: 'sunat_usuario_sol',    valor: usuarioSol.trim() },
            { clave: 'sunat_clave_sol',      valor: claveSol.trim() },
            { clave: 'sunat_client_id',      valor: clientId.trim() },
            { clave: 'sunat_client_secret',  valor: clientSecret.trim() },
            { clave: 'sunat_modo_entorno',   valor: entorno.trim() }
        ];
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
            if (typeof callback === 'function') callback();
        })
        .catch(function(err) {
            console.error('Error guardando integración:', err);
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar', 'danger');
        });
};

// ── Iniciar sesión en Wialon y Conectar Automáticamente ───────────
var _wialonMsgHandlerAttached = false;

window.intgConectarWialon = function() {
    if (!_wialonMsgHandlerAttached) {
        window.addEventListener('message', function(e) {
            if (e.data && e.data.type === 'WIALON_AUTH_SUCCESS' && e.data.token) {
                var token = e.data.token;
                var el = document.getElementById('intg-wialon-token');
                if (el) el.value = token;

                if (typeof window.mostrarAlerta === 'function') {
                    window.mostrarAlerta('✓ Token de Wialon capturado con éxito. Guardando credenciales...', 'info');
                }

                // Guardar automáticamente en BD y ejecutar prueba de conexión
                window.intgGuardar('wialon', function() {
                    window.intgProbarWialon();
                });
            }
        });
        _wialonMsgHandlerAttached = true;
    }

    var redirectUri = encodeURIComponent(window.location.origin + '/wialon_callback.html');
    var authUrl = 'https://hosting.wialon.us/login.html?access_type=-1&duration=0&client_id=%22ACCESO%20API%20STHEFANO%20AVILA%22&response_type=token&redirect_uri=' + redirectUri;
    
    var w = 720;
    var h = 640;
    var left = Math.max(0, (window.screen.width / 2) - (w / 2));
    var top = Math.max(0, (window.screen.height / 2) - (h / 2));

    window.open(authUrl, 'wialon_oauth_login', 'width=' + w + ',height=' + h + ',top=' + top + ',left=' + left + ',menubar=no,toolbar=no,location=no,status=no,resizable=yes');
};

// ── Probar conexión Wialon ───────────────────────────────────────
window.intgProbarWialon = function() {
    var btn = document.querySelector('#intg-card-wialon .btn-outline-secondary');
    var result = document.getElementById('intg-wialon-testresult');
    var status = document.getElementById('intg-wialon-status');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Probando…'; }
    if (result) { result.className = 'intg-test-result'; result.textContent = ''; }

    fetch('/api/script/obtenerDatosWialon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
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

// ── Probar conexión SUNAT (OAuth 2.0 Token) ──────────────────────
window.intgProbarSunat = function() {
    var btn = document.querySelector('#intg-card-sunat .btn-outline-secondary');
    var result = document.getElementById('intg-sunat-testresult');
    var status = document.getElementById('intg-sunat-status');

    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Autenticando…'; }
    if (result) { result.className = 'intg-test-result'; result.textContent = ''; }

    // Primero guardamos los valores ingresados
    window.intgGuardar('sunat', function() {
        fetch('/api/guias-remision/test-token-sunat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res.ok) {
                if (result) {
                    result.className = 'intg-test-result ok';
                    result.textContent = '✓ Conectado con SUNAT — Token OAuth 2.0 generado con éxito';
                }
                if (status) {
                    status.textContent = 'Activo';
                    status.className = 'intg-status ok';
                }
            } else {
                throw new Error(res.error || 'Credenciales inválidas');
            }
        })
        .catch(function(err) {
            if (result) {
                result.className = 'intg-test-result error';
                result.textContent = '✗ ' + err.message;
            }
            if (status) {
                status.textContent = 'Error';
                status.className = 'intg-status error';
            }
        })
        .finally(function() {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-shield-check me-1"></i>Probar Conexión (OAuth 2.0)';
            }
        });
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
