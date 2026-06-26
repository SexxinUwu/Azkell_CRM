const fs = require('fs');

// Patch routes/legacy.js
let legacy = fs.readFileSync('routes/legacy.js', 'utf8');

const queryStart = "SELECT u.idUsuario, u.nombre, u.cargo, u.correo, u.password, u.rol,\n                   u.estado, u.permisos_json, u.rol_id,\n                   u.ultimo_acceso, u.ultimo_ip, u.ultimo_dispositivo,\n                   r.nombre AS rol_nombre, r.color AS rol_color, r.es_admin AS rol_es_admin\n            FROM usuarios u\n            LEFT JOIN roles r ON u.rol_id = r.id";

const queryNew = "SELECT u.idUsuario, u.nombre, u.cargo, u.correo, u.password, u.rol,\n                   u.estado, u.permisos_json, u.rol_id, u.roles_ids,\n                   u.ultimo_acceso, u.ultimo_ip, u.ultimo_dispositivo\n            FROM usuarios u";

legacy = legacy.replace(queryStart, queryNew);

const mapOld = "db.query(query, (err, results) => {\n            if (err) return res.status(500).json({ data: \"Error BD: \" + err.message });\n            const filas = results.map(r => {\n                let permisosFinales = {};\n                let correoMin = (r.correo || '').trim().toLowerCase();\n                let rolLabel = r.rol_nombre || r.rol || 'Personalizado';\n                if (correoMin === 'admin@azkell.com') {\n                    permisosFinales = { admin: true };\n                    rolLabel = 'Fundador';\n                } else if (r.rol_id && r.rol_es_admin) {\n                    permisosFinales = { admin: true };\n                } else {\n                    try {\n                        let raw = r.permisos_json || '{}';\n                        permisosFinales = (typeof raw === 'string') ? JSON.parse(raw) : raw;\n                        if (typeof permisosFinales === 'string') permisosFinales = JSON.parse(permisosFinales);\n                    } catch (e) { permisosFinales = {}; }\n                }\n                // [0]id [1]nombre [2]cargo [3]correo [4]rol_label [5]estado [6]password_visible [7]permisos [8]rol_id [9]rol_color [10]ultimo_acceso [11]ultimo_ip [12]ultimo_dispositivo\n                return [\n                    r.idUsuario, r.nombre, r.cargo, r.correo,\n                    rolLabel, r.estado, r.password_visible || '',\n                    JSON.stringify(permisosFinales), r.rol_id || null, r.rol_color || null,\n                    r.ultimo_acceso || null, r.ultimo_ip || null, r.ultimo_dispositivo || null\n                ];\n            });\n            return res.json({ data: filas });\n        });";

const mapNew = "db.query('SELECT * FROM roles', (err2, rolesResults) => {\n            if (err2) return res.status(500).json({ data: \"Error BD Roles: \" + err2.message });\n            db.query(query, (err, results) => {\n                if (err) return res.status(500).json({ data: \"Error BD: \" + err.message });\n                const allRoles = rolesResults || [];\n                const filas = results.map(r => {\n                    let permisosFinales = {};\n                    let correoMin = (r.correo || '').trim().toLowerCase();\n                    \n                    // Parse roles_ids\n                    let rolesIds = [];\n                    try {\n                        if (r.roles_ids) rolesIds = JSON.parse(r.roles_ids);\n                    } catch(e) {}\n                    if (!Array.isArray(rolesIds)) {\n                        rolesIds = r.rol_id ? [r.rol_id] : [];\n                    }\n                    \n                    let myRoles = allRoles.filter(role => rolesIds.includes(role.id));\n                    let rolLabel = myRoles.map(x => x.nombre).join(', ') || r.rol || 'Personalizado';\n                    let rolColor = myRoles.length > 0 ? myRoles[0].color : null;\n                    let isAdmin = myRoles.some(x => x.es_admin);\n\n                    if (correoMin === 'admin@azkell.com') {\n                        permisosFinales = { admin: true };\n                        rolLabel = 'Fundador';\n                    } else if (isAdmin) {\n                        permisosFinales = { admin: true };\n                    } else {\n                        try {\n                            let base = {};\n                            myRoles.forEach(rl => {\n                                try {\n                                    let rp = typeof rl.permisos_json === 'string' ? JSON.parse(rl.permisos_json) : rl.permisos_json;\n                                    for(let k in rp) {\n                                        if (!base[k]) base[k] = {};\n                                        if (rp[k].l) base[k].l = true;\n                                        if (rp[k].c) base[k].c = true;\n                                        if (rp[k].e) base[k].e = true;\n                                        if (rp[k].d) base[k].d = true;\n                                    }\n                                } catch(e) {}\n                            });\n                            let raw = r.permisos_json || '{}';\n                            let personal = (typeof raw === 'string') ? JSON.parse(raw) : raw;\n                            if (typeof personal === 'string') personal = JSON.parse(personal);\n                            for(let k in personal) {\n                                if (!base[k]) base[k] = {};\n                                if (personal[k].l) base[k].l = true;\n                                if (personal[k].c) base[k].c = true;\n                                if (personal[k].e) base[k].e = true;\n                                if (personal[k].d) base[k].d = true;\n                            }\n                            permisosFinales = base;\n                        } catch (e) { permisosFinales = {}; }\n                    }\n                    // [0]id [1]nombre [2]cargo [3]correo [4]rol_label [5]estado [6]password_visible [7]permisos [8]rol_id [9]rol_color [10]ultimo_acceso [11]ultimo_ip [12]ultimo_dispositivo [13]roles_ids\n                    return [\n                        r.idUsuario, r.nombre, r.cargo, r.correo,\n                        rolLabel, r.estado, r.password_visible || '',\n                        JSON.stringify(permisosFinales), rolesIds.length > 0 ? rolesIds[0] : null, rolColor,\n                        r.ultimo_acceso || null, r.ultimo_ip || null, r.ultimo_dispositivo || null, JSON.stringify(rolesIds)\n                    ];\n                });\n                return res.json({ data: filas });\n            });\n        });";

