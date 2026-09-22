require('dotenv').config();
const mysql = require('mysql2/promise');
const { getTenantPool } = require('../services/tenant_master');

async function migrate() {
    console.log('Connecting to MySQL on VPS to modify inventario.anaquel to VARCHAR(50)...');
    
    // 1. Base pool
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'azkell_fleet',
            port: parseInt(process.env.DB_PORT) || 3306
        });
        await pool.query("ALTER TABLE inventario MODIFY COLUMN anaquel VARCHAR(50) NULL DEFAULT NULL;");
        console.log("Migrated primary DB inventario.anaquel to VARCHAR(50)");
    } catch(e) {
        console.warn("Primary DB migration note:", e.message);
    }

    // 2. Tenant marsisa
    try {
        const tPool = getTenantPool('azkell_tenant_marsisa').promise();
        await tPool.query("ALTER TABLE inventario MODIFY COLUMN anaquel VARCHAR(50) NULL DEFAULT NULL;");
        console.log("Migrated tenant azkell_tenant_marsisa inventario.anaquel to VARCHAR(50)");
    } catch(e) {
        console.warn("Tenant migration note:", e.message);
    }

    console.log("Migration finished.");
    process.exit(0);
}

migrate();
