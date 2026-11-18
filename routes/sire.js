// SIRE de SUNAT: configuración de las credenciales (Sistema › Integraciones › SUNAT · SIRE) y prueba de conexión.
// Claves en integraciones_api (sin DDL): sire_ruc, sire_usuario_sol, sire_client_id, sire_client_secret (cifrada) y sire_clave_sol (cifrada).
// La lista genérica de integraciones nunca devuelve los secretos completos (máscara); aquí se guardan cifrados.
const express = require('express');
const S = require('../services/sire');

const CLAVES = ['sire_ruc', 'sire_usuario_sol', 'sire_client_id', 'sire_client_secret', 'sire_clave_sol'];

module.exports = (db, logAudit) => {
    const router = express.Router();
    const P = req => ((req && req.db) ? req.db : db).promise();
    const usuarioDe = req => String((req.user && (req.user.nombre || req.user.correo || req.user.email)) || 'sistema').slice(0, 150);
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[sire] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: 'No se pudo completar la operación.' });
    };

    // Guardar: lo que llega vacío o con la máscara («••••») en un secreto no se escribe (no borra ni pisa lo guardado)
    router.put('/config', async (req, res) => {
        try {
            const b = req.body || {};
            const ruc = String(b.ruc || '').replace(/\D/g, '');
            if (ruc && !/^\d{11}$/.test(ruc)) throw aviso('El RUC debe tener 11 dígitos.');
            const pares = [['sire_ruc', ruc], ['sire_usuario_sol', String(b.usuario_sol || '').trim().toUpperCase()], ['sire_client_id', String(b.client_id || '').trim()]];
            const secreto = (valor, clave) => { const t = String(valor || '').trim(); if (t && !t.startsWith('•')) pares.push([clave, S.cifrar(t)]); };
            secreto(b.client_secret, 'sire_client_secret');
            secreto(b.clave_sol, 'sire_clave_sol');
            for (const [clave, valor] of pares) {
                await P(req).query(`INSERT INTO integraciones_api (clave, valor, actualizado_por) VALUES (?, ?, ?)
                                    ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_por = VALUES(actualizado_por), actualizado_en = NOW()`, [clave, valor || null, usuarioDe(req)]);
            }
            if (logAudit) logAudit({ req, accion: 'GUARDAR_SIRE', modulo: 'SISTEMA', detalle: 'Credenciales del SIRE de SUNAT actualizadas' });
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'config'); }
    });

    // Probar: pide un token a SUNAT con lo guardado. No guarda el token ni consulta nada más.
    router.post('/probar', async (req, res) => {
        try {
            const [rows] = await P(req).query('SELECT clave, valor FROM integraciones_api WHERE clave IN (?)', [CLAVES]);
            const m = {}; rows.forEach(r => { m[r.clave] = r.valor || ''; });
            const cfg = { ruc: m.sire_ruc, usuario: m.sire_usuario_sol, clientId: m.sire_client_id, clientSecret: S.descifrar(m.sire_client_secret), clave: S.descifrar(m.sire_clave_sol) };
            const faltan = [!/^\d{11}$/.test(cfg.ruc || '') && 'el RUC', !cfg.usuario && 'el usuario SOL', !cfg.clave && 'la clave SOL', !cfg.clientId && 'el Client ID', !cfg.clientSecret && 'el Client Secret'].filter(Boolean);
            if (faltan.length) throw aviso(`Falta ${faltan.join(', ')}. Guárdalos y vuelve a probar.`, 422);
            const r = await S.obtenerToken(cfg);
            if (!r.ok) throw aviso(`SUNAT respondió: ${r.error}`, 422);
            res.json({ ok: true, message: `Conexión con el SIRE de SUNAT exitosa${r.expires_in ? ` (el permiso dura ${Math.round(r.expires_in / 60)} min)` : ''}.` });
        } catch (err) { responder(res, err, 'probar'); }
    });

    // Comprobar qué servicios de la API de SUNAT tiene habilitados la credencial (SIRE, buzón de mensajes, guías): solo pide el token de cada uno, no consulta nada
    router.post('/servicios', async (req, res) => {
        try {
            const cfg = await S.credencialesDe(P(req));
            const faltan = S.faltantes(cfg);
            if (faltan.length) throw aviso(`Falta ${faltan.join(', ')}. Guárdalos y vuelve a probar.`, 422);
            const servicios = [];
            for (const clave of Object.keys(S.SERVICIOS)) {
                const r = await S.probarServicio(cfg, clave);
                servicios.push({ clave, nombre: S.SERVICIOS[clave].nombre, ok: r.ok, detalle: r.ok ? 'Habilitado' : String(r.error || 'No habilitado').slice(0, 160) });
                await new Promise(x => setTimeout(x, 1500));
            }
            res.json({ ok: true, servicios });
        } catch (err) { responder(res, err, 'servicios'); }
    });

    return router;
};