legacy = legacy.replace(mapOld, mapNew);

// Update logic for GuardarUsuario
// Find: const sqlUpdate = "UPDATE usuarios SET nombre=?, cargo=?, correo=?, password=?, password_visible=?, estado=?, permisos_json=?, rol=?, rol_id=? WHERE idUsuario=?";
// Replace: rol_id=?, roles_ids=?
legacy = legacy.replace(
    'const sqlUpdate = "UPDATE usuarios SET nombre=?, cargo=?, correo=?, password=?, password_visible=?, estado=?, permisos_json=?, rol=?, rol_id=? WHERE idUsuario=?";',
    'const sqlUpdate = "UPDATE usuarios SET nombre=?, cargo=?, correo=?, password=?, password_visible=?, estado=?, permisos_json=?, rol=?, rol_id=?, roles_ids=? WHERE idUsuario=?";'
);
legacy = legacy.replace(
    'db.query(sqlUpdate, [nombre, cargo, correo, password, passwordPlain, estado, permisos, rol, rolId, idFinal]',
    'db.query(sqlUpdate, [nombre, cargo, correo, password, passwordPlain, estado, permisos, rol, rolId, req.body.roles_ids || "[]", idFinal]'
);

legacy = legacy.replace(
    'const sqlUpdate = "UPDATE usuarios SET nombre=?, cargo=?, correo=?, estado=?, permisos_json=?, rol=?, rol_id=? WHERE idUsuario=?";',
    'const sqlUpdate = "UPDATE usuarios SET nombre=?, cargo=?, correo=?, estado=?, permisos_json=?, rol=?, rol_id=?, roles_ids=? WHERE idUsuario=?";'
);
legacy = legacy.replace(
    'db.query(sqlUpdate, [nombre, cargo, correo, estado, permisos, rol, rolId, idFinal]',
    'db.query(sqlUpdate, [nombre, cargo, correo, estado, permisos, rol, rolId, req.body.roles_ids || "[]", idFinal]'
);

legacy = legacy.replace(
    'const sqlInsert = "INSERT INTO usuarios (idUsuario, nombre, cargo, correo, password, password_visible, rol, estado, permisos_json, rol_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";',
    'const sqlInsert = "INSERT INTO usuarios (idUsuario, nombre, cargo, correo, password, password_visible, rol, estado, permisos_json, rol_id, roles_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";'
);
legacy = legacy.replace(
    'db.query(sqlInsert, [idFinal, nombre, cargo, correo, password, passwordPlain, rol, estado, permisos, rolId]',
    'db.query(sqlInsert, [idFinal, nombre, cargo, correo, password, passwordPlain, rol, estado, permisos, rolId, req.body.roles_ids || "[]"]'
);


fs.writeFileSync('routes/legacy.js', legacy);
console.log('Legacy updated.');
