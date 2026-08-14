
window.srFormatID = function(id) {
    if (!id || !id.includes('-')) return id;
    var parts = id.split('-');
    if (parts.length >= 3) {
        if (parts[1].startsWith('20')) {
            return parts[1] + '-' + parts[2];
        } else {
            return parts[2] + '-' + parts[1];
        }
    }
    return id;
};
// ================================================================
// Módulo Status Rampa — Azkell Fleet
// Modelo: window.srEntradas = lista dinámica (N entradas por rampa)
// ================================================================

// Variables de estado (solo las que no vienen de BD)
window.srDetalleId            = window.srDetalleId            || null;
window.srOtData               = window.srOtData               || [];
window.srCatSituaciones       = window.srCatSituaciones       || [];
window.srCatRampas            = window.srCatRampas            || [];
window.srOtTrabajosActivos    = window.srOtTrabajosActivos    || [];
window.srOtMaterialesActivos  = window.srOtMaterialesActivos  || [];
window.srHistorialData        = window.srHistorialData        || [];
window.srTabActual            = window.srTabActual            || 'rampas';
window.srHistPage             = window.srHistPage             || 1;
window.srHistPageSize         = window.srHistPageSize         || 20;
// srEntradas se carga desde BD — no se persiste en localStorage
window.srEntradas             = [];

var SR_COLORES = ['#ef4444'];

// ── Entry point ──────────────────────────────────────────────────
window.init_status_rampa = function() {
    if (!window.checkPerm('status_rampa', 'l')) {
        var wrap = document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    window.srDetalleId = null;
    var panelD = document.getElementById('sr-panel-detalle');
    if (panelD) panelD.classList.remove('open');

    window.srTabActual = 'rampas';
    window.srHistPage  = 1;
    var paneR = document.getElementById('sr-pane-rampas');
    var paneH = document.getElementById('sr-pane-historial');
    if (paneR) paneR.style.display = 'flex';
    if (paneH) paneH.style.display = 'none';
    var tabR = document.getElementById('sr-tab-rampas');
    var tabH = document.getElementById('sr-tab-historial');
    if (tabR) tabR.classList.add('active');
    if (tabH) tabH.classList.remove('active');
    srCargarCatalogos();
    srCargarEntradas();
    srCargarOTs();
    srPoblarPlacas();
    srPoblarPersonal();
    if (typeof window.initColPicker === 'function') {
        window.initColPicker('col-picker-sr', 'sr-tabla', [
            {label: 'Fecha Ingreso',  idx: 1, visible: true},
            {label: 'Hora',           idx: 2, visible: true},
            {label: 'Situación',      idx: 4, visible: true},
            {label: 'Observaciones',  idx: 5, visible: true},
            {label: 'Fecha Salida',   idx: 6, visible: true},
            {label: 'Hora Salida',    idx: 7, visible: true},
            {label: 'H. Taller',      idx: 8, visible: true},
            {label: 'OT Relacionadas',idx: 9, visible: true}
        ], 'fleet_cols_status_rampa');
    }
};

// ── Carga entradas desde BD ──────────────────────────────────────
function srCargarEntradas() {
    fetch('/api/taller-rampas?_t=' + Date.now())
        .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function(rows) {
            window.srEntradas = rows.map(function(r) {
                return {
                    _id:          r.id,
                    rampa:        r.rampa,
                    placa:        r.placa,
                    km:           r.km || '',
                    fechaIngreso: r.fecha_ingreso ? String(r.fecha_ingreso).split('T')[0] : '',
                    horaIngreso:  r.hora_ingreso  ? String(r.hora_ingreso).slice(0,5) : '',
                    fechaSalida:  r.fecha_salida  ? String(r.fecha_salida).split('T')[0] : '',
                    horaSalida:   r.hora_salida   ? String(r.hora_salida).slice(0,5) : '',
                    situacion:    r.situacion || '',
                    obs:          r.obs || '',
                    evidencia_url: r.evidencia_url || ''
                };
            });
            srRenderTabla();
            // Actualizar badge pestaña Rampas
            var badgeR = document.getElementById('sr-tab-badge-rampas');
            if (badgeR) badgeR.textContent = window.srEntradas.length;
            if (window.srDetalleId !== null) window.srAbrirDetalle(window.srDetalleId);
        })
        .catch(function(err) { 
            console.error('Error al cargar status rampa:', err);
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error cargando datos de la tabla. Revisa tu conexión.', 'danger');
            window.srEntradas = []; srRenderTabla(); 
        });
}

// ── Catálogos ────────────────────────────────────────────────────
function srCargarCatalogos() {
    fetch('/api/catalogos_taller')
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(d) {
            if (!d) return;
            window.srCatRampas    = d.rampas    || [];
            window.srCatSituaciones = d.situaciones || [];

            // Si el panel config está abierto, actualizarlo
            var cfgPanel = document.getElementById('sr-config-rampas');
            if (cfgPanel && cfgPanel.classList.contains('open')) srRenderConfigRampas();

            // Poblar select de rampas en el formulario (dinámico)
            var sel = document.getElementById('sr-f-rampa');
            if (sel) {
                sel.innerHTML = '<option value="">— Seleccionar —</option>' +
                    window.srCatRampas.map(function(r) {
                        return '<option value="' + r.id + '">' + _srEsc(r.nombre_rampa) + '</option>';
                    }).join('');
            }

            // Selector situación de rampa
            var selSit = document.getElementById('sr-f-situacion');
            if (selSit && window.srCatSituaciones.length) {
                selSit.innerHTML = window.srCatSituaciones.map(function(s) {
                    var l = s.descripcion || s.nombre || '';
                    return '<option value="' + l + '">' + l + '</option>';
                }).join('');
            }
            var nombres = window.srCatSituaciones.map(function(s) { return s.descripcion || s.nombre || ''; }).filter(Boolean);
            window._srDropData['sr-ot-situacion-drop'] = nombres;
            var drop = document.getElementById('sr-ot-situacion-drop');
            if (drop) {
                drop.innerHTML = nombres.map(function(n) {
                    var nEsc = n.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
                    return '<div class="sr-drop-item" onmousedown="srSeleccionarDrop(\'sr-ot-situacion-drop\',\'' + n.replace(/'/g,"\\'") + '\')">' + nEsc + '</div>';
                }).join('');
            }

            srRenderTabla();
        })
        .catch(function() {});
}

// ── Placas combobox ──────────────────────────────────────────────
function srPoblarPlacas() {
    var lista = [];
    var vistas = {};
    (window.dataGlobalPlacas || []).forEach(function(r) {
        var p = String(Array.isArray(r) ? (r[0] || '') : (r.placa || r[0] || '')).trim().toUpperCase();
        if (!p || p === 'PLACA' || vistas[p]) return;
        vistas[p] = true;
        lista.push({ value: p, label: p });
    });
    lista.sort(function(a, b) { return a.label.localeCompare(b.label); });
    if (typeof window._cbInit === 'function') {
        window._cbInit('sr-f-placa', lista, 'Buscar placa...');
    }
}

// ── Personal / Supervisor ────────────────────────────────────────
function srPoblarPersonal() {
    fetch('/api/conductores')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(d) {
            var lista = Array.isArray(d) ? d : (d.data || []);
            var nombres = lista.map(function(p) {
                return (p.nombre_completo || p.nombre || (p[1] ? p[1] + ' ' + (p[2] || '') : '')).trim();
            }).filter(Boolean).sort();
            window._srDropData['sr-ot-supervisor-drop'] = nombres;
            var drop = document.getElementById('sr-ot-supervisor-drop');
            if (drop) {
                drop.innerHTML = nombres.map(function(n) {
                    var nEsc = n.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
                    return '<div class="sr-drop-item" onmousedown="srSeleccionarDrop(\'sr-ot-supervisor-drop\',\'' + n.replace(/'/g,"\\'") + '\')">' + nEsc + '</div>';
                }).join('');
            }
        })
        .catch(function() {});
}

// ── Multiselect Personal Técnico (Agregar Trabajo) ────────────────
window._srPersonalLista = window._srPersonalLista || [];
window._srSeleccionados = window._srSeleccionados || [];

function srMsInit(valorActual) {
    window._srSeleccionados = valorActual
        ? valorActual.split(',').map(function(n){ return n.trim(); }).filter(Boolean)
        : [];
    srMsRenderBox();
    var dd = document.getElementById('sr-ms-dropdown');
    if (dd) dd.style.display = 'none';
    var s = document.getElementById('sr-ms-search');
    if (s) s.value = '';
    var cnt = document.getElementById('sr-ms-count');
    if (cnt) cnt.textContent = window._srSeleccionados.length + ' seleccionados';
    var hidden = document.getElementById('sr-tr-personal');
    if (hidden) hidden.value = window._srSeleccionados.join(', ');

    var doRender = function() { srMsRenderOptions(''); };
    if (window._srPersonalLista.length > 0) { doRender(); return; }
    fetch('/api/conductores')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(data) {
            var lista = Array.isArray(data) ? data : (data.data || []);
            window._srPersonalLista = lista.map(function(p) {
                var n = (p.nombre_completo || p.nombre || '').trim();
                return n.split(' ').map(function(w) {
                    return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '';
                }).join(' ');
            }).filter(Boolean).sort();
            doRender();
        })
        .catch(function() {});
}

window.srMsToggle = function() {
    var dd = document.getElementById('sr-ms-dropdown');
    var box = document.getElementById('sr-ms-box');
    if (!dd) return;
    var isOpen = dd.style.display !== 'none';
    if (isOpen) {
        dd.style.display = 'none';
        if (box) box.style.borderColor = '';
    } else {
        dd.style.display = 'block';
        if (box) box.style.borderColor = 'var(--primary, #5865F2)';
        var search = document.getElementById('sr-ms-search');
        if (search) { search.value = ''; search.focus(); }
        srMsRenderOptions('');
    }
};

window.srMsFiltrar = function(query) { srMsRenderOptions(query || ''); };

