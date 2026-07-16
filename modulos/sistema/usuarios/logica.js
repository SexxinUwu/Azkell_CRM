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
    { grupo:'FLOTA',         key:'gps',           nombre:'GPS / Ubicación',  desc:'Visualización en tiempo real',  lcad:false },
    { grupo:'FLOTA',         key:'status',        nombre:'Status Flota',     desc:'Estado y agrupación de unidades', lcad:true  },
    { grupo:'MANTENIMIENTO', key:'status_rampa',  nombre:'Status Rampa',     desc:'Gestión visual en taller',      lcad:true  },
    { grupo:'MANTENIMIENTO', key:'insp',          nombre:'Análisis de Inspecciones', desc:'Registro de inspecciones', lcad:true  },
    { grupo:'MANTENIMIENTO', key:'fleet',         nombre:'Mantenimiento Preventivo', desc:'Datos operativos de la flota',  lcad:true  },
    { grupo:'MANTENIMIENTO', key:'reportes_ot',   nombre:'Reportes OT',      desc:'Métricas de mantenimiento',     lcad:true  },
    { grupo:'MANTENIMIENTO', key:'trabajos_ot',   nombre:'Historial de Trabajos', desc:'Gestión de técnicos',           lcad:true  },
    { grupo:'MANTENIMIENTO', key:'otros_mant',    nombre:'Otros',            desc:'Módulos complementarios',       lcad:true  },
    { grupo:'ALMACÉN',       key:'inv',           nombre:'Inventario',       desc:'Catálogo de artículos',         lcad:true  },
    { grupo:'ALMACÉN',       key:'ent_inv',       nombre:'Entradas',         desc:'Ingresos al almacén',           lcad:true  },
    { grupo:'ALMACÉN',       key:'sal_inv',       nombre:'Salidas',          desc:'Egresos del almacén',           lcad:true  },
    { grupo:'ALMACÉN',       key:'kardex',        nombre:'Kardex',           desc:'Movimientos por artículo',      lcad:false },
    { grupo:'DIRECTORIO',    key:'cond',          nombre:'Personal',         desc:'Directorio operativo',          lcad:true  },
    { grupo:'SEGURIDAD',     key:'placas',        nombre:'CheckList de Ingreso/Salidas de Unidades',desc:'Fichas técnicas', lcad:true  },
    { grupo:'SEGURIDAD',     key:'asist',         nombre:'Tareo',            desc:'Asistencia del personal',       lcad:true  },
    { grupo:'CONFIGURACIÓN', key:'usuarios',      nombre:'Usuarios',         desc:'Gestión de accesos',            lcad:true  },
    { grupo:'CONFIGURACIÓN', key:'mod_auditoria', nombre:'Auditoría',        desc:'Bitácora de actividad',         lcad:true  },
    { grupo:'CONFIGURACIÓN', key:'cfg_apariencia',nombre:'Apariencia',       desc:'Personalización visual',        lcad:true  },
    { grupo:'CONFIGURACIÓN', key:'cfg_accesibilidad',nombre:'Accesibilidad', desc:'Ajustes de uso',                lcad:true  },
    { grupo:'CONFIGURACIÓN', key:'cfg_idioma',    nombre:'Idioma',           desc:'Idiomas del sistema',           lcad:true  },
    { grupo:'CONFIGURACIÓN', key:'administracion',nombre:'Administración',   desc:'Hub de administración',         lcad:true  }
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
        // fila: [0]id [1]nombre [2]cargo [3]correo [4]rol_label [5]estado [6]password_visible [7]permisos [8]rol_id [9]rol_color [10]ultimo_acceso [11]ultimo_ip [12]ultimo_dispositivo [13]roles_ids
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
        window.guSetTab(window._guTabActiva || 'roles');
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

    var ph = document.getElementById('top-actions-placeholder');
    if (ph) {
        if (tab === 'roles') {
            ph.innerHTML = '<button class="btn btn-sm top-btn-reg" style="background:var(--crm-accent);color:#fff;font-weight:600;border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:6px;" onclick="window.guNuevoRol()"><i class="bi bi-shield-plus"></i> Registrar Rol</button>';
        } else if (tab === 'miembros') {
            ph.innerHTML = '<button class="btn btn-sm top-btn-reg" style="background:var(--crm-accent);color:#fff;font-weight:600;border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:6px;" onclick="window.guNuevoMiembro()"><i class="bi bi-person-plus"></i> Registrar Usuario</button>';
        } else {
            ph.innerHTML = '';
        }
    }
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
    var fnClick = 'window.guSeleccionarUsuario';
    return '<div class="gu-list-item' + (isSel?' selected':'') + '" onclick="' + fnClick + '(\'' + u.id + '\')">'
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
        // html += '<button class="gu-add-btn" onclick="window.guNuevoRol()"><i class="bi bi-plus-lg"></i> Crear Rol</button>';
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
                + '<input type="checkbox" class="dc-toggle" id="pt-' + mod.key + '-l"' + (lv?' checked':'') + ' onchange="window._guCheckCascade(this, \'' + mod.key + '\', \'l\')">'
                + '<label class="dc-toggle-label' + (esAdmin?' readonly':'') + '" for="pt-' + mod.key + '-l"></label>'
                + '<span class="gu-perm-label">Leer</span></div></div></div>';
        } else {
            var m = p[mod.key] || {};
            var accs = ['l','c','e','d'];
            var lbls = ['Leer','Crear','Editar','Elim'];
            html += '<div class="gu-perm-row"><div class="gu-perm-info"><div class="gu-perm-name">' + mod.nombre + '</div>'
                + '<div class="gu-perm-desc">' + mod.desc + '</div></div><div class="gu-perm-actions">';
            accs.forEach(function(a,i) {
                html += '<div class="dc-toggle-wrap"><input type="checkbox" class="dc-toggle" id="pt-' + mod.key + '-' + a + '"' + (m[a]?' checked':'') + ' onchange="window._guCheckCascade(this, \'' + mod.key + '\', \'' + a + '\')">'
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
    if (rol.id) {
        html += '<div style="margin-top:32px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px;">'
            + '<div style="font-weight:700; color:var(--text); margin-bottom:4px;">Ver servidor como un rol</div>'
            + '<div style="font-size:0.8rem; color:var(--subtext); margin-bottom:12px;">Esto te permitirá probar qué acciones puede realizar este rol y qué áreas puede ver.</div>'
            + '<button class="btn btn-sm" style="background:var(--crm-accent); color:#fff; font-weight:600; padding:6px 16px; border-radius:6px; border:none; transition:opacity 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1" onclick="window.guVerComoRol(' + rol.id + ')">Ver servidor como rol <i class="bi bi-arrow-right ms-1"></i></button>'
            + '</div>';
    }
    return html;
}

window.guVerComoRol = function(rolId) {
    var rol = window.dataGlobalRoles.find(function(r){ return r.id == rolId; });
    if (!rol) return;
    localStorage.setItem('fleet_simulated_role', JSON.stringify({
        id: rol.id,
        nombre: rol.nombre,
        permisos: rol.permisos_json || '{}',
        es_admin: !!rol.es_admin
    }));
    window.location.reload();
};

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
    if (!window.guardAction('seg', window._guEsNuevo ? 'c' : 'e')) return;
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
    if (!window.guardAction('seg', 'd')) return;
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
    var esNuevoUser = !(window._guSeleccionado && window._guSeleccionado.id !== 'nuevo');
    if (!window.guardAction('seg', esNuevoUser ? 'c' : 'e')) return;
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
    if (!window.guardAction('seg', 'd')) return;
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



window._guCheckCascade = function(el, modKey, action) {
    if (!el || el.classList.contains('readonly')) return;
    var chk = el.checked;
    
    // Auto-activación: Si se activa c, e, d => activa l
    if (chk && (action === 'c' || action === 'e' || action === 'd')) {
        var lEl = document.getElementById('pt-' + modKey + '-l');
        if (lEl && !lEl.checked) lEl.checked = true;
    }
    
    // Auto-desactivación: Si se desactiva l => desactiva c, e, d
    if (!chk && action === 'l') {
        ['c', 'e', 'd'].forEach(function(a) {
            var subEl = document.getElementById('pt-' + modKey + '-' + a);
            if (subEl && subEl.checked) subEl.checked = false;
        });
    }
};



// ==========================================================
// Discord Light Mode UI Overrides for Roles Module
// ==========================================================

// Global state for Discord UI
window.dcCurrentRole = null;
window.dcCurrentTab = 'visualizar';
window.dcPendingChanges = false;

// Override list render
window.guRenderLista = function() {
    let listEl = document.getElementById('dc-role-list');
    if (!listEl) return;
    
    let html = '';
    
    // 1. Audit Log Item
    let isAuditSel = window._guSeleccionado && window._guSeleccionado.tipo === 'audit';
    html += `
    <div class="dc-role-item ${isAuditSel ? 'active' : ''}" onclick="window.dcShowAuditLog()">
        <div class="dc-role-dot" style="background:transparent; color:var(--dc-subtext); display:flex; align-items:center; justify-content:center;">
            <i class="bi bi-journal-text" style="font-size: 1.1rem;"></i>
        </div>
        <div class="dc-role-name" style="margin-left: 4px;">Registro de auditoría</div>
    </div>
    <hr style="border-color: var(--dc-border); margin: 8px 12px; opacity: 0.5;">
    `;
    
    // 2. Roles List
    if (window.dataGlobalRoles && window.dataGlobalRoles.length > 0) {
        window.dataGlobalRoles.forEach(r => {
            let isSel = window._guSeleccionado && window._guSeleccionado.tipo === 'rol' && window._guSeleccionado.id == r.id;
            html += `
            <div class="dc-role-item ${isSel ? 'active' : ''}" onclick="window.guSeleccionarRol(${r.id})">
                <div class="dc-role-dot" style="background:${r.color || '#5865F2'};"></div>
                <div class="dc-role-name">${r.nombre.replace(/</g, '&lt;')}</div>
            </div>`;
        });
    } else {
        html += '<div class="text-center py-4 text-muted small">No hay roles.</div>';
    }
    
    listEl.innerHTML = html;
};

// Open Audit Log
window.dcShowAuditLog = function() {
    window._guSeleccionado = { tipo: 'audit' };
    window.guRenderLista();
    
    document.getElementById('dc-role-title').textContent = "REGISTRO DE AUDITORÍA";
    
    // Hide role tabs
    document.getElementById('dc-tab-btn-visualizar').style.display = 'none';
    document.getElementById('dc-tab-btn-permisos').style.display = 'none';
    document.getElementById('dc-tab-btn-miembros').style.display = 'none';
    document.getElementById('dc-action-bar').style.display = 'none';
    
    // Show audit log content
    let html = `
    <div class="d-flex gap-3 mb-4">
        <div style="flex:1;">
            <label class="dc-label">Filtrar por usuario</label>
            <select class="dc-input" style="padding:8px 12px; margin:0;"><option>Todos los usuarios</option></select>
        </div>
        <div style="flex:1;">
            <label class="dc-label">Filtrar por acción</label>
            <select class="dc-input" style="padding:8px 12px; margin:0;"><option>Todas las acciones</option></select>
        </div>
    </div>
    
    <div style="border: 1px solid var(--dc-border); border-radius: 8px; background: var(--dc-panel-bg);">
        <div style="padding: 16px; border-bottom: 1px solid var(--dc-border); display:flex; align-items:center; gap:16px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--dc-bg); display:flex; align-items:center; justify-content:center;">
                <i class="bi bi-person-fill text-muted"></i>
            </div>
            <div style="flex:1;">
                <div style="font-weight:600; color:var(--dc-text); font-size: 0.95rem;">azzkell creó el rol <span style="font-weight:800;">nuevo rol</span></div>
                <div style="color:var(--dc-subtext); font-size: 0.8rem;">hoy a las 9:39</div>
            </div>
        </div>
        <div style="padding: 16px; border-bottom: 1px solid var(--dc-border); display:flex; align-items:center; gap:16px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--dc-bg); display:flex; align-items:center; justify-content:center;">
                <i class="bi bi-person-fill text-muted"></i>
            </div>
            <div style="flex:1;">
                <div style="font-weight:600; color:var(--dc-text); font-size: 0.95rem;">azzkell eliminó el rol <span style="font-weight:800;">test</span></div>
                <div style="color:var(--dc-subtext); font-size: 0.8rem;">hoy a las 9:19</div>
            </div>
        </div>
    </div>
    `;
    
    document.getElementById('dc-content-area').innerHTML = `<div class="dc-content-inner" style="max-width: 800px;">${html}</div>`;
};

// Override Role Selection
window.guSeleccionarRol = function(id) {
    window._guSeleccionado = { tipo: 'rol', id: id };
    window.guRenderLista();
    
    let rol = window.dataGlobalRoles.find(r => r.id == id);
    if (!rol) return;
    
    window.dcCurrentRole = rol;
    document.getElementById('dc-role-title').textContent = "EDITAR ROL: " + (rol.nombre || '').toUpperCase();
    
    // Show role tabs
    document.getElementById('dc-tab-btn-visualizar').style.display = 'block';
    document.getElementById('dc-tab-btn-permisos').style.display = 'block';
    document.getElementById('dc-tab-btn-miembros').style.display = 'block';
    
    window.dcSetTab('visualizar');
};

// New Role
window.dcNuevoRol = function() {
    window._guSeleccionado = { tipo: 'rol', id: 'nuevo' };
    window.guRenderLista();
    
    window.dcCurrentRole = { id: 'nuevo', nombre: '', color: '#95A5A6', permisos_json: '{}', es_admin: 0 };
    document.getElementById('dc-role-title').textContent = "EDITAR ROL: NUEVO ROL";
    
    document.getElementById('dc-tab-btn-visualizar').style.display = 'block';
    document.getElementById('dc-tab-btn-permisos').style.display = 'block';
    document.getElementById('dc-tab-btn-miembros').style.display = 'none'; // Cant manage members of unsaved role
    
    window.dcSetTab('visualizar');
};

// Tab Switching
window.dcSetTab = function(tab) {
    window.dcCurrentTab = tab;
    
    // Update active tab styling
    document.querySelectorAll('.dc-tab').forEach(el => el.classList.remove('active'));
    let activeBtn = document.getElementById('dc-tab-btn-' + tab);
    if(activeBtn) activeBtn.classList.add('active');
    
    let contentArea = document.getElementById('dc-content-area');
    let rol = window.dcCurrentRole;
    if (!rol) return;
    
    let html = '<div class="dc-content-inner">';
    
    if (tab === 'visualizar') {
        html += `
            <label class="dc-label">Nombre del rol <span style="color:#da373c;">*</span></label>
            <input type="text" class="dc-input" id="dc-rol-nombre" value="${rol.nombre.replace(/"/g, '&quot;')}" oninput="window.dcMarkUnsaved()">
            
            <label class="dc-label">Color del rol</label>
            <div class="dc-color-grid">
                ${window._GU_COLORS.map(c => `
                    <div class="dc-color-swatch ${rol.color === c ? 'selected' : ''}" 
                         style="background:${c};" 
                         onclick="window.dcSelectColor(this, '${c}')"></div>
                `).join('')}
                <div class="dc-color-swatch dc-color-custom" onclick="document.getElementById('dc-rol-color-hex').click()">
                    <i class="bi bi-eyedropper"></i>
                </div>
            </div>
            <input type="color" id="dc-rol-color-hex" value="${rol.color || '#95A5A6'}" 
                   style="opacity:0; position:absolute; pointer-events:none;" 
                   onchange="window.dcSelectCustomColor(this.value)">
            <input type="hidden" id="dc-rol-color" value="${rol.color || '#95A5A6'}">
            
            <hr style="border-color: var(--dc-border); margin: 32px 0;">
            
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--dc-bg); padding:16px; border-radius:8px; border:1px solid var(--dc-border);">
                <div>
                    <div style="font-weight:700; color:var(--dc-text); font-size:0.95rem;">Ver servidor como un rol</div>
                    <div style="font-size:0.85rem; color:var(--dc-subtext); margin-top:4px; max-width:400px;">Esto te permitirá probar qué acciones puede realizar este rol. Solo está disponible para los propietarios y administradores.</div>
                </div>
                <button class="dc-btn-reset" style="background:var(--dc-panel-bg); color:var(--dc-text); border:1px solid var(--dc-border); border-radius:4px;" onclick="window.dcSimulateRole()">Ver servidor como un rol &rarr;</button>
            </div>
            
            ${rol.id !== 'nuevo' && !rol.es_admin ? `
            <div class="mt-5 pt-3 border-top" style="border-color: var(--dc-border) !important;">
                <button class="dc-btn-save" style="background: transparent; color: #da373c; border: 1px solid #da373c;" onclick="window.guEliminarRol(${rol.id})">Eliminar Rol</button>
            </div>
            ` : ''}
        `;
    } 
    else if (tab === 'permisos') {
        let pObj = {};
        try { pObj = JSON.parse(rol.permisos_json || '{}'); } catch(e){}
        let isAdmin = rol.es_admin === 1;
        
        html += `
            <div style="display:flex; align-items:center; background:var(--dc-bg); padding:12px 16px; border-radius:8px; margin-bottom:24px; border:1px solid var(--dc-border);">
                <i class="bi bi-search text-muted me-2"></i>
                <input type="text" placeholder="Permisos de búsqueda" style="background:transparent; border:none; outline:none; width:100%; color:var(--dc-text); font-size:0.9rem;">
            </div>
        `;
        
        // Permisos Avanzados (Admin)
        html += `
            <div class="dc-perm-group" style="margin-top:0;">Permisos avanzados</div>
            <div class="dc-perm-row">
                <div class="dc-perm-info">
                    <h4>Administrador</h4>
                    <p>Los miembros que tienen este permiso poseen todos los permisos y también pueden ignorar todas las restricciones. <strong>Es peligroso otorgar este permiso.</strong></p>
                </div>
                <div class="dc-toggle-wrap">
                    <input type="checkbox" id="dc-perm-admin" class="dc-toggle" ${isAdmin ? 'checked' : ''} onchange="window.dcMarkUnsaved()">
                    <label for="dc-perm-admin" class="dc-toggle-label danger"></label>
                </div>
            </div>
        `;
        
        // Iterar schema de permisos
        if (window._GU_SCHEMA_PERMISOS) {
            let groups = {};
            window._GU_SCHEMA_PERMISOS.forEach(s => {
                if(!groups[s.grupo]) groups[s.grupo] = [];
                groups[s.grupo].push(s);
            });
            
            for (let g in groups) {
                html += `<div class="dc-perm-group">${g}</div>`;
                groups[g].forEach(s => {
                    let hasL = pObj[s.key] && (pObj[s.key].l === 1 || pObj[s.key].l === true);
                    let hasC = pObj[s.key] && (pObj[s.key].c === 1 || pObj[s.key].c === true);
                    let hasE = pObj[s.key] && (pObj[s.key].e === 1 || pObj[s.key].e === true);
                    let hasD = pObj[s.key] && (pObj[s.key].d === 1 || pObj[s.key].d === true);
                    
                    html += `
                    <div class="dc-perm-row">
                        <div class="dc-perm-info">
                            <h4>${s.nombre}</h4>
                            <p>${s.desc}</p>
                        </div>
                        <div style="display:flex; gap:16px;">
                            ${s.lcad ? `
                            <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <span style="font-size:0.65rem; font-weight:700; color:var(--dc-subtext);">Ver</span>
                                <input type="checkbox" id="p_${s.key}_l" class="dc-toggle dc-perm-chk" data-key="${s.key}" data-act="l" ${hasL?'checked':''} onchange="window.dcMarkUnsaved()">
                                <label for="p_${s.key}_l" class="dc-toggle-label"></label>
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <span style="font-size:0.65rem; font-weight:700; color:var(--dc-subtext);">Crear</span>
                                <input type="checkbox" id="p_${s.key}_c" class="dc-toggle dc-perm-chk" data-key="${s.key}" data-act="c" ${hasC?'checked':''} onchange="window.dcMarkUnsaved()">
                                <label for="p_${s.key}_c" class="dc-toggle-label"></label>
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <span style="font-size:0.65rem; font-weight:700; color:var(--dc-subtext);">Edit</span>
                                <input type="checkbox" id="p_${s.key}_e" class="dc-toggle dc-perm-chk" data-key="${s.key}" data-act="e" ${hasE?'checked':''} onchange="window.dcMarkUnsaved()">
                                <label for="p_${s.key}_e" class="dc-toggle-label"></label>
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <span style="font-size:0.65rem; font-weight:700; color:var(--dc-subtext);">Borr</span>
                                <input type="checkbox" id="p_${s.key}_d" class="dc-toggle dc-perm-chk" data-key="${s.key}" data-act="d" ${hasD?'checked':''} onchange="window.dcMarkUnsaved()">
                                <label for="p_${s.key}_d" class="dc-toggle-label"></label>
                            </div>
                            ` : `
                            <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <span style="font-size:0.65rem; font-weight:700; color:var(--dc-subtext);">Acceso</span>
                                <input type="checkbox" id="p_${s.key}_acc" class="dc-toggle dc-perm-chk" data-key="${s.key}" data-act="acc" ${hasL?'checked':''} onchange="window.dcMarkUnsaved()">
                                <label for="p_${s.key}_acc" class="dc-toggle-label"></label>
                            </div>
                            `}
                        </div>
                    </div>
                    `;
                });
            }
        }
    }
    else if (tab === 'miembros') {
        let cnt = 0;
        if (window.dataGlobalUsuarios) {
            window.dataGlobalUsuarios.forEach(u => {
                let uroles = u.roles_ids || (u.rol_id ? [u.rol_id] : []);
                if (uroles.includes(rol.id) || u.rol_id == rol.id) {
                    cnt++;
                    let color = u.rol_color || rol.color || '#5865F2';
                    html += `
                    <div style="display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid var(--dc-border);">
                        <div style="width:36px; height:36px; border-radius:50%; background:${color}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.8rem;">
                            ${(u.nombre||u.correo||'U').substring(0,2).toUpperCase()}
                        </div>
                        <div style="flex:1;">
                            <div style="font-weight:600; font-size:0.95rem; color:var(--dc-text);">${u.nombre || u.correo}</div>
                            <div style="font-size:0.8rem; color:var(--dc-subtext);">${u.cargo || '-'}</div>
                        </div>
                    </div>
                    `;
                }
            });
        }
        if (cnt === 0) {
            html += '<div class="text-center py-5 text-muted">No hay miembros con este rol.</div>';
        }
    }
    
    html += '</div>';
    contentArea.innerHTML = html;
};

// Interactions
window.dcSelectColor = function(el, color) {
    document.querySelectorAll('.dc-color-swatch').forEach(s => s.classList.remove('selected'));
    if(el) el.classList.add('selected');
    document.getElementById('dc-rol-color').value = color;
    window.dcMarkUnsaved();
};
window.dcSelectCustomColor = function(hex) {
    document.getElementById('dc-rol-color-hex').parentElement.querySelector('.dc-color-custom').style.background = hex;
    window.dcSelectColor(document.getElementById('dc-rol-color-hex').parentElement.querySelector('.dc-color-custom'), hex);
};

window.dcMarkUnsaved = function() {
    window.dcPendingChanges = true;
    document.getElementById('dc-action-bar').style.display = 'flex';
};

window.dcResetForm = function() {
    window.dcPendingChanges = false;
    document.getElementById('dc-action-bar').style.display = 'none';
    window.dcSetTab(window.dcCurrentTab); // re-render tab
};

window.dcGuardarCambios = async function() {
    // Collect data
    let btn = document.querySelector('.dc-btn-save');
    btn.textContent = 'Guardando...';
    btn.disabled = true;
    
    let rol = window.dcCurrentRole;
    if (!rol) return;
    
    let id = rol.id === 'nuevo' ? null : rol.id;
    // We only collect what's on the screen or in current state.
    // If we are in "visualizar", we get name and color.
    let nombre = document.getElementById('dc-rol-nombre') ? document.getElementById('dc-rol-nombre').value : rol.nombre;
    let color = document.getElementById('dc-rol-color') ? document.getElementById('dc-rol-color').value : rol.color;
    
    // If we are in "permisos", we collect the toggles
    let es_admin = document.getElementById('dc-perm-admin') ? (document.getElementById('dc-perm-admin').checked ? 1 : 0) : rol.es_admin;
    
    let pObj = {};
    if (document.getElementById('dc-perm-admin')) {
        // Collect from DOM
        document.querySelectorAll('.dc-perm-chk').forEach(chk => {
            let key = chk.dataset.key;
            let act = chk.dataset.act;
            if (!pObj[key]) pObj[key] = {};
            if (act === 'acc') {
                pObj[key] = chk.checked;
            } else {
                pObj[key][act] = chk.checked ? 1 : 0;
            }
        });
    } else {
        // Keep existing
        try { pObj = JSON.parse(rol.permisos_json || '{}'); } catch(e){}
    }
    
    // Send to backend
    try {
        let res = await fetch('/api/script/guardar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coleccion: 'roles', id: id,
                datos: {
                    nombre: nombre,
                    color: color,
                    es_admin: es_admin,
                    permisos_json: JSON.stringify(pObj)
                }
            })
        });
        if (!res.ok) throw new Error('Error HTTP ' + res.status);
        
        window.dcPendingChanges = false;
        document.getElementById('dc-action-bar').style.display = 'none';
        
        await window.guCargarTodo(); // Reload roles
        window.guSeleccionarRol(id === null ? window.dataGlobalRoles[window.dataGlobalRoles.length-1].id : id);
        
    } catch(e) {
        alert("Error al guardar: " + e.message);
    } finally {
        btn.textContent = 'Guardar cambios';
        btn.disabled = false;
    }
};

