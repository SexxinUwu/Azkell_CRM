// ============================================================
// 📦 AWS S3 — Helper de Upload/Delete/Presign para imágenes
// Usado por routes/seguridad.js para subir fotos del checklist
// ============================================================
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
    region:      (process.env.AWS_REGION || 'us-east-2').trim(),
    credentials: {
        accessKeyId:     (process.env.AWS_ACCESS_KEY_ID || '').trim(),
        secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || '').trim()
    }
});

const BUCKET = (process.env.AWS_BUCKET_NAME || '').trim();

/**
 * Sube un buffer a S3 y retorna la URL directa.
 */
async function uploadToS3(buffer, key, contentType) {
    await s3.send(new PutObjectCommand({
        Bucket:      BUCKET,
        Key:         key,
        Body:        buffer,
        ContentType: contentType || 'image/jpeg'
    }));
    return `https://${BUCKET}.s3.${(process.env.AWS_REGION || 'us-east-2').trim()}.amazonaws.com/${key}`;
}

/**
 * Genera una URL pre-firmada para leer un objeto de S3 (1 hora por defecto).
 */
function getMimeTypeFromKey(key) {
    if (!key) return 'image/jpeg';
    const lower = key.toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
}

async function getPresignedUrl(key, expiresIn = 3600, responseContentType = null) {
    const mime = responseContentType || getMimeTypeFromKey(key);
    const commandParams = {
        Bucket: BUCKET,
        Key: key,
        ResponseContentDisposition: 'inline'
    };
    if (mime) {
        commandParams.ResponseContentType = mime;
    }
    return getSignedUrl(s3, new GetObjectCommand(commandParams), { expiresIn });
}

/**
 * Genera una URL pre-firmada para ESCRIBIR (subir) un objeto a S3 directamente.
 * @param {string} key — Ruta destino en S3
 * @param {string} contentType — Tipo MIME (ej: image/jpeg)
 * @param {number} expiresIn — Vigencia en segundos (default 300 = 5 mins)
 */
async function getPresignedUploadUrl(key, contentType, expiresIn = 600) {
    const params = {
        Bucket: BUCKET,
        Key: key
    };
    return getSignedUrl(s3, new PutObjectCommand(params), { expiresIn });
}

/**
 * Elimina un objeto de S3.
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
 */
function s3KeyFromUrl(url) {
    if (!url) return null;
    try {
        const cleanUrl = url.split('?')[0];
        const match = cleanUrl.match(/amazonaws\.com\/(.+)$/);
        if (match && match[1]) {
            let k = decodeURIComponent(match[1]);
            if (BUCKET && k.startsWith(`${BUCKET}/`)) {
                k = k.slice(BUCKET.length + 1);
            }
            return k;
        }
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            return cleanUrl;
        }
    } catch(e) {}
    return null;
}

module.exports = { uploadToS3, deleteFromS3, s3KeyFromUrl, getPresignedUrl, getPresignedUploadUrl };
