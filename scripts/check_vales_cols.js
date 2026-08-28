const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkCols() {
    const localConn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'fleet_db',
        port: process.env.DB_PORT || 3306
    });

    const [cols] = await localConn.query("DESCRIBE combustible_vales");
    console.log("Columnas de combustible_vales:", cols.map(c => c.Field));

    // Agregar id_remoto si falta
    const hasIdRemoto = cols.some(c => c.Field === 'id_remoto');
    if (!hasIdRemoto) {
        console.log("Agregando columna id_remoto...");
        await localConn.query("ALTER TABLE combustible_vales ADD COLUMN id_remoto INT NULL AFTER id");
    }

    const hasVehiculoMarca = cols.some(c => c.Field === 'vehiculo_marca');
    if (!hasVehiculoMarca) {
        console.log("Agregando columna vehiculo_marca...");
        await localConn.query("ALTER TABLE combustible_vales ADD COLUMN vehiculo_marca VARCHAR(100) NULL AFTER vehiculo");
    }

    const hasVehiculoModelo = cols.some(c => c.Field === 'vehiculo_modelo');
    if (!hasVehiculoModelo) {
        console.log("Agregando columna vehiculo_modelo...");
        await localConn.query("ALTER TABLE combustible_vales ADD COLUMN vehiculo_modelo VARCHAR(100) NULL AFTER vehiculo_marca");
    }

    console.log("✅ Columnas verificadas y aseguradas.");
    await localConn.end();
}

checkCols().catch(console.error);
