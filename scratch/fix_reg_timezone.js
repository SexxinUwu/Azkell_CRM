require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

function getPeruNowString() {
    const now = new Date();
    // Format YYYY-MM-DD HH:mm:ss in America/Lima
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(now);
    const p = {};
    parts.forEach(part => { p[part.type] = part.value; });
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

async function fixTimezone() {
    const dbs = ['azkell_tenant_marsisa', 'azkell_tenant_rosymarperu', 'azkell_tenant_yoguitransport', 'azkell_tenant_trahesa', 'azkell_fleet'];
    const peruNow = getPeruNowString();
    console.log('🇵🇪 Hora Local Perú (America/Lima UTC-5):', peruNow);

    for (const dbName of dbs) {
        try {
            const pool = getTenantPool(dbName).promise();
            const [tables] = await pool.query("SHOW TABLES LIKE 'inventario'");
            if (tables.length === 0) continue;

            const [res] = await pool.query(
                "UPDATE inventario SET stock_regularizado = 0, fecha_regularizacion = ? WHERE activo = 1",
                [peruNow]
            );
            console.log(`✅ ${dbName}: ${res.affectedRows} artículos actualizados con fecha/hora Lima (${peruNow})`);
        } catch (e) {
            console.error(`❌ Error en ${dbName}:`, e.message);
        }
    }
    process.exit(0);
}

fixTimezone();
