// Avisos del sistema en el teléfono (Web Push). Cada dispositivo que activa las notificaciones guarda su
// suscripción en push_suscripciones (una fila por dispositivo y usuario). Un aviso se envía a todos los
// dispositivos activos de un correo; si el navegador ya no acepta una suscripción, se borra.
const webpush = require('web-push');

const CLAVE_PUBLICA = () => process.env.VAPID_PUBLIC_KEY || '';
let configurado = false;

function configurar() {
    if (configurado) return true;
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) return false;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@azkell.com', pub, priv);
    configurado = true;
    return true;
}

// Tabla creada una vez por base de empresa (cada tenant tiene su propia base)
const tablasListas = new WeakSet();
async function asegurarTabla(db) {
    if (tablasListas.has(db)) return;
    await db.promise().query(`
        CREATE TABLE IF NOT EXISTS push_suscripciones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            correo VARCHAR(190) NOT NULL,
            endpoint VARCHAR(500) NOT NULL,
            p256dh VARCHAR(255) NOT NULL,
            auth VARCHAR(255) NOT NULL,
            user_agent VARCHAR(255) NULL,
            creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_push_endpoint (endpoint(255)),
            KEY idx_push_correo (correo)
        )`);
    tablasListas.add(db);
}

async function guardar(db, correo, suscripcion, userAgent) {
    await asegurarTabla(db);
    await db.promise().query(
        `INSERT INTO push_suscripciones (correo, endpoint, p256dh, auth, user_agent)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE correo = VALUES(correo), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
        [String(correo).toLowerCase(), suscripcion.endpoint, suscripcion.keys.p256dh, suscripcion.keys.auth, String(userAgent || '').slice(0, 255)]
    );
}

async function quitar(db, correo, endpoint) {
    await asegurarTabla(db);
    await db.promise().query('DELETE FROM push_suscripciones WHERE correo = ? AND endpoint = ?', [String(correo).toLowerCase(), endpoint]);
}

/** Envía un aviso a todos los dispositivos del correo. Devuelve cuántos recibieron el envío. Nunca lanza. */
async function enviarA(db, correo, { titulo, cuerpo, url, tag }) {
    if (!configurar()) return 0;
    try {
        await asegurarTabla(db);
        const [filas] = await db.promise().query('SELECT id, endpoint, p256dh, auth FROM push_suscripciones WHERE correo = ?', [String(correo).toLowerCase()]);
        const payload = JSON.stringify({ titulo, cuerpo, url: url || '/', tag: tag || undefined });
        let enviados = 0;
        for (const f of filas) {
            try {
                await webpush.sendNotification({ endpoint: f.endpoint, keys: { p256dh: f.p256dh, auth: f.auth } }, payload, { TTL: 3600, urgency: 'high' });
                enviados++;
            } catch (e) {
                // 404 / 410: el dispositivo ya no tiene la suscripción (se desinstaló la app o se revocó el permiso)
                if (e.statusCode === 404 || e.statusCode === 410) {
                    await db.promise().query('DELETE FROM push_suscripciones WHERE id = ?', [f.id]).catch(() => {});
                } else {
                    console.warn('[Push] envío fallido:', e.statusCode || '', e.message);
                }
            }
        }
        return enviados;
    } catch (e) {
        console.warn('[Push] no se pudo enviar:', e.message);
        return 0;
    }
}

module.exports = { CLAVE_PUBLICA, configurar, asegurarTabla, guardar, quitar, enviarA };