function srMsRenderOptions(query) {
    var container = document.getElementById('sr-ms-options');
    if (!container) return;
    var q = (query || '').toLowerCase();
    var filtrados = window._srPersonalLista.filter(function(n) {
        return !q || n.toLowerCase().indexOf(q) !== -1;
    });
    if (filtrados.length === 0) {
        container.innerHTML = '<div style="padding:10px 14px; color:var(--subtext); font-size:0.83rem; text-align:center;">Sin resultados</div>';
        return;
    }
    container.innerHTML = filtrados.map(function(n) {
        var checked = window._srSeleccionados.indexOf(n) !== -1;
        var nEsc = n.replace(/'/g, "\\'");
        return '<label style="display:flex; align-items:center; gap:10px; padding:9px 14px; cursor:pointer; font-size:0.85rem; color:var(--text);" '
            + 'onmouseenter="this.style.background=\'var(--bg)\'" onmouseleave="this.style.background=\'\'">'
            + '<input type="checkbox" ' + (checked ? 'checked' : '') + ' '
            + 'onclick="event.stopPropagation(); srMsToggleItem(\'' + nEsc + '\')" '
            + 'style="accent-color:var(--primary, #5865F2); width:14px; height:14px; cursor:pointer; flex-shrink:0;">'
            + n + '</label>';
    }).join('');
}

window.srMsToggleItem = function(nombre) {
    var idx = window._srSeleccionados.indexOf(nombre);
    if (idx === -1) window._srSeleccionados.push(nombre);
    else window._srSeleccionados.splice(idx, 1);
    srMsRenderBox();
    srMsRenderOptions((document.getElementById('sr-ms-search') || {}).value || '');
    var cnt = document.getElementById('sr-ms-count');
    if (cnt) cnt.textContent = window._srSeleccionados.length + ' seleccionados';
    var hidden = document.getElementById('sr-tr-personal');
    if (hidden) hidden.value = window._srSeleccionados.join(', ');
};

window.srMsLimpiar = function() {
    window._srSeleccionados = [];
    srMsRenderBox();
    srMsRenderOptions('');
    var cnt = document.getElementById('sr-ms-count');
    if (cnt) cnt.textContent = '0 seleccionados';
    var hidden = document.getElementById('sr-tr-personal');
    if (hidden) hidden.value = '';
};

function srMsRenderBox() {
    var box = document.getElementById('sr-ms-box');
    if (!box) return;
    var sel = window._srSeleccionados;
    if (sel.length === 0) {
        box.innerHTML = '<span style="color:var(--subtext); font-size:0.85rem;">Selecciona técnico(s)...</span>';
    } else {
        box.innerHTML = sel.map(function(n) {
            var nEsc = n.replace(/'/g, "\\'");
            return '<span style="display:inline-flex; align-items:center; gap:4px; background:var(--primary, #5865F2); color:#fff; padding:3px 8px 3px 10px; border-radius:6px; font-size:0.76rem; font-weight:600;">'
                + n
                + '<span style="cursor:pointer; opacity:0.8; font-size:1rem; line-height:1;" '
                + 'onmousedown="event.stopPropagation(); event.preventDefault(); srMsToggleItem(\'' + nEsc + '\')">×</span>'
                + '</span>';
        }).join('');
    }
}

window._srMsOutsideClick = function(e) {
    var wrapper = document.getElementById('sr-ms-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        var dd = document.getElementById('sr-ms-dropdown');
        var box = document.getElementById('sr-ms-box');
        if (dd) dd.style.display = 'none';
        if (box) box.style.borderColor = '';
    }
};
document.removeEventListener('click', window._srMsOutsideClick);
document.addEventListener('click', window._srMsOutsideClick);

// ── Carga OTs ────────────────────────────────────────────────────
function srCargarOTs() {
    fetch('/api/ordenes-trabajo')
        .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function(data) {
            window.srOtData = Array.isArray(data) ? data : [];
            srRenderTabla();
            if (window.srDetalleId !== null) window.srAbrirDetalle(window.srDetalleId);
        })
        .catch(function() { window.srOtData = []; srRenderTabla(); });
}

// ── Calcular horas en taller ─────────────────────────────────────
function srCalcHorasTaller(e) {
    if (!e.fechaIngreso || !e.horaIngreso) return '—';
    var start = new Date(e.fechaIngreso + 'T' + e.horaIngreso + ':00');
    var end;
    if (e.fechaSalida && e.horaSalida) {
        end = new Date(e.fechaSalida + 'T' + e.horaSalida + ':00');
    } else {
        end = new Date();
    }
    var diffMs = end.getTime() - start.getTime();
    if (diffMs <= 0) return '—';
    var hrs = diffMs / 3600000;
    return hrs.toFixed(1) + 'h';
}

// ── Render tabla ─────────────────────────────────────────────────
function srRenderTabla() {
    var tbody = document.getElementById('sr-tbody');
    var gridMobile = document.getElementById('sr-grid-mobile');
    if (!tbody && !gridMobile) return;

    var busq = ((document.getElementById('sr-buscador') || {}).value || '').trim().toLowerCase();
    var html  = '';
    var htmlMobile = '';

    var rampas = window.srCatRampas || [];

    if (!rampas.length) {
        var emptyHtml = '<tr><td colspan="10" class="text-center py-5 text-muted" style="background:var(--card-bg);"><i class="bi bi-gear fs-1 d-block mb-2 text-primary"></i><span class="fw-bold">No hay rampas configuradas aún.</span><br><span class="small">Haz clic en <strong>⚙️ Configurar</strong> (arriba a la derecha) para agregar tus rampas o espacios de trabajo.</span></td></tr>';
        if (tbody) tbody.innerHTML = emptyHtml;
        if (gridMobile) gridMobile.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-gear fs-1 d-block mb-2 text-primary"></i><span class="fw-bold">No hay rampas configuradas aún.</span><br><span class="small">Haz clic en <strong>⚙️ Configurar</strong> para agregar rampas.</span></div>';
        return;
    }

    rampas.forEach(function(rampaObj, idx) {
        var rampaId   = rampaObj.id;
        var rampaNom  = rampaObj.nombre_rampa || ('Rampa ' + rampaId);
        var color     = SR_COLORES[idx % SR_COLORES.length];
        var entradas  = window.srEntradas.filter(function(e) { 
            var rStr = String(e.rampa || '').trim().toLowerCase();
            var nomLower = String(rampaNom || '').trim().toLowerCase();
            return String(e.rampa) === String(rampaId) || rStr === nomLower;
        });

        if (!entradas.length) {
            if (!busq || rampaNom.toLowerCase().indexOf(busq) !== -1 || String(rampaId).indexOf(busq) !== -1) {
                html += '<tr class="sr-row-vacia">';
                html += '<td style="white-space:nowrap;"><div style="display:flex;align-items:center;gap:5px;"><span class="sr-badge-rampa" style="background:' + color + ';flex-shrink:0;" title="' + _srEsc(rampaNom) + '">' + (idx+1) + '</span><span style="font-size:0.74rem;font-weight:700;color:var(--text);">' + _srEsc(rampaNom) + '</span></div></td>';
                html += '<td></td><td></td><td></td>';
                html += '<td><span class="sr-semaforo sr-sem-vacio"><span class="sr-sem-dot"></span>Libre</span></td>';
                html += '<td></td><td></td><td></td><td></td>';
                if (window.checkPerm('status_rampa', 'c')) {
                    html += '<td><button class="btn-sr-reg" onclick="event.stopPropagation();window.srRegistrar(' + rampaId + ')"><i class="bi bi-plus-lg me-1"></i>Ingresar</button></td>';
                } else {
                    html += '<td></td>';
                }
                html += '</tr>';

                var emptyBtn = window.checkPerm('status_rampa', 'c') ? '<button class="btn btn-sm fw-bold px-3 py-1" style="background:#eff6ff; color:#2563eb; border-radius:2rem; font-size:0.8rem;" onclick="event.stopPropagation();window.srRegistrar(' + rampaId + ')">+ Ingresar</button>' : '';
                htmlMobile += '<div class="sr-mobile-card p-3 border-0 shadow-sm flex-shrink-0" style="border-radius:1rem; border:1px solid var(--border)!important; flex-shrink:0!important; min-height:fit-content!important;">' +
                                  '<div class="d-flex align-items-center justify-content-between">' +
                                      '<div class="d-flex align-items-center gap-3">' +
                                          '<div class="rounded-circle text-white d-flex justify-content-center align-items-center fw-bold" style="width:40px;height:40px;background:#10b981;font-size:1.1rem;">' + (idx+1) + '</div>' +
                                          '<div>' +
                                              '<div class="fw-bold text-dark" style="font-size:0.95rem;">' + _srEsc(rampaNom) + '</div>' +
                                              '<div style="font-size:0.75rem; color:#059669; font-weight:700;"><i class="bi bi-circle-fill me-1" style="font-size:0.4rem;"></i>Libre & Disponible</div>' +
                                          '</div>' +
                                      '</div>' + emptyBtn +
                                  '</div>' +
                              '</div>';
            }
            return;
        }

        entradas.forEach(function(e) {
            if (busq) {
                var match = rampaNom.toLowerCase().indexOf(busq) !== -1 ||
                    String(e.rampa).indexOf(busq) !== -1 ||
                    (e.placa || '').toLowerCase().indexOf(busq) !== -1 ||
                    (e.situacion || '').toLowerCase().indexOf(busq) !== -1 ||
                    (e.obs || '').toLowerCase().indexOf(busq) !== -1;
                if (!match) return;
            }
            var esActiva = (window.srDetalleId === e._id);
            var otsPlaca = window.srOtData.filter(function(o) {
                if (o.id_rampa) return String(o.id_rampa) === String(e._id);
                return (o.placa || '').toUpperCase() === e.placa.toUpperCase();
            });
            var otsTxt = otsPlaca.length
                ? otsPlaca.slice(0,3).map(function(o) {
                    return '<span class="badge" style="background:rgba(88,101,242,0.1);color:var(--primary,#5865F2);font-weight:700;font-size:0.68rem;margin-right:3px;">' + (o.id_ot || o.ticket_entrada || '—') + '</span>';
                  }).join('') + (otsPlaca.length > 3 ? '<span style="font-size:0.72rem;color:var(--subtext)">+' + (otsPlaca.length - 3) + '</span>' : '')
                : '<span style="color:var(--subtext);font-size:0.8rem;">—</span>';

            var obsTextoCol = (e.obs || '').trim();
            if (!obsTextoCol && otsPlaca && otsPlaca.length > 0) {
                var obsOTList = [];
                otsPlaca.forEach(function(o) {
                    var det = o.detalles_json ? (typeof o.detalles_json === 'string' ? JSON.parse(o.detalles_json) : o.detalles_json) : {};
                    var mot = (det.motivo || o.observaciones || '').trim();
                    mot = mot.replace(/^\[Reporte\s+[^\]]+\]\s*/gim, '').replace(/^OT\s+OT-[^:]+:\s*/gim, '').trim();
                    if (mot) {
                        obsOTList.push(mot);
                    }
                });
                if (obsOTList.length > 0) {
                    obsTextoCol = Array.from(new Set(obsOTList)).join('\n');
                }
            }
            var obsFormateada = typeof window.srFormatearTareas === 'function' ? window.srFormatearTareas(obsTextoCol) : obsTextoCol;

            html += '<tr class="sr-ocupada' + (esActiva ? ' sr-activa' : '') + '" data-id="' + e._id + '" onclick="window.srAbrirDetalle(' + e._id + ')">';
            html += '<td style="white-space:nowrap;"><div style="display:flex;align-items:center;gap:5px;"><span class="sr-badge-rampa" style="background:' + color + ';flex-shrink:0;" title="' + _srEsc(rampaNom) + '">' + (idx+1) + '</span><span style="font-size:0.74rem;font-weight:700;color:var(--text);">' + _srEsc(rampaNom) + '</span></div></td>';
            html += '<td>' + (e.fechaIngreso ? srFmtFecha(e.fechaIngreso) : '') + '</td>';
            html += '<td>' + (e.horaIngreso || '') + '</td>';
            html += '<td style="font-weight:700;">' + (e.placa || '') + '</td>';
            html += '<td>' + srBadgeSituacion(e.situacion, true) + '</td>';
            html += '<td><div style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line;font-size:0.78rem;color:var(--text);line-height:1.4;" title="' + _srEsc(obsFormateada || '—').replace(/"/g,'&quot;') + '">' + _srEsc(obsFormateada || '—') + '</div></td>';
            html += '<td>' + (e.fechaSalida ? srFmtFecha(e.fechaSalida) : '') + '</td>';
            html += '<td>' + (e.horaSalida || '') + '</td>';
            html += '<td style="font-weight:700;font-size:0.8rem;color:var(--primary,#5865F2);">' + srCalcHorasTaller(e) + '</td>';
            html += '<td>' + otsTxt + '</td>';
            html += '<td>';
            if (window.checkPerm('ot', 'e')) {
                html += '<button class="btn btn-sm btn-outline-secondary" style="font-size:0.72rem;padding:2px 8px;" onclick="event.stopPropagation();window.srEditarRampa(' + e._id + ')" title="Editar"><i class="bi bi-pencil"></i></button> ';
                html += '<button class="btn btn-sm btn-outline-danger" style="font-size:0.72rem;padding:2px 8px;" onclick="event.stopPropagation();window.srLiberarRampa(' + e._id + ')" title="Liberar"><i class="bi bi-box-arrow-right"></i></button>';
            }
            html += '</td></tr>';

            // Mobile Card
            var badgeSit = srBadgeSituacion(e.situacion, true);
            var kmStr = e.km ? 'KM: ' + Number(e.km).toLocaleString('en-US') : 'KM: -';
            var fechaInStr = (e.fechaIngreso ? srFmtFecha(e.fechaIngreso, true) : '-') + (e.horaIngreso ? ' • ' + e.horaIngreso : '');
            var fechaOutStr = (e.fechaSalida ? srFmtFecha(e.fechaSalida, true) : '-') + (e.horaSalida ? ' • ' + e.horaSalida : '');
            
            htmlMobile += '<div class="sr-mobile-card p-3 border-0 shadow-sm flex-shrink-0" style="background:var(--surface); border-radius:1rem; border:1px solid var(--border)!important; cursor:pointer; flex-shrink:0!important; min-height: fit-content!important;" onclick="window.srAbrirDetalle(' + e._id + ')">' +
                '<div class="d-flex align-items-center justify-content-between mb-2">' +
                    '<div class="d-flex align-items-center gap-2">' +
                        '<div class="rounded-circle text-white d-flex justify-content-center align-items-center fw-bold" style="width:40px;height:40px;background:' + color + ';font-size:1.1rem;">' + (idx+1) + '</div>' +
                        '<div class="d-flex align-items-baseline gap-2">' +
                            '<span class="fw-bold text-dark" style="font-size:0.95rem;">' + _srEsc(rampaNom) + '</span>' +
                            '<span class="fw-bold" style="color:#2563eb; font-size:0.95rem;">' + _srEsc(e.placa || '') + '</span>' +
                        '</div>' +
                    '</div>' +
                    badgeSit +
                '</div>' +
                '<div class="text-muted mb-3" style="font-size:0.8rem; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">' +
                    _srEsc(e.obs || 'Sin observaciones') +
                '</div>' +
                '<div class="d-flex gap-2 mb-3">' +
                    '<div class="flex-fill rounded-3 p-2" style="background:#f8fafc; border:1px solid #f1f5f9;">' +
                        '<div class="text-success fw-bold d-flex align-items-center mb-1" style="font-size:0.65rem; letter-spacing:0.05em;"><i class="bi bi-box-arrow-in-right me-1"></i>ENTRADA</div>' +
                        '<div class="text-dark fw-bold" style="font-size:0.75rem;">' + fechaInStr + '</div>' +
                    '</div>' +
                    '<div class="flex-fill rounded-3 p-2" style="background:#f8fafc; border:1px solid #f1f5f9;">' +
                        '<div class="text-danger fw-bold d-flex align-items-center mb-1" style="font-size:0.65rem; letter-spacing:0.05em;"><i class="bi bi-box-arrow-right me-1"></i>SALIDA (EST.)</div>' +
                        '<div class="text-dark fw-bold" style="font-size:0.75rem;">' + fechaOutStr + '</div>' +
                    '</div>' +
                    '<div class="d-flex align-items-center text-muted"><i class="bi bi-chevron-right"></i></div>' +
                '</div>' +
                '<div class="d-flex justify-content-between align-items-center border-top pt-2 mt-1">' +
                    '<div class="text-muted" style="font-size:0.75rem;">' + kmStr + '</div>' +
                    '<div class="fw-bold" style="color:#2563eb; background:#eff6ff; padding:2px 8px; border-radius:1rem; font-size:0.75rem;"><i class="bi bi-clock me-1"></i>' + srCalcHorasTaller(e) + '</div>' +
                '</div>' +
            '</div>';
        });
    });

    if (!html) {
        html = '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--subtext);font-size:0.85rem;">Sin resultados.</td></tr>';
        htmlMobile = '<div style="text-align:center;padding:2rem;color:var(--subtext);font-size:0.85rem;">Sin resultados.</div>';
    }
    if (tbody) tbody.innerHTML = html;
    if (gridMobile) gridMobile.innerHTML = htmlMobile;
}

// ── Buscador ─────────────────────────────────────────────────────
window.srBuscar = function() {
    var q = ((document.getElementById('sr-buscador') || {}).value || '').toLowerCase().trim();
    var tab = window.srTabActual || 'rampas';
    if (tab === 'historial') {
        window.srHistFiltroTexto = q;
        window.srHistPage = 1;
        srRenderHistorial();
    } else {
        srRenderTabla();
        if (window.srDetalleId !== null) {
            if (!document.querySelector('#sr-tbody tr.sr-activa')) window.srCerrarDetalle();
        }
    }
};

// ── Panel detalle ────────────────────────────────────────────────
window.srAbrirDetalle = function(id) {
    var e = window.srEntradas.find(function(x) { return x._id === id; });
    if (!e) return;

    window.srDetalleId = id;
    srRenderTabla();

    var panel  = document.getElementById('sr-panel-detalle');
    var scroll = document.getElementById('sr-detalle-scroll');
    var footer = document.getElementById('sr-detalle-footer');
    if (!panel || !scroll || !footer) return;
    panel.classList.add('open');
    var bd = document.getElementById('srDrawerBackdrop');
    if (bd) bd.classList.add('open');

    var rampaIdx = window.srCatRampas.findIndex(function(r) { return r.id === e.rampa; });
    var color = SR_COLORES[(rampaIdx >= 0 ? rampaIdx : e.rampa - 1) % SR_COLORES.length];
    var rampaDetObj = rampaIdx >= 0 ? window.srCatRampas[rampaIdx] : null;
    var rampaNomDet = rampaDetObj ? rampaDetObj.nombre_rampa : ('Rampa ' + e.rampa);

    // Horas: entre ingreso y salida estimada (o hasta ahora si no hay salida)
    var horasTexto = '';
    if (e.fechaIngreso && e.horaIngreso) {
        var entrada = new Date(e.fechaIngreso + 'T' + e.horaIngreso);
        var referencia = (e.fechaSalida && e.horaSalida)
            ? new Date(e.fechaSalida + 'T' + e.horaSalida)
            : new Date();
        var diffH = Math.round((referencia - entrada) / 36e5);
        var label = (e.fechaSalida && e.horaSalida) ? ' h estimadas' : ' h en taller';
        horasTexto = '<span style="font-size:0.78rem;color:var(--subtext);"><i class="bi bi-clock me-1"></i>' + diffH + label + '</span>';
    }

    var otsPlaca = window.srOtData.filter(function(o) {
        if (o.id_rampa) return String(o.id_rampa) === String(e._id);
        return (o.placa || '').toUpperCase() === e.placa.toUpperCase();
    });

    var html = '';
    
    // Header (Hero)
    var badgeSit = srBadgeSituacion(e.situacion, true).replace(/<span class="sr-semaforo/g, '<span class="badge rounded-pill').replace(/padding:[^;]*;/g, '').replace(/font-size:[^;]*;/g, 'font-size:0.65rem; padding: 2px 8px; font-weight:700;');
    html += '<div class="sr-modal-card border-0 mb-3" style="background:var(--surface); border-radius:1rem; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); display:flex; flex-direction:column;">';
    html += '  <div class="card-body d-flex align-items-center gap-3 p-3">';
    html += '    <div class="rounded-3 d-flex justify-content-center align-items-center fw-bold text-white shadow-sm" style="width:48px; height:48px; background:' + color + '; font-size:1.4rem;">' + (rampaIdx + 1) + '</div>';
    html += '    <div>';
    html += '      <div class="d-flex align-items-center gap-2 mb-1">';
    html += '        <h4 class="mb-0 fw-bold text-dark" style="letter-spacing:0.5px;">' + _srEsc(e.placa || '') + '</h4>';
    html += '        ' + badgeSit;
    html += '      </div>';
    html += '      <div style="font-size:0.8rem; color:#64748b; font-weight:500;">' + _srEsc(rampaNomDet) + '</div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Cronología de Servicio
    var fIn = e.fechaIngreso ? srFmtFecha(e.fechaIngreso, true) : '—';
    var hIn = e.horaIngreso ? e.horaIngreso : '';
    var fOut = e.fechaSalida ? srFmtFecha(e.fechaSalida, true) : '—';
    var hOut = e.horaSalida ? e.horaSalida : '';
    var horas = e.fechaIngreso ? srCalcHorasTaller(e).replace('h', '') : '0.0';

    html += '<div class="mb-4">';
    html += '  <h6 class="fw-bold mb-3" style="font-size:0.75rem; color:#1e293b; letter-spacing:0.5px; text-transform:uppercase;">Cronología de Servicio</h6>';
    html += '  <div class="sr-modal-card border-0" style="background:#f8fafc; border-radius:1rem; display:flex; flex-direction:column;">';
    html += '    <div class="card-body p-3 position-relative">';
    html += '      <div style="position:absolute; left:31px; top:32px; bottom:32px; width:2px; background:#e2e8f0; z-index:1;"></div>';
    html += '      <div class="d-flex align-items-start gap-3 position-relative z-2 mb-4">';
    html += '        <div class="rounded-circle d-flex justify-content-center align-items-center text-white" style="width:32px; height:32px; background:#10b981; flex-shrink:0;"><i class="bi bi-box-arrow-in-right"></i></div>';
    html += '        <div><div style="font-size:0.65rem; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px;">Fecha y hora de entrada</div><div class="fw-bold text-dark" style="font-size:0.85rem;">' + fIn + (hIn ? ' — ' + hIn : '') + '</div></div>';
    html += '      </div>';
    html += '      <div class="d-flex align-items-start gap-3 position-relative z-2 mb-4">';
    html += '        <div class="rounded-circle d-flex justify-content-center align-items-center" style="width:32px; height:32px; background:#eff6ff; color:#3b82f6; flex-shrink:0;"><i class="bi bi-hourglass-split"></i></div>';
    html += '        <div><div style="font-size:0.65rem; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px;">Permanencia estimada</div><div class="fw-bold" style="color:#2563eb; font-size:0.85rem;">' + horas + 'h Totales en Rampa</div></div>';
    html += '      </div>';
    html += '      <div class="d-flex align-items-start gap-3 position-relative z-2">';
    html += '        <div class="rounded-circle d-flex justify-content-center align-items-center text-white" style="width:32px; height:32px; background:#ef4444; flex-shrink:0;"><i class="bi bi-box-arrow-right"></i></div>';
    html += '        <div><div style="font-size:0.65rem; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px;">Fecha y hora de salida (compromiso)</div><div class="fw-bold text-dark" style="font-size:0.85rem;">' + fOut + (hOut ? ' — ' + hOut : '') + '</div></div>';
    html += '      </div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // Detalles adicionales
    html += '<div class="sr-modal-card border-0 mb-4" style="background:#fff; border:1px solid #f1f5f9!important; border-radius:1rem; display:flex; flex-direction:column;">';
    html += '  <div class="card-body p-3 d-flex justify-content-between align-items-center border-bottom">';
    html += '    <div class="fw-bold" style="font-size:0.75rem; color:#1e293b;">Kilometraje de Ingreso</div>';
    html += '    <div class="fw-bold text-dark" style="font-size:0.85rem;">' + (e.km ? Number(e.km).toLocaleString('en-US') + ' KM' : '—') + '</div>';
    html += '  </div>';
    var obsTextoCompleto = (e.obs || '').trim();
    if (!obsTextoCompleto && otsPlaca && otsPlaca.length > 0) {
        var obsOTList = [];
        otsPlaca.forEach(function(o) {
            var det = o.detalles_json ? (typeof o.detalles_json === 'string' ? JSON.parse(o.detalles_json) : o.detalles_json) : {};
            var mot = (det.motivo || o.observaciones || '').trim();
            mot = mot.replace(/^\[Reporte\s+[^\]]+\]\s*/gim, '').replace(/^OT\s+OT-[^:]+:\s*/gim, '').trim();
            if (mot) {
                obsOTList.push(mot);
            }
        });
        if (obsOTList.length > 0) {
            obsTextoCompleto = Array.from(new Set(obsOTList)).join('\n');
        }
    }
    
    var parsedDetalle = typeof window.srParsearTareasArray === 'function' 
        ? window.srParsearTareasArray(obsTextoCompleto) 
        : { tareas: obsTextoCompleto ? [obsTextoCompleto] : [], notas: [] };
        
    var htmlTareas = '';
    if (parsedDetalle.tareas.length > 0) {
        htmlTareas += '<div class="d-flex flex-column gap-2">';
        parsedDetalle.tareas.forEach(function(t, idx) {
            htmlTareas += '<div class="d-flex align-items-start gap-2 p-2 rounded-3" style="background:#f8fafc; border:1px solid #e2e8f0;">' +
                          '  <span class="badge rounded-pill fw-bold" style="background:#2563eb; color:#fff; font-size:0.72rem; min-width:22px; height:22px; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px;">' + (idx + 1) + '</span>' +
                          '  <span style="font-size:0.82rem; color:#1e293b; font-weight:600; line-height:1.45; word-break:break-word;">' + _srEsc(t) + '</span>' +
                          '</div>';
        });
        if (parsedDetalle.notas.length > 0) {
            htmlTareas += '<div class="p-2 rounded-3 mt-1" style="background:#fffbeb; border:1px solid #fef3c7; font-size:0.78rem; color:#92400e; line-height:1.4;">' +
                          '  <i class="bi bi-info-circle-fill me-1"></i><strong>Nota:</strong> ' + _srEsc(parsedDetalle.notas.join(' · ')) +
                          '</div>';
        }
        htmlTareas += '</div>';
    } else {
        htmlTareas = '<div class="p-3 text-muted text-center" style="background:#f8fafc; border-radius:0.5rem; font-size:0.8rem;">Sin tareas registradas.</div>';
    }

    html += '  <div class="card-body p-3">';
    html += '    <div class="fw-bold" style="font-size:0.75rem; color:#1e293b; margin-bottom:8px;">Tareas y Motivo de Ingreso</div>';
    html += '    <div class="p-3" style="background:#f8fafc; border-radius:0.5rem; font-size:0.8rem; color:#334155; line-height:1.5; white-space:pre-line; word-break:break-word;">' + _srEsc(obsTextoCompleto || 'Sin tareas registradas.') + '</div>';
    if (e.evidencia_url) {
        html += '    <div class="mt-3"><a href="#" onclick="event.preventDefault(); window.srAbrirEvidencia(' + (e._id || e.id) + ')" class="btn btn-sm" style="font-size:0.75rem; border-radius:8px; border:1px solid #2563eb; color:#2563eb; background:#eff6ff; font-weight:bold;"><i class="bi bi-download me-1"></i>Ver / Descargar Evidencia</a></div>';
    }
    html += '  </div>';
    html += '</div>';

    // Acciones Rápidas (Formatos de Control / Plantillas)
    html += '<div class="sr-modal-card border-0 mb-4" style="background:#fff; border:1px solid #f1f5f9!important; border-radius:1rem; display:flex; flex-direction:column;">';
    html += '  <div class="card-body p-3">';
    html += '    <div class="fw-bold mb-2" style="font-size:0.75rem; color:#1e293b; letter-spacing:0.5px; text-transform:uppercase;">Formatos de Control</div>';
    html += '    <div class="d-flex align-items-center gap-3">';
    html += '      <button class="btn btn-sm" style="display:flex;flex-direction:column;align-items:center;background:none;border:none;color:var(--text);padding:0;" onclick="event.stopPropagation(); window.srDescargarPlantillaParabrisas(' + id + ')">';
    html += '        <div style="width:42px;height:42px;border-radius:50%;background:#f59e0b;color:#fff;display:flex;align-items:center;justify-content:center;margin-bottom:6px;font-size:1.15rem;box-shadow:0 4px 10px rgba(245,158,11,0.3);"><i class="bi bi-file-earmark-ruled"></i></div>';
    html += '        <span style="font-size:0.7rem;font-weight:700;line-height:1.1;text-align:center;">OT<br>Parabrisa</span>';
    html += '      </button>';
    var primerOtId = otsPlaca && otsPlaca.length > 0 ? (otsPlaca[0].id_ot || otsPlaca[0].ticket_entrada || '') : '';
    if (primerOtId && typeof window.descargarPlantillaVaciaOT === 'function') {
        html += '      <button class="btn btn-sm" style="display:flex;flex-direction:column;align-items:center;background:none;border:none;color:var(--text);padding:0;" onclick="event.stopPropagation(); window.descargarPlantillaVaciaOT(\'' + _srEsc(primerOtId) + '\', \'' + _srEsc(e.placa) + '\', \'' + _srEsc(e.fechaIngreso || '') + '\', \'' + (e.km || '') + '\', \'' + _srEsc(rampaNomDet || '') + '\')">';
        html += '        <div style="width:42px;height:42px;border-radius:50%;background:#16a34a;color:#fff;display:flex;align-items:center;justify-content:center;margin-bottom:6px;font-size:1.15rem;box-shadow:0 4px 10px rgba(22,163,74,0.3);"><i class="bi bi-card-checklist"></i></div>';
        html += '        <span style="font-size:0.7rem;font-weight:700;line-height:1.1;text-align:center;">Plantilla<br>Inspecciones</span>';
        html += '      </button>';
    }
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    // OTs
    html += '<div class="mb-4">';
    html += '  <div class="d-flex justify-content-between align-items-center mb-3">';
    html += '    <h6 class="fw-bold mb-0" style="font-size:0.75rem; color:#1e293b; letter-spacing:0.5px; text-transform:uppercase;">Órdenes de Trabajo vinculadas</h6>';
    html += '    <button class="btn btn-link p-0 text-decoration-none fw-bold" style="font-size:0.75rem; color:#2563eb;" onclick="window.srGenerarOT(' + id + ')">+ Generar OT</button>';
    html += '  </div>';
    if (!otsPlaca.length) {
        html += '  <div class="text-muted" style="font-size:0.8rem;">No hay OTs vinculadas.</div>';
    } else {
        otsPlaca.forEach(function(ot) {
            var idOt = ot.id_ot || ot.ticket_entrada || '—';
            html += '  <div class="sr-modal-card border-0 mb-2" style="background:#f8fafc; border:1px solid #f1f5f9!important; border-radius:0.75rem; cursor:pointer; display:flex; flex-direction:column;" onclick="window.srAbrirDetalleOT(\'' + idOt + '\')">';
            html += '    <div class="card-body p-3 d-flex justify-content-between align-items-center">';
            html += '      <div>';
            html += '        <div class="fw-bold mb-1" style="color:#2563eb; font-size:0.85rem;">' + window.srFormatID(idOt) + '</div>';
            html += '        <div style="font-size:0.7rem; color:#64748b;">Aprobación: <span class="text-dark">' + _srEsc(ot.estado || 'Pendiente') + '</span></div>';
            html += '      </div>';
            html += '      <span class="badge" style="background:#fffbeb; color:#d97706; border:1px solid #fde68a;">' + (ot.estado === 'Aprobada' ? 'En taller' : 'En atención') + '</span>';
            html += '    </div>';
            html += '  </div>';
        });
    }
    html += '</div>';

    scroll.innerHTML = html;
    
    footer.innerHTML = '';
    footer.style.padding = '0';
    footer.style.borderTop = 'none';
    if (window.checkPerm('ot', 'e')) {
        footer.innerHTML = 
            '<div class="d-flex w-100 gap-2 bg-white" style="padding:1rem;">' +
            '  <button class="btn btn-danger text-danger bg-danger bg-opacity-10 border-0 flex-shrink-0 d-flex justify-content-center align-items-center" style="width:48px; height:48px; border-radius:0.75rem;" onclick="window.srEliminarRegistroGeneral(' + id + ', \'' + (e.ticket_entrada || e.id_ot || '') + '\')" title="Eliminar"><i class="bi bi-trash"></i></button>' +
            '  <button class="btn btn-primary bg-opacity-10 text-primary border-0 flex-shrink-0 d-flex justify-content-center align-items-center" style="width:48px; height:48px; border-radius:0.75rem;" onclick="window.srEditarRampa(' + id + ')" title="Editar"><i class="bi bi-pencil"></i></button>' +
            '  <button class="btn flex-fill fw-bold border-0 d-flex justify-content-center align-items-center gap-2" style="background:#1e293b; color:#fff; border-radius:0.75rem; height:48px;" onclick="window.srLiberarRampa(' + id + ')"><i class="bi bi-check-circle-fill text-success"></i> Liberar y Archivar</button>' +
            '</div>';
    }
    footer.style.display = 'block';
};

window.srCerrarDetalle = function() {
    var panel = document.getElementById('sr-panel-detalle');
    if (panel) panel.classList.remove('open');
    var bd1 = document.getElementById('srDrawerBackdrop');
    if (bd1) bd1.classList.remove('open');
    var bd2 = document.getElementById('rotDrawerBackdrop');
    if (bd2) bd2.classList.remove('open');
    window.srDetalleId = null;
    srRenderTabla();
};

// ── Registrar nueva unidad ───────────────────────────────────────
window.srRegistrar = function(rampaNr) {
    srLimpiarFormRegistro();
    var titulo = document.getElementById('sr-drawer-titulo');
    if (titulo) titulo.textContent = 'Registrar Unidad en Rampa';
    var hid = document.getElementById('sr-f-idx');
    if (hid) hid.value = ''; // vacío = nueva entrada

    if (rampaNr) {
        var selRampa = document.getElementById('sr-f-rampa');
        if (selRampa) selRampa.value = String(rampaNr);
        // Sync del hidden siempre
        var hidRampa = document.getElementById('sr-f-rampa-id');
        if (hidRampa) hidRampa.value = String(rampaNr);
    }
    var hoy = new Date();
    var fecIng = document.getElementById('sr-f-fecha-ing');
    if (fecIng) fecIng.value = hoy.toISOString().split('T')[0];
    var horIng = document.getElementById('sr-f-hora-ing');
    if (horIng) horIng.value = hoy.toTimeString().slice(0, 5);
    srAbrirDrawer('sr-drawer-registro');
};

// ── Editar entrada existente ─────────────────────────────────────
window.srEditarRampa = function(id) {
    var e = window.srEntradas.find(function(x) { return x._id === id; });
    if (!e) return;
    srLimpiarFormRegistro();
    var titulo = document.getElementById('sr-drawer-titulo');
    if (titulo) titulo.textContent = 'Editar Rampa ' + e.rampa;
    var hid = document.getElementById('sr-f-idx');
    if (hid) hid.value = String(id);

    var sR = document.getElementById('sr-f-rampa');
    if (sR) { sR.value = String(e.rampa); sR.disabled = false; }
    var hidR = document.getElementById('sr-f-rampa-id');
    if (hidR) hidR.value = '';

    var set = function(eid, val) { var el = document.getElementById(eid); if (el) el.value = val || ''; };
    if (typeof window._cbSet === 'function') {
        window._cbSet('sr-f-placa', e.placa, e.placa);
    } else {
        var el = document.getElementById('sr-f-placa'); if (el) el.value = e.placa || '';
    }
    set('sr-f-km',        e.km);
    set('sr-f-fecha-ing', e.fechaIngreso);
    set('sr-f-hora-ing',  e.horaIngreso);
    set('sr-f-fecha-sal', e.fechaSalida);
    set('sr-f-hora-sal',  e.horaSalida);
    set('sr-f-obs',       e.obs);
    window.srCargarFilasTrabajos(e.obs);
    var esi = document.getElementById('sr-f-situacion');
    if (esi) esi.value = e.situacion || '';
    
    var hEvid = document.getElementById('sr-f-evidencia-url');
    var aEvid = document.getElementById('sr-f-evidencia-link');
    var iEvid = document.getElementById('sr-f-evidencia');
    if (iEvid) iEvid.value = '';
    if (hEvid) hEvid.value = e.evidencia_url || '';
    if (aEvid) {
        if (e.evidencia_url) {
            aEvid.href = "#";
            aEvid.onclick = function(ev) { ev.preventDefault(); window.srAbrirEvidencia(e._id || e.id); };
            aEvid.style.display = 'inline';
        } else {
            aEvid.style.display = 'none';
        }
    }
    srAbrirDrawer('sr-drawer-registro');
};

window.srAbrirEvidencia = async function(id) {
    var win = window.open('', '_blank');
    try {
        var r = await fetch('/api/taller-rampas/' + id + '/evidencia', {
            headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
        });
        if (!r.ok) throw new Error();
        var d = await r.json();
        if (d.url) win.location.href = d.url;
        else win.close();
    } catch (e) {
        win.close();
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al abrir la evidencia', 'danger');
    }
};

// ── Liberar entrada ──────────────────────────────────────────────
window.srLiberarRampa = function(id) {
    if (!window.guardAction('ot', 'e')) return;
    var e = window.srEntradas.find(function(x) { return x._id === id; });
    if (!e) return;
    window.srConfirmModerno('Confirmar Salida', '¿Confirmar salida de ' + e.placa + ' de la Rampa ' + e.rampa + '?\n\nEl registro quedará en el historial.', function() {
        var ahora = new Date();
    var fechaHoy = ahora.toISOString().split('T')[0];
    var horaAhora = ahora.toTimeString().slice(0, 5);
    fetch('/api/taller-rampas/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            accion: 'liberar',
            liberado_por: localStorage.getItem('fleet_user') || '',
            fecha_salida_real: e.fechaSalida || fechaHoy,
            hora_salida_real: e.horaSalida || horaAhora,
            situacion: 'Finalizado'
        })
    })
        .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function() {
            if (window.srDetalleId === id) window.srCerrarDetalle();
            srCargarEntradas();
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Rampa liberada — registro en historial', 'success');
        })
        .catch(function() {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al liberar rampa', 'danger');
        });
    }, 'Sí, archivar', 'btn-primary');
};

