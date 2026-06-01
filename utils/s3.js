// ============================================================
// 📦 AWS S3 — Helper de Upload/Delete para imágenes
// Usado por routes/seguridad.js para subir fotos del checklist
// ============================================================
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
    region:      process.env.AWS_REGION || 'us-east-2',
    credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const BUCKET = process.env.AWS_BUCKET_NAME;

/**
 * Sube un buffer a S3 y retorna la URL pública.
 * @param {Buffer} buffer     — Contenido del archivo
 * @param {string} key        — Ruta dentro del bucket (ej: "seguridad/unidades/REQ-123/foto1.jpg")
 * @param {string} contentType — MIME type (ej: "image/jpeg")
 * @returns {Promise<string>}  — URL pública del objeto
 */
async function uploadToS3(buffer, key, contentType) {
    await s3.send(new PutObjectCommand({
        Bucket:      BUCKET,
        Key:         key,
        Body:        buffer,
        ContentType: contentType || 'image/jpeg'
    }));
    // URL pública (requiere que el bucket tenga política pública o CloudFront)
    return `https://${BUCKET}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com/${key}`;
}

/**
 * Elimina un objeto de S3.
 * @param {string} key — Ruta del objeto a eliminar
 */
async function deleteFromS3(key) {
    try {
        await s3.send(new DeleteObjectCommand({
            Bucket: BUCKET,
            Key:    key
        }));
    } catch (e) {
        console.warn('S3 delete error:', e.message);
    }
}

/**
 * Extrae la key de S3 desde una URL completa.
 * @param {string} url — URL completa del objeto S3
 * @returns {string|null}
 */
function s3KeyFromUrl(url) {
    if (!url || !BUCKET) return null;
    const prefix = `https://${BUCKET}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com/`;
    if (url.startsWith(prefix)) return url.slice(prefix.length);
    // Fallback: path-style URL
    const prefix2 = `https://s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com/${BUCKET}/`;
    if (url.startsWith(prefix2)) return url.slice(prefix2.length);
    return null;
}

module.exports = { uploadToS3, deleteFromS3, s3KeyFromUrl };
