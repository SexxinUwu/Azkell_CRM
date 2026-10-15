// Almacén de flota: un almacén virtual por unidad (placa).
//
// - ASIGNAR: se entrega artículos del almacén a una unidad. Queda como una salida despachada con
//   destino "Vehiculo" y la placa; baja el stock del almacén igual que cualquier salida (Kardex intacto).
// - DEVOLVER: lo que se le saca a la unidad vuelve al almacén como una entrada de ajuste, y se
//   registra en flota_devoluciones para que el saldo de la unidad baje.
// - Saldo de la unidad = asignado (salidas despachadas a la placa) − devuelto (flota_devoluciones).
//
// Se monta dentro de routes/almacen.js porque necesita la misma fórmula de stock (stockSQL).

const TABLA_DEVOLUCIONES = `CREATE TABLE IF NOT EXISTS flota_devoluciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha DATE NOT NULL,
    placa VARCHAR(20) NOT NULL,
    inventario_id VARCHAR(20) NOT NULL,
    cantidad DECIMAL(14,4) NOT NULL,
    entrada_id VARCHAR(20) NULL,
    observaciones TEXT NULL,
    usuario VARCHAR(120) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fd_placa (placa, inventario_id)
)`;

const hoyISO = () => new Date().toISOString().slice(0, 10);
const placaLimpia = v => String(v ?? '').trim().toUpperCase();
const numero = v => Number(v) || 0;

// Saldo por unidad y artículo: asignado − devuelto. Opcionalmente filtra por placa y artículos.
function sqlSaldo(filtro = '') {
    return `
        SELECT x.placa, x.inventario_id, ROUND(SUM(x.cant), 4) AS saldo
        FROM (
            SELECT UPPER(TRIM(s.placa)) AS placa, d.inventario_id, d.cantidad AS cant
            FROM detalle_salidas_inv d
            JOIN salidas_inv s ON s.id = d.salida_id
            WHERE s.estado = 'Despachado' AND s.tipo_destino = 'Vehiculo'
              AND s.placa IS NOT NULL AND d.inventario_id IS NOT NULL
            UNION ALL
            SELECT fd.placa, fd.inventario_id, -fd.cantidad AS cant
            FROM flota_devoluciones fd
        ) x
        ${filtro}
        GROUP BY x.placa, x.inventario_id
        HAVING saldo > 0.0001`;
}