// ── Exportar Excel ────────────────────────────────────────────────
window.srExportarExcel = function() {
    var wb = XLSX.utils.book_new();

    // ── Hoja 1: Estado actual de Rampas ──────────────────────────
    var tbl = document.getElementById('sr-tabla');
    if (tbl) {
        var data1 = [];
        tbl.querySelectorAll('tr').forEach(function(row) {
            if (row.style.display === 'none') return;
            var rowData = [];
            var cells = row.querySelectorAll('th, td');
            for (var i = 0; i < cells.length - 1; i++) {
                var val = cells[i].getAttribute('data-value');
                if (val === null || val === undefined) val = cells[i].textContent.trim();
                val = val.replace(/^∟/g, '').trim();
                rowData.push(val);
            }
            if (rowData.length) data1.push(rowData);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data1), 'Rampas');
    }

    // ── Hoja 2: Historial (respeta filtro de fecha si está activo) ──
    var hist = window.srHistorialData || [];
    var filtDesde = window.srHistFiltroDesde || '';
    var filtHasta = window.srHistFiltroHasta || '';
    if (filtDesde || filtHasta) {
        hist = hist.filter(function(r) {
            var f = r.fecha_ingreso ? String(r.fecha_ingreso).split('T')[0] : '';
            if (filtDesde && f < filtDesde) return false;
            if (filtHasta && f > filtHasta) return false;
            return true;
        });
    }
    var data2 = [['Rampa','Placa','F/H Ingreso','F/H Liberado','Situación','Observaciones','Liberado por']];
    hist.forEach(function(r) {
        var fIng = r.fecha_ingreso ? String(r.fecha_ingreso).split('T')[0] : '';
        var hIng = r.hora_ingreso  ? String(r.hora_ingreso).slice(0,5)    : '';
        var fLib = r.fecha_liberado ? String(r.fecha_liberado).split('T')[0]
                 : (r.fecha_salida ? String(r.fecha_salida).split('T')[0] : '');
        var hLib = r.fecha_liberado ? String(r.fecha_liberado).slice(11,16) : '';
        data2.push([
            r.rampa || '', r.placa || '',
            fIng + (hIng ? ' ' + hIng : ''),
            fLib + (hLib ? ' ' + hLib : ''),
            r.situacion || '', r.obs || '', r.liberado_por || ''
        ]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data2), 'Historial');

    XLSX.writeFile(wb, 'Status-Rampas.xlsx');
};

// ── Tabs ──────────────────────────────────────────────────────────
window.srCambiarTab = function(tab) {
    window.srTabActual = tab;
    var paneR = document.getElementById('sr-pane-rampas');
    var paneH = document.getElementById('sr-pane-historial');
    var tabR  = document.getElementById('sr-tab-rampas');
    var tabH  = document.getElementById('sr-tab-historial');
    if (tab === 'historial') {
        if (paneR) paneR.style.display = 'none';
        if (paneH) { paneH.style.display = 'flex'; paneH.style.flexDirection = 'column'; }
        if (tabR) tabR.classList.remove('active');
        if (tabH) tabH.classList.add('active');
        window.srHistPage = 1;
        srCargarHistorial();
    } else {
        if (paneR) paneR.style.display = 'flex';
        if (paneH) paneH.style.display = 'none';
        if (tabH) tabH.classList.remove('active');
        if (tabR) tabR.classList.add('active');
    }
};

function srCargarHistorial() {
    var tbody = document.getElementById('sr-historial-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="td-placeholder"><div class="spinner-border spinner-border-sm text-secondary"></div></td></tr>';
    fetch('/api/taller-rampas?historial=1')
        .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function(rows) {
            window.srHistorialData = rows;
            // Actualizar badge pestaña Historial
            var badgeH = document.getElementById('sr-tab-badge-historial');
            if (badgeH) badgeH.textContent = rows.length;
            srRenderHistorial();
        })
        .catch(function() {
            var t = document.getElementById('sr-historial-tbody');
            if (t) t.innerHTML = '<tr><td colspan="8" class="td-placeholder text-danger">Error al cargar historial</td></tr>';
        });
}

function srRenderHistorial() {
    var tbody = document.getElementById('sr-historial-tbody');
    if (!tbody) return;
    var all = window.srHistorialData || [];

    // Aplicar filtro de fecha
    var filtDesde = window.srHistFiltroDesde || '';
    var filtHasta = window.srHistFiltroHasta || '';
    var rows = (filtDesde || filtHasta) ? all.filter(function(r) {
        var f = r.fecha_ingreso ? String(r.fecha_ingreso).split('T')[0] : '';
        if (filtDesde && f < filtDesde) return false;
        if (filtHasta && f > filtHasta) return false;
        return true;
    }) : all;

    var infoEl = document.getElementById('sr-hist-filtro-info');

    // Aplicar filtro de texto (buscador)
    var q = (window.srHistFiltroTexto || '').toLowerCase().trim();
    if (q) {
        rows = rows.filter(function(r) {
            return (r.placa     || '').toLowerCase().includes(q)
                || (r.situacion || '').toLowerCase().includes(q)
                || (r.obs       || '').toLowerCase().includes(q)
                || String(r.rampa || '').includes(q)
                || (r.liberado_por || '').toLowerCase().includes(q);
        });
    }

    if (infoEl) infoEl.textContent = (filtDesde || filtHasta || q)
        ? rows.length + ' de ' + all.length + ' registros'
        : '';

    var pageSize = window.srHistPageSize || 20;
    var page     = window.srHistPage    || 1;
    var total    = rows.length;
    var totalPag = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPag) page = totalPag;
    var desde = (page - 1) * pageSize;
    var slice = rows.slice(desde, desde + pageSize);

    // Paginación UI
    var info    = document.getElementById('sr-hist-pag-info');
    var btnPrev = document.getElementById('sr-hist-prev');
    var btnNext = document.getElementById('sr-hist-next');
    if (info) info.textContent = total ? 'Página ' + page + ' de ' + totalPag + '  (' + total + ' registros)' : 'Sin registros';
    if (btnPrev) btnPrev.disabled = (page <= 1);
    if (btnNext) btnNext.disabled = (page >= totalPag);

    if (!slice.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="td-placeholder">Sin registros liberados</td></tr>';
        return;
    }
    tbody.innerHTML = slice.map(function(r) {
        var fIng     = r.fecha_ingreso ? String(r.fecha_ingreso).split('T')[0] : '—';
        // Mostrar fecha/hora de salida programada (no fecha_liberado que es timestamp del servidor)
        var fLibDate = r.fecha_salida ? String(r.fecha_salida).split('T')[0] : (r.fecha_liberado ? String(r.fecha_liberado).split('T')[0] : '—');
        var fLibTime = r.hora_salida ? String(r.hora_salida).slice(0,5) : (r.fecha_liberado ? String(r.fecha_liberado).slice(11, 16) : '');
        // Horas en taller para historial
        var hTaller = '—';
        if (r.fecha_ingreso && r.hora_ingreso && fLibDate !== '—' && fLibTime) {
            var hStart = new Date(String(r.fecha_ingreso).split('T')[0] + 'T' + String(r.hora_ingreso).slice(0,5) + ':00');
            var hEnd   = new Date(fLibDate + 'T' + fLibTime + ':00');
            var diffH  = (hEnd - hStart) / 3600000;
            if (diffH > 0) hTaller = diffH.toFixed(1) + 'h';
        }
        var rampaId = parseInt(r.rampa, 10);
        var rIdx = window.srCatRampas ? window.srCatRampas.findIndex(function(c) { return c.id == rampaId; }) : -1;
        var rObj = rIdx >= 0 ? window.srCatRampas[rIdx] : null;
        var rNom = rObj ? (rObj.nombre_rampa || rObj.descripcion || String(rampaId)) : String(rampaId);
        var textRampa = (rampaId >= 1 && rampaId <= 3) ? String(rampaId) : rNom;
        var styleRampa = (rampaId >= 1 && rampaId <= 3) 
            ? 'background:#64748b;' 
            : 'background:#64748b; padding:2px 8px; border-radius:10px; font-size:0.65rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100px; display:inline-block; vertical-align:middle;';
            
        return '<tr style="cursor:pointer;border-bottom:1px solid var(--border);" onclick="window.srAbrirDetalleHistorial(' + r.id + ')">'
            + '<td style="padding:5px 8px;"><span class="' + ((rampaId >= 1 && rampaId <= 3) ? 'sr-badge-rampa' : '') + '" style="' + styleRampa + ' color:#fff; font-weight:700;" title="' + _srEsc(rNom) + '">' + _srEsc(textRampa) + '</span></td>'
            + '<td style="padding:5px 8px;font-weight:700;">' + (r.placa || '—') + '</td>'
            + '<td style="padding:5px 8px;font-size:0.78rem;">' + srFmtFecha(fIng) + ' ' + (r.hora_ingreso ? String(r.hora_ingreso).slice(0,5) : '') + '</td>'
            + '<td style="padding:5px 8px;font-size:0.78rem;">' + srFmtFecha(fLibDate) + (fLibTime ? ' ' + fLibTime : '') + '</td>'
            + '<td style="padding:5px 8px;font-weight:700;font-size:0.8rem;color:var(--primary,#5865F2);">' + hTaller + '</td>'
            + '<td style="padding:5px 8px;font-size:0.78rem;">' + (r.situacion || '—') + '</td>'
            + '<td style="padding:5px 8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:0.78rem;line-height:1.4;" title="' + (r.obs || '').replace(/"/g,'&quot;') + '">' + (r.obs || '—') + '</td>'
            + '<td style="padding:5px 8px;font-size:0.75rem;color:var(--subtext);">' + (r.liberado_por || '—') + '</td>'
            + '<td style="padding:5px 8px;" onclick="event.stopPropagation();"><button class="btn btn-xs btn-outline-warning" style="font-size:0.72rem;padding:2px 8px;" onclick="window.srReactivarRampa(' + r.id + ')"><i class="bi bi-arrow-counterclockwise me-1"></i>Reactivar</button></td>'
            + '</tr>';
    }).join('');
}

window.srAplicarFiltroHist = function() { srRenderHistorial(); };

window.srHistPaginar = function(dir) {
    var all      = window.srHistorialData || [];
    var filtDesde = window.srHistFiltroDesde || '';
    var filtHasta = window.srHistFiltroHasta || '';
    var filtered  = (filtDesde || filtHasta) ? all.filter(function(r) {
        var f = r.fecha_ingreso ? String(r.fecha_ingreso).split('T')[0] : '';
        if (filtDesde && f < filtDesde) return false;
        if (filtHasta && f > filtHasta) return false;
        return true;
    }) : all;
    var pageSize = window.srHistPageSize || 20;
    var totalPag = Math.max(1, Math.ceil(filtered.length / pageSize));
    window.srHistPage = Math.max(1, Math.min(totalPag, (window.srHistPage || 1) + dir));
    srRenderHistorial();
};

window.srAbrirDetalleHistorial = function(id) {
    var row = (window.srHistorialData || []).find(function(r) { return r.id === id; });
    if (!row) return;

    var fIng     = row.fecha_ingreso ? String(row.fecha_ingreso).split('T')[0] : '';
    var fLibDate = row.fecha_liberado ? String(row.fecha_liberado).split('T')[0] : '';
    var fLibTime = row.fecha_liberado ? String(row.fecha_liberado).slice(11, 16) : '';

    function fld(lbl, val) {
        return '<div style="display:flex;padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.82rem;">'
            + '<span style="width:40%;color:var(--subtext);font-weight:600;font-size:0.78rem;">' + lbl + '</span>'
            + '<span style="width:60%;color:var(--text);font-weight:600;word-break:break-word;">' + val + '</span>'
            + '</div>';
    }
    function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    var html = '';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">';
    html += '<div style="font-size:1.1rem;font-weight:900;color:var(--text);margin-right:8px;display:flex;align-items:center;">Rampa <span class="sr-badge-rampa" style="background:#64748b;font-size:0.9rem;margin-left:6px;">' + esc(row.rampa || '?') + '</span></div>';
    html += '<span style="background:#16a34a22;color:#16a34a;border-radius:9px;padding:2px 10px;font-size:0.75rem;font-weight:800;">Liberada</span>';
    html += '</div>';

    html += '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:10px;">';
    html += '<div style="background:var(--bg);padding:8px 12px;font-size:0.73rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:var(--subtext);border-bottom:1px solid var(--border);">Datos del Vehículo</div>';
    html += fld('Placa', '<strong>' + esc(row.placa || '—') + '</strong>');
    html += fld('Kilometraje', esc(row.km || '—'));
    html += fld('Situación', esc(row.situacion || '—'));
    html += fld('Observaciones', esc(row.obs || '—'));
    html += '</div>';

    html += '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:10px;">';
    html += '<div style="background:var(--bg);padding:8px 12px;font-size:0.73rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:var(--subtext);border-bottom:1px solid var(--border);">Fechas</div>';
    html += fld('Ingreso', srFmtFecha(fIng) + (row.hora_ingreso ? ' ' + String(row.hora_ingreso).slice(0,5) : ''));
    html += fld('Salida programada', row.fecha_salida ? srFmtFecha(String(row.fecha_salida).split('T')[0]) + (row.hora_salida ? ' ' + String(row.hora_salida).slice(0,5) : '') : '—');
    html += fld('Liberado el', fLibDate ? srFmtFecha(fLibDate) + (fLibTime ? ' ' + fLibTime : '') : '—');
    html += fld('Liberado por', esc(row.liberado_por || '—'));
    html += '</div>';

    // Buscar OTs generadas en el intervalo de esta rampa para esta placa
    if (window.srOtData && window.srOtData.length) {
        var fStart = new Date(row.fecha_ingreso);
        var fEnd = row.fecha_liberado ? new Date(row.fecha_liberado) : new Date();
        fStart.setHours(0,0,0,0);
        fEnd.setHours(23,59,59,999);

        var ots = window.srOtData.filter(function(o) {
            if (o.id_rampa) return String(o.id_rampa) === String(row.id);
            if (String(o.placa).toUpperCase() !== String(row.placa).toUpperCase()) return false;
            var otD = new Date(o.fecha_ingreso);
            return otD >= fStart && otD <= fEnd;
        });

        if (ots.length) {
            html += '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:10px;">';
            html += '<div style="background:var(--bg);padding:8px 12px;font-size:0.73rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:var(--subtext);border-bottom:1px solid var(--border);">Órdenes Generadas</div>';
            ots.forEach(function(o) {
                var idOt = o.id_ot || o.ticket_entrada;
                html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">';
                html += '<div>';
                html += '<div style="font-weight:700;color:var(--primary,#5865F2);font-size:0.85rem;">' + (window.srFormatID ? window.srFormatID(idOt) : idOt) + '</div>';
                html += '<div style="font-size:0.75rem;color:var(--subtext);">' + esc(o.estado || '') + '</div>';
                html += '</div>';
                html += '<button class="btn btn-sm btn-light" style="padding:4px 8px;font-size:0.75rem;" onclick="window.srCerrarDetalleHist(); setTimeout(function(){window.srAbrirDetalleOT(\'' + idOt + '\')}, 300);"><i class="bi bi-eye"></i></button>';
                html += '</div>';
            });
            html += '</div>';
        }
    }

    var scroll  = document.getElementById('sr-hist-detalle-scroll');
    var footer  = document.getElementById('sr-hist-detalle-footer');
    var panel   = document.getElementById('sr-panel-detalle-hist');
    if (scroll) scroll.innerHTML = html;
    if (footer) {
        footer.innerHTML = '<button class="btn btn-sm btn-outline-warning w-100" onclick="window.srReactivarRampa(' + row.id + ')">'
            + '<i class="bi bi-arrow-counterclockwise me-1"></i>Reactivar en Rampa</button>';
    }
    if (panel) panel.classList.add('open');
};

window.srCerrarDetalleHist = function() {
    window.srCerrarDrawers();
};

window.srReactivarRampa = function(id) {
    if (!confirm('¿Reactivar esta entrada en rampa? Volverá al estado Activo.')) return;
    fetch('/api/taller-rampas/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'reactivar' })
    })
        .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function() {
            window.srCerrarDetalleHist();
            window.srCambiarTab('rampas');
            srCargarEntradas();
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Rampa reactivada correctamente', 'success');
        })
        .catch(function() {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al reactivar rampa', 'danger');
        });
};