window.cerrarModuloUsuarios = function() {
    if (window.dcPendingChanges) {
        if(!confirm("Tienes cambios sin guardar. ¿Seguro que deseas salir?")) return;
    }
    // Return to dashboard
    if (window.cargarModuloAislado) window.cargarModuloAislado('dashboard');
};

// Simulate Role Banner Multiple
window.dcSimulateRole = function() {
    if(!window.dataGlobalRoles) return;
    
    let container = document.getElementById('dc-sim-banner-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'dc-sim-banner-container';
        container.innerHTML = `
        <div class="dc-sim-banner">
            <div>Estás viendo este servidor como <span id="dc-sim-count">0</span> rol(es).</div>
            <div class="dc-sim-dropdown">
                <button class="dc-sim-btn" onclick="document.getElementById('dc-sim-list').classList.toggle('show')">
                    Seleccionar roles <i class="bi bi-chevron-down"></i>
                </button>
                <div class="dc-sim-list" id="dc-sim-list">
                    <!-- roles list generated here -->
                </div>
            </div>
            <button class="dc-sim-btn" style="border-color:transparent;" onclick="window.dcStopSimulate()">Desactivar</button>
        </div>
        `;
        document.body.appendChild(container);
        
        // Populate dropdown
        let dhtml = '<div style="padding:12px; border-bottom:1px solid var(--dc-border);"><input type="text" placeholder="Buscar roles" class="dc-input" style="margin:0; padding:8px;" onkeyup="window.dcSimSearch(this.value)"></div>';
        dhtml += '<div id="dc-sim-items-container" style="max-height:200px; overflow-y:auto;">';
        window.dataGlobalRoles.forEach(r => {
            dhtml += `
            <div class="dc-sim-list-item" data-name="${r.nombre.toLowerCase()}" onclick="window.dcToggleSimRole(${r.id}, this)">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="width:12px;height:12px;border-radius:50%;background:${r.color||'#5865F2'};"></div>
                    <span style="font-weight:600;font-size:0.85rem;">${r.nombre}</span>
                </div>
                <div class="dc-sim-checkbox"></div>
            </div>
            `;
        });
        dhtml += '</div>';
        document.getElementById('dc-sim-list').innerHTML = dhtml;
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if(!e.target.closest('.dc-sim-dropdown')) {
                let lst = document.getElementById('dc-sim-list');
                if(lst) lst.classList.remove('show');
            }
        });
    }
    
    // Auto-select current role
    if (window.dcCurrentRole && window.dcCurrentRole.id !== 'nuevo') {
        let el = document.getElementById('dc-sim-items-container').children.item(
            window.dataGlobalRoles.findIndex(x => x.id === window.dcCurrentRole.id)
        );
        if (el && !el.classList.contains('checked')) {
            window.dcToggleSimRole(window.dcCurrentRole.id, el);
        }
    }
};

