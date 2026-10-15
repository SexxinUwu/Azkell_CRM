// Almacén de flota: stock propio, separado del inventario general (no toca inventario, salidas_inv ni entradas_inv).
//
// Tablas (se crean solas si no existen):
// - flota_articulos:  catálogo propio del almacén de flota.
// - flota_documentos: una operación = un documento. Código FI (ingreso), FA (asignación), FR (reingreso).
// - flota_movimientos: líneas de cada documento; es el kardex. No se editan ni se borran: un error se corrige con otro documento.
//
// Saldos: siempre se calculan desde los movimientos, nunca se guardan aparte.
// - Almacén de un artículo = ingresos + reingresos − asignaciones.
// - Unidad (placa) = asignaciones − reingresos de esa placa.
//
// Se monta desde routes/almacen.js (así comparte getDb, logAudit y el prefijo /api/almacen).

const TABLAS = [
    `CREATE TABLE IF NOT EXISTS flota_articulos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        descripcion VARCHAR(200) NOT NULL,
        unidad VARCHAR(20) NULL,
        familia VARCHAR(80) NULL,
        costo_referencial DECIMAL(14,4) NOT NULL DEFAULT 0,
        stock_minimo DECIMAL(14,4) NOT NULL DEFAULT 0,
        activo TINYINT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS flota_documentos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo VARCHAR(12) NOT NULL,
        fecha DATE NOT NULL,
        placa VARCHAR(20) NULL,
        referencia VARCHAR(120) NULL,
        observaciones TEXT NULL,
        usuario VARCHAR(120) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_fdoc_placa (placa)
    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS flota_movimientos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        documento_id INT NOT NULL,
        tipo VARCHAR(12) NOT NULL,
        fecha DATE NOT NULL,
        articulo_id INT NOT NULL,
        placa VARCHAR(20) NULL,
        cantidad DECIMAL(14,4) NOT NULL,
        costo_unitario DECIMAL(14,4) NOT NULL DEFAULT 0,
        INDEX idx_fmov_articulo (articulo_id),
        INDEX idx_fmov_placa (placa, articulo_id),
        INDEX idx_fmov_doc (documento_id)
    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const TIPOS = ['INGRESO', 'ASIGNACION', 'REINGRESO'];

// Efecto de cada línea: en el almacén (+ ingreso y reingreso, − asignación) y en la unidad (+ asignación, − reingreso)
const EN_ALMACEN = `CASE m.tipo WHEN 'ASIGNACION' THEN -m.cantidad ELSE m.cantidad END`;
const EN_UNIDAD = `CASE m.tipo WHEN 'ASIGNACION' THEN m.cantidad ELSE -m.cantidad END`;
const CODIGO = `CONCAT(CASE d.tipo WHEN 'INGRESO' THEN 'FI' WHEN 'ASIGNACION' THEN 'FA' ELSE 'FR' END, '-', LPAD(d.id, 6, '0'))`;

const hoyISO = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date());
const fechaValida = v => { const s = String(v ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : hoyISO(); };
const esFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
const placaLimpia = v => String(v ?? '').trim().toUpperCase();
const numero = v => Number(v) || 0;
const num = v => Number(v) || 0;

// Error que se muestra tal cual al usuario (400), distinto de un fallo del servidor (500)
const aviso = msg => Object.assign(new Error(msg), { aviso: true });

module.exports = function registrarAlmacenFlota(router, ctx) {
    const { getDb, logAudit } = ctx;

    const promesa = (tdb) => (tdb.promise ? tdb.promise() : tdb);

    async function asegurarTablas(p) {
        for (const sql of TABLAS) await p.query(sql);
    }

    // Líneas válidas { articulo_id, cantidad, costo_unitario? }, cantidades sumadas si el artículo se repite
    function lineasDe(items) {
        const acum = new Map();
        (Array.isArray(items) ? items : []).forEach(it => {
            const id = numero(it.articulo_id);
            const cant = numero(it.cantidad);
            if (id > 0 && cant > 0) {
                const previo = acum.get(id) ?? { articulo_id: id, cantidad: 0, costo_unitario: it.costo_unitario };
                previo.cantidad += cant;
                acum.set(id, previo);
            }
        });
        return [...acum.values()];
    }

    // Saldo del almacén por artículo (Map articulo_id → cantidad)
    async function saldosAlmacen(p, ids = null) {
        const [filas] = await p.query(`
            SELECT m.articulo_id, ROUND(SUM(${EN_ALMACEN}), 4) AS saldo
            FROM flota_movimientos m
            ${ids ? 'WHERE m.articulo_id IN (?)' : ''}
            GROUP BY m.articulo_id`, ids ? [ids] : []);
        return new Map(filas.map(f => [Number(f.articulo_id), num(f.saldo)]));
    }

    // Saldo por unidad y artículo: solo los que tienen cantidad > 0
    async function saldosUnidad(p, { placa = null, ids = null } = {}) {
        const cond = ['m.placa IS NOT NULL'];
        const params = [];
        if (placa) { cond.push('m.placa = ?'); params.push(placa); }
        if (ids) { cond.push('m.articulo_id IN (?)'); params.push(ids); }
        const [filas] = await p.query(`
            SELECT m.placa, m.articulo_id, ROUND(SUM(${EN_UNIDAD}), 4) AS saldo
            FROM flota_movimientos m
            WHERE ${cond.join(' AND ')}
            GROUP BY m.placa, m.articulo_id
            HAVING saldo > 0.0001`, params);
        return filas.map(f => ({ placa: f.placa, articulo_id: Number(f.articulo_id), saldo: num(f.saldo) }));
    }

    // Bloquea los artículos durante la operación para que dos salidas simultáneas no dejen stock negativo
    async function bloquearArticulos(conn, ids) {
        const [filas] = await conn.query(
            'SELECT id, descripcion, costo_referencial FROM flota_articulos WHERE id IN (?) AND activo = 1 FOR UPDATE', [ids]);
        return new Map(filas.map(f => [Number(f.id), f]));
    }

    async function conTransaccion(p, fn) {
        const conn = await p.getConnection();
        try {
            await conn.beginTransaction();
            const salida = await fn(conn);
            await conn.commit();
            return salida;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    // Crea el documento y sus líneas. Devuelve el código (FI-000012, FA-000045, FR-000003…)
    async function guardarDocumento(conn, { tipo, fecha, placa = null, referencia = null, observaciones = null, usuario = null, lineas }) {
        const [doc] = await conn.query(
            'INSERT INTO flota_documentos (tipo, fecha, placa, referencia, observaciones, usuario) VALUES (?, ?, ?, ?, ?, ?)',
            [tipo, fecha, placa, referencia, observaciones, usuario]);
        await conn.query(
            'INSERT INTO flota_movimientos (documento_id, tipo, fecha, articulo_id, placa, cantidad, costo_unitario) VALUES ?',
            [lineas.map(l => [doc.insertId, tipo, fecha, l.articulo_id, placa, l.cantidad, l.costo_unitario])]);
        const prefijo = { INGRESO: 'FI', ASIGNACION: 'FA', REINGRESO: 'FR' }[tipo];
        return `${prefijo}-${String(doc.insertId).padStart(6, '0')}`;
    }

    // ── Artículos ─────────────────────────────────────────────────────────

    // Lista de artículos con stock en almacén, en unidades y dónde están (placas)
    router.get('/flota/articulos', async (req, res) => {
        try {
            const p = promesa(getDb(req));
            await asegurarTablas(p);
            const [arts] = await p.query('SELECT * FROM flota_articulos WHERE activo = 1 ORDER BY descripcion');
            const enAlmacen = await saldosAlmacen(p);
            const enUnidades = await saldosUnidad(p);
            const porArticulo = new Map();
            enUnidades.forEach(u => {
                const lista = porArticulo.get(u.articulo_id) ?? [];
                lista.push({ placa: u.placa, cantidad: u.saldo });
                porArticulo.set(u.articulo_id, lista);
            });
            const articulos = arts.map(a => {
                const id = Number(a.id);
                const placas = (porArticulo.get(id) ?? []).sort((x, y) => y.cantidad - x.cantidad || x.placa.localeCompare(y.placa));
                const almacen = enAlmacen.get(id) ?? 0;
                const unidades = placas.reduce((s, x) => s + x.cantidad, 0);
                return {
                    id, descripcion: a.descripcion, unidad: a.unidad, familia: a.familia,
                    costo_referencial: num(a.costo_referencial), stock_minimo: num(a.stock_minimo),
                    almacen, en_unidades: unidades, total: almacen + unidades, placas,
                };
            });
            res.json({ ok: true, articulos });
        } catch (err) {
            console.error('Error almacén de flota (artículos):', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Ficha de un artículo: stock, placas y kardex (cada movimiento con su saldo del almacén)
    router.get('/flota/articulos/:id', async (req, res) => {
        try {
            const p = promesa(getDb(req));
            await asegurarTablas(p);
            const id = numero(req.params.id);
            const [arts] = await p.query('SELECT * FROM flota_articulos WHERE id = ?', [id]);
            if (!arts.length) return res.status(404).json({ ok: false, error: 'Artículo no encontrado.' });
            const [movs] = await p.query(`
                SELECT m.id, DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha, m.tipo, m.placa, m.cantidad, m.costo_unitario,
                       ${CODIGO} AS codigo, d.referencia, d.observaciones, d.usuario
                FROM flota_movimientos m
                JOIN flota_documentos d ON d.id = m.documento_id
                WHERE m.articulo_id = ?
                ORDER BY m.fecha, m.documento_id, m.id`, [id]);
            let saldo = 0;
            const kardex = movs.map(m => {
                const cantidad = num(m.cantidad);
                const entra = m.tipo !== 'ASIGNACION';
                saldo += entra ? cantidad : -cantidad;
                return {
                    id: m.id, fecha: m.fecha, codigo: m.codigo, tipo: m.tipo, placa: m.placa,
                    referencia: m.referencia, observaciones: m.observaciones, usuario: m.usuario,
                    costo_unitario: num(m.costo_unitario),
                    entrada: entra ? cantidad : 0, salida: entra ? 0 : cantidad,
                    saldo: Math.round(saldo * 10000) / 10000,
                };
            });
            const enAlmacen = (await saldosAlmacen(p, [id])).get(id) ?? 0;
            const placas = await saldosUnidad(p, { ids: [id] });
            res.json({
                ok: true,
                articulo: { ...arts[0], costo_referencial: num(arts[0].costo_referencial), stock_minimo: num(arts[0].stock_minimo) },
                almacen: enAlmacen,
                placas: placas.map(x => ({ placa: x.placa, cantidad: x.saldo })).sort((x, y) => x.placa.localeCompare(y.placa)),
                kardex: kardex.reverse(),
            });
        } catch (err) {
            console.error('Error almacén de flota (ficha de artículo):', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    function datosArticulo(b) {
        const descripcion = String(b.descripcion ?? '').trim();
        if (!descripcion) throw aviso('Escribe la descripción del artículo.');
        return {
            descripcion: descripcion.slice(0, 200),
            unidad: String(b.unidad ?? '').trim().slice(0, 20) || null,
            familia: String(b.familia ?? '').trim().slice(0, 80) || null,
            costo_referencial: Math.max(0, numero(b.costo_referencial)),
            stock_minimo: Math.max(0, numero(b.stock_minimo)),
        };
    }

    router.post('/flota/articulos', async (req, res) => {
        try {
            const p = promesa(getDb(req));
            await asegurarTablas(p);
            const datos = datosArticulo(req.body || {});
            const [r] = await p.query('INSERT INTO flota_articulos SET ?', [datos]);
            if (typeof logAudit === 'function') logAudit(req.body?.usuario || 'sistema', 'almacen', 'CREÓ ARTÍCULO (FLOTA)', datos.descripcion);
            res.json({ ok: true, id: r.insertId, mensaje: `Artículo "${datos.descripcion}" creado.` });
        } catch (err) {
            if (err.aviso) return res.status(400).json({ ok: false, error: err.message });
            console.error('Error creando artículo de flota:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.put('/flota/articulos/:id', async (req, res) => {
        try {
            const p = promesa(getDb(req));
            await asegurarTablas(p);
            const datos = datosArticulo(req.body || {});
            const [r] = await p.query('UPDATE flota_articulos SET ? WHERE id = ?', [datos, numero(req.params.id)]);
            if (!r.affectedRows) return res.status(404).json({ ok: false, error: 'Artículo no encontrado.' });
            if (typeof logAudit === 'function') logAudit(req.body?.usuario || 'sistema', 'almacen', 'EDITÓ ARTÍCULO (FLOTA)', `${req.params.id}: ${datos.descripcion}`);
            res.json({ ok: true, mensaje: 'Artículo actualizado.' });
        } catch (err) {
            if (err.aviso) return res.status(400).json({ ok: false, error: err.message });
            console.error('Error editando artículo de flota:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── Unidades ──────────────────────────────────────────────────────────

    // Unidades que tienen artículos: cantidad de artículos, piezas, valor y último movimiento
    router.get('/flota/unidades', async (req, res) => {
        try {
            const p = promesa(getDb(req));
            await asegurarTablas(p);
            const [arts] = await p.query('SELECT id, costo_referencial FROM flota_articulos');
            const costo = new Map(arts.map(a => [Number(a.id), num(a.costo_referencial)]));
            const saldos = await saldosUnidad(p);
            const [ult] = await p.query(`
                SELECT placa, DATE_FORMAT(MAX(fecha), '%Y-%m-%d') AS ultimo
                FROM flota_movimientos WHERE placa IS NOT NULL GROUP BY placa`);
            const ultimo = new Map(ult.map(u => [u.placa, u.ultimo]));
            const porPlaca = new Map();
            saldos.forEach(s => {
                const u = porPlaca.get(s.placa) ?? { placa: s.placa, articulos: 0, piezas: 0, valor: 0, ultimo: ultimo.get(s.placa) ?? null };
                u.articulos += 1;
                u.piezas += s.saldo;
                u.valor += s.saldo * (costo.get(s.articulo_id) ?? 0);
                porPlaca.set(s.placa, u);
            });
            const unidades = [...porPlaca.values()]
                .map(u => ({ ...u, piezas: Math.round(u.piezas * 10000) / 10000, valor: Math.round(u.valor * 100) / 100 }))
                .sort((x, y) => x.placa.localeCompare(y.placa));
            res.json({ ok: true, unidades });
        } catch (err) {
            console.error('Error almacén de flota (unidades):', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Lo que tiene una unidad y todos sus movimientos (asignaciones y reingresos)
    router.get('/flota/unidades/:placa', async (req, res) => {
        try {
            const p = promesa(getDb(req));
            await asegurarTablas(p);
            const placa = placaLimpia(req.params.placa);
            const saldos = await saldosUnidad(p, { placa });
            const ids = saldos.map(s => s.articulo_id);
            const info = new Map();
            if (ids.length) {
                const [arts] = await p.query('SELECT id, descripcion, unidad, familia, costo_referencial FROM flota_articulos WHERE id IN (?)', [ids]);
                arts.forEach(a => info.set(Number(a.id), a));
            }
            const saldo = saldos.map(s => {
                const a = info.get(s.articulo_id) ?? {};
                return {
                    articulo_id: s.articulo_id, saldo: s.saldo, descripcion: a.descripcion ?? `Artículo ${s.articulo_id}`,
                    unidad: a.unidad ?? null, familia: a.familia ?? null, costo_referencial: num(a.costo_referencial),
                };
            }).sort((x, y) => x.descripcion.localeCompare(y.descripcion));
            const [movimientos] = await p.query(`
                SELECT m.id, DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha, m.tipo, m.articulo_id, a.descripcion, a.unidad,
                       m.cantidad, m.costo_unitario, ${CODIGO} AS codigo, d.referencia, d.observaciones, d.usuario
                FROM flota_movimientos m
                JOIN flota_documentos d ON d.id = m.documento_id
                JOIN flota_articulos a ON a.id = m.articulo_id
                WHERE m.placa = ?
                ORDER BY m.fecha DESC, m.documento_id DESC, m.id DESC
                LIMIT 300`, [placa]);
            res.json({ ok: true, placa, saldo, movimientos: movimientos.map(m => ({ ...m, cantidad: num(m.cantidad), costo_unitario: num(m.costo_unitario) })) });
        } catch (err) {
            console.error('Error almacén de flota (unidad):', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── Historial ─────────────────────────────────────────────────────────

    // Todas las operaciones, con filtros. Un reingreso muestra de qué unidad salió.
    router.get('/flota/historial', async (req, res) => {
        try {
            const p = promesa(getDb(req));
            await asegurarTablas(p);
            const { desde, hasta, tipo, placa, q, limite } = req.query;
            const cond = [];
            const params = [];
            if (esFecha(desde)) { cond.push('m.fecha >= ?'); params.push(desde); }
            if (esFecha(hasta)) { cond.push('m.fecha <= ?'); params.push(hasta); }
            if (TIPOS.includes(tipo)) { cond.push('m.tipo = ?'); params.push(tipo); }
            if (placa) { cond.push('m.placa = ?'); params.push(placaLimpia(placa)); }
            if (q && String(q).trim()) { cond.push('a.descripcion LIKE ?'); params.push(`%${String(q).trim()}%`); }
            params.push(Math.min(Math.max(numero(limite) || 300, 1), 1000));
            const [filas] = await p.query(`
                SELECT m.id, DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha, m.tipo, m.placa, m.articulo_id, a.descripcion, a.unidad,
                       m.cantidad, m.costo_unitario, ${CODIGO} AS codigo, d.referencia, d.observaciones, d.usuario
                FROM flota_movimientos m
                JOIN flota_documentos d ON d.id = m.documento_id
                JOIN flota_articulos a ON a.id = m.articulo_id
                ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
                ORDER BY m.fecha DESC, m.documento_id DESC, m.id DESC
                LIMIT ?`, params);
            res.json({ ok: true, movimientos: filas.map(m => ({ ...m, cantidad: num(m.cantidad), costo_unitario: num(m.costo_unitario) })) });
        } catch (err) {
            console.error('Error almacén de flota (historial):', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── Operaciones ───────────────────────────────────────────────────────

    // Ingreso de artículos al almacén de flota (compra, traslado o stock inicial)
    router.post('/flota/ingreso', async (req, res) => {
        try {
            const p = promesa(getDb(req));
            await asegurarTablas(p);
            const { fecha, referencia, observaciones, usuario, items } = req.body || {};
            const lineas = lineasDe(items);
            if (!lineas.length) throw aviso('Elige al menos un artículo con cantidad.');
            const f = fechaValida(fecha);
            const codigo = await conTransaccion(p, async conn => {
                const arts = await bloquearArticulos(conn, lineas.map(l => l.articulo_id));
                const faltan = lineas.filter(l => !arts.has(l.articulo_id)).map(l => `artículo ${l.articulo_id} no existe o está inactivo`);
                if (faltan.length) throw aviso(faltan.join('\n'));
                return guardarDocumento(conn, {
                    tipo: 'INGRESO', fecha: f, referencia: String(referencia ?? '').trim().slice(0, 120) || null,
                    observaciones: observaciones || null, usuario: usuario || null,
                    lineas: lineas.map(l => ({
                        articulo_id: l.articulo_id, cantidad: l.cantidad,
                        costo_unitario: numero(l.costo_unitario) || num(arts.get(l.articulo_id).costo_referencial),
                    })),
                });
            });
            if (typeof logAudit === 'function') logAudit(usuario || 'sistema', 'almacen', 'INGRESÓ AL ALMACÉN DE FLOTA', `${codigo}: ${lineas.length} artículo(s)`);
            res.json({ ok: true, codigo, mensaje: `Ingreso ${codigo} registrado (${lineas.length} artículo(s)).` });
        } catch (err) {
            if (err.aviso) return res.status(400).json({ ok: false, error: err.message });
            console.error('Error ingresando al almacén de flota:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Asignar artículos del almacén a una unidad
    router.post('/flota/asignar', async (req, res) => {
        try {
            const p = promesa(getDb(req));
            await asegurarTablas(p);
            const { placa, fecha, observaciones, usuario, items } = req.body || {};
            const pl = placaLimpia(placa);
            if (!pl) throw aviso('Elige la unidad.');
            const lineas = lineasDe(items);
            if (!lineas.length) throw aviso('Elige al menos un artículo con cantidad.');
            const f = fechaValida(fecha);
            const codigo = await conTransaccion(p, async conn => {
                const ids = lineas.map(l => l.articulo_id);
                const arts = await bloquearArticulos(conn, ids);
                const enAlmacen = await saldosAlmacen(conn, ids);
                const faltan = [];
                lineas.forEach(l => {
                    const a = arts.get(l.articulo_id);
                    const hay = Math.max(0, enAlmacen.get(l.articulo_id) ?? 0);
                    if (!a) faltan.push(`artículo ${l.articulo_id} no existe o está inactivo`);
                    else if (l.cantidad > hay) faltan.push(`"${a.descripcion}" (pides ${l.cantidad}, hay ${hay})`);
                });
                if (faltan.length) throw aviso('No hay stock suficiente en el almacén de flota:\n• ' + faltan.join('\n• '));
                return guardarDocumento(conn, {
                    tipo: 'ASIGNACION', fecha: f, placa: pl, observaciones: observaciones || null, usuario: usuario || null,
                    lineas: lineas.map(l => ({ articulo_id: l.articulo_id, cantidad: l.cantidad, costo_unitario: num(arts.get(l.articulo_id).costo_referencial) })),
                });
            });
            if (typeof logAudit === 'function') logAudit(usuario || 'sistema', 'almacen', 'ASIGNÓ A UNIDAD (FLOTA)', `${codigo} → ${pl}: ${lineas.length} artículo(s)`);
            res.json({ ok: true, codigo, mensaje: `Asignación ${codigo}: ${lineas.length} artículo(s) a ${pl}.` });
        } catch (err) {
            if (err.aviso) return res.status(400).json({ ok: false, error: err.message });
            console.error('Error asignando a unidad (flota):', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Reingreso: lo que una unidad devuelve al almacén de flota
    router.post('/flota/reingresar', async (req, res) => {
        try {
            const p = promesa(getDb(req));
            await asegurarTablas(p);
            const { placa, fecha, observaciones, usuario, items } = req.body || {};
            const pl = placaLimpia(placa);
            if (!pl) throw aviso('Elige la unidad.');
            const lineas = lineasDe(items);
            if (!lineas.length) throw aviso('Elige al menos un artículo con cantidad.');
            const f = fechaValida(fecha);
            const codigo = await conTransaccion(p, async conn => {
                const ids = lineas.map(l => l.articulo_id);
                const arts = await bloquearArticulos(conn, ids);
                const enUnidad = new Map((await saldosUnidad(conn, { placa: pl, ids })).map(s => [s.articulo_id, s.saldo]));
                const faltan = [];
                lineas.forEach(l => {
                    const a = arts.get(l.articulo_id);
                    const tiene = enUnidad.get(l.articulo_id) ?? 0;
                    if (!a) faltan.push(`artículo ${l.articulo_id} no existe o está inactivo`);
                    else if (l.cantidad > tiene) faltan.push(`"${a.descripcion}" (quieres reingresar ${l.cantidad}, la unidad tiene ${tiene})`);
                });
                if (faltan.length) throw aviso(`La unidad ${pl} no tiene esa cantidad:\n• ` + faltan.join('\n• '));
                return guardarDocumento(conn, {
                    tipo: 'REINGRESO', fecha: f, placa: pl, observaciones: observaciones || null, usuario: usuario || null,
                    lineas: lineas.map(l => ({ articulo_id: l.articulo_id, cantidad: l.cantidad, costo_unitario: num(arts.get(l.articulo_id).costo_referencial) })),
                });
            });
            if (typeof logAudit === 'function') logAudit(usuario || 'sistema', 'almacen', 'REINGRESÓ DE UNIDAD (FLOTA)', `${codigo} ← ${pl}: ${lineas.length} artículo(s)`);
            res.json({ ok: true, codigo, mensaje: `Reingreso ${codigo}: ${lineas.length} artículo(s) de ${pl} al almacén.` });
        } catch (err) {
            if (err.aviso) return res.status(400).json({ ok: false, error: err.message });
            console.error('Error reingresando desde unidad (flota):', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });
};
