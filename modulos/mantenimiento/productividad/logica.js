// ================================================================
// Módulo Productividad Personal — Azkell Fleet
// Ruta SPA: mantenimiento/productividad
// Entry point: window.init_productividad()
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.prodDataTrabajos  = window.prodDataTrabajos  || [];
window.prodDataDia       = window.prodDataDia       || [];  // filtrados al día seleccionado
window.prodDetalleWorker = window.prodDetalleWorker || null;
var PROD_META_HORAS = 9; // meta diaria en horas

// ── Entry point ─────────────────────────────────────────────────
window.init_productividad = function() {
    // NO poner fecha por defecto — muestra todos los trabajos al inicio
    window.prodDetalleWorker = null;
    prodCargar();
};

// ── Carga de datos ───────────────────────────────────────────────
window.prodCargar = function() {
    var tbody = document.getElementById('prodTbody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="4" class="prod-empty">' +
            '<span class="spinner-border spinner-border-sm me-2"></span>Cargando datos…</td></tr>';
    }
    fetch('/api/ot-trabajos')
        .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function(data) {
            window.prodDataTrabajos = Array.isArray(data) ? data : [];
            prodAplicarFiltros();
        })
        .catch(function(err) {
            console.error('[Productividad] Error:', err);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="4" class="prod-empty text-danger">' +
                    '<i class="bi bi-exclamation-circle me-2"></i>Error al cargar datos. ' +
                    '<button class="btn btn-sm btn-link p-0" onclick="window.prodCargar()">Reintentar</button></td></tr>';
            }
        });
};

// ── Extraer nombre del trabajador ─────────────────────────────────
function prodGetNombre(t) {
    try {
        var det = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {});
        if (det.personal && det.personal.trim()) return det.personal.trim();
    } catch(e) {}
    return (t.tecnico || '').trim() || 'Sin asignar';
}

// ── Aplicar filtros (fecha + buscador) ───────────────────────────
window.prodAplicarFiltros = function() {
    var fechaEl  = document.getElementById('prodFecha');
    var buscEl   = document.getElementById('prodBuscador');
    var fechaSel = fechaEl  ? fechaEl.value.trim()  : '';
    var buscar   = buscEl   ? buscEl.value.trim().toLowerCase() : '';

    // Filtrar al día seleccionado
    var datos = window.prodDataTrabajos.filter(function(t) {
        if (!fechaSel) return true;
        var fT = t.fecha_trabajo ? String(t.fecha_trabajo).split('T')[0] : '';
        return fT === fechaSel;
    });

    // Agrupar por trabajador
    var mapa = {};
    datos.forEach(function(t) {
        var nombre = prodGetNombre(t);
        // Un trabajo puede tener varios trabajadores separados por coma
        var nombres = nombre.split(',').map(function(n) { return n.trim(); }).filter(Boolean);
        nombres.forEach(function(n) {
            if (!mapa[n]) mapa[n] = { nombre: n, trabajos: [] };
            mapa[n].trabajos.push(t);
        });
    });

    var lista = Object.values(mapa).sort(function(a, b) {
        return a.nombre.localeCompare(b.nombre, 'es');
    });

    // Aplicar buscador
    if (buscar) {
        lista = lista.filter(function(r) { return r.nombre.toLowerCase().includes(buscar); });
    }

    window.prodDataDia = lista;
    prodRenderTabla();

    // Si hay un detalle abierto, actualizar
    if (window.prodDetalleWorker) {
        var still = lista.find(function(r) { return r.nombre === window.prodDetalleWorker; });
        if (still) {
            prodAbrirDetalle(still);
        } else {
            prodCerrarDetalle();
        }
    }
};

