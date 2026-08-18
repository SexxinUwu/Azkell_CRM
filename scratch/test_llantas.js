const mysql = require('mysql2/promise');

async function main() {
    try {
        const pool = mysql.createPool({ 
            host: '82.39.109.226', 
            user: 'root', 
            password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU', 
            database: 'azkell_fleet', 
            port: 3306 
        });
        
        const [vigencias] = await pool.query(`
            SELECT 
                COUNT(*) as total_flota_activa,
                CAST(COALESCE(SUM(CASE WHEN last_i.fecha_proxima IS NOT NULL AND last_i.fecha_proxima >= CURDATE() THEN 1 ELSE 0 END), 0) AS UNSIGNED) as vigentes,
                CAST(COALESCE(SUM(CASE WHEN last_i.fecha_proxima IS NOT NULL AND last_i.fecha_proxima < CURDATE() THEN 1 ELSE 0 END), 0) AS UNSIGNED) as no_vigentes,
                CAST(COALESCE(SUM(CASE WHEN last_i.fecha_proxima IS NULL THEN 1 ELSE 0 END), 0) AS UNSIGNED) as sin_inspeccion
            FROM placas p
            LEFT JOIN (
                SELECT i1.placa, i1.fecha_proxima
                FROM neumaticos_inspecciones i1
                INNER JOIN (
                    SELECT placa, MAX(fecha_inspeccion) as max_fecha
                    FROM neumaticos_inspecciones
                    GROUP BY placa
                ) i2 ON i1.placa COLLATE utf8mb4_unicode_ci = i2.placa COLLATE utf8mb4_unicode_ci AND i1.fecha_inspeccion = i2.max_fecha
            ) last_i ON p.placa COLLATE utf8mb4_unicode_ci = last_i.placa COLLATE utf8mb4_unicode_ci
            WHERE UPPER(TRIM(COALESCE(p.en_uso, 'SI'))) != 'NO'
        `);

        console.log("=== VIGENCIAS SOBRE FLOTA COMPLETA ===");
        console.log("Total Flota Activa:", vigencias[0].total_flota_activa);
        console.log("Vigentes:", vigencias[0].vigentes);
        console.log("No Vigentes (Vencidas):", vigencias[0].no_vigentes);
        console.log("Sin Inspección (Nunca inspeccionadas):", vigencias[0].sin_inspeccion);
        console.log("Suma comprobación:", Number(vigencias[0].vigentes) + Number(vigencias[0].no_vigentes) + Number(vigencias[0].sin_inspeccion));

        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
main();
