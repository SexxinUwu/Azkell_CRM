require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixAuditUsers() {
    const pool = mysql.createPool({
        host: '82.39.109.226',
        user: 'root',
        password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
        port: 3306
    });

    const [dbs] = await pool.query("SHOW DATABASES LIKE 'azkell%'");
    for (const row of dbs) {
        const dbName = Object.values(row)[0];
        console.log(`Checking database: ${dbName}`);
        try {
            const [tables] = await pool.query(`SHOW TABLES FROM \`${dbName}\` LIKE 'auditoria'`);
            if (tables.length > 0) {
                const [res] = await pool.query(`
                    UPDATE \`${dbName}\`.auditoria 
                    SET usuario = 'Sthefano Avila' 
                    WHERE UPPER(usuario) IN ('ADMINISTRADOR', 'ADMIN', 'SISTEMA', 'SISTEMA / AUTOMÁTICO', 'UNDEFINED', 'NULL', 'NIXON', 'ELVIS', 'TECNICO', 'MECANICO')
                       OR usuario LIKE '%[object%'
                       OR usuario IS NULL
                       OR TRIM(usuario) = ''
                `);
                console.log(`-> ${dbName}: Filas actualizadas en auditoria:`, res.affectedRows);
            }
        } catch (e) {
            console.error(`Error in ${dbName}:`, e.message);
        }
    }

    await pool.end();
}

fixAuditUsers().catch(err => {
    console.error('Error al actualizar auditoria:', err);
    process.exit(1);
});
