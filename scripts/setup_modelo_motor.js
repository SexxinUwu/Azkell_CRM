const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupModeloMotor() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'fleet_db',
        port: process.env.DB_PORT || 3306
    });

    console.log("1. Verificando columna 'modelo_motor' en tabla 'placas'...");
    const [cols] = await conn.query("DESCRIBE placas");
    const hasModeloMotor = cols.some(c => c.Field === 'modelo_motor');
    if (!hasModeloMotor) {
        console.log("Agregando columna modelo_motor a placas...");
        await conn.query("ALTER TABLE placas ADD COLUMN modelo_motor VARCHAR(100) NULL AFTER nro_motor");
        console.log("✅ Columna modelo_motor agregada.");
    }

    console.log("2. Poblando modelos de motor iniciales en base a marca, modelo_uts y nro_motor...");
    
    // Sinotruk (Sitrak / Howo) -> MC11.44
    await conn.query(`
        UPDATE placas 
        SET modelo_motor = 'MC11.44' 
        WHERE (marca LIKE '%SINOTRUK%' OR marca LIKE '%HOWO%' OR modelo_uts LIKE '%ZZ4257%' OR modelo_uts LIKE '%SITRAK%')
        AND (modelo_motor IS NULL OR modelo_motor = '')
    `);

    // Scania DC13
    await conn.query(`
        UPDATE placas 
        SET modelo_motor = 'DC13' 
        WHERE (marca LIKE '%SCANIA%' OR nro_motor LIKE '%DC13%' OR modelo_uts LIKE '%P410%' OR modelo_uts LIKE '%P450%' OR modelo_uts LIKE '%P-450%' OR modelo_uts LIKE '%P460%' OR modelo_uts LIKE '%P-460%' OR modelo_uts LIKE '%R500%' OR modelo_uts LIKE '%R-500%')
        AND (modelo_motor IS NULL OR modelo_motor = '')
    `);

    // Volvo D13
    await conn.query(`
        UPDATE placas 
        SET modelo_motor = 'D13' 
        WHERE (marca LIKE '%VOLVO%' AND (nro_motor LIKE '%D13%' OR modelo_uts LIKE '%FM%'))
        AND (modelo_motor IS NULL OR modelo_motor = '')
    `);

    // Volvo MWM / D8
    await conn.query(`
        UPDATE placas 
        SET modelo_motor = 'MWM D8' 
        WHERE (marca LIKE '%VOLVO%' AND modelo_uts LIKE '%VM%')
        AND (modelo_motor IS NULL OR modelo_motor = '')
    `);

    // Isuzu 6HK1
    await conn.query(`
        UPDATE placas 
        SET modelo_motor = '6HK1' 
        WHERE (marca LIKE '%ISUZU%' AND (nro_motor LIKE '%6HK1%' OR modelo_uts LIKE '%FVR%'))
        AND (modelo_motor IS NULL OR modelo_motor = '')
    `);

    // Daf Paccar MX-13
    await conn.query(`
        UPDATE placas 
        SET modelo_motor = 'MX-13' 
        WHERE (marca LIKE '%DAF%' OR modelo_uts LIKE '%XF%')
        AND (modelo_motor IS NULL OR modelo_motor = '')
    `);

    // Mercedes OM926
    await conn.query(`
        UPDATE placas 
        SET modelo_motor = 'OM 926' 
        WHERE (marca LIKE '%MERCEDES%' OR modelo_uts LIKE '%ATEGO%')
        AND (modelo_motor IS NULL OR modelo_motor = '')
    `);

    // International MaxxForce / Cummins
    await conn.query(`
        UPDATE placas 
        SET modelo_motor = 'MAXXFORCE 13' 
        WHERE (marca LIKE '%INTERNATIONAL%' OR modelo_uts LIKE '%7600%' OR modelo_uts LIKE '%8600%')
        AND (modelo_motor IS NULL OR modelo_motor = '')
    `);

    const [updatedSample] = await conn.query("SELECT placa, marca, modelo_uts, nro_motor, modelo_motor FROM placas WHERE modelo_motor IS NOT NULL LIMIT 15");
    console.log("✅ Vehículos con modelo de motor configurado:", updatedSample);

    await conn.end();
}

setupModeloMotor().catch(console.error);
