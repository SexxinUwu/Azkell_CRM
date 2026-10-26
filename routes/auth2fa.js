/**
 * routes/auth2fa.js — 2FA TOTP (Google Authenticator) + WebAuthn/Passkey
 *
 * Flujo TOTP:
 *   POST /api/2fa/totp/setup      → genera secret + QR (requiere sesión activa)
 *   POST /api/2fa/totp/verify     → verifica código 6 dígitos y activa 2FA
 *   POST /api/2fa/totp/disable    → desactiva 2FA (requiere código válido)
 *   POST /api/2fa/totp/validate   → valida durante el login (no requiere JWT aún)
 *
 * Flujo WebAuthn:
 *   GET  /api/2fa/webauthn/register-options  → opciones para registrar passkey
 *   POST /api/2fa/webauthn/register-verify   → verifica registro y guarda credencial
 *   GET  /api/2fa/webauthn/auth-options      → opciones para autenticar
 *   POST /api/2fa/webauthn/auth-verify       → verifica autenticación
 *   GET  /api/2fa/webauthn/credentials       → lista credenciales del usuario
 *   DELETE /api/2fa/webauthn/credentials/:id → elimina credencial
 *
 * GET /api/2fa/status → estado 2FA del usuario autenticado
 */

const express = require('express');
const { AsyncLocalStorage } = require('async_hooks');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const APP_NAME = 'Azkell Fleet';
const RP_ID = process.env.RP_ID || 'localhost';
const RP_ORIGIN = process.env.RP_ORIGIN || `http://${RP_ID}`;

const tenantStorage = new AsyncLocalStorage();

// Almacena challenges temporales en memoria (TTL 5 min).
// En producción con múltiples instancias usa Redis, pero para un solo proceso está bien.
const _challenges = new Map();
function setChallenge(key, value) {
    _challenges.set(key, { value, exp: Date.now() + 5 * 60 * 1000 });
}
function getChallenge(key) {
    const entry = _challenges.get(key);
    if (!entry) return null;
    if (Date.now() > entry.exp) { _challenges.delete(key); return null; }
    _challenges.delete(key);
    return entry.value;
}

