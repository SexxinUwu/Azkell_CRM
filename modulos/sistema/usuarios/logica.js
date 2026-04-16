// ================================================================
// MÓDULO: GESTIÓN DE USUARIOS v2 — Discord-style
// ================================================================
window.dataGlobalRoles    = window.dataGlobalRoles    || [];
window.dataGlobalUsuarios = window.dataGlobalUsuarios || [];
window._guTabActiva       = window._guTabActiva       || 'roles';
window._guSeleccionado    = window._guSeleccionado    || null;
window._guEsNuevo         = window._guEsNuevo         || false;

// ── Módulos de permisos ──────────────────────────────────────────
window._GU_MODULOS = window._GU_MODULOS || [
    // MANTENIMIENTO
    { grupo:'MANTENIMIENTO', key:'insp',          nombre:'Inspecciones',     desc:'Registro y análisis de inspecciones',    lcad:true  },
    { grupo:'MANTENIMIENTO', key:'fleet',         nombre:'Fleetrun',         desc:'Datos operativos de la flota',           lcad:true  },
    { grupo:'MANTENIMIENTO', key:'plan',          nombre:'Planificación',    desc:'MPs planificadas vs ejecutadas',          lcad:true  },
    // ALMACÉN
    { grupo:'ALMACÉN',       key:'placas',        nombre:'Placas',           desc:'Fichas técnicas de vehículos',           lcad:true  },
    { grupo:'ALMACÉN',       key:'inv',           nombre:'Inventario',       desc:'Catálogo de artículos y stock',          lcad:true  },
    { grupo:'ALMACÉN',       key:'ent_inv',       nombre:'Entradas',         desc:'Registro de ingresos al almacén',        lcad:true  },
    { grupo:'ALMACÉN',       key:'sal_inv',       nombre:'Salidas',          desc:'Registro de egresos del almacén',        lcad:true  },
    { grupo:'ALMACÉN',       key:'prov_inv',      nombre:'Proveedores',      desc:'Directorio de proveedores',              lcad:true  },
    { grupo:'ALMACÉN',       key:'kardex',        nombre:'Kardex',           desc:'Historial de movimientos por artículo',  lcad:false },
    { grupo:'ALMACÉN',       key:'costos_inv',    nombre:'Costos',           desc:'Análisis de costos e índices',           lcad:false },
    { grupo:'ALMACÉN',       key:'cfg_almacen',   nombre:'Config. Almacén',  desc:'Familias, Unidades, Sistemas y Marcas',  lcad:true  },
    // FLOTA
    { grupo:'FLOTA',         key:'status',        nombre:'Status Flota',     desc:'Estado y agrupación de unidades',        lcad:true  },
    { grupo:'FLOTA',         key:'cond',          nombre:'Personal',         desc:'Directorio de personal operativo',       lcad:true  },
    { grupo:'FLOTA',         key:'gps',           nombre:'GPS / Ubicación',  desc:'Visualización en tiempo real',           lcad:false },
    // SISTEMA
    { grupo:'SISTEMA',       key:'seg',           nombre:'Gestión Usuarios', desc:'Administración de accesos',              lcad:true  },
    { grupo:'SISTEMA',       key:'mod_auditoria', nombre:'Auditoría',        desc:'Bitácora de actividad del sistema',      lcad:true  },
];

window._GU_COLORS = window._GU_COLORS || [
    '#5865F2','#57F287','#1ABC9C','#3498DB','#E67E22',
    '#9B59B6','#ED4245','#EB459E','#F1C40F','#95A5A6'
];

