// ================================================================
// Módulo Finanzas Taller — Azkell Fleet
// Ruta SPA: mantenimiento/finanzas-taller
// Entry point: window.init_finanzas_taller()
// ================================================================

// ── Estado global ────────────────────────────────────────────────
window.finDataOts       = window.finDataOts       || [];
window.finDataTrabajos  = window.finDataTrabajos  || [];
window.finDataMateriales= window.finDataMateriales|| [];
window.finDataFiltrado  = window.finDataFiltrado  || [];

// ── Entry point ─────────────────────────────────────────────────
window.init_finanzas_taller = function() {
    finCargar();
};

// ── Carga de datos ───────────────────────────────────────────────
window.finCargar = function() {
    var tbody = document.getElementById('finTbody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" class="fin-empty">' +
            '<span class="spinner-border spinner-border-sm me-2"></span>Cargando datos…</td></tr>';
    }

    Promise.all([
        fetch('/api/ordenes-trabajo').then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status + ' /api/ordenes-trabajo');
            return r.json();
        }),
        fetch('/api/ot-trabajos').then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status + ' /api/ot-trabajos');
            return r.json();
        }),
        fetch('/api/ot-materiales').then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status + ' /api/ot-materiales');
            return r.json();
        })
    ])
    .then(function(results) {
        window.finDataOts        = Array.isArray(results[0]) ? results[0] : [];
        window.finDataTrabajos   = Array.isArray(results[1]) ? results[1] : [];
        window.finDataMateriales = Array.isArray(results[2]) ? results[2] : [];
        finFiltrar();
    })
    .catch(function(err) {
        console.error('[Finanzas Taller] Error:', err);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="fin-empty text-danger">' +
                '<i class="bi bi-exclamation-circle me-2"></i>Error al cargar datos. ' +
                '<button class="btn btn-sm btn-link p-0" onclick="finCargar()">Reintentar</button></td></tr>';
        }
    });
};

// ── Filtrar y calcular ───────────────────────────────────────────
window.finFiltrar = function() {
    var elTipo   = document.getElementById('finFiltroTipo');
    var elPlaca  = document.getElementById('finFiltroPlaca');
    var elMes    = document.getElementById('finFiltroMes');
    var elDesde  = document.getElementById('finFiltroDesdeFecha');
    var elHasta  = document.getElementById('finFiltroHastaFecha');

    var tipo  = elTipo  ? elTipo.value.trim()  : '';
    var placa = elPlaca ? elPlaca.value.trim().toUpperCase() : '';
    var mes   = elMes   ? elMes.value.trim()   : '';   // "YYYY-MM"
    var desde = elDesde ? elDesde.value.trim()  : '';
    var hasta = elHasta ? elHasta.value.trim()  : '';

    // Solo OTs Aprobadas o Cerradas
    var aprobadas = window.finDataOts.filter(function(ot) {
        var ap = (ot.aprobacion || '').trim();
        return ap === 'Aprobada' || ap === 'Cerrada';
    });

    // Construir filas con costos
    var filas = aprobadas.map(function(ot) {
        var detalles = {};
        try {
            if (ot.detalles_json) {
                detalles = typeof ot.detalles_json === 'string'
                    ? JSON.parse(ot.detalles_json)
                    : ot.detalles_json;
            }
        } catch(e) { detalles = {}; }

        var tipoOt  = (detalles.tipo_ot || '').trim();
        var fInicio = detalles.f_inicio || ot.creado_en || null;

        // COSTO MANO DE OBRA: suma de ot-trabajos con estado=Aprobado y mismo ticket_ot
        var costoMO = window.finDataTrabajos
            .filter(function(t) {
                return String(t.ticket_ot) === String(ot.ticket_entrada) &&
                       (t.estado || '') === 'Aprobado';
            })
            .reduce(function(acc, t) { return acc + parseFloat(t.costo || 0); }, 0);

        // COSTO REPUESTOS: suma de ot-materiales con estado=Despachado y mismo ticket_ot
        var costoRep = window.finDataMateriales
            .filter(function(m) {
                return String(m.ticket_ot) === String(ot.ticket_entrada) &&
                       (m.estado || '') === 'Despachado';
            })
            .reduce(function(acc, m) { return acc + parseFloat(m.costo_total || 0); }, 0);

        return {
            ticket:   ot.ticket_entrada || ot.id_ot || '—',
            placa:    (ot.placa || '').toUpperCase(),
            tipoOt:   tipoOt,
            costoMO:  Math.round(costoMO  * 100) / 100,
            costoRep: Math.round(costoRep * 100) / 100,
            costoTotal: Math.round((costoMO + costoRep) * 100) / 100,
            fInicio:  fInicio
        };
    });

    // Aplicar filtros
    if (tipo) {
        filas = filas.filter(function(f) { return f.tipoOt === tipo; });
    }
    if (placa) {
        filas = filas.filter(function(f) { return f.placa.includes(placa); });
    }
    if (mes) {
        filas = filas.filter(function(f) {
            if (!f.fInicio) return false;
            return String(f.fInicio).slice(0, 7) === mes;
        });
    }
    if (desde) {
        var dDesde = new Date(desde);
        filas = filas.filter(function(f) {
            if (!f.fInicio) return false;
            return new Date(f.fInicio) >= dDesde;
        });
    }
    if (hasta) {
        var dHasta = new Date(hasta + 'T23:59:59');
        filas = filas.filter(function(f) {
            if (!f.fInicio) return false;
            return new Date(f.fInicio) <= dHasta;
        });
    }

    window.finDataFiltrado = filas;
    finCalcularCards(filas);
    finRenderTabla(filas);
};

