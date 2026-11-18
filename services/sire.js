// SIRE de SUNAT (Sistema Integrado de Registros Electrónicos: registro de ventas RVIE y de compras RCE).
// Se conecta DIRECTO con la API de SUNAT (no pasa por APISUNAT): el token se pide con las credenciales de API de SUNAT (client id y secreto)
// más el usuario y la clave SOL (de preferencia un usuario SOL secundario). Aquí: cifrado de los secretos y pedido del token.
const crypto = require('crypto');

const SCOPE_SIRE = 'https://api-sire.sunat.gob.pe';

// La clave SOL y el secreto de API se guardan cifrados (AES-256-GCM). La llave sale de SIRE_CIFRADO_CLAVE o, si no existe, de JWT_SECRET.
function llave() {
    const base = String(process.env.SIRE_CIFRADO_CLAVE || process.env.JWT_SECRET || '');
    if (!base) throw Object.assign(new Error('Falta JWT_SECRET en el servidor: no se pueden guardar credenciales cifradas.'), { status: 500 });
    return crypto.createHash('sha256').update(base).digest();
}

function cifrar(texto) {
    if (!texto) return '';
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', llave(), iv);
    const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
    return 'enc:v1:' + Buffer.concat([iv, c.getAuthTag(), datos]).toString('base64');
}

/** Devuelve el texto original; si el valor no está cifrado (o no se puede descifrar) devuelve '' para no usar basura como credencial */
function descifrar(valor) {
    const v = String(valor || '');
    if (!v) return '';
    if (!v.startsWith('enc:v1:')) return v;
    try {
        const b = Buffer.from(v.slice(7), 'base64');
        const d = crypto.createDecipheriv('aes-256-gcm', llave(), b.subarray(0, 12));
        d.setAuthTag(b.subarray(12, 28));
        return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    } catch (e) {
        return '';
    }
}

/**
 * Pide un token de acceso al SIRE. cfg: { ruc, usuario, clave, clientId, clientSecret }.
 * El token no se guarda: esta función sirve para comprobar que las credenciales funcionan.
 */
async function obtenerToken(cfg) {
    const url = `https://api-seguridad.sunat.gob.pe/v1/clientessol/${encodeURIComponent(cfg.clientId)}/oauth2/token/`;
    const cuerpo = new URLSearchParams({
        grant_type: 'password', scope: SCOPE_SIRE, client_id: cfg.clientId, client_secret: cfg.clientSecret,
        username: `${cfg.ruc}${cfg.usuario}`, password: cfg.clave,
    });
    try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: cuerpo.toString(), signal: AbortSignal.timeout(20000) });
        const datos = await res.json().catch(() => ({}));
        if (!res.ok || datos.error || !datos.access_token) {
            return { ok: false, status: res.status, error: String(datos.error_description || datos.message || datos.error || `HTTP ${res.status}`).slice(0, 300) };
        }
        return { ok: true, expires_in: Number(datos.expires_in) || 0, token_type: datos.token_type || 'Bearer' };
    } catch (e) {
        return { ok: false, error: e && e.name === 'TimeoutError' ? 'SUNAT no respondió a tiempo. Inténtalo de nuevo.' : `No se pudo comunicar con SUNAT: ${e.message}` };
    }
}

module.exports = { SCOPE_SIRE, cifrar, descifrar, obtenerToken };