window.dcActiveSimRoles = [];

window.dcToggleSimRole = function(id, el) {
    el.classList.toggle('checked');
    if (el.classList.contains('checked')) {
        if (!window.dcActiveSimRoles.includes(id)) window.dcActiveSimRoles.push(id);
    } else {
        window.dcActiveSimRoles = window.dcActiveSimRoles.filter(x => x !== id);
    }
    document.getElementById('dc-sim-count').textContent = window.dcActiveSimRoles.length;
    window.dcApplySimulatedPerms();
};

window.dcSimSearch = function(val) {
    val = val.toLowerCase();
    document.querySelectorAll('.dc-sim-list-item').forEach(el => {
        if (el.dataset.name.includes(val)) el.style.display = 'flex';
        else el.style.display = 'none';
    });
};

window.dcApplySimulatedPerms = function() {
    if (window.dcActiveSimRoles.length === 0) {
        localStorage.removeItem('fleet_simulated_role');
    } else {
        // Merge permissions
        let mergedObj = {};
        let isAdm = false;
        
        window.dcActiveSimRoles.forEach(rid => {
            let r = window.dataGlobalRoles.find(x => x.id === rid);
            if (r) {
                if (r.es_admin) isAdm = true;
                let pObj = {};
                try { pObj = JSON.parse(r.permisos_json || '{}'); } catch(e){}
                for (let k in pObj) {
                    if (!mergedObj[k]) mergedObj[k] = {};
                    if (typeof pObj[k] === 'boolean') {
                        if (pObj[k]) mergedObj[k] = true;
                    } else {
                        if (pObj[k].l) mergedObj[k].l = 1;
                        if (pObj[k].c) mergedObj[k].c = 1;
                        if (pObj[k].e) mergedObj[k].e = 1;
                        if (pObj[k].d) mergedObj[k].d = 1;
                    }
                }
            }
        });
        
        localStorage.setItem('fleet_simulated_role', JSON.stringify({
            nombre: 'Múltiples roles',
            es_admin: isAdm ? 1 : 0,
            permisos: JSON.stringify(mergedObj)
        }));
        
        // Ensure cache is reset so new permissions apply
        window._permCache = null;
    }
};

window.dcStopSimulate = function() {
    localStorage.removeItem('fleet_simulated_role');
    window._permCache = null;
    let b = document.getElementById('dc-sim-banner-container');
    if (b) b.remove();
    window.dcActiveSimRoles = [];
};

// Initialize
setTimeout(() => {
    if (window.guCargarTodo) {
        window.guCargarTodo();
    }
}, 300);


