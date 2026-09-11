const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
    const dbs = ['azkell_fleet', 'azkell_tenant_marsisa', 'azkell_tenant_rosymarperu', 'azkell_tenant_yoguitransport'];
    for (const db of dbs) {
        try {
            const conn = await mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: db,
                port: process.env.DB_PORT
            });
            await conn.query(`
                CREATE TABLE IF NOT EXISTS tesoreria_bancos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    banco VARCHAR(100) NOT NULL,
                    titular VARCHAR(150) NULL,
                    moneda VARCHAR(20) NOT NULL DEFAULT 'SOLES',
                    tipo_cuenta VARCHAR(50) NOT NULL DEFAULT 'CORRIENTE',
                    numero_cuenta VARCHAR(100) NOT NULL,
                    cci VARCHAR(100) NULL,
                    saldo_inicial DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
                    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);
            // Insertar algunas cuentas base si está vacía
            const [existing] = await conn.query('SELECT COUNT(*) as count FROM tesoreria_bancos');
            if (existing[0].count === 0) {
                await conn.query(`
                    INSERT INTO tesoreria_bancos (banco, titular, moneda, tipo_cuenta, numero_cuenta, cci) VALUES
                    ('BCP', 'EMPRESA', 'SOLES', 'CORRIENTE', '191-23948293-0-12', '002-191-0023948293012-55'),
                    ('BBVA', 'EMPRESA', 'SOLES', 'CORRIENTE', '0011-0293-0100029384', '011-293-000100029384-18'),
                    ('INTERBANK', 'EMPRESA', 'SOLES', 'CORRIENTE', '200-3001294821', '003-200-003001294821-22'),
                    ('CAJA CHICA', 'CAJA CENTRAL', 'SOLES', 'EFECTIVO', 'EFECTIVO-CENTRAL', '')
                `);
            }
            console.log('tesoreria_bancos OK en ' + db);
            await conn.end();
        } catch(e) {
            console.log('Error en ' + db + ': ' + e.message);
        }
    }
})();