// Helpers ─────────────────────────────────────────────────────
function _guColorFrom(str) {
    var h = 0;
    for (var i = 0; i < (str||'').length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xFFFFFF;
    return window._GU_COLORS[Math.abs(h) % window._GU_COLORS.length];
}
function _guInitials(str) {
    var parts = (str || 'S').split(/[@.\s]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0] || 'S').slice(0, 2).toUpperCase();
}
function _guEsc(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _guShowInPanel(contentHtml, actionsHtml, title) {
    if (window.innerWidth < 768) {
        var ob = document.getElementById('offcanvasGU');
        var oc = document.getElementById('guOffcanvasContent');
        var oa = document.getElementById('guOffcanvasActions');
        var ot = document.getElementById('offcanvasGUTitle');
        if (ot) ot.textContent = title || 'Detalle';
        if (oc) oc.innerHTML = contentHtml;
        if (oa) { oa.innerHTML = actionsHtml; oa.style.display = actionsHtml ? '' : 'none'; }
        if (ob && window.bootstrap) { bootstrap.Offcanvas.getOrCreateInstance(ob).show(); }
    } else {
        var pe = document.getElementById('guPanelEmpty');
        var pc = document.getElementById('guPanelContent');
        var pa = document.getElementById('guPanelActions');
        if (pe) pe.style.display = 'none';
        if (pc) { pc.style.display = ''; pc.innerHTML = contentHtml; }
        if (pa) { pa.style.display = actionsHtml ? '' : 'none'; pa.innerHTML = actionsHtml; }
    }
}

// ── Carga de datos ────────────────────────────────────────────
window.guCargarTodo = async function(forzar) {
    var list = document.getElementById('guList');
    if (!list) return;
    list.innerHTML = '<div class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Cargando...</div>';
    try {
        var resRoles = await fetch('/api/roles');
        var resUsers = await fetch('/api/script/obtenerDatosUsuarios', {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({})
        });
        if (!resRoles.ok) throw new Error('Roles HTTP ' + resRoles.status);
        if (!resUsers.ok) throw new Error('Usuarios HTTP ' + resUsers.status);
        var jRoles = await resRoles.json();
        var jUsers = await resUsers.json();
        window.dataGlobalRoles = jRoles.data || [];
        var rawUsers = jUsers.data || [];
        // fila: [0]id [1]nombre [2]cargo [3]correo [4]rol_label [5]estado [6]password_visible [7]permisos [8]rol_id [9]rol_color [10]ultimo_acceso [11]ultimo_ip [12]ultimo_dispositivo
        window.dataGlobalUsuarios = rawUsers.map(function(r) {
            return { id:r[0], nombre:r[1], cargo:r[2], correo:r[3], rol_label:r[4],
                     estado:r[5], password:r[6], permisos:r[7], rol_id:r[8], rol_color:r[9],
                     ultimo_acceso:r[10], ultimo_ip:r[11], ultimo_dispositivo:r[12] };
        });
        var sub = document.getElementById('gu-subtitle');
        if (sub) sub.textContent = window.dataGlobalRoles.length + ' roles · ' + window.dataGlobalUsuarios.length + ' miembros';
        var cr = document.getElementById('gu-count-roles');
        var cm = document.getElementById('gu-count-miembros');
        if (cr) cr.textContent = '(' + window.dataGlobalRoles.length + ')';
        if (cm) cm.textContent = '(' + window.dataGlobalUsuarios.length + ')';
        window.guRenderLista();
    } catch(e) {
        if (list) list.innerHTML = '<div class="text-center py-5 text-danger"><i class="bi bi-exclamation-triangle fs-3 d-block mb-2"></i>' + e.message + '</div>';
    }
};

window.guSetTab = function(tab) {
    window._guTabActiva = tab;
    window._guSeleccionado = null;
    var tr = document.getElementById('gu-tab-roles');
    var tm = document.getElementById('gu-tab-miembros');
    if (tr) tr.classList.toggle('active', tab === 'roles');
    if (tm) tm.classList.toggle('active', tab === 'miembros');
    window.guRenderLista();
    var pc = document.getElementById('guPanelContent');
    var pa = document.getElementById('guPanelActions');
    var pe = document.getElementById('guPanelEmpty');
    if (pc) { pc.style.display = 'none'; pc.innerHTML = ''; }
    if (pa) { pa.style.display = 'none'; pa.innerHTML = ''; }
    if (pe) pe.style.display = '';
};

function _guRelTime(dt) {
    if (!dt) return 'Nunca';
    var d = new Date(dt);
    if (isNaN(d.getTime())) return 'Nunca';
    var diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60)       return 'Hace un momento';
    if (diff < 3600)     return 'Hace ' + Math.floor(diff/60) + ' min';
    if (diff < 86400)    return 'Hace ' + Math.floor(diff/3600) + ' h';
    if (diff < 2592000)  return 'Hace ' + Math.floor(diff/86400) + ' días';
    return d.toLocaleDateString('es-PE', {day:'2-digit', month:'short', year:'numeric'});
}

function _guRenderUserItem(u) {
    var color = u.rol_color || _guColorFrom(u.nombre||u.correo||'U');
    var isSel = window._guSeleccionado && window._guSeleccionado.tipo === 'usuario' && window._guSeleccionado.id === u.id;
    return '<div class="gu-list-item' + (isSel?' selected':'') + '" onclick="window.guSeleccionarUsuario(\'' + u.id + '\')">'
        + '<div class="gu-role-dot" style="background:' + color + ';font-size:.65rem;">' + _guInitials(u.nombre||u.correo) + '</div>'
        + '<div class="gu-list-info"><div class="gu-list-name">' + _guEsc(u.nombre||u.correo) + '</div>'
        + '<div class="gu-list-sub">' + _guEsc(u.cargo||u.correo||'') + (u.ultimo_acceso ? ' · ' + _guRelTime(u.ultimo_acceso) : '') + '</div></div>'
        + '<i class="bi bi-chevron-right gu-list-chevron"></i></div>';
}

