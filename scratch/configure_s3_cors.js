/**
 * Script para configurar CORS en el bucket S3
 * Esto permite que el navegador suba archivos directamente a S3
 * usando URLs pre-firmadas (PUT directo).
 * 
 * Ejecutar: node scratch/configure_s3_cors.js
 */

require('dotenv').config();
const { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
    region: (process.env.AWS_REGION || 'us-east-2').trim(),
    credentials: {
        accessKeyId: (process.env.AWS_ACCESS_KEY_ID || '').trim(),
        secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || '').trim()
    }
});

const BUCKET = (process.env.AWS_BUCKET_NAME || '').trim();

async function configureCors() {
    console.log(`\n🔧 Configurando CORS para bucket: ${BUCKET}\n`);
    
    // Primero verificar CORS actual
    try {
        const current = await s3.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
        console.log('📋 CORS actual:', JSON.stringify(current.CORSRules, null, 2));
    } catch (e) {
        console.log('⚠️  No hay CORS configurado actualmente');
    }
    
    // Configurar CORS
    const corsConfig = {
        Bucket: BUCKET,
        CORSConfiguration: {
            CORSRules: [
                {
                    AllowedHeaders: ['*'],
                    AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                    AllowedOrigins: ['*'],
                    ExposeHeaders: ['ETag', 'x-amz-request-id'],
                    MaxAgeSeconds: 3600
                }
            ]
        }
    };
    
    try {
        await s3.send(new PutBucketCorsCommand(corsConfig));
        console.log('\n✅ CORS configurado exitosamente!\n');
        
        // Verificar
        const verify = await s3.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
        console.log('📋 CORS nuevo:', JSON.stringify(verify.CORSRules, null, 2));
    } catch (e) {
        console.error('\n❌ Error configurando CORS:', e.message);
    }
}

configureCors();
