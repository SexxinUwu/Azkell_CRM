// Ciclo de vida de neumáticos: alta de llantas, instalación y retiro en vehículos,
// baja (desecho) o envío a reencauche, retorno de reencauche y reporte para Excel.
//
// Se monta en server.js con el mismo prefijo que routes/neumaticos.js (/api/neumaticos).
// La auditoría de las mutaciones la registra el middleware de routes/neumaticos.js (log_auditoria).
//
// Tablas:
// - neumaticos_hoja_vida: estado actual de cada llanta (codigo_llanta, vida, almacen_id, estado_ciclo, km y costos).
//   `estado` sigue siendo la condición (NUEVA / RENCAUCHADA) que usan las inspecciones; el ciclo usa `estado_ciclo`.
// - neumaticos_instalaciones: una fila por periodo montada en una posición. Abierta mientras fecha_out es NULL.
// - neumaticos_movimientos: kardex de la llanta. Cada cambio de estado deja una fila.

const express = require('express');
const { htmlAPdf } = require('../services/ot_pdf');
const { htmlMapaPosiciones } = require('../services/neumaticos_mapa_pdf');

// Almacenes del ciclo de vida
const ALMACEN = { NUEVAS: 100, REENCAUCHE: 1142, REPARADAS: 1144, SCRAP: 1148 };
const ALMACENES_ALTA = [ALMACEN.NUEVAS, ALMACEN.REENCAUCHE, ALMACEN.REPARADAS];
const ALMACENES_INSTALAR = [ALMACEN.NUEVAS, ALMACEN.REENCAUCHE, ALMACEN.REPARADAS];
const NOMBRE_ALMACEN = { 100: 'Nuevas', 1142: 'Reencauche', 1144: 'Reparadas', 1148: 'Scrap' };

// Permisos del catálogo (src/modules/sistema/permisosCatalogo.ts)
const PERMISO_VER = 'neumaticos';
const PERMISO_MOVER = 'neumaticos.mover';

// Vida del neumático: R0 nueva; cada reencauche sube un nivel; R3 no admite más
const VIDAS = ['R0', 'R1', 'R2', 'R3'];

// Estado del ciclo (estado_ciclo) y su equivalente en el enum estado_operativo que usa la versión actual
const ESTADO = {
    ALMACEN: { ciclo: 'en_almacen', operativo: 'Stock_Taller' },
    MONTADA: { ciclo: 'en_unidad', operativo: 'Montada' },
    EN_REENCAUCHE: { ciclo: 'en_reencauche', operativo: 'En_Rencauche' },
    DESECHO: { ciclo: 'desechado', operativo: 'Desecho' },
};

// Tipos de movimiento (kardex)
const MOV = {
    ALTA: 'ALTA',
    INSTALACION: 'INSTALACION',
    RETIRO_DESECHO: 'RETIRO_DESECHO',
    RETIRO_REENCAUCHE: 'RETIRO_REENCAUCHE',
    RETORNO_REENCAUCHE: 'RETORNO_REENCAUCHE',
};

// Error con código HTTP que se devuelve tal cual al usuario (distinto de un fallo del servidor)
const aviso = (status, msg) => Object.assign(new Error(msg), { status, aviso: true });

const txt = v => (v == null ? '' : String(v).trim());
const mayus = v => txt(v).toUpperCase();

