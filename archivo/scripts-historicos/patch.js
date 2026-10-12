const fs = require('fs');
let c = fs.readFileSync('modulos/sistema/usuarios/logica.js', 'utf8');

// 1. Update window._GU_MODULOS
const regexModulos = /window\._GU_MODULOS = window\._GU_MODULOS \|\| \[[\s\S]*?\];/;
const nuevosModulos = "window._GU_MODULOS = window._GU_MODULOS || [\n" +
"    { grupo:'FLOTA',         key:'gps',           nombre:'GPS / Ubicación',  desc:'Visualización en tiempo real',  lcad:false },\n" +
"    { grupo:'FLOTA',         key:'status',        nombre:'Status Flota',     desc:'Estado y agrupación de unidades', lcad:true  },\n" +
"    { grupo:'MANTENIMIENTO', key:'status_rampa',  nombre:'Status Rampa',     desc:'Gestión visual en taller',      lcad:true  },\n" +
"    { grupo:'MANTENIMIENTO', key:'insp',          nombre:'Análisis de Inspecciones', desc:'Registro de inspecciones', lcad:true  },\n" +
"    { grupo:'MANTENIMIENTO', key:'fleet',         nombre:'Mantenimiento Preventivo', desc:'Datos operativos de la flota',  lcad:true  },\n" +
"    { grupo:'MANTENIMIENTO', key:'reportes_ot',   nombre:'Reportes OT',      desc:'Métricas de mantenimiento',     lcad:false },\n" +
"    { grupo:'MANTENIMIENTO', key:'trabajos_ot',   nombre:'Historial de Trabajos', desc:'Gestión de técnicos',           lcad:true  },\n" +
"    { grupo:'MANTENIMIENTO', key:'otros_mant',    nombre:'Otros',            desc:'Módulos complementarios',       lcad:true  },\n" +
"    { grupo:'ALMACÉN',       key:'inv',           nombre:'Inventario',       desc:'Catálogo de artículos',         lcad:true  },\n" +
"    { grupo:'ALMACÉN',       key:'ent_inv',       nombre:'Entradas',         desc:'Ingresos al almacén',           lcad:true  },\n" +
"    { grupo:'ALMACÉN',       key:'sal_inv',       nombre:'Salidas',          desc:'Egresos del almacén',           lcad:true  },\n" +
"    { grupo:'ALMACÉN',       key:'kardex',        nombre:'Kardex',           desc:'Movimientos por artículo',      lcad:false },\n" +
"    { grupo:'DIRECTORIO',    key:'cond',          nombre:'Personal',         desc:'Directorio operativo',          lcad:true  },\n" +
"    { grupo:'SEGURIDAD',     key:'placas',        nombre:'CheckList de Ingreso/Salidas de Unidades',desc:'Fichas técnicas', lcad:true  },\n" +
"    { grupo:'SEGURIDAD',     key:'asist',         nombre:'Tareo',            desc:'Asistencia del personal',       lcad:true  },\n" +
"    { grupo:'CONFIGURACIÓN', key:'usuarios',      nombre:'Usuarios',         desc:'Gestión de accesos',            lcad:true  },\n" +
"    { grupo:'CONFIGURACIÓN', key:'mod_auditoria', nombre:'Auditoría',        desc:'Bitácora de actividad',         lcad:true  },\n" +
"    { grupo:'CONFIGURACIÓN', key:'cfg_apariencia',nombre:'Apariencia',       desc:'Personalización visual',        lcad:true  },\n" +
"    { grupo:'CONFIGURACIÓN', key:'cfg_accesibilidad',nombre:'Accesibilidad', desc:'Ajustes de uso',                lcad:true  },\n" +
"    { grupo:'CONFIGURACIÓN', key:'cfg_idioma',    nombre:'Idioma',           desc:'Idiomas del sistema',           lcad:true  },\n" +
"    { grupo:'CONFIGURACIÓN', key:'administracion',nombre:'Administración',   desc:'Hub de administración',         lcad:true  }\n" +
"];";
c = c.replace(regexModulos, nuevosModulos);

