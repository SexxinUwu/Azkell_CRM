require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

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
    const sql = 'SELECT * FROM Usuarios WHERE correo = ?';
    db.query(sql, [correo], (err, results) => {
        if (err) return res.status(500).json({ exito: false, mensaje: "Error BD" });
        if (results.length > 0) {
            const usuario = results[0];
            if (usuario.password === password) {
                if (usuario.estado === 'Inactivo') return res.json({ exito: false, mensaje: "Cuenta inactiva." });
                return res.json({ exito: true, nombre: usuario.nombre, rol: usuario.rol });
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

    // --- LEER USUARIOS DESDE MYSQL ---
    if (metodo === 'obtenerDatosUsuarios') {
        db.query('SELECT * FROM usuarios', (err, results) => {
            if (err) return res.json({ data: [] });
            const data = results.map(r => [
                r.idUsuario || r.IDUSUARIO || '', r.nombre || r.NOMBRE || '', 
                r.cargo || r.CARGO || '', r.correo || r.CORREO || '', 
                r.rol || r.ROL || '', r.estado || r.ESTADO || '', 
                r.password || r.PASSWORD || ''
            ]);
            return res.json({ data });
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