// ── Guardar registro (nueva o edición) ──────────────────────────
window.srGuardarRegistro = function() {
    var isEdit = document.getElementById('sr-f-idx') && document.getElementById('sr-f-idx').value !== '';
    if (!window.guardAction('ot', isEdit ? 'e' : 'c')) return;
    var hidEl   = document.getElementById('sr-f-idx');
    var sRampa  = document.getElementById('sr-f-rampa');
    var sPlaca  = document.getElementById('sr-f-placa');
    var sPlacaTxt = document.getElementById('sr-f-placa-txt');
    var sKm     = document.getElementById('sr-f-km');
    var sFecIng = document.getElementById('sr-f-fecha-ing');
    var sHorIng = document.getElementById('sr-f-hora-ing');
    var sFecSal = document.getElementById('sr-f-fecha-sal');
    var sHorSal = document.getElementById('sr-f-hora-sal');
    var sSit    = document.getElementById('sr-f-situacion');
    var sObs    = document.getElementById('sr-f-obs');

    var placa    = (sPlaca && sPlaca.value ? sPlaca.value.trim().toUpperCase() : (sPlacaTxt ? sPlacaTxt.value.trim().toUpperCase() : ''));
    // Leer el id de la rampa del campo hidden sr-f-rampa-id, o del select si existe
    var rampaHid = document.getElementById('sr-f-rampa-id');
    var rampaNum = rampaHid && rampaHid.value
        ? parseInt(rampaHid.value, 10)
        : (sRampa ? parseInt(sRampa.value, 10) : 0);
    var eid      = (hidEl   ? parseInt(hidEl.value, 10) : NaN);

    var sEvidUrl = document.getElementById('sr-f-evidencia-url');
    
    if (!placa)    { alert('La placa es obligatoria.'); return; }
    if (window.dataGlobalPlacas && window.dataGlobalPlacas.length > 0) {
        var isValidPlaca = false;
        for (var i = 0; i < window.dataGlobalPlacas.length; i++) {
            var r = window.dataGlobalPlacas[i];
            var p = String(Array.isArray(r) ? (r[0] || '') : (r.placa || r[0] || '')).trim().toUpperCase();
            if (p === placa) { isValidPlaca = true; break; }
        }
        if (!isValidPlaca) {
            alert('La placa "' + placa + '" no se encuentra registrada en el sistema. Por favor, seleccione una placa válida.');
            return;
        }
    }
    if (!rampaNum) { alert('Selecciona una rampa.'); return; }

    var obsCompilada = window.srObtenerTextoObsFormulario();
    if (sObs) sObs.value = obsCompilada;

    var payload = {
        rampa:        rampaNum,
        placa:        placa,
        km:           sKm     ? (sKm.value     || '') : '',
        fecha_ingreso: sFecIng ? (sFecIng.value || null) : null,
        hora_ingreso:  sHorIng ? (sHorIng.value || null) : null,
        fecha_salida:  sFecSal ? (sFecSal.value || null) : null,
        hora_salida:   sHorSal ? (sHorSal.value || null) : null,
        situacion:    sSit    ? (sSit.value     || '') : '',
        obs:          obsCompilada || '',
        creado_por:   localStorage.getItem('fleet_user') || '',
        evidencia_url: sEvidUrl ? sEvidUrl.value : ''
    };

    var esEdicion = !isNaN(eid) && eid > 0;
    var url    = esEdicion ? '/api/taller-rampas/' + eid : '/api/taller-rampas';
    var method = esEdicion ? 'PUT' : 'POST';

    var finishSave = function() {
        fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(function(d) {
                if (!esEdicion && d.id) window.srDetalleId = d.id;
                if (sRampa) sRampa.disabled = false;
                srCerrarDrawers();
                srCargarEntradas(); // recarga desde BD
                if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Guardado correctamente', 'success');
            })
            .catch(function(err) {
                console.error('Error guardando rampa:', err);
                if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar', 'danger');
            });
    };

    var fInput = document.getElementById('sr-f-evidencia');
    if (fInput && fInput.files && fInput.files[0]) {
        var file = fInput.files[0];
        if (file.size > 15 * 1024 * 1024) {
            alert('El archivo no debe exceder los 15MB.');
            return;
        }
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Subiendo evidencia...', 'info');
        
        fetch('/api/taller-rampas/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, fileType: file.type })
        })
        .then(function(res) { if(!res.ok) throw new Error(); return res.json(); })
        .then(function(data) {
            return fetch(data.uploadUrl, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': file.type }
            }).then(function(uRes) {
                if(!uRes.ok) throw new Error('S3 error');
                payload.evidencia_url = data.finalUrl;
                finishSave();
            });
        })
        .catch(function(err) {
            console.error('Upload Error:', err);
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al subir la evidencia.', 'danger');
        });
    } else {
        finishSave();
    }
};

// ── Generar OT ───────────────────────────────────────────────────
window.srGenerarOT = function(id) {
    var e = window.srEntradas.find(function(x) { return x._id === id; });
    if (!e) return;

    var pDisp = document.getElementById('sr-ot-placa-disp'); if (pDisp) pDisp.textContent = e.placa;
    var rIdx = window.srCatRampas.findIndex(function(r) { return r.id === e.rampa; });
    var rObj = rIdx >= 0 ? window.srCatRampas[rIdx] : null;
    var rNom = rObj ? (rObj.nombre_rampa || rObj.descripcion || 'Rampa ' + e.rampa) : ('Rampa ' + e.rampa);
    var rDisp = document.getElementById('sr-ot-rampa-disp'); if (rDisp) rDisp.textContent = rNom;
    var pHid  = document.getElementById('sr-ot-placa-hid');  if (pHid)  pHid.value = e.placa;
    var rHid  = document.getElementById('sr-ot-rampa-hid');  if (rHid)  rHid.value = String(e.rampa);
    var idRHid = document.getElementById('sr-ot-id-rampa-hid'); if (idRHid) idRHid.value = e._id || e.id;

    var hoy = new Date();
    var fechaHora = (e.fechaIngreso || hoy.toISOString().split('T')[0]) + ' ' + (e.horaIngreso || hoy.toTimeString().slice(0, 5));
    var fhEl = document.getElementById('sr-ot-fecha-ing'); if (fhEl) fhEl.value = fechaHora;
    var kmEl = document.getElementById('sr-ot-km');        if (kmEl) kmEl.value = e.km || '0';
    var moEl = document.getElementById('sr-ot-motivo');    if (moEl) moEl.value = e.obs || '';

    var tipoEl = document.getElementById('sr-ot-tipo');
    if (tipoEl) tipoEl.value = '';
    var subEl  = document.getElementById('sr-ot-subtipo');
    if (subEl)  { subEl.innerHTML = '<option value="">— Seleccionar tipo primero —</option>'; subEl.disabled = true; }
    // Limpiar supervisor y situación
    var supInp = document.getElementById('sr-ot-supervisor-inp'); if (supInp) supInp.value = '';
    var supHid = document.getElementById('sr-ot-supervisor');     if (supHid) supHid.value = '';
    var sitInp = document.getElementById('sr-ot-situacion-inp');  if (sitInp) sitInp.value = '';
    var sitHid = document.getElementById('sr-ot-situacion');      if (sitHid) sitHid.value = '';
    var sisEl  = document.getElementById('sr-ot-sistema');        if (sisEl)  sisEl.value  = '';
    var subSEl = document.getElementById('sr-ot-subsistema');     if (subSEl) subSEl.value = '';

    srAbrirDrawer('sr-drawer-ot');
};

// ── Cascade Sub Tipo ─────────────────────────────────────────────
var SR_SUBTIPOS = {
    'Preventivo': ['Inspección Pre-PM','Campaña','Limpieza Integral','Rutina','Programado','Oportuno'],
    'Correctivo': ['Falla','Varado','Programado','Garantía','Accidentabilidad','Mala Operación'],
    'Predictivo': ['Por condición','Prueba'],
    'Proactivo':  ['Mejora'],
    'Servicio':   ['Stock','Taller']
};

window.srCambiarTipoOT = function() {
    var tipo = (document.getElementById('sr-ot-tipo') || {}).value || '';
    var sel  = document.getElementById('sr-ot-subtipo');
    if (!sel) return;
    var opts = SR_SUBTIPOS[tipo] || [];
    sel.innerHTML = '<option value="">— Seleccionar —</option>' + opts.map(function(s) {
        return '<option value="' + s + '">' + s + '</option>';
    }).join('');
    sel.disabled = !opts.length;
};

