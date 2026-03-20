require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Index.html'));
});

// ============================================================
// 🔥 CONEXIÓN A LA BASE DE DATOS (100% SEGURA POR VARIABLES)
// ============================================================
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
    ssl: { rejectUnauthorized: false }, // Crucial para que Render acepte a Aiven
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

db.getConnection((err, connection) => {
    if (err) {
        console.error('🚨 Error al conectar con Aiven:', err.message);
    } else {
        console.log('✅ Base de datos conectada con éxito (Pool Activo)');
        connection.release();
    }
});

// ============================================================
// ⏰ RUTA DESPERTADOR (MANTIENE VIVO A RENDER Y AIVEN)
// ============================================================
app.get('/api/ping', (req, res) => {
    db.query("SELECT 1", (err) => {
        if (err) {
            console.error("Error en el Ping a la BD:", err.message);
            return res.status(500).send("Render está despierto, pero Aiven falló.");
        }
        res.status(200).send("¡Pong! Render y Aiven están 100% despiertos.");
    });
});

// ============================================================
// 🔐 API DE LOGIN (CON DETECTOR DE ERRORES EXACTO)
// ============================================================
app.post('/api/login', (req, res) => {
    const { correo, password } = req.body;
    const sql = 'SELECT * FROM usuarios WHERE correo = ?';

    db.query(sql, [correo], (err, results) => {
        if (err) {
            console.error("🚨 FALLO EN LOGIN SQL:", err.message);
            return res.status(500).json({ exito: false, mensaje: "Error BD: " + err.code });
        }

        if (results.length > 0) {
            const usuario = results[0];
            if (usuario.password === password) {
                if (usuario.estado === 'Inactivo' && correo.toLowerCase() !== 'admin@azkell.com') {
                    return res.json({ exito: false, mensaje: "Cuenta inactiva." });
                }

                let permisosFinales = usuario.permisos_json || "{}";
                let rolFinal = usuario.rol || "Personalizado";

                if (correo.toLowerCase() === 'admin@azkell.com') {
                    permisosFinales = JSON.stringify({ admin: true });
                    rolFinal = "Administrador";
                }

                return res.json({ exito: true, nombre: usuario.nombre, rol: rolFinal, permisos: permisosFinales });
            } else { return res.json({ exito: false, mensaje: "Contraseña incorrecta." }); }
        } else { return res.json({ exito: false, mensaje: "El correo no está registrado." }); }
    });
});

