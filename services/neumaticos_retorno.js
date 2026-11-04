// Reencauche de llantas por orden de servicio. Reglas compartidas entre la ruta de neumáticos (retorno, despacho)
// y la recepción de compras (cada llanta vuelve aprobada o rechazada al recepcionar la orden).
//
// Tabla neumaticos_reencauche_oc: pendiente → en_reformadora (despacho con guía) → aprobada | rechazada | anulada.
// Todas las funciones reciben una conexión que ya está dentro de una transacción (salvo `prepararAnulacion`, que la abre quien llama).

const ALMACEN = { REENCAUCHE: 1142, RETEN: 1146 };
const VIDAS = ['R0', 'R1', 'R2', 'R3'];
const ESTADO_ALMACEN = { ciclo: 'en_almacen', operativo: 'Stock Taller' };
const ESTADO_DESECHO = { ciclo: 'desechado', operativo: 'Desecho' };
const MOV_RETORNO = 'RETORNO_REENCAUCHE';
const MOV_RECHAZO = 'RECHAZO_REENCAUCHE';

const aviso = (status, msg) => Object.assign(new Error(msg), { status, aviso: true });
const txt = v => (v == null ? '' : String(v).trim());

const ahoraLima = () => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(new Date());

/** Enviada para reforma: en reencauche, en el Retén (1146) y con código de fuego */
function esEnviarReforma(l) {
    return l.estado_ciclo === 'en_reencauche' && Number(l.almacen_id) === ALMACEN.RETEN && txt(l.codigo_llanta) !== '';
}

/** Si la migración 14 aún no está aplicada, la tabla no existe: las funciones que solo leen la tratan como vacía */
const sinTabla = err => !!err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146);

async function filasAbiertas(conn, ocId, estado) {
    try {
        const [filas] = await conn.query(
            'SELECT * FROM neumaticos_reencauche_oc WHERE oc_id = ? AND estado = ? FOR UPDATE', [ocId, estado]);
        return filas;
    } catch (err) {
        if (sinTabla(err)) return [];
        throw err;
    }
}

