// Importación masiva de documentos de flota desde Excel (plantilla de Documentos de flota).
//  - Placa que no está en `placas`: se crea solo la placa (después se completa su información).
//  - Placa que ya existe: lo que trae el archivo se escribe encima del dato actual; lo que viene vacío no se toca.
//  - Cada documento que cambia deja una fila nueva en el historial (documentos_flota); la unidad muestra el actual.
// Todo en una transacción sobre la base de la empresa (req.db).
const express = require('express');
const { audit: auditar, actorFrom } = require('../services/auditoria');

const MAX_FILAS = 2000;

// Campos de la unidad que acepta el archivo (clave = columna de vehiculos_flota)
const FECHAS = new Set(['fecha_entrega', 'tc_vencimiento', 'soat_vencimiento', 'matpel_vencimiento', 'rt_emision', 'rt_vencimiento',
    'boni_emision', 'boni_vencimiento', 'sv_vencimiento', 'sc_vencimiento', 'fum_emision', 'fum_vencimiento', 'ext_emision', 'ext_vencimiento']);
const TEXTOS = ['tipo', 'propiedad', 'empresa', 'anio', 'modelo', 'color', 'marca', 'chasis', 'tc_constancia', 'soat_entidad', 'soat_pago',
    'matpel_constancia', 'sv_entidad', 'sv_asesor', 'sc_entidad', 'sc_asesor', 'ext_cantidad'];
const CAMPOS = [...FECHAS, ...TEXTOS];

// Columnas de vehiculos_flota que se reescriben con el registro completo (mismas que POST /api/vehiculos-flota)
const COLUMNAS = ['tipo', 'propiedad', 'empresa', 'fecha_entrega', 'anio', 'marca', 'modelo', 'color', 'chasis',
    'tc_vencimiento', 'tc_constancia', 'soat_entidad', 'soat_pago', 'soat_vencimiento', 'matpel_constancia', 'matpel_vencimiento',
    'rt_emision', 'rt_vencimiento', 'boni_emision', 'boni_vencimiento', 'sv_entidad', 'sv_asesor', 'sv_vencimiento',
    'sc_entidad', 'sc_asesor', 'sc_vencimiento', 'fum_emision', 'fum_vencimiento', 'ext_emision', 'ext_vencimiento', 'ext_cantidad',
    'tc_url', 'soat_url', 'matpel_url', 'rt_url', 'boni_url', 'sv_url', 'sc_url', 'fum_url', 'ext_url', 'wialon_name'];

// Documentos con historial: mismas claves de tipo_documento que usa la pantalla (guardarDocumentoVehiculo)
const DOCS = [
    { tipo: 'TARJETA_PROPIEDAD', constancia: 'tc_constancia', venc: 'tc_vencimiento', url: 'tc_url' },
    { tipo: 'SOAT', entidad: 'soat_entidad', pago: 'soat_pago', venc: 'soat_vencimiento', url: 'soat_url' },
    { tipo: 'MATPEL', constancia: 'matpel_constancia', venc: 'matpel_vencimiento', url: 'matpel_url' },
    { tipo: 'REV_TECNICA', emision: 'rt_emision', venc: 'rt_vencimiento', url: 'rt_url' },
    { tipo: 'BONIFICACION', emision: 'boni_emision', venc: 'boni_vencimiento', url: 'boni_url' },
    { tipo: 'SEG_VEHICULAR', entidad: 'sv_entidad', asesor: 'sv_asesor', venc: 'sv_vencimiento', url: 'sv_url' },
    { tipo: 'SEG_CARRETA', entidad: 'sc_entidad', asesor: 'sc_asesor', venc: 'sc_vencimiento', url: 'sc_url' },
    { tipo: 'FUMIGACION', emision: 'fum_emision', venc: 'fum_vencimiento', url: 'fum_url' },
    { tipo: 'EXTINTOR', emision: 'ext_emision', venc: 'ext_vencimiento', url: 'ext_url' },
];

const vacio = v => v == null || String(v).trim() === '' || String(v).trim() === '---' || String(v).trim() === '-';

/** AAAA-MM-DD de un valor de la base (Date con la zona del proceso, como lo crea mysql2) o de un texto */
function dia(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) return null;
        return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Igualdad de un valor ya guardado con el del archivo: 150.50 y 150.5 son lo mismo */
function igual(a, b) {
    const x = a == null ? '' : String(a).trim(), y = b == null ? '' : String(b).trim();
    if (x !== '' && y !== '' && Number.isFinite(Number(x)) && Number.isFinite(Number(y))) return Number(x) === Number(y);
    return x === y;
}

/** Fecha válida AAAA-MM-DD (año razonable y día que existe) */
function fechaValida(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (a < 1990 || a > 2100) return false;
    const f = new Date(Date.UTC(a, me - 1, d));
    return f.getUTCFullYear() === a && f.getUTCMonth() === me - 1 && f.getUTCDate() === d;
}