module.exports = function registrarAlmacenFlota(router, ctx) {
    const { getDb, logAudit, generarCodigo, stockSQL } = ctx;

    const promesa = (tdb) => (tdb.promise ? tdb.promise() : tdb);
    const codigo = (tipo, anio) => new Promise((resolve, reject) =>
        generarCodigo(tipo, anio, (err, id) => (err ? reject(err) : resolve(id))));

    async function asegurarTablas(p) {
        await p.query(TABLA_DEVOLUCIONES);
    }

    // Líneas válidas del cuerpo: { inventario_id, cantidad } con cantidad > 0, sin repetidos
    function lineasDe(items) {
        const acum = new Map();
        (Array.isArray(items) ? items : []).forEach(it => {
            const id = String(it.inventario_id ?? '').trim();
            const cant = numero(it.cantidad);
            if (id && cant > 0) acum.set(id, (acum.get(id) ?? 0) + cant);
        });
        return [...acum].map(([inventario_id, cantidad]) => ({ inventario_id, cantidad }));
    }

    // Resumen de todas las unidades que tienen artículos
    router.get('/flota/resumen', async (req, res) => {
        try {
            const tdb = getDb(req);
            const p = promesa(tdb);
            await asegurarTablas(p);
            const [filas] = await p.query(`
                SELECT z.placa, COUNT(*) AS articulos, ROUND(SUM(z.saldo), 4) AS piezas,
                       ROUND(SUM(z.saldo * COALESCE(i.costo_referencial, 0)), 2) AS valor
                FROM (${sqlSaldo()}) z
                LEFT JOIN inventario i ON i.id = z.inventario_id
                GROUP BY z.placa
                ORDER BY z.placa`);
            const [ult] = await p.query(`
                SELECT placa, MAX(fecha) AS ultimo FROM (
                    SELECT UPPER(TRIM(s.placa)) AS placa, DATE(s.fecha) AS fecha FROM salidas_inv s
                    WHERE s.tipo_destino = 'Vehiculo' AND s.estado = 'Despachado' AND s.placa IS NOT NULL
                    UNION ALL
                    SELECT fd.placa, fd.fecha FROM flota_devoluciones fd
                ) m GROUP BY placa`);
            const ultimo = new Map(ult.map(r => [r.placa, r.ultimo]));
            res.json({
                ok: true,
                unidades: filas.map(f => ({ ...f, ultimo: ultimo.get(f.placa) ?? null })),
            });
        } catch (err) {
            console.error('Error almacén de flota (resumen):', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Artículos que tiene una unidad y su historial de asignaciones y devoluciones
    router.get('/flota/unidades/:placa', async (req, res) => {
        try {
            const tdb = getDb(req);
            const p = promesa(tdb);
            await asegurarTablas(p);
            const placa = placaLimpia(req.params.placa);
            const [saldo] = await p.query(`
                SELECT z.inventario_id, z.saldo, i.descripcion, i.unidad, i.familia,
                       COALESCE(i.costo_referencial, 0) AS costo_referencial
                FROM (${sqlSaldo('WHERE x.placa = ?')}) z
                LEFT JOIN inventario i ON i.id = z.inventario_id
                ORDER BY i.descripcion`, [placa]);
            const [movimientos] = await p.query(`
                SELECT * FROM (
                    SELECT s.fecha AS fecha, 'ASIGNACION' AS tipo, s.id AS documento, d.inventario_id,
                           COALESCE(i.descripcion, d.descripcion) AS descripcion, d.cantidad, s.creado_por AS usuario,
                           s.observaciones
                    FROM detalle_salidas_inv d
                    JOIN salidas_inv s ON s.id = d.salida_id
                    LEFT JOIN inventario i ON i.id = d.inventario_id
                    WHERE UPPER(TRIM(s.placa)) = ? AND s.tipo_destino = 'Vehiculo' AND s.estado = 'Despachado'
                    UNION ALL
                    SELECT fd.fecha, 'DEVOLUCION', fd.entrada_id, fd.inventario_id, i.descripcion, fd.cantidad,
                           fd.usuario, fd.observaciones
                    FROM flota_devoluciones fd
                    LEFT JOIN inventario i ON i.id = fd.inventario_id
                    WHERE fd.placa = ?
                ) h
                ORDER BY h.fecha DESC, h.documento DESC
                LIMIT 300`, [placa, placa]);
            res.json({ ok: true, placa, saldo, movimientos });
        } catch (err) {
            console.error('Error almacén de flota (unidad):', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Asignar artículos del almacén a una unidad: genera una salida despachada a la placa
    router.post('/flota/asignar', async (req, res) => {
        try {
            const tdb = getDb(req);
            const p = promesa(tdb);
            await asegurarTablas(p);
            const { placa, fecha, observaciones, usuario, items } = req.body || {};
            const pl = placaLimpia(placa);
            const lineas = lineasDe(items);
            if (!pl) return res.status(400).json({ ok: false, error: 'Elige la unidad.' });
            if (!lineas.length) return res.status(400).json({ ok: false, error: 'Elige al menos un artículo con cantidad.' });

            const [stk] = await p.query(
                `SELECT z.id, z.descripcion, z.stock_actual, z.costo_referencial FROM (${stockSQL}) z WHERE z.id IN (?)`,
                [lineas.map(l => l.inventario_id)]);
            const mapa = new Map(stk.map(r => [r.id, r]));
            const faltan = [];
            lineas.forEach(l => {
                const r = mapa.get(l.inventario_id);
                if (!r) faltan.push(`${l.inventario_id} no existe o está inactivo`);
                else if (l.cantidad > (Number(r.stock_actual) || 0)) faltan.push(`"${r.descripcion}" (pides ${l.cantidad}, hay ${Math.max(0, Number(r.stock_actual) || 0)})`);
            });
            if (faltan.length) return res.status(400).json({ ok: false, error: 'Stock insuficiente en el almacén:\n• ' + faltan.join('\n• ') });

            const fechaSal = (fecha || hoyISO()).slice(0, 10);
            const id = await codigo('SAL', new Date(fechaSal).getFullYear());
            const total = lineas.reduce((a, l) => a + l.cantidad * (Number(mapa.get(l.inventario_id).costo_referencial) || 0), 0);
            const obs = [`Asignación a unidad ${pl}`, observaciones].filter(Boolean).join(' · ');

            await p.query(
                `INSERT INTO salidas_inv (id, fecha, tipo_destino, placa, moneda, tipo_cambio, total_pen, observaciones, creado_por, estado)
                 VALUES (?, ?, 'Vehiculo', ?, 'PEN', 1, ?, ?, ?, 'Despachado')`,
                [id, fechaSal, pl, total, obs, usuario || null]);
            await p.query(
                'INSERT INTO detalle_salidas_inv (salida_id, inventario_id, descripcion, cantidad, costo_unitario, moneda, importe) VALUES ?',
                [lineas.map(l => {
                    const r = mapa.get(l.inventario_id);
                    const costo = Number(r.costo_referencial) || 0;
                    return [id, l.inventario_id, r.descripcion, l.cantidad, costo, 'PEN', l.cantidad * costo];
                })]);

            if (typeof logAudit === 'function') logAudit(usuario || 'sistema', 'almacen', 'ASIGNÓ A UNIDAD', `${id} → ${pl}: ${lineas.length} artículo(s)`);
            res.json({ ok: true, id, mensaje: `Se asignaron ${lineas.length} artículo(s) a ${pl}.` });
        } catch (err) {
            console.error('Error asignando a unidad:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Devolver artículos de la unidad al almacén: entrada de ajuste + registro de devolución
    router.post('/flota/devolver', async (req, res) => {
        try {
            const tdb = getDb(req);
            const p = promesa(tdb);
            await asegurarTablas(p);
            const { placa, fecha, observaciones, usuario, items } = req.body || {};
            const pl = placaLimpia(placa);
            const lineas = lineasDe(items);
            if (!pl) return res.status(400).json({ ok: false, error: 'Elige la unidad.' });
            if (!lineas.length) return res.status(400).json({ ok: false, error: 'Elige al menos un artículo con cantidad.' });

            const [saldo] = await p.query(
                `SELECT z.inventario_id, z.saldo, i.descripcion, COALESCE(i.costo_referencial, 0) AS costo_referencial
                 FROM (${sqlSaldo('WHERE x.placa = ? AND x.inventario_id IN (?)')}) z
                 LEFT JOIN inventario i ON i.id = z.inventario_id`,
                [pl, lineas.map(l => l.inventario_id)]);
            const mapa = new Map(saldo.map(r => [r.inventario_id, r]));
            const faltan = [];
            lineas.forEach(l => {
                const r = mapa.get(l.inventario_id);
                const disp = r ? Number(r.saldo) || 0 : 0;
                if (l.cantidad > disp) faltan.push(`"${r?.descripcion ?? l.inventario_id}" (quieres devolver ${l.cantidad}, la unidad tiene ${disp})`);
            });
            if (faltan.length) return res.status(400).json({ ok: false, error: 'La unidad no tiene esa cantidad:\n• ' + faltan.join('\n• ') });

            const fechaEnt = (fecha || hoyISO()).slice(0, 10);
            const id = await codigo('ENT', new Date(fechaEnt).getFullYear());
            const total = lineas.reduce((a, l) => a + l.cantidad * (Number(mapa.get(l.inventario_id).costo_referencial) || 0), 0);
            const obs = [`Devolución de unidad ${pl}`, observaciones].filter(Boolean).join(' · ');

            await p.query(
                `INSERT INTO entradas_inv (id, fecha, moneda, tipo_cambio, total_pen, observaciones, creado_por, motivo_entrada, placa, tipo_orden)
                 VALUES (?, ?, 'PEN', 1, ?, ?, ?, 'DEVOLUCIÓN DE UNIDAD', ?, 'Ajuste')`,
                [id, fechaEnt, total, obs, usuario || null, pl]);
            await p.query(
                'INSERT INTO detalle_entradas_inv (entrada_id, inventario_id, descripcion, cantidad, costo_unitario, moneda, importe) VALUES ?',
                [lineas.map(l => {
                    const r = mapa.get(l.inventario_id);
                    const costo = Number(r.costo_referencial) || 0;
                    return [id, l.inventario_id, r.descripcion, l.cantidad, costo, 'PEN', l.cantidad * costo];
                })]);
            await p.query(
                'INSERT INTO flota_devoluciones (fecha, placa, inventario_id, cantidad, entrada_id, observaciones, usuario) VALUES ?',
                [lineas.map(l => [fechaEnt, pl, l.inventario_id, l.cantidad, id, observaciones || null, usuario || null])]);

            if (typeof logAudit === 'function') logAudit(usuario || 'sistema', 'almacen', 'DEVOLVIÓ DE UNIDAD', `${id} ← ${pl}: ${lineas.length} artículo(s)`);
            res.json({ ok: true, id, mensaje: `Se devolvieron ${lineas.length} artículo(s) de ${pl} al almacén.` });
        } catch (err) {
            console.error('Error devolviendo desde unidad:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });
};