// ── Render Lista ──────────────────────────────────────────────
window.guRenderLista = function() {
    var list = document.getElementById('guList');
    if (!list) return;
    var html = '';
    if (window._guTabActiva === 'roles') {
        if (!window.dataGlobalRoles.length) {
            html = '<div class="text-center py-4 text-muted" style="font-size:.8rem;padding:20px;">No hay roles. Crea el primero.</div>';
        } else {
            window.dataGlobalRoles.forEach(function(r) {
                var isSel = window._guSeleccionado && window._guSeleccionado.tipo === 'rol' && window._guSeleccionado.id == r.id;
                var cnt = r.miembros || 0;
                html += '<div class="gu-list-item' + (isSel ? ' selected' : '') + '" onclick="window.guSeleccionarRol(' + r.id + ')">'
                    + '<div class="gu-role-dot" style="background:' + (r.color||'#5865F2') + ';"><i class="bi bi-shield-fill" style="font-size:.7rem;"></i></div>'
                    + '<div class="gu-list-info"><div class="gu-list-name">' + _guEsc(r.nombre) + '</div>'
                    + '<div class="gu-list-sub">' + cnt + ' miembro' + (cnt!==1?'s':'') + (r.es_admin ? ' · <span style="color:#ED4245;font-weight:700;">Admin</span>' : '') + '</div></div>'
                    + '<i class="bi bi-chevron-right gu-list-chevron"></i></div>';
            });
        }
        html += '<button class="gu-add-btn" onclick="window.guNuevoRol()"><i class="bi bi-plus-lg"></i> Crear Rol</button>';
    } else {
        if (!window.dataGlobalUsuarios.length) {
            html = '<div class="text-center py-4 text-muted" style="font-size:.8rem;padding:20px;">No hay miembros.</div>';
        } else {
            // Agrupar por rol (Discord-style)
            var grupos = {};
            var sinRol = [];
            window.dataGlobalUsuarios.forEach(function(u) {
                if (u.rol_id) {
                    var key = String(u.rol_id);
                    if (!grupos[key]) grupos[key] = { rol: null, users: [] };
                    grupos[key].users.push(u);
                } else { sinRol.push(u); }
            });
            // Asignar info del rol a cada grupo, en el orden de dataGlobalRoles
            window.dataGlobalRoles.forEach(function(r) {
                var key = String(r.id);
                if (grupos[key]) grupos[key].rol = r;
            });
            // Renderizar grupos ordenados por orden del rol
            var gruposOrdenados = Object.values(grupos).sort(function(a, b) {
                var oa = a.rol ? (a.rol.orden||0) : 999;
                var ob = b.rol ? (b.rol.orden||0) : 999;
                return oa - ob;
            });
            gruposOrdenados.forEach(function(g) {
                var r = g.rol;
                var color = r ? (r.color||'#6b7280') : '#6b7280';
                var nombre = r ? r.nombre : 'Desconocido';
                html += '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px 4px;font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--subtext);">'
                    + '<div style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0;"></div>'
                    + _guEsc(nombre) + ' — ' + g.users.length + '</div>';
                g.users.forEach(function(u) { html += _guRenderUserItem(u); });
            });
            if (sinRol.length) {
                html += '<div style="padding:10px 14px 4px;font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--subtext);">SIN ROL — ' + sinRol.length + '</div>';
                sinRol.forEach(function(u) { html += _guRenderUserItem(u); });
            }
        }
    }
    list.innerHTML = html;
};