module.exports = function (db) {
    const router = express.Router();

    router.post('/documentos-flota/importar', async (req, res) => {
        const tdb = req.db || db;
        const registros = Array.isArray(req.body && req.body.registros) ? req.body.registros : [];
        if (!registros.length) return res.status(400).json({ error: 'El archivo no trae filas para importar.' });
        if (registros.length > MAX_FILAS) return res.status(400).json({ error: `Máximo ${MAX_FILAS} filas por archivo.` });
        const usuario = (req.user && (req.user.nombre || req.user.correo)) || 'SISTEMA';

        // 1) Validar y normalizar cada fila; una placa repetida en el archivo gana la última
        const omitidas = [];
        const porPlaca = new Map();
        registros.forEach((r, i) => {
            const fila = i + 2; // la fila 1 del Excel es el encabezado
            const placa = String(r.placa || '').toUpperCase().replace(/\s+/g, '').trim();
            if (!placa) { omitidas.push({ fila, placa: '', motivo: 'Sin placa' }); return; }
            if (!/^[A-Z0-9-]{5,12}$/.test(placa)) { omitidas.push({ fila, placa, motivo: 'Placa no válida' }); return; }
            const datos = {};
            for (const c of CAMPOS) {
                const v = r[c];
                if (vacio(v)) continue;
                if (FECHAS.has(c)) {
                    const s = String(v).trim();
                    if (!fechaValida(s)) { omitidas.push({ fila, placa, motivo: `Fecha no válida en ${c}: ${s}` }); return; }
                    datos[c] = s;
                } else {
                    datos[c] = String(v).trim().slice(0, 200);
                }
            }
            if (datos.ext_cantidad !== undefined && !Number.isFinite(Number(datos.ext_cantidad))) {
                omitidas.push({ fila, placa, motivo: 'Cantidad de extintores no válida' }); return;
            }
            if (porPlaca.has(placa)) omitidas.push({ fila: porPlaca.get(placa).fila, placa, motivo: 'Placa repetida en el archivo: se usó la última fila' });
            porPlaca.set(placa, { fila, datos });
        });
        if (!porPlaca.size) return res.status(400).json({ error: 'Ninguna fila es válida.', omitidas });

        // 2) Escribir todo junto
        const conn = await tdb.promise().getConnection();
        const placasNuevas = [];
        let actualizadas = 0, historial = 0;
        try {
            await conn.beginTransaction();
            for (const [placa, { datos }] of porPlaca) {
                const [pl] = await conn.query('SELECT placa FROM placas WHERE placa = ? LIMIT 1', [placa]);
                if (!pl.length) {
                    // Solo la placa: el resto de su información se completa después en Flota › Placas
                    await conn.query('INSERT INTO placas (placa, tipo, estado) VALUES (?, ?, ?)', [placa, datos.tipo || '', 'Activa']);
                    placasNuevas.push(placa);
                }

                const [vf] = await conn.query('SELECT * FROM vehiculos_flota WHERE placa = ? LIMIT 1 FOR UPDATE', [placa]);
                const actual = vf[0] || null;
                const siguiente = {};
                for (const c of COLUMNAS) {
                    const previo = actual ? actual[c] : null;
                    siguiente[c] = FECHAS.has(c) ? (dia(previo)) : (previo == null ? null : previo);
                    if (datos[c] !== undefined) siguiente[c] = datos[c];
                }
                if (!siguiente.propiedad) siguiente.propiedad = 'PROPIA';
                if (siguiente.ext_cantidad == null || siguiente.ext_cantidad === '') siguiente.ext_cantidad = 1;

                const cols = ['placa', ...COLUMNAS];
                const vals = [placa, ...COLUMNAS.map(c => siguiente[c] ?? null)];
                await conn.query(
                    `INSERT INTO vehiculos_flota (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
                     ON DUPLICATE KEY UPDATE ${COLUMNAS.map(c => `${c} = VALUES(${c})`).join(', ')}`,
                    vals);
                actualizadas++;

                // Historial: un registro nuevo por cada documento que trae el archivo y cambia respecto al actual
                for (const d of DOCS) {
                    const campos = [d.constancia, d.entidad, d.pago, d.asesor, d.emision, d.venc].filter(Boolean);
                    if (!campos.some(c => datos[c] !== undefined)) continue;
                    const cambio = campos.some(c => datos[c] !== undefined
                        && !igual(FECHAS.has(c) ? dia(actual && actual[c]) : (actual && actual[c]), datos[c]));
                    if (!cambio && actual) continue;
                    await conn.query(
                        `INSERT INTO documentos_flota (id, placa, tipo_documento, entidad, nro_constancia, fecha_emision, fecha_vencimiento, pago, asesor, observaciones, usuario)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [`DOC-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, placa, d.tipo,
                            d.entidad ? siguiente[d.entidad] : null, d.constancia ? siguiente[d.constancia] : null,
                            d.emision ? siguiente[d.emision] : null, siguiente[d.venc],
                            d.pago ? siguiente[d.pago] : null, d.asesor ? siguiente[d.asesor] : null,
                            siguiente[d.url] || null, usuario]);
                    historial++;
                }
            }
            await conn.commit();
        } catch (e) {
            await conn.rollback().catch(() => { });
            console.error('Importar documentos de flota:', e.message);
            return res.status(500).json({ error: 'No se importó nada: ' + e.message });
        } finally {
            conn.release();
        }

        auditar(tdb, actorFrom(req), {
            action: 'IMPORT', entity: 'fleet-documents', entityId: 'importacion',
            summary: `Importó documentos de flota: ${actualizadas} unidades (${placasNuevas.length} placas nuevas, ${historial} registros de historial)`,
            changes: null,
        });
        res.json({ ok: true, unidades: actualizadas, placasNuevas, historial, omitidas });
    });

    return router;
};
