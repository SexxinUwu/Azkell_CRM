require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Le decimos que permita leer los archivos estáticos (tu estilos.css y logica.js)
app.use(express.static(__dirname));

// Le decimos qué mostrar en la puerta principal (tu link de Render)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Index.html')); // Respeta tu mayúscula
});

// 1. Configurar conexión a MySQL
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false // Esto simula el "Require" que usamos en Workbench
    }
});

db.connect(err => {
    if (err) console.log('Error conectando a BD:', err);
    else console.log('✅ Conectado exitosamente a MySQL Workbench');
});

// 2. API de Login
app.post('/api/login', (req, res) => {
    const { correo, password } = req.body;
    const sql = 'SELECT * FROM usuarios WHERE correo = ?';

    db.query(sql, [correo], (err, results) => {
        if (err) return res.status(500).json({ exito: false, mensaje: "Error BD" });
        if (results.length > 0) {
            const usuario = results[0];
            if (usuario.password === password) {
                if (usuario.estado === 'Inactivo' && correo.toLowerCase() !== 'admin@azkell.com') {
                    return res.json({ exito: false, mensaje: "Cuenta inactiva." });
                }

                let permisosFinales = usuario.permisos_json || "{}";
                let rolFinal = usuario.rol || "Personalizado";

                // 👑 EL BLINDAJE DEL FUNDADOR (Garantiza acceso total siempre)
                if (correo.toLowerCase() === 'admin@azkell.com') {
                    permisosFinales = JSON.stringify({"mantenimiento":{"leer":true,"crear":true,"editar":true,"eliminar":true},"almacen":{"leer":true,"crear":true,"editar":true,"eliminar":true},"flota":{"leer":true,"crear":true,"editar":true,"eliminar":true},"usuarios":{"leer":true,"crear":true,"editar":true,"eliminar":true},"auditoria":{"leer":true,"crear":true,"editar":true,"eliminar":true}});
                    rolFinal = "Administrador";
                }

                return res.json({ exito: true, nombre: usuario.nombre, rol: rolFinal, permisos: permisosFinales });
            } else { return res.json({ exito: false, mensaje: "Contraseña incorrecta." }); }
        } else { return res.json({ exito: false, mensaje: "El correo no está registrado." }); }
    });
});

