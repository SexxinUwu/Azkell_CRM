const mysql = require('mysql2/promise');
require('dotenv').config();

const SEED_DATA = [
    { sentido: 'IDA', ruta: 'LIMA - ICA', motor: 'MC11.44', confg: 'T3', km_0: 23.13, km_5: 24.50, km_10: 26.24, km_15: 28.28, km_20: 30.71, km_25: 33.93, km_30: 37.24, km: 330 },
    { sentido: 'IDA', ruta: 'LIMA - NASCA', motor: 'MC11.44', confg: 'T3', km_0: 32.50, km_5: 34.50, km_10: 37.03, km_15: 40.00, km_20: 43.53, km_25: 48.21, km_30: 53.03, km: 480 },
    { sentido: 'IDA', ruta: 'LIMA - CAMANA', motor: 'MC11.44', confg: 'T3', km_0: 59.74, km_5: 61.79, km_10: 66.35, km_15: 84.43, km_20: 91.94, km_25: 99.35, km_30: 106.25, km: 830 },
    { sentido: 'IDA', ruta: 'LIMA - AREQUIPA', motor: 'MC11.44', confg: 'T3', km_0: 74.91, km_5: 77.50, km_10: 83.27, km_15: 106.15, km_20: 115.65, km_25: 125.02, km_30: 133.75, km: 1050 },
    { sentido: 'IDA', ruta: 'LIMA - JULIACA', motor: 'MC11.44', confg: 'T3', km_0: 96.64, km_5: 100.00, km_10: 107.50, km_15: 137.25, km_20: 149.59, km_25: 161.78, km_30: 173.13, km: 1365 },
    { sentido: 'IDA', ruta: 'LIMA - PUNO', motor: 'MC11.44', confg: 'T3', km_0: 101.47, km_5: 105.00, km_10: 112.88, km_15: 144.16, km_20: 157.13, km_25: 169.94, km_30: 181.88, km: 1435 },
    { sentido: 'IDA', ruta: 'LIMA - TACNA', motor: 'MC11.44', confg: 'T3', km_0: 88.02, km_5: 91.07, km_10: 97.88, km_15: 124.91, km_20: 136.12, km_25: 147.19, km_30: 157.50, km: 1240 },
    { sentido: 'IDA', ruta: 'LIMA - MOQUEGUA', motor: 'MC11.44', confg: 'T3', km_0: 80.43, km_5: 83.21, km_10: 89.42, km_15: 114.05, km_20: 124.27, km_25: 134.36, km_30: 143.75, km: 1130 },
    { sentido: 'IDA', ruta: 'LIMA - CUSCO', motor: 'MC11.44', confg: 'T3', km_0: 85.81, km_5: 97.00, km_10: 112.55, km_15: 132.95, km_20: 151.73, km_25: 169.05, km_30: 182.49, km: 1205 },
    { sentido: 'IDA', ruta: 'LIMA - SICUANI', motor: 'MC11.44', confg: 'T3', km_0: 96.84, km_5: 109.93, km_10: 128.18, km_15: 152.18, km_20: 174.12, km_25: 194.05, km_30: 209.28, km: 1355 },
    { sentido: 'IDA', ruta: 'LIMA - PUERTO MALDONADO', motor: 'MC11.44', confg: 'T3', km_0: 121.47, km_5: 138.81, km_10: 163.07, km_15: 195.13, km_20: 224.12, km_25: 249.88, km_30: 269.10, km: 1690 },
    { sentido: 'IDA', ruta: 'LIMA - HUANCAYO', motor: 'MC11.44', confg: 'T3', km_0: 28.24, km_5: 32.67, km_10: 38.96, km_15: 47.37, km_20: 54.74, km_25: 60.83, km_30: 65.00, km: 350 },
    { sentido: 'IDA', ruta: 'LIMA - AYACUCHO', motor: 'MC11.44', confg: 'T3', km_0: 43.14, km_5: 48.73, km_10: 56.51, km_15: 66.73, km_20: 76.10, km_25: 84.64, km_30: 91.20, km: 585 },
    { sentido: 'IDA', ruta: 'LIMA - LA MERCED', motor: 'MC11.44', confg: 'T3', km_0: 24.56, km_5: 28.36, km_10: 33.75, km_15: 40.96, km_20: 47.28, km_25: 52.50, km_30: 56.07, km: 300 },
    { sentido: 'IDA', ruta: 'LIMA - HUANUCO', motor: 'MC11.44', confg: 'T3', km_0: 34.42, km_5: 42.02, km_10: 48.61, km_15: 54.38, km_20: 63.53, km_25: 69.44, km_30: 76.61, km: 415 },
    { sentido: 'IDA', ruta: 'LIMA - PUCALLPA', motor: 'MC11.44', confg: 'T3', km_0: 63.83, km_5: 78.39, km_10: 90.72, km_15: 105.66, km_20: 123.23, km_25: 136.10, km_30: 148.04, km: 815 },
    { sentido: 'IDA', ruta: 'LIMA - TARAPOTO', motor: 'MC11.44', confg: 'T3', km_0: 88.51, km_5: 100.58, km_10: 111.10, km_15: 121.48, km_20: 136.18, km_25: 148.90, km_30: 164.75, km: 1006 },
    { sentido: 'IDA', ruta: 'LIMA - BARRANCA', motor: 'MC11.44', confg: 'T3', km_0: 15.44, km_5: 18.21, km_10: 19.42, km_15: 20.83, km_20: 23.45, km_25: 25.66, km_30: 30.00, km: 220 },
    { sentido: 'IDA', ruta: 'LIMA - CHIMBOTE', motor: 'MC11.44', confg: 'T3', km_0: 30.74, km_5: 35.55, km_10: 39.42, km_15: 42.50, km_20: 48.21, km_25: 53.03, km_30: 62.50, km: 480 },
    { sentido: 'IDA', ruta: 'LIMA - TRUJILLO', motor: 'MC11.44', confg: 'T3', km_0: 39.56, km_5: 45.55, km_10: 50.96, km_15: 55.00, km_20: 62.50, km_25: 68.82, km_30: 81.25, km: 630 }
];

