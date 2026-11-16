'use strict';
/**
 * Lista única de proveedores para cuentas bancarias: los de Almacén (proveedores_inv) y las estaciones de servicio
 * (combustible_estaciones_proveedores), cruzados por RUC. Si una estación ya es proveedor de Almacén, sale una sola vez
 * con sus sedes; si no, sale sola con la clave «EST-<id>». Las cuentas de ambos viven en proveedor_cuentas_bancarias
 * (proveedor_id = id del proveedor, o «EST-<id>» para una estación que no está en Almacén).
 */
const norm = v => String(v ?? '').trim();
const sedesDe = v => [...new Set(norm(v).split(/[,;\n]+/).map(x => x.trim()).filter(Boolean))];
const esRuc = v => /^\d{11}$/.test(v);
const sinTildes = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** @param {import('mysql2/promise').Pool} p  @param {string} [q] busca por nombre, documento o sede */
async function proveedoresConEstaciones(p, q) {
    const [prov] = await p.query('SELECT id, nombre, razon_social, tipo_documento, numero_documento AS doc, telefono, email, direccion, estado FROM proveedores_inv ORDER BY nombre');
    let est = [];
    try { [est] = await p.query('SELECT id, proveedor_razon_social, proveedor_ruc, estaciones_nombres FROM combustible_estaciones_proveedores ORDER BY proveedor_razon_social'); } catch (e) { est = []; }

    const lista = [];
    const porRuc = new Map();
    for (const r of prov) {
        const doc = norm(r.doc);
        const t = { titular: String(r.id), nombre: r.nombre, doc, tipo_doc: r.tipo_documento || (esRuc(doc) ? 'RUC' : ''), origen: 'Almacén',
            telefono: norm(r.telefono), email: norm(r.email), direccion: norm(r.direccion), estado: r.estado || '', estaciones: [] };
        lista.push(t);
        if (doc) porRuc.set(doc, t);
    }
    for (const e of est) {
        const ruc = norm(e.proveedor_ruc);
        const sedes = sedesDe(e.estaciones_nombres);
        const existente = esRuc(ruc) ? porRuc.get(ruc) : null;
        if (existente) {
            existente.estaciones = [...new Set([...existente.estaciones, ...sedes])];
            if (existente.origen === 'Almacén') existente.origen = 'Almacén y estación';
            continue;
        }
        const t = { titular: `EST-${e.id}`, nombre: e.proveedor_razon_social, doc: ruc, tipo_doc: esRuc(ruc) ? 'RUC' : '', origen: 'Estación de servicio',
            telefono: '', email: '', direccion: '', estado: '', estaciones: sedes };
        lista.push(t);
        if (esRuc(ruc)) porRuc.set(ruc, t);
    }

    const buscado = sinTildes(q).trim();
    const filtrada = buscado
        ? lista.filter(t => sinTildes(`${t.nombre} ${t.doc} ${t.estaciones.join(' ')}`).includes(buscado))
        : lista;
    return filtrada.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

/** Estación del catálogo por RUC (para enlazar un voucher leído con IA cuando el proveedor no está en Almacén) */
async function estacionPorRuc(p, ruc) {
    try {
        const [r] = await p.query('SELECT proveedor_razon_social AS nombre, proveedor_ruc AS doc FROM combustible_estaciones_proveedores WHERE TRIM(proveedor_ruc) = ? LIMIT 1', [norm(ruc)]);
        return r[0] || null;
    } catch (e) { return null; }
}

module.exports = { proveedoresConEstaciones, estacionPorRuc };