// 2. Add onchange for l toggle
c = c.replace(
    /html \+= '<div class="dc-toggle-wrap"><input type="checkbox" class="dc-toggle" id="pt-' \+ mod\.key \+ '-l"' \+ \(lv\?' checked':''\) \+ '>/g,
    'html += \'<div class="dc-toggle-wrap"><input type="checkbox" class="dc-toggle" id="pt-\' + mod.key + \'-l"\' + (lv?\' checked\':\'\') + \' onchange="window._guCheckCascade(this, \\\'\' + mod.key + \'\\\', \\\'l\\\')">\' '
);

// 3. Add onchange for a toggle
c = c.replace(
    /html \+= '<div class="dc-toggle-wrap"><input type="checkbox" class="dc-toggle" id="pt-' \+ mod\.key \+ '-' \+ a \+ '"' \+ \(m\[a\]\?' checked':''\) \+ '>/g,
    'html += \'<div class="dc-toggle-wrap"><input type="checkbox" class="dc-toggle" id="pt-\' + mod.key + \'-\' + a + \'"\' + (m[a]?\' checked\':\'\') + \' onchange="window._guCheckCascade(this, \\\'\' + mod.key + \'\\\', \\\'\' + a + \'\\\')">\' '
);

// 4. Update guSetTab to support simulador
const guSetTabOrig = "window.guSetTab = function(tab) {\n" +
"    window._guTabActiva = tab;\n" +
"    window._guSeleccionado = null;\n" +
"    var tr = document.getElementById('gu-tab-roles');\n" +
"    var tm = document.getElementById('gu-tab-miembros');\n" +
"    if (tr) tr.classList.toggle('active', tab === 'roles');\n" +
"    if (tm) tm.classList.toggle('active', tab === 'miembros');\n" +
"    window.guRenderLista();\n" +
"    var pc = document.getElementById('guPanelContent');\n" +
"    var pa = document.getElementById('guPanelActions');\n" +
"    var pe = document.getElementById('guPanelEmpty');\n" +
"    if (pc) { pc.style.display = 'none'; pc.innerHTML = ''; }\n" +
"    if (pa) { pa.style.display = 'none'; pa.innerHTML = ''; }\n" +
"    if (pe) pe.style.display = '';\n\n" +
"    var ph = document.getElementById('top-actions-placeholder');\n" +
"    if (ph) {\n" +
"        if (tab === 'roles') {\n" +
"            ph.innerHTML = '<button class=\"btn btn-sm top-btn-reg\" style=\"background:var(--crm-accent);color:#fff;font-weight:600;border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:6px;\" onclick=\"window.guNuevoRol()\"><i class=\"bi bi-shield-plus\"></i> Registrar Rol</button>';\n" +
"        } else {\n" +
"            ph.innerHTML = '<button class=\"btn btn-sm top-btn-reg\" style=\"background:var(--crm-accent);color:#fff;font-weight:600;border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:6px;\" onclick=\"window.guNuevoMiembro()\"><i class=\"bi bi-person-plus\"></i> Registrar Usuario</button>';\n" +
"        }\n" +
"    }\n" +
"};";

