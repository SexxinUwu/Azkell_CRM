'use strict';
// Documentos de flota de otra empresa por API externa (Marsisa): configuración por empresa en integraciones_api
// (docs_ext_url y docs_ext_token, sin DDL) y exploración de SOLO LECTURA de lo que la API entrega.
//
// La API restringe por IP (solo el servidor de Azkell), por eso toda consulta sale del servidor, nunca del navegador.
// Aquí solo se hacen GET con el token guardado; no se escribe nada en la API ni se devuelve el token.
const express = require('express');

const URL_POR_DEFECTO = 'https://sistema.marsisa.com/api/externo/v1';
const RUTAS_DE_PRUEBA = ['', '/documentos', '/archivos', '/vehiculos', '/placas', '/unidades'];
const MAX_TEXTO = 30000;
const TIEMPO_MS = 20000;

module.exports = (db, logAudit) => {
    const router = express.Router();
    const P = req => ((req && req.db) ? req.db : db).promise();
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[docs-externos] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: 'No se pudo completar la consulta.' });
    };

    /** URL base y token de la empresa; sin token no hay consulta */
    async function configuracion(req) {
        const [rows] = await P(req).query("SELECT clave, valor FROM integraciones_api WHERE clave IN ('docs_ext_url', 'docs_ext_token')");
        const m = {}; rows.forEach(r => { m[r.clave] = String(r.valor || '').trim(); });
        const url = (m.docs_ext_url || URL_POR_DEFECTO).replace(/\/+$/, '');
        if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(url)) throw aviso('La dirección de la API debe empezar con https://', 422);
        if (!m.docs_ext_token) throw aviso('Falta el token de la API. Guárdalo en Sistema › Integraciones.', 422);
        return { url, token: m.docs_ext_token };
    }

    /** Una ruta relativa segura: empieza con «/», sin «..», sin otra dirección ni caracteres raros */
    function rutaSegura(ruta) {
        const r = String(ruta ?? '').trim();
        if (r === '') return '';
        if (!/^\/[A-Za-z0-9._~\-/%:@!$&'()*+,;=?]*$/.test(r) || r.includes('..') || r.includes('//')) throw aviso('Ruta no válida. Escribe algo como /documentos', 422);
        return r;
    }

    /** GET a la API con el token; devuelve estado, tipo y el cuerpo (JSON o texto recortado). Los archivos solo informan su tipo y tamaño. */
    async function consultar(cfg, ruta) {
        const inicio = Date.now();
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), TIEMPO_MS);
        try {
            const r = await fetch(cfg.url + ruta, { method: 'GET', headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' }, signal: ctl.signal, redirect: 'manual' });
            const tipo = String(r.headers.get('content-type') || '').split(';')[0].trim();
            const out = { ruta: ruta || '/', status: r.status, tipo, ms: Date.now() - inicio, exito: r.ok };
            if (/json|text|xml|html/.test(tipo) || !tipo) {
                const texto = await r.text();
                if (/json/.test(tipo)) { try { out.json = JSON.parse(texto); } catch (e) { out.texto = texto.slice(0, MAX_TEXTO); } } else out.texto = texto.slice(0, 600);
                // Un JSON muy largo se recorta para no saturar la pantalla
                if (out.json !== undefined && JSON.stringify(out.json).length > MAX_TEXTO) {
                    out.recortado = true;
                    out.json = Array.isArray(out.json) ? out.json.slice(0, 5) : out.json;
                    if (JSON.stringify(out.json).length > MAX_TEXTO) { out.texto = JSON.stringify(out.json).slice(0, MAX_TEXTO); delete out.json; }
                }
            } else {
                out.archivo = true;
                out.bytes = Number(r.headers.get('content-length')) || null;
                await r.body?.cancel?.();
            }
            return out;
        } catch (e) {
            return { ruta: ruta || '/', status: 0, exito: false, ms: Date.now() - inicio, error: e && e.name === 'AbortError' ? 'La API no respondió a tiempo.' : String((e && e.cause && e.cause.code) || (e && e.message) || 'Error de red') };
        } finally { clearTimeout(t); }
    }

    // Prueba: pide las rutas más probables y dice cuáles responden (así se descubre qué entrega la API)
    router.post('/probar', async (req, res) => {
        try {
            const cfg = await configuracion(req);
            const resultados = [];
            for (const ruta of RUTAS_DE_PRUEBA) resultados.push(await consultar(cfg, ruta));
            if (logAudit) logAudit({ req, accion: 'PROBAR_API_DOCS_EXTERNA', modulo: 'SISTEMA', detalle: `Prueba de lectura de ${cfg.url}` });
            res.json({ ok: true, base: cfg.url, resultados: resultados.map(r => ({ ...r, json: undefined, texto: r.exito ? undefined : r.texto })) });
        } catch (err) { responder(res, err, 'probar'); }
    });

    // Explorar: una consulta de lectura a la ruta indicada
    router.get('/explorar', async (req, res) => {
        try {
            const cfg = await configuracion(req);
            const ruta = rutaSegura(req.query.ruta);
            res.json({ ok: true, base: cfg.url, ...(await consultar(cfg, ruta)) });
        } catch (err) { responder(res, err, 'explorar'); }
    });

    return router;
};
