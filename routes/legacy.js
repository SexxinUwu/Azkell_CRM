const express = require('express');
const router = express.Router();


module.exports = (db, broadcast, logAudit) => {

router.post('/:metodo', async (req, res) => {
    const metodo = req.params.metodo;
    console.log(`📡 El sistema solicitó: ${metodo}`);

    if (metodo === 'obtenerDatosPlacas') {
        const sql = `
            SELECT
                placa, cliente, ruc_dni, marca, modelo_uts, tipo, sub_tipo, color,
                nro_motor, nro_caja, nro_corona, nro_vin, configuracion, anio,
                combustible, carga_util, peso_neto, peso_bruto, estado, uts, motora, llantas, en_uso
            FROM placas
        `;
        db.query(sql, (err, results) => {
            if (err) { console.error("Error leyendo placas:", err); return res.json({ data: [] }); }
            console.log(`✅ Se encontraron ${results.length} placas en MySQL`);

            const data = results.map(r => [
                r.placa || '',           // 0: Placa
                r.cliente || '',         // 1: Cliente
                r.ruc_dni || '',         // 2: Ruc/ Dni
                r.marca || '',           // 3: Marca
                r.modelo_uts || '',      // 4: Modelo
                r.tipo || '',            // 5: Tipo
                r.sub_tipo || '',        // 6: Sub tipo
                r.color || '',           // 7: Color
                r.nro_motor || '',       // 8: Nº Motor
                r.nro_caja || '',        // 9: Nº Caja
                r.nro_corona || '',      // 10: Nº Corona
                r.nro_vin || '',         // 11: Nº VIN
                r.configuracion || '',   // 12: Configuracion
                r.anio || '',            // 13: Año
                r.combustible || '',     // 14: Combustible
                r.carga_util || '',      // 15: Carga Util
                r.peso_neto || '',       // 16: Peso Neto
                r.peso_bruto || '',      // 17: Peso Bruto
                r.estado || 'Inactiva',  // 18: Estado
                r.uts || '',             // 19: Uts
                r.motora || '',          // 20: Motora O No Motora
                r.llantas || '',         // 21: Llantas
                r.en_uso || ''           // 22: En Uso?
            ]);
            return res.json({ data });
        });
        return;
    }

    if (metodo === 'obtenerDatosFleetrun') {
        db.query('SELECT * FROM fleetrun', (err, results) => {
            if (err) return res.json({ data: [] });
            // fila[3] debe ser fecha DD/MM/YYYY — el módulo fleetrun la usa para ordenar y mostrar
            const _fmtFecha = (f) => {
                if (!f) return '';
                const d = f instanceof Date ? f : new Date(String(f));
                if (!isNaN(d.getTime())) {
                    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
                }
                return String(f); // ya viene como "DD/MM/YYYY" (registros legacy)
            };
            const data = results.map(r => [
                r.idRegistro || r.IDREGISTRO || '',                        // [0] ID
                r.fecha || r.FECHA || '',                                   // [1] fecha ISO/raw
                r.mes || r.MES || '',                                       // [2] mes
                _fmtFecha(r.fecha || r.FECHA),                             // [3] fecha DD/MM/YYYY ← fix
                r.placa || r.PLACA || '', r.marca || r.MARCA || '',
                r.dueno || r.DUENO || '', r.uts || r.UTS || '',
                r.tipo_mp || r.TIPO_MP || '',
                r.km_actual || r.KM_ACTUAL || '',
                r.frecuencia_km || r.FRECUENCIA_KM || '',
                r.km_proximo || r.KM_PROXIMO || '',
                r.observacion || r.OBSERVACION || '',
                r.tecnico || r.TECNICO || '',
                r.km_gps || r.KM_GPS || '',
                r.id || 0                                                   // [15] DB auto-increment (tiebreaker de orden de inserción)
            ]);
            return res.json({ data });
        });
        return;
    }

    if (metodo === 'obtenerDatosUsuarios') {
        const query = `
            SELECT u.idUsuario, u.nombre, u.cargo, u.correo, u.password, u.rol,
                   u.estado, u.permisos_json, u.rol_id,
                   u.ultimo_acceso, u.ultimo_ip, u.ultimo_dispositivo,
                   r.nombre AS rol_nombre, r.color AS rol_color, r.es_admin AS rol_es_admin
            FROM usuarios u
            LEFT JOIN roles r ON u.rol_id = r.id`;
        db.query(query, (err, results) => {
            if (err) return res.status(500).json({ data: "Error BD: " + err.message });
            const filas = results.map(r => {
                let permisosFinales = {};
                let correoMin = (r.correo || '').trim().toLowerCase();
                let rolLabel = r.rol_nombre || r.rol || 'Personalizado';
                if (correoMin === 'admin@azkell.com') {
                    permisosFinales = { admin: true };
                    rolLabel = 'Fundador';
                } else if (r.rol_id && r.rol_es_admin) {
                    permisosFinales = { admin: true };
                } else {
                    try {
                        let raw = r.permisos_json || '{}';
                        permisosFinales = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                        if (typeof permisosFinales === 'string') permisosFinales = JSON.parse(permisosFinales);
                    } catch (e) { permisosFinales = {}; }
                }
                // [0]id [1]nombre [2]cargo [3]correo [4]rol_label [5]estado [6]password_visible [7]permisos [8]rol_id [9]rol_color [10]ultimo_acceso [11]ultimo_ip [12]ultimo_dispositivo
                return [
                    r.idUsuario, r.nombre, r.cargo, r.correo,
                    rolLabel, r.estado, r.password_visible || '',
                    JSON.stringify(permisosFinales), r.rol_id || null, r.rol_color || null,
                    r.ultimo_acceso || null, r.ultimo_ip || null, r.ultimo_dispositivo || null
                ];
            });
            return res.json({ data: filas });
        });
        return;
    }

    if (metodo === 'obtenerDatosInspecciones') {
        db.query('SELECT * FROM inspecciones', (err, results) => {
            if (err) return res.json({ data: [] });
            const _fmtFechaInsp = (f) => {
                if (!f) return '';
                const d = f instanceof Date ? f : new Date(String(f).split('T')[0]);
                if (!isNaN(d.getTime())) {
                    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
                }
                return String(f);
            };
            const data = results.map(r => Object.assign({}, r, {
                fecha_ingreso: _fmtFechaInsp(r.fecha_ingreso)
            }));
            return res.json({ data });
        });
        return;
    }

    if (metodo === 'obtenerDatosStatusFlota') {
        db.query('SELECT * FROM status_flota', (err, results) => {
            if (err) return res.json({ data: [] });
            const data = results.map(r => [
                r.idRegistro || '', r.fecha || '', r.corte || '',
                r.unidad_motora || '', r.unidad_no_motora || '',
                r.cliente_motora || '', r.cliente_nomotora || '',
                r.zona || '', r.conductor || '',
                r.estado || '', r.observaciones || '', r.kilometraje || '', r.foto || ''
            ]);
            return res.json({ data });
        });
        return;
    }

    if (metodo === 'guardarStatusFlota') {
        const form = req.body.form || {};
        const id = form.sf_id;
        const fecha = form.sf_fecha;
        const corte = form.sf_corte;
        const motora = form.sf_motora || "";
        const nomotora = form.sf_nomotora || "";
        const cliMotora = form.sf_cliente_motora || "";
        const cliNoMotora = form.sf_cliente_nomotora || "";
        const zona = form.sf_zona || "";
        const conductor = form.sf_conductor || "";
        const estado = form.sf_estado || "";
        const obs = form.sf_obs || "";
        const km = form.sf_kilometraje ? parseInt(form.sf_kilometraje) : null;
        const usuario = form.usuarioAutor || "";

        const query = `
            INSERT INTO status_flota
            (idRegistro, fecha, corte, unidad_motora, unidad_no_motora, cliente_motora, cliente_nomotora, zona, conductor, estado, observaciones, kilometraje, usuario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            fecha=?, corte=?, unidad_motora=?, unidad_no_motora=?, cliente_motora=?, cliente_nomotora=?, zona=?, conductor=?, estado=?, observaciones=?, kilometraje=?, usuario=?
        `;
        const values = [id, fecha, corte, motora, nomotora, cliMotora, cliNoMotora, zona, conductor, estado, obs, km, usuario,
                        fecha, corte, motora, nomotora, cliMotora, cliNoMotora, zona, conductor, estado, obs, km, usuario];
        db.query(query, values, (err) => {
            if (err) { console.error("❌ Error BD Status Flota:", err); return res.json({ data: "Error al guardar en Base de Datos" }); }
            console.log("✅ Status Flota guardado correctamente");
            broadcast('status', metodo);
            return res.json({ data: "Éxito" });
        });
        return;
    }

    if (metodo === 'guardarInspeccion') {
        const datos = req.body.form || {};
        const isNew = !datos.id;

        const ejecutarGuardado = (idFinal) => {
            const query = `
                INSERT INTO inspecciones
                (id, placa, fecha_ingreso, cliente, tecnico, km_tablero, dias_propuestos, detalles_json, url_firma, id_ot)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                placa=?, fecha_ingreso=?, cliente=?, tecnico=?, km_tablero=?, dias_propuestos=?, detalles_json=?, url_firma=?, id_ot=?
            `;
            const values = [
                idFinal, datos.placa, datos.fecha_ingreso || null, datos.cliente, datos.tecnico,
                parseInt(datos.km_tablero) || 0, parseInt(datos.dias_propuestos) || 0, datos.detalles_json, datos.firma_base64, datos.id_ot || null,
                datos.placa, datos.fecha_ingreso || null, datos.cliente, datos.tecnico,
                parseInt(datos.km_tablero) || 0, parseInt(datos.dias_propuestos) || 0, datos.detalles_json, datos.firma_base64, datos.id_ot || null
            ];
            db.query(query, values, (err) => {
                if (err) { console.error("Error BD Inspecciones:", err); return res.json({ data: "Error al guardar inspección" }); }
                console.log("✅ Inspección guardada correctamente");
                broadcast('inspecciones', metodo);
                const usuario = (req.body && req.body.usuario) || datos.tecnico || 'sistema';
                logAudit(usuario, 'inspecciones', isNew ? 'CREÓ' : 'MODIFICÓ', `${datos.placa || '?'} · ${datos.fecha_ingreso || '?'}`);
                return res.json({ data: "Éxito", id: idFinal });
            });
        };

        if (isNew) {
            const anio = new Date().getFullYear();
            const prefix = 'INSP';
            const regex = `^${prefix}-${anio}-[0-9]{4}$`;
            db.query(`SELECT MAX(id) AS ultimo FROM inspecciones WHERE id REGEXP ?`, [regex], (err, rows) => {
                let nextId = `${prefix}-${anio}-0001`;
                if (!err && rows.length && rows[0].ultimo) {
                    const parts = String(rows[0].ultimo).split('-');
                    const num = parseInt(parts[parts.length - 1], 10) || 0;
                    nextId = `${prefix}-${anio}-${String(num + 1).padStart(4, '0')}`;
                }
                ejecutarGuardado(nextId);
            });
        } else {
            ejecutarGuardado(datos.id);
        }
        return;
    }

    if (metodo === 'eliminarDocumento') {
        const { id, ids, coleccion } = req.body;

        const listaIds = ids && ids.length > 0 ? ids : (id ? [id] : []);
        if (listaIds.length === 0) return res.json({ data: "No hay registros para procesar" });

        let sql = '';

        if (coleccion === 'Placas') sql = 'DELETE FROM placas WHERE placa IN (?)';
        else if (coleccion === 'Inspecciones') sql = 'DELETE FROM inspecciones WHERE id IN (?)';
        else if (coleccion === 'Fleetrun') sql = 'DELETE FROM fleetrun WHERE idRegistro IN (?)';
        else if (coleccion === 'StatusFlota') sql = 'DELETE FROM status_flota WHERE idRegistro IN (?)';
        else if (coleccion === 'Usuarios') sql = 'DELETE FROM usuarios WHERE idUsuario IN (?)';

        if (!sql) return res.json({ data: "Colección no válida" });

        db.query(sql, [listaIds], (err) => {
            if (err) { console.error("❌ Error en BD:", err); return res.json({ data: "Error al procesar registro" }); }
            console.log(`✅ Eliminados definitivamente ${listaIds.length} registros de ${coleccion}`);
            const COLECCION_MODULO = { Placas:'placas', Inspecciones:'inspecciones', Fleetrun:'fleetrun', StatusFlota:'status', Usuarios:'usuarios' };
            broadcast(COLECCION_MODULO[coleccion] || coleccion.toLowerCase(), 'eliminar');
            const usuario = (req.body && req.body.usuario) || 'sistema';
            logAudit(usuario, COLECCION_MODULO[coleccion] || coleccion.toLowerCase(), 'ELIMINÓ', `${listaIds.length} reg. de ${coleccion}`);

            // Al eliminar Fleetrun: revertir planes Completadas que referenciaban esos registros
            if (coleccion === 'Fleetrun' && listaIds.length > 0) {
                db.query(
                    `UPDATE planificacion
                     SET estado = 'Programada',
                         fleetrun_id_ejecutado = NULL,
                         fecha_real_ejecucion = NULL,
                         km_real_ejecucion = NULL
                     WHERE fleetrun_id_ejecutado IN (?) AND estado = 'Completada'`,
                    [listaIds],
                    (errRev) => {
                        if (errRev) console.error('⚠️ Error al revertir planificación tras eliminar Fleetrun:', errRev.message);
                        else broadcast('planificacion', 'revertir');
                    }
                );
            }

            return res.json({ data: "Éxito" });
        });
        return;
    }

    if (metodo === 'guardarUsuario' || metodo === 'actualizarUsuario') {
        const form = req.body.args[0];
        const isEdit = (form.idUsuarioEdit && form.idUsuarioEdit.trim() !== '') ? true : false;

        const ejecutarGuardado = async (idFinal) => {
            const nombre = form.nombreUsuarioEdit || '';
            const cargo = form.cargoUsuarioEdit || '';
            const correo = form.correoUsuarioEdit || '';
            const passwordPlain = form.passwordUsuarioEdit || '';
            const password = passwordPlain ? await bcrypt.hash(passwordPlain, 10) : '';
            let estado = form.estadoUsuarioEdit || 'Activo';
            let permisos = form.permisos_json || "{}";
            let rol = "Personalizado";
            const rolIdRaw = form.rol_id || null;
            const rolId = (rolIdRaw && rolIdRaw !== '' && rolIdRaw !== 'null') ? parseInt(rolIdRaw) || null : null;

            if (correo.trim().toLowerCase() === 'admin@azkell.com') {
                permisos = JSON.stringify({ admin: true });
                estado = "Activo"; rol = "Fundador";
            }
            if (typeof permisos === 'object') permisos = JSON.stringify(permisos);

            if (isEdit) {
                if (passwordPlain) {
                    const sqlUpdate = "UPDATE usuarios SET nombre=?, cargo=?, correo=?, password=?, password_visible=?, estado=?, permisos_json=?, rol=?, rol_id=?, roles_ids=? WHERE idUsuario=?";
                    db.query(sqlUpdate, [nombre, cargo, correo, password, passwordPlain, estado, permisos, rol, rolId, req.body.roles_ids || "[]", idFinal], (err) => {
                        if (err) return res.json({ data: "Error BD: " + err.message });
                        broadcast('usuarios', 'actualizar');
                        return res.json({ data: "Éxito" });
                    });
                } else {
                    const sqlUpdate = "UPDATE usuarios SET nombre=?, cargo=?, correo=?, estado=?, permisos_json=?, rol=?, rol_id=?, roles_ids=? WHERE idUsuario=?";
                    db.query(sqlUpdate, [nombre, cargo, correo, estado, permisos, rol, rolId, req.body.roles_ids || "[]", idFinal], (err) => {
                        if (err) return res.json({ data: "Error BD: " + err.message });
                        broadcast('usuarios', 'actualizar');
                        return res.json({ data: "Éxito" });
                    });
                }
            } else {
                const sqlInsert = "INSERT INTO usuarios (idUsuario, nombre, cargo, correo, password, password_visible, rol, estado, permisos_json, rol_id, roles_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                db.query(sqlInsert, [idFinal, nombre, cargo, correo, password, passwordPlain, rol, estado, permisos, rolId, req.body.roles_ids || "[]"], (err) => {
                    if (err) return res.json({ data: "Error BD: " + err.message });
                    broadcast('usuarios', 'guardar');
                    return res.json({ data: "Éxito" });
                });
            }
        };

        if (isEdit) {
            ejecutarGuardado(form.idUsuarioEdit);
        } else {
            db.query("SELECT idUsuario FROM usuarios", (err, results) => {
                let maxId = 1000;
                if (!err && results) {
                    results.forEach(r => {
                        if (r.idUsuario && r.idUsuario.startsWith('USR-')) {
                            let num = parseInt(r.idUsuario.split('-')[1]);
                            if (!isNaN(num) && num > maxId) maxId = num;
                        }
                    });
                }
                ejecutarGuardado(`USR-${maxId + 1}`);
            });
        }
        return;
    }

    if (metodo === 'guardarPlaca' || metodo === 'actualizarPlaca') {
        const form = req.body.args[0];
        const isEdit = metodo === 'actualizarPlaca';

        // Extracción de las 23 variables del formulario HTML
        const rawPlaca = isEdit ? form.editP_placa : form.p_placa;
        const placa = (rawPlaca || '').toString().trim().substring(0, 100).toUpperCase();
        const cliente = isEdit ? form.editP_cliente : form.p_cliente;
        const ruc = isEdit ? form.editP_ruc : form.p_ruc;
        const marca = isEdit ? form.editP_marca : form.p_marca;
        const modelo = isEdit ? form.editP_modelo : form.p_modelo;
        const tipo = isEdit ? form.editP_tipo : form.p_tipo;
        const sub_tipo = isEdit ? form.editP_sub_tipo : form.p_sub_tipo;
        const color = isEdit ? form.editP_color : form.p_color;
        const nro_motor = isEdit ? form.editP_nro_motor : form.p_nro_motor;
        const nro_caja = isEdit ? form.editP_nro_caja : form.p_nro_caja;
        const nro_corona = isEdit ? form.editP_nro_corona : form.p_nro_corona;
        const nro_vin = isEdit ? form.editP_nro_vin : form.p_nro_vin;
        const conf = isEdit ? form.editP_conf : form.p_conf;
        const anio = isEdit ? form.editP_anio : form.p_anio;
        const comb = isEdit ? form.editP_comb : form.p_comb;
        const carga_util = isEdit ? form.editP_carga_util : form.p_carga_util;
        const peso_neto = isEdit ? form.editP_peso_neto : form.p_peso_neto;
        const peso_bruto = isEdit ? form.editP_peso_bruto : form.p_peso_bruto;
        const estado = isEdit ? form.editP_estado : form.p_estado;
        const uts = isEdit ? form.editP_uts : form.p_uts;
        const motora = isEdit ? form.editP_motora : form.p_motora;
        const llantas = isEdit ? form.editP_llantas : form.p_llantas;
        const enuso = isEdit ? form.editP_enuso : form.p_enuso;

        const query = `
            INSERT INTO placas (placa, cliente, ruc_dni, marca, modelo_uts, tipo, sub_tipo, color, nro_motor, nro_caja, nro_corona, nro_vin, configuracion, anio, combustible, carga_util, peso_neto, peso_bruto, estado, uts, motora, llantas, en_uso)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            cliente=?, ruc_dni=?, marca=?, modelo_uts=?, tipo=?, sub_tipo=?, color=?, nro_motor=?, nro_caja=?, nro_corona=?, nro_vin=?, configuracion=?, anio=?, combustible=?, carga_util=?, peso_neto=?, peso_bruto=?, estado=?, uts=?, motora=?, llantas=?, en_uso=?
        `;

        // 23 valores para INSERT, luego 22 (sin placa) para ON DUPLICATE KEY UPDATE
        const valores = [placa, cliente, ruc, marca, modelo, tipo, sub_tipo, color, nro_motor, nro_caja, nro_corona, nro_vin, conf, anio, comb, carga_util, peso_neto, peso_bruto, estado, uts, motora, llantas, enuso];
        const valoresUpdate = valores.slice(1);

        db.query(query, [...valores, ...valoresUpdate], (err) => {
            if (err) return res.json({ data: "Error BD: " + err.message });
            broadcast('placas', metodo);
            const usuario = (req.body && req.body.usuario) || 'sistema';
            logAudit(usuario, 'placas', metodo === 'actualizarPlaca' ? 'MODIFICÓ' : 'CREÓ', `${placa} · ${cliente || '?'}`);
            return res.json({ data: "Éxito" });
        });
        return;
    }

    if (metodo === 'guardarFleetrun' || metodo === 'actualizarFleetrun') {
        const form = req.body.args[0];
        const isEdit = metodo === 'actualizarFleetrun';

        const _ejecutarGuardado = (idFinal) => {
            const values = [
                idFinal,
                isEdit ? form.editF_fecha : form.f_fecha,
                isEdit ? form.editF_mes   : form.f_mes,
                isEdit ? form.editF_anio  : form.f_anio,
                ((isEdit ? form.editF_placa : form.f_placa) || '').toUpperCase(),
                isEdit ? form.editF_marca   : form.f_marca,
                isEdit ? form.editF_dueno   : form.f_dueno,
                isEdit ? form.editF_uts     : form.f_uts,
                isEdit ? form.editF_tipomp  : form.f_tipomp,
                isEdit ? form.editF_kmact   : form.f_kmact,
                isEdit ? form.editF_freckm  : form.f_freckm,
                isEdit ? form.editF_kmprox  : form.f_kmprox,
                isEdit ? form.editF_obs     : form.f_obs,
                isEdit ? form.editF_tec     : form.f_tec,
                isEdit ? form.editF_kmgps   : form.f_kmgps
            ];
            const query = `
                INSERT INTO fleetrun (idRegistro, fecha, mes, anio, placa, marca, dueno, uts, tipo_mp, km_actual, frecuencia_km, km_proximo, observacion, tecnico, km_gps)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                fecha=?, mes=?, anio=?, placa=?, marca=?, dueno=?, uts=?, tipo_mp=?, km_actual=?, frecuencia_km=?, km_proximo=?, observacion=?, tecnico=?, km_gps=?
            `;
            db.query(query, [...values, ...values.slice(1)], (err) => {
                if (err) return res.json({ data: "Error BD: " + err.message });
                broadcast('fleetrun', metodo);
                const usuario = (req.body && req.body.usuario) || 'sistema';
                const placa   = ((isEdit ? form.editF_placa  : form.f_placa)  || '').toUpperCase();
                const tipomp  = (isEdit ? form.editF_tipomp : form.f_tipomp) || '';
                logAudit(usuario, 'fleetrun', isEdit ? 'MODIFICÓ' : 'CREÓ', `${tipomp || '?'} · ${placa || '?'} · ${idFinal}`);
                // Si es edición, sincronizar planificacion vinculada (fecha_real y km_real)
                if (isEdit) {
                    const newFecha = (isEdit ? form.editF_fecha : null) || null;
                    const newKmAct = parseFloat(isEdit ? form.editF_kmact : 0) || null;
                    db.query(
                        `UPDATE planificacion SET fecha_real_ejecucion=?, km_real_ejecucion=?
                         WHERE fleetrun_id_ejecutado=? AND estado='Completada'`,
                        [newFecha, newKmAct, idFinal],
                        () => { broadcast('planificacion', 'actualizar'); }
                    );
                }
                // Auto-link a planificación si existe una activa
                if (placa && tipomp && !isEdit) {
                    db.query(
                        `SELECT id FROM planificacion
                         WHERE UPPER(placa)=? AND tipo_mp=? AND estado NOT IN ('Completada','Cancelada')
                         ORDER BY fecha_inicio_ventana ASC LIMIT 1`,
                        [placa, tipomp],
                        (e2, plans) => {
                            if (!e2 && plans.length) {
                                db.query(
                                    `UPDATE planificacion SET fleetrun_id_ejecutado=? WHERE id=?`,
                                    [idFinal, plans[0].id],
                                    () => {}
                                );
                            }
                        }
                    );
                }
                return res.json({ data: "Éxito", idRegistro: idFinal });
            });
        };

        if (isEdit) {
            const placaEnviada = (form.editF_placa || '').trim();
            if (!placaEnviada) {
                // Safeguard: placa vacía → recuperar del propio registro en DB antes de sobrescribir
                db.query('SELECT placa FROM fleetrun WHERE idRegistro=? LIMIT 1', [form.editF_id], (errP, rowsP) => {
                    if (!errP && rowsP.length && rowsP[0].placa) {
                        form.editF_placa = rowsP[0].placa;
                    }
                    _ejecutarGuardado(form.editF_id);
                });
            } else {
                _ejecutarGuardado(form.editF_id);
            }
        } else {
            // Para nuevos: generar código legible si no viene uno
            const placaNueva  = (form.f_placa  || '').toUpperCase();
            const tipoMpNuevo = form.f_tipomp  || '';
            const fechaNueva  = form.f_fecha   || new Date().toISOString().split('T')[0];
            if (form.f_id && !String(form.f_id).match(/^FL-\d{13}$/)) {
                // ID manual enviado por el frontend (no timestamp)
                _ejecutarGuardado(form.f_id);
            } else {
                generarIdFleetrunUnico(placaNueva, tipoMpNuevo, fechaNueva, _ejecutarGuardado);
            }
        }
        return;
    }

    if (metodo === 'obtenerDatosConductores') {
        db.query('SELECT * FROM conductores', (err, results) => {
            if (err) return res.json({ data: [] });
            return res.json({ data: results });
        });
        return;
    }

    if (metodo === 'guardarConductor') {
        const form = req.body.args[0];
        const isEdit = form.idConductor ? true : false;
        const nombre = form.c_nombre || "";
        const empresa = form.c_empresa || "";
        const telefono = form.c_telefono || "";
        const dni = form.c_dni || "";
        const licencia = form.c_licencia || "";
        const estado = form.c_estado || "Activo";
        const foto = form.c_foto_base64 || "";

        if (isEdit) {
            let sql = 'UPDATE conductores SET nombre=?, empresa=?, telefono=?, dni=?, licencia=?, estado=?';
            let params = [nombre, empresa, telefono, dni, licencia, estado];
            if (foto) { sql += ', foto=?'; params.push(foto); }
            sql += ' WHERE idConductor=?'; params.push(form.idConductor);
            db.query(sql, params, (err) => {
                if (err) return res.json({ data: "Error BD: " + err.message });
                broadcast('conductores', 'actualizar');
                return res.json({ data: "Éxito" });
            });
        } else {
            db.query('INSERT INTO conductores (nombre, empresa, telefono, dni, licencia, estado, foto) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nombre, empresa, telefono, dni, licencia, estado, foto], (err) => {
                if (err) return res.json({ data: "Error BD: " + err.message });
                broadcast('conductores', 'guardar');
                return res.json({ data: "Éxito" });
            });
        }
        return;
    }

    if (metodo === 'obtenerTiposMantenimiento') {
        db.query('SELECT * FROM tipos_mantenimiento', (err, results) => {
            if (err) return res.json({ data: [] });
            return res.json({ data: results });
        });
        return;
    }

    if (metodo === 'obtenerTPMP') {
        db.query('SELECT * FROM tp_mp', (err, results) => {
            if (err) return res.json({ data: [] });
            return res.json({ data: results.map(r => r.tipo_mant) });
        });
        return;
    }


    if (metodo === 'obtenerDatosWialon') {
        // Lee token desde DB; si no hay, cae en .env como fallback
        const obtenerTokenWialon = () => new Promise((resolve) => {
            db.query(
                "SELECT valor FROM integraciones_api WHERE clave = 'wialon_token' LIMIT 1",
                (err, rows) => {
                    const tokenDB = rows && rows[0] && rows[0].valor ? rows[0].valor.trim() : null;
                    resolve(tokenDB || process.env.WIALON_TOKEN || '');
                }
            );
        });
        const obtenerUrlWialon = () => new Promise((resolve) => {
            db.query(
                "SELECT valor FROM integraciones_api WHERE clave = 'wialon_url' LIMIT 1",
                (err, rows) => {
                    const urlDB = rows && rows[0] && rows[0].valor ? rows[0].valor.trim() : null;
                    resolve(urlDB || 'https://hst-api.wialon.us/wialon/ajax.html');
                }
            );
        });

        try {
            const [token, baseUrl] = await Promise.all([obtenerTokenWialon(), obtenerUrlWialon()]);
            if (!token) return res.json({ data: { error: 'Token Wialon no configurado. Configúralo en Sistema → Integraciones.' } });

            const loginRes = await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({token: token}))}`);
            const loginData = await loginRes.json();
            if (!loginData.eid) return res.json({ data: { error: "Fallo Login Wialon. Verifica el token en Sistema → Integraciones." }});

            const sid = loginData.eid;
            const searchParams = { "spec": { "itemsType": "avl_unit", "propName": "sys_name", "propValueMask": "*", "sortType": "sys_name" }, "force": 1, "flags": 9221, "from": 0, "to": 0 };
            const searchRes = await fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(searchParams))}&sid=${sid}`);
            const searchData = await searchRes.json();

            if (!searchData.items) return res.json({ data: [] });

            const vehiculosLive = [];
            searchData.items.forEach(item => {
                const rawName = item.nm ? item.nm.toUpperCase().trim() : "";
                let placaLimpia = rawName.replace(/[^A-Z0-9]/g, '');
                const matchPlaca = placaLimpia.match(/[A-Z0-9]{6}/);
                if (matchPlaca) placaLimpia = matchPlaca[0];

                if (rawName) {
                    vehiculosLive.push({
                        nombre_wialon: rawName, placa: placaLimpia,
                        km: item.cnm_km ? Math.round(item.cnm_km) : 0,
                        horas: item.cneh ? Math.round(item.cneh) : 0,
                        lat: item.pos ? item.pos.y : 0, lng: item.pos ? item.pos.x : 0
                    });
                }
            });

            fetch(`${baseUrl}?svc=core/logout&params=%7B%7D&sid=${sid}`).catch(e=>{});

            // ── Snapshot automático de KM GPS (una vez por día por placa) ──
            const hoy = new Date().toISOString().split('T')[0];
            vehiculosLive.forEach(v => {
                if (!v.placa || (!v.km && !v.horas)) return;
                db.query(
                    `INSERT IGNORE INTO km_snapshots (placa, fecha, km_gps, horas_motor)
                     VALUES (?, ?, ?, ?)`,
                    [v.placa, hoy, v.km || 0, v.horas || 0],
                    () => {}
                );
            });

            return res.json({ data: vehiculosLive });
        } catch (error) {
            console.error("Error Wialon:", error);
            return res.json({ data: { error: error.toString() }});
        }
    }

    res.json({ data: [] });
});

