// ================================================================
// Módulo Productividad Personal — Azkell Fleet
// Ruta SPA: mantenimiento/productividad
// Entry point: window.init_productividad()
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.prodDataTrabajos   = window.prodDataTrabajos   || [];
window.prodDataAgrupado   = window.prodDataAgrupado   || [];
window.prodDataFiltrado   = window.prodDataFiltrado   || [];

// ── Entry point ─────────────────────────────────────────────────
window.init_productividad = function() {
    prodCargar();
};

// ── Carga de datos ───────────────────────────────────────────────
window.prodCargar = function() {
    var tbody = document.getElementById('prodTbody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="3" class="prod-empty">' +
            '<span class="spinner-border spinner-border-sm me-2"></span>Cargando datos…</td></tr>';
    }

    fetch('/api/ot-trabajos')
        .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function(data) {
            // Solo estado Aprobado
            var aprobados = Array.isArray(data)
                ? data.filter(function(t) { return (t.estado || '') === 'Aprobado'; })
                : [];
            window.prodDataTrabajos = aprobados;
            window.prodDataAgrupado = prodAgrupar(aprobados);
            window.prodDataFiltrado = window.prodDataAgrupado.slice();
            prodRenderTabla();
        })
        .catch(function(err) {
            console.error('[Productividad] Error:', err);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="3" class="prod-empty text-danger">' +
                    '<i class="bi bi-exclamation-circle me-2"></i>Error al cargar datos. ' +
                    '<button class="btn btn-sm btn-link p-0" onclick="prodCargar()">Reintentar</button></td></tr>';
            }
        });
};

// ── Agrupación por trabajador ────────────────────────────────────
function prodAgrupar(trabajos) {
    var mapa = {};
    trabajos.forEach(function(t) {
        // "trabajadores" puede ser "Juan, Pedro" — separar por coma
        var nombres = (t.trabajadores || '').split(',').map(function(n) { return n.trim(); }).filter(Boolean);
        nombres.forEach(function(nombre) {
            if (!mapa[nombre]) {
                mapa[nombre] = { nombre: nombre, cantidad: 0, horasEfectivas: 0 };
            }
            mapa[nombre].cantidad++;
            mapa[nombre].horasEfectivas += prodGetHoras(t);
        });
    });
    // Convertir a array y ordenar por nombre
    return Object.values(mapa).sort(function(a, b) {
        return a.nombre.localeCompare(b.nombre, 'es');
    });
}

// ── Cálculo de horas efectivas ───────────────────────────────────
window.prodGetHoras = function(trabajo) {
    var fInicio = trabajo.f_inicio ? new Date(trabajo.f_inicio) : null;
    var fFin    = trabajo.f_fin    ? new Date(trabajo.f_fin)    : null;
    if (!fInicio || !fFin || isNaN(fInicio) || isNaN(fFin)) return 0;

    var durMs = fFin.getTime() - fInicio.getTime();
    if (durMs <= 0) return 0;
    var durHrs = durMs / 3600000;

    // Leer horario de refrigerio configurado en UI
    var elRefInicio = document.getElementById('prodRefInicio');
    var elRefFin    = document.getElementById('prodRefFin');
    var refInicioStr = elRefInicio ? elRefInicio.value : '13:00';
    var refFinStr    = elRefFin   ? elRefFin.value    : '14:00';

    // Construir fechas de refrigerio usando la misma fecha de f_inicio
    var dateBase = new Date(fInicio);
    var refParts1 = refInicioStr.split(':');
    var refParts2 = refFinStr.split(':');

    var refInicioDt = new Date(dateBase);
    refInicioDt.setHours(parseInt(refParts1[0], 10), parseInt(refParts1[1], 10), 0, 0);

    var refFinDt = new Date(dateBase);
    refFinDt.setHours(parseInt(refParts2[0], 10), parseInt(refParts2[1], 10), 0, 0);

    // Calcular solapamiento entre [fInicio, fFin] y [refInicio, refFin]
    var solapaInicio = Math.max(fInicio.getTime(), refInicioDt.getTime());
    var solapaFin    = Math.min(fFin.getTime(),    refFinDt.getTime());
    if (solapaFin > solapaInicio) {
        var descuentoHrs = (solapaFin - solapaInicio) / 3600000;
        durHrs -= descuentoHrs;
    }

    return Math.max(0, Math.round(durHrs * 100) / 100);
};