// ── Parsear fecha sin conversión UTC→local ───────────────────────
function prodParseDate(iso) {
    if (!iso) return null;
    var s = String(iso).replace('Z', '').replace('+00:00', '');
    if (s.indexOf('T') === -1) s = s.replace(' ', 'T');
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

// ── Calcular horas efectivas de un trabajo ───────────────────────
window.prodGetHoras = function(t) {
    var fInicio = prodParseDate(t.fecha_trabajo);
    var fFin    = prodParseDate(t.fecha_salida);
    if (!fInicio || !fFin) return 0;
    var durMs = fFin.getTime() - fInicio.getTime();
    if (durMs <= 0) return 0;
    var durHrs = durMs / 3600000;

    // Descontar refrigerio
    var refInicioStr = ((document.getElementById('prodRefInicio') || {}).value) || '13:00';
    var refFinStr    = ((document.getElementById('prodRefFin')    || {}).value) || '14:00';
    var rI = refInicioStr.split(':'); var rF = refFinStr.split(':');

    var refInicioDt = new Date(fInicio); refInicioDt.setHours(+rI[0], +rI[1], 0, 0);
    var refFinDt    = new Date(fInicio); refFinDt.setHours(+rF[0], +rF[1], 0, 0);

    var solapaInicio = Math.max(fInicio.getTime(), refInicioDt.getTime());
    var solapaFin    = Math.min(fFin.getTime(),    refFinDt.getTime());
    if (solapaFin > solapaInicio) {
        durHrs -= (solapaFin - solapaInicio) / 3600000;
    }
    return Math.max(0, Math.round(durHrs * 100) / 100);
};

// ── Render tabla resumen ─────────────────────────────────────────
window.prodRenderTabla = function() {
    var tbody = document.getElementById('prodTbody');
    if (!tbody) return;

    var lista = window.prodDataDia || [];
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="prod-empty">' +
            '<i class="bi bi-person-x me-2" style="font-size:1.4rem;opacity:0.3"></i><br>No hay datos para mostrar.</td></tr>';
        var res = document.getElementById('prodResumen');
        if (res) res.textContent = '';
        return;
    }

    var html = '';
    lista.forEach(function(row) {
        var horas = row.trabajos.reduce(function(acc, t) { return acc + window.prodGetHoras(t); }, 0);
        var pct   = Math.min(100, (horas / PROD_META_HORAS) * 100);
        var colorBar = pct >= 100 ? '#16a34a' : pct >= 60 ? '#f59e0b' : '#ef4444';
        var iniciales = row.nombre.split(' ').map(function(p) { return p[0] || ''; }).join('').toUpperCase().slice(0, 2);
        var isActive = row.nombre === window.prodDetalleWorker;
        html += '<tr class="prod-row' + (isActive ? ' prod-row-active' : '') + '" onclick="window.prodAbrirDetalle(window.prodDataDia.find(function(r){return r.nombre===\'' + prodEsc(row.nombre).replace(/'/g,'\\\'') + '\'}))">' +
            '<td><span class="prod-avatar">' + prodEsc(iniciales) + '</span>' + prodEsc(row.nombre) + '</td>' +
            '<td class="prod-num">' + row.trabajos.length + '</td>' +
            '<td class="prod-hrs">' + horas.toFixed(2) + ' h</td>' +
            '<td style="min-width:140px;">' +
                '<div style="display:flex; align-items:center; gap:6px;">' +
                    '<div style="flex:1; background:var(--border); border-radius:4px; height:8px; overflow:hidden;">' +
                        '<div style="width:' + pct.toFixed(1) + '%; height:100%; background:' + colorBar + '; border-radius:4px; transition:width 0.4s;"></div>' +
                    '</div>' +
                    '<span style="font-size:0.72rem; font-weight:700; color:' + colorBar + '; white-space:nowrap;">' + pct.toFixed(0) + '%</span>' +
                '</div>' +
                '<div style="font-size:0.68rem; color:var(--subtext); margin-top:2px;">' + horas.toFixed(1) + 'h / ' + PROD_META_HORAS + 'h meta</div>' +
            '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;

    var totalHrs = lista.reduce(function(acc, r) {
        return acc + r.trabajos.reduce(function(a, t) { return a + window.prodGetHoras(t); }, 0);
    }, 0);
    var res = document.getElementById('prodResumen');
    if (res) res.textContent = lista.length + ' técnico(s) · ' + totalHrs.toFixed(2) + ' hrs efectivas';
};

// ── Panel detalle del trabajador ─────────────────────────────────
window.prodAbrirDetalle = function(row) {
    if (!row) return;
    window.prodDetalleWorker = row.nombre;
    prodRenderTabla();

    var titulo = document.getElementById('prod-det-titulo');
    if (titulo) titulo.textContent = row.nombre;

    var fechaEl = document.getElementById('prodFecha');
    var fechaSel = fechaEl ? fechaEl.value : '';
    var sub = document.getElementById('prod-det-sub');
    if (sub) sub.textContent = fechaSel ? 'Trabajos del ' + fechaSel : 'Todos los trabajos';

    var horas = row.trabajos.reduce(function(acc, t) { return acc + window.prodGetHoras(t); }, 0);
    var pct   = Math.min(100, (horas / PROD_META_HORAS) * 100);
    var colorBar = pct >= 100 ? '#16a34a' : pct >= 60 ? '#f59e0b' : '#ef4444';

    var html = '';
    // KPI resumen
    html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:1rem;">';
    html += '<div style="background:var(--bg); border-radius:8px; padding:10px 12px; border:1px solid var(--border); text-align:center;">';
    html += '<div style="font-size:1.6rem; font-weight:800; color:var(--primary,#5865F2);">' + row.trabajos.length + '</div>';
    html += '<div style="font-size:0.7rem; color:var(--subtext); text-transform:uppercase; font-weight:700;">Trabajos</div>';
    html += '</div>';
    html += '<div style="background:var(--bg); border-radius:8px; padding:10px 12px; border:1px solid var(--border); text-align:center;">';
    html += '<div style="font-size:1.6rem; font-weight:800; color:' + colorBar + ';">' + horas.toFixed(1) + 'h</div>';
    html += '<div style="font-size:0.7rem; color:var(--subtext); text-transform:uppercase; font-weight:700;">Horas Efectivas</div>';
    html += '</div>';
    html += '</div>';

    // Barra progreso grande
    html += '<div style="margin-bottom:1rem; padding:12px; background:var(--bg); border-radius:8px; border:1px solid var(--border);">';
    html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">';
    html += '<span style="font-size:0.75rem; font-weight:700; color:var(--subtext);">META DIARIA ' + PROD_META_HORAS + 'H</span>';
    html += '<span style="font-size:0.88rem; font-weight:800; color:' + colorBar + ';">' + pct.toFixed(0) + '%</span>';
    html += '</div>';
    html += '<div style="background:var(--border); border-radius:6px; height:12px; overflow:hidden;">';
    html += '<div style="width:' + pct.toFixed(1) + '%; height:100%; background:' + colorBar + '; border-radius:6px;"></div>';
    html += '</div>';
    html += '<div style="font-size:0.72rem; color:var(--subtext); margin-top:4px;">';
    if (pct >= 100) {
        html += '<i class="bi bi-check-circle-fill text-success me-1"></i>Meta completada (' + horas.toFixed(1) + 'h / ' + PROD_META_HORAS + 'h)';
    } else {
        var faltaHrs = Math.max(0, PROD_META_HORAS - horas).toFixed(1);
        html += '<i class="bi bi-clock me-1"></i>Faltan ' + faltaHrs + 'h para completar la meta';
    }
    html += '</div></div>';

    // Lista de trabajos
    html += '<div style="font-size:0.72rem; font-weight:800; text-transform:uppercase; color:var(--subtext); letter-spacing:0.05em; margin-bottom:6px;">Detalle de Trabajos</div>';
    if (!row.trabajos.length) {
        html += '<div style="text-align:center; color:var(--subtext); font-size:0.82rem; padding:1rem;">Sin trabajos registrados</div>';
    } else {
        row.trabajos.forEach(function(t) {
            var hT = window.prodGetHoras(t);
            var fmtFecha = function(iso) {
                if (!iso) return '—';
                var d = prodParseDate(iso);
                if (!d) return String(iso).split('T')[0];
                return d.toLocaleDateString('es-PE', { day:'2-digit', month:'short' }) + ' ' +
                       d.toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });
            };
            html += '<div style="border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px; background:var(--surface);">';
            html += '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px;">';
            html += '<div style="font-size:0.75rem; font-weight:700; color:var(--primary,#5865F2);">' + prodEsc(t.ticket_visita || '—') + '</div>';
            html += '<span style="font-size:0.78rem; font-weight:800; color:#16a34a; white-space:nowrap;">' + hT.toFixed(1) + ' h</span>';
            html += '</div>';
            html += '<div style="font-size:0.8rem; color:var(--text); margin-top:3px; white-space:normal;">' + prodEsc(t.trabajo_realizado || '—') + '</div>';
            if (t.placa) {
                html += '<div style="font-size:0.72rem; color:var(--subtext); margin-top:3px;"><i class="bi bi-truck me-1"></i>' + prodEsc(t.placa) + '</div>';
            }
            html += '<div style="font-size:0.71rem; color:var(--subtext); margin-top:3px; display:flex; gap:8px;">';
            html += '<span><i class="bi bi-play-circle me-1"></i>' + fmtFecha(t.fecha_trabajo) + '</span>';
            if (t.fecha_salida) {
                html += '<span><i class="bi bi-stop-circle me-1"></i>' + fmtFecha(t.fecha_salida) + '</span>';
            }
            html += '</div>';
            html += '</div>';
        });
    }

    var scroll = document.getElementById('prod-det-scroll');
    if (scroll) scroll.innerHTML = html;

    var panel = document.getElementById('prod-panel-detalle');
    if (panel) panel.classList.add('open');
};