// ── Recalcular cards superiores ──────────────────────────────────
window.finCalcularCards = function(filas) {
    var total = 0, prev = 0, corr = 0;
    filas.forEach(function(f) {
        total += f.costoTotal;
        if (f.tipoOt === 'Preventivo') prev += f.costoTotal;
        if (f.tipoOt === 'Correctivo') corr += f.costoTotal;
    });

    var elTotal = document.getElementById('finCardTotal');
    var elPrev  = document.getElementById('finCardPrev');
    var elCorr  = document.getElementById('finCardCorr');

    if (elTotal) elTotal.textContent = 'S/. ' + total.toFixed(2);
    if (elPrev)  elPrev.textContent  = 'S/. ' + prev.toFixed(2);
    if (elCorr)  elCorr.textContent  = 'S/. ' + corr.toFixed(2);
};

// ── Render tabla ─────────────────────────────────────────────────
window.finRenderTabla = function(filas) {
    var tbody = document.getElementById('finTbody');
    if (!tbody) return;

    if (!filas || filas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="fin-empty">' +
            '<i class="bi bi-inbox me-2"></i>No hay OTs que coincidan con los filtros.</td></tr>';
        return;
    }

    var html = '';
    filas.forEach(function(f) {
        var tipoBadge = f.tipoOt === 'Preventivo'
            ? '<span class="fin-badge-prev">Preventivo</span>'
            : f.tipoOt === 'Correctivo'
                ? '<span class="fin-badge-corr">Correctivo</span>'
                : finEsc(f.tipoOt || '—');

        html += '<tr>' +
            '<td><strong>' + finEsc(String(f.ticket)) + '</strong></td>' +
            '<td>' + finEsc(f.placa || '—') + '</td>' +
            '<td>' + tipoBadge + '</td>' +
            '<td class="fin-money">S/. ' + f.costoMO.toFixed(2)  + '</td>' +
            '<td class="fin-money">S/. ' + f.costoRep.toFixed(2) + '</td>' +
            '<td class="fin-total">S/. ' + f.costoTotal.toFixed(2) + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
};

// ── Limpiar filtros ──────────────────────────────────────────────
window.finLimpiarFiltros = function() {
    var ids = ['finFiltroTipo','finFiltroPlaca','finFiltroMes','finFiltroDesdeFecha','finFiltroHastaFecha'];
    ids.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    finFiltrar();
};

// ── Exportar Excel ───────────────────────────────────────────────
window.finExportarExcel = function() {
    var filas = window.finDataFiltrado;
    if (!filas || filas.length === 0) {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('No hay datos para exportar', 'warning');
        }
        return;
    }

    var html = '<table><thead><tr>' +
        '<th>N° OT</th><th>Placa</th><th>Tipo OT</th>' +
        '<th>Costo Mano de Obra</th><th>Costo Repuestos</th><th>Costo Total</th>' +
        '</tr></thead><tbody>';

    filas.forEach(function(f) {
        html += '<tr>' +
            '<td>' + f.ticket  + '</td>' +
            '<td>' + f.placa   + '</td>' +
            '<td>' + f.tipoOt  + '</td>' +
            '<td>' + f.costoMO.toFixed(2)   + '</td>' +
            '<td>' + f.costoRep.toFixed(2)  + '</td>' +
            '<td>' + f.costoTotal.toFixed(2) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';

    var tmpId = 'finTablaExportTmp';
    var tmp = document.createElement('div');
    tmp.id = tmpId;
    tmp.style.display = 'none';
    tmp.innerHTML = html;
    document.body.appendChild(tmp);

    if (typeof window.descargarExcelDinamico === 'function') {
        window.descargarExcelDinamico(tmpId, 'finanzas_taller');
    } else {
        // Fallback CSV
        var csv = 'N° OT,Placa,Tipo OT,Costo MO,Costo Repuestos,Costo Total\n';
        filas.forEach(function(f) {
            csv += [f.ticket, f.placa, f.tipoOt,
                    f.costoMO.toFixed(2), f.costoRep.toFixed(2), f.costoTotal.toFixed(2)
                   ].join(',') + '\n';
        });
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href     = url;
        a.download = 'finanzas_taller.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    document.body.removeChild(tmp);
};

// ── Exportar PDF ─────────────────────────────────────────────────
window.finExportarPDF = function() {
    if (typeof window.exportarAPDF === 'function') {
        window.exportarAPDF(document.getElementById('moduloFinanzasTaller'), 'reporte_contable_taller');
        return;
    }
    window.print();
};

// ── Helper: escapar HTML ─────────────────────────────────────────
function finEsc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
