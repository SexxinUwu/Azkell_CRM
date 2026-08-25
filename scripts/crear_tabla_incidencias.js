require('dotenv').config();
const mysql = require('mysql2');

const conn = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT) || 3306,
    ssl: (process.env.DB_HOST && (process.env.DB_HOST.includes('railway') || process.env.DB_HOST.includes('aiven') || process.env.DB_SSL === 'true')) ? { rejectUnauthorized: false } : undefined
});

const sql = `
CREATE TABLE IF NOT EXISTS mant_incidencias_ruta (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    codigo           VARCHAR(30) UNIQUE NOT NULL,
    fecha_falla      DATE NOT NULL,
    placa            VARCHAR(20) NOT NULL,
    conductor        VARCHAR(150) DEFAULT '',
    marca            VARCHAR(50) DEFAULT '',
    ubicacion        VARCHAR(150) DEFAULT '',
    tipo_unidad      VARCHAR(50) DEFAULT '',
    transbordo       ENUM('SI', 'NO') DEFAULT 'NO',
    motivo           VARCHAR(255) DEFAULT '',
    falla            TEXT,
    area_responsable ENUM('Mantenimiento', 'Flota', 'Operaciones') DEFAULT 'Mantenimiento',
    responsable      VARCHAR(100) DEFAULT '',
    costos_detalle   JSON NULL,
    total_costo      DECIMAL(12,2) DEFAULT 0.00,
    solucionado      ENUM('Atendido', 'Pendiente') DEFAULT 'Pendiente',
    observaciones    TEXT NULL,
    creado_por       VARCHAR(100) DEFAULT '',
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_fecha (fecha_falla),
    INDEX idx_placa (placa),
    INDEX idx_solucionado (solucionado),
    INDEX idx_area (area_responsable)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const dbs = ['azkell_tenant_marsisa', 'azkell_tenant_rosymarperu'];

conn.connect((err) => {
    if (err) {
        console.error('Error conectando a MySQL:', err.message);
        process.exit(1);
    }
    console.log('Conectado a MySQL con éxito.');

    let count = 0;
    dbs.forEach(dbName => {
        conn.query(`USE \`${dbName}\``, (errUse) => {
            if (errUse) {
                console.error(`Error seleccionando BD ${dbName}:`, errUse.message);
                count++;
                if (count === dbs.length) conn.end();
                return;
            }

            conn.query(sql, (errSql) => {
                if (errSql) {
                    console.error(`Error creando tabla en ${dbName}:`, errSql.message);
                } else {
                    console.log(`✅ Tabla mant_incidencias_ruta creada/verificada en: ${dbName}`);
                }
                count++;
                if (count === dbs.length) {
                    console.log('Migración finalizada.');
                    conn.end();
                }
            });
        });
    });
});
