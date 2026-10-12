const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'azkell_erp'
        });

        const [dbs] = await conn.query('SHOW DATABASES');
        for (const d of dbs) {
            const dbName = Object.values(d)[0];
            if (dbName.startsWith('azkell_tenant_') || dbName === 'azkell_erp') {
                console.log('=== Actualizando Auditoría en:', dbName, '===');
                
                // 1. Actualizar inspecciones creadas por Nixon
                await conn.query(`
                    UPDATE ${dbName}.auditoria
                    SET usuario = 'NIXON PEREZ PEREZ'
                    WHERE modulo = 'inspecciones' 
                      AND (
                        detalle LIKE '%CLX861%' OR 
                        detalle LIKE '%BEQ844%' OR 
                        detalle LIKE '%BLT980%' OR 
                        detalle LIKE '%BES829%'
                      )
                `);

                // 2. Actualizar cualquier registro con '75527474' o 'NIXON' o 'Nixon'
                await conn.query(`
                    UPDATE ${dbName}.auditoria
                    SET usuario = 'NIXON PEREZ PEREZ'
                    WHERE UPPER(usuario) IN ('75527474', 'NIXON', 'NIXON PEREZ')
                `);

                // 3. Actualizar DNIs a Nombres completos
                await conn.query(`
                    UPDATE ${dbName}.auditoria
                    SET usuario = 'Sthefano Avila'
                    WHERE usuario = '72437318'
                `);
                await conn.query(`
                    UPDATE ${dbName}.auditoria
                    SET usuario = 'Fabiano Torres'
                    WHERE usuario = '72746329'
                `);
                await conn.query(`
                    UPDATE ${dbName}.auditoria
                    SET usuario = 'LIDIA FLORES CORONEL'
                    WHERE usuario = '70805535'
                `);

                console.log('✅ Auditoría actualizada en', dbName);
            }
        }

        await conn.end();
        console.log('🚀 Migración de nombres de usuario completada con éxito.');
    } catch(err) {
        console.error('Error migrando auditoria:', err);
    }
})();
