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
const { armarPosicionesUnidad } = require('../services/neumaticos_unidad');

// Almacenes del ciclo de vida: cada uno guarda una sola cosa
//   100  Nuevas      llantas nuevas listas
//   1142 Reencauche  llantas ya reencauchadas, listas para instalar
//   1144 Reparadas   llantas reparadas listas
//   1146 Retén       llantas retiradas de una unidad (a la espera de decidir su destino)
//   1148 Scrap       llantas desactivadas, de forma definitiva
const ALMACEN = { NUEVAS: 100, REENCAUCHE: 1142, REPARADAS: 1144, RETEN: 1146, SCRAP: 1148 };
const ALMACENES_ALTA = [ALMACEN.NUEVAS, ALMACEN.REENCAUCHE, ALMACEN.REPARADAS];
// Una llanta en_almacen de cualquiera de estos almacenes se puede instalar
const ALMACENES_INSTALAR = [ALMACEN.NUEVAS, ALMACEN.REENCAUCHE, ALMACEN.REPARADAS, ALMACEN.RETEN];
const NOMBRE_ALMACEN = { 100: 'Nuevas', 1142: 'Reencauche', 1144: 'Reparadas', 1146: 'Retén', 1148: 'Scrap' };

// Permisos del catálogo (src/modules/sistema/permisosCatalogo.ts)
const PERMISO_VER = 'neumaticos';
const PERMISO_MOVER = 'neumaticos.mover';
const PERMISO_REENCAUCHE = 'neumaticos.reencauche';
const PERMISO_BAJA = 'neumaticos.baja';

// Vida del neumático: R0 nueva; cada reencauche sube un nivel; R3 no admite más
const VIDAS = ['R0', 'R1', 'R2', 'R3'];

// Estado del ciclo (estado_ciclo) y su equivalente en el enum estado_operativo que usa la versión actual
const ESTADO = {
    ALMACEN: { ciclo: 'en_almacen', operativo: 'Stock Taller' },
    MONTADA: { ciclo: 'en_unidad', operativo: 'Montada' },
    EN_REENCAUCHE: { ciclo: 'en_reencauche', operativo: 'En Rencauche' },
    DESECHO: { ciclo: 'desechado', operativo: 'Desecho' },
};

// Tipos de movimiento (kardex). Al retirar de una unidad: RETIRO_RETEN (queda disponible en Retén), RETIRO_REENCAUCHE
// (enviar para reforma) y RETIRO_DESECHO (esperando descarte); los tres dejan la llanta en el almacén 1146.
const MOV = {
    ALTA: 'ALTA',
    INSTALACION: 'INSTALACION',
    RETIRO_RETEN: 'RETIRO_RETEN',
    RETIRO_DESECHO: 'RETIRO_DESECHO',
    RETIRO_REENCAUCHE: 'RETIRO_REENCAUCHE',
    MARCAR_REFORMA: 'MARCAR_REFORMA',
    MARCAR_DESCARTE: 'MARCAR_DESCARTE',
    DEVOLVER_RETEN: 'DEVOLVER_RETEN',
    DESPACHO_REFORMADORA: 'DESPACHO_REFORMADORA',
    DESACTIVACION: 'DESACTIVACION',
    RETORNO_REENCAUCHE: 'RETORNO_REENCAUCHE',
    RECHAZO_REENCAUCHE: 'RECHAZO_REENCAUCHE',
};

// Destinos del retiro desde una unidad. 'reencauche' y 'desecho' siguen valiendo por compatibilidad.
const DESTINO_RETIRO = {
    reten: { almacen: ALMACEN.RETEN, estado: { ciclo: 'en_almacen', operativo: 'Stock Taller' }, mov: MOV.RETIRO_RETEN, permiso: PERMISO_MOVER, texto: 'Retén' },
    reforma: { almacen: ALMACEN.RETEN, estado: { ciclo: 'en_reencauche', operativo: 'En Rencauche' }, mov: MOV.RETIRO_REENCAUCHE, permiso: PERMISO_REENCAUCHE, texto: 'reforma (enviar para reforma)' },
    descarte: { almacen: ALMACEN.RETEN, estado: { ciclo: 'desechado', operativo: 'Desecho' }, mov: MOV.RETIRO_DESECHO, permiso: PERMISO_BAJA, texto: 'descarte (esperando descarte)' },
};
const ALIAS_DESTINO = { reencauche: 'reforma', desecho: 'descarte' };

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
    if (rol === 'Fundador') return true;
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
    SELECT COALESCE(h.codigo_llanta, h.id_neumatico) AS codigo, h.codigo_llanta AS codigo_fuego, h.id_neumatico, h.marca, h.modelo, h.medida,
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
        codigo_fuego: r.codigo_fuego ? String(r.codigo_fuego).trim() || null : null,
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

// ── Listado y ficha (sección 9) ─────────────────────────────────

// Claves del listado: "activo" suma las llantas que no están dadas de baja; las demás son situaciones exclusivas
const CLAVES_LISTADO = ['activo', 'disponible', 'en_actividad', 'enviar_reforma', 'en_reformadora', 'esperando_descarte', 'desactivacion', 'sin_codigo', 'provisional'];

// Texto legible de cada situación
const SITUACION = {
    disponible: 'Disponible',
    en_actividad: 'En actividad',
    enviar_reforma: 'Enviar para reforma',
    en_reformadora: 'En la reformadora',
    esperando_descarte: 'Esperando descarte',
    desactivacion: 'Desactivación',
    sin_codigo: 'Sin código de fuego',
    provisional: 'Código provisional',
};

// Una sola situación por llanta. Sin código de marca de fuego manda sobre el estado del ciclo.
// Estado nuevo o sin estado: se trata como en almacén (igual que la migración al asignar estado_ciclo).
//   en_almacen    100, 1142, 1144 o 1146  → disponible
//   en_unidad     —                       → en_actividad
//   en_reencauche 1146 (en el Retén)      → enviar_reforma;  sin almacén (ya despachada) → en_reformadora
//   desechado     1146 (en el Retén)      → esperando_descarte;  1148 (Scrap) → desactivacion
function situacionLlanta(codigoLlanta, estadoCiclo, almacenId, idNeumatico) {
    // Sin código de fuego: las provisionales (PROV-) tienen su propio estado; las nuevas esperan su secuencia
    if (!txt(codigoLlanta)) return String(idNeumatico || '').startsWith('PROV-') ? 'provisional' : 'sin_codigo';
    const almacen = almacenId == null ? null : Number(almacenId);
    switch (estadoCiclo) {
        case 'en_unidad': return 'en_actividad';
        case 'en_reencauche': return almacen === ALMACEN.RETEN ? 'enviar_reforma' : 'en_reformadora';
        case 'desechado': return almacen === ALMACEN.SCRAP ? 'desactivacion' : 'esperando_descarte';
        default: return 'disponible';
    }
}