// ── IMPORTACIÓN MASIVA DE PLACAS (23 CAMPOS) ─────────────────────────────────


router.post('/importarPlacasMasivo', async (req, res) => {
    const { registros } = req.body;
    if (!Array.isArray(registros) || !registros.length) {
        return res.status(400).json({ ok: 0, errores: 0, msg: 'Sin registros' });
    }

    const query = `
        INSERT INTO placas (
            placa, cliente, ruc_dni, marca, modelo_uts, tipo, sub_tipo, color,
            nro_motor, nro_caja, nro_corona, nro_vin, configuracion, anio,
            combustible, carga_util, peso_neto, peso_bruto, estado, uts, motora, llantas, en_uso
        ) VALUES ?
        ON DUPLICATE KEY UPDATE
            cliente=VALUES(cliente), ruc_dni=VALUES(ruc_dni), marca=VALUES(marca),
            modelo_uts=VALUES(modelo_uts), tipo=VALUES(tipo), sub_tipo=VALUES(sub_tipo),
            color=VALUES(color), nro_motor=VALUES(nro_motor), nro_caja=VALUES(nro_caja),
            nro_corona=VALUES(nro_corona), nro_vin=VALUES(nro_vin), configuracion=VALUES(configuracion),
            anio=VALUES(anio), combustible=VALUES(combustible), carga_util=VALUES(carga_util),
            peso_neto=VALUES(peso_neto), peso_bruto=VALUES(peso_bruto), estado=VALUES(estado),
            uts=VALUES(uts), motora=VALUES(motora), llantas=VALUES(llantas), en_uso=VALUES(en_uso)
    `;

    let ok = 0, errores = 0;
    const validos = registros.filter(r => {
        const placa = (r.placa || r.PLACA || '').toString().trim().toUpperCase();
        if (!placa) { errores++; return false; }
        return true;
    });

    if (validos.length > 0) {
        for (let i = 0; i < validos.length; i += 500) {
            const lote = validos.slice(i, i + 500);
            const vals = lote.map(r => [
                (r.placa || r.PLACA || '').toString().trim().toUpperCase(),
                r.cliente || r.CLIENTE || '',
                r.ruc_dni || r['RUC / DNI'] || r.RUC_DNI || '',
                r.marca || r.MARCA || '',
                r.modelo_uts || r['MODELO UTS'] || r.MODELO_UTS || r.modelo || '',
                r.tipo || r.TIPO || '',
                r.sub_tipo || r['SUB TIPO'] || r.SUB_TIPO || '',
                r.color || r.COLOR || '',
                r.nro_motor || r['Nº MOTOR'] || r.NRO_MOTOR || '',
                r.nro_caja || r['Nº CAJA'] || r.NRO_CAJA || '',
                r.nro_corona || r['Nº CORONA'] || r.NRO_CORONA || '',
                r.nro_vin || r['Nº VIN'] || r.NRO_VIN || '',
                r.configuracion || r.CONFIGURACION || '',
                r.anio || r.AÑO || r.ANIO || '',
                (r.combustible || r.COMBUSTIBLE || '').replace('Dií©sel','DIESEL').replace('DIÍ©SEL','DIESEL'),
                r.carga_util || r['CARGA UTIL'] || r.CARGA_UTIL || '',
                r.peso_neto || r['PESO NETO'] || r.PESO_NETO || '',
                r.peso_bruto || r['PESO BRUTO'] || r.PESO_BRUTO || '',
                r.estado || r.ESTADO || 'Activa',
                r.uts || r.UTS || '',
                r.motora || r.MOTORA || '',
                r.llantas || r.LLANTAS || '',
                r.en_uso || r['EN USO?'] || r.EN_USO || ''
            ]);

            try {
                await new Promise((resolve, reject) => {
                    db.query(query, [vals], (err) => {
                        if (err) return reject(err);
                        ok += lote.length;
                        resolve();
                    });
                });
            } catch (e) {
                console.error('Import error bulk placas:', e.message);
                errores += lote.length;
            }
        }
    }
    broadcast('placas', 'importar');
    res.json({ ok, errores });
});

