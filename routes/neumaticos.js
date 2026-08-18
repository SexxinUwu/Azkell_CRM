const express = require('express');

module.exports = function (db, broadcast, logAudit) {
    const router = express.Router();

    function getDb(req) {
        const d = (req && req.db) ? req.db : db;
        if (!d) return null;
        return (typeof d.promise === 'function') ? d.promise() : d;
    }

    const _tenantsInitSet = new Set();

    const TABLES_SQL = [
        `CREATE TABLE IF NOT EXISTS cat_neumaticos_marcas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL UNIQUE,
            activo TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS cat_neumaticos_modelos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL UNIQUE,
            activo TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS cat_neumaticos_medidas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(50) NOT NULL UNIQUE,
            activo TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS cat_neumaticos_acciones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(50) NOT NULL UNIQUE,
            activo TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS neumaticos_hoja_vida (
            id_neumatico VARCHAR(50) PRIMARY KEY,
            codigo_dot VARCHAR(50) NULL,
            marca VARCHAR(100) NOT NULL,
            modelo VARCHAR(100) NOT NULL,
            medida VARCHAR(50) NOT NULL,
            estado VARCHAR(30) DEFAULT 'NUEVA',
            remanente_inicial INT DEFAULT 18,
            remanente_actual DECIMAL(4,1) DEFAULT 18.0,
            costo_compra DECIMAL(10,2) DEFAULT 0.00,
            km_acumulado INT DEFAULT 0,
            placa_actual VARCHAR(20) NULL,
            posicion_actual VARCHAR(10) NULL,
            estado_operativo ENUM('Montada', 'Stock Taller', 'En Rencauche', 'Desecho') DEFAULT 'Stock Taller',
            fecha_montaje DATE NULL,
            fecha_baja DATE NULL,
            observaciones TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_placa (placa_actual),
            INDEX idx_estado (estado_operativo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS neumaticos_inspecciones (
            id_inspeccion VARCHAR(50) PRIMARY KEY,
            id_ot VARCHAR(50) NULL,
            placa VARCHAR(20) NOT NULL,
            fecha_inspeccion DATE NOT NULL,
            km_vehiculo INT DEFAULT 0,
            dias_propuestos INT DEFAULT 30,
            fecha_proxima DATE NULL,
            observaciones TEXT NULL,
            inspector VARCHAR(100) NOT NULL DEFAULT '',
            total_llantas INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_placa (placa),
            INDEX idx_fecha (fecha_inspeccion)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS neumaticos_inspecciones_det (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_inspeccion VARCHAR(50) NOT NULL,
            id_neumatico VARCHAR(50) NULL,
            posicion VARCHAR(10) NOT NULL,
            marca VARCHAR(100) NOT NULL,
            medida VARCHAR(50) NOT NULL,
            modelo VARCHAR(100) NOT NULL,
            r1 INT DEFAULT 0,
            r2 INT DEFAULT 0,
            r3 INT DEFAULT 0,
            r4 INT DEFAULT 0,
            remanente_promedio DECIMAL(4,1) GENERATED ALWAYS AS (
                CASE WHEN r4 > 0 THEN (r1 + r2 + r3 + r4) / 4.0 ELSE (r1 + r2 + r3) / 3.0 END
            ) STORED,
            presion_ant INT DEFAULT 100,
            presion_actual INT DEFAULT 100,
            estado VARCHAR(30) DEFAULT 'NUEVA',
            accion VARCHAR(50) DEFAULT 'INSPECCION',
            rot VARCHAR(50) DEFAULT 'NO',
            observaciones TEXT NULL,
            foto1 LONGTEXT NULL,
            foto2 LONGTEXT NULL,
            foto3 LONGTEXT NULL,
            alerta_cambio TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_insp (id_inspeccion),
            INDEX idx_pos (posicion)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS neumaticos_rotaciones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_ot VARCHAR(50) NULL,
            placa VARCHAR(20) NOT NULL,
            fecha DATE NOT NULL,
            km_actual INT DEFAULT 0,
            posicion_origen VARCHAR(10) NOT NULL,
            posicion_destino VARCHAR(10) NOT NULL,
            id_neumatico VARCHAR(50) NULL,
            motivo VARCHAR(200) DEFAULT 'Rotación preventiva',
            tecnico VARCHAR(100) NOT NULL DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_placa (placa)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    ];

    async function asegurarTablasNeumaticosTenant(tdb, tenantId) {
        try {
            const pool = (typeof tdb.promise === 'function') ? tdb.promise() : tdb;
            for (const sql of TABLES_SQL) {
                await pool.query(sql);
            }

            // Migrar columnas adicionales de forma segura (sin IF NOT EXISTS para compatibilidad total con MySQL)
            const migCols = [
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN r4 INT DEFAULT 0",
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN rot VARCHAR(50) DEFAULT 'NO'",
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN foto1 LONGTEXT NULL",
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN foto2 LONGTEXT NULL",
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN foto3 LONGTEXT NULL"
            ];
            for (const q of migCols) {
                try { await pool.query(q); } catch(e) {}
            }

            // Unificar collation con el resto de tablas (placas, ordenes_trabajo, etc.)
            try {
                await pool.query("ALTER TABLE neumaticos_inspecciones CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
                await pool.query("ALTER TABLE neumaticos_inspecciones_det CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
                await pool.query("ALTER TABLE neumaticos_hoja_vida CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
                await pool.query("ALTER TABLE neumaticos_rotaciones CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            } catch(eCollate) {
                // ignorar si no requiere conversión
            }

            // Semillas si cat_neumaticos_marcas está vacía
            const [mRows] = await pool.query("SELECT COUNT(*) as cnt FROM cat_neumaticos_marcas");
            if (mRows[0].cnt === 0) {
                const marcasNeu = [
                    'AEOLUS', 'AMBERTONE', 'APLUS', 'ARMORSTEEL', 'AUSTONE', 'AUFINE', 'BLACKLION', 'BRIDGESTONE',
                    'CHAOYANG', 'CONTINENTAL', 'DUNLOP', 'DOUBLESTAR', 'DURATURN', 'DYNACARGO', 'FULLRUN', 'GITI',
                    'GOODYEAR', 'GOODRIDE', 'GOODTYRE', 'GOLDEN CROWN', 'HANKOOK', 'HILO', 'INFINITY', 'JK TYRE',
                    'JINYU', 'KELLY', 'KETER', 'KUMHO', 'KUNLUN', 'LABIGATOR', 'LINGLONG', 'MAISHALL', 'MARSHAL',
                    'MAXELL', 'MAXXIS', 'MICHELIN', 'NIPPON', 'PIRELLI', 'PRINX', 'ROADLUX', 'ROYAL BLACK',
                    'STEELMARK', 'SUPERHAWK', 'TRIANGLE', 'WESTLAKE', 'WINDPOWER', 'WOSEN', 'YOKOHAMA', 'EVERGREEN', 'ROADMASTER'
                ];
                for (const m of marcasNeu) {
                    await pool.query("INSERT IGNORE INTO cat_neumaticos_marcas (nombre) VALUES (?)", [m]);
                }

                const medidasNeu = [
                    '11R22.5', '235/70R17.5', '235/75R17.5', '245/70R17.5', '245/70R19.5', '245/70R22.5',
                    '275/70R22.5', '275/80R22.5', '295/80R22.5', '315/80R22.5', '385/65R22.5', '425/65R22.5',
                    '445/65R22.5', '9.5R17.5'
                ];
                for (const med of medidasNeu) {
                    await pool.query("INSERT IGNORE INTO cat_neumaticos_medidas (nombre) VALUES (?)", [med]);
                }

                const accionesNeu = ['Inspeccion', 'Reparacion', 'Cambio', 'Instalacion', 'Rotacion'];
                for (const ac of accionesNeu) {
                    await pool.query("INSERT IGNORE INTO cat_neumaticos_acciones (nombre) VALUES (?)", [ac]);
                }

                const modelosNeu = [
                    '10558', '17', '366', '785', 'AAR603', 'ACEL2', 'AD153', 'ADR35', 'ADR6', 'ADR8', 'AEL2', 'AEL5',
                    'AF177', 'AG510', 'AGD', 'AGD5', 'AH+', 'AHS', 'AHT', 'AMS', 'AT115A', 'AT121', 'AT161', 'AT27',
                    'AT605', 'AZ126', 'AZ171', 'BA226', 'BAR26', 'BT165', 'C901', 'CITY Y999', 'COUCH GRIP', 'CR960',
                    'CR976A', 'CRUNCH GRIP', 'CST27', 'D200', 'DR919', 'DSR266', 'DUD100', 'E BUS', 'EZ334', 'F820',
                    'FFH123', 'FR01', 'FR88', 'G658', 'GAC812', 'GAR820', 'GAU867', 'GAU867A', 'GDR1', 'GDR665', 'GITI',
                    'GL283A', 'GSR1', 'GSR225', 'GSRI', 'GT198', 'GT867', 'GU01', 'HAI', 'HA1', 'HCT', 'HD', 'HD3',
                    'HH301', 'HKS78', 'HK578', 'HN266', 'HT3', 'HTC', 'HYD', 'IFL866', 'JDH6', 'JDM6', 'JF568', 'JOH6',
                    'JTM1', 'JU558', 'JUH5', 'JULL1', 'JUM', 'K5461', 'KMA01', 'KMAX', 'KMAX D', 'KMAX S', 'KMAX5',
                    'KMAXD', 'KMAX D200', 'KMAX D210', 'KMAX S210', 'KRA01', 'KRA11', 'KRA50', 'KRD50', 'KS461', 'KS481',
                    'KT', 'KT511', 'KT512', 'KT522', 'LLA38', 'LLF01', 'LLFO', 'LUFO1', 'M5A', 'M840', 'M940', 'MC45',
                    'MIX716', 'MSA2', 'MY507A', 'MYSO7', 'NUEVA', 'PROGUO1', 'R152', 'R605', 'RE', 'REE', 'REGIONAL RHZ',
                    'RENCAUCHADA', 'RHS', 'RS201', 'RT605', 'RY023', 'S210', 'SAH02', 'SC216', 'SP580', 'SUPER HA1',
                    'T605', 'TB888', 'TE', 'TH22', 'TR01', 'TR656', 'TR658', 'TR668', 'TR685', 'TR689', 'TRS', 'TRS02',
                    'V1111', 'WGC28', 'WS', 'WS778', 'WS788', 'WS806', 'XLINE', 'XMULTI', 'Y115', 'Y126', 'Y201', 'Y209',
                    'Y631', 'Y99', 'Y999', 'EAU91', 'TR605', 'RM230HH', 'MSS2'
                ];
                for (const mod of modelosNeu) {
                    await pool.query("INSERT IGNORE INTO cat_neumaticos_modelos (nombre) VALUES (?)", [mod]);
                }
            }
            _tenantsInitSet.add(tenantId);
            console.log(`✅ [Multi-Tenant] Tablas y catálogos de neumáticos inicializados en tenant [${tenantId}]`);
        } catch(err) {
            console.error(`⚠️ Error asegurando tablas de neumáticos en tenant [${tenantId}]:`, err.message);
        }
    }

    // Middleware para auto-migrar la BD del tenant en caliente
    router.use(async (req, res, next) => {
        const tenantId = req.tenantSlug || req.headers['x-tenant-id'] || 'default';
        const tdb = getDb(req);
        await asegurarTablasNeumaticosTenant(tdb, tenantId);
        next();
    });

    // ============================================================
    // 1. 📋 CATÁLOGOS (Marcas, Modelos, Medidas, Acciones)
    // ============================================================
    router.get('/catalogos', async (req, res) => {
        try {
            const tdb = getDb(req);
            const [marcas]   = await tdb.query("SELECT nombre FROM cat_neumaticos_marcas WHERE activo = 1 ORDER BY nombre ASC");
            const [modelos]  = await tdb.query("SELECT nombre FROM cat_neumaticos_modelos WHERE activo = 1 ORDER BY nombre ASC");
            const [medidas]  = await tdb.query("SELECT nombre FROM cat_neumaticos_medidas WHERE activo = 1 ORDER BY nombre ASC");
            const [acciones] = await tdb.query("SELECT nombre FROM cat_neumaticos_acciones WHERE activo = 1 ORDER BY id ASC");

            res.json({
                ok: true,
                marcas:   marcas.map(r => r.nombre),
                modelos:  modelos.map(r => r.nombre),
                medidas:  medidas.map(r => r.nombre),
                acciones: acciones.map(r => r.nombre),
                estados:  ['NUEVA', 'RENCAUCHADA']
            });
        } catch (err) {
            console.error("Error obteniendo catálogos de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Registrar nuevo elemento dinámico en caliente
    router.post('/catalogos/:tipo', async (req, res) => {
        try {
            const tdb = getDb(req);
            const tipo = (req.params.tipo || '').toLowerCase();
            const valor = (req.body.nombre || req.body.valor || '').trim().toUpperCase();

            if (!valor) return res.status(400).json({ ok: false, error: 'El nombre es obligatorio' });

            let tabla = '';
            if (tipo === 'marcas' || tipo === 'marca') tabla = 'cat_neumaticos_marcas';
            else if (tipo === 'modelos' || tipo === 'modelo') tabla = 'cat_neumaticos_modelos';
            else if (tipo === 'medidas' || tipo === 'medida') tabla = 'cat_neumaticos_medidas';
            else if (tipo === 'acciones' || tipo === 'accion') tabla = 'cat_neumaticos_acciones';
            else return res.status(400).json({ ok: false, error: 'Tipo de catálogo no válido' });

            await tdb.query(`INSERT IGNORE INTO ${tabla} (nombre) VALUES (?)`, [valor]);
            if (logAudit) logAudit(req, 'NEUMATICOS', 'CREAR_CATALOGO', `Registrado ${tipo}: ${valor}`);

            res.json({ ok: true, mensaje: `${valor} registrado exitosamente`, valor });
        } catch (err) {
            console.error("Error guardando elemento de catálogo:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 2. 🔍 INSPECCIONES (Listar, Obtener, Crear, Eliminar)
    // ============================================================
    router.get('/inspecciones', async (req, res) => {
        try {
            const tdb = getDb(req);
            const { placa, id_ot, limit = 100 } = req.query;

            let sql = `
                SELECT i.*, 
                       (SELECT COUNT(*) FROM neumaticos_inspecciones_det d WHERE d.id_inspeccion = i.id_inspeccion) as total_llantas,
                       (SELECT COUNT(*) FROM neumaticos_inspecciones_det d WHERE d.id_inspeccion = i.id_inspeccion AND d.alerta_cambio = 1) as llantas_criticas
                FROM neumaticos_inspecciones i
                WHERE 1=1
            `;
            const params = [];

            if (placa) {
                sql += " AND i.placa = ?";
                params.push(placa);
            }
            if (id_ot) {
                sql += " AND i.id_ot = ?";
                params.push(id_ot);
            }

            sql += " ORDER BY i.fecha_inspeccion DESC, i.created_at DESC LIMIT ?";
            params.push(parseInt(limit, 10));

            const [rows] = await tdb.query(sql, params);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error("Error obteniendo listado de inspecciones:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.get('/inspecciones/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            const id = req.params.id;

            const [cabecera] = await tdb.query("SELECT * FROM neumaticos_inspecciones WHERE id_inspeccion = ?", [id]);
            if (!cabecera.length) return res.status(404).json({ ok: false, error: 'Inspección no encontrada' });

            const [detalles] = await tdb.query(
                "SELECT * FROM neumaticos_inspecciones_det WHERE id_inspeccion = ? ORDER BY CAST(posicion AS UNSIGNED) ASC, posicion ASC", 
                [id]
            );

            res.json({ ok: true, data: { ...cabecera[0], detalles } });
        } catch (err) {
            console.error("Error obteniendo detalle de inspección de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.post('/inspecciones', async (req, res) => {
        try {
            const tdb = getDb(req);
            const {
                id_ot,
                placa,
                fecha_inspeccion,
                km_vehiculo = 0,
                dias_propuestos = 30,
                observaciones = '',
                inspector = '',
                items = []
            } = req.body;

            if (!placa || !fecha_inspeccion) {
                return res.status(400).json({ ok: false, error: 'Placa y fecha de inspección son requeridas' });
            }

            if (!items || items.length === 0) {
                return res.status(400).json({ ok: false, error: 'Debes agregar al menos una llanta a la inspección' });
            }

            // Asegurar que las columnas existen antes de cualquier inserción
            const migCols = [
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN r4 INT DEFAULT 0",
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN rot VARCHAR(50) DEFAULT 'NO'",
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN foto1 LONGTEXT NULL",
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN foto2 LONGTEXT NULL",
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN foto3 LONGTEXT NULL"
            ];
            for (const q of migCols) {
                try { await tdb.query(q); } catch(e) {}
            }

            // Generar ID único
            const cleanPlaca = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase();
            const cleanFecha = (fecha_inspeccion || '').replace(/-/g, '').substring(0, 8);
            const rand = Math.floor(1000 + Math.random() * 9000);
            const id_inspeccion = `INSP-NEU-${cleanFecha}-${cleanPlaca}-${rand}`;

            // Calcular fecha próxima
            let fechaProxima = null;
            if (fecha_inspeccion) {
                const f = new Date(fecha_inspeccion);
                f.setDate(f.getDate() + (parseInt(dias_propuestos, 10) || 30));
                fechaProxima = f.toISOString().split('T')[0];
            }

            // 1. Iniciar Transacción Atómica
            await tdb.query('START TRANSACTION');

            try {
                // Insertar Cabecera
                await tdb.query(`
                    INSERT INTO neumaticos_inspecciones 
                    (id_inspeccion, id_ot, placa, fecha_inspeccion, km_vehiculo, dias_propuestos, fecha_proxima, observaciones, inspector, total_llantas)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    id_inspeccion,
                    id_ot || null,
                    placa.toUpperCase(),
                    fecha_inspeccion,
                    km_vehiculo || 0,
                    dias_propuestos || 30,
                    fechaProxima,
                    observaciones || '',
                    inspector || '',
                    items.length
                ]);

                // 2. Insertar Detalles
                for (const it of items) {
                    const r1 = parseInt(it.r1 || 0, 10);
                    const r2 = parseInt(it.r2 || 0, 10);
                    const r3 = parseInt(it.r3 || 0, 10);
                    const r4 = parseInt(it.r4 || 0, 10);
                    const rProm = (r4 > 0) ? (r1 + r2 + r3 + r4) / 4.0 : (r1 + r2 + r3) / 3.0;
                    const alertaCambio = rProm <= 4.0 ? 1 : 0;

                    await tdb.query(`
                        INSERT INTO neumaticos_inspecciones_det
                        (id_inspeccion, id_neumatico, posicion, marca, medida, modelo, r1, r2, r3, r4, presion_ant, presion_actual, estado, accion, rot, observaciones, foto1, foto2, foto3, alerta_cambio)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        id_inspeccion,
                        it.id_neumatico || null,
                        String(it.posicion || '1').toUpperCase(),
                        (it.marca || '').toUpperCase(),
                        (it.medida || '').toUpperCase(),
                        (it.modelo || '').toUpperCase(),
                        r1,
                        r2,
                        r3,
                        r4,
                        parseInt(it.presion_ant || 0, 10),
                        parseInt(it.presion_actual || 0, 10),
                        (it.estado || 'NUEVA').toUpperCase(),
                        it.accion || 'Inspeccion',
                        it.rot || 'NO',
                        it.observaciones || '',
                        it.foto1 || null,
                        it.foto2 || null,
                        it.foto3 || null,
                        alertaCambio
                    ]);

                    // Actualizar o Registrar en Hoja de Vida
                    if (it.id_neumatico) {
                        await tdb.query(`
                            INSERT INTO neumaticos_hoja_vida 
                            (id_neumatico, marca, modelo, medida, estado, remanente_actual, placa_actual, posicion_actual, estado_operativo)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Montada')
                            ON DUPLICATE KEY UPDATE 
                                marca = VALUES(marca),
                                modelo = VALUES(modelo),
                                medida = VALUES(medida),
                                remanente_actual = VALUES(remanente_actual),
                                placa_actual = VALUES(placa_actual),
                                posicion_actual = VALUES(posicion_actual),
                                estado_operativo = 'Montada'
                        `, [
                            it.id_neumatico,
                            (it.marca || '').toUpperCase(),
                            (it.modelo || '').toUpperCase(),
                            (it.medida || '').toUpperCase(),
                            (it.estado || 'NUEVA').toUpperCase(),
                            parseFloat(rProm.toFixed(1)),
                            placa.toUpperCase(),
                            String(it.posicion || '1').toUpperCase()
                        ]);
                    }
                }

                await tdb.query('COMMIT');
            } catch (errTx) {
                await tdb.query('ROLLBACK');
                throw errTx;
            }

            res.json({
                ok: true,
                message: 'Inspección de neumáticos registrada exitosamente',
                id_inspeccion,
                fecha_proxima: fechaProxima
            });
        } catch (err) {
            console.error("Error guardando inspección de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.delete('/inspecciones/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            const id = req.params.id;

            await tdb.query("DELETE FROM neumaticos_inspecciones_det WHERE id_inspeccion = ?", [id]);
            await tdb.query("DELETE FROM neumaticos_inspecciones WHERE id_inspeccion = ?", [id]);

            if (logAudit) logAudit(req, 'NEUMATICOS', 'ELIMINAR_INSPECCION', `Inspección ${id} eliminada`);
            if (broadcast) broadcast({ tipo: 'neumaticos_update', id_inspeccion: id });

            res.json({ ok: true, mensaje: 'Inspección eliminada exitosamente' });
        } catch (err) {
            console.error("Error eliminando inspección de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 3. 🔄 REGISTRO Y CONSULTA DE ROTACIONES DE NEUMÁTICOS
    // ============================================================
    router.post('/rotaciones', async (req, res) => {
        try {
            const tdb = getDb(req);
            const {
                id_ot,
                placa,
                fecha,
                km_actual = 0,
                posicion_origen,
                posicion_destino,
                id_neumatico = null,
                motivo = 'Rotación preventiva',
                tecnico = ''
            } = req.body;

            if (!placa || !fecha || !posicion_origen || !posicion_destino) {
                return res.status(400).json({ ok: false, error: 'Placa, fecha y posiciones son requeridas' });
            }

            const [result] = await tdb.query(`
                INSERT INTO neumaticos_rotaciones
                (id_ot, placa, fecha, km_actual, posicion_origen, posicion_destino, id_neumatico, motivo, tecnico)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id_ot || null,
                placa.toUpperCase(),
                fecha,
                km_actual,
                String(posicion_origen).toUpperCase(),
                String(posicion_destino).toUpperCase(),
                id_neumatico,
                motivo,
                tecnico
            ]);

            // Actualizar posición en Hoja de Vida si existe
            if (id_neumatico) {
                await tdb.query(`
                    UPDATE neumaticos_hoja_vida 
                    SET posicion_actual = ?, placa_actual = ?
                    WHERE id_neumatico = ?
                `, [String(posicion_destino).toUpperCase(), placa.toUpperCase(), id_neumatico]);
            }

            res.json({ ok: true, message: 'Rotación registrada exitosamente', id: result.insertId });
        } catch (err) {
            console.error("Error registrando rotación de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 4. 📖 HOJA DE VIDA DE NEUMÁTICOS (HISTORIAL COMPLETO)
    // ============================================================
    router.get('/hoja-vida/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            const id = req.params.id;

            const [neumatico] = await tdb.query("SELECT * FROM neumaticos_hoja_vida WHERE id_neumatico = ?", [id]);
            if (!neumatico.length) return res.status(404).json({ ok: false, error: 'Neumático no encontrado' });

            const [inspecciones] = await tdb.query(`
                SELECT i.fecha_inspeccion, i.km_vehiculo, d.* 
                FROM neumaticos_inspecciones_det d
                INNER JOIN neumaticos_inspecciones i ON d.id_inspeccion COLLATE utf8mb4_unicode_ci = i.id_inspeccion COLLATE utf8mb4_unicode_ci
                WHERE d.id_neumatico = ?
                ORDER BY i.fecha_inspeccion DESC
            `, [id]);

            const [rotaciones] = await tdb.query(`
                SELECT * FROM neumaticos_rotaciones 
                WHERE id_neumatico = ?
                ORDER BY fecha DESC
            `, [id]);

            res.json({
                ok: true,
                data: {
                    ...neumatico[0],
                    historial_inspecciones: inspecciones,
                    historial_rotaciones: rotaciones
                }
            });
        } catch (err) {
            console.error("Error obteniendo hoja de vida del neumático:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 5. 📊 DASHBOARD & ANÁLISIS DE NEUMÁTICOS POR FLOTA
    // ============================================================
    router.get('/analisis', async (req, res) => {
        try {
            const tdb = getDb(req);

            // Limpiar automáticamente inspecciones huérfanas sin llantas registradas
            try {
                await tdb.query(`
                    DELETE FROM neumaticos_inspecciones 
                    WHERE id_inspeccion NOT IN (SELECT DISTINCT id_inspeccion FROM neumaticos_inspecciones_det)
                `);
            } catch(e) {}

            // Total de unidades con inspección
            const [totalInsp] = await tdb.query("SELECT COUNT(*) as total FROM neumaticos_inspecciones");
            
            // Vigencia de inspecciones de la flota activa en uso
            const [vigencias] = await tdb.query(`
                SELECT 
                    CAST(COALESCE(SUM(CASE WHEN fecha_proxima >= CURDATE() THEN 1 ELSE 0 END), 0) AS UNSIGNED) as vigentes,
                    CAST(COALESCE(SUM(CASE WHEN fecha_proxima < CURDATE() THEN 1 ELSE 0 END), 0) AS UNSIGNED) as no_vigentes
                FROM (
                    SELECT i1.placa, i1.fecha_proxima
                    FROM neumaticos_inspecciones i1
                    INNER JOIN (
                        SELECT placa, MAX(fecha_inspeccion) as max_fecha
                        FROM neumaticos_inspecciones
                        GROUP BY placa
                    ) i2 ON i1.placa = i2.placa AND i1.fecha_inspeccion = i2.max_fecha
                    LEFT JOIN placas p ON i1.placa COLLATE utf8mb4_unicode_ci = p.placa COLLATE utf8mb4_unicode_ci
                    WHERE UPPER(TRIM(COALESCE(p.en_uso, 'SI'))) != 'NO'
                ) as ultimas
            `);

            // Total de llantas en estado crítico (Remanente <= 4mm) en la última inspección de flota activa
            const [criticas] = await tdb.query(`
                SELECT COUNT(*) as total_criticas
                FROM neumaticos_inspecciones_det d
                INNER JOIN (
                    SELECT i1.placa, i1.id_inspeccion
                    FROM neumaticos_inspecciones i1
                    INNER JOIN (
                        SELECT placa, MAX(fecha_inspeccion) as max_fecha
                        FROM neumaticos_inspecciones
                        GROUP BY placa
                    ) i2 ON i1.placa = i2.placa AND i1.fecha_inspeccion = i2.max_fecha
                    LEFT JOIN placas p ON i1.placa COLLATE utf8mb4_unicode_ci = p.placa COLLATE utf8mb4_unicode_ci
                    WHERE UPPER(TRIM(COALESCE(p.en_uso, 'SI'))) != 'NO'
                ) last_i ON d.id_inspeccion COLLATE utf8mb4_unicode_ci = last_i.id_inspeccion COLLATE utf8mb4_unicode_ci
                WHERE d.alerta_cambio = 1 OR d.remanente_promedio <= 4.0
            `);

            // Desglose por Marcas más usadas
            const [marcasTop] = await tdb.query(`
                SELECT marca, COUNT(*) as cantidad
                FROM neumaticos_inspecciones_det
                WHERE marca != ''
                GROUP BY marca
                ORDER BY cantidad DESC
                LIMIT 8
            `);

            // Listado de inspecciones con vigencia calculada
            const [listado] = await tdb.query(`
                SELECT i.*, 
                       p.cliente as dueno,
                       DATEDIFF(i.fecha_proxima, CURDATE()) as dias_restantes,
                       (SELECT COUNT(*) FROM neumaticos_inspecciones_det d WHERE d.id_inspeccion COLLATE utf8mb4_unicode_ci = i.id_inspeccion COLLATE utf8mb4_unicode_ci) as total_llantas,
                       (SELECT COUNT(*) FROM neumaticos_inspecciones_det d WHERE d.id_inspeccion COLLATE utf8mb4_unicode_ci = i.id_inspeccion COLLATE utf8mb4_unicode_ci AND d.alerta_cambio = 1) as total_criticas
                FROM neumaticos_inspecciones i
                LEFT JOIN placas p ON i.placa COLLATE utf8mb4_unicode_ci = p.placa COLLATE utf8mb4_unicode_ci
                ORDER BY i.fecha_inspeccion DESC
                LIMIT 200
            `);

            res.json({
                ok: true,
                resumen: {
                    total_inspecciones: totalInsp[0]?.total || 0,
                    vigentes: vigencias[0]?.vigentes || 0,
                    no_vigentes: vigencias[0]?.no_vigentes || 0,
                    llantas_criticas: criticas[0]?.total_criticas || 0
                },
                marcas_top: marcasTop,
                inspecciones: listado
            });
        } catch (err) {
            console.error("Error en análisis de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 6. 🕒 ÚLTIMAS INSPECCIONES DE NEUMÁTICOS POR UNIDAD Y POSICIÓN
    // ============================================================
    router.get('/ultimas', async (req, res) => {
        try {
            const tdb = getDb(req);
            const { empresa } = req.query;

            let sql = `
                SELECT 
                    d.id,
                    i.id_inspeccion,
                    i.fecha_inspeccion,
                    i.placa,
                    i.km_vehiculo as km,
                    d.posicion,
                    d.marca,
                    d.medida,
                    d.modelo,
                    d.r1,
                    d.r2,
                    d.r3,
                    d.r4,
                    d.remanente_promedio,
                    d.presion_ant,
                    d.presion_actual,
                    d.estado,
                    d.accion,
                    d.rot,
                    d.observaciones,
                    d.foto1,
                    d.foto2,
                    d.foto3,
                    d.alerta_cambio,
                    p.cliente as dueno,
                    p.marca as marca_unidad,
                    p.tipo as tipo_unidad,
                    p.motora
                FROM neumaticos_inspecciones_det d
                INNER JOIN (
                    SELECT i1.placa, i1.id_inspeccion
                    FROM neumaticos_inspecciones i1
                    INNER JOIN (
                        SELECT placa, MAX(fecha_inspeccion) as max_fecha
                        FROM neumaticos_inspecciones
                        GROUP BY placa
                    ) i2 ON i1.placa = i2.placa AND i1.fecha_inspeccion = i2.max_fecha
                ) last_i ON d.id_inspeccion COLLATE utf8mb4_unicode_ci = last_i.id_inspeccion COLLATE utf8mb4_unicode_ci
                INNER JOIN neumaticos_inspecciones i ON d.id_inspeccion COLLATE utf8mb4_unicode_ci = i.id_inspeccion COLLATE utf8mb4_unicode_ci
                LEFT JOIN placas p ON i.placa COLLATE utf8mb4_unicode_ci = p.placa COLLATE utf8mb4_unicode_ci
                WHERE 1=1
            `;
            const params = [];

            if (empresa && empresa !== 'Todos') {
                sql += " AND p.cliente = ?";
                params.push(empresa);
            }

            sql += " ORDER BY i.placa ASC, CAST(d.posicion AS UNSIGNED) ASC, d.posicion ASC";

            const [rows] = await tdb.query(sql, params);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error("Error obteniendo últimas inspecciones de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 7. ⚠️ REQUERIMIENTOS DE LLANTAS (Remanente <= 4mm)
    // ============================================================
    router.get('/requerimientos', async (req, res) => {
        try {
            const tdb = getDb(req);
            const { filtro } = req.query; // 'Motora', 'No Motora', 'Todos'

            let sql = `
                SELECT 
                    d.id,
                    i.id_inspeccion,
                    i.fecha_inspeccion,
                    i.placa,
                    i.km_vehiculo as km,
                    d.posicion,
                    d.marca,
                    d.medida,
                    d.modelo,
                    d.r1,
                    d.r2,
                    d.r3,
                    d.r4,
                    d.remanente_promedio,
                    d.presion_ant,
                    d.presion_actual,
                    d.estado,
                    d.accion,
                    d.rot,
                    d.observaciones,
                    d.foto1,
                    d.foto2,
                    d.foto3,
                    p.cliente as dueno,
                    p.marca as marca_unidad,
                    p.tipo as tipo_unidad,
                    p.motora,
                    CASE 
                        WHEN (UPPER(TRIM(p.motora)) IN ('SI','1','MOTORA') OR p.tipo LIKE '%TRACTO%' OR p.tipo LIKE '%CAMION%') AND d.posicion IN ('1','2') THEN 'Delantera'
                        WHEN (UPPER(TRIM(p.motora)) IN ('SI','1','MOTORA') OR p.tipo LIKE '%TRACTO%' OR p.tipo LIKE '%CAMION%') AND d.posicion = 'R' THEN 'Repuesto'
                        WHEN (UPPER(TRIM(p.motora)) IN ('SI','1','MOTORA') OR p.tipo LIKE '%TRACTO%' OR p.tipo LIKE '%CAMION%') THEN 'Tracción'
                        WHEN d.posicion = 'R' THEN 'Repuesto'
                        ELSE 'Arrastre'
                    END as tipo_posicion
                FROM neumaticos_inspecciones_det d
                INNER JOIN (
                    SELECT i1.placa, i1.id_inspeccion
                    FROM neumaticos_inspecciones i1
                    INNER JOIN (
                        SELECT placa, MAX(fecha_inspeccion) as max_fecha
                        FROM neumaticos_inspecciones
                        GROUP BY placa
                    ) i2 ON i1.placa = i2.placa AND i1.fecha_inspeccion = i2.max_fecha
                ) last_i ON d.id_inspeccion COLLATE utf8mb4_unicode_ci = last_i.id_inspeccion COLLATE utf8mb4_unicode_ci
                INNER JOIN neumaticos_inspecciones i ON d.id_inspeccion COLLATE utf8mb4_unicode_ci = i.id_inspeccion COLLATE utf8mb4_unicode_ci
                LEFT JOIN placas p ON i.placa COLLATE utf8mb4_unicode_ci = p.placa COLLATE utf8mb4_unicode_ci
                WHERE (d.alerta_cambio = 1 OR d.remanente_promedio <= 4.0)
            `;
            const params = [];

            if (filtro === 'Motora') {
                sql += " AND (p.motora = 'SI' OR p.motora = '1' OR p.tipo LIKE '%TRACTO%' OR p.tipo LIKE '%CAMION%')";
            } else if (filtro === 'No Motora') {
                sql += " AND (p.motora = 'NO' OR p.motora = '0' OR p.tipo LIKE '%REMOLQUE%' OR p.tipo LIKE '%CARRETA%')";
            }

            sql += " ORDER BY d.remanente_promedio ASC, i.placa ASC";

            const [rows] = await tdb.query(sql, params);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error("Error obteniendo requerimientos de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 8. 🚚 ESTADO ACTUAL DE NEUMÁTICOS POR PLACA (Visor Interactivo)
    // ============================================================
    router.get('/estado-actual/:placa', async (req, res) => {
        try {
            const tdb = getDb(req);
            const placa = (req.params.placa || '').trim().toUpperCase();

            if (!placa) {
                return res.status(400).json({ ok: false, error: 'Placa requerida' });
            }

            // Datos de la unidad desde tabla placas
            const [unidadRows] = await tdb.query(
                "SELECT * FROM placas WHERE placa COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci LIMIT 1",
                [placa]
            );
            const unidad = unidadRows[0] || { placa };

            // Obtener la última inspección de esta placa
            const [inspRows] = await tdb.query(
                "SELECT * FROM neumaticos_inspecciones WHERE placa COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci ORDER BY fecha_inspeccion DESC, created_at DESC LIMIT 1",
                [placa]
            );

            if (!inspRows || inspRows.length === 0) {
                return res.json({
                    ok: true,
                    placa,
                    unidad,
                    ultima_inspeccion: null,
                    posiciones: []
                });
            }

            const ultimaInsp = inspRows[0];

            // Obtener los detalles de las llantas en esa inspección
            const [detalles] = await tdb.query(
                "SELECT * FROM neumaticos_inspecciones_det WHERE id_inspeccion COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci ORDER BY CAST(posicion AS UNSIGNED) ASC, posicion ASC",
                [ultimaInsp.id_inspeccion]
            );

            res.json({
                ok: true,
                placa,
                unidad,
                ultima_inspeccion: ultimaInsp,
                posiciones: detalles || []
            });
        } catch (err) {
            console.error("Error obteniendo estado actual de neumáticos por placa:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── POST /api/neumaticos/importar — Importación masiva desde Excel ──────
    router.post('/importar', async (req, res) => {
        const tdb = getDb(req);
        const { inspecciones = [] } = req.body;

        if (!Array.isArray(inspecciones) || inspecciones.length === 0) {
            return res.status(400).json({ ok: false, error: 'No se recibieron datos de inspecciones para importar' });
        }

        try {
            // Asegurar que las columnas existen
            const migCols = [
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN r4 INT DEFAULT 0",
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN tipo_eje VARCHAR(50) DEFAULT NULL",
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN rot VARCHAR(50) DEFAULT 'NO'",
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN foto1 LONGTEXT NULL",
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN foto2 LONGTEXT NULL",
                "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN foto3 LONGTEXT NULL"
            ];
            for (const q of migCols) {
                try { await tdb.query(q); } catch(e) {}
            }

            await tdb.query('START TRANSACTION');

            let totalImportadas = 0;
            let totalLlantas = 0;

            for (const insp of inspecciones) {
                const placa = (insp.placa || '').trim().toUpperCase();
                let fecha_inspeccion = (insp.fecha_inspeccion || '').trim();
                
                // Formateo seguro de fecha
                if (!fecha_inspeccion || isNaN(new Date(fecha_inspeccion).getTime())) {
                    fecha_inspeccion = new Date().toISOString().split('T')[0];
                } else {
                    try {
                        fecha_inspeccion = new Date(fecha_inspeccion).toISOString().split('T')[0];
                    } catch(e) {
                        fecha_inspeccion = new Date().toISOString().split('T')[0];
                    }
                }

                const km_vehiculo = parseInt(insp.km_vehiculo || 0, 10);
                const items = insp.items || [];

                if (!placa || items.length === 0) continue;

                const cleanPlaca = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                const cleanFecha = (fecha_inspeccion || '').replace(/-/g, '').substring(0, 8);
                const rand = Math.floor(1000 + Math.random() * 9000);
                const id_inspeccion = insp.id_inspeccion || `INSP-NEU-${cleanFecha}-${cleanPlaca}-${rand}`;

                let fechaProxima = null;
                try {
                    const f = new Date(fecha_inspeccion);
                    f.setDate(f.getDate() + 30);
                    fechaProxima = f.toISOString().split('T')[0];
                } catch(e) {
                    fechaProxima = fecha_inspeccion;
                }

                await tdb.query(`
                    INSERT INTO neumaticos_inspecciones 
                    (id_inspeccion, placa, fecha_inspeccion, km_vehiculo, dias_propuestos, fecha_proxima, observaciones, inspector, total_llantas)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                    fecha_inspeccion = VALUES(fecha_inspeccion), km_vehiculo = VALUES(km_vehiculo), total_llantas = VALUES(total_llantas)
                `, [
                    id_inspeccion,
                    placa,
                    fecha_inspeccion,
                    km_vehiculo,
                    30,
                    fechaProxima,
                    insp.observaciones || 'Importación Masiva Excel',
                    'Importador Excel',
                    items.length
                ]);

                // Limpiar detalles antiguos de esta inspección para evitar duplicados o conflictos
                await tdb.query("DELETE FROM neumaticos_inspecciones_det WHERE id_inspeccion = ?", [id_inspeccion]);

                for (const it of items) {
                    const r1 = parseInt(it.r1 || 0, 10);
                    const r2 = parseInt(it.r2 || 0, 10);
                    const r3 = parseInt(it.r3 || 0, 10);
                    const r4 = parseInt(it.r4 || 0, 10);
                    const rProm = (r4 > 0) ? (r1 + r2 + r3 + r4) / 4.0 : (r1 + r2 + r3) / 3.0;
                    const alertaCambio = rProm <= 4.0 ? 1 : 0;

                    await tdb.query(`
                        INSERT INTO neumaticos_inspecciones_det
                        (id_inspeccion, posicion, tipo_eje, marca, medida, modelo, r1, r2, r3, r4, presion_ant, presion_actual, estado, accion, rot, observaciones, foto1, foto2, foto3, alerta_cambio)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        id_inspeccion,
                        String(it.posicion || '1').toUpperCase(),
                        (it.tipo_eje || it.eje || '').toUpperCase(),
                        (it.marca || '').toUpperCase(),
                        (it.medida || '').toUpperCase(),
                        (it.modelo || '').toUpperCase(),
                        r1,
                        r2,
                        r3,
                        r4,
                        parseInt(it.presion_ant || 0, 10),
                        parseInt(it.presion_actual || 0, 10),
                        (it.estado || 'NUEVA').toUpperCase(),
                        it.accion || 'INSPECCION',
                        it.rot || 'NO',
                        it.observaciones || '',
                        it.foto1 || null,
                        it.foto2 || null,
                        it.foto3 || null,
                        alertaCambio
                    ]);
                    totalLlantas++;
                }
                totalImportadas++;
            }

            await tdb.query('COMMIT');
            return res.json({ ok: true, mensaje: `Se importaron ${totalImportadas} inspección(es) con ${totalLlantas} llanta(s) exitosamente.`, totalImportadas, totalLlantas });
        } catch (err) {
            await tdb.query('ROLLBACK');
            console.error("Error en importación de neumáticos:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── GET /api/neumaticos/exportar-datos — Exportación con 27 columnas oficiales ──────
    router.get('/exportar-datos', async (req, res) => {
        const tdb = getDb(req);
        try {
            const sql = `
                SELECT 
                    i.id_inspeccion AS ID,
                    DATE_FORMAT(i.fecha_inspeccion, '%Y-%m-%d') AS 'F. INSPECCION',
                    i.placa AS PLACA,
                    COALESCE(p.estado, 'Activa') AS 'ESTADO LLANT',
                    i.km_vehiculo AS KM,
                    d.posicion AS LLANTA,
                    COALESCE(p.cliente, 'PROPIO') AS 'DUEÑO',
                    COALESCE(p.marca, 'FLOTA') AS MARCA,
                    COALESCE(p.tipo, 'UNIDAD') AS UNIDAD,
                    COALESCE(d.tipo_eje, '') AS 'Delantera o Traccion',
                    d.marca AS 'MARCA DE LLANTA',
                    d.medida AS MEDIDA,
                    d.modelo AS MODELO,
                    d.r1 AS R1,
                    d.r2 AS R2,
                    d.r3 AS R3,
                    d.r4 AS R4,
                    d.presion_ant AS 'PRESION DE AIRE ANT',
                    d.presion_actual AS 'PRESION DE AIRE ACTUAL',
                    d.estado AS ESTADO,
                    d.accion AS ACCION,
                    d.observaciones AS OBS,
                    d.rot AS ROT,
                    LEAST(
                        COALESCE(NULLIF(d.r1, 0), 99),
                        COALESCE(NULLIF(d.r2, 0), 99),
                        COALESCE(NULLIF(d.r3, 0), 99),
                        COALESCE(NULLIF(d.r4, 0), 99)
                    ) AS 'R Min',
                    d.foto1 AS FOTO1,
                    d.foto2 AS FOTO2,
                    d.foto3 AS FOTO3
                FROM neumaticos_inspecciones_det d
                INNER JOIN neumaticos_inspecciones i ON d.id_inspeccion COLLATE utf8mb4_general_ci = i.id_inspeccion COLLATE utf8mb4_general_ci
                LEFT JOIN placas p ON i.placa COLLATE utf8mb4_general_ci = p.placa COLLATE utf8mb4_general_ci
                ORDER BY i.fecha_inspeccion DESC, i.placa ASC, CAST(d.posicion AS UNSIGNED) ASC
            `;
            const [rows] = await tdb.query(sql);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error("Error exportando datos de neumáticos:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    return router;
};
