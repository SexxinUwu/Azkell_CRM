// ================================================================
// UTILS.JS — Herramientas, Componentes UI y Utilidades Globales
// ================================================================

// ─── Toasts y Alertas ───────────────────────────────────────────
window.mostrarToast = function(mensaje, tipo, duracion) {
    tipo     = tipo     || 'success';
    duracion = duracion || 3500;
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons  = { success:'bi-check-circle-fill', error:'bi-x-circle-fill', warning:'bi-exclamation-triangle-fill', info:'bi-info-circle-fill' };
    const colors = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#3b82f6' };
    const color  = colors[tipo] || colors.success;
    const icon   = icons[tipo]  || icons.success;
    const id     = 'toast-' + Date.now();

    const t = document.createElement('div');
    t.className = 'global-toast';
    t.id = id;
    t.style.setProperty('--toast-dur', duracion + 'ms');
    t.innerHTML =
        '<i class="bi ' + icon + ' toast-icon" style="color:' + color + '"></i>' +
        '<span class="toast-msg">' + mensaje + '</span>' +
        '<button class="toast-close" onclick="document.getElementById(\'' + id + '\').remove()" aria-label="Cerrar"><i class="bi bi-x"></i></button>' +
        '<div class="toast-progress" style="background:' + color + '"></div>';

    container.appendChild(t);
    requestAnimationFrame(function() { requestAnimationFrame(function() { t.classList.add('show'); }); });

    setTimeout(function() {
        t.classList.remove('show');
        setTimeout(function() { if (t.parentNode) t.remove(); }, 300);
    }, duracion);
};

// Alias Bootstrap-style: 'danger' → 'error', resto pasa directo
window.mostrarAlerta = function(mensaje, tipo) {
    var t = (tipo === 'danger') ? 'error' : (tipo || 'info');
    window.mostrarToast(mensaje, t);
};

// Override global de window.alert → redirige a toast automáticamente
(function() {
    var _nativeAlert = window.alert;
    window.alert = function(msg) {
        var container = document.getElementById('toast-container');
        if (!container || typeof window.mostrarToast !== 'function') { _nativeAlert(msg); return; }
        var s = String(msg || '').replace(/\n/g, '<br>');
        var tipo = 'info';
        if (/^(error|❌|✗)/i.test(s))                                           tipo = 'error';
        else if (/✅|éxito|completad|guardad|eliminad|registrad|importad/i.test(s)) tipo = 'success';
        else if (/⚠️|warning|obligatorio|primero|vacío|inválido/i.test(s))      tipo = 'warning';
        var dur = tipo === 'error' ? 5000 : tipo === 'success' ? 3500 : 4000;
        window.mostrarToast(s, tipo, dur);
    };
})();

// ─── Componentes UI Dinámicos ───────────────────────────────────
window.animarContador = function(el, valorFinal, duracion) {
    if (!el || isNaN(valorFinal)) return;
    duracion = duracion || 800;
    if (document.body.classList.contains('reduce-motion')) { el.textContent = valorFinal; return; }
    var start = null;
    function step(ts) {
        if (!start) start = ts;
        var progress = Math.min((ts - start) / duracion, 1);
        var eased    = 1 - Math.pow(1 - progress, 3); // ease-out cúbico
        el.textContent = Math.round(eased * valorFinal);
        if (progress < 1) { requestAnimationFrame(step); }
        else { el.textContent = valorFinal; el.classList.add('counter-done'); setTimeout(function() { el.classList.remove('counter-done'); }, 350); }
    }
    requestAnimationFrame(step);
};

