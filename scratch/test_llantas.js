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
        
        // Count of all placas
        const [totalPlacas] = await pool.query(`SELECT COUNT(*) as total FROM placas`);

        // Count of placas by en_uso
        const [byEnUso] = await pool.query(`SELECT en_uso, COUNT(*) as cnt FROM placas GROUP BY en_uso`);

        // Count of placas by tipo
        const [byTipo] = await pool.query(`SELECT tipo, COUNT(*) as cnt FROM placas GROUP BY tipo`);

        console.log("=== ANÁLISIS PLACAS DB ===");
        console.log("Total placas DB:", totalPlacas[0].total);
        console.log("Por en_uso:", byEnUso);
        console.log("Por tipo:", byTipo);

        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
main();
