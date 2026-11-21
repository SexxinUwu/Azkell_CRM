// Caja chica: /api/tesoreria/caja-chica
// Flujo: asignación (Tesorería + Gerencia) → gastos (con o sin OC) → sustento (3 días hábiles)
// → aprobación de gastos (Tesorería + Gerencia) → reposición (Tesorería, aprobada por ambos).
const express = require('express');
const multer = require('multer');
const { uploadToS3 } = require('../utils/s3');
const {
    asegurarTablas, hoyIso, sumarDiasHabiles, saldoFondo, pendienteOc, registrarEgresoCentral,
} = require('../services/caja_chica');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const ESTADOS_OC_PAGABLES = ['aprobado', 'autorizado', 'pago parcial'];

module.exports = function (db, broadcast, logAudit) {
    const router = express.Router();

    function getDb(req) {
        const d = (req && req.db) ? req.db : db;
        if (!d) return null;
        return (typeof d.promise === 'function') ? d.promise() : d;
    }
    const claveBase = req => (req && req.db) ? req.db : db;
    const usuarioDe = req => (req.user && (req.user.nombre || req.user.correo)) || 'Sistema';
    const redondear = n => Math.round(Number(n) * 100) / 100;
    const auditar = (req, accion, texto) => { if (typeof logAudit === 'function') logAudit(req, 'tesoreria/caja-chica', accion, texto); };

    /** Prepara la base (tablas) y devuelve el acceso listo para consultar */
    async function preparar(req) {
        const tdb = getDb(req);
        await asegurarTablas(tdb, claveBase(req));
        return tdb;
    }

    async function subirComprobante(file, prefijo) {
        const ext = (file.originalname.split('.').pop() || 'pdf').toLowerCase();
        const key = `caja_chica/${prefijo}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
        return uploadToS3(file.buffer, key, file.mimetype);
    }

    async function filaPorId(tdb, tabla, id) {
        const [rows] = await tdb.query(`SELECT * FROM ${tabla} WHERE id = ?`, [id]);
        return rows[0] || null;
    }

    /** Registra la aprobación de Tesorería o de Gerencia (solo la primera vez) y devuelve la fila actualizada */
    async function aprobarPor(tdb, tabla, id, rol, usuario) {
        const col = rol === 'tesoreria' ? 'aprob_tesoreria' : 'aprob_gerencia';
        await tdb.query(`UPDATE ${tabla} SET ${col}_por = ?, ${col}_at = NOW() WHERE id = ? AND ${col}_por IS NULL`, [usuario, id]);
        return filaPorId(tdb, tabla, id);
    }

    // ── Fondos ─────────────────────────────────────────────────────────────

    router.get('/fondos', async (req, res) => {
        try {
            const tdb = await preparar(req);
            const hoy = await hoyIso(tdb);
            const [rows] = await tdb.query(`
                SELECT f.*,
                    COALESCE(s.saldo, 0) AS saldo,
                    COALESCE(p.pendientes, 0) AS pendientes,
                    COALESCE(v.vencidos, 0) AS vencidos
                FROM caja_chica_fondos f
                LEFT JOIN (SELECT fondo_id, SUM(CASE WHEN tipo = 'INGRESO' THEN monto ELSE -monto END) AS saldo FROM caja_chica_movimientos GROUP BY fondo_id) s ON s.fondo_id = f.id
                LEFT JOIN (SELECT fondo_id, COUNT(*) AS pendientes FROM caja_chica_movimientos WHERE concepto = 'GASTO' AND estado_sustento = 'PENDIENTE' GROUP BY fondo_id) p ON p.fondo_id = f.id
                LEFT JOIN (SELECT fondo_id, COUNT(*) AS vencidos FROM caja_chica_movimientos WHERE concepto = 'GASTO' AND estado_sustento = 'PENDIENTE' AND plazo_vence < ? GROUP BY fondo_id) v ON v.fondo_id = f.id
                ORDER BY f.estado = 'ACTIVA' DESC, f.responsable ASC, f.moneda ASC`, [hoy]);
            res.json(rows.map(r => ({ ...r, saldo: redondear(r.saldo) })));
        } catch (err) {
            console.error('Error en GET caja-chica/fondos:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/fondos/:id', async (req, res) => {
        try {
            const tdb = await preparar(req);
            const fondo = await filaPorId(tdb, 'caja_chica_fondos', req.params.id);
            if (!fondo) return res.status(404).json({ error: 'Caja chica no encontrada' });
            const [movimientos] = await tdb.query('SELECT * FROM caja_chica_movimientos WHERE fondo_id = ? ORDER BY fecha ASC, id ASC', [fondo.id]);
            const saldo = await saldoFondo(tdb, fondo.id);
            res.json({ ...fondo, saldo, movimientos });
        } catch (err) {
            console.error('Error en GET caja-chica/fondos/:id:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Asignación: la crea Tesorería; no tiene efecto hasta que Tesorería y Gerencia la aprueben
    router.post('/fondos', async (req, res) => {
        try {
            const tdb = await preparar(req);
            const b = req.body || {};
            const responsable = String(b.responsable || '').trim();
            const moneda = String(b.moneda || '').toUpperCase() === 'DOLARES' ? 'DOLARES' : 'SOLES';
            const monto = redondear(b.monto);
            if (!responsable) return res.status(400).json({ error: 'Indica el responsable de la caja chica.' });
            if (!(monto > 0)) return res.status(400).json({ error: 'Indica el monto de la asignación.' });
            if (!String(b.cuenta_origen || '').trim()) return res.status(400).json({ error: 'Indica de qué cuenta de la empresa sale el dinero.' });
            // Un responsable tiene una sola caja chica por moneda
            const [dup] = await tdb.query(
                "SELECT id FROM caja_chica_fondos WHERE responsable = ? AND moneda = ? AND estado IN ('PENDIENTE', 'ACTIVA')",
                [responsable, moneda]
            );
            if (dup.length) return res.status(409).json({ error: `${responsable} ya tiene una caja chica en ${moneda === 'DOLARES' ? 'dólares' : 'soles'}.` });
            const [r] = await tdb.query(
                'INSERT INTO caja_chica_fondos (responsable, moneda, monto_asignado, cuenta_origen, descripcion, estado, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [responsable, moneda, monto, String(b.cuenta_origen).trim(), String(b.descripcion || '').trim() || null, 'PENDIENTE', usuarioDe(req)]
            );
            auditar(req, 'CREÓ', `Asignación de caja chica a ${responsable} por ${moneda} ${monto}`);
            res.json({ ok: true, id: r.insertId });
        } catch (err) {
            console.error('Error en POST caja-chica/fondos:', err);
            res.status(500).json({ error: err.message });
        }
    });

    async function aprobarAsignacion(req, res, rol) {
        try {
            const tdb = await preparar(req);
            const fondo = await filaPorId(tdb, 'caja_chica_fondos', req.params.id);
            if (!fondo) return res.status(404).json({ error: 'Caja chica no encontrada' });
            if (fondo.estado !== 'PENDIENTE') return res.status(409).json({ error: 'La asignación ya no está pendiente de aprobación.' });
            const usuario = usuarioDe(req);
            const actual = await aprobarPor(tdb, 'caja_chica_fondos', fondo.id, rol, usuario);
            if (actual.aprob_tesoreria_por && actual.aprob_gerencia_por) {
                // Aprobada por ambos: el dinero sale de la caja central y entra al fondo
                const hoy = await hoyIso(tdb);
                await tdb.query("UPDATE caja_chica_fondos SET estado = 'ACTIVA' WHERE id = ?", [fondo.id]);
                await tdb.query(
                    "INSERT INTO caja_chica_movimientos (fondo_id, tipo, concepto, fecha, monto, descripcion, creado_por) VALUES (?, 'INGRESO', 'ASIGNACION', ?, ?, ?, ?)",
                    [fondo.id, hoy, fondo.monto_asignado, `Asignación de caja chica a ${fondo.responsable}`, usuario]
                );
                await registrarEgresoCentral(tdb, {
                    monto: fondo.monto_asignado, moneda: fondo.moneda, cuentaEmpresa: fondo.cuenta_origen,
                    descripcion: `ASIGNACIÓN CAJA CHICA: ${fondo.responsable}`, usuario,
                });
            }
            auditar(req, 'APROBÓ', `Aprobó (${rol}) la asignación de caja chica ${fondo.id} a ${fondo.responsable}`);
            res.json({ ok: true, estado: actual.aprob_tesoreria_por && actual.aprob_gerencia_por ? 'ACTIVA' : 'PENDIENTE' });
        } catch (err) {
            console.error('Error aprobando asignación de caja chica:', err);
            res.status(500).json({ error: err.message });
        }
    }
    router.post('/fondos/:id/aprobar-tesoreria', (req, res) => aprobarAsignacion(req, res, 'tesoreria'));
    router.post('/fondos/:id/aprobar-gerencia', (req, res) => aprobarAsignacion(req, res, 'gerencia'));

    // ── OC pagables con caja chica ────────────────────────────────────────

    // OCs aprobadas o con pago parcial, con lo que falta pagar, en la moneda del fondo
    router.get('/ocs', async (req, res) => {
        try {
            const tdb = await preparar(req);
            const fondoId = req.query.fondo_id;
            let monedaOc = null;
            if (fondoId) {
                const fondo = await filaPorId(tdb, 'caja_chica_fondos', fondoId);
                monedaOc = fondo && fondo.moneda === 'DOLARES' ? 'USD' : 'PEN';
            }
            const [ocs] = await tdb.query(
                `SELECT id FROM entradas_inv WHERE LOWER(TRIM(estado)) IN (${ESTADOS_OC_PAGABLES.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 300`,
                ESTADOS_OC_PAGABLES
            );
            const lista = [];
            for (const o of ocs) {
                const p = await pendienteOc(tdb, o.id);
                if (!p || p.pendiente <= 0) continue;
                if (monedaOc && String(p.oc.moneda || '').toUpperCase() !== monedaOc) continue;
                lista.push({
                    id: p.oc.id, proveedor: p.oc.proveedor_nombre, documento: p.oc.documento_referencia,
                    moneda: String(p.oc.moneda || '').toUpperCase(), total: p.total, pagado: p.pagado, pendiente: p.pendiente,
                    estado: p.oc.estado,
                });
            }
            res.json(lista);
        } catch (err) {
            console.error('Error en GET caja-chica/ocs:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── Gastos ───────────────────────────────────────────────────────────

    router.post('/fondos/:id/gastos', upload.single('comprobante'), async (req, res) => {
        try {
            const tdb = await preparar(req);
            const fondo = await filaPorId(tdb, 'caja_chica_fondos', req.params.id);
            if (!fondo) return res.status(404).json({ error: 'Caja chica no encontrada' });
            if (fondo.estado !== 'ACTIVA') return res.status(409).json({ error: 'La caja chica no está activa: falta la aprobación de Tesorería y Gerencia.' });
            const b = req.body || {};
            const monto = redondear(b.monto);
            if (!(monto > 0)) return res.status(400).json({ error: 'Indica el monto del gasto.' });
            if (!String(b.descripcion || '').trim()) return res.status(400).json({ error: 'Describe el gasto.' });
            if (!String(b.motivo || '').trim()) return res.status(400).json({ error: 'Indica el motivo del gasto.' });
            const fecha = String(b.fecha || '').slice(0, 10) || await hoyIso(tdb);

            const saldo = await saldoFondo(tdb, fondo.id);
            if (monto > saldo) return res.status(409).json({ error: `Saldo insuficiente: el fondo tiene ${fondo.moneda === 'DOLARES' ? 'US$' : 'S/'} ${saldo.toFixed(2)} y el gasto es de ${monto.toFixed(2)}. Faltan ${(monto - saldo).toFixed(2)}.` });

            const ocId = String(b.oc_id || '').trim() || null;
            let ocPendiente = null;
            if (ocId) {
                ocPendiente = await pendienteOc(tdb, ocId);
                if (!ocPendiente) return res.status(404).json({ error: 'Orden de compra no encontrada' });
                if (!ESTADOS_OC_PAGABLES.includes(String(ocPendiente.oc.estado || '').toLowerCase().trim())) {
                    return res.status(409).json({ error: `La orden no se puede pagar: su estado es "${ocPendiente.oc.estado}".` });
                }
                const monedaFondo = fondo.moneda === 'DOLARES' ? 'USD' : 'PEN';
                if (String(ocPendiente.oc.moneda || '').toUpperCase() !== monedaFondo) {
                    return res.status(409).json({ error: 'La moneda de la orden no coincide con la de la caja chica.' });
                }
                if (monto > ocPendiente.pendiente) {
                    return res.status(409).json({ error: `La orden solo tiene pendiente ${ocPendiente.pendiente.toFixed(2)}.` });
                }
            }

            const comprobante = req.file ? await subirComprobante(req.file, 'gasto') : null;
            const usuario = usuarioDe(req);
            const plazo = comprobante ? null : sumarDiasHabiles(fecha, 3);
            const [r] = await tdb.query(`
                INSERT INTO caja_chica_movimientos (fondo_id, tipo, concepto, fecha, monto, descripcion, motivo, sub_motivo, centro_costo, placa, proveedor, oc_id,
                    comprobante_url, estado_sustento, plazo_vence, sustentado_at, creado_por)
                VALUES (?, 'EGRESO', 'GASTO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [fondo.id, fecha, monto, String(b.descripcion).trim(), String(b.motivo).trim(), String(b.sub_motivo || '').trim() || null,
                    String(b.centro_costo || '').trim() || null, String(b.placa || '').trim() || null, String(b.proveedor || '').trim() || null,
                    ocId, comprobante, comprobante ? 'SUSTENTADO' : 'PENDIENTE', plazo, comprobante ? new Date() : null, usuario]);

            // Pago de una OC: queda pagada si cubre todo lo pendiente; si no, queda en pago parcial
            if (ocId) {
                const restante = redondear(ocPendiente.pendiente - monto);
                if (restante <= 0.005) {
                    await tdb.query("UPDATE entradas_inv SET estado = 'Procesado', pagado_por = ?, fecha_pago = NOW(), numero_operacion = ? WHERE id = ?",
                        [usuario, `CAJA CHICA #${r.insertId}`, ocId]);
                } else {
                    await tdb.query("UPDATE entradas_inv SET estado = 'Pago parcial' WHERE id = ?", [ocId]);
                }
            }
            auditar(req, 'REGISTRÓ', `Gasto de caja chica ${fondo.id} por ${monto}: ${String(b.descripcion).trim()}${ocId ? ` (OC ${ocId})` : ''}`);
            res.json({ ok: true, id: r.insertId, sustento: comprobante ? 'SUSTENTADO' : 'PENDIENTE', plazo_vence: plazo });
        } catch (err) {
            console.error('Error registrando gasto de caja chica:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Sube el voucher o la constancia de pago del gasto dentro del plazo
    router.post('/movimientos/:id/sustento', upload.single('comprobante'), async (req, res) => {
        try {
            const tdb = await preparar(req);
            const mov = await filaPorId(tdb, 'caja_chica_movimientos', req.params.id);
            if (!mov || mov.concepto !== 'GASTO') return res.status(404).json({ error: 'Gasto no encontrado' });
            if (mov.estado_sustento === 'DESCONTADO') return res.status(409).json({ error: 'El gasto ya fue descontado al responsable: ya no admite sustento.' });
            if (!req.file) return res.status(400).json({ error: 'Adjunta el voucher o la constancia de pago.' });
            const url = await subirComprobante(req.file, 'sustento');
            await tdb.query("UPDATE caja_chica_movimientos SET comprobante_url = ?, estado_sustento = 'SUSTENTADO', plazo_vence = NULL, sustentado_at = NOW() WHERE id = ?", [url, mov.id]);
            auditar(req, 'SUSTENTÓ', `Sustento del gasto de caja chica ${mov.id}`);
            res.json({ ok: true, url });
        } catch (err) {
            console.error('Error subiendo sustento de caja chica:', err);
            res.status(500).json({ error: err.message });
        }
    });

    async function aprobarGasto(req, res, rol) {
        try {
            const tdb = await preparar(req);
            const mov = await filaPorId(tdb, 'caja_chica_movimientos', req.params.id);
            if (!mov || mov.concepto !== 'GASTO') return res.status(404).json({ error: 'Gasto no encontrado' });
            if (mov.estado_sustento !== 'SUSTENTADO') return res.status(409).json({ error: 'Solo se aprueba un gasto con sustento.' });
            await aprobarPor(tdb, 'caja_chica_movimientos', mov.id, rol, usuarioDe(req));
            auditar(req, 'APROBÓ', `Aprobó (${rol}) el gasto de caja chica ${mov.id}`);
            res.json({ ok: true });
        } catch (err) {
            console.error('Error aprobando gasto de caja chica:', err);
            res.status(500).json({ error: err.message });
        }
    }
    router.post('/movimientos/:id/aprobar-tesoreria', (req, res) => aprobarGasto(req, res, 'tesoreria'));
    router.post('/movimientos/:id/aprobar-gerencia', (req, res) => aprobarGasto(req, res, 'gerencia'));

    // Vencido el plazo sin sustento, Tesorería o Gerencia confirman el descuento al responsable.
    // El responsable repone ese monto al fondo (ingreso de descuento), y el gasto deja de ser reponible.
    router.post('/movimientos/:id/descontar', async (req, res) => {
        try {
            const tdb = await preparar(req);
            const [filas] = await tdb.query("SELECT *, DATE_FORMAT(plazo_vence, '%Y-%m-%d') AS plazo_txt FROM caja_chica_movimientos WHERE id = ?", [req.params.id]);
            const mov = filas[0];
            if (!mov || mov.concepto !== 'GASTO') return res.status(404).json({ error: 'Gasto no encontrado' });
            if (mov.estado_sustento !== 'PENDIENTE') return res.status(409).json({ error: 'Solo se descuenta un gasto sin sustento.' });
            const hoy = await hoyIso(tdb);
            const vence = mov.plazo_txt || null;
            if (!vence || vence >= hoy) return res.status(409).json({ error: 'El plazo para sustentar todavía no vence.' });
            const usuario = usuarioDe(req);
            await tdb.query("UPDATE caja_chica_movimientos SET estado_sustento = 'DESCONTADO' WHERE id = ?", [mov.id]);
            await tdb.query(
                "INSERT INTO caja_chica_movimientos (fondo_id, tipo, concepto, fecha, monto, descripcion, creado_por) VALUES (?, 'INGRESO', 'DESCUENTO', ?, ?, ?, ?)",
                [mov.fondo_id, hoy, mov.monto, `Descuento al responsable por falta de sustento del gasto ${mov.id}`, usuario]
            );
            auditar(req, 'DESCONTÓ', `Descontó al responsable el gasto sin sustento ${mov.id} por ${mov.monto}`);
            res.json({ ok: true });
        } catch (err) {
            console.error('Error descontando gasto de caja chica:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── Reposiciones ─────────────────────────────────────────────────────

    // Tesorería reúne los gastos sustentados y aprobados por Tesorería y Gerencia, y pide la reposición
    router.post('/fondos/:id/reposiciones', async (req, res) => {
        try {
            const tdb = await preparar(req);
            const fondo = await filaPorId(tdb, 'caja_chica_fondos', req.params.id);
            if (!fondo) return res.status(404).json({ error: 'Caja chica no encontrada' });
            if (fondo.estado !== 'ACTIVA') return res.status(409).json({ error: 'La caja chica no está activa.' });
            const cuenta = String((req.body || {}).cuenta_origen || '').trim();
            if (!cuenta) return res.status(400).json({ error: 'Indica de qué cuenta de la empresa sale la reposición.' });
            const [gastos] = await tdb.query(
                "SELECT id, monto FROM caja_chica_movimientos WHERE fondo_id = ? AND concepto = 'GASTO' AND estado_sustento = 'SUSTENTADO' AND aprob_tesoreria_por IS NOT NULL AND aprob_gerencia_por IS NOT NULL AND reposicion_id IS NULL",
                [fondo.id]
            );
            if (!gastos.length) return res.status(409).json({ error: 'No hay gastos sustentados y aprobados por Tesorería y Gerencia para reponer.' });
            const monto = redondear(gastos.reduce((s, g) => s + Number(g.monto), 0));
            const [r] = await tdb.query(
                'INSERT INTO caja_chica_reposiciones (fondo_id, monto, cuenta_origen, estado, creado_por) VALUES (?, ?, ?, ?, ?)',
                [fondo.id, monto, cuenta, 'PENDIENTE', usuarioDe(req)]
            );
            await tdb.query('UPDATE caja_chica_movimientos SET reposicion_id = ? WHERE id IN (?)', [r.insertId, gastos.map(g => g.id)]);
            auditar(req, 'CREÓ', `Reposición de caja chica ${fondo.id} por ${monto} (${gastos.length} gastos)`);
            res.json({ ok: true, id: r.insertId, monto, gastos: gastos.length });
        } catch (err) {
            console.error('Error creando reposición de caja chica:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/reposiciones', async (req, res) => {
        try {
            const tdb = await preparar(req);
            const [rows] = await tdb.query(`
                SELECT r.*, f.responsable, f.moneda
                FROM caja_chica_reposiciones r JOIN caja_chica_fondos f ON f.id = r.fondo_id
                ORDER BY r.id DESC LIMIT 300`);
            res.json(rows);
        } catch (err) {
            console.error('Error en GET caja-chica/reposiciones:', err);
            res.status(500).json({ error: err.message });
        }
    });

    async function aprobarReposicion(req, res, rol) {
        try {
            const tdb = await preparar(req);
            const rep = await filaPorId(tdb, 'caja_chica_reposiciones', req.params.id);
            if (!rep) return res.status(404).json({ error: 'Reposición no encontrada' });
            if (rep.estado !== 'PENDIENTE') return res.status(409).json({ error: 'La reposición ya no está pendiente.' });
            const usuario = usuarioDe(req);
            const actual = await aprobarPor(tdb, 'caja_chica_reposiciones', rep.id, rol, usuario);
            if (actual.aprob_tesoreria_por && actual.aprob_gerencia_por) {
                const fondo = await filaPorId(tdb, 'caja_chica_fondos', rep.fondo_id);
                const hoy = await hoyIso(tdb);
                const centralId = await registrarEgresoCentral(tdb, {
                    monto: rep.monto, moneda: fondo.moneda, cuentaEmpresa: rep.cuenta_origen,
                    descripcion: `REPOSICIÓN CAJA CHICA: ${fondo.responsable}`, usuario,
                });
                await tdb.query(
                    "INSERT INTO caja_chica_movimientos (fondo_id, tipo, concepto, fecha, monto, descripcion, reposicion_id, creado_por) VALUES (?, 'INGRESO', 'REPOSICION', ?, ?, ?, ?, ?)",
                    [rep.fondo_id, hoy, rep.monto, `Reposición aprobada #${rep.id}`, rep.id, usuario]
                );
                await tdb.query("UPDATE caja_chica_reposiciones SET estado = 'APROBADA', caja_central_id = ? WHERE id = ?", [centralId, rep.id]);
            }
            auditar(req, 'APROBÓ', `Aprobó (${rol}) la reposición de caja chica ${rep.id}`);
            res.json({ ok: true, estado: actual.aprob_tesoreria_por && actual.aprob_gerencia_por ? 'APROBADA' : 'PENDIENTE' });
        } catch (err) {
            console.error('Error aprobando reposición de caja chica:', err);
            res.status(500).json({ error: err.message });
        }
    }
    router.post('/reposiciones/:id/aprobar-tesoreria', (req, res) => aprobarReposicion(req, res, 'tesoreria'));
    router.post('/reposiciones/:id/aprobar-gerencia', (req, res) => aprobarReposicion(req, res, 'gerencia'));

    return router;
};
