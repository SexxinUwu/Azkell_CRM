'use strict';
// Llantas provisionales: una inspección de neumáticos puede traer llantas que el ciclo de vida aún no conoce (por ejemplo, de una unidad
// que nunca se había cargado). Cada una nace como "PROV-<placa>-<posición>", ya instalada en su posición, sin costo de compra y sin
// código de fuego (se le asigna después desde Neumáticos). Así la lista de Neumáticos siempre muestra todo lo que está instalado.
//
// Si la posición ya tiene una llanta instalada (provisional o con código), no se crea otra: solo se actualiza su remanente.
// Debe correr dentro de la transacción de quien llama (conn = conexión o pool con .query que devuelve [filas]).

const USUARIO = 'Carga inicial desde inspección';

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Remanente de una llanta a partir de sus cocadas (r1..r4); null si nunca se midió */
function remanenteDeCocadas(it) {
    const r = [num(it.r1), num(it.r2), num(it.r3)];
    const r4 = num(it.r4);
    const lista = r4 > 0 ? [...r, r4] : r;
    const prom = lista.reduce((a, b) => a + b, 0) / lista.length;
    return Math.round(prom * 10) / 10;
}

/**
 * @param conn conexión con .query
 * @param datos {placa, fecha 'AAAA-MM-DD', km, idInspeccion, items: [{posicion, marca, modelo, medida, remanente}]}
 * @returns {{creadas: number, actualizadas: number, ids: string[]}}
 */
async function asegurarLlantasProvisionales(conn, { placa, fecha, km, idInspeccion, items }) {
    const placaMay = String(placa || '').trim().toUpperCase();
    const resultado = { creadas: 0, actualizadas: 0, ids: [] };
    if (!placaMay) return resultado;
    const kmIn = Math.max(0, Math.trunc(num(km)));

    for (const it of items) {
        const posicion = String(it.posicion || '').trim().toUpperCase();
        if (!posicion) continue;
        const rem = num(it.remanente);

        const [abierta] = await conn.query(
            'SELECT id_neumatico FROM neumaticos_instalaciones WHERE placa = ? AND posicion = ? AND fecha_out IS NULL LIMIT 1',
            [placaMay, posicion]);
        if (abierta.length) {
            if (rem > 0) await conn.query('UPDATE neumaticos_hoja_vida SET remanente_actual = ? WHERE id_neumatico = ?', [rem, abierta[0].id_neumatico]);
            resultado.actualizadas += 1;
            continue;
        }

        // Id libre: si ya hubo una provisional en esa posición (hoy retirada), la nueva lleva un sufijo
        let id = `PROV-${placaMay}-${posicion}`;
        for (let k = 2; k < 100; k += 1) {
            const [ya] = await conn.query('SELECT 1 FROM neumaticos_hoja_vida WHERE id_neumatico = ? LIMIT 1', [id]);
            if (!ya.length) break;
            id = `PROV-${placaMay}-${posicion}-${k}`;
        }

        const [h] = await conn.query(
            `INSERT INTO neumaticos_hoja_vida
             (id_neumatico, marca, modelo, medida, estado, remanente_inicial, remanente_actual, costo_compra, km_acumulado,
              placa_actual, posicion_actual, estado_operativo, fecha_instalacion, vida, contador_reencauches, costo_reencauches, estado_ciclo, almacen_id)
             VALUES (?, ?, ?, ?, 'NUEVA', ?, ?, 0, 0, ?, ?, 'Montada', ?, 'R0', 0, 0, 'en_unidad', NULL)`,
            [id, String(it.marca || '').toUpperCase(), String(it.modelo || '').toUpperCase(), String(it.medida || '').toUpperCase(),
             Math.round(rem), rem, placaMay, posicion, fecha]);
        if (h.affectedRows !== 1) throw new Error(`No se pudo crear la llanta provisional ${id}`);

        const [i] = await conn.query(
            'INSERT INTO neumaticos_instalaciones (id_neumatico, placa, posicion, fecha_in, km_in, usuario) VALUES (?, ?, ?, ?, ?, ?)',
            [id, placaMay, posicion, fecha, kmIn, USUARIO]);
        if (i.affectedRows !== 1) throw new Error(`No se pudo instalar la llanta provisional ${id}`);

        const [m] = await conn.query(
            `INSERT INTO neumaticos_movimientos (id_neumatico, tipo, almacen_origen_id, almacen_destino_id, placa, posicion, km, fecha, usuario, observacion)
             VALUES (?, 'INSTALACION', NULL, NULL, ?, ?, ?, ?, ?, ?)`,
            [id, placaMay, posicion, kmIn, fecha, USUARIO, `Carga inicial desde la inspección ${idInspeccion} (sin código de marca de fuego)`]);
        if (m.affectedRows !== 1) throw new Error(`No se pudo registrar el movimiento de ${id}`);

        resultado.creadas += 1;
        resultado.ids.push(id);
    }
    return resultado;
}

module.exports = { asegurarLlantasProvisionales, remanenteDeCocadas, USUARIO };