// ── Panel ROL ─────────────────────────────────────────────────
function _guBuildRolPanel(rol) {
    var p = {};
    try { p = JSON.parse(rol.permisos_json || '{}'); } catch(e) {}
    var esAdmin = !!rol.es_admin;
    var colorActual = rol.color || '#5865F2';
    var html = '';

    // Nombre
    html += '<div class="gu-field-label">Nombre del Rol</div>'
        + '<input type="text" id="guRolNombre" class="form-control" value="' + _guEsc(rol.nombre||'') + '" placeholder="Nombre del rol..." style="font-weight:700;">';

    // Color
    html += '<div class="gu-field-label">Color del Rol</div><div class="gu-colors" id="guColorSwatches">';
    window._GU_COLORS.forEach(function(c) {
        html += '<div class="gu-color-swatch' + (c.toLowerCase()===colorActual.toLowerCase()?' selected':'') + '" '
            + 'style="background:' + c + ';" data-color="' + c + '" onclick="window._guSelectColor(this)"></div>';
    });
    html += '<input type="text" class="gu-hex-input" id="guRolColor" value="' + _guEsc(colorActual) + '" '
        + 'placeholder="#5865F2" oninput="window._guHexColorInput(this.value)"></div>';

    // Prioridad
    html += '<div class="gu-field-label">Prioridad / Orden</div>'
        + '<input type="number" id="guRolOrden" class="form-control" value="' + (rol.orden||0) + '" min="0" max="9999" style="max-width:120px;">'
        + '<div style="font-size:.72rem;color:var(--subtext);margin-top:3px;">Número menor aparece primero en la lista.</div>';

    // Permisos
    html += '<div class="gu-section-header" style="margin-top:18px;">Permisos de Módulo</div>';
    var lastGrp = '';
    window._GU_MODULOS.forEach(function(mod) {
        if (mod.grupo !== lastGrp) {
            html += '<div class="gu-perm-group">' + mod.grupo + '</div>';
            lastGrp = mod.grupo;
        }
        if (!mod.lcad) {
            var lv = p[mod.key] ? (p[mod.key]['l'] ? true : false) : false;
            html += '<div class="gu-perm-row"><div class="gu-perm-info"><div class="gu-perm-name">' + mod.nombre + '</div>'
                + '<div class="gu-perm-desc">' + mod.desc + '</div></div>'
                + '<div class="gu-perm-actions"><div class="dc-toggle-wrap">'
                + '<input type="checkbox" class="dc-toggle" id="pt-' + mod.key + '-l"' + (lv?' checked':'') + '>'
                + '<label class="dc-toggle-label' + (esAdmin?' readonly':'') + '" for="pt-' + mod.key + '-l"></label>'
                + '<span class="gu-perm-label">Leer</span></div></div></div>';
        } else {
            var m = p[mod.key] || {};
            var accs = ['l','c','e','d'];
            var lbls = ['Leer','Crear','Editar','Elim'];
            html += '<div class="gu-perm-row"><div class="gu-perm-info"><div class="gu-perm-name">' + mod.nombre + '</div>'
                + '<div class="gu-perm-desc">' + mod.desc + '</div></div><div class="gu-perm-actions">';
            accs.forEach(function(a,i) {
                html += '<div class="dc-toggle-wrap"><input type="checkbox" class="dc-toggle" id="pt-' + mod.key + '-' + a + '"' + (m[a]?' checked':'') + '>'
                    + '<label class="dc-toggle-label' + (esAdmin?' readonly':'') + '" for="pt-' + mod.key + '-' + a + '"></label>'
                    + '<span class="gu-perm-label">' + lbls[i] + '</span></div>';
            });
            html += '</div></div>';
        }
    });

    // Admin toggle
    html += '<div class="gu-section-header" style="margin-top:18px;">Permisos Avanzados</div>'
        + '<div class="gu-perm-row" style="padding:14px 0;">'
        + '<div class="gu-perm-info"><div class="gu-perm-name" style="color:#ED4245;">Administrador</div>'
        + '<div class="gu-perm-desc">Otorga acceso total al sistema. <strong style="color:#ED4245;">Es peligroso otorgar este permiso.</strong></div></div>'
        + '<div class="gu-perm-actions"><div class="dc-toggle-wrap">'
        + '<input type="checkbox" class="dc-toggle" id="pt-admin" onchange="window._guToggleAdmin(this)"' + (esAdmin?' checked':'') + '>'
        + '<label class="dc-toggle-label danger" for="pt-admin"></label></div></div></div>';

    // Miembros con este rol
    var miembros = (rol.id ? window.dataGlobalUsuarios.filter(function(u){ return u.rol_id == rol.id; }) : []);
    if (miembros.length) {
        html += '<div class="gu-section-header" style="margin-top:18px;">Miembros (' + miembros.length + ')</div>';
        miembros.forEach(function(u) {
            var uc = _guColorFrom(u.nombre||u.correo);
            html += '<div class="gu-member-chip">'
                + '<div class="gu-avatar" style="background:' + uc + ';">' + _guInitials(u.nombre||u.correo) + '</div>'
                + '<div><div class="gu-member-name">' + _guEsc(u.nombre) + '</div>'
                + '<div class="gu-member-cargo">' + _guEsc(u.cargo||u.correo) + '</div></div></div>';
        });
    }
    return html;
}

window.guSeleccionarRol = function(id) {
    window._guSeleccionado = { tipo:'rol', id:id };
    window._guEsNuevo = false;
    window.guRenderLista();
    var rol = window.dataGlobalRoles.find(function(r){ return r.id == id; });
    if (!rol) return;
    var content = _guBuildRolPanel(rol);
    var actions = '<button class="btn-gu-danger" onclick="window.guEliminarRol(' + id + ')"><i class="bi bi-trash me-1"></i>Eliminar Rol</button>'
        + '<button class="btn-gu-save" onclick="window.guGuardarRol()"><i class="bi bi-save me-1"></i>Guardar Cambios</button>';
    _guShowInPanel(content, actions, rol.nombre);
};

window.guNuevoRol = function() {
    window._guSeleccionado = { tipo:'rol', id:'nuevo' };
    window._guEsNuevo = true;
    window.guRenderLista();
    var content = _guBuildRolPanel({ id:null, nombre:'', color:'#5865F2', permisos_json:'{}', es_admin:0 });
    var actions = '<button class="btn-gu-save" onclick="window.guGuardarRol()"><i class="bi bi-plus me-1"></i>Crear Rol</button>';
    _guShowInPanel(content, actions, 'Nuevo Rol');
};