// ── Enviar OT ────────────────────────────────────────────────────
window.srEnviarOT = function() {
    var placa      = (document.getElementById('sr-ot-placa-hid') || {}).value || '';
    var rampaId    = (document.getElementById('sr-ot-rampa-hid') || {}).value || '';
    var idRampa    = (document.getElementById('sr-ot-id-rampa-hid') || {}).value || null;
    var rIdx = window.srCatRampas.findIndex(function(r) { return r.id == rampaId; });
    var rObj = rIdx >= 0 ? window.srCatRampas[rIdx] : null;
    var rampa = rObj ? (rObj.nombre_rampa || rObj.descripcion || 'Rampa ' + rampaId) : ('Rampa ' + rampaId);
    var tipo       = (document.getElementById('sr-ot-tipo')       || {}).value || '';
    var subtipo    = (document.getElementById('sr-ot-subtipo')    || {}).value || '';
    var supervisor = (document.getElementById('sr-ot-supervisor') || {}).value || '';
    var motivo     = (document.getElementById('sr-ot-motivo')     || {}).value || '';
    var km         = (document.getElementById('sr-ot-km')         || {}).value || '0';
    var sitIni     = (document.getElementById('sr-ot-situacion')  || {}).value || '';
    var sistema    = ((document.getElementById('sr-ot-sistema')   || {}).value || '').trim();
    var subsistema = ((document.getElementById('sr-ot-subsistema')|| {}).value || '').trim();
    var fechaIng   = (document.getElementById('sr-ot-fecha-ing')  || {}).value || '';

    if (!tipo)    { alert('Selecciona el tipo de OT.');     return; }
    if (!subtipo) { alert('Selecciona el sub tipo de OT.'); return; }
    if (!placa)   { alert('No se encontró la placa. Abre el detalle de la rampa y usa el botón "Generar OT".'); return; }

    fetch('/api/ordenes-trabajo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            placa:        placa,
            estado:       'Pendiente',
            fecha_ingreso: fechaIng,
            id_rampa:     idRampa,
            detalles_json: JSON.stringify({
                tipo_ot:           tipo,
                sub_tipo:          subtipo,
                motivo:            motivo,
                rampa_origen:      rampa,
                supervisor:        supervisor,
                km:                km,
                situacion_inicial: sitIni,
                sistema:           sistema,
                sub_sistema:       subsistema
            })
        })
    })
    .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function(d) {
        srCerrarDrawers();
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT ' + (d.id_ot || '') + ' generada correctamente', 'success');
        srCargarOTs();
    })
    .catch(function(err) {
        console.error('Error generando OT:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al generar la OT', 'danger');
    });
};

// ── Detalle OT ───────────────────────────────────────────────────
window.srAbrirDetalleOT = function(idOt) {
    if (!idOt) return;

    var abrir = function() {
        if (typeof window.rotAbrirDetalle === 'function') {
            window.rotAbrirDetalle(idOt);
        } else {
            console.error('rotAbrirDetalle no disponible');
        }
    };

    if (!document.getElementById('rot-drawer-detalle')) {
        fetch('/modulos/mantenimiento/reportes-ot/vista.html')
            .then(function(r) { return r.text(); })
            .then(function(htmlStr) {
                if (!document.getElementById('rot-drawer-detalle')) {
                    var container = document.createElement('div');
                    container.id = 'rot-shared-drawers-container';
                    container.style.display = 'none';
                    container.innerHTML = htmlStr;
                    document.body.appendChild(container);

                    var backdrop = container.querySelector('#rotDrawerBackdrop');
                    var drawers  = container.querySelectorAll('.rot-drawer, .rot-sub-drawer');
                    if (backdrop) document.body.appendChild(backdrop);
                    drawers.forEach(function(d) { document.body.appendChild(d); });
                }
                if (typeof window.rotAbrirDetalle === 'function') {
                    abrir();
                } else {
                    var s = document.createElement('script');
                    s.src = 'modulos/mantenimiento/reportes-ot/logica.js?v=' + Date.now();
                    s.onload = function() {
                        if (typeof window.rotCargarSituaciones === 'function') window.rotCargarSituaciones();
                        abrir();
                    };
                    document.body.appendChild(s);
                }
            })
            .catch(function(err) {
                console.error('Error al cargar drawers compartidos de OT:', err);
            });
    } else {
        if (typeof window.rotAbrirDetalle === 'function') {
            abrir();
        } else {
            var s = document.createElement('script');
            s.src = 'modulos/mantenimiento/reportes-ot/logica.js?v=' + Date.now();
            s.onload = function() {
                if (typeof window.rotCargarSituaciones === 'function') window.rotCargarSituaciones();
                abrir();
            };
            document.body.appendChild(s);
        }
    }
};

window.srEliminarOT = function(idOt) {
    if (!confirm('¿Eliminar la OT ' + idOt + '? Esta acción no se puede deshacer.')) return;
    fetch('/api/ordenes-trabajo/' + idOt, { method: 'DELETE' })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        srCerrarDrawers();
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT eliminada', 'success');
        srCargarOTs();
    })
    .catch(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar', 'danger');
    });
};

window.srAnularOT = function(idOt) {
    if (!confirm('¿Anular la OT ' + idOt + '? Esta acción no se puede deshacer.')) return;
    fetch('/api/ordenes-trabajo/' + idOt, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'anular' })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT anulada', 'success');
        fetch('/api/ordenes-trabajo')
            .then(function(r) { return r.ok ? r.json() : []; })
            .then(function(data) {
                window.srOtData = Array.isArray(data) ? data : [];
                srRenderTabla();
                window.srAbrirDetalleOT(idOt);
            }).catch(function() {});
    })
    .catch(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al anular', 'danger');
    });
};

window.srAgregarTrabajo = function(idOt) {
    var lbl = document.getElementById('sr-tr-ot-lbl'); if (lbl) lbl.textContent = window.srFormatID(idOt);
    var hid = document.getElementById('sr-tr-ot-id');  if (hid) hid.value = idOt;
    var desc  = document.getElementById('sr-tr-desc');    if (desc)  desc.value  = '';
    var costo = document.getElementById('sr-tr-costo');   if (costo) costo.value = '0';
    var hoy = new Date();
    var localDT = hoy.getFullYear() + '-' +
        String(hoy.getMonth()+1).padStart(2,'0') + '-' +
        String(hoy.getDate()).padStart(2,'0') + 'T' +
        String(hoy.getHours()).padStart(2,'0') + ':' +
        String(hoy.getMinutes()).padStart(2,'0');
    var fi = document.getElementById('sr-tr-fecha-ini'); if (fi) fi.value = localDT;
    var ff = document.getElementById('sr-tr-fecha-fin'); if (ff) ff.value = '';
    srAbrirDrawer('sr-drawer-trabajo');
    srMsInit('');
};

window.srGuardarTrabajo = function() {
    var idOt  = (document.getElementById('sr-tr-ot-id')       || {}).value || '';
    var desc  = ((document.getElementById('sr-tr-desc')        || {}).value || '').trim();
    var pers  = ((document.getElementById('sr-tr-personal')    || {}).value || '').trim();
    var fIni  = ((document.getElementById('sr-tr-fecha-ini')   || {}).value || '');
    var fFin  = ((document.getElementById('sr-tr-fecha-fin')   || {}).value || '');
    var costo = parseFloat((document.getElementById('sr-tr-costo') || {}).value || 0);
    if (!desc) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La descripción es requerida', 'danger'); return; }

    var user = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
    fetch('/api/ot-trabajos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ticket_visita: idOt,
            trabajo_realizado: desc,
            fecha_trabajo:  fIni || null,
            fecha_salida:   fFin || null,
            creado_por:     user,
            detalles_json:  JSON.stringify({ personal: pers, costo: costo })
        })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(d) {
        window.srCerrarSubDrawer('sr-drawer-trabajo');
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Trabajo ' + (d.ticket_visita || '') + ' registrado', 'success');
        // Refrescar secciones del drawer OT
        fetch('/api/ot-trabajos?id_ot=' + encodeURIComponent(idOt))
            .then(function(r){ return r.ok ? r.json() : []; })
            .then(function(rows) {
                window.srOtTrabajosActivos = Array.isArray(rows) ? rows : [];
                var ot = window.srOtData.find(function(o){ return (o.id_ot || o.ticket_entrada) === idOt; });
                srRenderSecTrabajos(idOt, ot ? ot.estado === 'Aprobada' : false);
            }).catch(function(){});
    })
    .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar trabajo', 'danger'); });
};

// ── Variables globales para el form de materiales ────────────────
window._srMatIdx  = window._srMatIdx  || 0;
window._srInvData = window._srInvData || [];

window.srAgregarSalida = function(idOt) {
    var lbl = document.getElementById('sr-mat-ot-lbl'); if (lbl) lbl.textContent = 'OT: ' + window.srFormatID(idOt);
    var hid = document.getElementById('sr-mat-ot-id');  if (hid) hid.value = idOt;
    var vis = document.getElementById('sr-mat-ot-vis'); if (vis) vis.value = idOt;

    var hoy = new Date();
    var fechaHoy = hoy.getFullYear() + '-' +
        String(hoy.getMonth()+1).padStart(2,'0') + '-' +
        String(hoy.getDate()).padStart(2,'0');
    var fecEl = document.getElementById('sr-mat-fecha'); if (fecEl) fecEl.value = fechaHoy;

    var ot = window.srOtData.find(function(o){ return (o.id_ot || o.ticket_entrada) === idOt; });
    var placaEl = document.getElementById('sr-mat-placa'); if (placaEl) placaEl.value = ot ? (ot.placa || '') : '';
    var tipoEl  = document.getElementById('sr-mat-tipo');  if (tipoEl)  tipoEl.value  = 'Vehiculo';

    var solic = document.getElementById('sr-mat-solicitante'); if (solic) solic.value = '';
    var obs   = document.getElementById('sr-mat-obs');         if (obs)   obs.value   = '';
    var tb  = document.getElementById('sr-mat-items-tbody'); if (tb) tb.innerHTML = '';
    window._srMatIdx = 0;
    var tot = document.getElementById('sr-mat-items-total'); if (tot) tot.textContent = 'S/. 0.00';
    _srAgregarItemMat();

    if (!window._srInvData.length) {
        fetch('/api/almacen/inventario')
            .then(function(r) { return r.json(); })
            .then(function(d) {
                window._srInvData = d || [];
                var dl = document.getElementById('sr-mat-inv-list');
                if (dl) dl.innerHTML = (d || []).map(function(a) {
                    return '<option value="' + _srEsc(a.id + ' — ' + a.descripcion) + '">';
                }).join('');
            })
            .catch(function() {});
    }
    fetch('/api/placas-lista')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(d) {
            var lista = Array.isArray(d) ? d : [];
            var dl = document.getElementById('sr-mat-list-placas');
            if (dl) dl.innerHTML = lista.map(function(p) {
                return '<option value="' + _srEsc(p.placa || String(p)) + '">';
            }).join('');
        })
        .catch(function() {});
    fetch('/api/conductores-lista')
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(d) {
            var dl = document.getElementById('sr-mat-list-personal');
            if (dl) dl.innerHTML = (Array.isArray(d) ? d : []).map(function(c) {
                return '<option value="' + _srEsc(c.nombre || '') + '">';
            }).join('');
        })
        .catch(function() {});

    srAbrirDrawer('sr-drawer-material');
};

window._srAgregarItemMat = function() {
    var tbody = document.getElementById('sr-mat-items-tbody');
    if (!tbody) return;
    var idx = window._srMatIdx++;
    var tr = document.createElement('tr');
    tr.id = 'sr-mat-item-' + idx;
    tr.innerHTML =
        '<td>' +
            '<input type="text" class="form-control form-control-sm sr-mat-item-desc" list="sr-mat-inv-list" placeholder="Artículo…" data-idx="' + idx + '" oninput="window._srBuscarArtMat(this,' + idx + ')">' +
            '<input type="hidden" class="sr-mat-item-inv-id" data-idx="' + idx + '">' +
            '<input type="hidden" class="sr-mat-item-stock" data-idx="' + idx + '" value="">' +
            '<div class="sr-mat-item-stock-lbl" data-idx="' + idx + '" style="font-size:0.71rem;margin-top:2px;display:none;"></div>' +
        '</td>' +
        '<td><input type="number" class="form-control form-control-sm sr-mat-item-cant" data-idx="' + idx + '" value="1" min="0.001" step="0.001" oninput="window._srCalcItemMat(' + idx + ')"></td>' +
        '<td><input type="number" class="form-control form-control-sm sr-mat-item-cu" data-idx="' + idx + '" value="0" min="0" step="0.01" oninput="window._srCalcItemMat(' + idx + ')"></td>' +
        '<td><input type="number" class="form-control form-control-sm sr-mat-item-imp" data-idx="' + idx + '" value="0" readonly></td>' +
        '<td><button type="button" class="btn btn-sm btn-outline-danger" onclick="window._srQuitarItemMat(' + idx + ')"><i class="bi bi-x"></i></button></td>';
    tbody.appendChild(tr);
};

window._srBuscarArtMat = function(input, idx) {
    var val = input.value || '';
    var invId = val.split(' — ')[0].trim();
    var item = (window._srInvData || []).find(function(d) { return d.id === invId; });
    var stockEl = document.querySelector('.sr-mat-item-stock[data-idx="' + idx + '"]');
    var lblEl   = document.querySelector('.sr-mat-item-stock-lbl[data-idx="' + idx + '"]');
    if (item) {
        var hidEl = document.querySelector('.sr-mat-item-inv-id[data-idx="' + idx + '"]');
        if (hidEl) hidEl.value = item.id;
        var cuEl = document.querySelector('.sr-mat-item-cu[data-idx="' + idx + '"]');
        if (cuEl) { cuEl.value = parseFloat(item.costo_referencial || 0).toFixed(2); window._srCalcItemMat(idx); }
        var stock = parseFloat(item.stock_actual != null ? item.stock_actual : -1);
        if (stockEl) stockEl.value = stock;
        if (lblEl) {
            lblEl.style.display = '';
            if (stock <= 0) {
                lblEl.innerHTML = '<span style="color:#dc2626;font-weight:700;">⚠ Sin stock disponible</span>';
            } else {
                lblEl.innerHTML = '<span style="color:#16a34a;">Stock disponible: <strong>' + stock + '</strong> ' + (item.unidad || 'und') + '</span>';
            }
        }
    } else {
        if (stockEl) stockEl.value = '';
        if (lblEl) lblEl.style.display = 'none';
    }
};

window._srCalcItemMat = function(idx) {
    var cant = parseFloat((document.querySelector('.sr-mat-item-cant[data-idx="' + idx + '"]') || {}).value) || 0;
    var cu   = parseFloat((document.querySelector('.sr-mat-item-cu[data-idx="' + idx + '"]')   || {}).value) || 0;
    var impEl = document.querySelector('.sr-mat-item-imp[data-idx="' + idx + '"]');
    if (impEl) impEl.value = (cant * cu).toFixed(2);
    _srActualizarTotalMat();
};

window._srQuitarItemMat = function(idx) {
    var tr = document.getElementById('sr-mat-item-' + idx);
    if (tr) tr.remove();
    _srActualizarTotalMat();
};

function _srActualizarTotalMat() {
    var imps = document.querySelectorAll('.sr-mat-item-imp');
    var total = 0;
    imps.forEach(function(el) { total += parseFloat(el.value) || 0; });
    var el = document.getElementById('sr-mat-items-total');
    if (el) el.textContent = 'S/. ' + total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

window.srGuardarMaterial = function() {
    var idOt  = ((document.getElementById('sr-mat-ot-id')      || {}).value || '');
    var fecha = ((document.getElementById('sr-mat-fecha')       || {}).value || '');
    var tipo  = ((document.getElementById('sr-mat-tipo')        || {}).value || 'Vehiculo');
    var placa = ((document.getElementById('sr-mat-placa')       || {}).value || '').trim();
    var solic = ((document.getElementById('sr-mat-solicitante') || {}).value || '').trim();
    var obs   = ((document.getElementById('sr-mat-obs')         || {}).value || '').trim();

    var descs = document.querySelectorAll('.sr-mat-item-desc');
    var cants = document.querySelectorAll('.sr-mat-item-cant');
    var cus   = document.querySelectorAll('.sr-mat-item-cu');
    var imps  = document.querySelectorAll('.sr-mat-item-imp');
    var items = [];
    for (var i = 0; i < cants.length; i++) {
        var desc = descs[i] ? descs[i].value.trim() : '';
        if (!desc) continue;
        var cant = parseFloat(cants[i].value) || 0;
        var cu   = parseFloat(cus[i].value)   || 0;
        var imp  = parseFloat(imps[i].value)  || cant * cu;
        if (cant <= 0) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Cantidad inválida en fila ' + (i+1), 'danger'); return; }
        items.push({ descripcion: desc, cantidad: cant, costo_unitario: cu, importe: imp });
    }
    if (!items.length) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Agrega al menos un artículo', 'danger'); return; }

    // Validar stock antes de guardar
    var sinStock = [];
    var invIds = document.querySelectorAll('.sr-mat-item-inv-id');
    var descs2 = document.querySelectorAll('.sr-mat-item-desc');
    items.forEach(function(it, i) {
        var invId = invIds[i] ? invIds[i].value : '';
        if (invId) {
            var inv = (window._srInvData || []).find(function(d) { return d.id === invId; });
            if (inv) {
                var stockDisp = parseFloat(inv.stock_actual != null ? inv.stock_actual : 0);
                if (it.cantidad > stockDisp) {
                    sinStock.push('"' + it.descripcion + '" — solicitado: ' + it.cantidad + ', disponible: ' + (stockDisp <= 0 ? 'Sin stock' : stockDisp));
                }
            }
        }
    });
    if (sinStock.length) {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Stock insuficiente:\n• ' + sinStock.join('\n• '), 'danger');
        }
        return;
    }

    var user = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
    fetch('/api/ot-materiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_ot: idOt, fecha: fecha || null, tipo_destino: tipo, placa: placa, responsable: solic, observaciones: obs, creado_por: user, items: items })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(d) {
        window.srCerrarSubDrawer('sr-drawer-material');
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Solicitud ' + (d.id || '') + ' registrada', 'success');
        fetch('/api/ot-materiales?ticket_ot=' + encodeURIComponent(idOt))
            .then(function(r){ return r.ok ? r.json() : []; })
            .then(function(rows) {
                window.srOtMaterialesActivos = Array.isArray(rows) ? rows : [];
                var ot = window.srOtData.find(function(o){ return (o.id_ot || o.ticket_entrada) === idOt; });
                srRenderSecMateriales(idOt, ot ? ot.estado === 'Aprobada' : false);
            }).catch(function(){});
    })
    .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar solicitud', 'danger'); });
};

window.srEliminarMaterial = function(idSolicitud, idOt) {
    if (!confirm('¿Eliminar esta solicitud de material?')) return;
    fetch('/api/ot-materiales/' + encodeURIComponent(idSolicitud), { method: 'DELETE' })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Solicitud eliminada', 'success');
        fetch('/api/ot-materiales?ticket_ot=' + encodeURIComponent(idOt))
            .then(function(r){ return r.ok ? r.json() : []; })
            .then(function(rows) {
                window.srOtMaterialesActivos = Array.isArray(rows) ? rows : [];
                var ot = window.srOtData.find(function(o){ return (o.id_ot || o.ticket_entrada) === idOt; });
                srRenderSecMateriales(idOt, ot ? ot.estado === 'Aprobada' : false);
            }).catch(function(){});
    })
    .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar', 'danger'); });
};