// ============================================================
// 🔥 IMPORTACIÓN MASIVA DE INSPECCIONES (DESDE EXCEL)
// ============================================================
router.post('/importarInspeccionesMasivo', async (req, res) => {
    const registros = req.body.registros;
    if (!registros || !Array.isArray(registros)) {
        return res.status(400).json({ error: "Datos inválidos" });
    }

    // Sanitiza fecha a YYYY-MM-DD o null
    function sanitizarFecha(val) {
        if (!val || String(val).trim() === '') return null;
        let s = String(val).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        // DD/MM/YYYY o DD-MM-YYYY
        let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
        // Fallback: Date.parse
        let d = new Date(s);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        return null;
    }

    let okCount = 0;
    let errCount = 0;
    let primerError = null;

    const sql = `
        INSERT INTO inspecciones
        (id, fecha_ingreso, placa, km_tablero, cliente, tecnico, dias_propuestos, detalles_json)
        VALUES ?
        ON DUPLICATE KEY UPDATE
        fecha_ingreso=VALUES(fecha_ingreso), placa=VALUES(placa), km_tablero=VALUES(km_tablero),
        cliente=VALUES(cliente), tecnico=VALUES(tecnico), dias_propuestos=VALUES(dias_propuestos), detalles_json=VALUES(detalles_json)
    `;

    const validos = registros.filter(r => {
        const placa = r.PLACA || r.placa || '';
        if (!placa || placa === "") { errCount++; return false; }
        return true;
    });

    if (validos.length > 0) {
        for (let i = 0; i < validos.length; i += 500) {
            const lote = validos.slice(i, i + 500);
            const vals = lote.map(r => [
                r['ID (NO MODIFICAR)'] || r.ID || r.id || `INSP-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                sanitizarFecha(r['FECHA INGRESO'] || r.FECHA || r.fecha_ingreso),
                (r.PLACA || r.placa || '').toString().toUpperCase().trim(),
                parseInt(r['KM TABLERO'] || r.KM || r.km_tablero || '0') || 0,
                (r.CLIENTE || r.cliente || '').toString().trim(),
                (r.TECNICO || r.tecnico || '').toString().trim(),
                parseInt(r['DIAS PROPUESTOS'] || r.DIAS || r.dias_propuestos || '30') || 30,
                r['DETALLES JSON'] || r.DETALLES || r.detalles_json || '[]'
            ]);

            try {
                await new Promise((resolve, reject) => {
                    db.query(sql, [vals], (err) => {
                        if (err) return reject(err);
                        okCount += lote.length;
                        resolve();
                    });
                });
            } catch (e) {
                console.error("Error bulk inspecciones:", e.message);
                if (!primerError) primerError = e.message;
                errCount += lote.length;
            }
        }
    }

    broadcast('inspecciones', 'importar');
    res.json({ ok: okCount, errores: errCount, detalle: primerError || null });
});

// ============================================================
// 🔥 IMPORTACIÓN MASIVA DE FLEETRUN (DESDE EXCEL)
// ============================================================
router.post('/importarFleetrunMasivo', async (req, res) => {
    const registros = req.body.registros;
    if (!registros || !Array.isArray(registros)) return res.status(400).json({ error: "Datos inválidos" });

    let okCount = 0; let errCount = 0;

    const sql = `
        INSERT INTO fleetrun
        (idRegistro, mes, anio, fecha, placa, marca, dueno, uts, tipo_mp, km_actual, frecuencia_km, km_proximo, km_gps, tecnico, observacion)
        VALUES ?
        ON DUPLICATE KEY UPDATE
        fecha=VALUES(fecha), placa=VALUES(placa), tipo_mp=VALUES(tipo_mp), km_actual=VALUES(km_actual),
        frecuencia_km=VALUES(frecuencia_km), km_proximo=VALUES(km_proximo), tecnico=VALUES(tecnico), observacion=VALUES(observacion),
        mes=VALUES(mes), anio=VALUES(anio)
    `;

    const validos = registros.filter(r => {
        if (!r.placa || r.placa === "") { errCount++; return false; }
        return true;
    });

    if (validos.length > 0) {
        for (let i = 0; i < validos.length; i += 500) {
            const lote = validos.slice(i, i + 500);
            const vals = lote.map(r => [
                r.id, r.mes, r.anio, r.fecha, r.placa, '', '', '', r.tipomp, r.kmact, r.freckm, r.kmprox, '', r.tec, r.obs
            ]);

            try {
                await new Promise((resolve, reject) => {
                    db.query(sql, [vals], (err) => {
                        if (err) return reject(err);
                        okCount += lote.length;
                        resolve();
                    });
                });
            } catch (e) {
                console.error("Error bulk fleetrun:", e.message);
                errCount += lote.length;
            }
        }
    }
    broadcast('fleetrun', 'importar');
    res.json({ ok: okCount, errores: errCount });
});

// ============================================================
// 🔥 ELIMINACIÓN MASIVA SEGURA (CON DESBLOQUEO DE LLAVES FORÁNEAS)
// ============================================================
router.post('/eliminarMasivo', (req, res) => {
    const { ids, coleccion } = req.body;
    if (!ids || !ids.length || !coleccion) return res.status(400).json({ error: "Datos incompletos" });

    // 🛡️ VALIDACIÓN DE ROLES PARA ELIMINACIÓN MASIVA
    if (req.user && req.user.rol !== 'Fundador') {
        try {
            let p = typeof req.user.permisos === 'string' ? JSON.parse(req.user.permisos) : req.user.permisos;
            if (!p.admin) {
                let mapPerm = { Placas:'placas', Fleetrun:'fleet', Mantenimientos:'fleet', Inspecciones:'insp', statusMant:'insp', StatusFlota:'status', statusFlota:'status', Usuarios:'seg' };
                let mod = mapPerm[coleccion];
                if (!mod || !p[mod] || (p[mod].d !== 1 && p[mod].d !== true)) {
                    console.warn(`[RBAC] Bloqueado eliminarMasivo en ${coleccion}`);
                    return res.status(403).json({ error: 'Permisos insuficientes para eliminar masivamente' });
                }
            }
        } catch(e) {}
    }

    let tabla = '';

    // Por defecto, busca 'idRegistro' (Fleetrun, Inspecciones, StatusFlota)
    let campoId = 'idRegistro';

    if (coleccion === 'Placas') { tabla = 'placas'; campoId = 'placa'; }
    else if (coleccion === 'Fleetrun' || coleccion === 'Mantenimientos') { tabla = 'fleetrun'; }
    else if (coleccion === 'Inspecciones' || coleccion === 'statusMant') { tabla = 'inspecciones'; campoId = 'id'; }
    else if (coleccion === 'StatusFlota' || coleccion === 'statusFlota') { tabla = 'status_flota'; }
    else return res.status(400).json({ error: "Colección no válida" });

    const sql = `DELETE FROM ${tabla} WHERE ${campoId} IN (?)`;

    // Obtenemos una conexión exclusiva para apagar los seguros
    db.getConnection((err, connection) => {
        if (err) {
            console.error("Error obteniendo conexión:", err);
            return res.status(500).json({ error: "Error interno de servidor" });
        }

        // 1. Apagamos las llaves foráneas para que no bloquee el borrado
        connection.query('SET FOREIGN_KEY_CHECKS=0;', (err) => {
            if (err) {
                connection.release();
                return res.status(500).json({ error: "No se pudo apagar el seguro de MySQL" });
            }

            // 2. Eliminamos los registros
            connection.query(sql, [ids], (errDelete, result) => {

                // 3. Volvemos a prender las llaves foráneas (MUY IMPORTANTE)
                connection.query('SET FOREIGN_KEY_CHECKS=1;', () => {
                    connection.release();

                    if (errDelete) {
                        console.error("Error MySQL en eliminación masiva:", errDelete);
                        return res.status(500).json({ error: "MySQL dice: " + errDelete.message });
                    }

                    const COLECCION_MODULO2 = { Placas:'placas', Fleetrun:'fleetrun', Mantenimientos:'fleetrun', Inspecciones:'inspecciones', statusMant:'inspecciones', StatusFlota:'status', statusFlota:'status' };
                    broadcast(COLECCION_MODULO2[coleccion] || coleccion.toLowerCase(), 'eliminarMasivo');
                    res.json({ data: 'Éxito', afectados: result.affectedRows });
                });
            });
        });
    });
});

// ============================================================
// 🔥 MÓDULO TALLER V2 (CATÁLOGOS E IDs INTELIGENTES)
// ============================================================

// ── CRUD cat_rampas ──────────────────────────────────────────────
// Migración: agregar columna orden si no existe
db.query(`ALTER TABLE cat_rampas ADD COLUMN orden INT NOT NULL DEFAULT 0`, (e) => {
    if (!e) db.query(`UPDATE cat_rampas SET orden=id WHERE orden=0`);
});

// Auto-seed: si la tabla está vacía, insertar 12 rampas por defecto
function _seedRampasIfEmpty(cb) {
    db.query('SELECT COUNT(*) AS cnt FROM cat_rampas', (err, rows) => {
        if (err || rows[0].cnt > 0) return cb();
        const vals = Array.from({length:12}, (_,i) => [i+1, `Rampa ${i+1}`, 'Principal', 'Disponible', i+1]);
        db.query('INSERT INTO cat_rampas (id, nombre_rampa, sede, estado, orden) VALUES ?', [vals], cb);
    });
}



    return router;
};