// 3. 🚀 EL PUENTE DE LECTURA A MYSQL
app.post('/api/script/:metodo', async (req, res) => {
    const metodo = req.params.metodo;
    console.log(`📡 El sistema solicitó: ${metodo}`);

    // --- LEER PLACAS DESDE MYSQL ---
    if (metodo === 'obtenerDatosPlacas') {
        db.query('SELECT * FROM placas', (err, results) => {
            if (err) {
                console.error("Error leyendo placas:", err);
                return res.json({ data: [] });
            }
            console.log(`✅ Se encontraron ${results.length} placas en MySQL`);
            
            // Formateamos las placas para que el HTML las dibuje
            const data = results.map(r => [
                r.placa || r.PLACA || r.Placa || '', 
                r.cliente || r.CLIENTE || r.Cliente || '', 
                r.tipo || r.TIPO || r.Tipo || '', 
                r.modelo_uts || r.MODELO_UTS || r['Modelo UTS'] || '', 
                r.marca || r.MARCA || r.Marca || '', 
                r.ruc_dni || r.RUC_DNI || r['RUC / DNI'] || '', 
                r.configuracion || r.CONFIGURACION || r.Configuracion || '', 
                r.combustible || r.COMBUSTIBLE || r.Combustible || '', 
                r.estado || r.ESTADO || r.Estado || '', 
                r.operativo || r.OPERATIVO || r.Operativo || '', 
                r.uts || r.UTS || r.Uts || '', 
                r.motora || r.MOTORA || r.Motora || '', 
                r.llantas || r.LLANTAS || r.Llantas || '', 
                r.en_uso || r.EN_USO || r['En Uso'] || ''
            ]);
            return res.json({ data });
        });
        return;
    }

    // --- LEER FLEETRUN DESDE MYSQL ---
    if (metodo === 'obtenerDatosFleetrun') {
        db.query('SELECT * FROM fleetrun', (err, results) => {
            if (err) return res.json({ data: [] });
            const data = results.map(r => [
                r.idRegistro || r.IDREGISTRO || '', r.fecha || r.FECHA || '', r.mes || r.MES || '', 
                r.anio || r.ANIO || '', r.placa || r.PLACA || '', r.marca || r.MARCA || '', 
                r.dueno || r.DUENO || '', r.uts || r.UTS || '', r.tipo_mp || r.TIPO_MP || '', 
                r.km_actual || r.KM_ACTUAL || '', r.frecuencia_km || r.FRECUENCIA_KM || '', 
                r.km_proximo || r.KM_PROXIMO || '', r.observacion || r.OBSERVACION || '', 
                r.tecnico || r.TECNICO || '', r.km_gps || r.KM_GPS || ''
            ]);
            return res.json({ data });
        });
        return;
    }

    // --- OBTENER TODOS LOS USUARIOS (BLINDADO CON PERMISOS JSON) ---
    if (metodo === 'obtenerDatosUsuarios') {
        const query = "SELECT idUsuario, nombre, cargo, correo, password, rol, estado, permisos_json FROM usuarios";
        db.query(query, (err, results) => {
            if (err) return res.status(500).json({ data: "Error BD: " + err.message });

            const filas = results.map(r => {
                let permisosFinales = {};
                let correoMin = (r.correo || '').trim().toLowerCase();

                // 👑 EL BLINDAJE DEL FUNDADOR: Ignoramos lo que diga la BD para este correo
                if (correoMin === 'admin@azkell.com') {
                    permisosFinales = {"mantenimiento":{"leer":true,"crear":true,"editar":true,"eliminar":true},"almacen":{"leer":true,"crear":true,"editar":true,"eliminar":true},"flota":{"leer":true,"crear":true,"editar":true,"eliminar":true},"usuarios":{"leer":true,"crear":true,"editar":true,"eliminar":true},"auditoria":{"leer":true,"crear":true,"editar":true,"eliminar":true}};
                } else {
                    // 🧠 LECTOR SEGURO DE JSON PARA OTROS USUARIOS
                    try {
                        let raw = r.permisos_json || '{}';
                        // Si el JSON se guardó doblemente encapsulado, lo corregimos
                        permisosFinales = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                        if (typeof permisosFinales === 'string') permisosFinales = JSON.parse(permisosFinales);
                    } catch (e) {
                        console.error(`Error parseando permisos de ${r.correo}:`, e);
                        permisosFinales = {}; // Retornamos vacío si está corrupto
                    }
                }

                // Retornamos el formato de matriz que espera la tabla
                return [
                    r.idUsuario, r.nombre, r.cargo, r.correo, r.rol, r.estado, r.password,
                    JSON.stringify(permisosFinales) // Lo enviamos como texto limpio
                ];
            });
            return res.json({ data: filas });
        });
        return;
    }

    // --- LEER INSPECCIONES DESDE MYSQL ---
    if (metodo === 'obtenerDatosInspecciones') {
        db.query('SELECT * FROM inspecciones', (err, results) => {
            if (err) return res.json({ data: [] });
            return res.json({ data: results });
        });
        return;
    }

    // --- LEER STATUS FLOTA DESDE MYSQL ---
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

    // --- GUARDAR STATUS FLOTA ---
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

        // Consulta SQL (Inserta nuevo o actualiza si ya existe)
        const query = `
            INSERT INTO status_flota
            (idRegistro, fecha, corte, unidad_motora, unidad_no_motora, cliente_motora, cliente_nomotora, zona, conductor, estado, observaciones, usuario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            fecha=?, corte=?, unidad_motora=?, unidad_no_motora=?, cliente_motora=?, cliente_nomotora=?, zona=?, conductor=?, estado=?, observaciones=?, usuario=?
        `;

        const values = [
            id, fecha, corte, motora, nomotora, cliMotora, cliNoMotora, zona, conductor, estado, obs, usuario,
            fecha, corte, motora, nomotora, cliMotora, cliNoMotora, zona, conductor, estado, obs, usuario
        ];

        db.query(query, values, (err, results) => {
            if (err) {
                console.error("❌ Error BD Status Flota:", err);
                return res.json({ data: "Error al guardar en Base de Datos" });
            }
            console.log("✅ Status Flota guardado correctamente");
            return res.json({ data: "Éxito" });
        });
        return;
    }

    // --- GUARDAR INSPECCIÓN MECÁNICA (WIZARD) ---
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
            datos.id, datos.placa, datos.fecha_ingreso, datos.cliente, datos.tecnico, datos.km_tablero, datos.dias_propuestos, datos.detalles_json, datos.firma_base64,
            datos.placa, datos.fecha_ingreso, datos.cliente, datos.tecnico, datos.km_tablero, datos.dias_propuestos, datos.detalles_json, datos.firma_base64
        ];

        db.query(query, values, (err) => {
            if(err) {
                console.error("Error BD Inspecciones:", err);
                return res.json({ data: "Error al guardar inspección" });
            }
            console.log("✅ Inspección guardada correctamente");
            return res.json({ data: "Éxito" });
        });
        return;
    }

    // --- ELIMINAR DOCUMENTO (Placas, Fleetrun, StatusFlota, Usuarios, etc) ---
    if (metodo === 'eliminarDocumento') {
        const id = req.body.id;
        const coleccion = req.body.coleccion;
        const usuario = req.body.usuario;

        let sql = '';

        if (coleccion === 'Placas') {
            sql = 'DELETE FROM placas WHERE placa = ?';
        } else if (coleccion === 'Fleetrun') {
            sql = 'DELETE FROM fleetrun WHERE idRegistro = ?';
        } else if (coleccion === 'StatusFlota') {
            sql = 'DELETE FROM status_flota WHERE idRegistro = ?';
        } else if (coleccion === 'Usuarios') {
            sql = 'DELETE FROM usuarios WHERE idUsuario = ?';
        } else if (coleccion === 'Seguridad') {
            sql = 'DELETE FROM seguridad WHERE id = ?';
        } else if (coleccion === 'Inspecciones') {
            sql = 'DELETE FROM inspecciones WHERE id = ?';
        }

        if (!sql) {
            return res.json({ data: "Colección no válida" });
        }

        db.query(sql, [id], (err, results) => {
            if (err) {
                console.error("❌ Error eliminando:", err);
                return res.json({ data: "Error al eliminar registro" });
            }
            console.log(`✅ Eliminado ${id} de ${coleccion}`);
            return res.json({ data: "Éxito" });
        });
        return;
    }

    // --- GUARDAR / ACTUALIZAR USUARIOS (SEGURO) ---
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

            // Bloquear edición maliciosa del Fundador
            if (correo.trim().toLowerCase() === 'admin@azkell.com') {
                permisos = JSON.stringify({"mantenimiento":{"leer":true,"crear":true,"editar":true,"eliminar":true},"almacen":{"leer":true,"crear":true,"editar":true,"eliminar":true},"flota":{"leer":true,"crear":true,"editar":true,"eliminar":true},"usuarios":{"leer":true,"crear":true,"editar":true,"eliminar":true},"auditoria":{"leer":true,"crear":true,"editar":true,"eliminar":true}});
                estado = "Activo"; rol = "Administrador";
            }

            if (typeof permisos === 'object') permisos = JSON.stringify(permisos);

            if (isEdit) {
                // 🛠️ UPDATE SEGURO: Actualiza forzosamente el ID exacto
                const sqlUpdate = "UPDATE usuarios SET nombre=?, cargo=?, correo=?, password=?, estado=?, permisos_json=?, rol=? WHERE idUsuario=?";
                db.query(sqlUpdate, [nombre, cargo, correo, password, estado, permisos, rol, idFinal], (err) => {
                    if (err) return res.json({ data: "Error BD: " + err.message });
                    return res.json({ data: "Éxito" });
                });
            } else {
                // 🛠️ INSERT SEGURO
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
            // Generador de ID Perfecto (Busca el número mayor y le suma 1)
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

    // --- GUARDAR / ACTUALIZAR PLACAS ---
    if (metodo === 'guardarPlaca' || metodo === 'actualizarPlaca') {
        const form = req.body.args[0];
        const isEdit = metodo === 'actualizarPlaca';
        const placa = (isEdit ? form.editP_placa : form.p_placa).toUpperCase();
        const cliente = isEdit ? form.editP_cliente : form.p_cliente;
        const tipo = isEdit ? form.editP_tipo : form.p_tipo;
        const modelo = isEdit ? form.editP_modelo : form.p_modelo;
        const marca = isEdit ? form.editP_marca : form.p_marca;
        const ruc = isEdit ? form.editP_ruc : form.p_ruc;
        const conf = isEdit ? form.editP_conf : form.p_conf;
        const comb = isEdit ? form.editP_comb : form.p_comb;
        const estado = isEdit ? form.editP_estado : form.p_estado;
        const operativo = isEdit ? form.editP_operativo : form.p_operativo;
        const uts = isEdit ? form.editP_uts : form.p_uts;
        const motora = isEdit ? form.editP_motora : form.p_motora;
        const llantas = isEdit ? form.editP_llantas : form.p_llantas;
        const enuso = isEdit ? form.editP_enuso : form.p_enuso;

        const query = `
            INSERT INTO placas (placa, cliente, tipo, modelo_uts, marca, ruc_dni, configuracion, combustible, estado, operativo, uts, motora, llantas, en_uso)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            cliente=?, tipo=?, modelo_uts=?, marca=?, ruc_dni=?, configuracion=?, combustible=?, estado=?, operativo=?, uts=?, motora=?, llantas=?, en_uso=?
        `;
        const values = [placa, cliente, tipo, modelo, marca, ruc, conf, comb, estado, operativo, uts, motora, llantas, enuso];
        db.query(query, [...values, cliente, tipo, modelo, marca, ruc, conf, comb, estado, operativo, uts, motora, llantas, enuso], (err) => {
            if (err) return res.json({ data: "Error BD: " + err.message });
            return res.json({ data: "Éxito" });
        });
        return;
    }

    // --- GUARDAR / ACTUALIZAR FLEETRUN ---
    if (metodo === 'guardarFleetrun' || metodo === 'actualizarFleetrun') {
        const form = req.body.args[0];
        const isEdit = metodo === 'actualizarFleetrun';
        const id = isEdit ? form.editF_id : (form.f_id || `FL-${Date.now()}`);
        const fecha = isEdit ? form.editF_fecha : form.f_fecha;
        const mes = isEdit ? form.editF_mes : form.f_mes;
        const anio = isEdit ? form.editF_anio : form.f_anio;
        const placa = (isEdit ? form.editF_placa : form.f_placa).toUpperCase();
        const marca = isEdit ? form.editF_marca : form.f_marca;
        const dueno = isEdit ? form.editF_dueno : form.f_dueno;
        const uts = isEdit ? form.editF_uts : form.f_uts;
        const tipomp = isEdit ? form.editF_tipomp : form.f_tipomp;
        const kmact = isEdit ? form.editF_kmact : form.f_kmact;
        const freckm = isEdit ? form.editF_freckm : form.f_freckm;
        const kmprox = isEdit ? form.editF_kmprox : form.f_kmprox;
        const kmgps = isEdit ? form.editF_kmgps : form.f_kmgps;
        const tec = isEdit ? form.editF_tec : form.f_tec;
        const obs = isEdit ? form.editF_obs : form.f_obs;

        const query = `
            INSERT INTO fleetrun (idRegistro, fecha, mes, anio, placa, marca, dueno, uts, tipo_mp, km_actual, frecuencia_km, km_proximo, observacion, tecnico, km_gps)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            fecha=?, mes=?, anio=?, placa=?, marca=?, dueno=?, uts=?, tipo_mp=?, km_actual=?, frecuencia_km=?, km_proximo=?, observacion=?, tecnico=?, km_gps=?
        `;
        const values = [id, fecha, mes, anio, placa, marca, dueno, uts, tipomp, kmact, freckm, kmprox, obs, tec, kmgps];
        db.query(query, [...values, fecha, mes, anio, placa, marca, dueno, uts, tipomp, kmact, freckm, kmprox, obs, tec, kmgps], (err) => {
            if (err) return res.json({ data: "Error BD: " + err.message });
            return res.json({ data: "Éxito" });
        });
        return;
    }

    // --- GUARDAR / ACTUALIZAR SEGURIDAD ---
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
            const detalle = form.detalle || "";
            db.query('INSERT INTO seguridad (idReporte, fecha, inspector, tipo, detalle, estado) VALUES (?, ?, ?, ?, ?, ?)', [id, fecha, inspector, tipo, detalle, estado], (err) => {
                if (err) return res.json({ data: "Error BD: " + err.message });
                return res.json({ data: "Éxito" });
            });
        }
        return;
    }

    // --- CONDUCTORES ---
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

    // --- LISTAS DE APOYO (Para Mantenimientos) ---
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
            const data = results.map(r => r.tipo_mant);
            return res.json({ data });
        });
        return;
    }

    // --- ASISTENTE IA GEMINI ---
    if (metodo === 'consultarGemini') {
        const prompt = req.body.args[0];
        const resumenContexto = req.body.args[1];

        const apiKey = "AIzaSyAOloEWep_cl3_5fwfJdLJqE1elj_Kd_qU";
        const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;

        const payload = {
            "contents": [{
                "parts": [{
                    "text": "Eres el asistente experto del CRM de AZKELL. " + resumenContexto + ".\nResponde de forma útil, breve y profesional a esta consulta del usuario: " + prompt
                }]
            }]
        };

        try {
            const aiRes = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const json = await aiRes.json();
            if (json.error) return res.json({ data: "Error IA: " + json.error.message });
            return res.json({ data: json.candidates[0].content.parts[0].text });
        } catch (e) {
            return res.json({ data: "Error conexión IA: " + e.message });
        }
    }

    // --- 📡 API DE WIALON GPS (Nativo Node.js) ---
    if (metodo === 'obtenerDatosWialon') {
        const token = "b0a4947147e59c66f42703bca5df48a1B33E01E58063AD32AF788F04F09F24F4F88692AC";
        const baseUrl = "https://hst-api.wialon.us/wialon/ajax.html";

        try {
            // 1. Iniciar sesión Wialon
            const loginRes = await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({token: token}))}`);
            const loginData = await loginRes.json();
            if (!loginData.eid) return res.json({ data: { error: "Fallo Login Wialon." }});

            const sid = loginData.eid;

            // 2. Extraer datos (Flags 9221: trae datos completos + medidores + ubicación GPS)
            const searchParams = {
                "spec": { "itemsType": "avl_unit", "propName": "sys_name", "propValueMask": "*", "sortType": "sys_name" },
                "force": 1, "flags": 9221, "from": 0, "to": 0
            };
            const searchRes = await fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(searchParams))}&sid=${sid}`);
            const searchData = await searchRes.json();

            if (!searchData.items) return res.json({ data: [] });

            const vehiculosLive = [];
            searchData.items.forEach(item => {
                const rawName = item.nm ? item.nm.toUpperCase().trim() : "";

                // Limpiamos la placa: quitamos guiones y espacios
                let placaLimpia = rawName.replace(/[^A-Z0-9]/g, '');
                // Obligamos a que agarre exactamente los 6 caracteres principales
                const matchPlaca = placaLimpia.match(/[A-Z0-9]{6}/);
                if (matchPlaca) placaLimpia = matchPlaca[0];

                if (rawName) {
                    vehiculosLive.push({
                        nombre_wialon: rawName,
                        placa: placaLimpia,
                        km: item.cnm_km ? Math.round(item.cnm_km) : 0,
                        horas: item.cneh ? Math.round(item.cneh) : 0,
                        lat: item.pos ? item.pos.y : 0,
                        lng: item.pos ? item.pos.x : 0
                    });
                }
            });

            // 3. Cerrar sesión
            fetch(`${baseUrl}?svc=core/logout&params=%7B%7D&sid=${sid}`).catch(e=>{});
            return res.json({ data: vehiculosLive });
        } catch (error) {
            console.error("Error Wialon:", error);
            return res.json({ data: { error: error.toString() }});
        }
    }

    // Si pide otra cosa, devolvemos vacío para que no colapse
    res.json({ data: [] });
});

// 4. Encender Servidor
app.listen(process.env.PORT || 3000, () => {
    console.log('🚀 Servidor Backend de Azkell corriendo en http://localhost:3000');
});