window.prodCerrarDetalle = function() {
    var panel = document.getElementById('prod-panel-detalle');
    if (panel) panel.classList.remove('open');
    window.prodDetalleWorker = null;
    prodRenderTabla();
};

// ── Filtrar (buscador + fecha) ────────────────────────────────────
window.prodFiltrar = function() {
    prodAplicarFiltros();
};

// ── Exportar PDF ─────────────────────────────────────────────────
window.prodExportarPDF = function() {
    if (typeof window.exportarAPDF === 'function') {
        window.exportarAPDF(document.getElementById('moduloProductividad'), 'productividad_personal');
        return;
    }
    window.print();
};

// ── Exportar Excel ───────────────────────────────────────────────
window.prodExportarExcel = function() {
    var lista = window.prodDataDia || [];
    if (!lista.length) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('No hay datos para exportar', 'warning');
        return;
    }
    var fechaEl = document.getElementById('prodFecha');
    var fechaSel = fechaEl ? fechaEl.value : '';

    var html = '<table><thead><tr>' +
        '<th>Trabajador / Técnico</th><th>Fecha</th>' +
        '<th>Total Trabajos</th><th>Horas Efectivas</th><th>% Meta (' + PROD_META_HORAS + 'h)</th>' +
        '</tr></thead><tbody>';
    lista.forEach(function(r) {
        var horas = r.trabajos.reduce(function(acc, t) { return acc + window.prodGetHoras(t); }, 0);
        var pct   = Math.min(100, (horas / PROD_META_HORAS) * 100);
        html += '<tr><td>' + r.nombre + '</td><td>' + (fechaSel || 'Todos') + '</td>' +
            '<td>' + r.trabajos.length + '</td><td>' + horas.toFixed(2) + '</td><td>' + pct.toFixed(0) + '%</td></tr>';
    });
    html += '</tbody></table>';

    var tmpId = 'prodTablaExportTmp';
    var tmp = document.createElement('div');
    tmp.id = tmpId; tmp.style.display = 'none'; tmp.innerHTML = html;
    document.body.appendChild(tmp);
    if (typeof window.descargarExcelDinamico === 'function') {
        window.descargarExcelDinamico(tmpId, 'productividad_' + (fechaSel || 'general'));
    }
    document.body.removeChild(tmp);
};

function prodEsc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
