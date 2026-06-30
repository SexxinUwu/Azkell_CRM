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
        fecha=VALUES(fecha), placa=VALUES(placa), marca=VALUES(marca), dueno=VALUES(dueno), uts=VALUES(uts), tipo_mp=VALUES(tipo_mp), km_actual=VALUES(km_actual),
        frecuencia_km=VALUES(frecuencia_km), km_proximo=VALUES(km_proximo), km_gps=VALUES(km_gps), tecnico=VALUES(tecnico), observacion=VALUES(observacion),
        mes=VALUES(mes), anio=VALUES(anio), combustible=VALUES(combustible), modelo=VALUES(modelo), combustible=VALUES(combustible), carga_util=VALUES(carga_util),
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
            
            const vals = lote.map(r => {
                let marca = r.marca || '';
                let dueno = r.dueno || '';
                let uts = r.uts || '';
                let comb = r.combustible || '';
                let mod = r.modelo || '';
                let wkm = r.km_gps || '';
                return [r.id, r.mes, r.anio, r.fecha, r.placa, marca, dueno, uts, r.tipomp, r.kmact, r.freckm, r.kmprox, wkm, r.tec, r.obs, comb, mod];
            });


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
        fecha=VALUES(fecha), placa=VALUES(placa), marca=VALUES(marca), dueno=VALUES(dueno), uts=VALUES(uts), tipo_mp=VALUES(tipo_mp), km_actual=VALUES(km_actual),
        frecuencia_km=VALUES(frecuencia_km), km_proximo=VALUES(km_proximo), km_gps=VALUES(km_gps), tecnico=VALUES(tecnico), observacion=VALUES(observacion),
        mes=VALUES(mes), anio=VALUES(anio), combustible=VALUES(combustible), modelo=VALUES(modelo)
    `;

    const validos = registros.filter(r => {
        if (!r.placa || r.placa === "") { errCount++; return false; }
        return true;
    });

    if (validos.length > 0) {
        for (let i = 0; i < validos.length; i += 500) {
            const lote = validos.slice(i, i + 500);
            
            const vals = lote.map(r => {
                let marca = r.marca || '';
                let dueno = r.dueno || '';
                let uts = r.uts || '';
                let comb = r.combustible || '';
                let mod = r.modelo || '';
                let wkm = r.km_gps || '';
                return [r.id, r.mes, r.anio, r.fecha, r.placa, marca, dueno, uts, r.tipomp, r.kmact, r.freckm, r.kmprox, wkm, r.tec, r.obs, comb, mod];
            });


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
