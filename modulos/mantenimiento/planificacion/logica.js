// ================================================================
// Módulo Planificación Preventivos — Azkell Fleet
// Patrón SPA: window.* para globals, init_planificacion() para entry point
// ================================================================

// Helper Bootstrap Modal (compatible con todas las versiones de Bootstrap 5)
function _bsModal(el) {
    if (!el) return { show: function(){}, hide: function(){} };
    return bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el);
}

window.planData        = window.planData        || [];
window.planDataFiltrado= window.planDataFiltrado|| [];
window.planTabActiva   = window.planTabActiva   || 'board';
window.planUpRows      = window.planUpRows      || [];
window.compDataDetalle = window.compDataDetalle || [];
window.planVistaTabla  = window.planVistaTabla  !== undefined ? window.planVistaTabla : true;

// ── Helpers de fecha ──────────────────────────────────────────────
function _planFmtFecha(iso) {
    if (!iso) return '—';
    // MySQL puede devolver '2026-04-15T00:00:00.000Z' — tomar solo la parte de fecha
    var s = typeof iso === 'string' ? iso.split('T')[0] : String(iso);
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-PE', { day:'2-digit', month:'short' });
}

function _planEstadoCard(plan) {
    var hoy = new Date(); hoy.setHours(0,0,0,0);
    var fin = new Date((plan.fecha_fin_ventana    || '').split('T')[0] + 'T00:00:00');
    var ini = new Date((plan.fecha_inicio_ventana || '').split('T')[0] + 'T00:00:00');
    if (plan.estado === 'Completada') return 'completada';
    if (plan.estado === 'Cancelada')  return 'cancelada';
    if (plan.estado === 'Diferida')   return 'diferida';
    if (hoy > fin)                    return 'atrasada';
    var diff = Math.round((fin - hoy) / 86400000);
    if (diff <= 3)                    return 'porvencer';
    if (hoy >= ini && hoy <= fin)     return 'vigente';
    return 'programada';
}

function _planBadge(tipo) {
    var map = {
        completada:  ['Completada',  'badge-completada'],
        cancelada:   ['Cancelada',   'badge-cancelada'],
        diferida:    ['Diferida',    'badge-diferida'],
        atrasada:    ['Atrasada',    'badge-atrasada'],
        porvencer:   ['Por Vencer',  'badge-porvencer'],
        vigente:     ['Vigente',     'badge-vigente'],
        programada:  ['Programada',  'badge-programada']
    };
    var v = map[tipo] || ['Programada','badge-programada'];
    return '<span class="plan-badge ' + v[1] + '">' + v[0] + '</span>';
}

function _planRetraso(plan) {
    var hoy = new Date(); hoy.setHours(0,0,0,0);
    var fin = new Date(plan.fecha_fin_ventana + 'T00:00:00');
    var dias = Math.round((hoy - fin) / 86400000);
    return dias;
}

function _planColorPrioridad(p) {
    if (p === 'Crítica') return '#ef4444';
    if (p === 'Alta')    return '#f59e0b';
    if (p === 'Baja')    return '#94a3b8';
    return 'var(--subtext)';
}

// Inicializar selectores de año
function _planPoblarAnios(selId) {
    var el = document.getElementById(selId);
    if (!el) return;
    var anioAct = new Date().getFullYear();
    el.innerHTML = '';
    for (var y = anioAct - 1; y <= anioAct + 2; y++) {
        var opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        if (y === anioAct) opt.selected = true;
        el.appendChild(opt);
    }
}