const guSetTabNew = "window.guSetTab = function(tab) {\n" +
"    window._guTabActiva = tab;\n" +
"    window._guSeleccionado = null;\n" +
"    var tr = document.getElementById('gu-tab-roles');\n" +
"    var tm = document.getElementById('gu-tab-miembros');\n" +
"    var ts = document.getElementById('gu-tab-simulador');\n" +
"    if (tr) tr.classList.toggle('active', tab === 'roles');\n" +
"    if (tm) tm.classList.toggle('active', tab === 'miembros');\n" +
"    if (ts) ts.classList.toggle('active', tab === 'simulador');\n" +
"    window.guRenderLista();\n" +
"    var pc = document.getElementById('guPanelContent');\n" +
"    var pa = document.getElementById('guPanelActions');\n" +
"    var pe = document.getElementById('guPanelEmpty');\n" +
"    if (pc) { pc.style.display = 'none'; pc.innerHTML = ''; }\n" +
"    if (pa) { pa.style.display = 'none'; pa.innerHTML = ''; }\n" +
"    if (pe) pe.style.display = '';\n\n" +
"    var ph = document.getElementById('top-actions-placeholder');\n" +
"    if (ph) {\n" +
"        if (tab === 'roles') {\n" +
"            ph.innerHTML = '<button class=\"btn btn-sm top-btn-reg\" style=\"background:var(--crm-accent);color:#fff;font-weight:600;border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:6px;\" onclick=\"window.guNuevoRol()\"><i class=\"bi bi-shield-plus\"></i> Registrar Rol</button>';\n" +
"        } else if (tab === 'miembros') {\n" +
"            ph.innerHTML = '<button class=\"btn btn-sm top-btn-reg\" style=\"background:var(--crm-accent);color:#fff;font-weight:600;border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:6px;\" onclick=\"window.guNuevoMiembro()\"><i class=\"bi bi-person-plus\"></i> Registrar Usuario</button>';\n" +
"        } else {\n" +
"            ph.innerHTML = '';\n" +
"        }\n" +
"    }\n" +
"};";
c = c.replace(guSetTabOrig, guSetTabNew);

