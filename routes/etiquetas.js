// Cola de impresión de etiquetas: cualquier usuario con acceso a Inventario manda sus etiquetas desde el navegador y la PC del almacén,
// que tiene la etiquetadora conectada por USB, las recoge y las imprime (agente-etiquetas/agente.js).
//  · agente: rutas con llave de API (scope «etiquetas:imprimir»), antes de la sesión. La PC del almacén las consulta cada pocos segundos.
//  · usuario: rutas con sesión, bajo /almacen/inventario/etiquetas (heredan el permiso de Inventario).
// Los trabajos viven en memoria y duran minutos: no se guarda nada en la base.
const express = require('express');

const VENCE_MS = 3 * 60 * 1000;          // un trabajo que nadie recoge en 3 minutos se descarta
const AGENTE_VIVO_MS = 45 * 1000;        // el agente cuenta como conectado si consultó en los últimos 45 s
const ESPERA_MAX_MS = 25 * 1000;         // consulta larga: el servidor retiene la respuesta hasta que haya trabajo
const MAX_ZPL = 256 * 1024;
const MAX_PENDIENTES = 40;
const SCOPE = 'etiquetas:imprimir';

/** Estado por empresa: trabajos, consultas esperando y última vez que se vio al agente */
const empresas = new Map();
const estadoDe = (req) => {
    const k = String(req.tenantSlug || 'default');
    if (!empresas.has(k)) empresas.set(k, { trabajos: new Map(), esperando: [], visto: 0 });
    return empresas.get(k);
};
const limpiar = (e) => { const t = Date.now(); for (const [id, j] of e.trabajos) if (t - j.creado > VENCE_MS * 2) e.trabajos.delete(id); };

/** Solo etiquetas: debe empezar con ^XA y no puede traer comandos que cambian la configuración guardada de la impresora */
function zplValido(zpl) {
    if (typeof zpl !== 'string' || !zpl.length || zpl.length > MAX_ZPL) return 'La etiqueta está vacía o es demasiado grande.';
    if (!/^\s*\^XA/.test(zpl)) return 'La etiqueta no es válida.';
    if (/\^JU|\^JJ|~JS|\^MP|\^SC|\^SS|~DG|~DY|\^DF/i.test(zpl)) return 'La etiqueta trae comandos de configuración no permitidos.';
    return null;
}

// ── Agente (PC del almacén): llave de API ────────────────────────────────────────
const _llavesBuenas = new Map(); // llave → vence (se revalida cada minuto)
function llaveAgente(req, res, next) {
    const auth = String(req.headers['authorization'] || '');
    const llave = String(req.headers['x-api-key'] || (auth.startsWith('Bearer ') ? auth.slice(7) : '')).trim();
    if (!llave) return res.status(401).json({ error: 'Falta la llave de API.' });
    const clave = `${req.tenantSlug || ''}|${llave}`;
    if ((_llavesBuenas.get(clave) || 0) > Date.now()) return next();
    (req.db || global.db).query('SELECT id, estado, scopes FROM api_keys WHERE api_key = ? LIMIT 1', [llave], (err, filas) => {
        if (err || !filas || !filas.length) return res.status(401).json({ error: 'Llave de API inválida.' });
        const k = filas[0];
        if (k.estado !== 'activo') return res.status(403).json({ error: `La llave está ${String(k.estado).toUpperCase()}.` });
        let scopes = [];
        try { scopes = typeof k.scopes === 'string' ? JSON.parse(k.scopes) : (k.scopes || []); } catch { scopes = String(k.scopes || '').split(',').map(s => s.trim()); }
        if (!scopes.includes('*') && !scopes.includes(SCOPE)) return res.status(403).json({ error: `La llave no tiene el permiso «${SCOPE}».` });
        if (_llavesBuenas.size > 200) _llavesBuenas.clear();
        _llavesBuenas.set(clave, Date.now() + 60 * 1000);
        (req.db || global.db).query('UPDATE api_keys SET ultimo_uso = NOW() WHERE id = ?', [k.id], () => { });
        next();
    });
}