window.srPDFOT = function(idOt) {
    var ot = window.srOtData.find(function(o) { return (o.id_ot || o.ticket_entrada) === idOt; });
    if (!ot) return;
    if (typeof window.generarPDF_OT === 'function') {
        window.generarPDF_OT(ot, window.srOtTrabajosActivos, window.srOtMaterialesActivos);
    } else {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Librería PDF no cargada. Recarga la página.', 'warning');
    }
};

// ── Render dinámico: sección Trabajos en el drawer OT ────────────
function srRenderSecTrabajos(idOt, esAprobada) {
    var body  = document.getElementById('sr-tr-body');
    var count = document.getElementById('sr-tr-count');
    if (!body) return;
    var lista = window.srOtTrabajosActivos;
    if (count) count.textContent = lista.length;

    var costoTotal = lista
        .filter(function(t) { return t.estado === 'Aprobado'; })
        .reduce(function(s, t) {
            var d2 = {}; try { d2 = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); } catch(e) {}
            return s + parseFloat(d2.costo || 0);
        }, 0);

    var html = '';
    if (esAprobada) {
        html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);">'
              + '<button class="btn btn-sm btn-outline-primary" onclick="window.srAgregarTrabajo(\'' + idOt + '\')">'
              + '<i class="bi bi-plus-lg me-1"></i>Agregar Trabajo</button></div>';
    }
    if (!lista.length) {
        html += '<div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;">No hay trabajos registrados</div>';
    } else {
        lista.forEach(function(t) {
            var det2 = {};
            try { det2 = typeof t.detalles_json === 'string' ? JSON.parse(t.detalles_json) : (t.detalles_json || {}); } catch(e) {}
            var bdg = t.estado === 'Aprobado'
                ? '<span style="background:rgba(22,163,74,0.12);color:#16a34a;border-radius:12px;padding:2px 8px;font-size:0.68rem;font-weight:700;">Aprobado</span>'
                : '<span style="background:rgba(217,119,6,0.12);color:#d97706;border-radius:12px;padding:2px 8px;font-size:0.68rem;font-weight:700;">Pendiente</span>';
            var fecIni = t.fecha_trabajo ? String(t.fecha_trabajo).replace('T',' ').slice(0,16) : '';
            var fecFin = t.fecha_salida  ? String(t.fecha_salida).replace('T',' ').slice(0,16)  : '';
            html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.81rem;">'
                  + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">'
                  + '<div><span style="font-weight:700;color:var(--primary,#5865F2);font-size:0.72rem;">' + (t.ticket_visita || '') + '</span> '
                  + bdg + '</div>'
                  + (det2.costo ? '<span style="font-weight:700;color:#16a34a;font-size:0.78rem;">S/' + parseFloat(det2.costo).toFixed(2) + '</span>' : '')
                  + '</div>'
                  + '<div style="color:var(--text);margin-top:3px;">' + (t.trabajo_realizado || '—') + '</div>'
                  + (det2.personal ? '<div style="font-size:0.75rem;color:var(--subtext);margin-top:2px;"><i class="bi bi-person me-1"></i>' + det2.personal + '</div>' : '')
                  + ((fecIni || fecFin) ? '<div style="font-size:0.75rem;color:var(--subtext);margin-top:1px;"><i class="bi bi-calendar me-1"></i>'
                      + (fecIni || '') + (fecFin ? ' → ' + fecFin : '') + '</div>' : '')
                  + '</div>';
        });
        if (costoTotal > 0) {
            html += '<div style="padding:8px 12px;font-size:0.82rem;font-weight:700;text-align:right;color:#16a34a;">'
                  + 'Total aprobado: S/' + costoTotal.toFixed(2) + '</div>';
        }
    }
    body.innerHTML = html;
}

// ── Render dinámico: sección Materiales en el drawer OT ──────────
function srRenderSecMateriales(idOt, esAprobada) {
    var body  = document.getElementById('sr-mat-body');
    var count = document.getElementById('sr-mat-count');
    if (!body) return;
    var lista = window.srOtMaterialesActivos;
    if (count) count.textContent = lista.length;

    var costoTotal = lista
        .filter(function(m) { return m.estado === 'Despachado'; })
        .reduce(function(s, m) { return s + parseFloat(m.total_pen || 0); }, 0);
    var hayPendientes = lista.some(function(m) { return m.estado !== 'Despachado'; });

    var html = '';
    if (esAprobada) {
        html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);">'
              + '<button class="btn btn-sm btn-outline-secondary" onclick="window.srAgregarSalida(\'' + idOt + '\')">'
              + '<i class="bi bi-plus-lg me-1"></i>Agregar Solicitud</button></div>';
    }
    if (!lista.length) {
        html += '<div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;">No hay salidas registradas</div>';
    } else {
        lista.forEach(function(m) {
            var badge = m.estado === 'Despachado'
                ? '<span style="background:rgba(22,163,74,0.12);color:#16a34a;border-radius:12px;padding:2px 8px;font-size:0.68rem;font-weight:700;">Despachado</span>'
                : '<span style="background:rgba(217,119,6,0.12);color:#d97706;border-radius:12px;padding:2px 8px;font-size:0.68rem;font-weight:700;">Pendiente</span>';
            var items = m.items || [];
            var artResumen = items.map(function(it) { return it.descripcion || it.inventario_id || '—'; }).join(', ') || '—';
            html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.81rem;">'
                  + '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">'
                  + '<div><span style="font-weight:700;color:var(--text);font-size:0.75rem;">' + (m.id || '—') + '</span> ' + badge + '</div>'
                  + '<button class="btn btn-sm" style="color:var(--subtext);padding:0 4px;" onclick="window.srEliminarMaterial(\'' + m.id + '\',\'' + idOt + '\')" title="Eliminar"><i class="bi bi-trash" style="font-size:0.75rem;"></i></button>'
                  + '</div>'
                  + '<div style="color:var(--subtext);margin-top:2px;font-size:0.79rem;">' + artResumen + '</div>'
                  + '<div style="margin-top:2px;"><strong style="color:var(--text);">Total: S/.' + parseFloat(m.total_pen || 0).toFixed(2) + '</strong></div>'
                  + '</div>';
        });
        html += '<div style="padding:8px 12px;font-size:0.82rem;font-weight:700;text-align:right;color:#16a34a;">'
              + 'Total despachado: S/.' + costoTotal.toFixed(2)
              + (hayPendientes ? '<span style="font-size:0.72rem;color:#d97706;margin-left:6px;">(pendientes no incluidos)</span>' : '')
              + '</div>';
    }
    body.innerHTML = html;
}

// ── Helpers dropdown buscable ─────────────────────────────────────
window._srDropData = window._srDropData || {};

function srMostrarDrop(dropId) {
    var el = document.getElementById(dropId);
    if (el) el.style.display = 'block';
}

function srOcultarDrop(dropId) {
    var el = document.getElementById(dropId);
    if (el) el.style.display = 'none';
}

function srFiltrarOpciones(dropId, query) {
    var el = document.getElementById(dropId);
    if (!el) return;
    var q = (query || '').toLowerCase().trim();
    var lista = window._srDropData[dropId] || [];
    var filtrada = q ? lista.filter(function(n) { return n.toLowerCase().indexOf(q) !== -1; }) : lista;
    if (!filtrada.length) {
        el.innerHTML = '<div class="sr-drop-empty">Sin resultados</div>';
    } else {
        el.innerHTML = filtrada.map(function(n) {
            var nEsc = n.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            return '<div class="sr-drop-item" onmousedown="srSeleccionarDrop(\'' + dropId + '\',\'' + n.replace(/'/g,"\\'") + '\')">' + nEsc + '</div>';
        }).join('');
    }
    el.style.display = 'block';
}

window.srSeleccionarDrop = function(dropId, valor) {
    var el = document.getElementById(dropId);
    if (el) el.style.display = 'none';
    // Determinar qué campos llenar según el dropdown
    if (dropId === 'sr-ot-supervisor-drop') {
        var inp = document.getElementById('sr-ot-supervisor-inp');
        var hid = document.getElementById('sr-ot-supervisor');
        if (inp) inp.value = valor;
        if (hid) hid.value = valor;
    } else if (dropId === 'sr-ot-situacion-drop') {
        var inp2 = document.getElementById('sr-ot-situacion-inp');
        var hid2 = document.getElementById('sr-ot-situacion');
        if (inp2) inp2.value = valor;
        if (hid2) hid2.value = valor;
    }
};

// ── Helpers UI ───────────────────────────────────────────────────
function srBadgeSituacion(sit, ocupada) {
    if (!ocupada || !sit) return '<span class="sr-semaforo sr-sem-vacio" style="color:#059669; font-weight:700;"><i class="bi bi-circle-fill me-1" style="font-size:0.4rem;"></i>Libre & Disponible</span>';
    var bg, c, b;
    var s = sit.toLowerCase();
    if (s === 'finalizado') { bg = '#fee2e2'; c = '#dc2626'; b = '#fca5a5'; } // Rojo
    else if (s === 'en atención') { bg = '#dcfce7'; c = '#16a34a'; b = '#86efac'; } // Verde
    else if (s.indexOf('espera') !== -1) { bg = '#fef9c3'; c = '#ca8a04'; b = '#fde047'; } // Amarillo
    else if (s === 'taller tercero') { bg = '#fdf4ff'; c = '#d946ef'; b = '#f5d0fe'; } // Magenta
    else { bg = '#f1f5f9'; c = '#0f172a'; b = '#cbd5e1'; } // Negro/Default

    return '<span style="background:'+bg+'; color:'+c+'; border:1px solid '+b+'; font-weight:700; font-size:0.75rem; padding:3px 10px; border-radius:2rem; display:inline-block; white-space:nowrap;">' + _srEsc(sit) + '</span>';
}

function srSemaforo(sit, ocupada) {
    if (!ocupada || !sit) return '<span class="sr-semaforo sr-sem-vacio"><span class="sr-sem-dot"></span>Libre</span>';
    var cls = 'sr-sem-proceso';
    if (sit === 'En espera') cls = 'sr-sem-espera';
    if (sit === 'Listo')     cls = 'sr-sem-listo';
    return '<span class="sr-semaforo ' + cls + '"><span class="sr-sem-dot"></span>' + sit + '</span>';
}

function srBadgeEstado(estado) {
    var map = {
        'Pendiente':  'rgba(217,119,6,0.12);color:#d97706',
        'Aprobada':   'rgba(22,163,74,0.12);color:#16a34a',
        'Cerrada':    'rgba(100,116,139,0.12);color:#64748b',
        'Anulado':    'rgba(220,38,38,0.1);color:#dc2626',
        'Finalizado': 'rgba(22,163,74,0.12);color:#16a34a'
    };
    var s = map[estado] || 'rgba(148,163,184,0.12);color:#94a3b8';
    return '<span style="display:inline-block;padding:2px 9px;border-radius:12px;font-size:0.72rem;font-weight:700;background:' + s.split(';')[0] + ';' + s.split(';')[1] + '">' + estado + '</span>';
}

function srField(lbl, val) {
    return '<div class="sr-field"><span class="sr-field-lbl">' + lbl + '</span><span class="sr-field-val">' + val + '</span></div>';
}

function srFmtFecha(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    if (p.length !== 3) return iso;
    var m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return p[2] + ' ' + m[parseInt(p[1],10)-1] + ' ' + p[0].slice(2);
}

function _srEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Configurar Rampas ─────────────────────────────────────────────
window.srAbrirConfigRampas = function() {
    var panel = document.getElementById('sr-config-rampas');
    var bd    = document.getElementById('sr-config-bd');
    if (panel) { panel.classList.add('open'); }
    if (bd)    bd.style.display = 'block';
    if (window.srCatRampas && window.srCatRampas.length) {
        srRenderConfigRampas();
    } else {
        fetch('/api/cat-rampas')
            .then(function(r) { return r.ok ? r.json() : []; })
            .then(function(d) {
                window.srCatRampas = Array.isArray(d) ? d : [];
                srRenderConfigRampas();
            })
            .catch(function() { srRenderConfigRampas(); });
    }
};

window.srCerrarConfigRampas = function() {
    var panel = document.getElementById('sr-config-rampas');
    var bd    = document.getElementById('sr-config-bd');
    if (panel) { panel.classList.remove('open'); }
    if (bd)    bd.style.display = 'none';
};

function srRenderConfigRampas() {
    var list = document.getElementById('sr-config-list');
    if (!list) return;
    var rampas = window.srCatRampas || [];
    if (!rampas.length) {
        list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--subtext);font-size:.85rem;">Sin rampas. Agrega la primera.</div>';
        return;
    }
    list.innerHTML = rampas.map(function(r) {
        return '<div class="sr-cfg-row" data-id="' + r.id + '" draggable="true" ' +
               'style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);cursor:default;">' +
            '<span class="sr-cfg-drag" title="Arrastrar para reordenar" ' +
               'style="cursor:grab;color:var(--subtext);padding:0 4px;font-size:1rem;flex-shrink:0;">⠿</span>' +
            '<input type="text" value="' + _srEsc(r.nombre_rampa) + '" id="sr-cfg-nom-' + r.id + '" ' +
                'style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:.85rem;" ' +
                'onblur="window.srGuardarNombreRampa(' + r.id + ')" ' +
                'onkeydown="if(event.key===\'Enter\')this.blur()">' +
            '<button onclick="window.srEliminarRampa(' + r.id + ')" title="Eliminar" ' +
                'style="border:none;background:none;color:#ef4444;cursor:pointer;padding:4px 6px;border-radius:6px;" ' +
                'onmouseover="this.style.background=\'#fee2e2\'" onmouseout="this.style.background=\'none\'">' +
                '<i class="bi bi-trash"></i></button>' +
        '</div>';
    }).join('');
    srInitDragRampas(list);
}

function srInitDragRampas(list) {
    var dragSrc = null;
    list.querySelectorAll('.sr-cfg-row').forEach(function(row) {
        row.addEventListener('dragstart', function(e) {
            dragSrc = row;
            e.dataTransfer.effectAllowed = 'move';
            row.style.opacity = '.4';
        });
        row.addEventListener('dragend', function() {
            row.style.opacity = '';
            list.querySelectorAll('.sr-cfg-row').forEach(function(r) {
                r.style.borderTop = '';
            });
        });
        row.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            list.querySelectorAll('.sr-cfg-row').forEach(function(r) { r.style.borderTop = ''; });
            if (row !== dragSrc) row.style.borderTop = '2px solid #2563eb';
        });
        row.addEventListener('drop', function(e) {
            e.preventDefault();
            if (dragSrc && dragSrc !== row) {
                // Reordenar en DOM y en array
                var rows = Array.from(list.querySelectorAll('.sr-cfg-row'));
                var fromIdx = rows.indexOf(dragSrc);
                var toIdx   = rows.indexOf(row);
                // Mover en window.srCatRampas
                var arr = window.srCatRampas;
                var moved = arr.splice(fromIdx, 1)[0];
                arr.splice(toIdx, 0, moved);
                srRenderConfigRampas();
                srGuardarOrdenRampas();
            }
        });
    });
}

function srGuardarOrdenRampas() {
    var items = window.srCatRampas.map(function(r, i) { return { id: r.id, orden: i + 1 }; });
    fetch('/api/cat-rampas/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items)
    })
    .then(function() { srRenderTabla(); })
    .catch(function() {});
}

window.srGuardarNombreRampa = function(id) {
    var inp = document.getElementById('sr-cfg-nom-' + id);
    if (!inp) return;
    var nombre = inp.value.trim();
    if (!nombre) { inp.value = (window.srCatRampas.find(function(r){return r.id===id;})||{}).nombre_rampa || ''; return; }
    fetch('/api/cat-rampas/' + id, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ nombre_rampa: nombre })
    })
    .then(function(r) { return r.json(); })
    .then(function() {
        var r = window.srCatRampas.find(function(x){return x.id===id;});
        if (r) r.nombre_rampa = nombre;
        srRenderTabla();
        var sel = document.getElementById('sr-f-rampa');
        if (sel) {
            var opt = sel.querySelector('option[value="'+id+'"]');
            if (opt) opt.textContent = nombre;
        }
    })
    .catch(function() { inp.style.borderColor='#ef4444'; });
};

window.srAgregarRampa = function() {
    var inp = document.getElementById('sr-cfg-nueva');
    if (!inp) return;
    var nombre = inp.value.trim();
    if (!nombre) { inp.focus(); return; }
    fetch('/api/cat-rampas', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ nombre_rampa: nombre })
    })
    .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function(res) {
        inp.value = '';
        window.srCatRampas.push({ id: res.id, nombre_rampa: nombre, sede: 'Principal', estado: 'Disponible' });
        srRenderConfigRampas();
        srRenderTabla();
        var sel = document.getElementById('sr-f-rampa');
        if (sel) sel.innerHTML += '<option value="'+res.id+'">'+_srEsc(nombre)+'</option>';
    })
    .catch(function() { alert('Error al agregar rampa.'); });
};

window.srEliminarRampa = function(id) {
    if (!confirm('¿Eliminar esta rampa? Solo se puede si está libre.')) return;
    fetch('/api/cat-rampas/' + id, { method: 'DELETE' })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res.error) { alert(res.error); return; }
            window.srCatRampas = window.srCatRampas.filter(function(r){return r.id !== id;});
            srRenderConfigRampas();
            srRenderTabla();
        })
        .catch(function() { alert('Error al eliminar.'); });
};

function srAbrirDrawer(id) {
    var back = document.getElementById('srDrawerBackdrop');
    if (back) back.classList.add('open');
    var d = document.getElementById(id);
    if (d) d.classList.add('open');
}

window.srCerrarDrawers = function() {
    var back1 = document.getElementById('srDrawerBackdrop');
    if (back1) back1.classList.remove('open');
    var back2 = document.getElementById('rotDrawerBackdrop');
    if (back2) back2.classList.remove('open');
    ['sr-drawer-registro','sr-drawer-ot','sr-drawer-ot-det','sr-drawer-trabajo','sr-drawer-material','sr-drawer-editar-ot', 'sr-panel-detalle', 'sr-panel-detalle-hist', 'rot-drawer-detalle', 'rot-drawer-trabajo', 'rot-drawer-material', 'rot-drawer-backlog', 'rot-drawer-editar-ot', 'rot-drawer-editar-fechas'].forEach(function(id) {
        var d = document.getElementById(id);
        if (d) d.classList.remove('open');
    });
    var sR = document.getElementById('sr-f-rampa');
    if (sR) sR.disabled = false;
};