async function setupMatrizTable() {
    const config = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'fleet_db',
        port: process.env.DB_PORT || 3306
    };

    console.log(`Conectando a base de datos local MySQL (${config.host}:${config.port}/${config.database})...`);
    const conn = await mysql.createConnection(config);

    const CREATE_SQL = `
        CREATE TABLE IF NOT EXISTS combustible_matriz_d2 (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sentido VARCHAR(20) NOT NULL DEFAULT 'IDA',
            ruta VARCHAR(150) NOT NULL,
            motor VARCHAR(50) NOT NULL DEFAULT 'MC11.44',
            confg VARCHAR(20) NOT NULL DEFAULT 'T3',
            km_0 DECIMAL(10,2) NOT NULL DEFAULT 0,
            km_5 DECIMAL(10,2) NOT NULL DEFAULT 0,
            km_10 DECIMAL(10,2) NOT NULL DEFAULT 0,
            km_15 DECIMAL(10,2) NOT NULL DEFAULT 0,
            km_20 DECIMAL(10,2) NOT NULL DEFAULT 0,
            km_25 DECIMAL(10,2) NOT NULL DEFAULT 0,
            km_30 DECIMAL(10,2) NOT NULL DEFAULT 0,
            km DECIMAL(10,2) NOT NULL DEFAULT 0,
            estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
            creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_ruta (ruta),
            INDEX idx_motor_confg (motor, confg)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await conn.query(CREATE_SQL);
    console.log("✅ Tabla combustible_matriz_d2 asegurada.");

    // Verificar si ya hay datos
    const [countRows] = await conn.query("SELECT COUNT(*) as total FROM combustible_matriz_d2");
    if (countRows[0].total === 0) {
        console.log(`Precargando ${SEED_DATA.length} rutas iniciales de la matriz...`);
        for (const item of SEED_DATA) {
            await conn.query(
                `INSERT INTO combustible_matriz_d2 
                (sentido, ruta, motor, confg, km_0, km_5, km_10, km_15, km_20, km_25, km_30, km)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [item.sentido, item.ruta, item.motor, item.confg, item.km_0, item.km_5, item.km_10, item.km_15, item.km_20, item.km_25, item.km_30, item.km]
            );
        }
        console.log("✅ Precarga completada exitosamente.");
    } else {
        console.log(`ℹ️ La tabla ya contiene ${countRows[0].total} registros.`);
    }

    await conn.end();
}

setupMatrizTable().catch(err => {
    console.error("❌ Error en setupMatrizTable:", err);
    process.exit(1);
});