// Presión en PSI; 0 o vacío = sin medición (la columna tiene 0 por defecto)
function psiValido(v) {
    const n = Number(v);
    return v == null || !Number.isFinite(n) || n <= 0 ? null : n;
}

// Promedio de los tres surcos a un decimal
function surcoPromedio(r1, r2, r3) {
    return Math.round(((Number(r1) + Number(r2) + Number(r3)) / 3) * 10) / 10;
}

const { aviso: avisoCodigo, anioLima, formatearCodigo, asignarCodigosFuego } = require('../services/neumaticos_codigo');
const { aplicarRetornoReencauche, sinTabla } = require('../services/neumaticos_retorno');

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
    // 1b. ALMACENES DE LLANTAS (solo lectura): la hoja de inspección muestra siempre sus conteos.
    // Grupos disjuntos: cada llanta cae en uno solo (la misma regla de situacionLlanta, con código de fuego).
    //   disponibles.nuevas         → en_almacen, almacén 100
    //   disponibles.reencauchadas  → en_almacen, almacén 1142
    //   disponibles.reparadas      → en_almacen, almacén 1144
    //   disponibles.reten          → en_almacen, almacén 1146
    //   enviar_reforma             → en_reencauche, almacén 1146 (en la reformadora no entra)
    //   esperando_descarte         → desechado, almacén 1146 (en Scrap ya está desactivada)
    // ============================================================
    router.get('/almacenes', async (req, res) => {
        try {
            const [filas] = await pool(req).query(`
                SELECT h.id_neumatico, h.codigo_llanta, h.marca, h.modelo, h.medida, h.estado_ciclo, h.almacen_id
                FROM neumaticos_hoja_vida h
                WHERE h.estado_ciclo IN ('en_almacen', 'en_reencauche', 'desechado')
                ORDER BY h.codigo_llanta, h.id_neumatico`);
            const fila = f => ({
                codigo: txt(f.codigo_llanta) || txt(f.id_neumatico),
                marca: f.marca || null,
                modelo: f.modelo || null,
                medida: f.medida || null,
                estado_ciclo: f.estado_ciclo,
                almacen_id: f.almacen_id == null ? null : Number(f.almacen_id),
            });
            const de = clave => filas.filter(f => situacionLlanta(f.codigo_llanta, f.estado_ciclo, f.almacen_id, f.id_neumatico) === clave);
            const disponibles = de('disponible');
            const enAlmacen = id => disponibles.filter(f => Number(f.almacen_id) === id).map(fila);
            const grupos = {
                disponibles: {
                    nuevas: enAlmacen(ALMACEN.NUEVAS),
                    reencauchadas: enAlmacen(ALMACEN.REENCAUCHE),
                    reparadas: enAlmacen(ALMACEN.REPARADAS),
                    reten: enAlmacen(ALMACEN.RETEN),
                },
                enviar_reforma: de('enviar_reforma').map(fila),
                esperando_descarte: de('esperando_descarte').map(fila),
            };
            const conteos = {
                disponibles: disponibles.length,
                nuevas: grupos.disponibles.nuevas.length,
                reencauchadas: grupos.disponibles.reencauchadas.length,
                reparadas: grupos.disponibles.reparadas.length,
                reten: grupos.disponibles.reten.length,
                enviar_reforma: grupos.enviar_reforma.length,
                esperando_descarte: grupos.esperando_descarte.length,
            };
            res.json({ ok: true, grupos, conteos });
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
    // 3. CÓDIGO DE FUEGO (reemplaza al alta manual: la llanta recibida recibe su código por secuencia)
    // ============================================================
    router.get('/codigo-fuego', async (req, res) => {
        try {
            if (!tienePermiso(req, PERMISO_VER, 'l')) throw avisoCodigo(403, `Sin permiso (${PERMISO_VER}) para ver neumáticos`);
            const p = pool(req);
            const [cfg] = await p.query('SELECT letra, actualizado_por, actualizado_en FROM neumaticos_codigo_fuego_config WHERE id = 1');
            const anio = anioLima();
            const [sec] = await p.query('SELECT ultimo FROM neumaticos_codigo_fuego_secuencia WHERE anio = ?', [anio]);
            const ultimo = sec.length ? Number(sec[0].ultimo) : 0;
            const letra = cfg.length && cfg[0].letra ? String(cfg[0].letra) : null;
            res.json({
                ok: true,
                letra,
                anio,
                ultimo,
                proximo: letra ? formatearCodigo(letra, anio, ultimo + 1) : null,
                actualizado_por: cfg.length ? cfg[0].actualizado_por : null,
                actualizado_en: cfg.length ? cfg[0].actualizado_en : null,
            });
        } catch (err) {
            responder(res, err);
        }
    });

    router.put('/codigo-fuego/letra', async (req, res) => {
        try {
            if (!tienePermiso(req, PERMISO_VER, 'l')) throw avisoCodigo(403, `Sin permiso (${PERMISO_VER}) para ver neumáticos`);
            const letra = txt((req.body || {}).letra).toUpperCase();
            if (!/^[A-Z]$/.test(letra)) throw avisoCodigo(400, 'La letra debe ser una sola letra de la A a la Z');
            await pool(req).query(
                'UPDATE neumaticos_codigo_fuego_config SET letra = ?, actualizado_por = ? WHERE id = 1',
                [letra, usuarioDe(req)]);
            res.json({ ok: true, letra });
        } catch (err) {
            responder(res, err);
        }
    });

    router.post('/codigo-fuego/generar', async (req, res) => {
        try {
            if (!tienePermiso(req, PERMISO_VER, 'l')) throw avisoCodigo(403, `Sin permiso (${PERMISO_VER}) para ver neumáticos`);
            const entrada = Array.isArray((req.body || {}).ids) ? req.body.ids : [];
            const ids = [...new Set(entrada.map(v => txt(v)).filter(Boolean))];
            if (!ids.length) throw avisoCodigo(400, 'Selecciona al menos una llanta');
            if (ids.length > 200) throw avisoCodigo(400, 'Se pueden generar hasta 200 códigos por vez');
            const asignados = await conTransaccion(pool(req), conn => asignarCodigosFuego(conn, ids));
            res.json({ ok: true, asignados, message: `Se generaron ${asignados.length} códigos de fuego` });
        } catch (err) {
            responder(res, err);
        }
    });

    // ============================================================
    // Piezas comunes de los movimientos entre almacenes
    // ============================================================
    const situacionDe = l => situacionLlanta(l.codigo_llanta, l.estado_ciclo, l.almacen_id, l.id_neumatico);

    // Exige que la llanta esté en una de las situaciones permitidas; si no, explica en qué situación está
    function exigirSituacion(llanta, validas, accion) {
        const actual = situacionDe(llanta);
        if (!validas.includes(actual)) {
            throw aviso(409, `La llanta ${txt(llanta.codigo_llanta) || llanta.id_neumatico} está en "${SITUACION[actual]}" y no se puede ${accion}`);
        }
    }

    // Una llanta en R3 ya hizo 3 reencauches y no admite más: solo puede ir a descarte
    function exigirReencauchable(llanta) {
        if (String(llanta.vida || 'R0').trim().toUpperCase() === VIDAS[VIDAS.length - 1]) {
            throw aviso(409, 'Ya tiene 3 reencauches: mándala a descarte');
        }
    }

    // Pasa la llanta a otro almacén y estado, y deja su fila en el kardex (siempre dentro de la transacción de la ruta)
    async function pasarLlanta(conn, req, llanta, { almacen, estado, mov, observacion }) {
        await conn.query(
            `UPDATE neumaticos_hoja_vida SET almacen_id = ?, estado_ciclo = ?, estado_operativo = ? WHERE id_neumatico = ?`,
            [almacen, estado.ciclo, estado.operativo, llanta.id_neumatico]);
        await registrarMovimiento(conn, {
            id_neumatico: llanta.id_neumatico, tipo: mov,
            origen: llanta.almacen_id == null ? null : Number(llanta.almacen_id), destino: almacen,
            fecha: ahoraLima(), usuario: usuarioDe(req), observacion,
        });
    }

    // Ruta de una sola llanta: permiso, bloqueo FOR UPDATE, comprobación de situación, cambio y kardex
    function rutaMovimiento(ruta, { permiso, desde, accion, hacia, mov, texto, validar }) {
        router.post(ruta, async (req, res) => {
            try {
                if (!tienePermiso(req, permiso, 'c')) throw aviso(403, `Sin permiso (${permiso}) para ${texto}`);
                const b = req.body || {};
                const codigo = mayus(b.codigo);
                if (!codigo) throw aviso(400, 'El código de la llanta es obligatorio');
                const observacion = txt(b.observacion) || null;
                await conTransaccion(pool(req), async (conn) => {
                    const llanta = await bloquearLlanta(conn, codigo);
                    exigirSituacion(llanta, desde, accion);
                    if (validar) validar(llanta);
                    await pasarLlanta(conn, req, llanta, { ...hacia, mov, observacion });
                });
                res.json({ ok: true, data: { codigo, almacen_id: hacia.almacen, estado: hacia.estado.ciclo } });
            } catch (err) {
                responder(res, err);
            }
        });
    }

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
                // Solo las llantas en un almacén (no en reforma, descarte ni montadas) y de un almacén de uso
                if (llanta.estado_ciclo !== ESTADO.ALMACEN.ciclo || !ALMACENES_INSTALAR.includes(almacenPrevio)) {
                    throw aviso(409, 'La llanta no está disponible en un almacén (Nuevas 100, Reencauche 1142, Reparadas 1144 o Retén 1146)');
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
    // 5. RETIRAR: cierra la instalación, deja la posición libre y envía la llanta al Retén (almacén 1146).
    // destino: 'reten' (queda disponible), 'reforma' (enviar para reforma) o 'descarte' (esperando descarte).
    // Por compatibilidad, 'reencauche' equivale a 'reforma' y 'desecho' a 'descarte'.
    // ============================================================
    router.post('/retirar', async (req, res) => {
        try {
            if (!tienePermiso(req, PERMISO_MOVER, 'c')) throw aviso(403, `Sin permiso (${PERMISO_MOVER}) para retirar llantas`);
            const b = req.body || {};
            const codigo = mayus(b.codigo);
            const placa = mayus(b.placa);
            const posicion = mayus(b.posicion);
            const pedido = txt(b.destino);
            const destino = ALIAS_DESTINO[pedido] || pedido;
            const dest = DESTINO_RETIRO[destino];
            if (!codigo) throw aviso(400, 'El código de la llanta es obligatorio');
            if (!placa || !posicion) throw aviso(400, 'Placa y posición son obligatorias');
            if (!dest) throw aviso(400, "El destino debe ser 'reten', 'reforma' o 'descarte'");
            if (!tienePermiso(req, dest.permiso, 'c')) {
                throw aviso(403, `Sin permiso (${dest.permiso}) para retirar la llanta a ${dest.texto}`);
            }
            const km = Math.trunc(numeroNoNegativo(b.km, 'Kilometraje', true));
            const observacion = txt(b.observacion) || null;

            const resultado = await conTransaccion(pool(req), async (conn) => {
                const llanta = await bloquearLlanta(conn, codigo);
                // A reforma solo van llantas que admiten otro reencauche (una en R3 va a descarte)
                if (destino === 'reforma') exigirReencauchable(llanta);

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

                // Posición libre: sin placa ni posición actuales. La llanta pasa al Retén
                await conn.query(
                    `UPDATE neumaticos_hoja_vida
                     SET placa_actual = NULL, posicion_actual = NULL, almacen_id = ?,
                         estado_ciclo = ?, estado_operativo = ?, km_acumulado = COALESCE(km_acumulado, 0) + ?
                     WHERE id_neumatico = ?`,
                    [dest.almacen, dest.estado.ciclo, dest.estado.operativo, recorrido, llanta.id_neumatico]);

                await registrarMovimiento(conn, {
                    id_neumatico: llanta.id_neumatico, tipo: dest.mov,
                    origen: llanta.almacen_id == null ? null : Number(llanta.almacen_id),
                    destino: dest.almacen,
                    placa, posicion, km, fecha: ahoraLima(), usuario: usuarioDe(req), observacion,
                });

                return { recorrido };
            });

            res.json({
                ok: true,
                data: {
                    codigo, destino, almacen_id: dest.almacen, estado: dest.estado.ciclo,
                    km_recorridos: resultado.recorrido,
                },
            });
        } catch (err) {
            responder(res, err);
        }
    });

    // ============================================================
    // 5b. MOVIMIENTOS ENTRE ALMACENES (sin unidad): cada uno con transacción, FOR UPDATE, fila en el kardex y su permiso
    // ============================================================
    // disponible → Retén, para reforma
    rutaMovimiento('/marcar-reforma', {
        permiso: PERMISO_REENCAUCHE, desde: ['disponible'], accion: 'marcar para reforma', texto: 'marcar llantas para reforma',
        hacia: { almacen: ALMACEN.RETEN, estado: ESTADO.EN_REENCAUCHE }, mov: MOV.MARCAR_REFORMA,
        validar: exigirReencauchable,
    });
    // disponible → Retén, esperando descarte
    rutaMovimiento('/marcar-descarte', {
        permiso: PERMISO_BAJA, desde: ['disponible'], accion: 'marcar para descarte', texto: 'marcar llantas para descarte',
        hacia: { almacen: ALMACEN.RETEN, estado: ESTADO.DESECHO }, mov: MOV.MARCAR_DESCARTE,
    });
    // enviar_reforma o esperando_descarte → de nuevo disponible en el Retén
    rutaMovimiento('/devolver-reten', {
        permiso: PERMISO_MOVER, desde: ['enviar_reforma', 'esperando_descarte'], accion: 'devolver al Retén', texto: 'devolver llantas al Retén',
        hacia: { almacen: ALMACEN.RETEN, estado: ESTADO.ALMACEN }, mov: MOV.DEVOLVER_RETEN,
    });
    // esperando_descarte → Scrap (desactivada de forma definitiva)
    rutaMovimiento('/desactivar', {
        permiso: PERMISO_BAJA, desde: ['esperando_descarte'], accion: 'desactivar', texto: 'desactivar llantas',
        hacia: { almacen: ALMACEN.SCRAP, estado: ESTADO.DESECHO }, mov: MOV.DESACTIVACION,
    });

    // Órdenes de servicio de reencauche abiertas (con llantas pendientes de despacho o ya en la reformadora), para la pantalla de despacho
    router.get('/ordenes-reencauche', async (req, res) => {
        try {
            if (!tienePermiso(req, PERMISO_VER, 'l')) throw aviso(403, `Sin permiso (${PERMISO_VER}) para ver neumáticos`);
            const p = pool(req);
            let filas = [];
            try {
                [filas] = await p.query("SELECT oc_id, estado, COUNT(*) AS n FROM neumaticos_reencauche_oc WHERE estado IN ('pendiente', 'en_reformadora') GROUP BY oc_id, estado");
            } catch (err) {
                if (!sinTabla(err)) throw err;
            }
            const ids = [...new Set(filas.map(f => f.oc_id))];
            const ordenes = new Map();
            if (ids.length) {
                const [e] = await p.query('SELECT id, proveedor_nombre, estado FROM entradas_inv WHERE id IN (?)', [ids]);
                e.forEach(x => ordenes.set(x.id, x));
            }
            const cuenta = (id, estado) => Number((filas.find(f => f.oc_id === id && f.estado === estado) || {}).n || 0);
            const data = ids.map(id => {
                const o = ordenes.get(id) || {};
                return {
                    oc_id: id, proveedor: o.proveedor_nombre || '', estado_oc: o.estado || '',
                    aprobada: /^(aprobad|autorizad|procesad|pagad)/i.test(txt(o.estado)),
                    pendientes: cuenta(id, 'pendiente'), en_reformadora: cuenta(id, 'en_reformadora'),
                };
            }).sort((x, y) => String(y.oc_id).localeCompare(String(x.oc_id)));
            res.json({ ok: true, data });
        } catch (err) {
            responder(res, err);
        }
    });

    // Despacho a la reformadora: exige una orden de servicio de reencauche aprobada que contenga las llantas (en "pendiente")
    // y guarda la guía. Sin `codigos` se despachan todas las pendientes de la orden. Todo o nada.
    router.post('/despachar-reformadora', async (req, res) => {
        try {
            if (!tienePermiso(req, PERMISO_REENCAUCHE, 'c')) throw aviso(403, `Sin permiso (${PERMISO_REENCAUCHE}) para despachar llantas a la reformadora`);
            const b = req.body || {};
            const ocId = txt(b.oc_id);
            if (!ocId) throw aviso(400, 'Indica la orden de servicio de reencauche');
            const guia = txt(b.guia);
            if (!guia) throw aviso(400, 'La guía de despacho es obligatoria');
            const pedidos = Array.isArray(b.codigos) ? [...new Set(b.codigos.map(mayus).filter(Boolean))] : [];
            if (pedidos.length > 200) throw aviso(400, 'Se pueden despachar hasta 200 llantas por guía');
            const extra = txt(b.observacion);
            const observacion = `Orden ${ocId}. Guía: ${guia}${extra ? `. ${extra}` : ''}`;

            const despachadas = await conTransaccion(pool(req), async (conn) => {
                const [ent] = await conn.query('SELECT estado FROM entradas_inv WHERE id = ? LIMIT 1', [ocId]);
                if (!ent.length) throw aviso(404, `La orden ${ocId} no existe`);
                if (!/^(aprobad|autorizad|procesad|pagad)/i.test(txt(ent[0].estado))) {
                    throw aviso(409, `La orden ${ocId} está "${ent[0].estado}": debe estar aprobada para despachar las llantas`);
                }
                let filas;
                try {
                    [filas] = await conn.query("SELECT * FROM neumaticos_reencauche_oc WHERE oc_id = ? AND estado = 'pendiente' ORDER BY id_neumatico FOR UPDATE", [ocId]);
                } catch (err) {
                    if (sinTabla(err)) throw aviso(503, 'Falta aplicar la migración 14 (neumaticos_reencauche_oc)');
                    throw err;
                }
                if (!filas.length) throw aviso(409, `La orden ${ocId} no tiene llantas pendientes de despacho`);
                const porLlanta = new Map(filas.map(f => [f.id_neumatico, f]));
                const ids = pedidos.length ? [] : [...porLlanta.keys()];
                // Con códigos: cada uno debe pertenecer a la orden (pendiente)
                for (const codigo of pedidos) {
                    const l = await bloquearLlanta(conn, codigo);
                    if (!porLlanta.has(l.id_neumatico)) throw aviso(409, `La llanta ${codigo} no está pendiente de despacho en la orden ${ocId}`);
                    ids.push(l.id_neumatico);
                }
                ids.sort();
                for (const id of ids) {
                    const llanta = await bloquearLlanta(conn, id);
                    exigirSituacion(llanta, ['enviar_reforma'], 'despachar a la reformadora');
                    // Sale del Retén: ya no tiene almacén hasta que regrese
                    await pasarLlanta(conn, req, llanta, { almacen: null, estado: ESTADO.EN_REENCAUCHE, mov: MOV.DESPACHO_REFORMADORA, observacion });
                    await conn.query(
                        "UPDATE neumaticos_reencauche_oc SET estado = 'en_reformadora', guia = ?, despachado_en = ? WHERE id = ?",
                        [guia, ahoraLima(), porLlanta.get(id).id]);
                }
                return ids.length;
            });
            res.json({ ok: true, data: { oc_id: ocId, guia, despachadas } });
        } catch (err) {
            responder(res, err);
        }
    });

    // ============================================================
    // 6. RETORNO MANUAL DE REENCAUCHE (llantas enviar_reforma o en_reformadora que NO están en una orden de servicio).
    // Las llantas de una orden se resuelven al recepcionar la orden (Almacén > Recepción de compras).
    //   resultado 'aprobada' (por defecto): sube la vida, suma el costo y la llanta queda en 1142, en_almacen.
    //   resultado 'rechazada': no sube la vida ni suma costo; queda en el Retén (1146) esperando descarte.
    // ============================================================
    router.post('/retorno-reencauche', async (req, res) => {
        try {
            if (!tienePermiso(req, 'neumaticos.reencauche', 'c')) throw aviso(403, 'Sin permiso (neumaticos.reencauche) para registrar el retorno de reencauche');
            const b = req.body || {};
            const codigo = mayus(b.codigo);
            if (!codigo) throw aviso(400, 'El código de la llanta es obligatorio');
            const resultado = txt(b.resultado) || 'aprobada';
            if (resultado !== 'aprobada' && resultado !== 'rechazada') throw aviso(400, "El resultado debe ser 'aprobada' o 'rechazada'");
            const proveedor = txt(b.proveedor) || null;
            const motivo = txt(b.observacion) || null;
            const costo = numeroNoNegativo(b.costo_servicio, 'Costo del servicio');
            const disenio = txt(b.disenio) || null;
            const remanente = (b.remanente == null || b.remanente === '')
                ? null
                : numeroNoNegativo(b.remanente, 'Remanente');

            const nueva = await conTransaccion(pool(req), async (conn) => {
                const llanta = await bloquearLlanta(conn, codigo);
                exigirSituacion(llanta, ['en_reformadora', 'enviar_reforma'], 'registrar su retorno de reencauche');
                let enOrden = [];
                try {
                    [enOrden] = await conn.query(
                        "SELECT oc_id FROM neumaticos_reencauche_oc WHERE id_neumatico = ? AND estado IN ('pendiente', 'en_reformadora') LIMIT 1", [llanta.id_neumatico]);
                } catch (err) {
                    if (!sinTabla(err)) throw err;
                }
                if (enOrden.length) {
                    throw aviso(409, `La llanta está en la orden ${enOrden[0].oc_id}: su retorno se registra al recepcionar esa orden (Almacén > Recepción de compras)`);
                }
                return aplicarRetornoReencauche(conn, llanta, { resultado, costo, proveedor, disenio, remanente, motivo, usuario: usuarioDe(req), fecha: ahoraLima() });
            });

            if (nueva.rechazada) {
                return res.json({ ok: true, data: { codigo, resultado, almacen_id: ALMACEN.RETEN, estado: ESTADO.DESECHO.ciclo } });
            }
            res.json({
                ok: true,
                data: {
                    codigo, resultado, vida: nueva.vida, reencauches: nueva.contador,
                    costo_reencauches: nueva.costoTotal, almacen_id: ALMACEN.REENCAUCHE,
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

    // Una fila de inspección como medición: r1, r2 y r3 son las tres franjas de la banda (r2 = surco central)
    function medicionDe(f) {
        const num = v => (v == null ? null : Number(v));
        return {
            remanente: num(f.remanente_promedio),
            surco_central: num(f.r2),
            r1: num(f.r1),
            r2: num(f.r2),
            r3: num(f.r3),
            fecha: f.fecha || null,
        };
    }

    // Última medición por llanta y por llanta+posición (la primera fila de cada clave es la más reciente)
    async function ultimasMediciones(p, ids) {
        const porLlanta = new Map();
        const porLlantaPos = new Map();
        if (!ids.length) return { porLlanta, porLlantaPos };
        const [filas] = await p.query(
            `SELECT d.id_neumatico, d.posicion, d.r1, d.r2, d.r3, d.remanente_promedio
             FROM neumaticos_inspecciones_det d
             INNER JOIN neumaticos_inspecciones i ON d.id_inspeccion COLLATE utf8mb4_general_ci = i.id_inspeccion COLLATE utf8mb4_general_ci
             WHERE d.id_neumatico IN (?)
             ORDER BY i.fecha_inspeccion DESC, i.created_at DESC, d.id DESC`,
            [ids]);
        for (const f of filas) {
            const medicion = medicionDe(f);
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
            `SELECT h.id_neumatico, COALESCE(h.codigo_llanta, h.id_neumatico) AS codigo, h.codigo_llanta AS codigo_fuego,
                    h.marca, h.modelo, h.medida, h.vida, h.estado_ciclo, h.almacen_id
             FROM neumaticos_hoja_vida h
             WHERE h.estado_ciclo IN ('en_almacen', 'en_reencauche', 'desechado')
             ORDER BY codigo`);

        const [configRows] = await p.query(
            'SELECT configuracion FROM placas WHERE UPPER(TRIM(placa)) = ? LIMIT 1',
            [placa]);
        const configuracion = configRows.length ? (txt(configRows[0].configuracion) || null) : null;

        // Última inspección de la placa: define las llantas de la unidad y sus mediciones (ver services/neumaticos_unidad.js)
        const [ultimas] = await p.query(
            `SELECT i.id_inspeccion, DATE_FORMAT(i.fecha_inspeccion, '%Y-%m-%d') AS fecha
             FROM neumaticos_inspecciones i
             WHERE UPPER(TRIM(i.placa)) = ?
             ORDER BY i.fecha_inspeccion DESC, i.created_at DESC
             LIMIT 1`,
            [placa]);
        const fechaInspeccion = ultimas.length ? ultimas[0].fecha : null;
        let detalleInspeccion = [];
        if (ultimas.length) {
            [detalleInspeccion] = await p.query(
                `SELECT d.posicion, d.id_neumatico, d.marca, d.modelo, d.medida, d.r1, d.r2, d.r3, d.remanente_promedio
                 FROM neumaticos_inspecciones_det d
                 WHERE d.id_inspeccion = ?`,
                [ultimas[0].id_inspeccion]);
        }
        const idsInspeccion = detalleInspeccion.map(d => d.id_neumatico).filter(Boolean);
        const hojasInspeccion = new Map();
        if (idsInspeccion.length) {
            const [hojas] = await p.query(
                `SELECT h.id_neumatico, COALESCE(h.codigo_llanta, h.id_neumatico) AS codigo, h.marca, h.modelo, h.medida, h.vida
                 FROM neumaticos_hoja_vida h WHERE h.id_neumatico IN (?)`,
                [idsInspeccion]);
            for (const h of hojas) hojasInspeccion.set(h.id_neumatico, h);
        }

        const ids = [...new Set([...montadas, ...enStock].map(f => f.id_neumatico).concat(idsInspeccion))];
        const { porLlanta, porLlantaPos } = await ultimasMediciones(p, ids);
        const kmActual = montadas.length ? await kmActualPlaca(p, placa) : null;

        const posicionesUnidad = armarPosicionesUnidad({ fechaInspeccion, detalleInspeccion, instalaciones: montadas });
        const detalleMontadas = posicionesUnidad.map(({ posicion, fuente, instalacion, detalle }) => {
            const idLlanta = fuente === 'movimiento' ? instalacion.id_neumatico : (detalle.id_neumatico || (instalacion && instalacion.id_neumatico) || null);
            // Datos de la llanta: su hoja de vida; si la inspección no la liga, los de la instalación o los de la inspección
            const hoja = fuente === 'movimiento' ? instalacion
                : (detalle.id_neumatico ? hojasInspeccion.get(detalle.id_neumatico) : instalacion) || detalle;
            // Medición: la de la inspección cuando manda; si no, la última de la llanta
            const medicionInspeccion = detalle ? medicionDe({ ...detalle, fecha: fechaInspeccion }) : null;
            const medicion = fuente === 'inspeccion' ? medicionInspeccion
                : (detalle && detalle.id_neumatico === idLlanta ? medicionInspeccion
                    : porLlantaPos.get(`${idLlanta}|${posicion}`) || porLlanta.get(idLlanta) || null);
            const instDeLlanta = instalacion && instalacion.id_neumatico === idLlanta ? instalacion : null;
            const kmMontaje = instDeLlanta ? Number(instDeLlanta.km_in) || 0 : null;
            return {
                posicion,
                surco_central: medicion ? medicion.surco_central : null,
                llanta: {
                    codigo: hoja && hoja.codigo ? hoja.codigo : (idLlanta || `SIN REGISTRO ${posicion}`),
                    marca: hoja.marca || null,
                    modelo: hoja.modelo || null,
                    medida: hoja.medida || null,
                    vida: vidaNumero(hoja.vida),
                    estado_ciclo: 'en_unidad',
                    almacen: null,
                    placa_actual: placa,
                    posicion_actual: posicion,
                    remanente_mm: medicion ? medicion.remanente : null,
                    r1: medicion ? medicion.r1 : null,
                    r2: medicion ? medicion.r2 : null,
                    r3: medicion ? medicion.r3 : null,
                    fecha_montaje: instDeLlanta ? instDeLlanta.fecha_in : null,
                    km_montaje: kmMontaje,
                    km_recorridos: kmMontaje == null ? null : kmRecorridos(kmActual, kmMontaje),
                },
            };
        }).sort((a, b) => a.posicion.localeCompare(b.posicion, 'es', { numeric: true }));

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
                // Solo las llantas con código de fuego pueden ir a una unidad; sin código están en su propia situación
                .filter(f => f.estado_ciclo === 'en_almacen' && ALMACENES_INSTALAR.includes(Number(f.almacen_id)) && txt(f.codigo_fuego))
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
            case MOV.RETIRO_RETEN: detalle = `Retirada de ${lugar || 'la unidad'}; quedó en el Retén`; break;
            case MOV.RETIRO_DESECHO: detalle = `Retirada de ${lugar || 'la unidad'}; esperando descarte en el Retén`; break;
            case MOV.RETIRO_REENCAUCHE: detalle = `Retirada de ${lugar || 'la unidad'}; enviar para reforma desde el Retén`; break;
            case MOV.MARCAR_REFORMA: detalle = 'Marcada para reforma (Retén)'; break;
            case MOV.MARCAR_DESCARTE: detalle = 'Marcada para descarte (Retén)'; break;
            case MOV.DEVOLVER_RETEN: detalle = 'Devuelta a disponibles del Retén'; break;
            case MOV.DESPACHO_REFORMADORA: detalle = 'Despachada a la reformadora'; break;
            case MOV.DESACTIVACION: detalle = 'Desactivada (Scrap)'; break;
            case MOV.RETORNO_REENCAUCHE: detalle = `Regresó de reencauche a ${destino || 'almacén'}`; break;
            case MOV.RECHAZO_REENCAUCHE: detalle = 'Reencauche rechazado; esperando descarte en el Retén'; break;
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
    // Unidades para el selector del tablero: la tabla de placas de la empresa
    router.get('/placas', async (req, res) => {
        try {
            if (!tienePermiso(req, PERMISO_VER, 'l')) throw aviso(403, `Sin permiso (${PERMISO_VER}) para ver neumáticos`);
            const [filas] = await pool(req).query(
                `SELECT UPPER(TRIM(placa)) AS placa, cliente, marca, configuracion,
                        EXISTS (SELECT 1 FROM neumaticos_instalaciones i
                                WHERE i.fecha_out IS NULL AND UPPER(TRIM(i.placa)) = UPPER(TRIM(placas.placa))) AS tiene_llantas
                 FROM placas WHERE placa IS NOT NULL AND TRIM(placa) <> '' ORDER BY placa ASC`
            );
            res.json({ ok: true, data: (filas || []).map(f => ({ placa: f.placa, cliente: f.cliente || null, marca: f.marca || null, configuracion: f.configuracion || null, tiene_llantas: !!f.tiene_llantas })) });
        } catch (err) {
            responder(res, err);
        }
    });

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

    // ============================================================
    // 9. LISTADO DE NEUMÁTICOS Y FICHA DE UNA LLANTA (solo lectura)
    // ============================================================

    // Una fila por llanta con su situación. Mismo JOIN que SQL_LLANTAS (placa montada abierta), con el código crudo
    // para distinguir las llantas sin código de marca de fuego.
    async function cargarListado(p) {
        const [filas] = await p.query(`
            SELECT h.codigo_llanta, h.id_neumatico, h.marca, h.modelo, h.medida, h.estado_ciclo, h.vida,
                   h.almacen_id, h.placa_actual, h.costo_compra, i.placa AS placa_montada
            FROM neumaticos_hoja_vida h
            LEFT JOIN neumaticos_instalaciones i ON i.id_neumatico = h.id_neumatico AND i.fecha_out IS NULL
            ORDER BY COALESCE(h.codigo_llanta, h.id_neumatico)`);
        // OC de cada llanta de recepción: el código SFC-R{recepción}-L… apunta a la recepción y esta a su orden de compra
        const recepciones = [...new Set(filas.map(r => { const m = /^SFC-R(\d+)-L/.exec(String(r.id_neumatico)); return m ? Number(m[1]) : null; }).filter(Boolean))];
        const ocPorRecepcion = new Map();
        if (recepciones.length) {
            const [rs] = await p.query('SELECT id, oc_id FROM recepciones_oc WHERE id IN (?)', [recepciones]);
            rs.forEach(r => ocPorRecepcion.set(Number(r.id), r.oc_id));
        }
        // Moneda de cada orden: el costo de la llanta es el de la línea de la orden, en su misma moneda (no se convierte)
        const monedaPorOc = new Map();
        const ordenes = [...new Set([...ocPorRecepcion.values()].filter(Boolean))];
        if (ordenes.length) {
            const [os] = await p.query('SELECT id, moneda FROM entradas_inv WHERE id IN (?)', [ordenes]);
            os.forEach(o => monedaPorOc.set(o.id, String(o.moneda || 'PEN').toUpperCase()));
        }
        return filas.map(r => {
            const mRec = /^SFC-R(\d+)-L/.exec(String(r.id_neumatico));
            const ordenCompra = mRec ? (ocPorRecepcion.get(Number(mRec[1])) || null) : null;
            const almacenId = r.almacen_id == null ? null : Number(r.almacen_id);
            const compra = Number(r.costo_compra) || 0;
            const clave = situacionLlanta(r.codigo_llanta, r.estado_ciclo, almacenId, r.id_neumatico);
            return {
                clave,
                estado_ciclo: r.estado_ciclo || null,
                dato: {
                    codigo: txt(r.codigo_llanta) || txt(r.id_neumatico),
                    vida: vidaNumero(r.vida),
                    medida: r.medida || null,
                    marca: r.marca || null,
                    modelo: r.modelo || null,
                    estado_ciclo: r.estado_ciclo || null,
                    almacen: NOMBRE_ALMACEN[almacenId] || null,
                    placa_actual: r.placa_montada || r.placa_actual || null,
                    gastos_compra: compra > 0 ? compra : '',
                    moneda_compra: (ordenCompra && monedaPorOc.get(ordenCompra)) || 'PEN',
                    orden_compra: ordenCompra,
                    situacion: SITUACION[clave],
                },
            };
        });
    }

    // GET /api/neumaticos/listado?estado=&q= -> { conteos, data }
    // El texto de búsqueda (q) filtra los conteos; el estado solo filtra data.
    router.get('/listado', async (req, res) => {
        try {
            if (!tienePermiso(req, PERMISO_VER, 'l')) throw aviso(403, `Sin permiso (${PERMISO_VER}) para ver neumáticos`);
            const estado = txt(req.query.estado) || 'TODOS';
            if (estado !== 'TODOS' && !CLAVES_LISTADO.includes(estado)) throw aviso(400, 'Estado de listado no válido');
            const q = txt(req.query.q).toLowerCase();

            const todas = (await cargarListado(pool(req)))
                .filter(l => !q || [l.dato.codigo, l.dato.marca, l.dato.modelo, l.dato.medida, l.dato.placa_actual]
                    .some(v => String(v ?? '').toLowerCase().includes(q)));

            const conteos = Object.fromEntries(CLAVES_LISTADO.map(k => [k, 0]));
            for (const l of todas) {
                conteos[l.clave] += 1;
                if (l.estado_ciclo !== ESTADO.DESECHO.ciclo) conteos.activo += 1;
            }

            const data = todas
                .filter(l => estado === 'TODOS' || (estado === 'activo' ? l.estado_ciclo !== ESTADO.DESECHO.ciclo : l.clave === estado))
                .map(l => l.dato);

            res.json({ ok: true, conteos, data });
        } catch (err) {
            responder(res, err);
        }
    });

    // Mediciones de una llanta: las suyas (id_neumatico) y las de su posición mientras estuvo montada
    // (neumaticos_inspecciones_det trae id_neumatico NULL en las filas registradas desde la inspección).
    // Orden: más reciente primero.
    async function medicionesLlanta(p, idNeumatico) {
        const [filas] = await p.query(`
            SELECT d.id, d.posicion, d.r1, d.r2, d.r3, d.presion_actual, i.placa, i.km_vehiculo,
                   DATE_FORMAT(i.fecha_inspeccion, '%Y-%m-%d') AS fecha,
                   DATE_FORMAT(COALESCE(i.created_at, i.fecha_inspeccion), '%Y-%m-%d %H:%i') AS fecha_hora
            FROM neumaticos_inspecciones_det d
            INNER JOIN neumaticos_inspecciones i ON d.id_inspeccion COLLATE utf8mb4_general_ci = i.id_inspeccion COLLATE utf8mb4_general_ci
            WHERE d.id_neumatico = ?
               OR (d.id_neumatico IS NULL AND EXISTS (
                    SELECT 1 FROM neumaticos_instalaciones n
                    WHERE n.id_neumatico = ?
                      AND UPPER(TRIM(n.placa)) = UPPER(TRIM(i.placa))
                      AND UPPER(TRIM(n.posicion)) = UPPER(TRIM(d.posicion))
                      AND i.fecha_inspeccion >= n.fecha_in
                      AND (n.fecha_out IS NULL OR i.fecha_inspeccion <= n.fecha_out)))
            ORDER BY i.fecha_inspeccion DESC, i.created_at DESC, d.id DESC`, [idNeumatico, idNeumatico]);
        return filas;
    }

    // Eventos de kardex (neumaticos_movimientos) en el contrato de la línea de tiempo de la ficha
    function eventosKardex(movs, llanta) {
        return movs.map(m => {
            const destino = NOMBRE_ALMACEN[Number(m.almacen_destino_id)] || null;
            const base = {
                fecha: m.fecha, placa: m.placa || null, posicion: m.posicion || null,
                km: m.km == null ? null : Number(m.km), proveedor: null, valor: null,
                detalle: m.observacion || '',
            };
            switch (m.tipo) {
                case MOV.ALTA:
                    return { ...base, tipo: 'COMPRA', titulo: 'Alta en almacén', detalle: `Almacén ${destino || '—'}`,
                        placa: null, posicion: null, km: null, valor: llanta.costo_compra };
                case MOV.INSTALACION:
                    return { ...base, tipo: 'APLICACION', titulo: `Montada en ${m.placa || 'la unidad'}`,
                        detalle: m.posicion ? `Posición ${m.posicion}` : '' };
                case MOV.RETIRO_RETEN:
                    return { ...base, tipo: 'RETIRO', titulo: 'Retirada al Retén', detalle: m.observacion || 'Quedó disponible en el Retén' };
                case MOV.RETIRO_DESECHO:
                    return { ...base, tipo: 'RETIRO', titulo: 'Esperando descarte', detalle: m.observacion || 'Retirada al Retén para descarte' };
                case MOV.RETIRO_REENCAUCHE:
                    return { ...base, tipo: 'RETIRO', titulo: 'Enviar para reforma', detalle: m.observacion || 'Retirada al Retén para reforma' };
                case MOV.MARCAR_REFORMA:
                    return { ...base, tipo: 'REFORMA', titulo: 'Marcada para reforma', detalle: m.observacion || 'Pasó al Retén para reforma' };
                case MOV.MARCAR_DESCARTE:
                    return { ...base, tipo: 'RETIRO', titulo: 'Marcada para descarte', detalle: m.observacion || 'Pasó al Retén para descarte' };
                case MOV.DEVOLVER_RETEN:
                    return { ...base, tipo: 'OTRO', titulo: 'Devuelta al Retén', detalle: m.observacion || 'Vuelve a estar disponible en el Retén' };
                case MOV.DESPACHO_REFORMADORA:
                    return { ...base, tipo: 'REFORMA', titulo: 'Despachada a la reformadora', detalle: m.observacion || '' };
                case MOV.DESACTIVACION:
                    return { ...base, tipo: 'RETIRO', titulo: 'Desactivada', detalle: m.observacion || 'Desactivada de forma definitiva (Scrap)' };
                case MOV.RECHAZO_REENCAUCHE:
                    return { ...base, tipo: 'REFORMA', titulo: 'Reencauche rechazado', detalle: m.observacion || 'Esperando descarte en el Retén' };
                case MOV.RETORNO_REENCAUCHE: {
                    // El retorno guarda "Proveedor: X. Costo servicio: N. …" (routes/neumaticos-ciclo.js, POST /retorno-reencauche)
                    const obs = m.observacion || '';
                    const prov = /Proveedor: (.*?)\. Costo servicio:/.exec(obs);
                    const costo = /Costo servicio: ([\d.]+)/.exec(obs);
                    return { ...base, tipo: 'REFORMA', titulo: 'Regresó de reencauche', detalle: obs,
                        proveedor: prov ? prov[1] : null, valor: costo ? Number(costo[1]) : null };
                }
                default:
                    return { ...base, tipo: 'OTRO', titulo: String(m.tipo) };
            }
        });
    }

    // GET /api/neumaticos/ficha/:codigo -> { llanta, presion, surco, timeline }
    router.get('/ficha/:codigo', async (req, res) => {
        try {
            if (!tienePermiso(req, PERMISO_VER, 'l')) throw aviso(403, `Sin permiso (${PERMISO_VER}) para ver neumáticos`);
            const p = pool(req);
            const buscado = mayus(req.params.codigo);
            const [filas] = await p.query(`${SQL_LLANTAS} WHERE (h.codigo_llanta = ? OR h.id_neumatico = ?) LIMIT 1`, [buscado, buscado]);
            if (!filas.length) throw aviso(404, 'Llanta no encontrada');
            const base = filas[0];
            const llanta = filaLlanta(base);

            const [movs] = await p.query(
                `SELECT DATE_FORMAT(fecha, '%Y-%m-%d %H:%i') AS fecha, tipo, almacen_destino_id, placa, posicion, km, observacion
                 FROM neumaticos_movimientos WHERE id_neumatico = ? ORDER BY fecha DESC, id DESC`,
                [base.id_neumatico]);
            const mediciones = await medicionesLlanta(p, base.id_neumatico);

            // Presión: última medición con valor y todas en orden cronológico para la gráfica
            // La presión actual se muestra tal cual se guardó (también 0); la anterior no se usa aquí
            const valorPresion = v => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
            const conPresion = mediciones.filter(m => valorPresion(m.presion_actual) != null);
            const ultimaPresion = conPresion[0] || null;
            const presion = {
                ultima_medicion: ultimaPresion ? valorPresion(ultimaPresion.presion_actual) : null,
                fecha: ultimaPresion ? ultimaPresion.fecha_hora || ultimaPresion.fecha : null,
                historial: conPresion.slice().reverse().map(m => ({ fecha: m.fecha_hora || m.fecha, valor: valorPresion(m.presion_actual) })),
            };

            // Surco: última medición; el desgaste es la medición anterior menos la actual (positivo = desgaste)
            const ult = mediciones[0] || null;
            const ant = mediciones[1] || null;
            const resta = (a, b) => (a && b ? Number(a) - Number(b) : null);
            const surco = ult ? {
                fecha: ult.fecha,
                interno: ult.r1, central: ult.r2, externo: ult.r3,
                desgaste_interno: resta(ant && ant.r1, ult.r1),
                desgaste_central: resta(ant && ant.r2, ult.r2),
                desgaste_externo: resta(ant && ant.r3, ult.r3),
            } : null;

            const eventos = [
                ...eventosKardex(movs, llanta),
                ...mediciones.flatMap(m => {
                    const lista = [{
                        fecha: m.fecha_hora, tipo: 'APUNTE_SURCO', titulo: 'Medición de surco',
                        detalle: `Interno ${m.r1} · Central ${m.r2} · Externo ${m.r3} mm`,
                        placa: m.placa || null, posicion: m.posicion || null, proveedor: null,
                        km: m.km_vehiculo == null ? null : Number(m.km_vehiculo), valor: surcoPromedio(m.r1, m.r2, m.r3),
                    }];
                    const psi = psiValido(m.presion_actual);
                    if (psi != null) lista.push({
                        fecha: m.fecha_hora, tipo: 'MEDICION_PRESION', titulo: 'Medición de presión',
                        detalle: `${psi} PSI`, placa: m.placa || null, posicion: m.posicion || null, proveedor: null,
                        km: m.km_vehiculo == null ? null : Number(m.km_vehiculo), valor: psi,
                    });
                    return lista;
                }),
            ].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

            res.json({
                ok: true,
                llanta: {
                    codigo: llanta.codigo,
                    marca: llanta.marca || null,
                    modelo: llanta.modelo || null,
                    medida: llanta.medida || null,
                    vida: vidaNumero(llanta.vida),
                    estado_ciclo: llanta.estado || null,
                    almacen: NOMBRE_ALMACEN[llanta.almacen_id] || null,
                    placa_actual: llanta.placa || null,
                    posicion_actual: llanta.posicion || null,
                    km_acumulado: llanta.km_acumulado,
                    costo_compra: llanta.costo_compra,
                    costo_reencauches: llanta.costo_reencauches,
                    cpk: llanta.cpk,
                    contador_reencauches: llanta.reencauches,
                },
                presion,
                surco,
                timeline: eventos,
            });
        } catch (err) {
            responder(res, err);
        }
    });

    return router;
};

// Reglas puras (sin base de datos), para poder probarlas
module.exports.situacionLlanta = situacionLlanta;
module.exports.ALMACEN = ALMACEN;