// Cierra solo un sub-drawer sin afectar el backdrop ni los demás
window.srCerrarSubDrawer = function(drawerId) {
    var d = document.getElementById(drawerId);
    if (d) d.classList.remove('open');
    // Apagar backdrop solo si ningún otro drawer está abierto
    var abiertos = ['sr-drawer-registro','sr-drawer-ot','sr-drawer-ot-det','sr-drawer-trabajo','sr-drawer-material','sr-drawer-editar-ot','sr-drawer-backlog'].filter(function(id) {
        var el = document.getElementById(id);
        return el && el.classList.contains('open');
    });
    if (!abiertos.length) {
        var back = document.getElementById('srDrawerBackdrop');
        if (back) back.classList.remove('open');
    }
};

// ── Render sección Backlog en detalle OT ─────────────────────────
function srRenderSecBacklog(items) {
    var body  = document.getElementById('sr-bkg-body');
    var count = document.getElementById('sr-bkg-count');
    if (!body) return;
    if (count) count.textContent = items.length;

    if (!items.length) {
        body.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--subtext);font-size:0.82rem;">No hay pendientes para esta unidad</div>';
        return;
    }

    function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    var html = '';
    items.forEach(function(b) {
        html += '<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:0.81rem;">'
              + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">'
              + '<div><span style="font-weight:700;font-size:0.72rem;color:#d97706;">' + esc(b.backlog_id || String(b.id)) + '</span>'
              + (b.tema ? ' <span style="font-size:0.72rem;color:var(--subtext);">' + esc(b.tema) + '</span>' : '') + '</div>'
              + '<div style="display:flex;gap:4px;">'
              + '<button class="btn btn-sm" style="padding:1px 7px;font-size:0.7rem;background:rgba(22,163,74,0.1);color:#16a34a;font-weight:700;border-radius:12px;" '
              + 'onclick="event.stopPropagation();window.srMarcarBacklogRealizado(' + b.id + ',this)" title="Marcar como Realizado">✓ Realizado</button>'
              + '<button class="btn btn-sm" style="padding:1px 6px;color:var(--subtext);font-size:0.78rem;" '
              + 'onclick="event.stopPropagation();window.srEliminarBacklogItem(' + b.id + ',this)" title="Eliminar"><i class="bi bi-trash"></i></button>'
              + '</div>'
              + '</div>'
              + '<div style="color:var(--text);margin-top:3px;">' + esc(b.tarea || '—') + '</div>'
              + (b.reportado_por ? '<div style="font-size:0.73rem;color:var(--subtext);margin-top:2px;"><i class="bi bi-person me-1"></i>' + esc(b.reportado_por) + '</div>' : '')
              + '</div>';
    });
    body.innerHTML = html;
}

window.srEliminarBacklogItem = function(id, btn) {
    if (!confirm('¿Eliminar este mantenimiento pendiente?')) return;
    if (btn) btn.disabled = true;
    fetch('/api/ot-backlog/' + id, { method: 'DELETE' })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Pendiente eliminado', 'success');
        if (btn) {
            var row = btn.closest ? btn.closest('[style*="border-bottom"]') : btn.parentNode.parentNode.parentNode;
            if (row && row.parentNode) row.parentNode.removeChild(row);
            var count = document.getElementById('sr-bkg-count');
            if (count) count.textContent = Math.max(0, (parseInt(count.textContent) || 1) - 1);
        }
    })
    .catch(function() {
        if (btn) btn.disabled = false;
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al eliminar', 'danger');
    });
};

window.srAbrirAgregarBacklog = function(placa) {
    var lbl = document.getElementById('sr-bkg-placa-lbl'); if (lbl) lbl.textContent = 'Placa: ' + placa;
    var hid = document.getElementById('sr-bkg-placa-hid'); if (hid) hid.value = placa;
    var tema  = document.getElementById('sr-bkg-tema');         if (tema)  tema.value  = '';
    var tarea = document.getElementById('sr-bkg-tarea');        if (tarea) tarea.value = '';
    var rep   = document.getElementById('sr-bkg-reportado-por');if (rep)   rep.value   = '';
    srAbrirDrawer('sr-drawer-backlog');
};

window.srGuardarBacklog = function() {
    var placa = ((document.getElementById('sr-bkg-placa-hid')     || {}).value || '').trim();
    var tema  = ((document.getElementById('sr-bkg-tema')          || {}).value || '').trim();
    var tarea = ((document.getElementById('sr-bkg-tarea')         || {}).value || '').trim();
    var rep   = ((document.getElementById('sr-bkg-reportado-por') || {}).value || '').trim();
    if (!placa || !tarea) { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('La descripción es requerida', 'danger'); return; }
    var user = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_correo') || '';
    fetch('/api/ot-backlog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa: placa, tema: tema, tarea: tarea, reportado_por: rep || user, estado: 'Pendiente', creado_por: user })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        window.srCerrarSubDrawer('sr-drawer-backlog');
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Mantenimiento pendiente agregado', 'success');
        fetch('/api/ot-backlog?placa=' + encodeURIComponent(placa) + '&estado=Pendiente')
            .then(function(r){ return r.ok ? r.json() : []; })
            .then(function(items) { srRenderSecBacklog(Array.isArray(items) ? items : []); })
            .catch(function(){});
    })
    .catch(function() { if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al agregar pendiente', 'danger'); });
};

window.srMarcarBacklogRealizado = function(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    fetch('/api/ot-backlog/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'Realizado' })
    })
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function() {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Backlog marcado como Realizado', 'success');
        if (btn) {
            var row = btn.closest ? btn.closest('[style]') : btn.parentNode.parentNode;
            if (row && row.parentNode) row.parentNode.removeChild(row);
            var count = document.getElementById('sr-bkg-count');
            if (count) count.textContent = Math.max(0, (parseInt(count.textContent) || 1) - 1);
        }
    })
    .catch(function() {
        if (btn) { btn.disabled = false; btn.innerHTML = '✓ Realizado'; }
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al actualizar el backlog', 'danger');
    });
};

// ── Editar OT — abrir sub-drawer ─────────────────────────────────
window.srEditarOT = function(idOt) {
    var ot = window.srOtData.find(function(o) { return (o.id_ot || o.ticket_entrada) === idOt; });
    if (!ot) return;
    var det = {};
    try { det = typeof ot.detalles_json === 'string' ? JSON.parse(ot.detalles_json) : (ot.detalles_json || {}); } catch(ex) {}

    var set = function(id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
    set('sr-eot-id',         idOt);
    set('sr-eot-supervisor', det.supervisor || ot.supervisor || '');
    set('sr-eot-motivo',     det.motivo || ot.observaciones || '');

    var sitEl = document.getElementById('sr-eot-situacion');
    if (sitEl) sitEl.value = det.situacion_inicial || ot.situacion || '';

    var tipoEl = document.getElementById('sr-eot-tipo');
    if (tipoEl) {
        tipoEl.value = det.tipo_ot || '';
        window.srCambiarTipoEOT();
    }
    setTimeout(function() {
        var subEl = document.getElementById('sr-eot-subtipo');
        if (subEl) subEl.value = det.sub_tipo || '';
    }, 50);

    var lbl = document.getElementById('sr-eot-id-lbl');
    if (lbl) lbl.textContent = window.srFormatID(idOt);

    srAbrirDrawer('sr-drawer-editar-ot');
};

window.srCambiarTipoEOT = function() {
    var tipo = ((document.getElementById('sr-eot-tipo') || {}).value || '');
    var sel  = document.getElementById('sr-eot-subtipo');
    if (!sel) return;
    var opts = SR_SUBTIPOS[tipo] || [];
    sel.innerHTML = '<option value="">— Seleccionar —</option>' + opts.map(function(s) {
        return '<option value="' + s + '">' + s + '</option>';
    }).join('');
    sel.disabled = !opts.length;
};

window.srGuardarEdicionOT = function() {
    var idOt       = ((document.getElementById('sr-eot-id')         || {}).value || '').trim();
    var tipo       = ((document.getElementById('sr-eot-tipo')       || {}).value || '').trim();
    var subtipo    = ((document.getElementById('sr-eot-subtipo')    || {}).value || '').trim();
    var supervisor = ((document.getElementById('sr-eot-supervisor') || {}).value || '').trim();
    var situacion  = ((document.getElementById('sr-eot-situacion')  || {}).value || '').trim();
    var motivo     = ((document.getElementById('sr-eot-motivo')     || {}).value || '').trim();

    if (!idOt) return;

    fetch('/api/ordenes-trabajo/' + encodeURIComponent(idOt), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            accion:            'editar',
            tipo_ot:           tipo,
            sub_tipo:          subtipo,
            supervisor:        supervisor,
            situacion_inicial: situacion,
            motivo:            motivo
        })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function() {
        window.srCerrarSubDrawer('sr-drawer-editar-ot');
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('OT actualizada correctamente', 'success');
        fetch('/api/ordenes-trabajo')
            .then(function(r) { return r.ok ? r.json() : []; })
            .then(function(data) {
                window.srOtData = Array.isArray(data) ? data : [];
                srRenderTabla();
                window.srAbrirDetalleOT(idOt);
            }).catch(function() {});
    })
    .catch(function(err) {
        console.error('Error editando OT:', err);
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Error al guardar los cambios', 'danger');
    });
};

function srLimpiarFormRegistro() {
    ['sr-f-idx','sr-f-km','sr-f-fecha-ing','sr-f-hora-ing',
     'sr-f-fecha-sal','sr-f-hora-sal','sr-f-obs','sr-f-obs-extra','sr-f-rampa-id'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
    });
    if (typeof window._cbReset === 'function') window._cbReset('sr-f-placa');
    var sSit = document.getElementById('sr-f-situacion');
    if (sSit) sSit.value = sSit.options[0] ? sSit.options[0].value : '';
    var sR = document.getElementById('sr-f-rampa');
    if (sR) { sR.value = ''; sR.disabled = false; }
    window.srResetTrabajosFormulario();
}

window.srEliminarRegistroGeneral = function(idRampa) {
    srConfirmModerno(
        '¿Eliminar registro de rampa?',
        '¡ATENCIÓN! Esto también eliminará permanentemente TODAS las Órdenes de Trabajo vinculadas a este registro, junto con sus trabajos, repuestos e inspecciones. <b>Esta acción no se puede deshacer.</b>',
        function() {
            fetch('/api/taller-rampas/' + idRampa, { method: 'DELETE' })
            .then(function(r){ return r.json(); })
            .then(function(data) {
                if (data.error) throw new Error(data.error);
                if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Registro y OTs vinculadas eliminados', 'success');
                srCerrarDrawers();
                srCargarEntradas();
                srCargarHistorial();
            }).catch(function(err) {
                if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta(err.message || 'Error al eliminar', 'danger');
                console.error(err);
            });
        }
    );
};

window.srConfirmModerno = function(titulo, mensaje, onConfirm, btnText, btnClass) {
    btnText = btnText || 'Sí, eliminar';
    btnClass = btnClass || 'btn-danger';
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);opacity:0;transition:opacity 0.2s ease;';

    var box = document.createElement('div');
    box.className = 'rot-confirm-box';
    box.style.cssText = 'background:#fff;border-radius:12px;padding:20px;width:90%;max-width:380px;box-shadow:0 10px 25px rgba(0,0,0,0.2);transform:scale(0.95);transition:transform 0.2s ease;';

    box.innerHTML = 
        '<div style="display:flex;align-items:center;margin-bottom:12px;">' +
        '<i class="bi bi-exclamation-triangle-fill text-danger" style="font-size:1.5rem;margin-right:12px;"></i>' +
        '<h6 style="margin:0;font-weight:700;font-size:1.05rem;color:#1e293b;">' + titulo + '</h6>' +
        '</div>' +
        '<p style="margin:0 0 20px 0;font-size:0.9rem;color:#475569;line-height:1.4;">' + mensaje + '</p>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;">' +
        '<button class="btn btn-sm btn-light" id="btn-cancel" style="border:1px solid #cbd5e1;color:#475569;font-weight:600;padding:6px 12px;border-radius:6px;">Cancelar</button>' +
        '<button class="btn btn-sm ' + btnClass + '" id="btn-ok" style="font-weight:600;padding:6px 12px;border-radius:6px;">' + btnText + '</button>' +
        '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    requestAnimationFrame(function(){
        overlay.style.opacity = '1';
        box.style.transform = 'scale(1)';
    });

    var cancel = box.querySelector('#btn-cancel');
    var ok = box.querySelector('#btn-ok');

    function cerrar() {
        overlay.style.opacity = '0';
        box.style.transform = 'scale(0.95)';
        setTimeout(function(){ if(overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
    }

    cancel.addEventListener('click', cerrar);
    overlay.addEventListener('click', function(e) { if(e.target === overlay) cerrar(); });

    ok.addEventListener('click', function() {
        cerrar();
        onConfirm();
    });
}

// Navegaci�n Swipe para Panel Detalle
window.srNavegarDetalle = function(direccion) {
    var trActiva = document.querySelector('#sr-tbody tr.sr-activa');
    if (!trActiva) return;
    
    var trDestino = direccion === 'next' ? trActiva.nextElementSibling : trActiva.previousElementSibling;
    while (trDestino && (!trDestino.getAttribute('data-id') || trDestino.style.display === 'none')) {
        trDestino = direccion === 'next' ? trDestino.nextElementSibling : trDestino.previousElementSibling;
    }
    if (!trDestino) return; // No hay m�s
    
    var idDestino = parseInt(trDestino.getAttribute('data-id'), 10);
    if (!isNaN(idDestino)) {
        var scroll = document.getElementById('sr-detalle-scroll');
        if (scroll) {
            scroll.style.transition = 'transform 0.15s ease-in, opacity 0.15s ease-in';
            scroll.style.transform = direccion === 'next' ? 'translateX(-30px)' : 'translateX(30px)';
            scroll.style.opacity = '0';
            setTimeout(function() {
                window.srAbrirDetalle(idDestino);
                scroll.style.transition = 'none';
                scroll.style.transform = direccion === 'next' ? 'translateX(30px)' : 'translateX(-30px)';
                scroll.style.opacity = '0';
                
                void scroll.offsetWidth; // Reflow
                
                scroll.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
                scroll.style.transform = 'translateX(0)';
                scroll.style.opacity = '1';
            }, 150);
        } else {
            window.srAbrirDetalle(idDestino);
        }
    }
};

(function() {
    var touchStartX = 0;
    var touchEndX = 0;
    var touchStartY = 0;
    var touchEndY = 0;

    document.addEventListener('touchstart', function(e) {
        var panel = document.getElementById('sr-panel-detalle');
        if (panel && panel.classList.contains('open') && panel.contains(e.target)) {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }
    }, {passive: true});

    document.addEventListener('touchend', function(e) {
        var panel = document.getElementById('sr-panel-detalle');
        if (panel && panel.classList.contains('open') && panel.contains(e.target)) {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            
            var diffX = touchStartX - touchEndX;
            var diffY = touchStartY - touchEndY;
            
            // Solo activar si el deslizamiento es m�s horizontal que vertical y supera los 60px
            if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY)) {
                if (diffX > 0) {
                    window.srNavegarDetalle('next');
                } else {
                    window.srNavegarDetalle('prev');
                }
            }
        }
    }, {passive: true});
})();

// ── GESTIÓN DE FILAS DE TRABAJOS DINÁMICOS EN FORMULARIO ────────────────
window.srAgregarFilaTrabajo = function(valor) {
    var container = document.getElementById('sr-f-trabajos-container');
    if (!container) return;
    var idx = container.children.length + 1;
    var row = document.createElement('div');
    row.className = 'd-flex align-items-center gap-2 sr-f-trabajo-row';
    row.innerHTML = 
        '<div class="d-flex align-items-center justify-content-center fw-bold text-muted" style="width:24px; font-size:0.75rem; flex-shrink:0;">' + idx + '.</div>' +
        '<input type="text" class="form-control form-control-sm sr-f-trabajo-item" placeholder="Descripción del trabajo..." value="' + _srEsc(valor || '') + '" style="border-radius:8px; background:var(--bg); border-color:var(--border); color:var(--text); font-size:0.8rem;">' +
        '<button type="button" class="btn btn-sm btn-outline-danger border-0 p-1 d-flex align-items-center justify-content-center" style="width:28px; height:28px; border-radius:6px;" onclick="window.srEliminarFilaTrabajo(this)" title="Eliminar fila">' +
        '  <i class="bi bi-x-lg" style="font-size:0.75rem;"></i>' +
        '</button>';
    container.appendChild(row);
    window.srReindexarFilasTrabajos();
};

window.srEliminarFilaTrabajo = function(btn) {
    var row = btn.closest('.sr-f-trabajo-row');
    if (row) {
        row.remove();
        window.srReindexarFilasTrabajos();
    }
};

window.srReindexarFilasTrabajos = function() {
    var container = document.getElementById('sr-f-trabajos-container');
    if (!container) return;
    var rows = container.querySelectorAll('.sr-f-trabajo-row');
    rows.forEach(function(r, idx) {
        var numEl = r.querySelector('div');
        if (numEl) numEl.textContent = (idx + 1) + '.';
    });
    if (rows.length === 0) {
        window.srAgregarFilaTrabajo();
    }
};

window.srResetTrabajosFormulario = function() {
    var container = document.getElementById('sr-f-trabajos-container');
    if (container) container.innerHTML = '';
    var extraEl = document.getElementById('sr-f-obs-extra');
    if (extraEl) extraEl.value = '';
    window.srAgregarFilaTrabajo();
};

window.srParsearTareasArray = function(texto) {
    if (!texto || !String(texto).trim()) return { tareas: [], notas: [] };
    var raw = String(texto)
        .replace(/^\[Reporte\s+[^\]]+\]\s*(OT\s+OT-[^:]+:\s*)?/gim, '')
        .replace(/^OT\s+OT-[^:]+:\s*/gim, '')
        .trim();
    var lines = raw.split('\n');
    var tareas = [];
    var notas = [];
    lines.forEach(function(l) {
        var trimmed = l.trim();
        if (!trimmed) return;
        if (trimmed.toLowerCase().startsWith('nota:') || trimmed.toLowerCase().startsWith('obs:')) {
            var nVal = trimmed.replace(/^(nota|obs):\s*/i, '').trim();
            if (nVal) notas.push(nVal);
        } else {
            var tVal = trimmed.replace(/^[-*•]\s*/, '').replace(/^\d+[\.\)]\s*/, '').trim();
            if (tVal) tareas.push(tVal);
        }
    });
    return { tareas: tareas, notas: notas };
};

window.srFormatearTareas = function(texto) {
    var p = window.srParsearTareasArray(texto);
    if (!p.tareas.length && !p.notas.length) return '';
    var res = [];
    p.tareas.forEach(function(t, idx) {
        res.push((idx + 1) + '. ' + t);
    });
    p.notas.forEach(function(n) {
        res.push('Nota: ' + n);
    });
    return res.join('\n');
};