// ============================================================
// 🚀 EL PUENTE DE LECTURA A MYSQL
// ============================================================
app.post('/api/script/:metodo', async (req, res) => {
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
            const data = results.map(r => [
                r.idRegistro || r.IDREGISTRO || '', r.fecha || r.FECHA || '', r.mes || r.MES || '',
                r.anio || r.ANIO || '', r.placa || r.PLACA || '', r.marca || r.MARCA || '',
                r.dueno || r.DUENO || '', r.uts || r.UTS || '', r.tipo_mp || r.TIPO_MP || '',
                r.km_actual || r.KM_ACTUAL || '',
                r.frecuencia || r.FRECUENCIA || r.frecuencia_km || '',
                r.km_proximo || r.KM_PROXIMO || '', r.observacion || r.OBSERVACION || '',
                r.tecnico || r.TECNICO || '', r.km_gps || r.KM_GPS || ''
            ]);
            return res.json({ data });
        });
        return;
    }

    if (metodo === 'obtenerDatosUsuarios') {
        const query = "SELECT idUsuario, nombre, cargo, correo, password, rol, estado, permisos_json FROM usuarios";
        db.query(query, (err, results) => {
            if (err) return res.status(500).json({ data: "Error BD: " + err.message });
            const filas = results.map(r => {
                let permisosFinales = {};
                let correoMin = (r.correo || '').trim().toLowerCase();
                if (correoMin === 'admin@azkell.com') {
                    permisosFinales = { admin: true };
                } else {
                    try {
                        let raw = r.permisos_json || '{}';
                        permisosFinales = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                        if (typeof permisosFinales === 'string') permisosFinales = JSON.parse(permisosFinales);
                    } catch (e) {
                        console.error(`Error parseando permisos de ${r.correo}:`, e);
                        permisosFinales = {};
                    }
                }
                return [ r.idUsuario, r.nombre, r.cargo, r.correo, r.rol, r.estado, r.password, JSON.stringify(permisosFinales) ];
            });
            return res.json({ data: filas });
        });
        return;
    }

    if (metodo === 'obtenerDatosInspecciones') {
        db.query('SELECT * FROM inspecciones', (err, results) => {
            if (err) return res.json({ data: [] });
            return res.json({ data: results });
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
                r.estado || '', r.observaciones || '', r.foto || ''
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
        const usuario = form.usuarioAutor || "";

        const query = `
            INSERT INTO status_flota
            (idRegistro, fecha, corte, unidad_motora, unidad_no_motora, cliente_motora, cliente_nomotora, zona, conductor, estado, observaciones, usuario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            fecha=?, corte=?, unidad_motora=?, unidad_no_motora=?, cliente_motora=?, cliente_nomotora=?, zona=?, conductor=?, estado=?, observaciones=?, usuario=?
        `;
        const values = [id, fecha, corte, motora, nomotora, cliMotora, cliNoMotora, zona, conductor, estado, obs, usuario,
                        fecha, corte, motora, nomotora, cliMotora, cliNoMotora, zona, conductor, estado, obs, usuario];
        db.query(query, values, (err) => {
            if (err) { console.error("❌ Error BD Status Flota:", err); return res.json({ data: "Error al guardar en Base de Datos" }); }
            console.log("✅ Status Flota guardado correctamente");
            return res.json({ data: "Éxito" });
        });
        return;
    }

    if (metodo === 'guardarInspeccion') {
        const datos = req.body.form || {};
        const query = `
            INSERT INTO inspecciones
            (id, placa, fecha_ingreso, cliente, tecnico, km_tablero, dias_propuestos, detalles_json, url_firma)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            placa=?, fecha_ingreso=?, cliente=?, tecnico=?, km_tablero=?, dias_propuestos=?, detalles_json=?, url_firma=?
        `;
        const values = [
            datos.id, datos.placa, datos.fecha_ingreso, datos.cliente, datos.tecnico,
            datos.km_tablero, datos.dias_propuestos, datos.detalles_json, datos.firma_base64,
            datos.placa, datos.fecha_ingreso, datos.cliente, datos.tecnico,
            datos.km_tablero, datos.dias_propuestos, datos.detalles_json, datos.firma_base64
        ];
        db.query(query, values, (err) => {
            if (err) { console.error("Error BD Inspecciones:", err); return res.json({ data: "Error al guardar inspección" }); }
            console.log("✅ Inspección guardada correctamente");
            return res.json({ data: "Éxito" });
        });
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
        else if (coleccion === 'Seguridad') sql = 'DELETE FROM seguridad WHERE id IN (?)';

        if (!sql) return res.json({ data: "Colección no válida" });

        db.query(sql, [listaIds], (err) => {
            if (err) { console.error("❌ Error en BD:", err); return res.json({ data: "Error al procesar registro" }); }
            console.log(`✅ Eliminados definitivamente ${listaIds.length} registros de ${coleccion}`);
            return res.json({ data: "Éxito" });
        });
        return;
    }

    if (metodo === 'guardarUsuario' || metodo === 'actualizarUsuario') {
        const form = req.body.args[0];
        const isEdit = (form.idUsuarioEdit && form.idUsuarioEdit.trim() !== '') ? true : false;

        const ejecutarGuardado = (idFinal) => {
            const nombre = form.nombreUsuarioEdit || '';
            const cargo = form.cargoUsuarioEdit || '';
            const correo = form.correoUsuarioEdit || '';
            const password = form.passwordUsuarioEdit || '';
            let estado = form.estadoUsuarioEdit || 'Activo';
            let permisos = form.permisos_json || "{}";
            let rol = "Personalizado";

            if (correo.trim().toLowerCase() === 'admin@azkell.com') {
                permisos = JSON.stringify({ admin: true });
                estado = "Activo"; rol = "Administrador";
            }
            if (typeof permisos === 'object') permisos = JSON.stringify(permisos);

            if (isEdit) {
                const sqlUpdate = "UPDATE usuarios SET nombre=?, cargo=?, correo=?, password=?, estado=?, permisos_json=?, rol=? WHERE idUsuario=?";
                db.query(sqlUpdate, [nombre, cargo, correo, password, estado, permisos, rol, idFinal], (err) => {
                    if (err) return res.json({ data: "Error BD: " + err.message });
                    return res.json({ data: "Éxito" });
                });
            } else {
                const sqlInsert = "INSERT INTO usuarios (idUsuario, nombre, cargo, correo, password, rol, estado, permisos_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
                db.query(sqlInsert, [idFinal, nombre, cargo, correo, password, rol, estado, permisos], (err) => {
                    if (err) return res.json({ data: "Error BD: " + err.message });
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
        const placa = (isEdit ? form.editP_placa : form.p_placa).toUpperCase();
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
            return res.json({ data: "Éxito" });
        });
        return;
    }

    if (metodo === 'guardarFleetrun' || metodo === 'actualizarFleetrun') {
        const form = req.body.args[0];
        const isEdit = metodo === 'actualizarFleetrun';
        const values = [
            isEdit ? form.editF_id : (form.f_id || `FL-${Date.now()}`),
            isEdit ? form.editF_fecha : form.f_fecha, isEdit ? form.editF_mes : form.f_mes,
            isEdit ? form.editF_anio : form.f_anio, (isEdit ? form.editF_placa : form.f_placa).toUpperCase(),
            isEdit ? form.editF_marca : form.f_marca, isEdit ? form.editF_dueno : form.f_dueno,
            isEdit ? form.editF_uts : form.f_uts, isEdit ? form.editF_tipomp : form.f_tipomp,
            isEdit ? form.editF_kmact : form.f_kmact, isEdit ? form.editF_freckm : form.f_freckm,
            isEdit ? form.editF_kmprox : form.f_kmprox, isEdit ? form.editF_obs : form.f_obs,
            isEdit ? form.editF_tec : form.f_tec, isEdit ? form.editF_kmgps : form.f_kmgps
        ];

        const query = `
            INSERT INTO fleetrun (idRegistro, fecha, mes, anio, placa, marca, dueno, uts, tipo_mp, km_actual, frecuencia, km_proximo, observacion, tecnico, km_gps)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            fecha=?, mes=?, anio=?, placa=?, marca=?, dueno=?, uts=?, tipo_mp=?, km_actual=?, frecuencia=?, km_proximo=?, observacion=?, tecnico=?, km_gps=?
        `;
        db.query(query, [...values, ...values.slice(1)], (err) => {
            if (err) return res.json({ data: "Error BD: " + err.message });
            return res.json({ data: "Éxito" });
        });
        return;
    }

    if (metodo === 'guardarReporte' || metodo === 'actualizarReporte') {
        const form = req.body.args[0];
        const isEdit = metodo === 'actualizarReporte';
        const id = isEdit ? form.idReporte : `SEG-${Date.now()}`;
        const inspector = isEdit ? form.inspectorEdit : form.inspector;
        const tipo = isEdit ? form.tipoIncidenteEdit : form.tipoIncidente;
        const estado = isEdit ? form.estadoEdit : "Pendiente";
        const fecha = new Date().toLocaleDateString('es-PE');

        if (isEdit) {
            db.query('UPDATE seguridad SET inspector=?, tipo=?, estado=? WHERE idReporte=?', [inspector, tipo, estado, id], (err) => {
                if (err) return res.json({ data: "Error BD: " + err.message });
                return res.json({ data: "Éxito" });
            });
        } else {
            db.query('INSERT INTO seguridad (idReporte, fecha, inspector, tipo, detalle, estado) VALUES (?, ?, ?, ?, ?, ?)',
            [id, fecha, inspector, tipo, form.detalle || "", estado], (err) => {
                if (err) return res.json({ data: "Error BD: " + err.message });
                return res.json({ data: "Éxito" });
            });
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
                return res.json({ data: "Éxito" });
            });
        } else {
            db.query('INSERT INTO conductores (nombre, empresa, telefono, dni, licencia, estado, foto) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nombre, empresa, telefono, dni, licencia, estado, foto], (err) => {
                if (err) return res.json({ data: "Error BD: " + err.message });
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

    if (metodo === 'consultarGemini') {
        const prompt = req.body.args[0];
        const resumenContexto = req.body.args[1];
        const apiKey = "AIzaSyAOloEWep_cl3_5fwfJdLJqE1elj_Kd_qU";
        const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;

        try {
            const aiRes = await fetch(url, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ "contents": [{ "parts": [{ "text": "Eres el asistente experto del CRM de AZKELL. " + resumenContexto + ".\nResponde de forma útil, breve y profesional a esta consulta del usuario: " + prompt }] }] })
            });
            const json = await aiRes.json();
            if (json.error) return res.json({ data: "Error IA: " + json.error.message });
            return res.json({ data: json.candidates[0].content.parts[0].text });
        } catch (e) {
            return res.json({ data: "Error conexión IA: " + e.message });
        }
    }

    if (metodo === 'obtenerDatosWialon') {
        const token = "b0a4947147e59c66f42703bca5df48a1B33E01E58063AD32AF788F04F09F24F4F88692AC";
        const baseUrl = "https://hst-api.wialon.us/wialon/ajax.html";
        try {
            const loginRes = await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({token: token}))}`);
            const loginData = await loginRes.json();
            if (!loginData.eid) return res.json({ data: { error: "Fallo Login Wialon." }});

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
            return res.json({ data: vehiculosLive });
        } catch (error) {
            console.error("Error Wialon:", error);
            return res.json({ data: { error: error.toString() }});
        }
    }

    res.json({ data: [] });
});

// ── IMPORTACIÓN MASIVA DE PLACAS (23 CAMPOS) ─────────────────────────────────
app.post('/api/importarPlacasMasivo', async (req, res) => {
    const { registros } = req.body;
    if (!Array.isArray(registros) || !registros.length) {
        return res.status(400).json({ ok: 0, errores: 0, msg: 'Sin registros' });
    }

    const query = `
        INSERT INTO placas (
            placa, cliente, ruc_dni, marca, modelo_uts, tipo, sub_tipo, color,
            nro_motor, nro_caja, nro_corona, nro_vin, configuracion, anio,
            combustible, carga_util, peso_neto, peso_bruto, estado, uts, motora, llantas, en_uso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    const promesas = registros.map(r => new Promise(resolve => {
        const placa = (r.placa || r.PLACA || '').toString().trim().toUpperCase();
        if (!placa) { errores++; return resolve(); }

        const vals = [
            placa,
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
        ];

        db.query(query, vals, err => {
            if (err) { errores++; console.error('Import error:', placa, err.message); }
            else ok++;
            resolve();
        });
    }));

    await Promise.all(promesas);
    res.json({ ok, errores });
});

// ============================================================
// 🔥 IMPORTACIÓN MASIVA DE INSPECCIONES (DESDE EXCEL)
// ============================================================
app.post('/api/importarInspeccionesMasivo', async (req, res) => {
    const registros = req.body.registros;
    if (!registros || !Array.isArray(registros)) {
        return res.status(400).json({ error: "Datos inválidos" });
    }

    let okCount = 0;
    let errCount = 0;

    const promesaQuery = (sql, params) => new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err); else resolve(results);
        });
    });

    for (let r of registros) {
        try {
            const id = r['ID (NO MODIFICAR)'] || r.ID || r.id || `INSP-${Date.now()}-${Math.floor(Math.random()*1000)}`;
            const fecha = r['FECHA INGRESO'] || r.FECHA || r.fecha_ingreso || '';
            const placa = r.PLACA || r.placa || '';
            const km = r['KM TABLERO'] || r.KM || r.km_tablero || '';
            const cliente = r.CLIENTE || r.cliente || '';
            const tec = r.TECNICO || r.tecnico || '';
            const dias = r['DIAS PROPUESTOS'] || r.DIAS || r.dias_propuestos || '30';
            const detalles = r['DETALLES JSON'] || r.DETALLES || r.detalles_json || '[]';

            if (!placa || placa === "") { errCount++; continue; }

            const sql = `
                INSERT INTO inspecciones
                (id, fecha_ingreso, placa, km_tablero, cliente, tecnico, dias_propuestos, detalles_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                fecha_ingreso=VALUES(fecha_ingreso), placa=VALUES(placa), km_tablero=VALUES(km_tablero),
                cliente=VALUES(cliente), tecnico=VALUES(tecnico), dias_propuestos=VALUES(dias_propuestos), detalles_json=VALUES(detalles_json)
            `;

            await promesaQuery(sql, [id, fecha, placa, km, cliente, tec, dias, detalles]);
            okCount++;
        } catch (e) {
            console.error("Error importando inspección:", e);
            errCount++;
        }
    }

    res.json({ ok: okCount, errores: errCount });
});

// 4. Encender Servidor
app.listen(process.env.PORT || 3000, () => {
    console.log('🚀 Servidor Backend de Azkell corriendo');
});