// ── ENTRY POINT ───────────────────────────────────────────────────
window.init_planificacion = function() {
    // Poblar selects de año
    _planPoblarAnios('plan-sel-anio');
    _planPoblarAnios('up-sel-anio');

    // Poner mes actual por defecto
    var mesAct = new Date().getMonth() + 1;
    var selMes = document.getElementById('plan-sel-mes');
    if (selMes) selMes.value = mesAct;
    var upMes = document.getElementById('up-sel-mes');
    if (upMes) upMes.value = mesAct;

    // Poblar datalist de placas para modal nuevo plan
    var dl = document.getElementById('np-placas-list');
    if (dl && window.dataGlobalPlacas && window.dataGlobalPlacas.length) {
        dl.innerHTML = window.dataGlobalPlacas.map(function(p) {
            return '<option value="' + (p[0]||'') + '">';
        }).join('');
    }

    // Drag & drop zona de upload
    var zone = document.getElementById('plan-upload-zone');
    if (zone) {
        zone.addEventListener('dragover', function(e) {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', function() { zone.classList.remove('drag-over'); });
        zone.addEventListener('drop', function(e) {
            e.preventDefault();
            zone.classList.remove('drag-over');
            var files = e.dataTransfer.files;
            if (files.length) {
                var inp = document.getElementById('plan-file-input');
                if (inp) {
                    // Simular asignación de archivo
                    var dt = new DataTransfer();
                    dt.items.add(files[0]);
                    inp.files = dt.files;
                    window.procesarArchivoExcelPlan(inp);
                }
            }
        });
    }

    window.mostrarTabPlan('board');
    window.cargarBoardPlan();
};

// ── TABS ─────────────────────────────────────────────────────────
window.mostrarTabPlan = function(tab) {
    window.planTabActiva = tab;
    var tabs = ['board','upload','comparativa','requerimientos','proyeccion','config'];
    tabs.forEach(function(t) {
        var panel = document.getElementById('plan-panel-' + t);
        var navBtn = document.getElementById('plan-tab-' + t);
        if (panel) panel.style.display = (t === tab) ? '' : 'none';
        if (navBtn) {
            if (t === tab) navBtn.classList.add('active');
            else navBtn.classList.remove('active');
        }
    });
    if (tab === 'comparativa')    window.cargarComparativa();
    if (tab === 'config')         window.cargarSubTabConfig();
    if (tab === 'requerimientos') window.cargarRequerimientos();
    if (tab === 'proyeccion')     window.cargarProyeccion();
};

// ── BOARD CARGA ───────────────────────────────────────────────────
window.cargarBoardPlan = function() {
    var mes  = (document.getElementById('plan-sel-mes')  || {}).value  || (new Date().getMonth()+1);
    var anio = (document.getElementById('plan-sel-anio') || {}).value  || new Date().getFullYear();

    var cont = document.getElementById('plan-kanban-contenedor');
    if (cont) cont.innerHTML = '<div class="text-center py-5 w-100" style="color:var(--subtext)"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</div>';

    fetch('/api/planificacion?mes=' + mes + '&anio=' + anio)
        .then(function(r) { return r.ok ? r.json() : { data: [] }; })
        .then(function(j) {
            window.planData = j.data || [];
            window.planDataFiltrado = window.planData.slice();

            // Poblar filtro de tipo MP dinámicamente
            var selTipo = document.getElementById('plan-fil-tipomp');
            if (selTipo) {
                var tipos = [];
                window.planData.forEach(function(p) {
                    if (p.tipo_mp && !tipos.includes(p.tipo_mp)) tipos.push(p.tipo_mp);
                });
                tipos.sort();
                var prevT = selTipo.value;
                selTipo.innerHTML = '<option value="">Todos los MP</option>' +
                    tipos.map(function(t){ return '<option value="'+t+'"'+(t===prevT?' selected':'')+'>'+t+'</option>'; }).join('');
            }

            _planActualizarKPIs();
            window.renderizarBoardPlan();
        })
        .catch(function(e) {
            console.error('Error cargando planificacion:', e);
            if (cont) cont.innerHTML = '<div class="text-center py-5 w-100 text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Error al cargar</div>';
        });
};

function _planActualizarKPIs() {
    var data = window.planData;
    var total    = data.length;
    var completas= data.filter(function(p){ return p.estado==='Completada'; }).length;
    var diferidas= data.filter(function(p){ return p.estado==='Diferida'; }).length;
    var atrasadas= data.filter(function(p){ return _planEstadoCard(p)==='atrasada'; }).length;
    var pct = total ? Math.round(completas * 100 / total) : 0;

    var setText = function(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setText('kpi-plan-total',    total);
    setText('kpi-plan-completas',completas);
    setText('kpi-plan-pct',      total ? pct + '%' : '—');
    setText('kpi-plan-atrasadas',atrasadas);
    setText('kpi-plan-diferidas',diferidas);
    setText('plan-badge-total',  total);

    var kpiPct = document.getElementById('kpi-plan-pct');
    if (kpiPct) kpiPct.style.color = pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';
}

// ── TOGGLE VISTA TABLA / KANBAN ───────────────────────────────────
window.toggleVistaPlan = function() {
    window.planVistaTabla = !window.planVistaTabla;
    var btn = document.getElementById('plan-btn-vista');
    if (btn) btn.innerHTML = window.planVistaTabla
        ? '<i class="bi bi-kanban"></i>'
        : '<i class="bi bi-table"></i>';
    var cont = document.getElementById('plan-kanban-contenedor');
    if (cont) cont.style.overflowX = window.planVistaTabla ? '' : 'auto';
    window.renderizarBoardPlan();
};

// ── BOARD RENDER ─────────────────────────────────────────────────
window.renderizarBoardPlan = function() {
    var cont = document.getElementById('plan-kanban-contenedor');
    if (!cont) return;
    var data = window.planDataFiltrado;

    if (!data.length) {
        cont.innerHTML = '<div class="text-center py-5 w-100" style="color:var(--subtext)"><i class="bi bi-calendar2-x" style="font-size:2.5rem;opacity:0.3"></i><p class="mt-2 mb-0">Sin planificaciones para este mes</p></div>';
        return;
    }

    if (window.planVistaTabla) {
        _planRenderTablaVista(data, cont);
    } else {
        _planRenderKanban(data, cont);
    }
};

// ── VISTA TABLA ───────────────────────────────────────────────────
function _planRenderTablaVista(data, cont) {
    // Ordenar: primero por estado (no-completadas primero), luego por fecha inicio
    var orden = { 'Programada':0,'Confirmada':1,'En Progreso':2,'Diferida':3,'Atrasada':4,'Completada':5,'Cancelada':6 };
    var sorted = data.slice().sort(function(a,b) {
        var ea = _planEstadoCard(a); var eb = _planEstadoCard(b);
        var oa = orden[ea] !== undefined ? orden[ea] : 9;
        var ob = orden[eb] !== undefined ? orden[eb] : 9;
        if (oa !== ob) return oa - ob;
        return (a.fecha_inicio_ventana || '').localeCompare(b.fecha_inicio_ventana || '');
    });

    var filas = sorted.map(function(plan) {
        var tipo = _planEstadoCard(plan);
        var retraso = _planRetraso(plan);
        var retrasoTxt = tipo === 'atrasada'
            ? '<span class="text-danger fw-bold" style="font-size:0.72rem">+' + retraso + 'd</span>'
            : '—';
        var prioColor = _planColorPrioridad(plan.prioridad);
        var prioBadge = plan.prioridad && plan.prioridad !== 'Normal'
            ? '<span style="font-size:0.68rem;font-weight:700;color:' + prioColor + '"><i class="bi bi-flag-fill me-1"></i>' + plan.prioridad + '</span>'
            : '';

        var acciones = '';
        if (['Programada','Confirmada','En Progreso'].includes(plan.estado)) {
            acciones =
                '<button class="btn btn-xs btn-success py-0 px-1 me-1" style="font-size:0.7rem" onclick="window.abrirCompletarPlan(\'' + plan.id + '\')" title="Completar"><i class="bi bi-check2"></i></button>' +
                '<button class="btn btn-xs btn-warning py-0 px-1 me-1" style="font-size:0.7rem" onclick="window.abrirPosponerPlan(\'' + plan.id + '\')" title="Posponer"><i class="bi bi-calendar-plus"></i></button>' +
                '<button class="btn btn-xs btn-outline-secondary py-0 px-1 me-1" style="font-size:0.7rem" onclick="window.abrirEditarPlan(\'' + plan.id + '\')" title="Editar"><i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-xs btn-outline-danger py-0 px-1" style="font-size:0.7rem" onclick="window.cancelarPlan(\'' + plan.id + '\')" title="Cancelar"><i class="bi bi-x"></i></button>';
        } else if (plan.estado === 'Completada') {
            acciones = '<span style="font-size:0.72rem;color:#16a34a"><i class="bi bi-check-circle me-1"></i>' + (plan.fleetrun_id_ejecutado || '') + '</span>';
        }

        return '<tr style="' + (plan.estado==='Cancelada'?'opacity:0.45':'') + '">' +
            '<td class="fw-bold" style="white-space:nowrap">' + plan.placa + '</td>' +
            '<td><span class="badge bg-primary">' + plan.tipo_mp + '</span>' + (prioBadge ? '<br>' + prioBadge : '') + '</td>' +
            '<td style="font-size:0.78rem;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (plan.cliente || '—') + '</td>' +
            '<td style="white-space:nowrap;font-size:0.78rem">' + _planFmtFecha(plan.fecha_inicio_ventana) + '</td>' +
            '<td style="white-space:nowrap;font-size:0.78rem">' + _planFmtFecha(plan.fecha_fin_ventana) + '</td>' +
            '<td style="font-size:0.78rem">' + (plan.km_estimado ? plan.km_estimado.toLocaleString() + ' km' : '—') + '</td>' +
            '<td style="font-size:0.78rem;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (plan.tecnico_asignado || '<span style="color:#f59e0b">Sin asignar</span>') + '</td>' +
            '<td>' + _planBadge(tipo) + '</td>' +
            '<td style="white-space:nowrap">' + retrasoTxt + '</td>' +
            '<td class="text-end" style="white-space:nowrap">' + acciones + '</td>' +
            '</tr>';
    }).join('');

    cont.innerHTML =
        '<div class="table-responsive" style="max-height:calc(100vh - 290px); overflow-y:auto">' +
        '<table class="table table-sm table-hover mb-0 comp-table" style="width:100%;table-layout:auto">' +
        '<thead style="position:sticky;top:0;background:var(--surface);z-index:1"><tr>' +
        '<th>Placa</th><th>Tipo MP</th><th>Cliente</th>' +
        '<th>F. Inicio</th><th>F. Fin</th><th>KM Est.</th>' +
        '<th>Técnico</th><th>Estado</th><th>Retraso</th><th></th>' +
        '</tr></thead>' +
        '<tbody>' + filas + '</tbody>' +
        '</table></div>';
    cont.classList.add('plan-vista-tabla');
}

// ── VISTA KANBAN ──────────────────────────────────────────────────
function _planRenderKanban(data, cont) {
    cont.classList.remove('plan-vista-tabla');
    var mes  = parseInt((document.getElementById('plan-sel-mes')  || {}).value  || (new Date().getMonth()+1));
    var anio = parseInt((document.getElementById('plan-sel-anio') || {}).value  || new Date().getFullYear());

    var semanas = _planCalcularSemanas(mes, anio);
    semanas.push({ label:'Diferidas / Sin fecha', key:'other' });

    // Clasificar planes en semanas
    var cols = {};
    semanas.forEach(function(s) { cols[s.key] = []; });

    data.forEach(function(plan) {
        var asignada = false;
        for (var i = 0; i < semanas.length - 1; i++) {
            var s = semanas[i];
            var ini = new Date((plan.fecha_inicio_ventana || '').split('T')[0] + 'T00:00:00');
            if (ini >= s.start && ini <= s.end) {
                cols[s.key].push(plan);
                asignada = true;
                break;
            }
        }
        if (!asignada) cols['other'].push(plan);
    });

    var html = '';
    semanas.forEach(function(s) {
        var cards = cols[s.key];
        var countBadge = cards.length ? ('<span class="badge bg-secondary ms-1" style="font-size:0.65rem">' + cards.length + '</span>') : '';
        html += '<div class="kanban-col">';
        html += '<div class="kanban-col-header">' + s.label + countBadge + '</div>';
        if (!cards.length) {
            html += '<div style="color:var(--subtext); font-size:0.78rem; text-align:center; padding:20px 0; opacity:0.5">Sin planes</div>';
        } else {
            cards.forEach(function(plan) {
                html += _planRenderCard(plan);
            });
        }
        html += '</div>';
    });

    cont.innerHTML = html;
    cont.style.display = 'flex';
}

function _planCalcularSemanas(mes, anio) {
    var semanas = [];
    var primer = new Date(anio, mes-1, 1);
    var ultimo  = new Date(anio, mes, 0);
    var semNum  = 1;
    var inicioSem = new Date(primer);

    while (inicioSem <= ultimo) {
        var finSem = new Date(inicioSem);
        finSem.setDate(finSem.getDate() + 6);
        if (finSem > ultimo) finSem = new Date(ultimo);
        var labelDias = _planFmtFecha(inicioSem.toISOString().split('T')[0]) + ' – ' + _planFmtFecha(finSem.toISOString().split('T')[0]);
        semanas.push({
            key: 'sem' + semNum,
            label: 'Semana ' + semNum + ' · ' + labelDias,
            start: new Date(inicioSem),
            end: new Date(finSem)
        });
        semNum++;
        inicioSem.setDate(inicioSem.getDate() + 7);
    }
    return semanas;
}

function _planRenderCard(plan) {
    var tipo = _planEstadoCard(plan);
    var retraso = _planRetraso(plan);
    var retrasoTxt = '';
    if (tipo === 'atrasada') retrasoTxt = '<span class="text-danger fw-bold" style="font-size:0.75rem">▲ ' + retraso + ' días de retraso</span>';

    var botonesAccion = '';
    if (['Programada','Confirmada','En Progreso'].includes(plan.estado)) {
        botonesAccion =
            '<div class="d-flex gap-1 mt-2 flex-wrap">' +
            '<button class="btn btn-xs btn-success py-0 px-2" style="font-size:0.72rem" onclick="event.stopPropagation();window.abrirCompletarPlan(\'' + plan.id + '\')" title="Completar"><i class="bi bi-check2"></i> Completar</button>' +
            '<button class="btn btn-xs btn-warning py-0 px-2" style="font-size:0.72rem" onclick="event.stopPropagation();window.abrirPosponerPlan(\'' + plan.id + '\')" title="Posponer"><i class="bi bi-calendar-plus"></i></button>' +
            '<button class="btn btn-xs btn-outline-secondary py-0 px-2" style="font-size:0.72rem" onclick="event.stopPropagation();window.abrirEditarPlan(\'' + plan.id + '\')" title="Editar"><i class="bi bi-pencil"></i></button>' +
            '<button class="btn btn-xs btn-outline-danger py-0 px-2" style="font-size:0.72rem" onclick="event.stopPropagation();window.cancelarPlan(\'' + plan.id + '\')" title="Cancelar"><i class="bi bi-x"></i></button>' +
            '</div>';
    } else if (plan.estado === 'Completada') {
        botonesAccion = '<div class="mt-1" style="font-size:0.73rem; color:#16a34a"><i class="bi bi-check-circle me-1"></i>Completada' + (plan.fleetrun_id_ejecutado ? ' · ' + plan.fleetrun_id_ejecutado : '') + '</div>';
    }

    var prioColor = _planColorPrioridad(plan.prioridad);
    var tecnico = plan.tecnico_asignado
        ? '<div style="font-size:0.73rem; color:var(--subtext)"><i class="bi bi-person me-1"></i>' + plan.tecnico_asignado + '</div>'
        : '<div style="font-size:0.73rem; color:#f59e0b"><i class="bi bi-person-x me-1"></i>Sin asignar</div>';

    var kmInfo = plan.km_estimado
        ? '<div style="font-size:0.73rem; color:var(--subtext)"><i class="bi bi-speedometer me-1"></i>Est: ' + plan.km_estimado.toLocaleString() + ' km</div>'
        : '';

    return (
        '<div class="plan-card estado-' + tipo + '" onclick="window.verDetallePlan(\'' + plan.id + '\')">' +
        '<div class="d-flex align-items-start justify-content-between gap-1 mb-1">' +
        '<div>' +
        '<span class="fw-bold" style="font-size:0.85rem; color:var(--text)">' + plan.placa + '</span>' +
        '<span class="ms-1 badge bg-primary" style="font-size:0.63rem">' + plan.tipo_mp + '</span>' +
        '</div>' +
        _planBadge(tipo) +
        '</div>' +
        (plan.cliente ? '<div style="font-size:0.72rem; color:var(--subtext); white-space:nowrap; overflow:hidden; text-overflow:ellipsis">' + plan.cliente + '</div>' : '') +
        '<div style="font-size:0.72rem; color:var(--subtext)" class="mt-1"><i class="bi bi-calendar3 me-1"></i>' +
        _planFmtFecha(plan.fecha_inicio_ventana) + ' – ' + _planFmtFecha(plan.fecha_fin_ventana) + '</div>' +
        kmInfo +
        tecnico +
        (plan.prioridad && plan.prioridad !== 'Normal' ? '<div class="mt-1"><span style="font-size:0.7rem; font-weight:700; color:' + prioColor + '"><i class="bi bi-flag-fill me-1"></i>' + plan.prioridad + '</span></div>' : '') +
        (retrasoTxt ? '<div class="mt-1">' + retrasoTxt + '</div>' : '') +
        botonesAccion +
        '</div>'
    );
}

// ── FILTRO BOARD ─────────────────────────────────────────────────
window.filtrarBoardPlan = function() {
    var busq     = ((document.getElementById('plan-buscador')    || {}).value || '').toLowerCase().trim();
    var filEst   = ((document.getElementById('plan-fil-estado')  || {}).value || '');
    var filTipoMp= ((document.getElementById('plan-fil-tipomp')  || {}).value || '');

    window.planDataFiltrado = window.planData.filter(function(p) {
        var matchBusq = !busq ||
            (p.placa || '').toLowerCase().includes(busq) ||
            (p.tecnico_asignado || '').toLowerCase().includes(busq) ||
            (p.cliente || '').toLowerCase().includes(busq);

        var estadoCard = _planEstadoCard(p);
        var matchEst = !filEst ||
            (filEst === 'Atrasada' ? estadoCard === 'atrasada' : p.estado === filEst);

        var matchMP = !filTipoMp || p.tipo_mp === filTipoMp;

        return matchBusq && matchEst && matchMP;
    });

    window.renderizarBoardPlan();
};

// ── MIGRAR CÓDIGOS FLEETRUN ANTIGUOS ─────────────────────────────
window.migrarCodigosFleetrun = function() {
    var div = document.getElementById('migrar-resultado');
    if (div) { div.style.display = ''; div.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Migrando...'; }
    fetch('/api/fleetrun-backfill-codigos', { method: 'POST' })
        .then(function(r) { return r.json(); })
        .then(function(j) {
            if (div) {
                var color = j.errores > 0 ? 'warning' : 'success';
                div.innerHTML = '<div class="alert alert-' + color + ' py-2 mb-0" style="font-size:0.8rem">' +
                    '<i class="bi bi-check2 me-1"></i>' + (j.mensaje || ('Actualizados: <strong>' + j.actualizados + '</strong> de ' + j.total + ' registros')) +
                    (j.errores ? ' — Errores: ' + j.errores : '') +
                    '</div>';
            }
        })
        .catch(function(e) {
            if (div) div.innerHTML = '<div class="alert alert-danger py-2 mb-0" style="font-size:0.8rem">Error: ' + e.message + '</div>';
        });
};

// ── BUSCAR FLEETRUN POR CÓDIGO (auto-fill al completar) ───────────
window.buscarFleetrunPorCodigo = function() {
    var input  = document.getElementById('comp-fleetrun-id');
    var status = document.getElementById('comp-fleetrun-status');
    if (!input) return;
    var codigo = (input.value || '').trim();

    if (codigo.length < 8) {
        if (status) status.innerHTML = '<i class="bi bi-search"></i>';
        return;
    }

    if (status) status.innerHTML = '<div class="spinner-border spinner-border-sm" style="width:12px;height:12px"></div>';

    fetch('/api/fleetrun/buscar/' + encodeURIComponent(codigo))
        .then(function(r) { return r.json(); })
        .then(function(j) {
            if (j.data) {
                var fr = j.data;
                // Auto-fill fecha real
                var fReal = document.getElementById('comp-fecha-real');
                if (fReal && fr.fecha) {
                    fReal.value = (String(fr.fecha)).split('T')[0];
                }
                // Auto-fill KM real
                var kmReal = document.getElementById('comp-km-real');
                if (kmReal && fr.km_actual) {
                    kmReal.value = fr.km_actual;
                }
                if (status) status.innerHTML = '<i class="bi bi-check-circle-fill text-success"></i>';
            } else {
                if (status) status.innerHTML = '<i class="bi bi-x-circle text-danger" title="No encontrado"></i>';
            }
        })
        .catch(function() {
            if (status) status.innerHTML = '<i class="bi bi-search"></i>';
        });
};

// ── SUGERIR FECHAS AL CREAR PLAN (basado en último Fleetrun + tipos_mant) ──
window.sugerirFechasNuevoPlan = function() {
    var placa  = ((document.getElementById('np-placa')  || {}).value || '').trim().toUpperCase();
    var tipoMp = ((document.getElementById('np-tipomp') || {}).value || '').trim().toUpperCase();
    if (!placa || !tipoMp) return;

    // Buscar último Fleetrun de esa placa+tipomp
    fetch('/api/planificacion-sugerir?placa=' + encodeURIComponent(placa) + '&tipomp=' + encodeURIComponent(tipoMp))
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(j) {
            if (!j || !j.fecha_sugerida) return;
            var fIni = document.getElementById('np-fecha-ini');
            var fFin = document.getElementById('np-fecha-fin');
            var kmEst = document.getElementById('np-km-est');
            // Solo auto-rellenar si el campo está vacío
            if (fIni && !fIni.value) fIni.value = j.fecha_sugerida;
            if (fFin && !fFin.value) fFin.value = j.fecha_fin_sugerida || j.fecha_sugerida;
            if (kmEst && !kmEst.value && j.km_sugerido) kmEst.value = j.km_sugerido;
            if (j.fecha_sugerida) {
                window.mostrarToast('Fechas sugeridas basadas en el último ' + tipoMp + ' de ' + placa, 'info');
            }
        })
        .catch(function() {}); // silencioso si falla
};
window.abrirModalNuevoPlan = function() {
    var campos = ['np-id','np-placa','np-tipomp','np-fecha-ini','np-fecha-fin',
                  'np-km-est','np-km-min','np-km-max','np-tecnico','np-obs'];
    campos.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    var est = document.getElementById('np-estado');
    if (est) est.value = 'Programada';
    var prio = document.getElementById('np-prioridad');
    if (prio) prio.value = 'Normal';

    var titulo = document.getElementById('modalNuevoPlan-titulo');
    if (titulo) titulo.innerHTML = '<i class="bi bi-calendar2-plus me-1 text-primary"></i>Nueva Planificación';

    var _show = function() {
        _cfPopularDatalists();
        _bsModal(document.getElementById('modalNuevoPlan')).show();
    };
    // Si ya tenemos tipos cargados, mostrar directo; si no, cargar primero
    if (window.cfgDataFlota && window.cfgDataFlota.length) {
        _show();
    } else {
        fetch('/api/tipos-mantenimiento')
            .then(function(r){ return r.ok ? r.json() : {data:[]}; })
            .then(function(j){ window.cfgDataFlota = j.data || []; _show(); })
            .catch(_show);
    }
};

window.abrirEditarPlan = function(planId) {
    var plan = window.planData.find(function(p){ return p.id === planId; });
    if (!plan) return;

    var set = function(id, val) {
        var el = document.getElementById(id);
        if (el) el.value = val || '';
    };
    set('np-id',         plan.id);
    set('np-placa',      plan.placa);
    set('np-tipomp',     plan.tipo_mp);
    set('np-fecha-ini',  plan.fecha_inicio_ventana ? plan.fecha_inicio_ventana.split('T')[0] : '');
    set('np-fecha-fin',  plan.fecha_fin_ventana    ? plan.fecha_fin_ventana.split('T')[0]    : '');
    set('np-km-est',     plan.km_estimado);
    set('np-km-min',     plan.km_minimo);
    set('np-km-max',     plan.km_maximo);
    set('np-tecnico',    plan.tecnico_asignado);
    set('np-estado',     plan.estado);
    set('np-prioridad',  plan.prioridad);
    set('np-obs',        plan.observaciones_plan);

    var titulo = document.getElementById('modalNuevoPlan-titulo');
    if (titulo) titulo.innerHTML = '<i class="bi bi-pencil me-1 text-primary"></i>Editar Plan ' + plan.id;

    _cfPopularDatalists();
    var modal = _bsModal(document.getElementById('modalNuevoPlan'));
    modal.show();
};

window.guardarNuevoPlan = function() {
    var get = function(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var planId = get('np-id');
    var placa  = get('np-placa').toUpperCase();
    var tipoMp = get('np-tipomp');
    var fIni   = get('np-fecha-ini');
    var fFin   = get('np-fecha-fin');

    if (!placa || !tipoMp || !fIni || !fFin) {
        return window.mostrarToast('Placa, Tipo MP y fechas son obligatorios', 'warning');
    }

    var mes  = parseInt((document.getElementById('plan-sel-mes')  || {}).value  || (new Date().getMonth()+1));
    var anio = parseInt((document.getElementById('plan-sel-anio') || {}).value  || new Date().getFullYear());
    var usuario = localStorage.getItem('fleet_correo') || 'sistema';

    var body = {
        placa:                placa,
        tipo_mp:              tipoMp,
        fecha_inicio_ventana: fIni,
        fecha_fin_ventana:    fFin,
        mes_ejecucion:        mes,
        anio_ejecucion:       anio,
        km_estimado:          parseInt(get('np-km-est')) || 0,
        km_minimo:            parseInt(get('np-km-min')) || null,
        km_maximo:            parseInt(get('np-km-max')) || null,
        tecnico_asignado:     get('np-tecnico') || null,
        prioridad:            get('np-prioridad') || 'Normal',
        observaciones_plan:   get('np-obs') || null,
        created_by:           usuario
    };

    var url    = planId ? ('/api/planificacion/' + planId) : '/api/planificacion';
    var method = planId ? 'PUT' : 'POST';
    if (planId) {
        // Para edición, usar los mismos campos como body de PUT
        body.estado = get('np-estado');
    }

    fetch(url, { method: method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) })
        .then(function(r) { return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
        .then(function() {
            var modal = bootstrap.Modal.getInstance(document.getElementById('modalNuevoPlan'));
            if (modal) modal.hide();
            window.mostrarToast(planId ? 'Plan actualizado' : 'Plan creado correctamente', 'success');
            window.cargarBoardPlan();
        })
        .catch(function(e) { window.mostrarToast('Error: ' + e.message, 'error'); });
};

// ── COMPLETAR PLAN ────────────────────────────────────────────────
window.abrirCompletarPlan = function(planId) {
    var plan = window.planData.find(function(p){ return p.id === planId; });
    if (!plan) return;

    // Hidden state
    var set = function(id, v) { var el = document.getElementById(id); if (el) el.value = (v || ''); };
    set('comp-plan-id',       planId);
    set('comp-hidden-placa',  plan.placa);
    set('comp-hidden-tipomp', plan.tipo_mp);

    // Plan info banner
    var info = document.getElementById('comp-plan-info');
    if (info) info.innerHTML =
        '<strong>' + plan.placa + '</strong> · <span class="badge bg-primary">' + plan.tipo_mp + '</span>' +
        '<br><small>Ventana: ' + _planFmtFecha(plan.fecha_inicio_ventana) + ' – ' + _planFmtFecha(plan.fecha_fin_ventana) +
        (plan.km_estimado ? ' · KM estimado: ' + plan.km_estimado.toLocaleString() : '') + '</small>';

    // Pre-fill fecha con hoy
    set('comp-fr-fecha', new Date().toISOString().split('T')[0]);
    // Pre-fill KM actual desde el estimado del plan
    set('comp-fr-kmact', plan.km_estimado || '');
    // Pre-fill técnico del plan
    set('comp-fr-tec',   plan.tecnico_asignado || '');
    set('comp-fr-obs',   '');
    set('comp-fr-kmgps', '');

    // Reset botón
    var btn = document.getElementById('comp-btn-guardar');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i>Registrar y Completar'; }

    var _show = function() {
        // Marca de la placa para matching preciso en cfgDataFlota
        var placaRow   = (window.dataGlobalPlacas || []).find(function(p){ return (p[0]||'') === plan.placa; });
        var marcaPlaca = placaRow ? (placaRow[3] || '').toUpperCase().trim() : '';

        // Buscar frecuencia: primero placa.marca + tipo_mp, si no tipo_mp solo
        var tipoMpNorm = (plan.tipo_mp || '').toUpperCase().trim();
        var confT = (window.cfgDataFlota || []).find(function(t){
            return (t.tipo_mp||'').toUpperCase().trim() === tipoMpNorm && (t.marca||'').toUpperCase().trim() === marcaPlaca;
        }) || (window.cfgDataFlota || []).find(function(t){
            return (t.tipo_mp||'').toUpperCase().trim() === tipoMpNorm;
        });
        var frec = confT ? (parseInt(confT.frecuencia_km) || 0) : 0;
        set('comp-fr-freckm', frec || '');

        // KM próximo auto-calculado (readonly — no editable por el usuario)
        var kmBase = parseInt(plan.km_estimado) || 0;
        set('comp-fr-kmprox', (kmBase && frec) ? (kmBase + frec) : '');

        // GPS KM: auto-fill desde Wialon si está disponible (cargado por Fleetrun)
        var kmGpsEl    = document.getElementById('comp-fr-kmgps');
        var kmGpsLabel = document.getElementById('comp-fr-gps-label');
        if (kmGpsEl) {
            var wialonData = (typeof buscarWialonPorPlaca === 'function') ? buscarWialonPorPlaca(plan.placa) : null;
            if (wialonData && wialonData.km) {
                kmGpsEl.value = wialonData.km;
                kmGpsEl.readOnly = false;
                if (kmGpsLabel) kmGpsLabel.innerHTML = '<i class="bi bi-broadcast-pin text-primary me-1"></i>KM GPS <span class="badge bg-primary" style="font-size:0.6rem">EN VIVO</span>';
            } else {
                kmGpsEl.value = '';
                kmGpsEl.readOnly = false;
                if (kmGpsLabel) kmGpsLabel.innerHTML = '<i class="bi bi-broadcast text-muted me-1"></i>KM GPS';
            }
        }

        // Poblar datalist de técnicos desde dataGlobalFleetrun (índice 13 = tecnico)
        var dl = document.getElementById('comp-fr-tec-list');
        if (dl) {
            var tecnicos = [];
            (window.dataGlobalFleetrun || []).forEach(function(f) {
                var t = (f[13] || '').trim();
                if (t && t !== '-' && !tecnicos.includes(t)) tecnicos.push(t);
            });
            tecnicos.sort();
            dl.innerHTML = tecnicos.map(function(t){ return '<option value="' + t + '">'; }).join('');
        }
        _bsModal(document.getElementById('modalCompletarPlan')).show();
    };
    if (window.cfgDataFlota && window.cfgDataFlota.length) {
        _show();
    } else {
        fetch('/api/tipos-mantenimiento')
            .then(function(r){ return r.ok ? r.json() : {data:[]}; })
            .then(function(j){ window.cfgDataFlota = j.data || []; _show(); })
            .catch(_show);
    }
};

// Helper: recalcular KM próximo cuando cambia KM actual o frecuencia
window.compRecalcKmProx = function() {
    var kmActEl  = document.getElementById('comp-fr-kmact');
    var frecEl   = document.getElementById('comp-fr-freckm');
    var kmProxEl = document.getElementById('comp-fr-kmprox');
    if (!kmActEl || !frecEl || !kmProxEl) return;
    var kmAct = parseInt(kmActEl.value) || 0;
    var frec  = parseInt(frecEl.value)  || 0;
    if (kmAct && frec) kmProxEl.value = kmAct + frec;
};

window.confirmarCompletarPlan = function() {
    var planId  = ((document.getElementById('comp-plan-id')       || {}).value || '').trim();
    var placa   = ((document.getElementById('comp-hidden-placa')  || {}).value || '').trim().toUpperCase();
    var tipoMp  = ((document.getElementById('comp-hidden-tipomp') || {}).value || '').trim();
    var fecha   = ((document.getElementById('comp-fr-fecha')      || {}).value || '').trim();
    var kmAct   = parseInt((document.getElementById('comp-fr-kmact')  || {}).value) || 0;
    var kmProx  = parseInt((document.getElementById('comp-fr-kmprox') || {}).value) || 0;
    var frecuencia = parseInt((document.getElementById('comp-fr-freckm') || {}).value) || 0;
    var kmGps   = parseInt((document.getElementById('comp-fr-kmgps') || {}).value) || null;
    var tec     = ((document.getElementById('comp-fr-tec') || {}).value || '').trim();
    var obs     = ((document.getElementById('comp-fr-obs') || {}).value || '').trim();

    if (!planId || !placa || !tipoMp) return window.mostrarToast('Error: datos del plan incompletos', 'error');
    if (!fecha)  return window.mostrarToast('La fecha de ejecución es requerida', 'warning');
    if (!kmAct)  return window.mostrarToast('El KM actual es requerido', 'warning');

    // Datos adicionales del vehículo desde dataGlobalPlacas
    var placaRow = (window.dataGlobalPlacas || []).find(function(p){ return (p[0]||'') === placa; });
    var marca = placaRow ? (placaRow[3] || '') : '';
    var dueno = placaRow ? (placaRow[1] || '') : '';

    var d    = new Date(fecha + 'T00:00:00');
    var mes  = d.getMonth() + 1;
    var anio = d.getFullYear();
    var usuario = localStorage.getItem('fleet_correo') || 'sistema';

    // Deshabilitar botón
    var btn = document.getElementById('comp-btn-guardar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner-border spinner-border-sm me-1" style="width:14px;height:14px"></div>Guardando...'; }

    // PASO 1: Crear Fleetrun
    fetch('/api/script', {
        method:  'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            action: 'guardarFleetrun',
            args: [{
                f_fecha:  fecha,
                f_mes:    mes,
                f_anio:   anio,
                f_placa:  placa,
                f_marca:  marca,
                f_dueno:  dueno,
                f_uts:    '',
                f_tipomp: tipoMp,
                f_kmact:  kmAct,
                f_freckm: frecuencia || null,
                f_kmprox: kmProx || (kmAct + (frecuencia || 0)) || null,
                f_obs:    obs,
                f_tec:    tec,
                f_kmgps:  kmGps || null
            }],
            usuario: usuario
        })
    })
    .then(function(r) { return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.data || e.error); }); })
    .then(function(j) {
        if (!j.idRegistro) throw new Error('No se recibió código del Fleetrun');
        var frId = j.idRegistro;
        // PASO 2: Completar plan con el ID del Fleetrun recién creado
        return fetch('/api/planificacion/' + planId + '/completar', {
            method:  'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ fleetrun_id: frId, fecha_real: fecha, km_real: kmAct, usuario: usuario })
        })
        .then(function(r2) { return r2.ok ? r2.json() : r2.json().then(function(e){ throw new Error(e.error); }); })
        .then(function() {
            var modal = bootstrap.Modal.getInstance(document.getElementById('modalCompletarPlan'));
            if (modal) modal.hide();
            window.mostrarToast('Preventivo registrado (' + frId + ') y plan completado', 'success');
            window.cargarBoardPlan();
        });
    })
    .catch(function(e) {
        window.mostrarToast('Error: ' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i>Registrar y Completar'; }
    });
};

// ── POSPONER PLAN ─────────────────────────────────────────────────
window.abrirPosponerPlan = function(planId) {
    var plan = window.planData.find(function(p){ return p.id === planId; });
    if (!plan) return;

    var el = document.getElementById('posp-plan-id');
    if (el) el.value = planId;

    var info = document.getElementById('posp-plan-info');
    if (info) info.innerHTML =
        '<strong>' + plan.placa + '</strong> · ' + plan.tipo_mp +
        '<br>Ventana actual: ' + _planFmtFecha(plan.fecha_inicio_ventana) + ' – ' + _planFmtFecha(plan.fecha_fin_ventana);

    var fIni = document.getElementById('posp-fecha-ini');
    var fFin = document.getElementById('posp-fecha-fin');
    if (fIni) fIni.value = '';
    if (fFin) fFin.value = '';
    var motivo = document.getElementById('posp-motivo');
    if (motivo) motivo.value = '';

    var modal = _bsModal(document.getElementById('modalPosponerPlan'));
    modal.show();
};

window.confirmarPosponerPlan = function() {
    var planId = (document.getElementById('posp-plan-id')  || {}).value;
    var fIni   = (document.getElementById('posp-fecha-ini') || {}).value;
    var fFin   = (document.getElementById('posp-fecha-fin') || {}).value;
    var motivo = (document.getElementById('posp-motivo')   || {}).value;

    if (!planId || !fIni || !fFin) return window.mostrarToast('Las nuevas fechas son requeridas', 'warning');

    // Calcular nuevo mes/año basado en la nueva fecha inicio
    var d = new Date(fIni + 'T00:00:00');
    var nuevoMes  = d.getMonth() + 1;
    var nuevoAnio = d.getFullYear();

    fetch('/api/planificacion/' + planId, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
            estado: 'Diferida',
            fecha_inicio_ventana: fIni,
            fecha_fin_ventana:    fFin,
            mes_ejecucion:        nuevoMes,
            anio_ejecucion:       nuevoAnio,
            observaciones_plan:   motivo || null
        })
    })
    .then(function(r) { return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
    .then(function() {
        var modal = bootstrap.Modal.getInstance(document.getElementById('modalPosponerPlan'));
        if (modal) modal.hide();
        window.mostrarToast('Plan diferido correctamente', 'success');
        window.cargarBoardPlan();
    })
    .catch(function(e) { window.mostrarToast('Error: ' + e.message, 'error'); });
};

// ── CANCELAR PLAN ─────────────────────────────────────────────────
window.cancelarPlan = function(planId) {
    var plan = window.planData.find(function(p){ return p.id === planId; });
    if (!plan) return;
    var motivo = prompt('¿Motivo de cancelación para ' + plan.placa + ' · ' + plan.tipo_mp + '?\n(Requerido)');
    if (motivo === null) return; // usuario canceló el prompt
    if (!motivo.trim()) return window.mostrarToast('El motivo es requerido para cancelar', 'warning');

    var usuario = localStorage.getItem('fleet_correo') || 'sistema';
    fetch('/api/planificacion/' + planId, {
        method:  'DELETE',
        headers: {'Content-Type':'application/json'},
        body:    JSON.stringify({ motivo: motivo, usuario: usuario })
    })
    .then(function(r) { return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
    .then(function() {
        window.mostrarToast('Plan cancelado', 'success');
        window.cargarBoardPlan();
    })
    .catch(function(e) { window.mostrarToast('Error: ' + e.message, 'error'); });
};

// ── VER DETALLE PLAN (offcanvas simple con info) ──────────────────
window.verDetallePlan = function(planId) {
    var plan = window.planData.find(function(p){ return p.id === planId; });
    if (!plan) return;
    // Si está en estado editable, abrimos edición; si es completada/cancelada, solo mostramos toast
    if (['Completada','Cancelada'].includes(plan.estado)) {
        var msg = plan.estado === 'Completada'
            ? 'Completada' + (plan.fleetrun_id_ejecutado ? ' · FR: ' + plan.fleetrun_id_ejecutado : '') + (plan.fecha_real_ejecucion ? ' · ' + _planFmtFecha(plan.fecha_real_ejecucion) : '')
            : 'Cancelada' + (plan.motivo_cancelacion ? ': ' + plan.motivo_cancelacion : '');
        window.mostrarToast(plan.placa + ' · ' + plan.tipo_mp + ' — ' + msg, 'info');
    } else {
        window.abrirEditarPlan(planId);
    }
};

// ── UPLOAD EXCEL ──────────────────────────────────────────────────
window.procesarArchivoExcelPlan = function(input) {
    if (!input || !input.files || !input.files.length) return;
    var file = input.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = new Uint8Array(e.target.result);
            var wb   = XLSX.read(data, { type:'array', cellDates:true });
            var ws   = wb.Sheets[wb.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(ws, { defval:'' });

            if (!rows.length) return window.mostrarToast('El archivo no contiene datos', 'warning');

            window.planUpRows = rows;

            // Mostrar preview
            var cols = Object.keys(rows[0]).slice(0, 8);
            var thead = '<tr>' + cols.map(function(c){ return '<th class="text-uppercase" style="font-size:0.7rem; white-space:nowrap">' + c + '</th>'; }).join('') + '</tr>';
            var tbody = rows.slice(0,50).map(function(r){
                return '<tr>' + cols.map(function(c){ return '<td style="white-space:nowrap; max-width:120px; overflow:hidden; text-overflow:ellipsis">' + (r[c] || '') + '</td>'; }).join('') + '</tr>';
            }).join('');

            var th = document.getElementById('plan-up-thead');
            var tb = document.getElementById('plan-up-tbody');
            var cnt = document.getElementById('plan-up-count');
            if (th)  th.innerHTML = thead;
            if (tb)  tb.innerHTML = tbody;
            if (cnt) cnt.textContent = rows.length;

            var prev = document.getElementById('plan-upload-preview');
            var res  = document.getElementById('plan-upload-resultado');
            if (prev) prev.style.display = '';
            if (res)  res.style.display  = 'none';
        } catch(err) {
            window.mostrarToast('Error leyendo Excel: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
};

window.cancelarUploadPlan = function() {
    window.planUpRows = [];
    var prev = document.getElementById('plan-upload-preview');
    if (prev) prev.style.display = 'none';
    var inp  = document.getElementById('plan-file-input');
    if (inp)  inp.value = '';
};

window.confirmarUploadPlan = function() {
    if (!window.planUpRows || !window.planUpRows.length)
        return window.mostrarToast('Sin datos para importar', 'warning');

    var mes  = (document.getElementById('up-sel-mes')  || {}).value;
    var anio = (document.getElementById('up-sel-anio') || {}).value;
    var usuario = localStorage.getItem('fleet_correo') || 'sistema';

    // Normalizar columnas (mapear variantes a nombres estándar)
    var registros = window.planUpRows.map(function(r) {
        var get = function(keys) {
            for (var i = 0; i < keys.length; i++) {
                var v = r[keys[i]];
                if (v !== undefined && v !== '') return v;
            }
            return '';
        };
        var fIni = get(['FECHA_INICIO','FECHA INICIO','fecha_inicio','FechaInicio']);
        var fFin = get(['FECHA_FIN','FECHA FIN','fecha_fin','FechaFin']);
        // Convertir fecha si viene como objeto Date de XLSX
        if (fIni instanceof Date) fIni = fIni.toISOString().split('T')[0];
        if (fFin instanceof Date) fFin = fFin.toISOString().split('T')[0];
        if (typeof fIni === 'number') { var d = new Date(Math.round((fIni - 25569)*86400*1000)); fIni = d.toISOString().split('T')[0]; }
        if (typeof fFin === 'number') { var d2= new Date(Math.round((fFin - 25569)*86400*1000)); fFin = d2.toISOString().split('T')[0]; }

        return {
            placa:         (get(['PLACA','placa']) || '').toString().trim().toUpperCase(),
            tipo_mp:       (get(['TIPO_MP','TIPO MP','tipo_mp','TipoMP']) || '').toString().trim().toUpperCase(),
            fecha_inicio:  fIni,
            fecha_fin:     fFin,
            km_estimado:   parseInt(get(['KM_ESTIMADO','KM ESTIMADO','km_estimado','KmEstimado'])) || 0,
            km_minimo:     parseInt(get(['KM_MINIMO','KM MINIMO','km_minimo'])) || null,
            km_maximo:     parseInt(get(['KM_MAXIMO','KM MAXIMO','km_maximo'])) || null,
            tecnico:       get(['TECNICO','tecnico','Tecnico']),
            prioridad:     get(['PRIORIDAD','prioridad']) || 'Normal',
            observaciones: get(['OBSERVACIONES','observaciones','OBS'])
        };
    }).filter(function(r) { return r.placa && r.tipo_mp; });

    if (!registros.length) return window.mostrarToast('No se encontraron filas válidas (PLACA y TIPO_MP requeridos)', 'warning');

    fetch('/api/importarPlanificacionMasivo', {
        method:  'POST',
        headers: {'Content-Type':'application/json'},
        body:    JSON.stringify({ registros: registros, mes: mes, anio: anio, createdBy: usuario })
    })
    .then(function(r) { return r.json(); })
    .then(function(j) {
        var prev = document.getElementById('plan-upload-preview');
        if (prev) prev.style.display = 'none';
        var res = document.getElementById('plan-upload-resultado');
        if (!res) return;
        var color = j.errores === 0 ? 'success' : (j.ok > 0 ? 'warning' : 'danger');
        var html  = '<div class="alert alert-' + color + '">' +
            '<strong><i class="bi bi-check2-circle me-1"></i>' + j.ok + ' importados</strong>' +
            (j.errores ? ' · <span class="text-danger">' + j.errores + ' errores</span>' : '') +
            (j.errores_detalle && j.errores_detalle.length
                ? '<ul class="mt-2 mb-0" style="font-size:0.78rem">' + j.errores_detalle.slice(0,10).map(function(e){ return '<li>' + e + '</li>'; }).join('') + '</ul>'
                : '') +
            '</div>';
        res.innerHTML = html;
        res.style.display = '';
        window.planUpRows = [];
        var inp = document.getElementById('plan-file-input');
        if (inp) inp.value = '';
        if (j.ok > 0) window.cargarBoardPlan();
    })
    .catch(function(e) { window.mostrarToast('Error al importar: ' + e.message, 'error'); });
};

// Descargar plantilla Excel
window.descargarPlantillaPlan = function() {
    var wb   = XLSX.utils.book_new();
    var data = [
        ['PLACA','TIPO_MP','FECHA_INICIO','FECHA_FIN','KM_ESTIMADO','KM_MINIMO','KM_MAXIMO','TECNICO','PRIORIDAD','OBSERVACIONES'],
        ['ABC-123','MP1','2025-02-01','2025-02-07',150000,145000,155000,'Juan García','Normal','Cambio aceite y filtros'],
        ['DEF-456','MP2','2025-02-10','2025-02-14',152000,148000,157000,'Carlos López','Alta','Filtros y fluidos'],
        ['GHI-789','MP3','2025-02-20','2025-02-28',165000,160000,170000,'','Normal','']
    ];
    var ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{wch:12},{wch:8},{wch:14},{wch:14},{wch:12},{wch:12},{wch:12},{wch:16},{wch:10},{wch:30}];
    XLSX.utils.book_append_sheet(wb, ws, 'Planificacion');
    XLSX.writeFile(wb, 'Plantilla_Planificacion.xlsx');
};

// ── COMPARATIVA ───────────────────────────────────────────────────
window.cargarComparativa = function() {
    var mes  = (document.getElementById('plan-sel-mes')  || {}).value  || (new Date().getMonth()+1);
    var anio = (document.getElementById('plan-sel-anio') || {}).value  || new Date().getFullYear();

    fetch('/api/reportePlanificacion?mes=' + mes + '&anio=' + anio)
        .then(function(r) { return r.ok ? r.json() : { kpis:{}, detalle:[] }; })
        .then(function(j) {
            var k = j.kpis || {};
            var setText = function(id, val) { var el=document.getElementById(id); if(el) el.textContent = val; };
            setText('comp-total',        k.total || 0);
            setText('comp-ejecutadas',   k.completadas || 0);
            setText('comp-diferidas',    k.diferidas || 0);
            setText('comp-canceladas',   k.canceladas || 0);
            setText('comp-avg-retraso',  k.promedio_desviacion_dias != null ? k.promedio_desviacion_dias + ' días' : '—');

            var pctEl = document.getElementById('comp-pct');
            if (pctEl) {
                var pct = k.pct_cumplimiento;
                pctEl.textContent = pct != null ? pct + '%' : '—';
                pctEl.style.color = pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';
            }

            window.compDataDetalle = j.detalle || [];
            window.filtrarComparativa();
        })
        .catch(function(e) { console.error('Error reporte planificacion:', e); });
};

window.filtrarComparativa = function() {
    var busq = ((document.getElementById('comp-buscador') || {}).value || '').toLowerCase();
    var data = window.compDataDetalle.filter(function(p) {
        return !busq ||
            (p.placa  || '').toLowerCase().includes(busq) ||
            (p.cliente|| '').toLowerCase().includes(busq);
    });
    _planRenderComparativa(data);
};

function _planRenderComparativa(data) {
    var tb = document.getElementById('comp-tbody');
    if (!tb) return;

    if (!data.length) {
        tb.innerHTML = '<tr><td colspan="10" class="text-center py-4" style="color:var(--subtext)">Sin datos para este mes</td></tr>';
        return;
    }

    tb.innerHTML = data.map(function(p) {
        var estadoCard = _planEstadoCard(p);
        var retrasoDias = (p.desviacion_dias != null)
            ? (p.desviacion_dias > 0
                ? '<span class="text-danger fw-bold">+' + p.desviacion_dias + 'd</span>'
                : '<span class="text-success">-' + Math.abs(p.desviacion_dias) + 'd</span>')
            : (estadoCard === 'atrasada'
                ? '<span class="text-danger fw-bold">+' + _planRetraso(p) + 'd</span>'
                : '—');

        return '<tr>' +
            '<td class="fw-bold">' + p.placa + '</td>' +
            '<td style="max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">' + (p.cliente || '—') + '</td>' +
            '<td><span class="badge bg-primary">' + p.tipo_mp + '</span></td>' +
            '<td style="white-space:nowrap">' + _planFmtFecha(p.fecha_inicio_ventana) + ' – ' + _planFmtFecha(p.fecha_fin_ventana) + '</td>' +
            '<td>' + (p.fecha_real_ejecucion ? _planFmtFecha(p.fecha_real_ejecucion) : '—') + '</td>' +
            '<td>' + retrasoDias + '</td>' +
            '<td>' + (p.km_estimado ? p.km_estimado.toLocaleString() : '—') + '</td>' +
            '<td>' + (p.km_real_ejecucion ? p.km_real_ejecucion.toLocaleString() : '—') + '</td>' +
            '<td>' + (p.tecnico_asignado || '—') + '</td>' +
            '<td>' + _planBadge(estadoCard) + '</td>' +
            '</tr>';
    }).join('');
}

window.exportarComparativaExcel = function() {
    if (!window.compDataDetalle.length) return window.mostrarToast('No hay datos para exportar', 'warning');

    var mes  = (document.getElementById('plan-sel-mes')  || {}).value  || (new Date().getMonth()+1);
    var anio = (document.getElementById('plan-sel-anio') || {}).value  || new Date().getFullYear();

    var headers = ['Placa','Cliente','Tipo MP','Fecha Inicio Plan','Fecha Fin Plan','Fecha Real','Retraso (días)','KM Estimado','KM Real','Técnico','Estado','Observaciones'];
    var rows = window.compDataDetalle.map(function(p) {
        return [
            p.placa, p.cliente || '', p.tipo_mp,
            p.fecha_inicio_ventana || '', p.fecha_fin_ventana || '',
            p.fecha_real_ejecucion || '', p.desviacion_dias != null ? p.desviacion_dias : '',
            p.km_estimado || '', p.km_real_ejecucion || '',
            p.tecnico_asignado || '', p.estado, p.observaciones_plan || ''
        ];
    });

    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
    XLSX.utils.book_append_sheet(wb, ws, 'Comparativa');
    XLSX.writeFile(wb, 'Comparativa_Planificacion_' + mes + '_' + anio + '.xlsx');
};

// ================================================================
// TAB CONFIGURACIÓN — Velocidades Flota + Kits MP + Correos Alerta
// ================================================================

window.cfgSubTabActual = window.cfgSubTabActual || 'flota';
window.cfgDataFlota    = window.cfgDataFlota    || [];
window.cfgDataFlotaFil = window.cfgDataFlotaFil || [];
window.cfgDataKits     = window.cfgDataKits     || [];
window.cfgDataKitsFil  = window.cfgDataKitsFil  || [];
window.cfgDataDest     = window.cfgDataDest     || [];

window.cargarSubTabConfig = function() {
    window.mostrarSubTabConfig(window.cfgSubTabActual || 'flota');
};

window.mostrarSubTabConfig = function(sub) {
    window.cfgSubTabActual = sub;
    var subs = ['flota','kits','correos'];
    subs.forEach(function(s) {
        var panel = document.getElementById('cfg-panel-' + s);
        var btn   = document.getElementById('cfg-tab-' + s);
        if (panel) panel.style.display = (s === sub) ? '' : 'none';
        if (btn) {
            if (s === sub) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
    if (sub === 'flota')   window.cargarTablaConfigFlota();
    if (sub === 'kits')    window.cargarTablaKits();
    if (sub === 'correos') window.cargarTablaDestinatarios();
};

// Helper: pobla los datalists del modal con datos actuales
function _cfPopularDatalists() {
    // Marcas: de dataGlobalPlacas (índice 3) + cfgDataFlota existentes
    var marcas = [];
    if (window.dataGlobalPlacas) {
        window.dataGlobalPlacas.forEach(function(p) {
            var m = (p[3] || '').trim().toUpperCase();
            if (m && !marcas.includes(m)) marcas.push(m);
        });
    }
    (window.cfgDataFlota || []).forEach(function(r) {
        var m = (r.marca || '').trim().toUpperCase();
        if (m && !marcas.includes(m)) marcas.push(m);
    });
    marcas.sort();
    // Tipo MP: de cfgDataFlota + kits
    var tipos = [];
    (window.cfgDataFlota || []).forEach(function(r) {
        var t = (r.tipo_mp || '').trim().toUpperCase();
        if (t && !tipos.includes(t)) tipos.push(t);
    });
    (window.cfgDataKits || []).forEach(function(k) {
        var t = (k.tipo_mp || '').trim().toUpperCase();
        if (t && !tipos.includes(t)) tipos.push(t);
    });
    tipos.sort();
    // Sistemas: de cfgDataFlota
    var sistemas = [];
    (window.cfgDataFlota || []).forEach(function(r) {
        var s = (r.sistema || '').trim();
        if (s && !sistemas.includes(s)) sistemas.push(s);
    });
    sistemas.sort();

    function _fill(id, vals) {
        var dl = document.getElementById(id);
        if (dl) dl.innerHTML = vals.map(function(v){ return '<option value="'+v+'">'; }).join('');
    }
    _fill('cf-dl-marcas',   marcas);
    _fill('cf-dl-tipomps',  tipos);
    _fill('cf-dl-sistemas', sistemas);
    _fill('kit-dl-tipomps', tipos);
    _fill('np-dl-tipomps',  tipos);
}

// ── TIPOS DE MANTENIMIENTO ────────────────────────────────────────
window.cargarTablaConfigFlota = function() {
    var tb = document.getElementById('cfg-flota-tbody');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="10" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>';
    fetch('/api/tipos-mantenimiento')
        .then(function(r) { return r.ok ? r.json() : { data: [] }; })
        .then(function(j) {
            window.cfgDataFlota = j.data || [];
            // Poblar filter de marcas
            var selMarca = document.getElementById('cfg-flota-fil-marca');
            if (selMarca) {
                var marcas = [];
                window.cfgDataFlota.forEach(function(r) { if (r.marca && !marcas.includes(r.marca)) marcas.push(r.marca); });
                marcas.sort();
                var prev = selMarca.value;
                selMarca.innerHTML = '<option value="">Todas las marcas</option>' +
                    marcas.map(function(m){ return '<option value="'+m+'"'+(m===prev?' selected':'')+'>'+m+'</option>'; }).join('');
            }
            window.filtrarTablaConfigFlota();
        })
        .catch(function(e) { console.error(e); });
};

window.filtrarTablaConfigFlota = function() {
    var filMarca = ((document.getElementById('cfg-flota-fil-marca')||{}).value||'');
    var filUts   = ((document.getElementById('cfg-flota-fil-uts')  ||{}).value||'');
    window.cfgDataFlotaFil = (window.cfgDataFlota||[]).filter(function(r) {
        return (!filMarca || r.marca === filMarca) && (!filUts || (r.uts||'').toUpperCase() === filUts);
    });
    var tb = document.getElementById('cfg-flota-tbody');
    if (!tb) return;
    if (!window.cfgDataFlotaFil.length) {
        tb.innerHTML = '<tr><td colspan="10" class="text-center py-4" style="color:var(--subtext)">Sin tipos de mantenimiento</td></tr>';
        return;
    }
    tb.innerHTML = window.cfgDataFlotaFil.map(function(r) {
        var utsBadge = r.uts === 'LOCAL'
            ? '<span class="badge bg-info text-dark">LOCAL</span>'
            : (r.uts === 'NACIONAL' ? '<span class="badge bg-warning text-dark">NACIONAL</span>' : (r.uts || '—'));
        return '<tr>' +
            '<td class="fw-bold">' + r.marca + '</td>' +
            '<td><span class="badge bg-primary">' + r.tipo_mp + '</span></td>' +
            '<td>' + utsBadge + '</td>' +
            '<td>' + (r.frecuencia_km   ? r.frecuencia_km.toLocaleString() + ' km'  : '—') + '</td>' +
            '<td>' + (r.frecuencia_horas ? r.frecuencia_horas + ' h'                 : '—') + '</td>' +
            '<td>' + (r.frecuencia_dias  ? r.frecuencia_dias + ' días'               : '—') + '</td>' +
            '<td style="font-size:0.78rem; color:var(--subtext)">' + (r.tipo    || '—') + '</td>' +
            '<td style="font-size:0.78rem; color:var(--subtext)">' + (r.sistema || '—') + '</td>' +
            '<td style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.78rem">' + (r.descripcion || '—') + '</td>' +
            '<td class="text-end">' +
                '<button class="btn btn-xs btn-outline-secondary me-1" onclick="window.editarConfigFlota(' + r.id + ')" style="font-size:0.7rem;padding:1px 6px"><i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-xs btn-outline-danger" onclick="window.eliminarConfigFlota(' + r.id + ',\'' + (r.marca + ' ' + r.tipo_mp).replace(/'/g,"") + '\')" style="font-size:0.7rem;padding:1px 6px"><i class="bi bi-trash"></i></button>' +
            '</td></tr>';
    }).join('');
};

window.abrirModalConfigFlota = function() {
    ['cf-id','cf-marca','cf-tipo-mp','cf-frec-km','cf-frec-horas','cf-frec-dias','cf-tipo','cf-sistema','cf-descripcion'].forEach(function(id){
        var el=document.getElementById(id); if(el) el.value='';
    });
    var set = function(id,v){ var el=document.getElementById(id); if(el) el.value=v; };
    set('cf-uts','LOCAL');
    var t=document.getElementById('modalConfigFlota-titulo');
    if(t) t.innerHTML='<i class="bi bi-plus-circle me-1 text-primary"></i>Nuevo Tipo de Mantenimiento';
    _cfPopularDatalists();
    _bsModal(document.getElementById('modalConfigFlota')).show();
};

window.editarConfigFlota = function(id) {
    var r = (window.cfgDataFlota||[]).find(function(x){ return x.id == id; });
    if (!r) return;
    var set    = function(elId, v){ var el=document.getElementById(elId); if(el) el.value = v != null ? v : ''; };
    var setStr = function(elId, v){ var el=document.getElementById(elId); if(el) el.value = v || ''; };
    set('cf-id',           r.id);
    setStr('cf-marca',     r.marca);
    setStr('cf-tipo-mp',   r.tipo_mp);
    setStr('cf-uts',       r.uts || 'LOCAL');
    set('cf-frec-km',      r.frecuencia_km);
    set('cf-frec-horas',   r.frecuencia_horas);
    set('cf-frec-dias',    r.frecuencia_dias);
    setStr('cf-tipo',      r.tipo);
    setStr('cf-sistema',   r.sistema);
    setStr('cf-descripcion', r.descripcion);
    var t=document.getElementById('modalConfigFlota-titulo');
    if(t) t.innerHTML='<i class="bi bi-pencil me-1 text-primary"></i>Editar — ' + r.marca + ' ' + r.tipo_mp;
    _cfPopularDatalists();
    _bsModal(document.getElementById('modalConfigFlota')).show();
};

window.guardarConfigFlota = function() {
    var get = function(id){ var el=document.getElementById(id); return el?el.value.trim():''; };
    var cfId = get('cf-id');
    var body = {
        marca:           get('cf-marca').toUpperCase(),
        tipo_mp:         get('cf-tipo-mp').toUpperCase(),
        uts:             get('cf-uts').toUpperCase(),
        frecuencia_km:   parseInt(get('cf-frec-km'))    || null,
        frecuencia_horas:parseInt(get('cf-frec-horas')) || null,
        frecuencia_dias: parseInt(get('cf-frec-dias'))  || null,
        tipo:            get('cf-tipo')        || null,
        sistema:         get('cf-sistema')     || null,
        descripcion:     get('cf-descripcion') || null
    };
    if (!body.marca || !body.tipo_mp) return window.mostrarToast('Marca y Tipo MP son requeridos', 'warning');

    var url    = cfId ? '/api/tipos-mantenimiento/' + cfId : '/api/tipos-mantenimiento';
    var method = cfId ? 'PUT' : 'POST';
    fetch(url, { method:method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
        .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
        .then(function() {
            bootstrap.Modal.getInstance(document.getElementById('modalConfigFlota')).hide();
            window.mostrarToast('Tipo de mantenimiento guardado', 'success');
            window.cargarTablaConfigFlota();
        })
        .catch(function(e){ window.mostrarToast('Error: ' + e.message, 'error'); });
};

window.eliminarConfigFlota = function(id, label) {
    if (!confirm('¿Eliminar "' + label + '"?')) return;
    fetch('/api/tipos-mantenimiento/' + id, { method:'DELETE' })
        .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
        .then(function(){ window.mostrarToast('Tipo de mantenimiento eliminado', 'success'); window.cargarTablaConfigFlota(); })
        .catch(function(e){ window.mostrarToast('Error: ' + e.message, 'error'); });
};

// ── KITS MP ───────────────────────────────────────────────────────
window.cargarTablaKits = function() {
    var tb = document.getElementById('cfg-kits-tbody');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="11" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>';
    fetch('/api/mantenimiento-kits')
        .then(function(r){ return r.ok ? r.json() : { data:[] }; })
        .then(function(j) {
            window.cfgDataKits = j.data || [];
            window.cfgDataKitsFil = window.cfgDataKits.slice();
            // Poblar filtro de marcas
            var selMarca = document.getElementById('cfg-kit-fil-marca');
            if (selMarca) {
                var marcas = [];
                window.cfgDataKits.forEach(function(k){ if(k.marca_vehiculo && !marcas.includes(k.marca_vehiculo)) marcas.push(k.marca_vehiculo); });
                marcas.sort();
                var prevM = selMarca.value;
                selMarca.innerHTML = '<option value="">Todas las marcas</option>' +
                    marcas.map(function(m){ return '<option value="'+m+'"'+(m===prevM?' selected':'')+'>'+m+'</option>'; }).join('');
            }
            // Poblar filtro de tipos dinámico
            var selTipo = document.getElementById('cfg-kit-fil-tipo');
            if (selTipo) {
                var tipos = [];
                window.cfgDataKits.forEach(function(k){ if(k.tipo_mp && !tipos.includes(k.tipo_mp)) tipos.push(k.tipo_mp); });
                tipos.sort();
                var prevT = selTipo.value;
                selTipo.innerHTML = '<option value="">Todo MP</option>' +
                    tipos.map(function(t){ return '<option value="'+t+'"'+(t===prevT?' selected':'')+'>'+t+'</option>'; }).join('');
            }
            // Poblar datalists del modal de tipo si ya están en DOM
            _cfPopularDatalists();
            window.filtrarTablaKits();
        });
};

window.filtrarTablaKits = function() {
    var filMarca = ((document.getElementById('cfg-kit-fil-marca')||{}).value||'');
    var filTipo  = ((document.getElementById('cfg-kit-fil-tipo') ||{}).value||'');
    window.cfgDataKitsFil = window.cfgDataKits.filter(function(k) {
        return (!filMarca || k.marca_vehiculo===filMarca) && (!filTipo || k.tipo_mp===filTipo);
    });
    var tb = document.getElementById('cfg-kits-tbody');
    if (!tb) return;
    if (!window.cfgDataKitsFil.length) {
        tb.innerHTML = '<tr><td colspan="11" class="text-center py-4" style="color:var(--subtext)">Sin ítems</td></tr>';
        return;
    }
    // Agrupación visual por marca → tipo_mp
    var html = '';
    var lastMarca = null;
    var lastTipo  = null;
    window.cfgDataKitsFil.forEach(function(k) {
        if (k.marca_vehiculo !== lastMarca) {
            html += '<tr style="background:var(--surface)">' +
                '<td colspan="8" class="fw-bold py-1 px-2" style="font-size:0.8rem; border-top:2px solid var(--border); color:var(--text)">' +
                '<i class="bi bi-truck me-1" style="color:var(--primary,#5865F2)"></i>' + k.marca_vehiculo + '</td>' +
                '<td colspan="2"></td><td></td></tr>';
            lastMarca = k.marca_vehiculo;
            lastTipo  = null;
        }
        if (k.tipo_mp !== lastTipo) {
            var mpColor = k.tipo_mp === 'MP1' ? 'bg-primary' : k.tipo_mp === 'MP2' ? 'bg-secondary' : k.tipo_mp === 'MP3' ? 'bg-dark' : 'bg-info text-dark';
            html += '<tr style="background:var(--bg)">' +
                '<td></td>' +
                '<td colspan="7" class="py-1 px-2" style="font-size:0.75rem; border-bottom:1px dashed var(--border)">' +
                '<span class="badge ' + mpColor + ' me-1">' + k.tipo_mp + '</span>' +
                '</td><td colspan="2"></td><td></td></tr>';
            lastTipo = k.tipo_mp;
        }
        html += '<tr style="' + (k.activo ? '' : 'opacity:0.45') + '">' +
            '<td></td>' +
            '<td></td>' +
            '<td style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (k.nombre_kit||'—') + '</td>' +
            '<td><code style="font-size:0.73rem">' + (k.item_codigo||'—') + '</code></td>' +
            '<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + k.item_nombre + '</td>' +
            '<td>' + k.cantidad + '</td>' +
            '<td>' + k.unidad_medida + '</td>' +
            '<td>S/.' + parseFloat(k.costo_unitario||0).toFixed(2) + '</td>' +
            '<td class="fw-bold">S/.' + parseFloat(k.costo_total||0).toFixed(2) + '</td>' +
            '<td>' + k.orden + '</td>' +
            '<td class="text-end">' +
                '<button class="btn btn-xs btn-outline-secondary me-1" onclick="window.editarKit(' + k.id + ')" style="font-size:0.7rem;padding:1px 6px"><i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-xs btn-outline-danger" onclick="window.eliminarKit(' + k.id + ',\'' + k.item_nombre.replace(/'/g,'') + '\')" style="font-size:0.7rem;padding:1px 6px"><i class="bi bi-trash"></i></button>' +
            '</td></tr>';
    });
    tb.innerHTML = html;
};

window.abrirModalKit = function() {
    ['kit-id','kit-marca','kit-tipomp','kit-nombre','kit-codigo','kit-item-nombre','kit-unidad','kit-cantidad',
     'kit-costo-unit','kit-costo-total','kit-orden'].forEach(function(id){
        var el=document.getElementById(id); if(el) el.value='';
    });
    var ord = document.getElementById('kit-orden'); if(ord) ord.value='1';
    var t=document.getElementById('modalKit-titulo');
    if(t) t.innerHTML='<i class="bi bi-plus-circle me-1 text-primary"></i>Nuevo Ítem de Kit';
    _cfPopularDatalists();
    _bsModal(document.getElementById('modalKit')).show();
};

window.editarKit = function(id) {
    var k = window.cfgDataKits.find(function(x){ return x.id===id; });
    if (!k) return;
    var set = function(elId,v){ var el=document.getElementById(elId); if(el) el.value=v||''; };
    set('kit-id',           k.id);
    set('kit-marca',        k.marca_vehiculo);
    set('kit-tipomp',       k.tipo_mp);
    set('kit-nombre',       k.nombre_kit);
    set('kit-codigo',       k.item_codigo);
    set('kit-item-nombre',  k.item_nombre);
    set('kit-cantidad',     k.cantidad);
    set('kit-unidad',       k.unidad_medida);
    set('kit-costo-unit',   k.costo_unitario);
    set('kit-costo-total',  k.costo_total);
    set('kit-orden',        k.orden);
    var t=document.getElementById('modalKit-titulo');
    if(t) t.innerHTML='<i class="bi bi-pencil me-1 text-primary"></i>Editar — ' + k.item_nombre.substring(0,30);
    _cfPopularDatalists();
    _bsModal(document.getElementById('modalKit')).show();
};

window.calcularCostoTotalKit = function() {
    var cant  = parseFloat((document.getElementById('kit-cantidad')   ||{}).value||0);
    var cUnit = parseFloat((document.getElementById('kit-costo-unit') ||{}).value||0);
    var ctEl  = document.getElementById('kit-costo-total');
    if (ctEl && cant && cUnit) ctEl.value = (cant * cUnit).toFixed(2);
};

window.guardarKit = function() {
    var get = function(id){ var el=document.getElementById(id); return el?el.value.trim():''; };
    var kitId = get('kit-id');
    var body = {
        marca_vehiculo: get('kit-marca').toUpperCase(),
        tipo_mp:        get('kit-tipomp'),
        nombre_kit:     get('kit-nombre')     || null,
        item_codigo:    get('kit-codigo')     || null,
        item_nombre:    get('kit-item-nombre'),
        cantidad:       parseFloat(get('kit-cantidad'))    || 1,
        unidad_medida:  get('kit-unidad')     || 'UND',
        costo_unitario: parseFloat(get('kit-costo-unit'))  || 0,
        costo_total:    parseFloat(get('kit-costo-total')) || 0,
        orden:          parseInt(get('kit-orden'))         || 1
    };
    if (!body.marca_vehiculo || !body.item_nombre) return window.mostrarToast('Marca e ítem son requeridos', 'warning');

    var url    = kitId ? '/api/mantenimiento-kits/' + kitId : '/api/mantenimiento-kits';
    var method = kitId ? 'PUT' : 'POST';
    fetch(url, { method:method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
        .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
        .then(function() {
            bootstrap.Modal.getInstance(document.getElementById('modalKit')).hide();
            window.mostrarToast('Ítem guardado', 'success');
            window.cargarTablaKits();
        })
        .catch(function(e){ window.mostrarToast('Error: ' + e.message, 'error'); });
};

window.eliminarKit = function(id, label) {
    if (!confirm('¿Eliminar ítem "' + label + '"?')) return;
    fetch('/api/mantenimiento-kits/' + id, { method:'DELETE' })
        .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
        .then(function(){ window.mostrarToast('Ítem eliminado', 'success'); window.cargarTablaKits(); })
        .catch(function(e){ window.mostrarToast('Error: ' + e.message, 'error'); });
};

// ── DESTINATARIOS ALERTAS ─────────────────────────────────────────
window.cargarTablaDestinatarios = function() {
    var tb = document.getElementById('cfg-correos-tbody');
    if (!tb) return;
    fetch('/api/destinatarios-alertas')
        .then(function(r){ return r.ok ? r.json() : { data:[] }; })
        .then(function(j) {
            window.cfgDataDest = j.data || [];
            if (!window.cfgDataDest.length) {
                tb.innerHTML = '<tr><td colspan="8" class="text-center py-4" style="color:var(--subtext)">Sin destinatarios configurados</td></tr>';
                return;
            }
            var check = function(v){ return v ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-x-circle text-muted"></i>'; };
            tb.innerHTML = window.cfgDataDest.map(function(d) {
                return '<tr style="' + (d.activo ? '' : 'opacity:0.45') + '">' +
                    '<td class="fw-bold">' + d.nombre + '</td>' +
                    '<td style="font-size:0.78rem">' + d.correo + '</td>' +
                    '<td style="font-size:0.78rem; color:var(--subtext)">' + (d.cargo||'—') + '</td>' +
                    '<td class="text-center">' + check(d.notif_1d) + '</td>' +
                    '<td class="text-center">' + check(d.notif_3d) + '</td>' +
                    '<td class="text-center">' + check(d.notif_7d) + '</td>' +
                    '<td><span class="badge ' + (d.activo?'bg-success':'bg-secondary') + '">' + (d.activo?'Activo':'Inactivo') + '</span></td>' +
                    '<td class="text-end">' +
                        '<button class="btn btn-xs btn-outline-secondary me-1" onclick="window.editarDestinatario(' + d.id + ')" style="font-size:0.7rem;padding:1px 6px"><i class="bi bi-pencil"></i></button>' +
                        '<button class="btn btn-xs btn-outline-danger" onclick="window.eliminarDestinatario(' + d.id + ',\'' + d.nombre + '\')" style="font-size:0.7rem;padding:1px 6px"><i class="bi bi-trash"></i></button>' +
                    '</td></tr>';
            }).join('');
        });
    // Verificar estado de email en el server
    _planVerificarEstadoEmail();
};

function _planVerificarEstadoEmail() {
    var el = document.getElementById('cfg-email-status');
    if (!el) return;
    // Si el server responde a /api/testEmail correctamente, bien. Por ahora solo mostramos info estática.
    el.innerHTML = '<i class="bi bi-info-circle me-1 text-primary"></i>' +
        'Configura <code>EMAIL_USER</code> y <code>EMAIL_PASS</code> en el archivo <code>.env</code> del servidor para activar el envío real.';
}

window.abrirModalDestinatario = function() {
    ['dest-id','dest-nombre','dest-correo','dest-cargo'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
    ['dest-n1d','dest-n3d','dest-n7d'].forEach(function(id){ var el=document.getElementById(id); if(el) el.checked=true; });
    var t=document.getElementById('modalDest-titulo');
    if(t) t.innerHTML='<i class="bi bi-person-plus me-1 text-primary"></i>Nuevo Destinatario';
    _bsModal(document.getElementById('modalDestinatario')).show();
};

window.editarDestinatario = function(id) {
    var d = window.cfgDataDest.find(function(x){ return x.id===id; });
    if (!d) return;
    var set = function(elId,v){ var el=document.getElementById(elId); if(el) el.value=v||''; };
    var chk = function(elId,v){ var el=document.getElementById(elId); if(el) el.checked=!!v; };
    set('dest-id',     d.id);
    set('dest-nombre', d.nombre);
    set('dest-correo', d.correo);
    set('dest-cargo',  d.cargo);
    chk('dest-n1d',    d.notif_1d);
    chk('dest-n3d',    d.notif_3d);
    chk('dest-n7d',    d.notif_7d);
    var t=document.getElementById('modalDest-titulo');
    if(t) t.innerHTML='<i class="bi bi-pencil me-1 text-primary"></i>Editar — ' + d.nombre;
    _bsModal(document.getElementById('modalDestinatario')).show();
};

window.guardarDestinatario = function() {
    var get = function(id){ var el=document.getElementById(id); return el?el.value.trim():''; };
    var chk = function(id){ var el=document.getElementById(id); return el?el.checked:false; };
    var destId = get('dest-id');
    var body = {
        nombre:          get('dest-nombre'),
        correo:          get('dest-correo'),
        cargo:           get('dest-cargo') || null,
        notif_1d:        chk('dest-n1d'),
        notif_3d:        chk('dest-n3d'),
        notif_7d:        chk('dest-n7d'),
        notif_completada: false
    };
    if (!body.nombre || !body.correo) return window.mostrarToast('Nombre y correo son requeridos', 'warning');

    var url    = destId ? '/api/destinatarios-alertas/' + destId : '/api/destinatarios-alertas';
    var method = destId ? 'PUT' : 'POST';
    fetch(url, { method:method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
        .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
        .then(function() {
            bootstrap.Modal.getInstance(document.getElementById('modalDestinatario')).hide();
            window.mostrarToast('Destinatario guardado', 'success');
            window.cargarTablaDestinatarios();
        })
        .catch(function(e){ window.mostrarToast('Error: ' + e.message, 'error'); });
};

window.eliminarDestinatario = function(id, nombre) {
    if (!confirm('¿Eliminar a "' + nombre + '" de las alertas?')) return;
    fetch('/api/destinatarios-alertas/' + id, { method:'DELETE' })
        .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error); }); })
        .then(function(){ window.mostrarToast('Destinatario eliminado', 'success'); window.cargarTablaDestinatarios(); })
        .catch(function(e){ window.mostrarToast('Error: ' + e.message, 'error'); });
};

window.enviarEmailPrueba = function() {
    var correo = ((document.getElementById('cfg-test-email')||{}).value||'').trim();
    if (!correo) return window.mostrarToast('Ingresa un correo de prueba', 'warning');
    fetch('/api/testEmail', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ correo:correo }) })
        .then(function(r){ return r.json(); })
        .then(function(j) {
            if (j.ok) window.mostrarToast('Email de prueba enviado a ' + correo, 'success');
            else window.mostrarToast('Error: ' + (j.error||'desconocido'), 'error');
        })
        .catch(function(e){ window.mostrarToast('Error de red: ' + e.message, 'error'); });
};

window.dispararAlertasManuales = function() {
    fetch('/api/dispararAlertas', { method:'POST' })
        .then(function(r){ return r.json(); })
        .then(function(j){ window.mostrarToast(j.msg || 'Verificación ejecutada', 'success'); })
        .catch(function(e){ window.mostrarToast('Error: ' + e.message, 'error'); });
};

// ================================================================
// TAB REQUERIMIENTOS — Productos necesarios por mes
// ================================================================

window.reqData    = window.reqData    || [];
window.reqDataFil = window.reqDataFil || [];

window.cargarRequerimientos = function() {
    var mes  = (document.getElementById('plan-sel-mes')  || {}).value || (new Date().getMonth()+1);
    var anio = (document.getElementById('plan-sel-anio') || {}).value || new Date().getFullYear();
    var cont = document.getElementById('req-tabla-contenedor');
    if (cont) cont.innerHTML = '<div class="text-center py-5" style="color:var(--subtext)"><div class="spinner-border spinner-border-sm me-2"></div>Cargando requerimientos...</div>';

    fetch('/api/requerimientos-resumen?mes=' + mes + '&anio=' + anio)
        .then(function(r){ return r.ok ? r.json() : { data:[] }; })
        .then(function(j) {
            window.reqData = j.data || [];

            // Poblar filtros
            var marcas = [];
            var tipos  = [];
            window.reqData.forEach(function(r) {
                if (r.marca   && !marcas.includes(r.marca))   marcas.push(r.marca);
                if (r.tipo_mp && !tipos.includes(r.tipo_mp))  tipos.push(r.tipo_mp);
            });
            marcas.sort(); tipos.sort();
            var selM = document.getElementById('req-fil-marca');
            if (selM) {
                var prevM = selM.value;
                selM.innerHTML = '<option value="">Todas las marcas</option>' +
                    marcas.map(function(m){ return '<option value="'+m+'"'+(m===prevM?' selected':'')+'>'+m+'</option>'; }).join('');
            }
            var selT = document.getElementById('req-fil-tipomp');
            if (selT) {
                var prevT = selT.value;
                selT.innerHTML = '<option value="">Todos los tipos</option>' +
                    tipos.map(function(t){ return '<option value="'+t+'"'+(t===prevT?' selected':'')+'>'+t+'</option>'; }).join('');
            }
            window.filtrarRequerimientos();
        })
        .catch(function(e) {
            console.error('Error requerimientos:', e);
            if (cont) cont.innerHTML = '<div class="text-center py-5 text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Error al cargar</div>';
        });
};

window.filtrarRequerimientos = function() {
    var filMarca = ((document.getElementById('req-fil-marca')  ||{}).value||'');
    var filTipo  = ((document.getElementById('req-fil-tipomp') ||{}).value||'');
    window.reqDataFil = window.reqData.filter(function(r) {
        return (!filMarca || r.marca === filMarca) && (!filTipo || r.tipo_mp === filTipo);
    });
    _reqRenderTabla(window.reqDataFil);
    _reqUpdateKpis(window.reqDataFil);
};

function _reqUpdateKpis(data) {
    var totalItems = data.length;
    var costoTotal = data.reduce(function(s,r){ return s + parseFloat(r.total_costo||0); }, 0);
    var planes     = new Set(data.map(function(r){ return r.tipo_mp + (r.marca||''); })).size;
    var marcas     = new Set(data.map(function(r){ return r.marca; })).size;
    var setText = function(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; };
    setText('req-kpi-items',  totalItems);
    setText('req-kpi-costo',  'S/.' + costoTotal.toFixed(2));
    setText('req-kpi-planes', planes);
    setText('req-kpi-marcas', marcas);
}

function _reqRenderTabla(data) {
    var cont = document.getElementById('req-tabla-contenedor');
    if (!cont) return;
    if (!data.length) {
        cont.innerHTML = '<div class="text-center py-5" style="color:var(--subtext)"><i class="bi bi-box-seam" style="font-size:2.5rem;opacity:0.3"></i><p class="mt-2">Sin requerimientos para este mes</p></div>';
        return;
    }

    // Agrupar: marca → tipo_mp → items
    var grupos = {};
    data.forEach(function(r) {
        var m = r.marca || '(Sin marca)';
        var t = r.tipo_mp || '—';
        if (!grupos[m]) grupos[m] = {};
        if (!grupos[m][t]) grupos[m][t] = [];
        grupos[m][t].push(r);
    });

    var html = '';
    Object.keys(grupos).sort().forEach(function(marca) {
        var costoMarca = 0;
        var tiposHtml  = '';
        Object.keys(grupos[marca]).sort().forEach(function(tipo) {
            var items       = grupos[marca][tipo];
            var costoTipo   = items.reduce(function(s,r){ return s + parseFloat(r.total_costo||0); }, 0);
            costoMarca += costoTipo;
            tiposHtml += '<tr style="background:rgba(88,101,242,0.06)">' +
                '<td style="padding-left:28px; font-size:0.78rem; font-weight:700; color:var(--subtext)">' +
                '<span class="badge bg-primary me-1">' + tipo + '</span>' +
                (items[0] && items[0].nombre_kit ? items[0].nombre_kit : '') +
                '</td>' +
                '<td colspan="6"></td>' +
                '<td class="text-end fw-bold" style="font-size:0.78rem; color:#22c55e">S/.' + costoTipo.toFixed(2) + '</td>' +
                '<td></td></tr>';
            items.forEach(function(r) {
                tiposHtml += '<tr style="' + (r.activo===0?'opacity:0.5':'') + '">' +
                    '<td style="padding-left:44px; font-size:0.78rem; color:var(--subtext)">' + (r.item_nombre||'—') + '</td>' +
                    '<td><code style="font-size:0.72rem">' + (r.item_codigo||'—') + '</code></td>' +
                    '<td class="text-center fw-bold">' + parseFloat(r.total_cantidad||0) + '</td>' +
                    '<td style="font-size:0.78rem">' + (r.unidad_medida||'—') + '</td>' +
                    '<td>S/.' + parseFloat(r.costo_unitario||0).toFixed(2) + '</td>' +
                    '<td class="fw-bold">S/.' + parseFloat(r.total_costo||0).toFixed(2) + '</td>' +
                    '<td class="text-center" style="font-size:0.72rem; color:var(--subtext)">' + (r.num_planes||'') + ' plan(es)</td>' +
                    '<td></td><td></td></tr>';
            });
        });
        // Header de marca
        html += '<tr style="background:var(--surface); border-top:2px solid var(--border)">' +
            '<td colspan="7" class="fw-bold py-2 px-3" style="font-size:0.85rem; color:var(--text)">' +
            '<i class="bi bi-truck me-1" style="color:var(--primary,#5865F2)"></i>' + marca + '</td>' +
            '<td class="text-end fw-bold py-2" style="color:#22c55e">S/.' + costoMarca.toFixed(2) + '</td>' +
            '<td></td></tr>';
        html += tiposHtml;
    });

    cont.innerHTML = '<div class="kpi-card p-0 overflow-hidden"><div class="table-responsive"><table class="table table-sm table-hover mb-0 comp-table">' +
        '<thead style="position:sticky;top:0;background:var(--surface);z-index:1"><tr>' +
        '<th>Ítem</th><th>Código</th><th>Cant.</th><th>Unidad</th><th>C.Unit.</th><th>C.Total</th><th>Planes</th><th>Total MP</th><th></th>' +
        '</tr></thead><tbody>' + html + '</tbody></table></div></div>';
}

window.exportarRequerimientos = function() {
    if (!window.reqDataFil.length) return window.mostrarToast('No hay datos para exportar', 'warning');
    var mes  = (document.getElementById('plan-sel-mes')  ||{}).value || (new Date().getMonth()+1);
    var anio = (document.getElementById('plan-sel-anio') ||{}).value || new Date().getFullYear();
    var headers = ['Marca','Tipo MP','Kit','Código','Ítem','Cant. Total','Unidad','C.Unit.','C.Total','Planes'];
    var rows = window.reqDataFil.map(function(r) {
        return [r.marca||'', r.tipo_mp||'', r.nombre_kit||'', r.item_codigo||'', r.item_nombre||'',
                r.total_cantidad||0, r.unidad_medida||'', r.costo_unitario||0, r.total_costo||0, r.num_planes||0];
    });
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
    ws['!cols'] = [{wch:14},{wch:20},{wch:22},{wch:12},{wch:30},{wch:8},{wch:8},{wch:10},{wch:10},{wch:8}];
    XLSX.utils.book_append_sheet(wb, ws, 'Requerimientos');
    XLSX.writeFile(wb, 'Requerimientos_' + mes + '_' + anio + '.xlsx');
};

// ================================================================
// TAB PROYECCIÓN — Próximas MPs proyectadas (3 / 6 / 12 meses)
// ================================================================

window.planProyData    = window.planProyData    || [];
window.planProyDataFil = window.planProyDataFil || [];
window.planProyMeses   = window.planProyMeses   || 3;

window.setPrHorizonte = function(meses, btn) {
    window.planProyMeses = meses;
    // Actualizar estado activo en los botones de horizonte
    var btns = document.querySelectorAll('[data-meses]');
    btns.forEach(function(b) {
        b.classList.toggle('active', parseInt(b.getAttribute('data-meses')) === meses);
    });
    window.cargarProyeccion();
};

window.cargarProyeccion = function() {
    var cont = document.getElementById('proy-tabla-cont');
    if (cont) cont.innerHTML = '<div class="text-center py-5" style="color:var(--subtext)"><div class="spinner-border spinner-border-sm me-2"></div>Calculando proyecciones...</div>';

    fetch('/api/planificacion-proyeccion?meses=' + (window.planProyMeses || 3))
        .then(function(r) { return r.ok ? r.json() : { data: [] }; })
        .then(function(j) {
            window.planProyData = j.data || [];

            // Poblar filtro de tipo MP dinámicamente
            var selTipo = document.getElementById('proy-fil-tipomp');
            if (selTipo) {
                var tipos = [];
                window.planProyData.forEach(function(p) {
                    if (p.tipo_mp && !tipos.includes(p.tipo_mp)) tipos.push(p.tipo_mp);
                });
                tipos.sort();
                var prevT = selTipo.value;
                selTipo.innerHTML = '<option value="">Todos los tipos</option>' +
                    tipos.map(function(t){ return '<option value="'+t+'"'+(t===prevT?' selected':'')+'>'+t+'</option>'; }).join('');
            }

            window.filtrarProyeccion();
        })
        .catch(function(e) {
            console.error('Error proyección:', e);
            if (cont) cont.innerHTML = '<div class="text-center py-5 text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Error al calcular proyecciones</div>';
        });
};

window.filtrarProyeccion = function() {
    var busq    = ((document.getElementById('proy-buscador')   ||{}).value||'').toLowerCase().trim();
    var tipomp  = ((document.getElementById('proy-fil-tipomp') ||{}).value||'');
    var estadoF = ((document.getElementById('proy-fil-estado') ||{}).value||'');

    window.planProyDataFil = window.planProyData.filter(function(p) {
        if (busq && !(
            (p.placa   ||'').toLowerCase().includes(busq) ||
            (p.cliente ||'').toLowerCase().includes(busq) ||
            (p.tipo_mp ||'').toLowerCase().includes(busq)
        )) return false;
        if (tipomp && p.tipo_mp !== tipomp) return false;
        if (estadoF) {
            if (estadoF === 'vencida'    && !p.vencida)   return false;
            if (estadoF === 'urgente'    && !(p.dias_restantes != null && !p.vencida && p.dias_restantes <= 15)) return false;
            if (estadoF === 'proximo'    && !(p.dias_restantes != null && !p.vencida && p.dias_restantes > 15 && p.dias_restantes <= 45)) return false;
            if (estadoF === 'programado' && !(p.dias_restantes != null && !p.vencida && p.dias_restantes > 45)) return false;
            if (estadoF === 'km'         && p.metodo !== 'km') return false;
        }
        return true;
    });

    _proyUpdateKpis(window.planProyDataFil);
    _proyRenderTabla(window.planProyDataFil);
};

function _proyUpdateKpis(data) {
    var total     = data.length;
    var vencidas  = data.filter(function(p){ return p.vencida; }).length;
    var urgentes  = data.filter(function(p){ return !p.vencida && p.dias_restantes != null && p.dias_restantes <= 15; }).length;
    var costoTotal = data.reduce(function(acc, p){ return acc + (parseFloat(p.costo_kit)||0); }, 0);

    var set = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    set('proy-kpi-total',    total);
    set('proy-kpi-vencidos', vencidas);
    set('proy-kpi-urgentes', urgentes);
    set('proy-kpi-costo',    costoTotal > 0 ? 'S/ ' + costoTotal.toLocaleString('es-PE', {minimumFractionDigits:0, maximumFractionDigits:0}) : '—');

    var kpiVenc = document.getElementById('proy-kpi-vencidos');
    if (kpiVenc) kpiVenc.style.color = vencidas > 0 ? '#ef4444' : '';
    var kpiUrg  = document.getElementById('proy-kpi-urgentes');
    if (kpiUrg)  kpiUrg.style.color  = urgentes > 0 ? '#f59e0b' : '';
}

function _proyGetEstado(p) {
    if (p.vencida)                                              return { cat:'vencida',    label:'Vencida',       cls:'danger'  };
    if (p.metodo === 'km')                                      return { cat:'km',         label:'Por KM',        cls:'info'    };
    if (p.dias_restantes != null && p.dias_restantes <= 15)    return { cat:'urgente',     label:'Urgente',       cls:'warning' };
    if (p.dias_restantes != null && p.dias_restantes <= 45)    return { cat:'proximo',     label:'Próximo',       cls:'primary' };
    return { cat:'programado', label:'Programado', cls:'secondary' };
}

function _proyRenderTabla(data) {
    var cont = document.getElementById('proy-tabla-cont');
    if (!cont) return;

    if (!data.length) {
        cont.innerHTML = '<div class="text-center py-5" style="color:var(--subtext)"><i class="bi bi-calendar-check me-2"></i>No hay MPs proyectadas para este horizonte</div>';
        return;
    }

    // Agrupar por mes proyectado (para las entradas con fecha)
    var grupos = {};
    var sinFecha = [];
    data.forEach(function(p) {
        if (p.fecha_proyectada) {
            var d = new Date(p.fecha_proyectada);
            var key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
            if (!grupos[key]) grupos[key] = [];
            grupos[key].push(p);
        } else {
            sinFecha.push(p);
        }
    });

    var mesNombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    var html = '';
    var mesesOrdenados = Object.keys(grupos).sort();

    mesesOrdenados.forEach(function(key) {
        var partes = key.split('-');
        var anio   = partes[0];
        var mes    = parseInt(partes[1]);
        var label  = mesNombres[mes-1] + ' ' + anio;
        var items  = grupos[key];
        html += '<tr style="background:var(--bg)">' +
            '<td colspan="9" class="fw-bold py-2 ps-3" style="font-size:0.8rem; color:var(--subtext); letter-spacing:0.05em">' +
            '<i class="bi bi-calendar3 me-1"></i>' + label.toUpperCase() + ' — ' + items.length + ' MP' + (items.length !== 1 ? 's' : '') +
            '</td></tr>';
        items.forEach(function(p) {
            html += _proyRenderFila(p);
        });
    });

    if (sinFecha.length) {
        html += '<tr style="background:var(--bg)"><td colspan="9" class="fw-bold py-2 ps-3" style="font-size:0.8rem; color:var(--subtext); letter-spacing:0.05em">' +
            '<i class="bi bi-speedometer2 me-1"></i>POR KILOMETRAJE (sin fecha estimada) — ' + sinFecha.length + '</td></tr>';
        sinFecha.forEach(function(p) { html += _proyRenderFila(p); });
    }

    cont.innerHTML = '<div class="kpi-card p-0 overflow-hidden"><div class="table-responsive">' +
        '<table class="table table-sm table-hover mb-0 comp-table">' +
        '<thead style="position:sticky;top:0;background:var(--surface);z-index:1"><tr>' +
        '<th>Placa</th><th>Cliente</th><th>Tipo MP</th><th>Fecha Proyectada</th>' +
        '<th>Días Restantes</th><th>Últ. Ejecución</th><th>KM Próximo</th><th>Costo Est.</th><th>Estado</th>' +
        '</tr></thead><tbody>' + html + '</tbody></table></div></div>';
}

function _proyRenderFila(p) {
    var est = _proyGetEstado(p);
    var fechaProyHtml = p.fecha_proyectada ? _planFmtFecha(p.fecha_proyectada) : '—';
    var diasHtml;
    if (p.vencida) {
        diasHtml = '<span class="text-danger fw-bold">+'+ Math.abs(p.dias_restantes||0) +'d atrasada</span>';
    } else if (p.dias_restantes != null) {
        diasHtml = '<span class="' + (p.dias_restantes <= 15 ? 'text-warning fw-bold' : 'text-success') + '">' + p.dias_restantes + ' días</span>';
    } else {
        diasHtml = '<span class="text-muted">—</span>';
    }
    var costoHtml = p.costo_kit > 0
        ? 'S/ ' + parseFloat(p.costo_kit).toLocaleString('es-PE', {minimumFractionDigits:0, maximumFractionDigits:0})
        : '<span class="text-muted" style="font-size:0.75rem">No registrado</span>';

    return '<tr>' +
        '<td class="fw-bold">' + (p.placa||'—') + '</td>' +
        '<td style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (p.cliente||'—') + '</td>' +
        '<td><span class="badge bg-primary">' + (p.tipo_mp||'—') + '</span></td>' +
        '<td style="white-space:nowrap">' + fechaProyHtml + '</td>' +
        '<td>' + diasHtml + '</td>' +
        '<td style="white-space:nowrap">' + (p.ultima_fecha ? _planFmtFecha(p.ultima_fecha) : '—') + '</td>' +
        '<td>' + (p.km_proximo ? parseInt(p.km_proximo).toLocaleString() : '—') + '</td>' +
        '<td>' + costoHtml + '</td>' +
        '<td><span class="badge bg-' + est.cls + '">' + est.label + '</span></td>' +
        '</tr>';
}

window.exportarProyeccionExcel = function() {
    if (!window.planProyDataFil.length) return window.mostrarToast('No hay datos para exportar', 'warning');
    var meses = window.planProyMeses || 3;
    var headers = ['Placa','Cliente','UTS','Tipo MP','Fecha Proyectada','Días Restantes','Últ. Fecha Ejecución','Últ. KM','KM Próximo','Frec. KM','Método','Costo Est. (S/)','Estado'];
    var rows = window.planProyDataFil.map(function(p) {
        var est = _proyGetEstado(p);
        return [
            p.placa||'', p.cliente||'', p.uts||'', p.tipo_mp||'',
            p.fecha_proyectada||'',
            p.vencida ? -Math.abs(p.dias_restantes||0) : (p.dias_restantes||''),
            p.ultima_fecha||'', p.ultimo_km||'', p.km_proximo||'',
            p.frecuencia_km||'', p.metodo||'fecha',
            p.costo_kit||0,
            est.label
        ];
    });
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
    ws['!cols'] = [{wch:10},{wch:20},{wch:10},{wch:22},{wch:14},{wch:12},{wch:16},{wch:10},{wch:12},{wch:10},{wch:8},{wch:12},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws, 'Proyeccion');
    XLSX.writeFile(wb, 'Proyeccion_MPs_' + meses + 'meses.xlsx');
};
