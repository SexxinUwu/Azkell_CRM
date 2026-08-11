require('dotenv').config();
const { getTenantPool } = require('./services/tenant_master');

async function populateRosymarClientes() {
    try {
        const pool = getTenantPool('azkell_tenant_rosymarperu');
        
        await pool.promise().query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ruc_dni VARCHAR(50),
                razon_social VARCHAR(255) NOT NULL,
                direccion TEXT,
                telefono VARCHAR(50),
                email VARCHAR(100),
                estado VARCHAR(20) DEFAULT 'Activo',
                notas TEXT,
                fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_razon (razon_social)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await pool.promise().query(`
            INSERT IGNORE INTO clientes (razon_social, ruc_dni)
            SELECT DISTINCT cliente, ruc_dni 
            FROM placas 
            WHERE cliente IS NOT NULL AND TRIM(cliente) <> '';
        `);

        const [rows] = await pool.promise().query('SELECT COUNT(*) as total FROM clientes');
        console.log(`✅ Clientes en azkell_tenant_rosymarperu: ${rows[0].total}`);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

populateRosymarClientes();