const agente = express.Router();

// El agente pregunta si hay etiquetas; si no hay, la respuesta se retiene hasta 25 s y se contesta apenas llegue una
agente.get('/v1/etiquetas/siguiente', llaveAgente, (req, res) => {
    const e = estadoDe(req);
    e.visto = Date.now();
    const tomar = () => {
        const t = Date.now();
        for (const j of e.trabajos.values()) {
            if (j.estado === 'pendiente' && t - j.creado < VENCE_MS) { j.estado = 'enviado'; return j; }
        }
        return null;
    };
    const j = tomar();
    if (j) return res.json({ id: j.id, zpl: j.zpl });
    const espera = { res, vence: setTimeout(() => { e.esperando = e.esperando.filter(x => x !== espera); e.visto = Date.now(); if (!res.headersSent) res.status(204).end(); }, ESPERA_MAX_MS) };
    e.esperando.push(espera);
    req.on('close', () => { clearTimeout(espera.vence); e.esperando = e.esperando.filter(x => x !== espera); });
});

// El agente avisa cómo salió cada etiqueta
agente.post('/v1/etiquetas/resultado', llaveAgente, express.json({ limit: '10kb' }), (req, res) => {
    const e = estadoDe(req);
    e.visto = Date.now();
    const j = e.trabajos.get(String(req.body && req.body.id || ''));
    if (!j) return res.status(404).json({ error: 'Trabajo no encontrado.' });
    if (req.body.ok) j.estado = 'impreso';
    else { j.estado = 'error'; j.error = String(req.body.error || 'La impresora no respondió.').slice(0, 200); }
    res.json({ ok: true });
});

// ── Usuarios con sesión ──────────────────────────────────────────────────────────
const usuario = express.Router();

usuario.get('/almacen/inventario/etiquetas/estado', (req, res) => {
    const e = estadoDe(req);
    res.json({ ok: true, agente: Date.now() - e.visto < AGENTE_VIVO_MS });
});

usuario.post('/almacen/inventario/etiquetas/imprimir', express.json({ limit: '300kb' }), (req, res) => {
    const e = estadoDe(req);
    if (Date.now() - e.visto >= AGENTE_VIVO_MS) return res.status(409).json({ ok: false, error: 'La etiquetadora del almacén no está conectada. Pide que abran el programa de etiquetas en la PC de la impresora.' });
    const zpl = req.body && req.body.zpl;
    const malo = zplValido(zpl);
    if (malo) return res.status(400).json({ ok: false, error: malo });
    limpiar(e);
    if ([...e.trabajos.values()].filter(j => j.estado === 'pendiente').length >= MAX_PENDIENTES) return res.status(429).json({ ok: false, error: 'Hay demasiadas etiquetas esperando. Espera a que se impriman.' });
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const j = { id, zpl, estado: 'pendiente', error: '', creado: Date.now(), por: (req.user && (req.user.nombre || req.user.correo)) || '' };
    e.trabajos.set(id, j);
    // Si el agente está esperando, se le entrega de inmediato
    const w = e.esperando.shift();
    if (w) { clearTimeout(w.vence); j.estado = 'enviado'; if (!w.res.headersSent) w.res.json({ id, zpl }); }
    res.json({ ok: true, id });
});

usuario.get('/almacen/inventario/etiquetas/trabajo/:id', (req, res) => {
    const e = estadoDe(req);
    const j = e.trabajos.get(String(req.params.id));
    if (!j) return res.status(404).json({ ok: false, error: 'No se encontró la etiqueta.' });
    // Un trabajo que nadie recogió vence solo
    if (j.estado === 'pendiente' && Date.now() - j.creado > VENCE_MS) { j.estado = 'error'; j.error = 'La etiquetadora no la recogió a tiempo.'; }
    res.json({ ok: true, estado: j.estado, error: j.error });
});

module.exports = { agente, usuario };
