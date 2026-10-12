require('dotenv').config();
const { getTenantPool } = require('./services/tenant_master');

async function checkColumns() {
    try {
        const pool = getTenantPool('azkell_tenant_rosymarperu');
        const [cols] = await pool.promise().query(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='azkell_tenant_rosymarperu' AND TABLE_NAME='placas' ORDER BY ORDINAL_POSITION"
        );
        console.log('📋 Columnas en azkell_tenant_rosymarperu.placas:');
        cols.forEach(c => console.log('  -', c.COLUMN_NAME));

        // Also simulate what the API does
        const sql = `SELECT placa, cliente, ruc_dni, marca, modelo_uts, tipo, sub_tipo, color,
                nro_motor, nro_caja, nro_corona, nro_vin, configuracion, anio,
                combustible, carga_util, peso_neto, peso_bruto, estado, uts, motora, llantas, en_uso, wialon_name
            FROM placas LIMIT 3`;
        try {
            const [rows] = await pool.promise().query(sql);
            console.log('\n✅ Query con wialon_name OK, rows:', rows.length);
        } catch(e2) {
            console.log('\n❌ Query con wialon_name FALLO:', e2.message);
            // Try without wialon_name
            const sql2 = `SELECT placa, cliente, ruc_dni, marca, modelo_uts, tipo, sub_tipo, color,
                    nro_motor, nro_caja, nro_corona, nro_vin, configuracion, anio,
                    combustible, carga_util, peso_neto, peso_bruto, estado, uts, motora, llantas, en_uso
                FROM placas LIMIT 3`;
            const [rows2] = await pool.promise().query(sql2);
            console.log('✅ Query sin wialon_name OK, rows:', rows2.length);
        }

        process.exit(0);
    } catch(e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

checkColumns();