// Números: vacío = 0 salvo que sea obligatorio; negativo o no numérico = error
function numeroNoNegativo(v, campo, requerido = false) {
    if (v == null || v === '') {
        if (requerido) throw aviso(400, `${campo} es obligatorio`);
        return 0;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw aviso(400, `${campo} no es válido`);
    return n;
}

// Fecha YYYY-MM-DD; vacía = hoy (zona Lima)
const hoyLima = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date());
const ahoraLima = () => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(new Date());
function fechaDe(v) {
    if (v == null || v === '') return hoyLima();
    const s = String(v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw aviso(400, 'La fecha no es válida (use AAAA-MM-DD)');
    return s;
}

const usuarioDe = req => {
    const u = (req && req.user) || {};
    return u.nombre || u.correo || null;
};

// Permiso de la acción (c = crear/ejecutar) sobre una clave del catálogo de permisos.
// Misma regla de administrador que globalRBAC: Fundador, Administrador o permisos.admin === true.
function tienePermiso(req, clave, accion = 'c') {
    const rol = String((req && req.user && req.user.rol) || '');
    if (rol === 'Fundador' || rol === 'Administrador' || rol.toLowerCase().includes('admin')) return true;
    let p = {};
    try {
        const raw = req && req.user ? req.user.permisos : null;
        p = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    } catch (e) {}
    if (p.admin === true) return true;
    const m = p[clave];
    return !!m && (m[accion] === 1 || m[accion] === true);
}

// Consulta de llantas: la fila abierta de instalación da la placa y posición actuales
const SQL_LLANTAS = `
    SELECT COALESCE(h.codigo_llanta, h.id_neumatico) AS codigo, h.id_neumatico, h.marca, h.modelo, h.medida,
           h.estado_ciclo, h.vida, h.contador_reencauches, h.costo_compra, h.costo_reencauches,
           h.km_acumulado, h.almacen_id, h.placa_actual, h.posicion_actual,
           i.placa AS placa_montada, i.posicion AS posicion_montada,
           DATE_FORMAT(i.fecha_in, '%Y-%m-%d') AS fecha_instalacion
    FROM neumaticos_hoja_vida h
    LEFT JOIN neumaticos_instalaciones i ON i.id_neumatico = h.id_neumatico AND i.fecha_out IS NULL`;

function filaLlanta(r) {
    const km = Number(r.km_acumulado) || 0;
    const compra = Number(r.costo_compra) || 0;
    const reencauches = Number(r.costo_reencauches) || 0;
    return {
        codigo: r.codigo,
        id_neumatico: r.id_neumatico,
        marca: r.marca,
        modelo: r.modelo,
        medida: r.medida,
        estado: r.estado_ciclo || null,
        vida: r.vida || 'R0',
        almacen_id: r.almacen_id == null ? null : Number(r.almacen_id),
        placa: r.placa_montada || r.placa_actual || null,
        posicion: r.posicion_montada || r.posicion_actual || null,
        fecha_instalacion: r.fecha_instalacion || null,
        reencauches: Number(r.contador_reencauches) || 0,
        km_acumulado: km,
        costo_compra: compra,
        costo_reencauches: reencauches,
        cpk: km > 0 ? Math.round(((compra + reencauches) / km) * 10000) / 10000 : null,
    };
}

module.exports = function (db) {
    const router = express.Router();

    function pool(req) {
        const d = (req && req.db) ? req.db : db;
        if (!d) throw new Error('Sin conexión a la base de datos');
        return (typeof d.promise === 'function') ? d.promise() : d;
    }

    // Transacción sobre una conexión dedicada (el pool no garantiza la misma conexión entre consultas)
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

    // Bloquea la llanta (código o id_neumatico) durante la operación
    async function bloquearLlanta(conn, codigo) {
        const [filas] = await conn.query(
            'SELECT * FROM neumaticos_hoja_vida WHERE (codigo_llanta = ? OR id_neumatico = ?) LIMIT 1 FOR UPDATE',
            [codigo, codigo]);
        if (!filas.length) throw aviso(404, 'Llanta no encontrada');
        return filas[0];
    }

    async function registrarMovimiento(conn, m) {
        await conn.query(
            `INSERT INTO neumaticos_movimientos
             (id_neumatico, tipo, almacen_origen_id, almacen_destino_id, placa, posicion, km, fecha, usuario, observacion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [m.id_neumatico, m.tipo, m.origen ?? null, m.destino ?? null, m.placa || null, m.posicion || null,
             m.km ?? null, m.fecha, m.usuario || null, m.observacion || null]);
    }

    function responder(res, err) {
        if (err && err.aviso) return res.status(err.status).json({ ok: false, error: err.message });
        console.error('Neumáticos (ciclo de vida):', err);
        return res.status(500).json({ ok: false, error: err.message });
    }

    // ============================================================
    // 1. LISTA DE LLANTAS
    // ============================================================
    router.get('/llantas', async (req, res) => {
        try {
            const [filas] = await pool(req).query(`${SQL_LLANTAS} ORDER BY codigo`);
            res.json({ ok: true, data: filas.map(filaLlanta) });
        } catch (err) {
            responder(res, err);
        }
    });

    // ============================================================
    // 2. FICHA DE UNA LLANTA: instalaciones, movimientos y mediciones
    // ============================================================
    router.get('/llantas/:codigo', async (req, res) => {
        try {
            const p = pool(req);
            const codigo = mayus(req.params.codigo);
            const [filas] = await p.query(`${SQL_LLANTAS} WHERE (h.codigo_llanta = ? OR h.id_neumatico = ?) LIMIT 1`, [codigo, codigo]);
            if (!filas.length) return res.status(404).json({ ok: false, error: 'Llanta no encontrada' });
            const llanta = filas[0];

            const [instalaciones] = await p.query(
                'SELECT * FROM neumaticos_instalaciones WHERE id_neumatico = ? ORDER BY fecha_in DESC, id DESC',
                [llanta.id_neumatico]);
            const [movimientos] = await p.query(
                'SELECT * FROM neumaticos_movimientos WHERE id_neumatico = ? ORDER BY fecha DESC, id DESC',
                [llanta.id_neumatico]);
            const [mediciones] = await p.query(`
                SELECT i.id_inspeccion, DATE_FORMAT(i.fecha_inspeccion, '%Y-%m-%d') AS fecha, i.placa,
                       i.km_vehiculo AS km, d.posicion, d.r1, d.r2, d.r3, d.remanente_promedio
                FROM neumaticos_inspecciones_det d
                INNER JOIN neumaticos_inspecciones i ON d.id_inspeccion COLLATE utf8mb4_general_ci = i.id_inspeccion COLLATE utf8mb4_general_ci
                WHERE d.id_neumatico = ?
                ORDER BY i.fecha_inspeccion DESC`, [llanta.id_neumatico]);

            res.json({
                ok: true,
                data: { llanta: filaLlanta(llanta), instalaciones, movimientos, mediciones },
            });
        } catch (err) {
            responder(res, err);
        }
    });

    // ============================================================
    // 3. ALTA DE LLANTA
    // ============================================================
    router.post('/llantas', async (req, res) => {
        try {
            const b = req.body || {};
            const codigo = mayus(b.codigo);
            if (!codigo) throw aviso(400, 'El código de la llanta es obligatorio');
            const marca = txt(b.marca);
            const medida = txt(b.medida);
            const modelo = txt(b.modelo);
            if (!marca || !medida) throw aviso(400, 'Marca y medida son obligatorias');
            const almacenId = (b.almacen_id == null || b.almacen_id === '') ? ALMACEN.NUEVAS : Number(b.almacen_id);
            if (!ALMACENES_ALTA.includes(almacenId)) {
                throw aviso(400, 'El alta solo puede ir a Nuevas (100), Reencauche (1142) o Reparadas (1144)');
            }
            const costo = numeroNoNegativo(b.costo_compra, 'Costo de compra');
            const fecha = fechaDe(b.fecha_compra);

            await conTransaccion(pool(req), async (conn) => {
                const [dup] = await conn.query(
                    'SELECT 1 FROM neumaticos_hoja_vida WHERE codigo_llanta = ? OR id_neumatico = ? LIMIT 1',
                    [codigo, codigo]);
                if (dup.length) throw aviso(409, `Ya existe una llanta con el código ${codigo}`);

                // id_neumatico (clave primaria) toma el mismo código que codigo_llanta
                await conn.query(
                    `INSERT INTO neumaticos_hoja_vida
                     (id_neumatico, codigo_llanta, marca, modelo, medida, estado_ciclo, vida, contador_reencauches,
                      costo_compra, costo_reencauches, km_acumulado, almacen_id, estado_operativo)
                     VALUES (?, ?, ?, ?, ?, ?, 'R0', 0, ?, 0, 0, ?, ?)`,
                    [codigo, codigo, marca, modelo, medida, ESTADO.ALMACEN.ciclo, costo, almacenId, ESTADO.ALMACEN.operativo]);

                await registrarMovimiento(conn, {
                    id_neumatico: codigo, tipo: MOV.ALTA, destino: almacenId, km: 0,
                    fecha: `${fecha} 00:00:00`, usuario: usuarioDe(req),
                    observacion: `Alta en almacén ${almacenId}. Costo de compra: ${costo}`,
                });
            });

            res.json({ ok: true, data: { codigo, almacen_id: almacenId, estado: ESTADO.ALMACEN.ciclo } });
        } catch (err) {
            responder(res, err);
        }
    });

    // ============================================================
    // 4. INSTALAR: llanta de almacén a una posición de una unidad
    // ============================================================
    router.post('/instalar', async (req, res) => {
        try {
            if (!tienePermiso(req, PERMISO_MOVER, 'c')) throw aviso(403, `Sin permiso (${PERMISO_MOVER}) para instalar llantas`);
            const b = req.body || {};
            const codigo = mayus(b.codigo);
            const placa = mayus(b.placa);
            const posicion = mayus(b.posicion);
            if (!codigo) throw aviso(400, 'El código de la llanta es obligatorio');
            if (!placa || !posicion) throw aviso(400, 'Placa y posición son obligatorias');
            const km = Math.trunc(numeroNoNegativo(b.km, 'Kilometraje', true));

            await conTransaccion(pool(req), async (conn) => {
                const llanta = await bloquearLlanta(conn, codigo);
                const almacenPrevio = llanta.almacen_id == null ? null : Number(llanta.almacen_id);
                if (!ALMACENES_INSTALAR.includes(almacenPrevio)) {
                    throw aviso(409, 'La llanta no está en un almacén disponible (Nuevas 100, Reencauche 1142 o Reparadas 1144)');
                }
                // Una llanta enviada a reencauche también queda en el almacén 1142, pero está fuera del taller
                if (llanta.estado_ciclo === ESTADO.EN_REENCAUCHE.ciclo) {
                    throw aviso(409, 'La llanta está en reencauche y no se puede instalar hasta que regrese');
                }

                const [montada] = await conn.query(
                    'SELECT placa, posicion FROM neumaticos_instalaciones WHERE id_neumatico = ? AND fecha_out IS NULL FOR UPDATE',
                    [llanta.id_neumatico]);
                if (montada.length) throw aviso(409, `La llanta ya está montada en ${montada[0].placa} posición ${montada[0].posicion}`);

                const [ocupada] = await conn.query(
                    'SELECT id_neumatico FROM neumaticos_instalaciones WHERE placa = ? AND posicion = ? AND fecha_out IS NULL FOR UPDATE',
                    [placa, posicion]);
                if (ocupada.length) throw aviso(409, `La posición ${posicion} de ${placa} ya tiene una llanta montada (${ocupada[0].id_neumatico})`);

                const fecha = hoyLima();
                await conn.query(
                    `INSERT INTO neumaticos_instalaciones (id_neumatico, placa, posicion, fecha_in, km_in, usuario)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [llanta.id_neumatico, placa, posicion, fecha, km, usuarioDe(req)]);

                // Montada: ya no está en almacén
                await conn.query(
                    `UPDATE neumaticos_hoja_vida
                     SET placa_actual = ?, posicion_actual = ?, fecha_instalacion = ?, almacen_id = NULL,
                         estado_ciclo = ?, estado_operativo = ?
                     WHERE id_neumatico = ?`,
                    [placa, posicion, fecha, ESTADO.MONTADA.ciclo, ESTADO.MONTADA.operativo, llanta.id_neumatico]);

                await registrarMovimiento(conn, {
                    id_neumatico: llanta.id_neumatico, tipo: MOV.INSTALACION, origen: almacenPrevio, destino: null,
                    placa, posicion, km, fecha: ahoraLima(), usuario: usuarioDe(req),
                });
            });

            res.json({ ok: true, data: { codigo, placa, posicion, km_in: km, estado: ESTADO.MONTADA.ciclo } });
        } catch (err) {
            responder(res, err);
        }
    });

    // ============================================================
    // 5. RETIRAR: cierra la instalación, deja la posición libre y envía la llanta a Scrap o Reencauche
    // ============================================================
    router.post('/retirar', async (req, res) => {
        try {
            if (!tienePermiso(req, PERMISO_MOVER, 'c')) throw aviso(403, `Sin permiso (${PERMISO_MOVER}) para retirar llantas`);
            const b = req.body || {};
            const codigo = mayus(b.codigo);
            const placa = mayus(b.placa);
            const posicion = mayus(b.posicion);
            const destino = txt(b.destino);
            if (!codigo) throw aviso(400, 'El código de la llanta es obligatorio');
            if (!placa || !posicion) throw aviso(400, 'Placa y posición son obligatorias');
            if (destino !== 'desecho' && destino !== 'reencauche') {
                throw aviso(400, "El destino debe ser 'desecho' o 'reencauche'");
            }
            const claveDestino = destino === 'desecho' ? 'neumaticos.baja' : 'neumaticos.reencauche';
            if (!tienePermiso(req, claveDestino, 'c')) {
                throw aviso(403, `Sin permiso (${claveDestino}) para retirar la llanta a ${destino}`);
            }
            const km = Math.trunc(numeroNoNegativo(b.km, 'Kilometraje', true));
            const observacion = txt(b.observacion) || null;

            const esDesecho = destino === 'desecho';
            const almacenDestino = esDesecho ? ALMACEN.SCRAP : ALMACEN.REENCAUCHE;
            const estado = esDesecho ? ESTADO.DESECHO : ESTADO.EN_REENCAUCHE;

            const resultado = await conTransaccion(pool(req), async (conn) => {
                const llanta = await bloquearLlanta(conn, codigo);

                const [abiertas] = await conn.query(
                    'SELECT * FROM neumaticos_instalaciones WHERE id_neumatico = ? AND fecha_out IS NULL FOR UPDATE',
                    [llanta.id_neumatico]);
                if (!abiertas.length) throw aviso(409, 'La llanta no está montada en ningún vehículo');
                const inst = abiertas[0];
                if (mayus(inst.placa) !== placa || mayus(inst.posicion) !== posicion) {
                    throw aviso(409, `La llanta está montada en ${inst.placa} posición ${inst.posicion}, no en ${placa} ${posicion}`);
                }

                const kmIn = Number(inst.km_in) || 0;
                if (km < kmIn) throw aviso(400, `El kilometraje (${km}) no puede ser menor al de la instalación (${kmIn})`);
                const recorrido = km - kmIn;
                const fecha = hoyLima();

                const motivo = (`Retiro a ${destino}` + (observacion ? `: ${observacion}` : '')).slice(0, 200);
                await conn.query(
                    'UPDATE neumaticos_instalaciones SET fecha_out = ?, km_out = ?, motivo_salida = ? WHERE id = ?',
                    [fecha, km, motivo, inst.id]);

                // Posición libre: sin placa ni posición actuales. La llanta pasa al almacén de destino
                await conn.query(
                    `UPDATE neumaticos_hoja_vida
                     SET placa_actual = NULL, posicion_actual = NULL, almacen_id = ?,
                         estado_ciclo = ?, estado_operativo = ?, km_acumulado = COALESCE(km_acumulado, 0) + ?
                     WHERE id_neumatico = ?`,
                    [almacenDestino, estado.ciclo, estado.operativo, recorrido, llanta.id_neumatico]);

                await registrarMovimiento(conn, {
                    id_neumatico: llanta.id_neumatico,
                    tipo: esDesecho ? MOV.RETIRO_DESECHO : MOV.RETIRO_REENCAUCHE,
                    origen: llanta.almacen_id == null ? null : Number(llanta.almacen_id),
                    destino: almacenDestino,
                    placa, posicion, km, fecha: ahoraLima(), usuario: usuarioDe(req), observacion,
                });

                return { recorrido };
            });

            res.json({
                ok: true,
                data: {
                    codigo, destino, almacen_id: almacenDestino, estado: estado.ciclo,
                    km_recorridos: resultado.recorrido,
                },
            });
        } catch (err) {
            responder(res, err);
        }
    });

    // ============================================================
    // 6. RETORNO DE REENCAUCHE: sube la vida, suma el costo y deja la llanta en Reparadas
    // ============================================================
    router.post('/retorno-reencauche', async (req, res) => {
        try {
            if (!tienePermiso(req, 'neumaticos.reencauche', 'c')) throw aviso(403, 'Sin permiso (neumaticos.reencauche) para registrar el retorno de reencauche');
            const b = req.body || {};
            const codigo = mayus(b.codigo);
            if (!codigo) throw aviso(400, 'El código de la llanta es obligatorio');
            const proveedor = txt(b.proveedor) || null;
            const costo = numeroNoNegativo(b.costo_servicio, 'Costo del servicio');
            const disenio = txt(b.disenio) || null;
            const remanente = (b.remanente == null || b.remanente === '')
                ? null
                : numeroNoNegativo(b.remanente, 'Remanente');

            const nueva = await conTransaccion(pool(req), async (conn) => {
                const llanta = await bloquearLlanta(conn, codigo);
                if (llanta.almacen_id == null || Number(llanta.almacen_id) !== ALMACEN.REENCAUCHE) {
                    throw aviso(409, `La llanta no está en el almacén de reencauche (${ALMACEN.REENCAUCHE})`);
                }

                const vidaActual = llanta.vida || 'R0';
                const idx = VIDAS.indexOf(vidaActual);
                if (idx < 0) throw aviso(409, `Vida desconocida: ${vidaActual}`);
                if (idx >= VIDAS.length - 1) throw aviso(409, 'La llanta ya está en R3 y no admite más reencauches');
                const vidaNueva = VIDAS[idx + 1];

                const contador = (Number(llanta.contador_reencauches) || 0) + 1;
                const costoTotal = (Number(llanta.costo_reencauches) || 0) + costo;
                const remanenteFinal = remanente == null ? llanta.remanente_actual : remanente;

                await conn.query(
                    `UPDATE neumaticos_hoja_vida
                     SET vida = ?, contador_reencauches = ?, costo_reencauches = ?, remanente_actual = ?,
                         almacen_id = ?, estado_ciclo = ?, estado_operativo = ?
                     WHERE id_neumatico = ?`,
                    [vidaNueva, contador, costoTotal, remanenteFinal, ALMACEN.REPARADAS,
                     ESTADO.ALMACEN.ciclo, ESTADO.ALMACEN.operativo, llanta.id_neumatico]);

                const detalle = [
                    proveedor && `Proveedor: ${proveedor}`,
                    `Costo servicio: ${costo}`,
                    disenio && `Diseño: ${disenio}`,
                    remanente != null && `Remanente: ${remanente} mm`,
                    `Vida ${vidaActual} a ${vidaNueva}`,
                ].filter(Boolean).join('. ');

                await registrarMovimiento(conn, {
                    id_neumatico: llanta.id_neumatico, tipo: MOV.RETORNO_REENCAUCHE,
                    origen: ALMACEN.REENCAUCHE, destino: ALMACEN.REPARADAS,
                    fecha: ahoraLima(), usuario: usuarioDe(req), observacion: detalle,
                });

                return { vida: vidaNueva, contador, costoTotal };
            });

            res.json({
                ok: true,
                data: {
                    codigo, vida: nueva.vida, reencauches: nueva.contador,
                    costo_reencauches: nueva.costoTotal, almacen_id: ALMACEN.REPARADAS,
                    estado: ESTADO.ALMACEN.ciclo,
                },
            });
        } catch (err) {
            responder(res, err);
        }
    });

    // ============================================================
    // 7. REPORTE PARA EXCEL: mismas filas que la lista; la fecha de instalación sale como AAAA-MM-DD
    // ============================================================
    router.get('/reporte-ciclo', async (req, res) => {
        try {
            const [filas] = await pool(req).query(`${SQL_LLANTAS} ORDER BY codigo`);
            res.json({ ok: true, data: filas.map(filaLlanta) });
        } catch (err) {
            responder(res, err);
        }
    });

    // ============================================================
    // 8. TABLERO DE LA UNIDAD, LÍNEA DE TIEMPO Y MAPA IMPRIMIBLE (solo lectura)
    // ============================================================

    // Último odómetro GPS de la unidad (km_snapshots); null si no hay lectura
    async function kmActualPlaca(p, placa) {
        const norma = placa.replace(/[-\s]/g, '').toUpperCase();
        const [filas] = await p.query(
            `SELECT km_gps FROM km_snapshots
             WHERE UPPER(REPLACE(REPLACE(placa, '-', ''), ' ', '')) = ? AND km_gps > 0
             ORDER BY fecha DESC LIMIT 1`,
            [norma]);
        return filas.length ? Number(filas[0].km_gps) : null;
    }

    // Última medición por llanta y por llanta+posición (la primera fila de cada clave es la más reciente)
    async function ultimasMediciones(p, ids) {
        const porLlanta = new Map();
        const porLlantaPos = new Map();
        if (!ids.length) return { porLlanta, porLlantaPos };
        const [filas] = await p.query(
            `SELECT d.id_neumatico, d.posicion, d.r2, d.remanente_promedio
             FROM neumaticos_inspecciones_det d
             INNER JOIN neumaticos_inspecciones i ON d.id_inspeccion COLLATE utf8mb4_general_ci = i.id_inspeccion COLLATE utf8mb4_general_ci
             WHERE d.id_neumatico IN (?)
             ORDER BY i.fecha_inspeccion DESC, i.created_at DESC, d.id DESC`,
            [ids]);
        for (const f of filas) {
            const medicion = {
                remanente: f.remanente_promedio == null ? null : Number(f.remanente_promedio),
                surco_central: f.r2 == null ? null : Number(f.r2),   // r2 = surco central (r1 y r3 son los laterales)
            };
            if (!porLlanta.has(f.id_neumatico)) porLlanta.set(f.id_neumatico, medicion);
            const clave = `${f.id_neumatico}|${f.posicion}`;
            if (!porLlantaPos.has(clave)) porLlantaPos.set(clave, medicion);
        }
        return { porLlanta, porLlantaPos };
    }

    // Vida en número (R0 = 0 ... R3 = 3); null si no es una vida conocida
    function vidaNumero(vida) {
        const i = VIDAS.indexOf(String(vida || '').toUpperCase());
        return i < 0 ? null : i;
    }

    // Km recorridos por la llanta en la unidad: km actual de la placa menos el km de montaje
    function kmRecorridos(kmActual, kmMontaje) {
        if (kmActual == null || kmMontaje == null) return null;
        return kmActual >= kmMontaje ? kmActual - kmMontaje : null;
    }

    // Arma el tablero de una placa. Devuelve el contrato TableroPlaca y el detalle del croquis (con surco central).
    async function cargarTablero(p, placa) {
        const [montadas] = await p.query(
            `SELECT i.placa, i.posicion, i.km_in, DATE_FORMAT(i.fecha_in, '%Y-%m-%d') AS fecha_in,
                    h.id_neumatico, COALESCE(h.codigo_llanta, h.id_neumatico) AS codigo,
                    h.marca, h.modelo, h.medida, h.vida
             FROM neumaticos_instalaciones i
             INNER JOIN neumaticos_hoja_vida h ON h.id_neumatico = i.id_neumatico
             WHERE i.fecha_out IS NULL AND UPPER(TRIM(i.placa)) = ?
             ORDER BY CAST(i.posicion AS UNSIGNED), i.posicion`,
            [placa]);

        const [enStock] = await p.query(
            `SELECT h.id_neumatico, COALESCE(h.codigo_llanta, h.id_neumatico) AS codigo,
                    h.marca, h.modelo, h.medida, h.vida, h.estado_ciclo, h.almacen_id
             FROM neumaticos_hoja_vida h
             WHERE h.estado_ciclo IN ('en_almacen', 'en_reencauche', 'desechado')
             ORDER BY codigo`);

        const [configRows] = await p.query(
            'SELECT configuracion FROM placas WHERE UPPER(TRIM(placa)) = ? LIMIT 1',
            [placa]);
        const configuracion = configRows.length ? (txt(configRows[0].configuracion) || null) : null;

        const ids = [...new Set([...montadas, ...enStock].map(f => f.id_neumatico))];
        const { porLlanta, porLlantaPos } = await ultimasMediciones(p, ids);
        const kmActual = montadas.length ? await kmActualPlaca(p, placa) : null;

        const detalleMontadas = montadas.map(m => {
            const medicion = porLlantaPos.get(`${m.id_neumatico}|${m.posicion}`) || porLlanta.get(m.id_neumatico) || null;
            const kmMontaje = Number(m.km_in) || 0;
            return {
                posicion: m.posicion,
                surco_central: medicion ? medicion.surco_central : null,
                llanta: {
                    codigo: m.codigo,
                    marca: m.marca || null,
                    modelo: m.modelo || null,
                    medida: m.medida || null,
                    vida: vidaNumero(m.vida),
                    estado_ciclo: 'en_unidad',
                    almacen: null,
                    placa_actual: m.placa,
                    posicion_actual: m.posicion,
                    remanente_mm: medicion ? medicion.remanente : null,
                    fecha_montaje: m.fecha_in,
                    km_montaje: kmMontaje,
                    km_recorridos: kmRecorridos(kmActual, kmMontaje),
                },
            };
        });

        // Llanta fuera de la unidad (almacén, reencauche o desecho)
        const aLlanta = (f) => {
            const medicion = porLlanta.get(f.id_neumatico) || null;
            return {
                codigo: f.codigo,
                marca: f.marca || null,
                modelo: f.modelo || null,
                medida: f.medida || null,
                vida: vidaNumero(f.vida),
                estado_ciclo: f.estado_ciclo,
                almacen: NOMBRE_ALMACEN[Number(f.almacen_id)] || null,
                placa_actual: null,
                posicion_actual: null,
                remanente_mm: medicion ? medicion.remanente : null,
                fecha_montaje: null,
                km_montaje: null,
                km_recorridos: null,
            };
        };

        const tablero = {
            ok: true,
            placa,
            configuracion,
            posiciones: detalleMontadas.map(({ posicion, llanta }) => ({ posicion, llanta })),
            disponibles: enStock
                .filter(f => f.estado_ciclo === 'en_almacen' && ALMACENES_INSTALAR.includes(Number(f.almacen_id)))
                .map(aLlanta),
            reforma: enStock.filter(f => f.estado_ciclo === 'en_reencauche').map(aLlanta),
            descarte: enStock.filter(f => f.estado_ciclo === 'desechado').map(aLlanta),
        };
        return { tablero, croquis: detalleMontadas };
    }

    // Convierte una fila de neumaticos_movimientos al contrato EventoLlanta
    function eventoLlanta(r) {
        const origen = NOMBRE_ALMACEN[Number(r.almacen_origen_id)] || null;
        const destino = NOMBRE_ALMACEN[Number(r.almacen_destino_id)] || null;
        const lugar = r.placa ? `${r.placa}${r.posicion ? ` posición ${r.posicion}` : ''}` : null;
        let detalle;
        switch (r.tipo) {
            case MOV.ALTA: detalle = `Alta en almacén ${destino || '—'}`; break;
            case MOV.INSTALACION: detalle = `Montada en ${lugar || 'la unidad'}`; break;
            case MOV.RETIRO_DESECHO: detalle = `Retirada de ${lugar || 'la unidad'}; enviada a desecho (Scrap)`; break;
            case MOV.RETIRO_REENCAUCHE: detalle = `Retirada de ${lugar || 'la unidad'}; enviada a reencauche`; break;
            case MOV.RETORNO_REENCAUCHE: detalle = `Regresó de reencauche a ${destino || 'almacén'}`; break;
            default: detalle = String(r.tipo);
        }
        if (r.observacion) detalle += `. ${r.observacion}`;
        return {
            id: r.id,
            fecha: r.fecha,
            tipo: r.tipo,
            detalle,
            origen,
            destino,
            placa: r.placa || null,
            posicion: r.posicion || null,
            km: r.km == null ? null : Number(r.km),
            usuario: r.usuario || null,
        };
    }

    // GET /api/neumaticos/tablero/:placa -> TableroPlaca
    router.get('/tablero/:placa', async (req, res) => {
        try {
            if (!tienePermiso(req, PERMISO_VER, 'l')) throw aviso(403, `Sin permiso (${PERMISO_VER}) para ver neumáticos`);
            const placa = mayus(req.params.placa);
            if (!placa) throw aviso(400, 'La placa es obligatoria');
            const { tablero } = await cargarTablero(pool(req), placa);
            res.json(tablero);
        } catch (err) {
            responder(res, err);
        }
    });

    // GET /api/neumaticos/linea-tiempo/:codigo -> LineaTiempoLlanta (más reciente primero)
    router.get('/linea-tiempo/:codigo', async (req, res) => {
        try {
            if (!tienePermiso(req, PERMISO_VER, 'l')) throw aviso(403, `Sin permiso (${PERMISO_VER}) para ver neumáticos`);
            const p = pool(req);
            const buscado = mayus(req.params.codigo);
            const [llantas] = await p.query(
                `SELECT id_neumatico, COALESCE(codigo_llanta, id_neumatico) AS codigo
                 FROM neumaticos_hoja_vida WHERE codigo_llanta = ? OR id_neumatico = ? LIMIT 1`,
                [buscado, buscado]);
            if (!llantas.length) throw aviso(404, 'Llanta no encontrada');

            const [filas] = await p.query(
                `SELECT id, DATE_FORMAT(fecha, '%Y-%m-%d %H:%i') AS fecha, tipo, almacen_origen_id, almacen_destino_id,
                        placa, posicion, km, usuario, observacion
                 FROM neumaticos_movimientos
                 WHERE id_neumatico = ?
                 ORDER BY fecha DESC, id DESC`,
                [llantas[0].id_neumatico]);
            res.json({ ok: true, codigo: llantas[0].codigo, eventos: filas.map(eventoLlanta) });
        } catch (err) {
            responder(res, err);
        }
    });

    // GET /api/neumaticos/mapa-pdf/:placa -> PDF "Posición de los neumáticos en el vehículo {placa}" (solo lectura)
    router.get('/mapa-pdf/:placa', async (req, res) => {
        try {
            if (!tienePermiso(req, PERMISO_VER, 'l')) throw aviso(403, `Sin permiso (${PERMISO_VER}) para ver neumáticos`);
            const placa = mayus(req.params.placa);
            if (!placa) throw aviso(400, 'La placa es obligatoria');
            const { croquis } = await cargarTablero(pool(req), placa);
            const posiciones = croquis.map(c => ({
                posicion: c.posicion,
                codigo: c.llanta.codigo,
                vida: c.llanta.vida == null ? null : VIDAS[c.llanta.vida],
                fecha_montaje: c.llanta.fecha_montaje,
                km_recorridos: c.llanta.km_recorridos,
                surco_central: c.surco_central,
            }));
            const html = htmlMapaPosiciones({ placa, fechaImpresion: hoyLima(), posiciones });
            const pdf = await htmlAPdf(html, `Posición de los neumáticos en el vehículo ${placa}`);
            const nombre = placa.replace(/[^A-Z0-9]+/g, '-');
            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="posicion-neumaticos-${nombre}.pdf"`,
            });
            res.send(Buffer.from(pdf));
        } catch (err) {
            responder(res, err);
        }
    });

    return router;
};
