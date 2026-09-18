const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getTenantPool } = require(path.join(__dirname, '../services/tenant_master'));

(async () => {
    try {
        const s3 = new S3Client({
            region: process.env.AWS_REGION || 'us-east-2',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });

        const res = await s3.send(new ListObjectsV2Command({
            Bucket: process.env.AWS_S3_BUCKET || 'azkell-fleet-storage-939903246652-us-east-2-an',
            Prefix: 'flota/documentos/'
        }));

        const d0lFiles = (res.Contents || []).filter(item => item.Key.includes('D0L914') || item.Key.includes('DOL914'));
        console.log('Archivos en S3 para D0L914:', d0lFiles);
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
})();
