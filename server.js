require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const ALLOWED_ORIGINS = [
    'https://azkell-crm.onrender.com',
    process.env.APP_URL,
    'capacitor://localhost',
    'http://localhost',
    'http://localhost:3000'
].filter(Boolean);
app.use(cors({
    origin: function(origin, cb) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error('CORS bloqueado: ' + origin));
    },
    credentials: true
}));
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
        // Migraciones de esquema al arrancar
        connection.query(
            `ALTER TABLE auditoria ADD COLUMN modulo VARCHAR(50) DEFAULT NULL`,
            (err2) => {
                if (err2 && err2.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER auditoria:', err2.message);
                else console.log('✅ Columna modulo verificada en auditoria');
            }
        );
        // Crear tabla roles si no existe
        connection.query(
            `CREATE TABLE IF NOT EXISTS roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                color VARCHAR(20) DEFAULT '#5865F2',
                permisos_json TEXT,
                es_admin TINYINT(1) DEFAULT 0
            )`,
            (err3) => {
                if (err3) console.warn('CREATE TABLE roles:', err3.message);
                else console.log('✅ Tabla roles verificada');
            }
        );
        // Agregar rol_id a usuarios si no existe
        connection.query(
            `ALTER TABLE usuarios ADD COLUMN rol_id INT NULL DEFAULT NULL`,
            (err4) => {
                if (err4 && err4.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER usuarios rol_id:', err4.message);
                else console.log('✅ Columna rol_id verificada en usuarios');
            }
        );
        // Columnas de actividad/sesión
        connection.query(`ALTER TABLE usuarios ADD COLUMN ultimo_acceso DATETIME NULL DEFAULT NULL`,
            (e) => { if (e && e.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER ultimo_acceso:', e.message); });
        connection.query(`ALTER TABLE usuarios ADD COLUMN ultimo_ip VARCHAR(80) NULL DEFAULT NULL`,
            (e) => { if (e && e.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER ultimo_ip:', e.message); });
        connection.query(`ALTER TABLE usuarios ADD COLUMN ultimo_dispositivo VARCHAR(200) NULL DEFAULT NULL`,
            (e) => { if (e && e.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER ultimo_dispositivo:', e.message); });
        connection.query(`ALTER TABLE usuarios ADD COLUMN password_visible VARCHAR(255) NOT NULL DEFAULT ''`,
            (e) => { if (e && e.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER password_visible:', e.message); });
        // Orden/jerarquía en roles
        connection.query(`ALTER TABLE roles ADD COLUMN orden INT NOT NULL DEFAULT 0`,
            (e) => {
                connection.release();
                if (e && e.code !== 'ER_DUP_FIELDNAME') console.warn('ALTER roles orden:', e.message);
                else console.log('✅ Esquema v2 verificado');
            }
        );
    }
});

// 📋 Helper de auditoría — usa esquema real: idAuditoria, fecha, usuario, accion, detalle, modulo
function logAudit(usuario, modulo, accion, detalle) {
    db.query(
        'INSERT INTO auditoria (usuario, modulo, accion, detalle) VALUES (?, ?, ?, ?)',
        [usuario || 'sistema', modulo || '', accion || '', detalle || ''],
        (err) => { if (err) console.warn('Audit log error:', err.message); }
    );
}

// ============================================================
// 📡 SSE — SINCRONIZACIÓN EN TIEMPO REAL
// ============================================================
const sseClients = new Set();

// ============================================================
// 🔑 MIDDLEWARE DE AUTENTICACIÓN JWT
// ============================================================
function verifyToken(req, res, next) {
    const PUBLIC_PATHS = ['/login', '/ping', '/eventos'];
    if (PUBLIC_PATHS.includes(req.path)) return next();
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' });
    try {
        req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
        next();
    } catch(e) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}
app.use('/api', verifyToken);

setInterval(() => {
    sseClients.forEach(c => {
        try { c.write(': ping\n\n'); } catch(e) { sseClients.delete(c); }
    });
}, 30000);

app.get('/api/eventos', (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    res.write('data: {"tipo":"conectado"}\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
});

function broadcast(modulo, accion, detalle) {
    const payload = Object.assign({ modulo, accion }, detalle || {});
    const msg = `event: datos-actualizados\ndata: ${JSON.stringify(payload)}\n\n`;
    sseClients.forEach(c => {
        try { c.write(msg); } catch(e) { sseClients.delete(c); }
    });
}

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
    const sql = `
        SELECT u.*, r.permisos_json AS rol_permisos, r.nombre AS rol_nombre,
               r.color AS rol_color, r.es_admin AS rol_es_admin, r.id AS rol_id_fk
        FROM usuarios u
        LEFT JOIN roles r ON u.rol_id = r.id
        WHERE u.correo = ?`;

    db.query(sql, [correo], async (err, results) => {
        if (err) {
            console.error("🚨 FALLO EN LOGIN SQL:", err.message);
            return res.status(500).json({ exito: false, mensaje: "Error BD: " + err.code });
        }

        if (results.length > 0) {
            const usuario = results[0];

            // Verificación gradual: hash bcrypt o texto plano
            const esHash = usuario.password && (usuario.password.startsWith('$2b$') || usuario.password.startsWith('$2a$'));
            let passwordValida = false;
            if (esHash) {
                passwordValida = await bcrypt.compare(password, usuario.password);
            } else {
                passwordValida = (usuario.password === password);
                if (passwordValida) {
                    const hashed = await bcrypt.hash(password, 10);
                    db.query('UPDATE usuarios SET password=? WHERE correo=?', [hashed, correo]);
                }
            }

            if (passwordValida) {
                if (usuario.estado === 'Inactivo' && correo.toLowerCase() !== 'admin@azkell.com') {
                    return res.json({ exito: false, mensaje: "Cuenta inactiva." });
                }

                let permisosFinales;
                let rolFinal = usuario.rol || "Personalizado";

                if (correo.toLowerCase() === 'admin@azkell.com') {
                    permisosFinales = JSON.stringify({ admin: true });
                    rolFinal = "Fundador";
                } else if (usuario.rol_id && usuario.rol_es_admin) {
                    permisosFinales = JSON.stringify({ admin: true });
                    rolFinal = usuario.rol_nombre || "Administrador";
                } else if (usuario.rol_id && usuario.rol_permisos) {
                    permisosFinales = usuario.rol_permisos;
                    rolFinal = usuario.rol_nombre || "Personalizado";
                } else {
                    permisosFinales = usuario.permisos_json || "{}";
                }

                // Registrar actividad de sesión
                const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '?';
                const ua = req.headers['user-agent'] || '';
                let dispositivo = 'PC';
                if (/Mobile|Android|iPhone|iPad/i.test(ua)) {
                    if (/iPhone/i.test(ua)) dispositivo = 'iPhone';
                    else if (/iPad/i.test(ua)) dispositivo = 'iPad';
                    else if (/Android/i.test(ua)) dispositivo = 'Android';
                    else dispositivo = 'Móvil';
                } else if (/Chrome/i.test(ua)) dispositivo = 'Chrome (PC)';
                else if (/Firefox/i.test(ua)) dispositivo = 'Firefox (PC)';
                else if (/Safari/i.test(ua)) dispositivo = 'Safari (PC)';
                else if (/Edg/i.test(ua)) dispositivo = 'Edge (PC)';

                db.query(
                    'UPDATE usuarios SET ultimo_acceso=NOW(), ultimo_ip=?, ultimo_dispositivo=? WHERE correo=?',
                    [ip, dispositivo, correo],
                    (err) => { if (err) console.warn('UPDATE sesion:', err.message); }
                );

                return res.json({
                    exito: true,
                    token: jwt.sign(
                        { id: usuario.idUsuario, correo: usuario.correo, rol: rolFinal, permisos: permisosFinales },
                        process.env.JWT_SECRET,
                        { expiresIn: '12h' }
                    ),
                    nombre: usuario.nombre,
                    rol: rolFinal,
                    permisos: permisosFinales,
                    rol_color: usuario.rol_color || null,
                    rol_id: usuario.rol_id || null
                });
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
            broadcast('status', metodo);
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
            broadcast('inspecciones', metodo);
            const usuario = req.body.usuario || datos.tecnico || 'sistema';
            logAudit(usuario, 'inspecciones', 'CREÓ', `${datos.placa || '?'} · ${datos.fecha_ingreso || '?'}`);
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

        if (!sql) return res.json({ data: "Colección no válida" });

        db.query(sql, [listaIds], (err) => {
            if (err) { console.error("❌ Error en BD:", err); return res.json({ data: "Error al procesar registro" }); }
            console.log(`✅ Eliminados definitivamente ${listaIds.length} registros de ${coleccion}`);
            const COLECCION_MODULO = { Placas:'placas', Inspecciones:'inspecciones', Fleetrun:'fleetrun', StatusFlota:'status', Usuarios:'usuarios' };
            broadcast(COLECCION_MODULO[coleccion] || coleccion.toLowerCase(), 'eliminar');
            const usuario = req.body.usuario || 'sistema';
            logAudit(usuario, COLECCION_MODULO[coleccion] || coleccion.toLowerCase(), 'ELIMINÓ', `${listaIds.length} reg. de ${coleccion}`);
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
                    const sqlUpdate = "UPDATE usuarios SET nombre=?, cargo=?, correo=?, password=?, password_visible=?, estado=?, permisos_json=?, rol=?, rol_id=? WHERE idUsuario=?";
                    db.query(sqlUpdate, [nombre, cargo, correo, password, passwordPlain, estado, permisos, rol, rolId, idFinal], (err) => {
                        if (err) return res.json({ data: "Error BD: " + err.message });
                        broadcast('usuarios', 'actualizar');
                        return res.json({ data: "Éxito" });
                    });
                } else {
                    const sqlUpdate = "UPDATE usuarios SET nombre=?, cargo=?, correo=?, estado=?, permisos_json=?, rol=?, rol_id=? WHERE idUsuario=?";
                    db.query(sqlUpdate, [nombre, cargo, correo, estado, permisos, rol, rolId, idFinal], (err) => {
                        if (err) return res.json({ data: "Error BD: " + err.message });
                        broadcast('usuarios', 'actualizar');
                        return res.json({ data: "Éxito" });
                    });
                }
            } else {
                const sqlInsert = "INSERT INTO usuarios (idUsuario, nombre, cargo, correo, password, password_visible, rol, estado, permisos_json, rol_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                db.query(sqlInsert, [idFinal, nombre, cargo, correo, password, passwordPlain, rol, estado, permisos, rolId], (err) => {
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
            broadcast('placas', metodo);
            const usuario = req.body.usuario || 'sistema';
            logAudit(usuario, 'placas', metodo === 'actualizarPlaca' ? 'MODIFICÓ' : 'CREÓ', `${placa} · ${cliente || '?'}`);
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
            broadcast('fleetrun', metodo);
            const usuario = req.body.usuario || 'sistema';
            const form = req.body.args[0];
            const isEdit = metodo === 'actualizarFleetrun';
            const placa = isEdit ? form.editF_placa : form.f_placa;
            const tipomp = isEdit ? form.editF_tipomp : form.f_tipomp;
            logAudit(usuario, 'fleetrun', isEdit ? 'MODIFICÓ' : 'CREÓ', `${tipomp || '?'} · ${(placa||'?').toUpperCase()}`);
            return res.json({ data: "Éxito" });
        });
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
    broadcast('placas', 'importar');
    res.json({ ok, errores });
});
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

    broadcast('inspecciones', 'importar');
    res.json({ ok: okCount, errores: errCount });
});

// ============================================================
// 🔥 IMPORTACIÓN MASIVA DE FLEETRUN (DESDE EXCEL)
// ============================================================
app.post('/api/importarFleetrunMasivo', async (req, res) => {
    const registros = req.body.registros;
    if (!registros || !Array.isArray(registros)) return res.status(400).json({ error: "Datos inválidos" });

    let okCount = 0; let errCount = 0;
    const promesaQuery = (sql, params) => new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => { if (err) reject(err); else resolve(results); });
    });

    for (let r of registros) {
        try {
            if (!r.placa || r.placa === "") { errCount++; continue; }

            const sql = `
                INSERT INTO fleetrun
                (id, mes, anio, fecha, placa, marca, dueno, uts, tipomp, kmact, freckm, kmprox, kmgps, tec, obs)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                fecha=VALUES(fecha), placa=VALUES(placa), tipomp=VALUES(tipomp), kmact=VALUES(kmact),
                freckm=VALUES(freckm), kmprox=VALUES(kmprox), tec=VALUES(tec), obs=VALUES(obs),
                mes=VALUES(mes), anio=VALUES(anio)
            `;
            await promesaQuery(sql, [r.id, r.mes, r.anio, r.fecha, r.placa, '', '', '', r.tipomp, r.kmact, r.freckm, r.kmprox, '', r.tec, r.obs]);
            okCount++;
        } catch (e) { console.error("Error importando fleetrun:", e); errCount++; }
    }
    broadcast('fleetrun', 'importar');
    res.json({ ok: okCount, errores: errCount });
});

// ============================================================
// 🔥 ELIMINACIÓN MASIVA SEGURA (CON DESBLOQUEO DE LLAVES FORÁNEAS)
// ============================================================
app.post('/api/eliminarMasivo', (req, res) => {
    const { ids, coleccion } = req.body;
    if (!ids || !ids.length || !coleccion) return res.status(400).json({ error: "Datos incompletos" });

    let tabla = '';

    // Por defecto, busca 'idRegistro' (Fleetrun, Inspecciones, StatusFlota)
    let campoId = 'idRegistro';

    if (coleccion === 'Placas') { tabla = 'placas'; campoId = 'placa'; }
    else if (coleccion === 'Fleetrun' || coleccion === 'Mantenimientos') { tabla = 'fleetrun'; }
    else if (coleccion === 'Inspecciones' || coleccion === 'statusMant') { tabla = 'inspecciones'; }
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

// A. Obtener Catálogos (Rampas y Situaciones) para el Front-End
app.get('/api/catalogos_taller', (req, res) => {
    const sqlRampas = "SELECT * FROM cat_rampas ORDER BY id ASC";
    const sqlSituaciones = "SELECT * FROM cat_situaciones ORDER BY id ASC";
    db.query(sqlRampas, (err1, rampas) => {
        if (err1) return res.status(500).json({ error: err1.message });
        db.query(sqlSituaciones, (err2, situaciones) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ rampas, situaciones });
        });
    });
});

app.get('/api/ordenes', (req, res) => {
    db.query("SELECT * FROM ordenes_trabajo ORDER BY fecha_ingreso DESC", (err, results) => {
        if (err) return res.status(500).json({ error: "Error MySQL: " + err.message });
        res.json({ data: results });
    });
});

// B. Crear nueva Visita/OT con ID Inteligente (OT-0001-2026)
app.post('/api/ordenes', (req, res) => {
    // 1. Recibimos las nuevas fechas estimadas
    const { placa, fecha, hora, fecha_est, hora_est, km, combustible, motivo, id_rampa, id_situacion, usuario } = req.body;
    if (!placa) return res.status(400).json({ error: "Falta placa" });

    const ticket_entrada = 'TKT-' + Date.now();
    const currentYear = new Date().getFullYear();

    db.query("SELECT ultimo_valor, anio FROM secuencias WHERE tipo = 'OT'", (errSeq, rows) => {
        if (errSeq) return res.status(500).json({ error: "Error secuencias: " + errSeq.message });

        let ultimo = rows.length > 0 ? rows[0].ultimo_valor : 0;
        let dbYear = rows.length > 0 ? rows[0].anio : currentYear;
        if (dbYear !== currentYear) ultimo = 0;
        ultimo += 1;

        const nuevoIdOT = "OT-" + String(ultimo).padStart(4, '0') + "-" + currentYear;

        db.query("UPDATE secuencias SET ultimo_valor = ?, anio = ? WHERE tipo = 'OT'", [ultimo, currentYear], (errUpd) => {
            if (errUpd) return res.status(500).json({ error: "Error update seq: " + errUpd.message });

            const detalles = {
                km_ingreso: km, combustible: combustible, motivo: motivo,
                historial: [{ fase: 'Recepción', fecha: new Date().toISOString(), usuario: usuario || 'Admin' }]
            };

            // 2. Ensamblamos las fechas para SQL
            const fechaHoraSQL = (fecha && hora) ? `${fecha} ${hora}:00` : new Date().toISOString().slice(0, 19).replace('T', ' ');
            const fechaHoraEstSQL = (fecha_est && hora_est) ? `${fecha_est} ${hora_est}:00` : null;

            // 3. Insertamos usando la columna correcta: fecha_hora_salida
            const sql = `INSERT INTO ordenes_trabajo (ticket_entrada, id_ot, placa, estado, id_situacion, id_rampa, detalles_json, creado_por, fecha_ingreso, fecha_hora_salida) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            db.query(sql, [ticket_entrada, nuevoIdOT, placa, 'Recepción', id_situacion || null, id_rampa || null, JSON.stringify(detalles), usuario || 'Admin', fechaHoraSQL, fechaHoraEstSQL], (errInsert) => {
                if (errInsert) return res.status(500).json({ error: "Error guardando OT: " + errInsert.message });
                res.json({ data: 'Éxito', id_ot: nuevoIdOT });
            });
        });
    });
});

// C. Crear una nueva Visita al Taller (Con Correlativo Inteligente ST-0001-YYYY)
app.post('/api/taller/ingreso', (req, res) => {
    const data = req.body;

    db.query("SELECT COUNT(*) as total FROM ordenes_trabajo WHERE YEAR(fecha_ingreso) = YEAR(CURDATE())", (err, counts) => {
        if (err) return res.status(500).json({ error: err.message });

        const nextNum = (counts[0].total + 1).toString().padStart(4, '0');
        const year = new Date().getFullYear();
        const correlativoID = `ST-${nextNum}-${year}`;

        const sql = `INSERT INTO ordenes_trabajo
            (ticket_entrada, placa, id_rampa, tipo_trabajo, descripcion_falla, conductor, kilometraje, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'EN ESPERA')`;

        db.query(sql, [correlativoID, data.placa, data.id_rampa, data.tipo_trabajo, data.descripcion_falla, data.conductor, data.kilometraje], (err) => {
            if (err) return res.status(500).json({ error: err.message });

            if (data.generar_ot) {
                const id_ot_hija = `OT-${nextNum}-${year}`;
                db.query(
                    "INSERT INTO trabajos_ot (id_ot, ticket_visita, tipo_ot, sub_tipo, estado) VALUES (?, ?, ?, ?, 'Recepción')",
                    [id_ot_hija, correlativoID, 'Correctivo', 'Mecánica General'],
                    (errOT) => {
                        if (errOT) return res.status(500).json({ error: errOT.message });
                        res.json({ data: 'Ingreso y OT generados con éxito', ticket: correlativoID });
                    }
                );
            } else {
                res.json({ data: 'Ingreso generado con éxito', ticket: correlativoID });
            }
        });
    });
});

// 3. Actualizar y Avanzar de Fase la Orden (PUT)
// 3. Actualizar y Avanzar de Fase la Orden V2 (PUT)
app.put('/api/ordenes/:ticket_entrada', (req, res) => {
    const { ticket_entrada } = req.params;
    const { estado, nuevosDetalles, tecnico_asignado, usuario } = req.body;

    db.query("SELECT detalles_json FROM ordenes_trabajo WHERE ticket_entrada = ?", [ticket_entrada], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ error: "OT no encontrada" });

        let detalles = {};
        try { detalles = JSON.parse(results[0].detalles_json || '{}'); } catch(e) {}

        detalles = { ...detalles, ...nuevosDetalles };

        if (!detalles.historial) detalles.historial = [];
        detalles.historial.push({ fase: estado, fecha: new Date().toISOString(), usuario: usuario || 'Admin' });

        let sql = "UPDATE ordenes_trabajo SET estado = ?, detalles_json = ?";
        let params = [estado, JSON.stringify(detalles)];

        if (tecnico_asignado) {
            sql += ", tecnico_asignado = ?";
            params.push(tecnico_asignado);
        }

        sql += " WHERE ticket_entrada = ?";
        params.push(ticket_entrada);

        db.query(sql, params, (errUpdate) => {
            if (errUpdate) return res.status(500).json({ error: errUpdate.message });
            res.json({ data: 'Éxito' });
        });
    });
});

// ============================================================
// MÓDULO BACKLOG MAESTRO (MANTENIMIENTOS PENDIENTES)
// ============================================================

// C. Guardar un nuevo pendiente en el Backlog
app.post('/api/backlog', (req, res) => {
    const { placa, trabajo_pendiente, fuente, usuario } = req.body;
    const sql = "INSERT INTO backlog_mantenimiento (placa, trabajo_pendiente, fuente, creado_por) VALUES (?, ?, ?, ?)";
    db.query(sql, [placa, trabajo_pendiente, fuente || 'Taller (OT)', usuario || 'Admin'], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: 'Guardado con éxito' });
    });
});

// D. Leer el historial de pendientes por Placa
app.get('/api/backlog/:placa', (req, res) => {
    const sql = "SELECT * FROM backlog_mantenimiento WHERE placa = ? ORDER BY fecha_deteccion DESC";
    db.query(sql, [req.params.placa], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: results });
    });
});

// E. Actualizar Rampa y Situación (Status General del Vehículo)
app.put('/api/ordenes/:ticket_entrada/ubicacion', (req, res) => {
    const { id_rampa, id_situacion } = req.body;
    const sql = "UPDATE ordenes_trabajo SET id_rampa = ?, id_situacion = ? WHERE ticket_entrada = ?";
    db.query(sql, [id_rampa || null, id_situacion || null, req.params.ticket_entrada], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: 'Ubicación y Situación actualizadas' });
    });
});

// ============================================================
// VISTA MASTER: STATUS GENERAL DEL TALLER
// ============================================================

// F. Obtener la Vista Master de Unidades en Taller
app.get('/api/taller/status', (req, res) => {
    const sql = `
        SELECT
            ot.id_ot, ot.ticket_entrada, ot.placa, ot.fecha_ingreso, ot.fecha_hora_salida, ot.estado AS fase_ot,
            ot.detalles_json, ot.creado_por,
            ot.id_rampa,
            rampa.nombre AS txtRampa,
            situacion.nombre AS txtSituacion, situacion.id AS idSituacion
        FROM ordenes_trabajo ot
        LEFT JOIN cat_rampas rampa ON ot.id_rampa = rampa.id
        LEFT JOIN cat_situaciones situacion ON ot.id_situacion = situacion.id
        WHERE ot.estado != 'Entregado'
        ORDER BY ot.fecha_ingreso DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: "Error MySQL: " + err.message });
        res.json({ data: results });
    });
});

// H. Eliminar una Visita / Status (y sus OTs hijas)
app.delete('/api/taller/status/:ticket_entrada', (req, res) => {
    db.query("DELETE FROM ordenes_trabajo WHERE ticket_entrada = ?", [req.params.ticket_entrada], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query("DELETE FROM trabajos_ot WHERE ticket_visita = ?", [req.params.ticket_entrada], () => {
            res.json({ data: 'Registro eliminado correctamente' });
        });
    });
});

// ============================================================
// GENERADOR DE ÓRDENES DE TRABAJO (HIJAS DE UNA VISITA)
// ============================================================
app.post('/api/taller/generar_ot', (req, res) => {
    const { ticket_visita, tipo_ot, sub_tipo, usuario } = req.body;
    if (!ticket_visita) return res.status(400).json({ error: "Falta el ID de la Visita" });

    const currentYear = new Date().getFullYear();

    db.query("SELECT ultimo_valor, anio FROM secuencias WHERE tipo = 'OT'", (errSeq, rows) => {
        if (errSeq) return res.status(500).json({ error: "Error en secuencias: " + errSeq.message });

        let ultimo = rows.length > 0 ? rows[0].ultimo_valor : 0;
        let dbYear = rows.length > 0 ? rows[0].anio : currentYear;

        if (dbYear !== currentYear) ultimo = 0;
        ultimo += 1;

        const nuevoIdOT = "OT-" + String(ultimo).padStart(4, '0') + "-" + currentYear;

        db.query("UPDATE secuencias SET ultimo_valor = ?, anio = ? WHERE tipo = 'OT'", [ultimo, currentYear], (errUpd) => {
            if (errUpd) return res.status(500).json({ error: "Error actualizando secuencia: " + errUpd.message });

            const detalles = {
                historial: [{ fase: 'Recepción', fecha: new Date().toISOString(), usuario: usuario || 'Admin' }]
            };

            const sql = `INSERT INTO trabajos_ot (id_ot, ticket_visita, tipo_ot, sub_tipo, estado, detalles_json, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?)`;

            db.query(sql, [nuevoIdOT, ticket_visita, tipo_ot || 'Correctivo', sub_tipo || 'Falla', 'Recepción', JSON.stringify(detalles), usuario || 'Admin'], (errInsert) => {
                if (errInsert) return res.status(500).json({ error: "Error guardando OT hija: " + errInsert.message });
                res.json({ data: 'Éxito', id_ot: nuevoIdOT });
            });
        });
    });
});

// G. Obtener solo las OTs Hijas para el Tablero Kanban
app.get('/api/taller/kanban', (req, res) => {
    const sql = `
        SELECT t.*, o.placa, o.id_rampa, r.nombre AS txtRampa
        FROM trabajos_ot t
        JOIN ordenes_trabajo o ON t.ticket_visita = o.ticket_entrada
        LEFT JOIN cat_rampas r ON o.id_rampa = r.id
        WHERE t.estado != 'Entregado'
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: results });
    });
});

// I. Obtener las OTs Hijas de un Ticket de Visita
// L. Obtener los detalles completos de una OT específica
app.get('/api/taller/trabajos/detalle/:id_ot', (req, res) => {
    db.query("SELECT * FROM trabajos_ot WHERE id_ot = ?", [req.params.id_ot], (err, results) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: results[0] || {}});
    });
});

// M. Guardar los Detalles del Trabajo del Mecánico
app.put('/api/taller/trabajos/:id_ot/detalles', (req, res) => {
    const { fecha_trabajo, trabajo_realizado, tecnico, fecha_salida } = req.body;
    const sql = `UPDATE trabajos_ot SET fecha_trabajo = ?, trabajo_realizado = ?, tecnico = ?, fecha_salida = ? WHERE id_ot = ?`;
    db.query(sql, [fecha_trabajo, trabajo_realizado, tecnico, fecha_salida, req.params.id_ot], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: 'Detalles guardados correctamente'});
    });
});

app.get('/api/taller/trabajos/:ticket', (req, res) => {
    db.query("SELECT * FROM trabajos_ot WHERE ticket_visita = ? ORDER BY fecha_creacion DESC", [req.params.ticket], (err, results) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: results});
    });
});

// J. Eliminar una OT Hija específica (Desde el Expediente)
app.delete('/api/taller/trabajos/:id_ot', (req, res) => {
    db.query("DELETE FROM trabajos_ot WHERE id_ot = ?", [req.params.id_ot], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: 'OT eliminada correctamente'});
    });
});

// K. Actualizar el estado (Fase) de una OT Hija en el Kanban
app.put('/api/taller/trabajos/:id_ot/estado', (req, res) => {
    const { estado } = req.body;
    db.query("UPDATE trabajos_ot SET estado = ? WHERE id_ot = ?", [estado, req.params.id_ot], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: 'Estado actualizado correctamente'});
    });
});

// N. Obtener la lista de repuestos de una OT
app.get('/api/taller/trabajos/:id_ot/repuestos', (req, res) => {
    db.query("SELECT * FROM trabajos_ot_repuestos WHERE id_ot = ? ORDER BY id ASC", [req.params.id_ot], (err, results) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: results});
    });
});

// O. Agregar un repuesto/servicio a una OT
app.post('/api/taller/trabajos/:id_ot/repuestos', (req, res) => {
    const { item, cantidad, precio_unitario } = req.body;
    const total = parseFloat(cantidad) * parseFloat(precio_unitario);
    const sql = `INSERT INTO trabajos_ot_repuestos (id_ot, item, cantidad, precio_unitario, total) VALUES (?, ?, ?, ?, ?)`;
    db.query(sql, [req.params.id_ot, item.toUpperCase(), cantidad, precio_unitario, total], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: 'Repuesto agregado'});
    });
});

// P. Eliminar un repuesto de la OT
app.delete('/api/taller/repuestos/:id_repuesto', (req, res) => {
    db.query("DELETE FROM trabajos_ot_repuestos WHERE id = ?", [req.params.id_repuesto], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: 'Repuesto eliminado'});
    });
});

// Q. BÓVEDA: Historial unificado de OTs finalizadas (Status + OT + Repuestos)
app.get('/api/taller/historial', (req, res) => {
    const sql = `
        SELECT t.*, o.placa, o.fecha_ingreso, o.fecha_hora_salida,
               (SELECT SUM(total) FROM trabajos_ot_repuestos WHERE id_ot = t.id_ot) as costo_total
        FROM trabajos_ot t
        JOIN ordenes_trabajo o ON t.ticket_visita = o.ticket_entrada
        WHERE t.estado = 'Entregado'
        ORDER BY t.fecha_salida DESC, t.fecha_creacion DESC
        LIMIT 200
    `;
    db.query(sql, (err, results) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: results});
    });
});

// S. Obtener todas las visitas activas para la Tabla Principal (Con Rampas)
app.get('/api/taller/entradas', (req, res) => {
    const sql = `
        SELECT o.*, r.nombre AS txtRampa
        FROM ordenes_trabajo o
        LEFT JOIN cat_rampas r ON o.id_rampa = r.id
        ORDER BY o.fecha_ingreso DESC
    `;
    db.query(sql, (err, results) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: results});
    });
});

// R. ACTUALIZACIÓN RÁPIDA (QUICK-EDIT APPSHEET): Cambiar Situación de Visita
app.put('/api/taller/entradas/:ticket/estado', (req, res) => {
    db.query("UPDATE ordenes_trabajo SET estado = ? WHERE ticket_entrada = ?", [req.body.estado, req.params.ticket], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({data: 'Situación actualizada correctamente'});
    });
});

// ============================================================
// 📋 MÓDULO AUDITORÍA
// ============================================================
app.get('/api/auditoria', (req, res) => {
    // Garantizar columna modulo antes de consultar
    db.query('ALTER TABLE auditoria ADD COLUMN modulo VARCHAR(50) DEFAULT NULL', () => {
        const { modulo, accion, usuario, limit } = req.query;
        // Usar nombres reales: idAuditoria, fecha, usuario, accion, detalle, modulo
        let sql = 'SELECT idAuditoria AS id, COALESCE(fecha, `timestamp`) AS fecha, usuario, IFNULL(modulo,\'\') AS modulo, accion, detalle FROM auditoria';
        const params = [];
        const conditions = [];
        if (modulo) { conditions.push('modulo = ?'); params.push(modulo); }
        if (accion) { conditions.push('accion = ?'); params.push(accion); }
        if (usuario) { conditions.push('usuario LIKE ?'); params.push('%' + usuario + '%'); }
        if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
        sql += ' ORDER BY idAuditoria DESC LIMIT ?';
        params.push(Math.min(parseInt(limit) || 300, 500));
        db.query(sql, params, (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: results });
        });
    });
});

// ============================================================
// 🎭 ROLES — CRUD COMPLETO
// ============================================================

app.get('/api/roles', (req, res) => {
    const sql = `
        SELECT r.*, COUNT(u.idUsuario) AS miembros
        FROM roles r
        LEFT JOIN usuarios u ON u.rol_id = r.id
        GROUP BY r.id
        ORDER BY r.orden ASC, r.id ASC`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: results });
    });
});

app.post('/api/roles', (req, res) => {
    const { nombre, color, permisos_json, es_admin, orden } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    db.query(
        'INSERT INTO roles (nombre, color, permisos_json, es_admin, orden) VALUES (?, ?, ?, ?, ?)',
        [nombre, color || '#5865F2', permisos_json || '{}', es_admin ? 1 : 0, orden || 0],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            broadcast('usuarios', 'crear_rol');
            res.json({ data: 'Éxito', id: result.insertId });
        }
    );
});

app.put('/api/roles/:id', (req, res) => {
    const { nombre, color, permisos_json, es_admin, orden } = req.body;
    const { id } = req.params;
    db.query(
        'UPDATE roles SET nombre=?, color=?, permisos_json=?, es_admin=?, orden=? WHERE id=?',
        [nombre, color || '#5865F2', permisos_json || '{}', es_admin ? 1 : 0, orden || 0, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            broadcast('usuarios', 'actualizar_rol');
            res.json({ data: 'Éxito' });
        }
    );
});

app.delete('/api/roles/:id', (req, res) => {
    const { id } = req.params;
    db.query('SELECT COUNT(*) AS cnt FROM usuarios WHERE rol_id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results[0].cnt > 0) return res.status(400).json({ error: `Este rol tiene ${results[0].cnt} usuario(s) asignado(s). Reasígnalos antes de eliminar.` });
        db.query('DELETE FROM roles WHERE id=?', [id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            broadcast('usuarios', 'eliminar_rol');
            res.json({ data: 'Éxito' });
        });
    });
});

// ============================================================
// 👤 USUARIOS v2 — ENDPOINTS MODERNOS
// ============================================================

app.post('/api/usuarios-v2', async (req, res) => {
    const { nombre, cargo, correo, password, estado, rol_id } = req.body;
    if (!correo) return res.status(400).json({ error: 'Correo requerido' });
    const rolId = (rol_id && rol_id !== '') ? parseInt(rol_id) || null : null;
    let rol = 'Personalizado';
    if (correo.trim().toLowerCase() === 'admin@azkell.com') rol = 'Fundador';
    const hashedPassword = password ? await bcrypt.hash(password, 10) : '';
    db.query('SELECT idUsuario FROM usuarios', (err, results) => {
        let maxId = 1000;
        if (!err && results) {
            results.forEach(r => {
                if (r.idUsuario && r.idUsuario.startsWith('USR-')) {
                    let num = parseInt(r.idUsuario.split('-')[1]);
                    if (!isNaN(num) && num > maxId) maxId = num;
                }
            });
        }
        const newId = `USR-${maxId + 1}`;
        db.query(
            'INSERT INTO usuarios (idUsuario, nombre, cargo, correo, password, password_visible, rol, estado, permisos_json, rol_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [newId, nombre || '', cargo || '', correo, hashedPassword, password || '', rol, estado || 'Activo', '{}', rolId],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                broadcast('usuarios', 'crear');
                const usuario = req.body.creado_por || 'admin';
                logAudit(usuario, 'usuarios', 'CREÓ', `${nombre || correo}`);
                res.json({ data: 'Éxito', id: newId });
            }
        );
    });
});

app.put('/api/usuarios-v2/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, cargo, correo, password, estado, rol_id } = req.body;
    const rolId = (rol_id !== undefined && rol_id !== '' && rol_id !== null) ? parseInt(rol_id) || null : null;
    let rol = 'Personalizado';
    if (correo && correo.trim().toLowerCase() === 'admin@azkell.com') rol = 'Fundador';
    const fields = ['nombre=?', 'cargo=?', 'correo=?', 'estado=?', 'rol=?', 'rol_id=?'];
    const values = [nombre || '', cargo || '', correo || '', estado || 'Activo', rol, rolId];
    if (password && password.trim() !== '') {
        const hashedPassword = await bcrypt.hash(password.trim(), 10);
        fields.push('password=?'); values.push(hashedPassword);
        fields.push('password_visible=?'); values.push(password.trim());
    }
    values.push(id);
    db.query(`UPDATE usuarios SET ${fields.join(',')} WHERE idUsuario=?`, values, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        broadcast('usuarios', 'actualizar');
        const editor = req.body.editado_por || 'admin';
        logAudit(editor, 'usuarios', 'MODIFICÓ', `${nombre || correo}`);
        res.json({ data: 'Éxito' });
    });
});

// ============================================================
// 🔑 CAMBIO DE CONTRASEÑA (usuario cambia su propia clave)
// ============================================================
app.post('/api/cambiar-password', async (req, res) => {
    const { correo, passwordActual, passwordNueva } = req.body;
    if (!correo || !passwordActual || !passwordNueva)
        return res.status(400).json({ error: 'Datos incompletos' });
    db.query('SELECT password FROM usuarios WHERE correo=?', [correo], async (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
        const hash = rows[0].password;
        const esHash = hash && (hash.startsWith('$2b$') || hash.startsWith('$2a$'));
        const valida = esHash ? await bcrypt.compare(passwordActual, hash) : (passwordActual === hash);
        if (!valida) return res.status(400).json({ error: 'Contraseña actual incorrecta' });
        const nuevoHash = await bcrypt.hash(passwordNueva, 10);
        db.query('UPDATE usuarios SET password=?, password_visible=? WHERE correo=?',
            [nuevoHash, passwordNueva, correo],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                logAudit(correo, 'usuarios', 'CAMBIÓ CONTRASEÑA', 'Auto-cambio de clave');
                res.json({ data: 'Éxito' });
            });
    });
});

// 4. Encender Servidor
app.listen(process.env.PORT || 3000, () => {
    console.log('🚀 Servidor Backend de Azkell corriendo');
});