window._guSelectColor = function(el) {
    document.querySelectorAll('.gu-color-swatch').forEach(function(s){ s.classList.remove('selected'); });
    el.classList.add('selected');
    var ci = document.getElementById('guRolColor');
    if (ci) ci.value = el.dataset.color;
};

window._guHexColorInput = function(val) {
    if (!val || val.length < 4) return;
    document.querySelectorAll('.gu-color-swatch').forEach(function(s){
        s.classList.toggle('selected', s.dataset.color.toLowerCase() === val.toLowerCase());
    });
};

window._guToggleAdmin = function(chk) {
    document.querySelectorAll('.dc-toggle-label:not(.danger)').forEach(function(lbl){
        lbl.classList.toggle('readonly', chk.checked);
    });
};

function _guCollectPermisos() {
    var pObj = {};
    window._GU_MODULOS.forEach(function(mod) {
        if (!mod.lcad) {
            var el = document.getElementById('pt-' + mod.key + '-l');
            pObj[mod.key] = { l: el && el.checked ? 1 : 0 };
        } else {
            pObj[mod.key] = {
                l: !!(document.getElementById('pt-'+mod.key+'-l')||{}).checked ? 1 : 0,
                c: !!(document.getElementById('pt-'+mod.key+'-c')||{}).checked ? 1 : 0,
                e: !!(document.getElementById('pt-'+mod.key+'-e')||{}).checked ? 1 : 0,
                d: !!(document.getElementById('pt-'+mod.key+'-d')||{}).checked ? 1 : 0,
            };
        }
    });
    return JSON.stringify(pObj);
}

window.guGuardarRol = async function() {
    var nombreEl = document.getElementById('guRolNombre');
    var colorEl  = document.getElementById('guRolColor');
    var adminEl  = document.getElementById('pt-admin');
    if (!nombreEl || !nombreEl.value.trim()) { alert('El nombre del rol es requerido.'); return; }
    var nombre   = nombreEl.value.trim();
    var color    = (colorEl && colorEl.value.trim()) || '#5865F2';
    var es_admin = adminEl ? adminEl.checked : false;
    var permisos = es_admin ? '{}' : _guCollectPermisos();
    var ordenEl  = document.getElementById('guRolOrden');
    var orden    = ordenEl ? (parseInt(ordenEl.value)||0) : 0;
    var saveBtn  = document.querySelector('.btn-gu-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando...'; }
    try {
        var eId = (window._guSeleccionado && window._guSeleccionado.id !== 'nuevo') ? window._guSeleccionado.id : null;
        var res = await fetch(eId ? '/api/roles/'+eId : '/api/roles', {
            method: eId ? 'PUT' : 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ nombre, color, permisos_json: permisos, es_admin: es_admin ? 1 : 0, orden })
        });
        var json = await res.json();
        if (!res.ok) throw new Error(json.error || res.statusText);
        var newId = eId || json.id;
        await window.guCargarTodo(true);
        if (newId) window.guSeleccionarRol(newId);
    } catch(e) {
        alert('Error: ' + e.message);
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Guardar Cambios'; }
    }
};

window.guEliminarRol = async function(id) {
    if (!confirm('¿Eliminar este rol?')) return;
    try {
        var res = await fetch('/api/roles/'+id, { method:'DELETE' });
        var json = await res.json();
        if (!res.ok) throw new Error(json.error || res.statusText);
        window._guSeleccionado = null;
        var pe = document.getElementById('guPanelEmpty');
        var pc = document.getElementById('guPanelContent');
        var pa = document.getElementById('guPanelActions');
        if (pe) pe.style.display = '';
        if (pc) { pc.style.display='none'; pc.innerHTML=''; }
        if (pa) { pa.style.display='none'; pa.innerHTML=''; }
        await window.guCargarTodo(true);
    } catch(e) { alert('No se pudo eliminar: ' + e.message); }
};

