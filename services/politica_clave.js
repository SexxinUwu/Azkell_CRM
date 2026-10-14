const crypto = require('crypto');

const LARGO_MIN = 10;
const LARGO_MAX = 128;
const TIMEOUT_MS = 4000;

// Claves tan usadas que no hace falta consultar nada externo para rechazarlas
const COMUNES = new Set([
    '1234567890', '0123456789', 'password', 'contraseña', 'qwertyuiop',
    'azkell2024', 'azkell2025', 'azkell2026', 'azkellfleet',
]);

// ¿La clave aparece en una base pública de filtraciones? Usa k-anonymity: solo sale a internet
// el prefijo de 5 caracteres del SHA-1; la clave nunca viaja. Si el servicio no responde, no
// bloquea el cambio (siguen valiendo el largo y la lista de claves comunes).
async function estaFiltrada(clave) {
    const sha1 = crypto.createHash('sha1').update(clave, 'utf8').digest('hex').toUpperCase();
    const prefijo = sha1.slice(0, 5);
    const sufijo = sha1.slice(5);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`https://api.pwnedpasswords.com/range/${prefijo}`, {
            headers: { 'Add-Padding': 'true' },
            signal: ctrl.signal,
        });
        if (!res.ok) return false;
        const texto = await res.text();
        return texto.split('\n').some(linea => {
            const [hash, veces] = linea.trim().split(':');
            return hash === sufijo && Number(veces) > 0;
        });
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Devuelve null si la contraseña nueva se puede usar, o el motivo en español para mostrarlo.
 * `actual` es la contraseña vigente (la nueva no puede ser igual).
 */
async function motivoClaveRechazada(nueva, actual) {
    if (typeof nueva !== 'string') return 'La contraseña nueva no es válida.';
    if (nueva.length < LARGO_MIN) return `La contraseña nueva debe tener al menos ${LARGO_MIN} caracteres.`;
    if (nueva.length > LARGO_MAX) return `La contraseña nueva no puede pasar de ${LARGO_MAX} caracteres.`;
    if (nueva === actual) return 'La contraseña nueva debe ser distinta de la actual.';
    if (COMUNES.has(nueva.toLowerCase())) return 'Esa contraseña es demasiado común. Elige una más única.';
    if (await estaFiltrada(nueva)) return 'Esa contraseña apareció en filtraciones de datos. Elige otra.';
    return null;
}

module.exports = { motivoClaveRechazada, LARGO_MIN };