window.sparklineSVG = function(data, color) {
    if (!data || data.length < 2) return '';
    var min = Math.min.apply(null, data);
    var max = Math.max.apply(null, data);
    var range = max - min || 1;
    var W = 80, H = 28, pad = 2;
    var pts = data.map(function(v, i) {
        var x = (i / (data.length - 1)) * W;
        var y = H - pad - ((v - min) / range) * (H - pad * 2);
        return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var fill = (color || '#007aff') + '22';
    var lastPt = data.map(function(v, i) {
        var x = (i / (data.length - 1)) * W;
        var y = H - pad - ((v - min) / range) * (H - pad * 2);
        return { x: parseFloat(x.toFixed(1)), y: parseFloat(y.toFixed(1)) };
    });
    var areaPath = 'M' + lastPt[0].x + ',' + H + ' L' + pts.split(' ').map(function(p) { return p; }).join(' L') + ' L' + lastPt[lastPt.length-1].x + ',' + H + ' Z';
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="overflow:visible">' +
        '<path d="' + areaPath + '" fill="' + fill + '" />' +
        '<polyline points="' + pts + '" fill="none" stroke="' + (color || '#007aff') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';
};

window.mostrarSkeleton = function(containerId, tipo, count) {
    var el = document.getElementById(containerId);
    if (!el) return;
    count = count || 5;
    var html = '';
    if (tipo === 'cards') {
        html = '<div class="row g-3">';
        for (var i = 0; i < count; i++) {
            html += '<div class="col-6 col-md-3 skeleton-card-wrap"><div class="skeleton"></div></div>';
        }
        html += '</div>';
    } else if (tipo === 'table') {
        var widths = [0.4, 2, 1, 1, 0.6];
        for (var i = 0; i < count; i++) {
            html += '<div class="skeleton-row">';
            widths.forEach(function(f) {
                html += '<div class="skeleton" style="flex:' + f + ';height:30px;border-radius:4px"></div>';
            });
            html += '</div>';
        }
    } else {
        var pcts = [100, 75, 90, 60, 82, 70, 95, 55];
        for (var i = 0; i < count; i++) {
            html += '<div class="skeleton" style="height:13px;width:' + pcts[i % pcts.length] + '%;border-radius:4px;margin-bottom:7px"></div>';
        }
    }
    el.innerHTML = html;
};

window.generarEstadoVacio = function(icono, titulo, descripcion, compacto) {
    icono       = icono       || 'bi-inbox';
    titulo      = titulo      || 'Sin datos';
    descripcion = descripcion || 'No hay registros para mostrar.';
    var cls = compacto ? 'empty-state empty-state-sm' : 'empty-state';
    return '<div class="' + cls + '">' +
        '<i class="bi ' + icono + ' empty-icon"></i>' +
        '<h5>' + titulo + '</h5>' +
        '<p>' + descripcion + '</p>' +
        '</div>';
};

// ─── Avatares Generados ─────────────────────────────────────────
window.generarAvatar = function(nombre, size) {
    nombre = nombre || 'U';
    size   = size   || 36;
    var initials = nombre.trim().split(/\s+/).map(function(w){ return w[0]; }).slice(0,2).join('').toUpperCase();
    var palette  = ['#2563eb','#7c3aed','#db2777','#ea580c','#16a34a','#0891b2','#9333ea','#c2410c'];
    var idx      = nombre.split('').reduce(function(a,c){ return a + c.charCodeAt(0); }, 0) % palette.length;
    var color    = palette[idx];
    var r        = Math.round(size / 3);
    return '<div class="user-avatar" style="width:' + size + 'px;height:' + size + 'px;background:' + color + ';border-radius:' + r + 'px;display:inline-flex;align-items:center;justify-content:center;font-size:' + Math.round(size * 0.38) + 'px;font-weight:700;color:#fff;flex-shrink:0;">' + initials + '</div>';
};

window._actualizarAvatares = function(nombre) {
    var els = document.querySelectorAll('.js-user-avatar');
    for (var i = 0; i < els.length; i++) {
        var sz = parseInt(els[i].getAttribute('data-size') || '36');
        els[i].outerHTML = window.generarAvatar(nombre, sz).replace('class="user-avatar"', 'class="user-avatar js-user-avatar" data-size="' + sz + '"');
    }
};

// ─── Utilidades ─────────────────────────────────────────────────
window.copiarTexto = function(texto, btnEl) {
    if (!navigator.clipboard) {
        window.mostrarToast('Portapapeles no disponible', 'warning'); return;
    }
    navigator.clipboard.writeText(texto).then(function() {
        window.mostrarToast('¡Copiado al portapapeles!', 'success', 2000);
        if (btnEl) {
            var orig = btnEl.innerHTML;
            btnEl.innerHTML = '<i class="bi bi-check-lg" style="color:#10b981"></i>';
            btnEl.disabled = true;
            setTimeout(function() { btnEl.innerHTML = orig; btnEl.disabled = false; }, 1800);
        }
    }).catch(function() { window.mostrarToast('No se pudo copiar', 'error', 2000); });
};

window.initColPicker = function(containerId, tableId, cols, lsKey) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var saved = JSON.parse(localStorage.getItem(lsKey) || 'null');
    if (saved) {
        cols.forEach(function(c) { if (saved[c.idx] !== undefined) c.visible = saved[c.idx]; });
    }
    window._applyColVis(tableId, cols);
    var items = cols.map(function(c) {
        return '<li><label class="dropdown-item d-flex align-items-center gap-2 small py-1" onclick="event.stopPropagation()">'
            + '<input type="checkbox" class="form-check-input m-0" ' + (c.visible ? 'checked' : '')
            + ' onchange="window._toggleCol(\'' + tableId + '\',' + c.idx + ',this.checked,\'' + lsKey + '\')">'
            + c.label + '</label></li>';
    }).join('');
    container.innerHTML = '<div class="dropdown">'
        + '<button class="btn btn-sm btn-outline-secondary" data-bs-toggle="dropdown" title="Columnas visibles">'
        + '<i class="bi bi-layout-three-columns"></i></button>'
        + '<ul class="dropdown-menu dropdown-menu-end shadow">'
        + '<li><h6 class="dropdown-header small">Mostrar columnas</h6></li>'
        + items + '</ul></div>';
};

window._applyColVis = function(tableId, cols) {
    var table = document.getElementById(tableId);
    if (!table) return;
    cols.forEach(function(c) {
        table.querySelectorAll('tr > *:nth-child(' + (c.idx + 1) + ')').forEach(function(cell) {
            cell.classList.toggle('d-none', !c.visible);
        });
    });
};

window._toggleCol = function(tableId, colIdx, visible, lsKey) {
    var table = document.getElementById(tableId);
    if (!table) return;
    table.querySelectorAll('tr > *:nth-child(' + (colIdx + 1) + ')').forEach(function(cell) {
        cell.classList.toggle('d-none', !visible);
    });
    var state = JSON.parse(localStorage.getItem(lsKey) || '{}');
    state[colIdx] = visible;
    localStorage.setItem(lsKey, JSON.stringify(state));
};

window.initSwipeCards = function(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var startX, startY, target;
    var SWIPE_THRESHOLD = 60;

    function closeSwiped(except) {
        container.querySelectorAll('.card-premium.swiped').forEach(function(c) {
            if (c !== except) c.classList.remove('swiped');
        });
    }

    container.addEventListener('touchstart', function(e) {
        var card = e.target.closest('.card-premium');
        if (!card) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        target = card;
    }, {passive: true});

    container.addEventListener('touchmove', function(e) {
        if (!target) return;
        var dx = e.touches[0].clientX - startX;
        var dy = e.touches[0].clientY - startY;
        if (Math.abs(dy) > Math.abs(dx) + 10) { target = null; return; }
        if (dx < -SWIPE_THRESHOLD) {
            closeSwiped(target);
            target.classList.add('swiped');
        } else if (dx > 20 && target.classList.contains('swiped')) {
            target.classList.remove('swiped');
        }
    }, {passive: true});

    container.addEventListener('touchend', function() { target = null; }, {passive: true});

    // Cerrar al click fuera del área de acciones
    container.addEventListener('click', function(e) {
        if (!e.target.closest('.card-swipe-actions')) {
            closeSwiped(null);
        }
    });
};