// ── Panel USUARIO ─────────────────────────────────────────────
function _guBuildUserPanel(user) {
    var color    = user.rol_color || _guColorFrom(user.nombre||user.correo||'U');
    var initials = _guInitials(user.nombre||user.correo||'U');
    var html = '';

    if (user.nombre || user.correo) {
        html += '<div style="display:flex;align-items:center;gap:14px;padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:4px;">'
            + '<div class="gu-avatar" style="width:52px;height:52px;font-size:1rem;background:' + color + ';">' + initials + '</div>'
            + '<div><div style="font-size:.95rem;font-weight:800;color:var(--text);">' + _guEsc(user.nombre||'Nuevo usuario') + '</div>'
            + '<div style="font-size:.75rem;color:var(--subtext);">' + _guEsc(user.correo||'') + '</div></div></div>';
    }

    html += '<div class="gu-field-label">Nombre Completo</div>'
        + '<input type="text" id="guUserNombre" class="form-control" value="' + _guEsc(user.nombre||'') + '" required>';
    html += '<div class="gu-field-label">Cargo</div>'
        + '<input type="text" id="guUserCargo" class="form-control" value="' + _guEsc(user.cargo||'') + '">';
    html += '<div class="gu-field-label">Correo (login)</div>'
        + '<input type="email" id="guUserCorreo" class="form-control" value="' + _guEsc(user.correo||'') + '" required>';

    // Contraseña: usuario existente vs nuevo
    if (user.id) {
        // Mostrar contraseña actual con ojo + sección de cambio colapsable
        html += '<div class="gu-field-label">Contraseña actual</div>'
            + '<div class="input-group mb-1">'
            + '<input type="password" id="guUserPassActual" class="form-control" value="' + _guEsc(user.password||'') + '" readonly style="background:var(--surface);color:var(--text);">'
            + '<button class="btn btn-outline-secondary" type="button" onclick="window._guToggleEye(\'guUserPassActual\',this)" title="Ver contraseña">'
            + '<i class="bi bi-eye"></i></button></div>'
            + '<button class="btn btn-sm btn-outline-primary mt-1" type="button" onclick="window._guToggleChangePass()">'
            + '<i class="bi bi-pencil me-1"></i>Cambiar contraseña</button>'
            + '<div id="guChangePassSection" style="display:none;margin-top:10px;">'
            + '<div class="gu-field-label">Nueva contraseña</div>'
            + '<div class="input-group">'
            + '<input type="password" id="guUserPassword" class="form-control" placeholder="Nueva contraseña...">'
            + '<button class="btn btn-outline-secondary" type="button" onclick="window._guToggleEye(\'guUserPassword\',this)" title="Ver contraseña">'
            + '<i class="bi bi-eye"></i></button></div>'
            + '<div style="font-size:.72rem;color:var(--subtext);margin-top:4px;">Deja vacío para no cambiar la contraseña.</div>'
            + '</div>';
    } else {
        // Nuevo usuario: campo simple con ojo
        html += '<div class="gu-field-label">Contraseña</div>'
            + '<div class="input-group">'
            + '<input type="password" id="guUserPassword" class="form-control" placeholder="Contraseña inicial...">'
            + '<button class="btn btn-outline-secondary" type="button" onclick="window._guToggleEye(\'guUserPassword\',this)" title="Ver contraseña">'
            + '<i class="bi bi-eye"></i></button></div>';
    }
    html += '<div style="max-width:200px;"><div class="gu-field-label">Estado</div>'
        + '<select id="guUserEstado" class="form-select">'
        + '<option value="Activo"' + (user.estado==='Activo'?' selected':'') + '>Activo</option>'
        + '<option value="Inactivo"' + (user.estado==='Inactivo'?' selected':'') + '>Inactivo</option>'
        + '</select></div>';

    html += '<div class="gu-section-header" style="margin-top:18px;">Rol Asignado</div>'
        + '<div style="font-size:.75rem;color:var(--subtext);margin:8px 0 6px;">El usuario hereda los permisos del rol seleccionado.</div>'
        + '<select id="guUserRolId" class="form-select">'
        + '<option value="">— Sin rol asignado —</option>';
    window.dataGlobalRoles.forEach(function(r) {
        html += '<option value="' + r.id + '"' + (user.rol_id==r.id?' selected':'') + '>'
            + _guEsc(r.nombre) + (r.es_admin?' (Administrador)':'') + '</option>';
    });
    html += '</select>';

    // Última sesión
    if (user.id && (user.ultimo_acceso || user.ultimo_ip || user.ultimo_dispositivo)) {
        html += '<div class="gu-section-header" style="margin-top:18px;">Última Sesión</div>'
            + '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:8px;">';
        if (user.ultimo_acceso) {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);">'
                + '<span style="font-size:.75rem;color:var(--subtext);"><i class="bi bi-clock me-1"></i>Último acceso</span>'
                + '<span style="font-size:.75rem;font-weight:600;color:var(--text);">' + _guRelTime(user.ultimo_acceso) + '</span></div>';
        }
        if (user.ultimo_ip) {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);">'
                + '<span style="font-size:.75rem;color:var(--subtext);"><i class="bi bi-globe me-1"></i>Dirección IP</span>'
                + '<span style="font-size:.75rem;font-weight:600;color:var(--text);font-family:monospace;">' + _guEsc(user.ultimo_ip) + '</span></div>';
        }
        if (user.ultimo_dispositivo) {
            html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:5px 0;gap:10px;">'
                + '<span style="font-size:.75rem;color:var(--subtext);flex-shrink:0;"><i class="bi bi-phone me-1"></i>Dispositivo</span>'
                + '<span style="font-size:.72rem;color:var(--subtext);text-align:right;word-break:break-all;">' + _guEsc(user.ultimo_dispositivo) + '</span></div>';
        }
        html += '</div>';
    }
    return html;
}

