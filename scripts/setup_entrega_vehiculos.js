const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupEntregaTable() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'azkell_crm'
    });

    const CREATE_SQL = `
        CREATE TABLE IF NOT EXISTS seg_entrega_vehiculos (
            id VARCHAR(50) PRIMARY KEY,
            numero_inventario VARCHAR(50) NULL,
            fecha DATE NOT NULL,
            motivo VARCHAR(150) NOT NULL DEFAULT 'ENTREGA DE UNIDAD',
            quien_entrega VARCHAR(150) NOT NULL,
            quien_recibe VARCHAR(150) NOT NULL,
            
            clase VARCHAR(50) NULL,
            marca VARCHAR(50) NULL,
            tipo VARCHAR(50) NULL,
            modelo VARCHAR(50) NULL,
            placa VARCHAR(20) NOT NULL,
            color VARCHAR(50) NULL,
            cilindros VARCHAR(20) NULL,
            numero_motor VARCHAR(50) NULL,
            numero_serie VARCHAR(50) NULL,
            kilometraje DECIMAL(12,2) NOT NULL DEFAULT 0,
            
            llantas_del_der_marca VARCHAR(50) NULL,
            llantas_del_izq_marca VARCHAR(50) NULL,
            llantas_tra_der_marca VARCHAR(50) NULL,
            llantas_tra_izq_marca VARCHAR(50) NULL,
            llantas_repuesto_marca VARCHAR(50) NULL,
            llantas_ref_json JSON NULL,
            
            inventario_partes_json JSON NULL,
            observaciones TEXT NULL,
            croquis_danos_json JSON NULL,
            
            firma_entrega LONGTEXT NULL,
            firma_recibe LONGTEXT NULL,
            doc_entrega VARCHAR(50) NULL,
            doc_recibe VARCHAR(50) NULL,
            
            empresa VARCHAR(100) NOT NULL DEFAULT 'MARSISA',
            creado_por VARCHAR(100) NULL,
            creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_placa (placa),
            INDEX idx_fecha (fecha),
            INDEX idx_empresa (empresa)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await conn.query(CREATE_SQL);
    console.log('✅ Tabla seg_entrega_vehiculos asegurada exitosamente.');
    await conn.end();
}

setupEntregaTable().catch(console.error);
