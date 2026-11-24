'use strict';
// Operaciones Marsisa › Documentos de flota (API externa de Marsisa).
// Copia de SOLO CONSULTA de los documentos que entrega la API externa, en su propia tabla (marsisa_docs_flota_ext), sin tocar los
// documentos propios de la flota. El token y la dirección salen de Integraciones (integraciones_api: docs_ext_url y docs_ext_token).
// La API solo acepta la IP del servidor, por eso todo sale de aquí.
//
//   POST /sincronizar          recorre las páginas de /documentos y crea o actualiza por id remoto; los que dejan de venir se marcan eliminados
//   POST /sincronizar-archivos descarga en lote (por tandas) los archivos que faltan y los guarda una sola vez en S3
//   GET  /:id/archivo          da el enlace del archivo; si aún no está guardado lo baja de la API, lo guarda y lo entrega
//   GET  /                     lista con el estado calculado hoy (los días y el estado no quedan congelados)
const express = require('express');
const { uploadToS3, s3KeyFromUrl, getPresignedUrlEstable } = require('../utils/s3');

const URL_POR_DEFECTO = 'https://sistema.marsisa.com/api/externo/v1';
const MAX_ARCHIVO = 30 * 1024 * 1024;
const MAX_PAGINAS = 200;

module.exports = (db, logAudit) => {
    const router = express.Router();
    const P = req => ((req && req.db) ? req.db : db).promise();
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const usuarioDe = req => String((req.user && (req.user.nombre || req.user.correo || req.user.email)) || 'sistema').slice(0, 150);
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message, ...(err.esperar ? { esperar: err.esperar } : {}) });
        if (err && err.code === 'ER_NO_SUCH_TABLE') return res.status(409).json({ ok: false, error: 'Falta aplicar la actualización de la base de datos de esta empresa.' });
        console.error(`[docs-marsisa] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: 'No se pudo completar la operación.' });
    };
    const hoyLima = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date());
    const texto = (v, max) => { const t = String(v ?? '').replace(/ï¿½|�/g, '°').replace(/\s+/g, ' ').trim(); return t ? t.slice(0, max) : null; };
    const soloFecha = v => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null);
    const fechaHora = v => { const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/.exec(String(v || '')); return m ? `${m[1]} ${m[2]}` : null; };

    async function configuracion(req) {
        const [rows] = await P(req).query("SELECT clave, valor FROM integraciones_api WHERE clave IN ('docs_ext_url', 'docs_ext_token')");
        const m = {}; rows.forEach(r => { m[r.clave] = String(r.valor || '').trim(); });
        const url = (m.docs_ext_url || URL_POR_DEFECTO).replace(/\/+$/, '');
        if (!/^https:\/\//.test(url)) throw aviso('La dirección de la API debe empezar con https://', 422);
        if (!m.docs_ext_token) throw aviso('Falta el token de la API. Guárdalo en Sistema › Integraciones.', 422);
        return { url, token: m.docs_ext_token };
    }

    /** GET JSON a la API; un error de red o de la API se devuelve con un mensaje claro */
    async function pedir(cfg, ruta) {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 30000);
        try {
            const r = await fetch(cfg.url + ruta, { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' }, signal: ctl.signal, redirect: 'manual' });
            const cuerpo = await r.json().catch(() => null);
            // La API limita cuántas consultas por minuto acepta (429): se avisa cuánto esperar (Retry-After, entre 3 y 60 s)
            if (r.status === 429) { const e = aviso('La API de Marsisa pidió esperar un momento (demasiadas consultas seguidas).', 429); e.esperar = Math.min(60, Math.max(3, Number(r.headers.get('retry-after')) || 8)); throw e; }
            if (!r.ok) throw aviso(`La API respondió ${r.status}${cuerpo && cuerpo.message ? `: ${cuerpo.message}` : ''}.`, r.status === 401 || r.status === 403 ? 502 : 502);
            return cuerpo;
        } catch (e) {
            if (e && e.status) throw e;
            throw aviso(e && e.name === 'AbortError' ? 'La API no respondió a tiempo.' : 'No se pudo conectar con la API de documentos.', 502);
        } finally { clearTimeout(t); }
    }

    const dormir = ms => new Promise(r => setTimeout(r, ms));
    /** Igual que pedir, pero si la API pide esperar (429) espera y reintenta unas veces (para lecturas que no se pueden saltar) */
    async function pedirConEspera(cfg, ruta) {
        for (let intento = 0; ; intento++) {
            try { return await pedir(cfg, ruta); }
            catch (e) { if (!(e && e.status === 429) || intento >= 3) throw e; await dormir(Math.min(15, e.esperar || 8) * 1000); }
        }
    }

    /** Estado según la fecha de vencimiento de hoy: vigente, por vencer (30 días o menos), vencido o sin vencimiento */
    const estadoDe = (venc, hoy) => {
        if (!venc) return { estado: 'sin_vencimiento', dias: null };
        const dias = Math.round((Date.parse(`${venc}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000);
        return { estado: dias < 0 ? 'vencido' : dias <= 30 ? 'por_vencer' : 'vigente', dias };
    };

    // ── Lista ──
    router.get('/', async (req, res) => {
        try {
            const hoy = hoyLima();
            // Cada placa se compara con la ficha de nuestra flota (placas): si está en ella (activa) y si la tenemos alquilada a otra empresa
            const norm = c => `REPLACE(REPLACE(UPPER(${c}), '-', ''), ' ', '') COLLATE utf8mb4_unicode_ci`;
            const [rows] = await P(req).query(
                `SELECT d.id, d.id_remoto, d.placa, d.unidad_activa, d.tipo_codigo, d.tipo_nombre, d.numero, d.emisor,
                        DATE_FORMAT(d.fecha_emision, '%Y-%m-%d') AS fecha_emision, DATE_FORMAT(d.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
                        d.tiene_archivo, (d.archivo_url IS NOT NULL) AS archivo_guardado, DATE_FORMAT(d.actualizado_remoto, '%Y-%m-%d %H:%i') AS actualizado_remoto, DATE_FORMAT(d.sincronizado_en, '%Y-%m-%d %H:%i') AS sincronizado_en,
                        (p.placa IS NOT NULL AND (p.estado IS NULL OR p.estado NOT LIKE 'inactiv%')) AS en_flota, NULLIF(TRIM(COALESCE(p.alquilada_a, '')), '') AS alquilada_a, NULLIF(TRIM(COALESCE(p.cliente, '')), '') AS empresa,
                        p.tipo AS tipo_unidad, DATE_FORMAT(p.alquiler_desde, '%Y-%m-%d') AS alquiler_desde, p.alquiler_nota, p.docs_responsable
                 FROM marsisa_docs_flota_ext d LEFT JOIN placas p ON ${norm('p.placa')} = ${norm('d.placa')}
                 WHERE d.eliminado_remoto = 0 ORDER BY d.placa, d.tipo_nombre, d.fecha_vencimiento DESC`);
            const [[u]] = await P(req).query("SELECT DATE_FORMAT(MAX(sincronizado_en), '%Y-%m-%d %H:%i') AS ultima FROM marsisa_docs_flota_ext");
            res.json({ ok: true, hoy, ultima_sincronizacion: u.ultima || null, data: rows.map(r => ({ ...r, unidad_activa: !!r.unidad_activa, tiene_archivo: !!r.tiene_archivo, archivo_guardado: !!r.archivo_guardado, en_flota: !!r.en_flota, ...estadoDe(r.fecha_vencimiento, hoy) })) });
        } catch (err) {
            if (err && err.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true, data: [], sinTabla: true, ultima_sincronizacion: null });
            responder(res, err, 'lista');
        }
    });

    // ── Sincronizar documentos: todas las páginas, por id remoto ──
    router.post('/sincronizar', async (req, res) => {
        try {
            const p = P(req);
            const cfg = await configuracion(req);
            const [existentes] = await p.query("SELECT id_remoto, DATE_FORMAT(actualizado_remoto, '%Y-%m-%d %H:%i:%s') AS act FROM marsisa_docs_flota_ext");
            const previo = new Map(existentes.map(r => [Number(r.id_remoto), r.act]));

            // 1. Se leen TODAS las páginas antes de escribir: si la API falla a la mitad, no se toca nada
            const docs = [];
            let ultima = 1;
            for (let pagina = 1; pagina <= ultima && pagina <= MAX_PAGINAS; pagina++) {
                if (pagina > 1) await dormir(300);
                const r = await pedirConEspera(cfg, `/documentos?page=${pagina}`);
                const lista = Array.isArray(r && r.data) ? r.data : [];
                docs.push(...lista);
                ultima = Number(r && r.meta && r.meta.ultima_pagina) || 1;
            }
            if (!docs.length) throw aviso('La API no devolvió documentos; no se cambió nada.', 502);

            // 2. Una sola transacción: altas, cambios y los que ya no vienen
            const vistos = new Set();
            let nuevos = 0, actualizados = 0;
            await p.query('START TRANSACTION');
            try {
                for (let i = 0; i < docs.length; i += 100) {
                    const lote = docs.slice(i, i + 100);
                    const filas = [];
                    for (const d of lote) {
                        const id = Number(d.id);
                        if (!id || vistos.has(id)) continue;
                        vistos.add(id);
                        const act = fechaHora(d.actualizado_en);
                        if (!previo.has(id)) nuevos++; else if (previo.get(id) !== act) actualizados++;
                        filas.push([id, texto(d.unidad && d.unidad.placa, 20) || 'SIN-PLACA', d.unidad && d.unidad.activa === false ? 0 : 1,
                            texto(d.tipo && d.tipo.codigo, 80) || 'OTRO', texto(d.tipo && d.tipo.nombre, 200) || 'Otro',
                            texto(d.numero, 255), texto(d.emisor, 200), soloFecha(d.fecha_emision), soloFecha(d.fecha_vencimiento),
                            d.tiene_archivo ? 1 : 0, d.eliminado ? 1 : 0, act]);
                    }
                    if (filas.length) {
                        await p.query(
                            `INSERT INTO marsisa_docs_flota_ext (id_remoto, placa, unidad_activa, tipo_codigo, tipo_nombre, numero, emisor, fecha_emision, fecha_vencimiento, tiene_archivo, eliminado_remoto, actualizado_remoto)
                             VALUES ? ON DUPLICATE KEY UPDATE placa = VALUES(placa), unidad_activa = VALUES(unidad_activa), tipo_codigo = VALUES(tipo_codigo), tipo_nombre = VALUES(tipo_nombre),
                               numero = VALUES(numero), emisor = VALUES(emisor), fecha_emision = VALUES(fecha_emision), fecha_vencimiento = VALUES(fecha_vencimiento),
                               tiene_archivo = VALUES(tiene_archivo), eliminado_remoto = VALUES(eliminado_remoto), actualizado_remoto = VALUES(actualizado_remoto), sincronizado_en = NOW()`, [filas]);
                    }
                }
                // Los que ya no vienen en la API se ocultan (no se borran: se conserva su archivo guardado)
                const ids = [...vistos];
                let ocultos = 0;
                if (ids.length) {
                    const [r] = await p.query('UPDATE marsisa_docs_flota_ext SET eliminado_remoto = 1 WHERE id_remoto NOT IN (?) AND eliminado_remoto = 0', [ids]);
                    ocultos = r.affectedRows;
                }
                await p.query('COMMIT');
                if (logAudit) logAudit({ req, accion: 'SINCRONIZAR_DOCS_EXTERNOS', modulo: 'OPERACIONES', detalle: `${nuevos} nuevos, ${actualizados} actualizados, ${ocultos} ocultos (por ${usuarioDe(req)})` });
                res.json({ ok: true, total: vistos.size, nuevos, actualizados, ocultos, paginas: ultima, mensaje: `Se sincronizaron ${vistos.size} documentos: ${nuevos} nuevos, ${actualizados} actualizados${ocultos ? `, ${ocultos} ya no vienen en la API` : ''}.` });
            } catch (e) { await p.query('ROLLBACK'); throw e; }
        } catch (err) { responder(res, err, 'sincronizar'); }
    });

    /** Baja el archivo de un documento desde la API, lo guarda una vez en S3 y anota su dirección */
    async function guardarArchivo(req, cfg, fila) {
        const r = await pedir(cfg, `/documentos/${fila.id_remoto}/archivo`);
        const d = r && r.data;
        if (!d || !d.disponible || !d.url) throw aviso('Ese documento no tiene archivo disponible.', 404);
        const resp = await fetch(d.url);
        if (!resp.ok) throw aviso(`No se pudo descargar el archivo (${resp.status}).`, 502);
        const largo = Number(resp.headers.get('content-length')) || 0;
        if (largo > MAX_ARCHIVO) throw aviso('El archivo pesa más de 30 MB y no se guarda.', 413);
        const buffer = Buffer.from(await resp.arrayBuffer());
        if (buffer.length > MAX_ARCHIVO) throw aviso('El archivo pesa más de 30 MB y no se guarda.', 413);
        const mime = texto(d.mime, 100) || resp.headers.get('content-type') || 'application/octet-stream';
        const nombre = (texto(d.nombre, 255) || `documento_${fila.id_remoto}`).replace(/[^\w.\- ]+/g, '_');
        const url = await uploadToS3(buffer, `operaciones/docs-marsisa/${fila.id_remoto}/${Date.now()}_${nombre}`, mime);
        await P(req).query('UPDATE marsisa_docs_flota_ext SET archivo_url = ?, archivo_nombre = ?, archivo_mime = ? WHERE id = ?', [url, nombre, mime, fila.id]);
        return { url, nombre, mime };
    }

    const firmar = async url => { const k = s3KeyFromUrl(url); if (!k) return url; try { return await getPresignedUrlEstable(k); } catch (e) { return url; } };

    // ── Archivo de un documento: el guardado, o se baja de la API y se guarda ──
    router.get('/:id/archivo', async (req, res) => {
        try {
            const [rows] = await P(req).query('SELECT id, id_remoto, tiene_archivo, archivo_url, archivo_nombre, archivo_mime FROM marsisa_docs_flota_ext WHERE id = ?', [Number(req.params.id)]);
            if (!rows.length) throw aviso('Documento no encontrado.', 404);
            const f = rows[0];
            if (!f.tiene_archivo) throw aviso('Este documento no tiene archivo.', 404);
            let info = f.archivo_url ? { url: f.archivo_url, nombre: f.archivo_nombre, mime: f.archivo_mime } : await guardarArchivo(req, await configuracion(req), f);
            res.json({ ok: true, url: await firmar(info.url), nombre: info.nombre, mime: info.mime });
        } catch (err) { responder(res, err, 'archivo'); }
    });

    // ── Descargar en lote los archivos que faltan (el cliente repite hasta que no queden) ──
    router.post('/sincronizar-archivos', async (req, res) => {
        try {
            // Cada solicitud tiene un presupuesto de tiempo: el proxy corta (502) las que tardan demasiado, así que se devuelve lo avanzado
            // y el cliente sigue con otra tanda. Lo ya guardado se conserva.
            const inicio = Date.now();
            const PRESUPUESTO_MS = 25000;
            const limite = Math.min(10, Math.max(1, Number(req.query.limite) || 4));
            const cfg = await configuracion(req);
            // Los que ya fallaron en esta pasada (ids remotos) se saltan: si no, los mismos de siempre bloquean a los demás
            const excluir = String(req.query.excluir || '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 500);
            const filtroExcluir = excluir.length ? 'AND id_remoto NOT IN (?)' : '';
            const par = excluir.length ? [excluir] : [];
            const [pend] = await P(req).query(`SELECT id, id_remoto FROM marsisa_docs_flota_ext WHERE tiene_archivo = 1 AND eliminado_remoto = 0 AND archivo_url IS NULL ${filtroExcluir} ORDER BY id LIMIT ?`, [...par, limite]);
            let guardados = 0; let limitado = 0; const fallidos = [];
            for (const f of pend) {
                if (Date.now() - inicio > PRESUPUESTO_MS) break;
                try { await guardarArchivo(req, cfg, f); guardados++; }
                catch (e) {
                    // Si la API pide esperar (429) no es un fallo del archivo: se corta la tanda y el cliente espera lo que se indica
                    if (e && e.status === 429) { limitado = e.esperar || 8; break; }
                    fallidos.push({ id: f.id_remoto, error: e && e.message ? String(e.message).slice(0, 120) : 'error' });
                }
                // Ritmo suave para no pasar el límite de consultas por minuto de la API
                await dormir(900);
            }
            const [[{ n }]] = await P(req).query(`SELECT COUNT(*) AS n FROM marsisa_docs_flota_ext WHERE tiene_archivo = 1 AND eliminado_remoto = 0 AND archivo_url IS NULL ${filtroExcluir}`, par);
            // Los que fallaron siguen pendientes: si en esta tanda no se guardó ninguno, se corta para no repetir sin fin
            res.json({ ok: true, guardados, fallidos, pendientes: Number(n), limitado, detener: !limitado && pend.length > 0 && guardados === 0 && fallidos.length === pend.length });
        } catch (err) { responder(res, err, 'archivos'); }
    });

    return router;
};
