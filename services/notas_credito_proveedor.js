// Notas de crédito de proveedores: el saldo a favor que deja una devolución se aplica al pago de una orden de compra.
// Nunca se "netea" en silencio: cada documento conserva su valor y se enlazan con compras_nc_aplicaciones.
// Tablas: compras_notas_credito, compras_nc_aplicaciones, compras_nc_historial (migración 21).
// `conn` es una conexión con .query() que devuelve promesas (el pool .promise() de la empresa).

const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const redondear = n => Math.round(n * 100) / 100;
const norm = s => String(s ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
const aMoneda = t => { const x = String(t || '').toUpperCase(); return (x === 'USD' || /D[OÓ]LAR|US\$|\bUSD\b/.test(x)) ? 'USD' : 'PEN'; };
const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });

const ESTADOS_APLICABLES = ['APROBADA', 'APLICADA_PARCIAL'];

const historial = (conn, ncId, accion, detalle, usuario) =>
    conn.query('INSERT INTO compras_nc_historial (nc_id, accion, detalle, usuario) VALUES (?, ?, ?, ?)', [ncId, accion, String(detalle || '').slice(0, 2000) || null, String(usuario || '').slice(0, 150) || null]);

/** ¿La nota es del mismo proveedor que la orden? Por id si ambos lo tienen; si no, por nombre. */
function mismoProveedor(nc, proveedorId, proveedorNombre) {
    if (nc.proveedor_id && proveedorId) return String(nc.proveedor_id) === String(proveedorId);
    return norm(nc.proveedor_nombre) === norm(proveedorNombre) && norm(nc.proveedor_nombre) !== '';
}

/** Notas aplicables a un pago: aprobadas, con saldo, de ese proveedor y de la misma moneda */
async function disponibles(conn, { proveedorId, proveedorNombre, moneda }) {
    const [rows] = await conn.query(
        `SELECT id, codigo, proveedor_id, proveedor_nombre, serie, numero, DATE_FORMAT(fecha_emision, '%Y-%m-%d') AS fecha_emision,
                moneda, total, saldo, motivo_texto, oc_origen, estado
         FROM compras_notas_credito
         WHERE estado IN ('APROBADA', 'APLICADA_PARCIAL') AND forma = 'APLICAR' AND saldo > 0 AND moneda = ?
         ORDER BY fecha_emision ASC, id ASC`, [aMoneda(moneda)]);
    return rows.filter(r => mismoProveedor(r, proveedorId, proveedorNombre)).map(r => ({ ...r, total: num(r.total), saldo: num(r.saldo) }));
}

/**
 * Valida y aplica las notas elegidas al pago de una orden. Descuenta el saldo de cada nota con un UPDATE protegido
 * (dos pagos a la vez no pueden usar el mismo saldo). Si algo falla a medias, lo ya aplicado se revierte.
 * Devuelve { total, detalle: [{ id, nc_id, codigo, monto }] }.
 */
async function aplicar(conn, { entradaId, proveedorId, proveedorNombre, moneda, importe, aplicaciones, usuario }) {
    const mon = aMoneda(moneda);
    const pedidas = new Map();
    for (const a of Array.isArray(aplicaciones) ? aplicaciones : []) {
        const id = parseInt(a && a.nc_id, 10), monto = redondear(num(a && a.monto));
        if (!id || !(monto > 0)) continue;
        pedidas.set(id, redondear((pedidas.get(id) || 0) + monto));
    }
    if (!pedidas.size) return { total: 0, detalle: [] };
    const suma = redondear([...pedidas.values()].reduce((s, v) => s + v, 0));
    if (suma > redondear(importe) + 0.004) throw aviso(`Las notas de crédito suman ${mon} ${suma.toFixed(2)} y la orden solo es de ${mon} ${redondear(importe).toFixed(2)}.`, 409);

    const hechas = [];
    try {
        for (const [ncId, monto] of pedidas) {
            const [rows] = await conn.query('SELECT * FROM compras_notas_credito WHERE id = ?', [ncId]);
            const nc = rows[0];
            if (!nc) throw aviso('Una de las notas de crédito ya no existe.', 404);
            if (!ESTADOS_APLICABLES.includes(nc.estado) || nc.forma !== 'APLICAR') throw aviso(`La nota ${nc.codigo} no se puede aplicar (estado ${nc.estado}).`, 409);
            if (!mismoProveedor(nc, proveedorId, proveedorNombre)) throw aviso(`La nota ${nc.codigo} es de otro proveedor.`, 409);
            if (nc.moneda !== mon) throw aviso(`La nota ${nc.codigo} es en ${nc.moneda} y el pago es en ${mon}: no se puede aplicar.`, 409);
            const [upd] = await conn.query(
                `UPDATE compras_notas_credito SET saldo = saldo - ?, estado = IF(saldo <= 0.004, 'APLICADA', 'APLICADA_PARCIAL')
                 WHERE id = ? AND saldo >= ? AND estado IN ('APROBADA', 'APLICADA_PARCIAL') AND forma = 'APLICAR'`, [monto, ncId, monto]);
            if (!upd || upd.affectedRows !== 1) throw aviso(`La nota ${nc.codigo} no tiene saldo suficiente (otro pago pudo usarlo).`, 409);
            const [ins] = await conn.query(
                'INSERT INTO compras_nc_aplicaciones (nc_id, entrada_id, monto, moneda, usuario) VALUES (?, ?, ?, ?, ?)', [ncId, String(entradaId), monto, mon, usuario || null]);
            hechas.push({ id: ins.insertId, nc_id: ncId, codigo: nc.codigo, monto });
            await historial(conn, ncId, 'APLICADA', `Se aplicaron ${mon} ${monto.toFixed(2)} al pago de la orden ${entradaId}`, usuario);
        }
    } catch (err) {
        await revertir(conn, hechas, usuario, 'No se pudo completar el pago').catch(() => {});
        throw err;
    }
    return { total: suma, detalle: hechas };
}

/** Devuelve el saldo a las notas (el pago no se concretó o se anuló) y marca la aplicación como revertida */
async function revertir(conn, aplicadas, usuario, motivo) {
    for (const a of aplicadas || []) {
        await conn.query(
            `UPDATE compras_notas_credito SET saldo = saldo + ?, estado = IF(saldo + 0 >= total - 0.004, 'APROBADA', 'APLICADA_PARCIAL') WHERE id = ?`, [a.monto, a.nc_id]);
        await conn.query("UPDATE compras_nc_aplicaciones SET estado = 'REVERTIDA', observacion = ? WHERE id = ?", [String(motivo || '').slice(0, 255) || null, a.id]);
        await historial(conn, a.nc_id, 'APLICACIÓN REVERTIDA', `Se devolvieron ${Number(a.monto).toFixed(2)} al saldo de la nota. ${motivo || ''}`.trim(), usuario);
    }
}

/** Notas aplicadas al pago de una orden (para mostrarlas en la orden y en el pago) */
async function porOrden(conn, entradaId) {
    const [rows] = await conn.query(
        `SELECT a.id, a.nc_id, a.monto, a.moneda, a.usuario, DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS fecha, n.codigo, n.serie, n.numero
         FROM compras_nc_aplicaciones a JOIN compras_notas_credito n ON n.id = a.nc_id
         WHERE a.entrada_id = ? AND a.estado = 'VIGENTE' ORDER BY a.id`, [String(entradaId)]);
    return rows.map(r => ({ ...r, monto: num(r.monto) }));
}

module.exports = { aplicar, revertir, disponibles, porOrden, historial, mismoProveedor, aMoneda, num, redondear, norm, aviso, ESTADOS_APLICABLES };
