var perfilData = {};
var perfilCanvas = null;
var perfilCtx = null;
var perfilDibujando = false;

window.perfilCargarDatos = async function() {
    try {
        var res = await fetch('/api/perfil/me', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('fleet_token') } });
        if (!res.ok) throw new Error('Error al cargar perfil');
        var user = await res.json();
        perfilData = user;
        
        // Rellenar cabecera
        document.getElementById('p-nombre-head').innerText = user.nombre || user.correo;
        document.getElementById('p-cargo-head').innerText = user.cargo || 'Usuario del Sistema';
        
        // Rellenar formulario
        var iNombre = document.getElementById('p-input-nombre'); if (iNombre) iNombre.value = user.nombre || '';
        var iCorreo = document.getElementById('p-input-correo'); if (iCorreo) iCorreo.value = user.correo || '';
        var iTelefono = document.getElementById('p-input-telefono'); if (iTelefono) iTelefono.value = user.telefono || '';
        
        // Avatar y Banner
        if (user.banner_url) {
            document.getElementById('p-banner').style.backgroundImage = 'url(' + user.banner_url + ')';
        }
        var avEl = document.getElementById('p-avatar');
        if (avEl) {
            if (user.avatar_url) {
                avEl.style.backgroundImage = 'url(' + user.avatar_url + ')';
                avEl.innerText = '';
            } else {
                avEl.style.backgroundImage = 'none';
                avEl.innerText = (user.nombre || user.correo).charAt(0).toUpperCase();
            }
        }
        
        // Preferencias
        if (user.preferencias) {
            if (user.preferencias.color) {
                document.documentElement.style.setProperty('--crm-accent', user.preferencias.color);
                var btns = document.querySelectorAll('#p-color-picker .color-picker-btn');
                btns.forEach(b => b.classList.remove('active'));
                btns.forEach(b => {
                    if (b.style.backgroundColor === user.preferencias.color || b.style.backgroundColor === hexToRgb(user.preferencias.color)) b.classList.add('active');
                });
            }
            if (user.preferencias.tema) {
                var sTema = document.getElementById('p-input-tema');
                if (sTema) sTema.value = user.preferencias.tema;
                window.applyDark && window.applyDark(user.preferencias.tema);
            }
        }
        
        // Firma Digital
        if (user.firma_digital) {
            var img = document.getElementById('p-firma-img');
            if (img) img.src = user.firma_digital;
            var prev = document.getElementById('p-firma-preview');
            if (prev) prev.style.display = 'flex';
            var btn = document.getElementById('btn-alternar-firma');
            if (btn) btn.innerText = 'Redibujar';
        } else {
            var prev = document.getElementById('p-firma-preview');
            if (prev) prev.style.display = 'none';
        }
        
        perfilCargarSesiones();
    } catch(e) {
        console.error(e);
        alert('Error: ' + e.message);
    }
};

window.perfilCargarSesiones = async function() {
    try {
        var res = await fetch('/api/perfil/sesiones', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('fleet_token') } });
        if (!res.ok) throw new Error('Error al cargar sesiones');
        var sesiones = await res.json();
        
        var list = document.getElementById('p-sesiones-list');
        if (!list) return;
        
        var html = '';
        sesiones.forEach(s => {
            var date = new Date(s.ultima_actividad).toLocaleString();
            var disp = s.dispositivo || 'Dispositivo Desconocido';
            var isCurrent = s.actual ? '<span class="badge bg-success ms-2">Sesión Actual</span>' : '';
            var action = s.actual ? '' : '<button class="btn btn-sm btn-outline-danger" onclick="perfilRevocarSesion(' + s.id + ')">Revocar</button>';
            
            html += '<div class="session-item">';
            html += '<div>';
            html += '<div class="fw-bold">' + disp + isCurrent + '</div>';
            html += '<div class="small text-muted">IP: ' + (s.ip || '---') + ' &bull; Última vez: ' + date + '</div>';
            html += '</div>';
            html += '<div>' + action + '</div>';
            html += '</div>';
        });
        
        if (!html) html = '<div class="text-muted text-center py-3">No hay sesiones activas.</div>';
        list.innerHTML = html;
        
    } catch(e) {
        console.error(e);
    }
};

window.perfilRevocarSesion = async function(id) {
    if (!confirm('¿Estás seguro de revocar esta sesión? El dispositivo será desconectado.')) return;
    try {
        var res = await fetch('/api/perfil/sesiones/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('fleet_token') }
        });
        if (!res.ok) throw new Error('Error al revocar');
        perfilCargarSesiones();
    } catch(e) {
        alert(e.message);
    }
};

