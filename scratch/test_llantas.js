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
        
        const [r] = await pool.query(`
            SELECT 
                CAST(COALESCE(SUM(
                    CASE 
                        WHEN p.llantas REGEXP '^[0-9]+$' THEN CAST(p.llantas AS UNSIGNED)
                        ELSE 0 
                    END
                ), 0) AS UNSIGNED) as total_circulando
            FROM placas p
            WHERE UPPER(TRIM(COALESCE(p.en_uso, 'SI'))) = 'SI'
        `);

        const [byMotora] = await pool.query(`
            SELECT 
                COALESCE(motora, 'Sin Especificar') as tipo_motora,
                COUNT(*) as cantidad_vehiculos,
                SUM(CASE WHEN llantas REGEXP '^[0-9]+$' THEN CAST(llantas AS UNSIGNED) ELSE 0 END) as suma_llantas
            FROM placas 
            WHERE UPPER(TRIM(COALESCE(en_uso, 'SI'))) = 'SI'
            GROUP BY motora
        `);

        console.log("=== RESULTADO LIMPIO ===");
        console.log("Total Llantas Circulando (Sum de llantas en placas activas en_uso=Si):", r[0].total_circulando);
        console.log("Desglose por Motora / No Motora:", byMotora);

        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
main();