window._guToggleEye = function(inputId, btn) {
    var el = document.getElementById(inputId);
    if (!el) return;
    var icon = btn ? btn.querySelector('i') : null;
    if (el.type === 'password') {
        el.type = 'text';
        if (icon) { icon.className = 'bi bi-eye-slash'; }
    } else {
        el.type = 'password';
        if (icon) { icon.className = 'bi bi-eye'; }
    }
};

window._guToggleChangePass = function() {
    var sec = document.getElementById('guChangePassSection');
    if (!sec) return;
    var visible = sec.style.display !== 'none';
    sec.style.display = visible ? 'none' : '';
    if (!visible) { var inp = document.getElementById('guUserPassword'); if (inp) inp.focus(); }
};

window.guSeleccionarUsuario = function(id) {
    window._guSeleccionado = { tipo:'usuario', id:id };
    window._guEsNuevo = false;
    window.guRenderLista();
    var user = window.dataGlobalUsuarios.find(function(u){ return u.id === id; });
    if (!user) return;
    var esFundador = (user.correo||'').toLowerCase() === 'admin@azkell.com';
    var content  = _guBuildUserPanel(user);
    var actions  = '';
    if (!esFundador) {
        actions = '<button class="btn-gu-danger" onclick="window.guEliminarUsuario(\'' + id.replace("'", "\\'") + '\')"><i class="bi bi-trash me-1"></i>Eliminar</button>';
    }
    actions += '<button class="btn-gu-save" onclick="window.guGuardarUsuario()"><i class="bi bi-save me-1"></i>Guardar</button>';
    _guShowInPanel(content, actions, user.nombre||user.correo);
};

window.guNuevoMiembro = function() {
    window._guSeleccionado = { tipo:'usuario', id:'nuevo' };
    window._guEsNuevo = true;
    if (window._guTabActiva !== 'miembros') {
        window._guTabActiva = 'miembros';
        var tr = document.getElementById('gu-tab-roles');
        var tm = document.getElementById('gu-tab-miembros');
        if (tr) tr.classList.remove('active');
        if (tm) tm.classList.add('active');
        window.guRenderLista();
    }
    var content = _guBuildUserPanel({ nombre:'', cargo:'', correo:'', estado:'Activo', rol_id:null, rol_color:null });
    var actions = '<button class="btn-gu-save" onclick="window.guGuardarUsuario()"><i class="bi bi-person-plus me-1"></i>Crear Miembro</button>';
    _guShowInPanel(content, actions, 'Nuevo Miembro');
};

window.guGuardarUsuario = async function() {
    var nombre   = (document.getElementById('guUserNombre')  ||{}).value || '';
    var cargo    = (document.getElementById('guUserCargo')   ||{}).value || '';
    var correo   = (document.getElementById('guUserCorreo')  ||{}).value || '';
    var password = (document.getElementById('guUserPassword')||{}).value || '';
    var estado   = (document.getElementById('guUserEstado')  ||{}).value || 'Activo';
    var rol_id   = (document.getElementById('guUserRolId')   ||{}).value || '';
    if (!correo.trim()) { alert('El correo es requerido.'); return; }
    var saveBtn = document.querySelector('.btn-gu-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando...'; }
    try {
        var eId  = (window._guSeleccionado && window._guSeleccionado.id !== 'nuevo') ? window._guSeleccionado.id : null;
        var url  = eId ? '/api/usuarios-v2/' + eId : '/api/usuarios-v2';
        var meth = eId ? 'PUT' : 'POST';
        var body = { nombre, cargo, correo, estado, rol_id: rol_id || null,
            creado_por: localStorage.getItem('fleet_correo')||'admin',
            editado_por: localStorage.getItem('fleet_correo')||'admin' };
        if (password.trim()) body.password = password.trim();
        var res  = await fetch(url, { method:meth, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        var json = await res.json();
        if (!res.ok) throw new Error(json.error || res.statusText);
        var newId = eId || json.id;
        var savedPass = password.trim();
        await window.guCargarTodo(true);
        if (newId) {
            window.guSetTab('miembros');
            setTimeout(function(){ window.guSeleccionarUsuario(newId); }, 50);
        }
        if (savedPass) {
            window._guShowCredsPopup(nombre||correo, correo, savedPass, !!eId);
        }
    } catch(e) {
        alert('Error: ' + e.message);
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Guardar'; }
    }
};

window.guEliminarUsuario = async function(id) {
    if (!confirm('¿Eliminar este usuario permanentemente?')) return;
    try {
        await fetch('/api/script/eliminarDocumento', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ ids:[id], coleccion:'Usuarios',
                usuario: localStorage.getItem('fleet_correo')||'admin' })
        });
        window._guSeleccionado = null;
        var pe = document.getElementById('guPanelEmpty');
        var pc = document.getElementById('guPanelContent');
        var pa = document.getElementById('guPanelActions');
        if (pe) pe.style.display = '';
        if (pc) { pc.style.display='none'; pc.innerHTML=''; }
        if (pa) { pa.style.display='none'; pa.innerHTML=''; }
        await window.guCargarTodo(true);
    } catch(e) { alert('Error: ' + e.message); }
};

