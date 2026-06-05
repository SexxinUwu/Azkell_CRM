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
async function getPresignedUrl(key, expiresIn = 3600) {
    return getSignedUrl(s3, new GetObjectCommand({
        Bucket: BUCKET,
        Key: key
    }), { expiresIn });
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
    if (!url || !BUCKET) return null;
    const region = (process.env.AWS_REGION || 'us-east-2').trim();
    const prefix = `https://${BUCKET}.s3.${region}.amazonaws.com/`;
    if (url.startsWith(prefix)) return url.slice(prefix.length);
    const prefix2 = `https://s3.${region}.amazonaws.com/${BUCKET}/`;
    if (url.startsWith(prefix2)) return url.slice(prefix2.length);
    return null;
}

module.exports = { uploadToS3, deleteFromS3, s3KeyFromUrl, getPresignedUrl };