async function registrarMovimiento(conn, m) {
    await conn.query(
        `INSERT INTO neumaticos_movimientos
         (id_neumatico, tipo, almacen_origen_id, almacen_destino_id, placa, posicion, km, fecha, usuario, observacion)
         VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
        [m.id_neumatico, m.tipo, m.origen ?? null, m.destino ?? null, m.fecha, m.usuario || null, m.observacion || null]);
}

/**
 * Aplica el retorno de una llanta ya bloqueada (FOR UPDATE).
 *   aprobada (por defecto): sube la vida (R+1), suma el costo del servicio y queda en Reencauche (1142), disponible.
 *   rechazada: no sube la vida ni suma costo; queda en el Retén (1146) esperando descarte.
 */
async function aplicarRetornoReencauche(conn, llanta, { resultado = 'aprobada', costo = 0, proveedor = null, disenio = null, remanente = null, motivo = null, usuario = null, fecha }) {
    const origen = llanta.almacen_id == null ? null : Number(llanta.almacen_id);
    const cuando = fecha || ahoraLima();

    if (resultado === 'rechazada') {
        const detalle = ['Reencauche rechazado', proveedor && `Proveedor: ${proveedor}`, motivo && `Motivo: ${motivo}`].filter(Boolean).join('. ');
        await conn.query(
            'UPDATE neumaticos_hoja_vida SET almacen_id = ?, estado_ciclo = ?, estado_operativo = ? WHERE id_neumatico = ?',
            [ALMACEN.RETEN, ESTADO_DESECHO.ciclo, ESTADO_DESECHO.operativo, llanta.id_neumatico]);
        await registrarMovimiento(conn, { id_neumatico: llanta.id_neumatico, tipo: MOV_RECHAZO, origen, destino: ALMACEN.RETEN, fecha: cuando, usuario, observacion: detalle });
        return { rechazada: true };
    }

    const vidaActual = llanta.vida || 'R0';
    const idx = VIDAS.indexOf(vidaActual);
    if (idx < 0) throw aviso(409, `Vida desconocida: ${vidaActual}`);
    if (idx >= VIDAS.length - 1) throw aviso(409, 'La llanta ya está en R3 y no admite más reencauches');
    const vidaNueva = VIDAS[idx + 1];
    const contador = (Number(llanta.contador_reencauches) || 0) + 1;
    const costoTotal = (Number(llanta.costo_reencauches) || 0) + (Number(costo) || 0);
    const rem = (remanente == null || remanente === '') ? null : Number(remanente);
    if (rem != null && (!Number.isFinite(rem) || rem < 0)) throw aviso(400, 'Remanente no es válido');
    const remanenteFinal = rem == null ? llanta.remanente_actual : rem;

    await conn.query(
        `UPDATE neumaticos_hoja_vida
         SET vida = ?, contador_reencauches = ?, costo_reencauches = ?, remanente_actual = ?,
             almacen_id = ?, estado_ciclo = ?, estado_operativo = ?
         WHERE id_neumatico = ?`,
        [vidaNueva, contador, costoTotal, remanenteFinal, ALMACEN.REENCAUCHE,
         ESTADO_ALMACEN.ciclo, ESTADO_ALMACEN.operativo, llanta.id_neumatico]);

    const detalle = [
        proveedor && `Proveedor: ${proveedor}`,
        `Costo servicio: ${Number(costo) || 0}`,
        disenio && `Diseño: ${disenio}`,
        rem != null && `Remanente: ${rem} mm`,
        `Vida ${vidaActual} a ${vidaNueva}`,
    ].filter(Boolean).join('. ');
    await registrarMovimiento(conn, { id_neumatico: llanta.id_neumatico, tipo: MOV_RETORNO, origen, destino: ALMACEN.REENCAUCHE, fecha: cuando, usuario, observacion: detalle });
    return { vida: vidaNueva, contador, costoTotal };
}

/**
 * Dentro de la recepción de una orden: cada llanta que viene en una línea SERV de reencauche se resuelve aprobada o rechazada
 * con la lógica del retorno, con el costo igual al precio unitario de la línea. `items[].llantas_reencauche` =
 * [{ id_neumatico, resultado: 'aprobada' | 'rechazada', remanente, banda }]. Las que no se resuelven siguen en la reformadora;
 * una recepción TOTAL exige resolverlas todas.
 */
async function resolverReencaucheDeRecepcion(conn, { ocId, recepcionId, items, usuario, fecha, tipoRecepcion, proveedor }) {
    const abiertas = await filasAbiertas(conn, ocId, 'en_reformadora');
    const porId = new Map(abiertas.map(r => [r.id_neumatico, r]));
    const resueltas = new Set();

    for (const it of (items || [])) {
        const lista = Array.isArray(it.llantas_reencauche) ? it.llantas_reencauche : [];
        const costo = Number(it.costo_unitario) || 0;
        for (const x of lista) {
            const idLlanta = txt(x.id_neumatico);
            const fila = porId.get(idLlanta);
            if (!fila || fila.inventario_id !== it.inventario_id) throw aviso(409, `La llanta ${idLlanta} no está en la reformadora para esta orden`);
            if (resueltas.has(idLlanta)) throw aviso(400, `La llanta ${idLlanta} viene repetida`);
            const resultado = x.resultado === 'rechazada' ? 'rechazada' : 'aprobada';
            const [hv] = await conn.query('SELECT * FROM neumaticos_hoja_vida WHERE id_neumatico = ? FOR UPDATE', [idLlanta]);
            if (!hv.length) throw aviso(404, `Llanta ${idLlanta} no encontrada`);
            await aplicarRetornoReencauche(conn, hv[0], { resultado, costo, proveedor, disenio: txt(x.banda) || null, remanente: x.remanente, motivo: txt(x.motivo) || null, usuario, fecha });
            await conn.query(
                'UPDATE neumaticos_reencauche_oc SET estado = ?, costo = ?, recepcion_id = ?, resuelto_en = ? WHERE id = ?',
                [resultado, resultado === 'aprobada' ? costo : null, recepcionId, fecha, fila.id]);
            resueltas.add(idLlanta);
        }
    }
    const faltan = abiertas.length - resueltas.size;
    if (tipoRecepcion === 'TOTAL' && faltan > 0) {
        throw aviso(409, `Faltan ${faltan} llanta${faltan === 1 ? '' : 's'} por resolver (aprobada o rechazada). Resuélvelas o registra la recepción como parcial.`);
    }
    return { resueltas: resueltas.size, faltan };
}

/**
 * Anular una orden: con llantas ya en la reformadora se bloquea (409); si solo hay pendientes, se sueltan
 * (las llantas siguen en "Enviar para reforma"). Llamar antes de cambiar el estado de la orden.
 */
async function prepararAnulacion(conn, ocId) {
    let filas;
    try {
        [filas] = await conn.query("SELECT estado FROM neumaticos_reencauche_oc WHERE oc_id = ? AND estado IN ('pendiente', 'en_reformadora')", [ocId]);
    } catch (err) {
        if (sinTabla(err)) return { liberadas: 0 };
        throw err;
    }
    const enReformadora = filas.filter(f => f.estado === 'en_reformadora').length;
    if (enReformadora) {
        throw aviso(409, `No se puede anular: ${enReformadora} llanta${enReformadora === 1 ? '' : 's'} de esta orden ya está${enReformadora === 1 ? '' : 'n'} en la reformadora. Recepciona la orden o devuélvelas primero.`);
    }
    if (filas.length) await conn.query("UPDATE neumaticos_reencauche_oc SET estado = 'anulada' WHERE oc_id = ? AND estado = 'pendiente'", [ocId]);
    return { liberadas: filas.length };
}

/** Bloquea y valida las llantas de una orden nueva: todas "Enviar para reforma", sin R3 y sin otra orden abierta */
async function bloquearLlantasParaOrden(conn, codigos) {
    const lista = [];
    for (const codigo of [...new Set((codigos || []).map(c => txt(c).toUpperCase()).filter(Boolean))].sort()) {
        const [f] = await conn.query(
            'SELECT * FROM neumaticos_hoja_vida WHERE (codigo_llanta = ? OR id_neumatico = ?) LIMIT 1 FOR UPDATE', [codigo, codigo]);
        if (!f.length) throw aviso(404, `Llanta ${codigo} no encontrada`);
        const l = f[0];
        if (!esEnviarReforma(l)) throw aviso(409, `La llanta ${codigo} no está en "Enviar para reforma"`);
        if (String(l.vida || 'R0').trim().toUpperCase() === 'R3') throw aviso(409, `La llanta ${codigo} ya tiene 3 reencauches: mándala a descarte`);
        let abierta;
        try {
            [abierta] = await conn.query(
                "SELECT oc_id FROM neumaticos_reencauche_oc WHERE id_neumatico = ? AND estado IN ('pendiente', 'en_reformadora') LIMIT 1", [l.id_neumatico]);
        } catch (err) {
            if (sinTabla(err)) throw aviso(503, 'Falta aplicar la migración 14 (neumaticos_reencauche_oc)');
            throw err;
        }
        if (abierta.length) throw aviso(409, `La llanta ${codigo} ya está en la orden ${abierta[0].oc_id}`);
        lista.push(l);
    }
    return lista;
}

module.exports = {
    ALMACEN, aviso, esEnviarReforma, sinTabla, ahoraLima,
    aplicarRetornoReencauche, resolverReencaucheDeRecepcion, prepararAnulacion, bloquearLlantasParaOrden,
};