window.perfilGuardarDatos = async function() {
    try {
        var nombre = document.getElementById('p-input-nombre').value;
        var telefono = document.getElementById('p-input-telefono').value;
        
        // Extraer firma si hay un canvas activo y no se está mostrando el preview
        var prev = document.getElementById('p-firma-preview');
        var firma = null;
        if (prev && prev.style.display === 'none') {
            if (perfilCanvas) firma = perfilCanvas.toDataURL();
        }

        var body = { nombre: nombre, telefono: telefono };
        if (firma) body.firma_digital = firma;
        
        var res = await fetch('/api/perfil/me', {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('fleet_token'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Error al guardar');
        
        localStorage.setItem('fleet_user', nombre);
        if (typeof window.verificarSesionGuardada === 'function') window.verificarSesionGuardada();
        
        alert('Datos actualizados correctamente.');
        perfilCargarDatos();
    } catch(e) {
        alert('Error: ' + e.message);
    }
};

window.perfilCambiarClave = async function() {
    var actual = document.getElementById('p-pwd-actual').value;
    var nueva = document.getElementById('p-pwd-nueva').value;
    
    if (!actual || !nueva) return alert('Debes completar ambas contraseñas.');
    
    try {
        var res = await fetch('/api/perfil/password', {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('fleet_token'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ actual: actual, nueva: nueva })
        });
        var json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error al cambiar clave');
        
        alert('Contraseña actualizada correctamente.');
        document.getElementById('p-pwd-actual').value = '';
        document.getElementById('p-pwd-nueva').value = '';
    } catch(e) {
        alert(e.message);
    }
};

window.perfilSetColor = async function(colorHex) {
    document.documentElement.style.setProperty('--crm-accent', colorHex);
    var btns = document.querySelectorAll('#p-color-picker .color-picker-btn');
    btns.forEach(b => b.classList.remove('active'));
    btns.forEach(b => {
        if (b.style.backgroundColor === colorHex || b.style.backgroundColor === hexToRgb(colorHex)) b.classList.add('active');
    });
    
    perfilData.preferencias = perfilData.preferencias || {};
    perfilData.preferencias.color = colorHex;
    await fetch('/api/perfil/preferencias', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('fleet_token'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferencias: perfilData.preferencias })
    });
};

window.perfilSetTheme = async function(theme) {
    if (window.applyDark) window.applyDark(theme);
    
    perfilData.preferencias = perfilData.preferencias || {};
    perfilData.preferencias.tema = theme;
    await fetch('/api/perfil/preferencias', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('fleet_token'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferencias: perfilData.preferencias })
    });
};

window.perfilSubirImagen = async function(input, tipo) {
    if (!input.files || input.files.length === 0) return;
    var file = input.files[0];
    
    try {
        // Generar URL S3
        var res = await fetch('/api/documentos-flota/upload-url?filename=' + encodeURIComponent(file.name) + '&contentType=' + encodeURIComponent(file.type), {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('fleet_token') }
        });
        var json = await res.json();
        if (!res.ok) throw new Error(json.error);
        
        // Subir a S3
        var putRes = await fetch(json.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file
        });
        if (!putRes.ok) throw new Error('Falló la subida a S3');
        
        // Actualizar Base de Datos
        var body = {};
        if (tipo === 'avatar') body.avatar_url = json.fileUrl;
        if (tipo === 'banner') body.banner_url = json.fileUrl;
        
        var updateRes = await fetch('/api/perfil/me', {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('fleet_token'), 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!updateRes.ok) throw new Error('Error al vincular imagen al perfil');
        
        perfilCargarDatos();
        
    } catch(e) {
        alert('Error: ' + e.message);
    }
};

window.perfilInitFirma = function() {
    perfilCanvas = document.getElementById('p-firma-canvas');
    if (!perfilCanvas) return;
    perfilCtx = perfilCanvas.getContext('2d');
    
    // Resize
    var rect = perfilCanvas.parentElement.getBoundingClientRect();
    perfilCanvas.width = rect.width;
    perfilCanvas.height = rect.height;
    
    perfilCtx.lineWidth = 3;
    perfilCtx.lineCap = 'round';
    perfilCtx.strokeStyle = '#000';
    
    function startPos(e) {
        perfilDibujando = true;
        draw(e);
    }
    function endPos() {
        perfilDibujando = false;
        perfilCtx.beginPath();
    }
    function draw(e) {
        if (!perfilDibujando) return;
        var r = perfilCanvas.getBoundingClientRect();
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        perfilCtx.lineTo(clientX - r.left, clientY - r.top);
        perfilCtx.stroke();
        perfilCtx.beginPath();
        perfilCtx.moveTo(clientX - r.left, clientY - r.top);
    }
    
    perfilCanvas.addEventListener('mousedown', startPos);
    perfilCanvas.addEventListener('mouseup', endPos);
    perfilCanvas.addEventListener('mousemove', draw);
    perfilCanvas.addEventListener('touchstart', function(e){ e.preventDefault(); startPos(e); }, {passive:false});
    perfilCanvas.addEventListener('touchend', function(e){ e.preventDefault(); endPos(); }, {passive:false});
    perfilCanvas.addEventListener('touchmove', function(e){ e.preventDefault(); draw(e); }, {passive:false});
};

window.perfilLimpiarFirma = function() {
    if (!perfilCtx || !perfilCanvas) return;
    perfilCtx.clearRect(0, 0, perfilCanvas.width, perfilCanvas.height);
    var prev = document.getElementById('p-firma-preview');
    if (prev) prev.style.display = 'none';
};

window.perfilAlternarFirma = function() {
    var prev = document.getElementById('p-firma-preview');
    if (prev && prev.style.display !== 'none') {
        prev.style.display = 'none';
        var btn = document.getElementById('btn-alternar-firma');
        if (btn) btn.innerText = 'Redibujar';
        if (perfilCtx && perfilCanvas) perfilCtx.clearRect(0, 0, perfilCanvas.width, perfilCanvas.height);
    }
};

function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    return 'rgb(' + r + ', ' + g + ', ' + b + ')';
}

// Inicializar Canvas
setTimeout(perfilInitFirma, 500);

// Cargar Datos
perfilCargarDatos();