window.srCargarFilasTrabajos = function(textoObs) {
    var container = document.getElementById('sr-f-trabajos-container');
    if (!container) return;
    container.innerHTML = '';
    var extraEl = document.getElementById('sr-f-obs-extra');
    if (extraEl) extraEl.value = '';

    var parsed = window.srParsearTareasArray(textoObs);
    if (parsed.tareas.length > 0) {
        parsed.tareas.forEach(function(t) {
            window.srAgregarFilaTrabajo(t);
        });
    } else {
        window.srAgregarFilaTrabajo();
    }

    if (extraEl && parsed.notas.length > 0) {
        extraEl.value = parsed.notas.join('\n');
    }
};

window.srObtenerTextoObsFormulario = function() {
    var container = document.getElementById('sr-f-trabajos-container');
    var extraEl = document.getElementById('sr-f-obs-extra');
    var tareas = [];
    if (container) {
        var inputs = container.querySelectorAll('.sr-f-trabajo-item');
        var count = 0;
        inputs.forEach(function(inp) {
            var val = (inp.value || '').trim();
            if (val) {
                count++;
                val = val.replace(/^[-*•]\s*/, '').replace(/^\d+[\.\)]\s*/, '').trim();
                tareas.push(count + '. ' + val);
            }
        });
    }
    var extra = extraEl ? (extraEl.value || '').trim() : '';
    if (extra) {
        tareas.push('Nota: ' + extra);
    }
    return tareas.join('\n');
};

// ── DESCARGAR PLANTILLA: ORDEN EN PARABRISAS (FORMATO CONTROL TALLER) ──
window.srDescargarPlantillaParabrisas = function(id) {
    if (typeof window.rotToast === 'function') window.rotToast('Generando Orden en Parabrisas...', 'bg-info');
    else if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('Generando Orden en Parabrisas...', 'info');

    var e = (window.srEntradas || []).find(function(x) { return x._id === id || String(x.id) === String(id) || String(x._id) === String(id); });
    if (!e && window.srData) {
        e = window.srData.find(function(x) { return x._id === id || String(x.id) === String(id) || String(x._id) === String(id); });
    }
    if (!e) {
        alert('No se encontraron los datos del registro.');
        return;
    }

    // Buscar todas las OTs vinculadas
    var otsPlaca = (window.srOtData || []).filter(function(o) {
        if (o.id_rampa) return String(o.id_rampa) === String(e._id || e.id);
        return (o.placa || '').toUpperCase() === (e.placa || '').toUpperCase();
    });
    var linkedOt = otsPlaca && otsPlaca.length > 0 ? otsPlaca[0] : null;
    var otCodigos = otsPlaca.map(function(o) {
        var rawId = o.id_ot || o.ticket_entrada || '';
        return rawId ? window.srFormatID(rawId) : '';
    }).filter(Boolean);
    if (!otCodigos.length && (e.ticket_entrada || e.id_ot)) {
        otCodigos.push(window.srFormatID(e.ticket_entrada || e.id_ot));
    }
    otCodigos = Array.from(new Set(otCodigos));
    var otCodigoStr = otCodigos.length ? otCodigos.join('  ·  ') : 'SIN OT';

    // Formatear Fecha y Hora
    var dtStr = '____/____/______';
    if (e.fechaIngreso) {
        var parts = e.fechaIngreso.split('T')[0].split('-');
        if (parts.length === 3) dtStr = parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    var horaStr = e.horaIngreso ? e.horaIngreso : '____:____';
    var kmStr = e.km ? Number(e.km).toLocaleString('es-PE') + ' KM' : '________________';

    // Buscar conductor / chofer exclusivamente desde el reporte o datos de conductor (dejar vacío si no existe)
    var chofer = (e.conductor || e.chofer || e.reportado_por || '').trim();
    if (!chofer && otsPlaca.length > 0) {
        for (var k = 0; k < otsPlaca.length; k++) {
            var otItem = otsPlaca[k];
            var dObj = otItem.detalles_json ? (typeof otItem.detalles_json === 'string' ? JSON.parse(otItem.detalles_json) : otItem.detalles_json) : {};
            var cFound = (dObj.conductor || dObj.chofer || dObj.reportado_por || otItem.conductor || otItem.chofer || otItem.reportado_por || '').trim();
            if (cFound) { chofer = cFound; break; }
        }
    }
    if (!chofer && window.dataGlobalPlacas) {
        var pMatch = window.dataGlobalPlacas.find(function(p) {
            var pl = Array.isArray(p) ? (p[0]||'') : (p.placa||'');
            return pl.toUpperCase() === (e.placa||'').toUpperCase();
        });
        if (pMatch) {
            var cond = Array.isArray(pMatch) ? (pMatch[3] || '') : (pMatch.conductor || pMatch.chofer || '');
            if (cond) chofer = cond.trim();
        }
    }

    // Desglosar trabajos
    var obsTexto = (e.obs || '').trim();
    if (linkedOt && !obsTexto) {
        var det = linkedOt.detalles_json ? (typeof linkedOt.detalles_json === 'string' ? JSON.parse(linkedOt.detalles_json) : linkedOt.detalles_json) : {};
        obsTexto = (det.motivo || linkedOt.observaciones || '').trim();
    }
    var parsedP = typeof window.srParsearTareasArray === 'function' 
        ? window.srParsearTareasArray(obsTexto)
        : { tareas: obsTexto ? [obsTexto] : [], notas: [] };
    var tareasArr = parsedP.tareas;
    var notasArr = parsedP.notas;

    var empLogoUrl = localStorage.getItem('fleet_empresa_logo') || window._LOGO_BASE64 || 'https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500';
    var empNombre = localStorage.getItem('fleet_empresa_nombre') || window._EMPRESA_NOMBRE || 'AZKELL FLEET';
    var plannerNombre = localStorage.getItem('fleet_user') || localStorage.getItem('fleet_nombre_usuario') || window.usuarioActual || 'Planner de Mantenimiento';

    // Generar filas de trabajos (mínimo 5 filas)
    var numRows = Math.max(5, tareasArr.length);
    var trabajosRowsHtml = '';
    for (var i = 0; i < numRows; i++) {
        var num = i + 1;
        var tareaDesc = tareasArr[i] || '';
        trabajosRowsHtml += 
            '<tr>' +
            '  <td class="col-num">' + num + '</td>' +
            '  <td class="col-desc">' +
            '    <div class="job-line">' +
            '      <span class="job-text">' + _srEsc(tareaDesc) + '</span>' +
            '      <span class="dotted-fill"></span>' +
            '    </div>' +
            '  </td>' +
            '  <td class="col-chk">' +
            '    <div class="chk-box"></div>' +
            '  </td>' +
            '</tr>';
    }

    var notasTexto = notasArr.length > 0 ? notasArr.join(' · ') : '';

    var html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Orden en Parabrisas - ${_srEsc(e.placa || 'Unidad')}</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&family=Oswald:wght@600;700;800&display=swap" rel="stylesheet">
    <style>
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        body {
            margin: 0;
            padding: 20px;
            background-color: #f1f5f9;
            font-family: 'Montserrat', sans-serif;
            color: #000;
            display: flex;
            justify-content: center;
        }
        .sheet-container {
            width: 210mm;
            min-height: 295mm;
            padding: 12mm 14mm;
            background: #fff;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            border: 2.5px solid #000;
        }
        
        /* Franja Industrial de Advertencia */
        .stripe-bar {
            height: 14px;
            background: repeating-linear-gradient(
                -45deg,
                #facc15,
                #facc15 12px,
                #000000 12px,
                #000000 24px
            );
            border: 1px solid #000;
            width: 100%;
        }

        /* Encabezado */
        .header-section {
            margin-top: 10px;
            margin-bottom: 12px;
        }
        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }
        .company-badge {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .company-logo {
            max-height: 38px;
            max-width: 140px;
            object-fit: contain;
        }
        .company-name {
            font-size: 13px;
            font-weight: 800;
            color: #1e293b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .sub-header-left {
            font-size: 11px;
            font-weight: 800;
            color: #64748b;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin-top: 4px;
        }
        .sub-header-right {
            text-align: right;
        }
        .doc-title-right {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: #000;
            margin-bottom: 2px;
        }
        .doc-code-right {
            font-size: 14px;
            font-weight: 900;
            color: #000;
            letter-spacing: 0.5px;
        }
        .main-title {
            font-family: 'Oswald', sans-serif;
            font-size: 26px;
            font-weight: 800;
            letter-spacing: 0.5px;
            margin-top: 4px;
            margin-bottom: 0;
            text-transform: uppercase;
            color: #000;
        }

        /* Cuadrícula de Datos de Unidad */
        .grid-data-top {
            display: grid;
            grid-template-columns: 2fr 2fr 1fr 1fr;
            border: 2px solid #000;
            margin-bottom: 6px;
        }
        .grid-cell {
            padding: 6px 10px;
            border-right: 2px solid #000;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 52px;
        }
        .grid-cell:last-child {
            border-right: none;
        }
        .cell-label {
            font-size: 9px;
            font-weight: 800;
            color: #000;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 2px;
        }
        .cell-value-line {
            display: flex;
            align-items: flex-end;
            min-height: 20px;
            border-bottom: 1.5px dotted #000;
            font-weight: 800;
            font-size: 14px;
            color: #000;
            padding-bottom: 1px;
        }

        /* Conductor / Chofer */
        .driver-box {
            border: 2px solid #000;
            padding: 6px 10px;
            margin-bottom: 6px;
            display: flex;
            flex-direction: column;
        }
        .driver-line {
            display: flex;
            align-items: flex-end;
            min-height: 20px;
            border-bottom: 1.5px dotted #000;
            font-weight: 700;
            font-size: 12px;
            color: #000;
            padding-bottom: 1px;
        }

        /* Tipo de Servicio Checkboxes */
        .service-type-bar {
            border: 2px solid #000;
            padding: 6px 10px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 9.5px;
            font-weight: 800;
            text-transform: uppercase;
        }
        .chk-item {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .chk-square {
            width: 13px;
            height: 13px;
            border: 1.5px solid #000;
            display: inline-block;
            background: #fff;
        }

        /* Tabla de Trabajos */
        .section-label {
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
            color: #000;
        }
        .jobs-table {
            width: 100%;
            border-collapse: collapse;
            border: 2.5px solid #000;
            margin-bottom: 12px;
        }
        .jobs-table th {
            border: 2px solid #000;
            padding: 5px 8px;
            font-size: 10px;
            font-weight: 900;
            text-transform: uppercase;
            background: #f8fafc;
            color: #000;
        }
        .jobs-table td {
            border: 1.5px solid #000;
            padding: 8px 10px;
            vertical-align: middle;
        }
        .col-num {
            width: 32px;
            text-align: center;
            font-weight: 900;
            font-size: 13px;
        }
        .col-desc {
            padding: 6px 10px !important;
        }
        .col-chk {
            width: 50px;
            text-align: center;
        }
        .chk-box {
            width: 24px;
            height: 24px;
            border: 2px solid #000;
            margin: 0 auto;
            background: #fff;
        }
        .job-line {
            display: flex;
            align-items: flex-end;
            position: relative;
            min-height: 22px;
            border-bottom: 1.5px dotted #000;
        }
        .job-text {
            font-weight: 700;
            font-size: 12px;
            color: #000;
            padding-right: 6px;
            background: #fff;
            position: relative;
            z-index: 2;
        }

        /* Observaciones / Aviso Clave */
        .obs-container {
            border: 2px solid #000;
            padding: 8px 10px;
            min-height: 75px;
            margin-bottom: 14px;
            position: relative;
        }
        .obs-line-guide {
            border-bottom: 1.5px dotted #000;
            height: 22px;
            width: 100%;
        }
        .obs-content-text {
            font-size: 11px;
            font-weight: 700;
            color: #000;
            line-height: 22px;
        }

        /* Firmas */
        .signatures-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin-top: 10px;
            margin-bottom: 12px;
            padding: 0 15px;
        }
        .sign-col {
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .sign-user-name {
            font-size: 11px;
            font-weight: 800;
            color: #000;
            text-transform: uppercase;
            min-height: 22px;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            margin-bottom: 3px;
            letter-spacing: 0.3px;
        }
        .sign-divider {
            width: 100%;
            border-top: 2px solid #000;
            margin-bottom: 4px;
        }
        .sign-main-name {
            font-size: 9.5px;
            font-weight: 800;
            text-transform: uppercase;
            color: #000;
            margin-bottom: 1px;
        }
        .sign-sub-label {
            font-size: 8.5px;
            font-weight: 600;
            color: #334155;
            font-style: italic;
        }

        /* Footer Note */
        .footer-note {
            text-align: center;
            font-size: 8.5px;
            font-weight: 800;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            color: #000;
            margin-top: 4px;
        }

        /* Print Controls */
        #btnPrintFloating {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #2563eb;
            color: #fff;
            border: none;
            border-radius: 50px;
            padding: 12px 24px;
            font-weight: bold;
            font-size: 14px;
            box-shadow: 0 4px 15px rgba(37,99,235,0.4);
            cursor: pointer;
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        @media print {
            @page {
                size: A4 portrait;
                margin: 0;
            }
            body {
                background: none;
                padding: 0;
                margin: 0;
            }
            #btnPrintFloating {
                display: none;
            }
            .sheet-container {
                width: 210mm;
                height: 297mm;
                min-height: 297mm;
                padding: 10mm 12mm;
                box-shadow: none;
                border: 2px solid #000;
                margin: 0;
            }
        }
    </style>
</head>
<body>
    <button id="btnPrintFloating" onclick="window.print()">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/><path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2H5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4V3zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2H5zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1z"/></svg>
        Imprimir Ficha A4
    </button>

    <div class="sheet-container">
        <div>
            <!-- Franja Superior de Advertencia -->
            <div class="stripe-bar"></div>

            <!-- Encabezado -->
            <div class="header-section">
                <div class="header-top">
                    <div>
                        <div class="company-badge">
                            <img src="${empLogoUrl}" alt="Logo" class="company-logo">
                            <span class="company-name">${_srEsc(empNombre)}</span>
                        </div>
                        <div class="sub-header-left">ORDEN EN PARABRISAS</div>
                    </div>
                    <div class="sub-header-right">
                        <div class="doc-title-right">FORMATO DE CONTROL DE TALLER</div>
                        <div class="doc-code-right">OT: ${_srEsc(otCodigoStr)}</div>
                    </div>
                </div>
                <h1 class="main-title">TRABAJOS A REALIZAR</h1>
            </div>

            <!-- Grid de Datos Principales -->
            <div class="grid-data-top">
                <div class="grid-cell">
                    <span class="cell-label">PLACA UNIDAD</span>
                    <span class="cell-value-line" style="font-size:16px;">${_srEsc(e.placa || '')}</span>
                </div>
                <div class="grid-cell">
                    <span class="cell-label">KILOMETRAJE ACTUAL</span>
                    <span class="cell-value-line">${_srEsc(kmStr)}</span>
                </div>
                <div class="grid-cell">
                    <span class="cell-label">FECHA</span>
                    <span class="cell-value-line">${_srEsc(dtStr)}</span>
                </div>
                <div class="grid-cell">
                    <span class="cell-label">HORA</span>
                    <span class="cell-value-line">${_srEsc(horaStr)}</span>
                </div>
            </div>

            <!-- Chofer / Reportado Por -->
            <div class="driver-box">
                <span class="cell-label">CHOFER / REPORTADO POR:</span>
                <span class="driver-line">${_srEsc(chofer)}</span>
            </div>

            <!-- Checkboxes de Tipo de Servicio -->
            <div class="service-type-bar">
                <div class="chk-item">
                    <span class="chk-square"></span> PREVENTIVO / INSPECCIÓN:
                    &nbsp; <span class="chk-square"></span> Mec.
                    &nbsp; <span class="chk-square"></span> Eléc.
                    &nbsp; <span class="chk-square"></span> Carro.
                    &nbsp; <span class="chk-square"></span> Neum.
                </div>
                <div class="chk-item">
                    <span class="chk-square"></span> CORRECTIVO / FALLA
                </div>
                <div class="chk-item">
                    <span class="chk-square"></span> AUXILIO MECÁNICO
                </div>
            </div>

            <!-- Tabla de Trabajos Asignados -->
            <div class="section-label">TRABAJOS ASIGNADOS A REALIZAR:</div>
            <table class="jobs-table">
                <thead>
                    <tr>
                        <th style="width:34px; text-align:center;">N°</th>
                        <th>DESCRIPCIÓN DEL TRABAJO TÉCNICO</th>
                        <th style="width:50px; text-align:center;">✓ / X</th>
                    </tr>
                </thead>
                <tbody>
                    ${trabajosRowsHtml}
                </tbody>
            </table>

            <!-- Observaciones y Mantenimientos Pendientes -->
            <div class="section-label">OBSERVACIONES Y MANTENIMIENTOS PENDIENTES (AVISO CLAVE):</div>
            <div class="obs-container">
                ${notasTexto ? '<div class="obs-content-text">' + _srEsc(notasTexto) + '</div>' : ''}
                <div class="obs-line-guide"></div>
                <div class="obs-line-guide"></div>
                <div class="obs-line-guide"></div>
            </div>
        </div>

        <!-- Parte Inferior: Firmas y Advertencia -->
        <div>
            <div class="signatures-grid">
                <div class="sign-col">
                    <div class="sign-user-name">${_srEsc(plannerNombre)}</div>
                    <div class="sign-divider"></div>
                    <div class="sign-main-name">FIRMA / NOMBRE DEL PLANNER</div>
                    <div class="sign-sub-label">Autoriza ingreso y trabajos</div>
                </div>
                <div class="sign-col">
                    <div class="sign-user-name" style="visibility:hidden;">TÉCNICO</div>
                    <div class="sign-divider"></div>
                    <div class="sign-main-name">FIRMA DEL TÉCNICO ASIGNADO</div>
                    <div class="sign-sub-label">Conformidad de finalización</div>
                </div>
            </div>

            <!-- Franja Inferior de Advertencia -->
            <div class="stripe-bar"></div>
            <div class="footer-note">MANTENER ESTA FICHA VISIBLE EN EL PARABRISAS HASTA LA ENTREGA FORMAL DE LA UNIDAD.</div>
        </div>
    </div>
</body>
</html>`;

    var win = window.open('', '_blank');
    if (!win) {
        alert('Por favor, permite ventanas emergentes para imprimir la orden.');
        return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.onload = function() {
        setTimeout(function() {
            win.print();
        }, 400);
    };
};