// ── Render tabla ─────────────────────────────────────────────────
window.prodRenderTabla = function() {
    // Re-agrupar con el horario actualizado si ya hay datos
    if (window.prodDataTrabajos.length > 0) {
        window.prodDataAgrupado = prodAgrupar(window.prodDataTrabajos);
        // Re-aplicar filtro si hay texto en buscador
        var buscador = document.getElementById('prodBuscador');
        var txt = buscador ? buscador.value.trim().toLowerCase() : '';
        window.prodDataFiltrado = txt
            ? window.prodDataAgrupado.filter(function(r) {
                return r.nombre.toLowerCase().includes(txt);
              })
            : window.prodDataAgrupado.slice();
    }

    var tbody = document.getElementById('prodTbody');
    if (!tbody) return;

    if (window.prodDataFiltrado.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="prod-empty">' +
            '<i class="bi bi-person-x me-2"></i>No hay datos para mostrar.</td></tr>';
        var resumen = document.getElementById('prodResumen');
        if (resumen) resumen.textContent = '';
        return;
    }

    var html = '';
    window.prodDataFiltrado.forEach(function(row) {
        var iniciales = row.nombre.split(' ').map(function(p) { return p[0] || ''; }).join('').toUpperCase().slice(0, 2);
        html += '<tr>' +
            '<td><span class="prod-avatar">' + iniciales + '</span>' + prodEsc(row.nombre) + '</td>' +
            '<td class="prod-num">' + row.cantidad + '</td>' +
            '<td class="prod-hrs">' + row.horasEfectivas.toFixed(2) + ' hrs</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;

    // Resumen
    var totalTrab = window.prodDataFiltrado.length;
    var totalHrs  = window.prodDataFiltrado.reduce(function(a, r) { return a + r.horasEfectivas; }, 0);
    var resumen = document.getElementById('prodResumen');
    if (resumen) {
        resumen.textContent = totalTrab + ' técnico(s) · ' + totalHrs.toFixed(2) + ' hrs efectivas totales';
    }
};

// ── Filtrar por buscador ─────────────────────────────────────────
window.prodFiltrar = function() {
    var buscador = document.getElementById('prodBuscador');
    var txt = buscador ? buscador.value.trim().toLowerCase() : '';
    window.prodDataFiltrado = txt
        ? window.prodDataAgrupado.filter(function(r) {
            return r.nombre.toLowerCase().includes(txt);
          })
        : window.prodDataAgrupado.slice();
    prodRenderTabla();
};

// ── Exportar PDF ─────────────────────────────────────────────────
window.prodExportarPDF = function() {
    // Si existe la función global exportarAPDF, usar esa
    if (typeof window.exportarAPDF === 'function') {
        window.exportarAPDF(document.getElementById('moduloProductividad'), 'productividad_personal');
        return;
    }
    // Fallback: imprimir con window.print
    window.print();
};

// ── Exportar Excel ───────────────────────────────────────────────
window.prodExportarExcel = function() {
    // Construir tabla HTML temporal con los datos filtrados
    var rows = window.prodDataFiltrado;
    if (!rows || rows.length === 0) {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('No hay datos para exportar', 'warning');
        }
        return;
    }

    var html = '<table><thead><tr>' +
        '<th>Trabajador / Técnico</th>' +
        '<th>Total Trabajos Asignados</th>' +
        '<th>Horas Efectivas Acumuladas</th>' +
        '</tr></thead><tbody>';

    rows.forEach(function(r) {
        html += '<tr><td>' + r.nombre + '</td><td>' + r.cantidad + '</td><td>' + r.horasEfectivas.toFixed(2) + '</td></tr>';
    });
    html += '</tbody></table>';

    var tmpId = 'prodTablaExportTmp';
    var tmp = document.createElement('div');
    tmp.id = tmpId;
    tmp.style.display = 'none';
    tmp.innerHTML = html;
    document.body.appendChild(tmp);

    if (typeof window.descargarExcelDinamico === 'function') {
        window.descargarExcelDinamico(tmpId, 'productividad_personal');
    } else {
        // Fallback: blob CSV
        var csv = 'Trabajador,Trabajos,Horas Efectivas\n';
        rows.forEach(function(r) {
            csv += '"' + r.nombre + '",' + r.cantidad + ',' + r.horasEfectivas.toFixed(2) + '\n';
        });
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href     = url;
        a.download = 'productividad_personal.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    document.body.removeChild(tmp);
};

// ── Helper: escapar HTML ─────────────────────────────────────────
function prodEsc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