module.exports = function (db) {
    const router = express.Router();

    router.use((req, res, next) => {
        tenantStorage.run(req.db || db, next);
    });

    // ── Helpers ──────────────────────────────────────────────────────────────

    function dbq(sql, params) {
        const pool = tenantStorage.getStore() || db;
        return new Promise((resolve, reject) => {
            pool.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
        });
    }

    // ── GET /status ───────────────────────────────────────────────────────────
    router.get('/status', async (req, res) => {
        try {
            const uid = req.user?.id;
            if (!uid) return res.status(401).json({ error: 'No autenticado' });

            const [row] = await dbq('SELECT totp_activo FROM usuarios_2fa WHERE usuario_id=?', [uid]);
            const creds = await dbq('SELECT id, nombre, device_type, backed_up, created_at FROM webauthn_credentials WHERE usuario_id=?', [uid]);
            res.json({
                totp_activo: !!(row?.totp_activo),
                webauthn_count: creds.length,
                webauthn_credentials: creds,
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── POST /totp/setup ──────────────────────────────────────────────────────
    router.post('/totp/setup', async (req, res) => {
        try {
            const uid = req.user?.id;
            const correo = req.user?.correo;
            if (!uid) return res.status(401).json({ error: 'No autenticado' });

            const secret = speakeasy.generateSecret({ name: `${APP_NAME} (${correo})`, length: 20 });
            // Guardamos el secret pendiente (aún no activo)
            await dbq(`
                INSERT INTO usuarios_2fa (usuario_id, totp_secret, totp_activo)
                VALUES (?, ?, 0)
                ON DUPLICATE KEY UPDATE totp_secret=VALUES(totp_secret), totp_activo=0
            `, [uid, secret.base32]);

            const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
            res.json({ secret: secret.base32, qr: qrDataUrl, otpauth: secret.otpauth_url });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── POST /totp/verify (activa 2FA tras confirmar con código) ──────────────
    router.post('/totp/verify', async (req, res) => {
        try {
            const uid = req.user?.id;
            if (!uid) return res.status(401).json({ error: 'No autenticado' });

            const { codigo } = req.body;
            const [row] = await dbq('SELECT totp_secret FROM usuarios_2fa WHERE usuario_id=?', [uid]);
            if (!row?.totp_secret) return res.status(400).json({ error: 'Primero ejecuta /setup' });

            const ok = speakeasy.totp.verify({
                secret: row.totp_secret,
                encoding: 'base32',
                token: String(codigo).replace(/\s/g, ''),
                window: 1,
            });
            if (!ok) return res.status(400).json({ error: 'Código incorrecto' });

            await dbq('UPDATE usuarios_2fa SET totp_activo=1 WHERE usuario_id=?', [uid]);
            res.json({ activado: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── POST /totp/disable ───────────────────────────────────────────────────
    router.post('/totp/disable', async (req, res) => {
        try {
            const uid = req.user?.id;
            if (!uid) return res.status(401).json({ error: 'No autenticado' });

            const { codigo } = req.body;
            const [row] = await dbq('SELECT totp_secret FROM usuarios_2fa WHERE usuario_id=?', [uid]);
            if (!row?.totp_secret) return res.json({ desactivado: true });

            const ok = speakeasy.totp.verify({
                secret: row.totp_secret,
                encoding: 'base32',
                token: String(codigo).replace(/\s/g, ''),
                window: 1,
            });
            if (!ok) return res.status(400).json({ error: 'Código incorrecto' });

            await dbq('UPDATE usuarios_2fa SET totp_activo=0, totp_secret=NULL WHERE usuario_id=?', [uid]);
            res.json({ desactivado: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── POST /totp/validate (durante login — no requiere JWT completo) ────────
    // El cliente envía { correo, totp_code } tras login exitoso con contraseña.
    // El backend responde { valido: true/false }.
    router.post('/totp/validate', async (req, res) => {
        try {
            const { correo, totp_code } = req.body;
            if (!correo || !totp_code) return res.status(400).json({ error: 'Faltan campos' });

            const users = await dbq('SELECT idUsuario FROM usuarios WHERE LOWER(TRIM(correo))=LOWER(?)', [correo.trim()]);
            if (!users.length) return res.status(404).json({ error: 'Usuario no encontrado' });

            const uid = users[0].idUsuario;
            const [row] = await dbq('SELECT totp_secret, totp_activo FROM usuarios_2fa WHERE usuario_id=?', [uid]);
            if (!row?.totp_activo) return res.json({ valido: true, requerido: false });

            const ok = speakeasy.totp.verify({
                secret: row.totp_secret,
                encoding: 'base32',
                token: String(totp_code).replace(/\s/g, ''),
                window: 1,
            });
            res.json({ valido: ok, requerido: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── GET /webauthn/register-options ───────────────────────────────────────
    router.get('/webauthn/register-options', async (req, res) => {
        try {
            const uid = req.user?.id;
            const correo = req.user?.correo;
            const nombre = req.user?.nombre || correo;
            if (!uid) return res.status(401).json({ error: 'No autenticado' });

            const existentes = await dbq('SELECT id, transports FROM webauthn_credentials WHERE usuario_id=?', [uid]);
            const excludeCredentials = existentes.map(c => ({
                id: c.id,
                transports: c.transports ? c.transports.split(',') : [],
            }));

            const options = await generateRegistrationOptions({
                rpName: APP_NAME,
                rpID: RP_ID,
                userID: new TextEncoder().encode(String(uid)),
                userName: correo,
                userDisplayName: nombre,
                attestationType: 'none',
                excludeCredentials,
                authenticatorSelection: {
                    residentKey: 'preferred',
                    userVerification: 'preferred',
                },
            });

            setChallenge(`webauthn_reg_${uid}`, options.challenge);
            res.json(options);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── POST /webauthn/register-verify ───────────────────────────────────────
    router.post('/webauthn/register-verify', async (req, res) => {
        try {
            const uid = req.user?.id;
            if (!uid) return res.status(401).json({ error: 'No autenticado' });

            const { credential, nombre } = req.body;
            const expectedChallenge = getChallenge(`webauthn_reg_${uid}`);
            if (!expectedChallenge) return res.status(400).json({ error: 'Challenge expirado, reinicia el registro' });

            const verification = await verifyRegistrationResponse({
                response: credential,
                expectedChallenge,
                expectedOrigin: RP_ORIGIN,
                expectedRPID: RP_ID,
                requireUserVerification: false,
            });

            if (!verification.verified) return res.status(400).json({ error: 'Verificación fallida' });

            const { registrationInfo } = verification;
            const { credential: cred, credentialDeviceType, credentialBackedUp } = registrationInfo;

            const credId = Buffer.from(cred.id).toString('base64url');
            const pubKey = Buffer.from(cred.publicKey).toString('base64');

            await dbq(`
                INSERT INTO webauthn_credentials (id, usuario_id, nombre, public_key, counter, device_type, backed_up, transports)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE counter=VALUES(counter)
            `, [
                credId,
                uid,
                nombre || 'Passkey',
                pubKey,
                cred.counter,
                credentialDeviceType,
                credentialBackedUp ? 1 : 0,
                (credential.response?.transports || []).join(','),
            ]);

            res.json({ registrado: true, id: credId });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── GET /webauthn/auth-options ────────────────────────────────────────────
    // Durante login (aún sin JWT), el cliente envía ?correo=...
    router.get('/webauthn/auth-options', async (req, res) => {
        try {
            const correo = req.query.correo || req.user?.correo;
            if (!correo) return res.status(400).json({ error: 'Falta correo' });

            const users = await dbq('SELECT idUsuario FROM usuarios WHERE LOWER(TRIM(correo))=LOWER(?)', [correo.trim()]);
            if (!users.length) return res.status(404).json({ error: 'Usuario no encontrado' });
            const uid = users[0].idUsuario;

            const creds = await dbq('SELECT id, transports FROM webauthn_credentials WHERE usuario_id=?', [uid]);
            const allowCredentials = creds.map(c => ({
                id: c.id,
                transports: c.transports ? c.transports.split(',') : [],
            }));

            const options = await generateAuthenticationOptions({
                rpID: RP_ID,
                allowCredentials,
                userVerification: 'preferred',
            });

            setChallenge(`webauthn_auth_${uid}`, options.challenge);
            res.json({ ...options, _uid: uid });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── POST /webauthn/auth-verify ────────────────────────────────────────────
    router.post('/webauthn/auth-verify', async (req, res) => {
        try {
            const { credential, uid } = req.body;
            if (!uid) return res.status(400).json({ error: 'Falta uid' });

            const expectedChallenge = getChallenge(`webauthn_auth_${uid}`);
            if (!expectedChallenge) return res.status(400).json({ error: 'Challenge expirado' });

            const credId = credential.id;
            const [stored] = await dbq('SELECT * FROM webauthn_credentials WHERE id=? AND usuario_id=?', [credId, uid]);
            if (!stored) return res.status(400).json({ error: 'Credencial no encontrada' });

            const verification = await verifyAuthenticationResponse({
                response: credential,
                expectedChallenge,
                expectedOrigin: RP_ORIGIN,
                expectedRPID: RP_ID,
                requireUserVerification: false,
                credential: {
                    id: stored.id,
                    publicKey: Buffer.from(stored.public_key, 'base64'),
                    counter: stored.counter,
                    transports: stored.transports ? stored.transports.split(',') : [],
                },
            });

            if (!verification.verified) return res.status(400).json({ error: 'Autenticación fallida' });

            await dbq('UPDATE webauthn_credentials SET counter=? WHERE id=?', [
                verification.authenticationInfo.newCounter,
                credId,
            ]);

            res.json({ valido: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── GET /webauthn/credentials ─────────────────────────────────────────────
    router.get('/webauthn/credentials', async (req, res) => {
        try {
            const uid = req.user?.id;
            if (!uid) return res.status(401).json({ error: 'No autenticado' });
            const creds = await dbq('SELECT id, nombre, device_type, backed_up, created_at FROM webauthn_credentials WHERE usuario_id=?', [uid]);
            res.json(creds);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── DELETE /webauthn/credentials/:id ─────────────────────────────────────
    router.delete('/webauthn/credentials/:id', async (req, res) => {
        try {
            const uid = req.user?.id;
            if (!uid) return res.status(401).json({ error: 'No autenticado' });
            await dbq('DELETE FROM webauthn_credentials WHERE id=? AND usuario_id=?', [req.params.id, uid]);
            res.json({ eliminado: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    return router;
};
