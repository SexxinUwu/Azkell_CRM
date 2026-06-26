const fs = require('fs');
let logica = fs.readFileSync('modulos/sistema/usuarios/logica.js', 'utf8');

// Update guCargarTodo mapping
const mappingOld = "return { id:r[0], nombre:r[1], cargo:r[2], correo:r[3], rol_label:r[4],\n                     estado:r[5], password:r[6], permisos:r[7], rol_id:r[8], rol_color:r[9],\n                     ultimo_acceso:r[10], ultimo_ip:r[11], ultimo_dispositivo:r[12] };";
const mappingNew = "let rIds = []; try { rIds = JSON.parse(r[13]); } catch(e){} if(!Array.isArray(rIds)) { if (r[8]) rIds = [r[8]]; else rIds = []; }\n" +
"            return { id:r[0], nombre:r[1], cargo:r[2], correo:r[3], rol_label:r[4],\n                     estado:r[5], password:r[6], permisos:r[7], rol_id:r[8], rol_color:r[9],\n                     ultimo_acceso:r[10], ultimo_ip:r[11], ultimo_dispositivo:r[12], roles_ids:rIds };";
logica = logica.replace(mappingOld, mappingNew);

const commentOld = "// fila: [0]id [1]nombre [2]cargo [3]correo [4]rol_label [5]estado [6]password_visible [7]permisos [8]rol_id [9]rol_color [10]ultimo_acceso [11]ultimo_ip [12]ultimo_dispositivo";
const commentNew = "// fila: [0]id [1]nombre [2]cargo [3]correo [4]rol_label [5]estado [6]password_visible [7]permisos [8]rol_id [9]rol_color [10]ultimo_acceso [11]ultimo_ip [12]ultimo_dispositivo [13]roles_ids";
logica = logica.replace(commentOld, commentNew);

// Update _guBuildUserPanel
const rolOld = "    html += '<div class=\"gu-section-header\" style=\"margin-top:18px;\">Rol Asignado</div>'\n" +
"        + '<div style=\"font-size:.75rem;color:var(--subtext);margin:8px 0 6px;\">El usuario hereda los permisos del rol seleccionado.</div>'\n" +
"        + '<select id=\"guUserRolId\" class=\"form-select\">'\n" +
"        + '<option value=\"\">— Sin rol asignado —</option>';\n" +
"    window.dataGlobalRoles.forEach(function(r) {\n" +
"        html += '<option value=\"' + r.id + '\"' + (user.rol_id==r.id?' selected':'') + '>'\n" +
"            + _guEsc(r.nombre) + (r.es_admin?' (Administrador)':'') + '</option>';\n" +
"    });\n" +
"    html += '</select>';";

const rolNew = "    html += '<div class=\"gu-section-header\" style=\"margin-top:18px;\">Roles Asignados</div>'\n" +
"        + '<div style=\"font-size:.75rem;color:var(--subtext);margin:8px 0 6px;\">Puedes seleccionar múltiples roles usando Ctrl (o Cmd en Mac).</div>'\n" +
"        + '<select id=\"guUserRolId\" class=\"form-select\" multiple size=\"5\">'\n" +
"        + '<option value=\"\" ' + ((!user.roles_ids || user.roles_ids.length === 0) ? 'selected' : '') + '>— Sin roles asignados —</option>';\n" +
"    var rolesAsignados = user.roles_ids || (user.rol_id ? [user.rol_id] : []);\n" +
"    window.dataGlobalRoles.forEach(function(r) {\n" +
"        html += '<option value=\"' + r.id + '\"' + (rolesAsignados.includes(r.id)?' selected':'') + '>'\n" +
"            + _guEsc(r.nombre) + (r.es_admin?' (Administrador)':'') + '</option>';\n" +
"    });\n" +
"    html += '</select>';";

logica = logica.replace(rolOld, rolNew);

// Update guGuardarUsuario to send roles_ids
const guardarOld = "        var obj = {\n" +
"            id: user.id,\n" +
"            nombre: nom, cargo: car, correo: corr, estado: est,\n" +
"            rol_id: rId, password: pw, es_reset: false\n" +
"        };";

const guardarNew = "        var selectRoles = document.getElementById('guUserRolId');\n" +
"        var arrRoles = [];\n" +
"        if (selectRoles) {\n" +
"            for (var i = 0; i < selectRoles.options.length; i++) {\n" +
"                if (selectRoles.options[i].selected && selectRoles.options[i].value) {\n" +
"                    arrRoles.push(parseInt(selectRoles.options[i].value));\n" +
"                }\n" +
"            }\n" +
"        }\n" +
"        var firstRol = arrRoles.length > 0 ? arrRoles[0] : null;\n\n" +
"        var obj = {\n" +
"            id: user.id,\n" +
"            nombre: nom, cargo: car, correo: corr, estado: est,\n" +
"            rol_id: firstRol, roles_ids: JSON.stringify(arrRoles), password: pw, es_reset: false\n" +
"        };";

logica = logica.replace(guardarOld, guardarNew);

// In simulator, use the multiple roles logic. Wait, the simulator just reads `user.permisos` because they are already merged by the backend!
// I just need to update how it displays the roles.
const simOld = "    var r = window.dataGlobalRoles.find(x => x.id == u.rol_id);\n" +
"    var p = r ? (r.permisos||{}) : {};\n" +
"    var esAdmin = r && r.es_admin;\n\n" +
"    var html = '<div class=\"gu-section-header\">Simulador de Permisos Efectivos</div>'\n" +
"             + '<div style=\"font-size:0.8rem; color:var(--subtext); margin-bottom:15px;\">Viendo los permisos que tiene el usuario <b>' + _guEsc(u.nombre||u.correo) + '</b> basado en su rol <b>' + (r ? _guEsc(r.nombre) : 'Ninguno') + '</b>.</div>';";

const simNew = "    var misRoles = (u.roles_ids || []).map(id => window.dataGlobalRoles.find(x => x.id == id)).filter(Boolean);\n" +
"    var nombresRoles = misRoles.map(x => x.nombre).join(', ') || 'Ninguno';\n" +
"    var esAdmin = misRoles.some(x => x.es_admin);\n" +
"    var p = {};\n" +
"    try { p = (typeof u.permisos === 'string') ? JSON.parse(u.permisos) : u.permisos; } catch(e) {}\n\n" +
"    var html = '<div class=\"gu-section-header\">Simulador de Permisos Efectivos</div>'\n" +
"             + '<div style=\"font-size:0.8rem; color:var(--subtext); margin-bottom:15px;\">Viendo los permisos que tiene el usuario <b>' + _guEsc(u.nombre||u.correo) + '</b> basado en sus roles <b>' + _guEsc(nombresRoles) + '</b>.</div>';";

logica = logica.replace(simOld, simNew);


fs.writeFileSync('modulos/sistema/usuarios/logica.js', logica);
console.log('Frontend logic updated.');
