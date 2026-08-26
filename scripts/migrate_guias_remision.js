require('dotenv').config();
const mysql = require('mysql2/promise');

async function createTables() {
    const tenants = ['azkell_tenant_marsisa', 'azkell_tenant_rosymarperu'];
    for (const dbName of tenants) {
        try {
            console.log('Verificando tablas en:', dbName);
            const conn = await mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                port: Number(process.env.DB_PORT) || 3306,
                database: dbName
            });

            await conn.query(`
                CREATE TABLE IF NOT EXISTS guias_remision (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    numero_guia VARCHAR(30) NOT NULL UNIQUE,
                    tipo_documento VARCHAR(10) DEFAULT '31',
                    fecha_emision DATE DEFAULT NULL,
                    fecha_traslado DATE DEFAULT NULL,
                    remitente_ruc VARCHAR(20) DEFAULT NULL,
                    remitente_razon_social VARCHAR(255) DEFAULT NULL,
                    destinatario_ruc VARCHAR(20) DEFAULT NULL,
                    destinatario_razon_social VARCHAR(255) DEFAULT NULL,
                    punto_partida_direccion TEXT DEFAULT NULL,
                    punto_partida_ubigeo VARCHAR(10) DEFAULT NULL,
                    punto_llegada_direccion TEXT DEFAULT NULL,
                    punto_llegada_ubigeo VARCHAR(10) DEFAULT NULL,
                    placa_tracto VARCHAR(20) DEFAULT NULL,
                    placa_carreta VARCHAR(20) DEFAULT NULL,
                    conductor_tipo_doc VARCHAR(10) DEFAULT 'DNI',
                    conductor_num_doc VARCHAR(20) DEFAULT NULL,
                    conductor_nombre VARCHAR(200) DEFAULT NULL,
                    conductor_licencia VARCHAR(30) DEFAULT NULL,
                    peso_bruto_total DECIMAL(12,2) DEFAULT 0,
                    unidad_medida VARCHAR(10) DEFAULT 'KGM',
                    estado_sunat VARCHAR(50) DEFAULT 'ACEPTADO',
                    codigo_respuesta_sunat VARCHAR(20) DEFAULT '0',
                    observaciones_sunat TEXT DEFAULT NULL,
                    datos_json LONGTEXT DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_numero_guia (numero_guia),
                    INDEX idx_placa_tracto (placa_tracto),
                    INDEX idx_fecha_emision (fecha_emision)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);

            await conn.query(`
                CREATE TABLE IF NOT EXISTS guias_remision_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guia_id INT NOT NULL,
                    codigo VARCHAR(50) DEFAULT NULL,
                    descripcion TEXT NOT NULL,
                    cantidad DECIMAL(12,2) DEFAULT 1,
                    unidad_medida VARCHAR(20) DEFAULT 'NIU',
                    peso_unitario DECIMAL(12,2) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_guia_id (guia_id),
                    FOREIGN KEY (guia_id) REFERENCES guias_remision(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);

            console.log('✓ Tablas creadas/verificadas en', dbName);
            await conn.end();
        } catch(e) {
            console.error('Error en', dbName, ':', e.message);
        }
    }
}
createTables();
