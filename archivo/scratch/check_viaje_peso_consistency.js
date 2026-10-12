const mysql = require('mysql2/promise');
require('dotenv').config();

async function check() {
    // 1. Conectar a BD local VPS
    const localConn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'azkell_fleet',
        port: process.env.DB_PORT || 3306
    });

    const [valesLocal] = await localConn.query(`
        SELECT viaje, COUNT(*) as cant_vales, 
               GROUP_CONCAT(DISTINCT peso_tn) as pesos_distintos,
               MIN(peso_tn) as min_peso, MAX(peso_tn) as max_peso
        FROM combustible_vales
        WHERE viaje IS NOT NULL AND viaje != '' AND estado = 'VÁLIDO'
        GROUP BY viaje
        HAVING MAX(peso_tn) > 0
        LIMIT 10
    `);
    console.log("=== Vales con peso en BD Local VPS (azkell_fleet) ===");
    console.log(valesLocal);

    await localConn.end();

    // 2. Conectar a BD remota Marsisa para analizar cómo vienen los vales en el origen
    const remoteConn = await mysql.createConnection({
        host: process.env.REMOTE_FUEL_HOST || '168.231.98.23',
        user: process.env.REMOTE_FUEL_USER || 'prov_combustible',
        password: process.env.REMOTE_FUEL_PASSWORD || '32f2dc8b2b27fc021c81674c04c2326e',
        database: process.env.REMOTE_FUEL_DATABASE || 'marsisadb_prod'
    });

    const [valesRemoto] = await remoteConn.query(`
        SELECT viaje_numero, COUNT(*) as total_vales_viaje,
               GROUP_CONCAT(DISTINCT peso) as pesos_distintos,
               MIN(peso) as min_peso, MAX(peso) as max_peso,
               GROUP_CONCAT(CONCAT('Vale #', numero, ': peso=', peso, ' (', tipo, ')') SEPARATOR ' | ') as detalle
        FROM vw_combustible_vale
        WHERE viaje_numero IS NOT NULL AND viaje_numero != '' AND fl_estado = 1
        GROUP BY viaje_numero
        HAVING MAX(peso) > 0 AND COUNT(*) > 1
        LIMIT 10
    `);

    console.log("\n=== Muestra de Vales Remotos por Viaje en vw_combustible_vale ===");
    valesRemoto.forEach(r => {
        console.log(`Viaje #${r.viaje_numero} (${r.total_vales_viaje} vales): Pesos distintos = [${r.pesos_distintos}]`);
        console.log(`   ${r.detalle}`);
    });

    const [statsRemoto] = await remoteConn.query(`
        SELECT 
            COUNT(*) as total_viajes_analizados,
            SUM(CASE WHEN cant_pesos_positivos = 1 AND min_pos = max_pos THEN 1 ELSE 0 END) as mismo_peso_en_todos_los_vales,
            SUM(CASE WHEN cant_pesos_positivos > 1 THEN 1 ELSE 0 END) as viajes_con_pesos_distintos
        FROM (
            SELECT viaje_numero, 
                   COUNT(DISTINCT CASE WHEN peso > 0 THEN peso END) as cant_pesos_positivos,
                   MIN(CASE WHEN peso > 0 THEN peso END) as min_pos,
                   MAX(CASE WHEN peso > 0 THEN peso END) as max_pos
            FROM vw_combustible_vale
            WHERE viaje_numero IS NOT NULL AND viaje_numero != '' AND fl_estado = 1
            GROUP BY viaje_numero
            HAVING MAX(peso) > 0 AND COUNT(*) > 1
        ) t
    `);

    console.log("\n=== Estadísticas de consistencia en el origen remoto ===");
    console.log(statsRemoto[0]);

    await remoteConn.end();
}

check().catch(console.error);
