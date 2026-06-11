const mysql = require('mysql2/promise');

async function main() {
    const c = await mysql.createConnection({
        host: '82.39.109.226',
        user: 'root',
        password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
        database: 'azkell_fleet'
    });

    const queries = [
        "ALTER TABLE backlog_mantenimiento MODIFY placa VARCHAR(100)",
        "ALTER TABLE fleetrun MODIFY placa VARCHAR(100)",
        "ALTER TABLE inspecciones MODIFY placa VARCHAR(100)",
        "ALTER TABLE km_snapshots MODIFY placa VARCHAR(100)",
        "ALTER TABLE ordenes_trabajo MODIFY placa VARCHAR(100)",
        "ALTER TABLE ot_backlog MODIFY placa VARCHAR(100)",
        "ALTER TABLE placa_auditoria MODIFY placa VARCHAR(100)",
        "ALTER TABLE placas MODIFY placa VARCHAR(100)",
        "ALTER TABLE planificacion MODIFY placa VARCHAR(100)",
        "ALTER TABLE salidas_inv MODIFY placa VARCHAR(100)",
        "ALTER TABLE status_flota MODIFY unidad_motora VARCHAR(100)",
        "ALTER TABLE status_flota MODIFY unidad_no_motora VARCHAR(100)",
        "ALTER TABLE taller_rampas MODIFY placa VARCHAR(100)"
    ];

    for (let q of queries) {
        try {
            console.log("Running:", q);
            await c.query(q);
        } catch(e) {
            console.error("Error on", q, e.message);
        }
    }
    await c.end();
    console.log("Done");
}
main();