window._guShowCredsPopup = function(nombre, correo, password, esReset) {
    var titulo    = esReset ? 'Contraseña actualizada' : 'Usuario creado exitosamente';
    var subtitulo = esReset ? 'Comparte la nueva clave con el miembro' : 'Comparte estas credenciales con el nuevo miembro';
    var icono     = esReset ? 'bi-key-fill' : 'bi-person-check-fill';
    var iconoBg   = esReset ? '#f59e0b' : '#10b981';

    var lineaUsuario = esReset ? '' : ('\u2753 Usuario: ' + nombre + '\n');
    var textoWA = '\u00a1Hola ' + nombre + '! \u{1F44B}\n\n'
        + (esReset ? 'Tu contrase\u00f1a en Azkell Fleet fue restablecida:\n\n'
                   : 'Te comparto tus credenciales para Azkell Fleet:\n\n')
        + '\u{1F4E7} Correo: ' + correo + '\n'
        + '\u{1F511} Contrase\u00f1a: ' + password + '\n'
        + '\u{1F310} Acceso: ' + window.location.origin + '\n\n'
        + '\u26A0\uFE0F Guarda estos datos en un lugar seguro.';

    var waLink = 'https://wa.me/?text=' + encodeURIComponent(textoWA);

    var overlay = document.createElement('div');
    overlay.id = 'guCredsOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = '<div style="background:var(--surface);border-radius:20px;padding:28px 24px;max-width:420px;width:100%;box-shadow:0 24px 80px rgba(0,0,0,.55);">'

        // Header con ícono + títulos
        + '<div style="display:flex;align-items:center;gap:14px;margin-bottom:22px;">'
        + '<div style="width:46px;height:46px;border-radius:50%;background:' + iconoBg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
        + '<i class="bi ' + icono + '" style="color:#fff;font-size:1.2rem;"></i></div>'
        + '<div><div style="font-size:.95rem;font-weight:800;color:var(--text);">' + titulo + '</div>'
        + '<div style="font-size:.75rem;color:var(--subtext);margin-top:1px;">' + subtitulo + '</div></div></div>'

        // Card de credenciales
        + '<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:20px;">'
        + '<div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--subtext);margin-bottom:14px;">Credenciales de acceso</div>'

        // Correo
        + '<div style="margin-bottom:12px;">'
        + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">'
        + '<i class="bi bi-envelope-fill" style="font-size:.75rem;color:var(--subtext);"></i>'
        + '<span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--subtext);">Correo</span></div>'
        + '<div style="font-size:.9rem;font-weight:700;color:var(--text);font-family:monospace;word-break:break-all;">' + _guEsc(correo) + '</div></div>'

        // Contraseña
        + '<div>'
        + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">'
        + '<i class="bi bi-key-fill" style="font-size:.75rem;color:var(--subtext);"></i>'
        + '<span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--subtext);">Contrase\u00f1a</span></div>'
        + '<div style="font-size:.9rem;font-weight:700;color:var(--text);font-family:monospace;">' + _guEsc(password) + '</div>'
        + '</div></div>'

        // Botones
        + '<div style="display:flex;gap:8px;">'
        + '<a href="' + waLink + '" target="_blank" '
        + 'style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#25D366;color:#fff;border-radius:10px;padding:10px 14px;font-weight:700;font-size:.82rem;text-decoration:none;">'
        + '<i class="bi bi-whatsapp" style="font-size:1rem;"></i> Enviar por WhatsApp</a>'
        + '<button onclick="document.getElementById(\'guCredsOverlay\').remove()" '
        + 'style="background:var(--border);color:var(--text);border:none;border-radius:10px;padding:10px 18px;font-weight:600;font-size:.82rem;cursor:pointer;">Cerrar</button>'
        + '</div></div>';

    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.remove(); });
};

// ── Init ──────────────────────────────────────────────────────
window.init_usuarios = function() {
    // Solo administradores pueden acceder a este módulo
    if (!window.checkPerm('seg', 'l')) {
        var list = document.getElementById('guList');
        if (list) window.showNoPermMsg(list);
        var panel = document.getElementById('guPanel');
        if (panel) panel.style.display = 'none';
        var tabs = document.querySelector('.gu-tabs');
        if (tabs) tabs.style.display = 'none';
        return;
    }
    window.dataGlobalUsuarios = [];
    window._guSeleccionado    = null;
    window._guEsNuevo         = false;
    window._guTabActiva       = 'roles';
    window.guCargarTodo(true);
};