// 5. Update guRenderLista to show users in simulador
c = c.replace(/if \(window\._guTabActiva === 'miembros'\) \{/g, "if (window._guTabActiva === 'miembros' || window._guTabActiva === 'simulador') {");
c = c.replace(
    /return '<div class="gu-list-item' \+ \(isSel\?' selected':''\) \+ '" onclick="window\.guSeleccionarUsuario\('' \+ u\.id \+ ''\)">'/g,
    'return \'<div class="gu-list-item\' + (isSel?\' selected\':\'\') + \'" onclick="\' + (window._guTabActiva === \'simulador\' ? \'window.guSimularUsuario(\\\'\' + u.id + \'\\\')\' : \'window.guSeleccionarUsuario(\\\'\' + u.id + \'\\\')\') + \'">\''
);

// 6. Append Cascade & Simulator logic at the end
const extraLogic = "\n\nwindow._guCheckCascade = function(el, modKey, action) {\n" +
"    if (!el || el.classList.contains('readonly')) return;\n" +
"    var chk = el.checked;\n" +
"    \n" +
"    // Auto-activación: Si se activa c, e, d => activa l\n" +
"    if (chk && (action === 'c' || action === 'e' || action === 'd')) {\n" +
"        var lEl = document.getElementById('pt-' + modKey + '-l');\n" +
"        if (lEl && !lEl.checked) lEl.checked = true;\n" +
"    }\n" +
"    \n" +
"    // Auto-desactivación: Si se desactiva l => desactiva c, e, d\n" +
"    if (!chk && action === 'l') {\n" +
"        ['c', 'e', 'd'].forEach(function(a) {\n" +
"            var subEl = document.getElementById('pt-' + modKey + '-' + a);\n" +
"            if (subEl && subEl.checked) subEl.checked = false;\n" +
"        });\n" +
"    }\n" +
"};\n\n" +
"window.guSimularUsuario = function(id) {\n" +
"    var u = window.dataGlobalUsuarios.find(x => x.id == id);\n" +
"    if (!u) return;\n" +
"    window._guSeleccionado = { tipo:'usuario', id:u.id };\n" +
"    window.guRenderLista();\n\n" +
"    var r = window.dataGlobalRoles.find(x => x.id == u.rol_id);\n" +
"    var p = r ? (r.permisos||{}) : {};\n" +
"    var esAdmin = r && r.es_admin;\n\n" +
"    var html = '<div class=\"gu-section-header\">Simulador de Permisos Efectivos</div>'\n" +
"             + '<div style=\"font-size:0.8rem; color:var(--subtext); margin-bottom:15px;\">Viendo los permisos que tiene el usuario <b>' + _guEsc(u.nombre||u.correo) + '</b> basado en su rol <b>' + (r ? _guEsc(r.nombre) : 'Ninguno') + '</b>.</div>';\n\n" +
"    if (esAdmin) {\n" +
"        html += '<div class=\"alert alert-danger\" style=\"background:rgba(237,66,69,0.1); border:1px solid #ED4245; color:#ED4245; font-size:0.85rem; font-weight:bold;\"><i class=\"bi bi-shield-lock-fill me-2\"></i>Este usuario tiene acceso TOTAL (Administrador).</div>';\n" +
"    }\n\n" +
"    var lastGrp = '';\n" +
"    window._GU_MODULOS.forEach(function(mod) {\n" +
"        if (mod.grupo !== lastGrp) {\n" +
"            html += '<div class=\"gu-perm-group\" style=\"margin-top:10px;\">' + mod.grupo + '</div>';\n" +
"            lastGrp = mod.grupo;\n" +
"        }\n" +
"        var acc = p[mod.key] || {};\n" +
"        var l = esAdmin || acc['l'];\n" +
"        var c = esAdmin || acc['c'];\n" +
"        var e = esAdmin || acc['e'];\n" +
"        var d = esAdmin || acc['d'];\n\n" +
"        html += '<div class=\"gu-perm-row\" style=\"opacity:' + (l ? '1' : '0.5') + ';\">'\n" +
"              + '<div class=\"gu-perm-info\"><div class=\"gu-perm-name\">' + mod.nombre + '</div></div>'\n" +
"              + '<div class=\"gu-perm-actions\">';\n" +
"        if (!mod.lcad) {\n" +
"            html += '<span class=\"badge ' + (l?'bg-success':'bg-secondary') + '\" style=\"padding:5px 10px;\">Leer</span>';\n" +
"        } else {\n" +
"            html += '<span class=\"badge ' + (l?'bg-success':'bg-secondary') + '\" style=\"padding:5px 8px;margin-right:4px;\">Leer</span>'\n" +
"                  + '<span class=\"badge ' + (c?'bg-primary':'bg-secondary') + '\" style=\"padding:5px 8px;margin-right:4px;\">Crear</span>'\n" +
"                  + '<span class=\"badge ' + (e?'bg-warning text-dark':'bg-secondary') + '\" style=\"padding:5px 8px;margin-right:4px;\">Editar</span>'\n" +
"                  + '<span class=\"badge ' + (d?'bg-danger':'bg-secondary') + '\" style=\"padding:5px 8px;\">Eliminar</span>';\n" +
"        }\n" +
"        html += '</div></div>';\n" +
"    });\n\n" +
"    document.getElementById('guPanelEmpty').style.display = 'none';\n" +
"    var pc = document.getElementById('guPanelContent');\n" +
"    pc.innerHTML = html;\n" +
"    pc.style.display = 'block';\n" +
"    var pa = document.getElementById('guPanelActions');\n" +
"    if (pa) pa.style.display = 'none';\n\n" +
"    if(window.innerWidth <= 767) {\n" +
"        document.getElementById('guOffcanvasContent').innerHTML = pc.innerHTML;\n" +
"        document.getElementById('guOffcanvasActions').style.display = 'none';\n" +
"        var bsOffcanvas = new bootstrap.Offcanvas(document.getElementById('offcanvasGU'));\n" +
"        bsOffcanvas.show();\n" +
"    }\n" +
"};\n";

c += extraLogic;

fs.writeFileSync('modulos/sistema/usuarios/logica.js', c);
console.log("Success patch.js");
