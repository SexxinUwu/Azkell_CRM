const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkStock() {
    const config = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: process.env.DB_PORT || 3306
    };

    const conn = await mysql.createConnection(config);
    const [dbs] = await conn.query("SHOW DATABASES LIKE 'azkell%'");
    console.log("Databases found:", dbs.map(d => Object.values(d)[0]));

    for (const dbRow of dbs) {
        const dbName = Object.values(dbRow)[0];
        console.log(`\n=================== Checking DB: ${dbName} ===================`);
        await conn.query(`USE \`${dbName}\``);

        // Check if tables exist
        const [tables] = await conn.query("SHOW TABLES LIKE 'inventario'");
        if (!tables.length) {
            console.log("No inventario table in", dbName);
            continue;
        }

        // Check inventario for INV-0212 or description
        const [inv] = await conn.query(
            "SELECT * FROM inventario WHERE id = 'INV-0212' OR descripcion LIKE '%INV-0212%' OR descripcion LIKE '%R404A%'"
        );
        console.log("Inventario matches:", JSON.stringify(inv, null, 2));

        // Check salidas_inv for SA-2026-00025
        const [salidas] = await conn.query(
            "SELECT * FROM salidas_inv WHERE id LIKE '%25%' OR id LIKE '%SA-2026-00025%' ORDER BY id DESC LIMIT 5"
        );
        console.log("Salidas matches:", JSON.stringify(salidas, null, 2));

        if (salidas.length > 0) {
            const [detalleSalidas] = await conn.query(
                "SELECT * FROM detalle_salidas_inv WHERE salida_id = 'SA-2026-00025' OR salida_id LIKE '%00025%'"
            );
            console.log("Detalle salidas:", JSON.stringify(detalleSalidas, null, 2));
        }

        // Check entradas, recepciones, salidas for INV-0212
        if (inv.length > 0) {
            for (const item of inv) {
                const itemId = item.id;
                console.log(`\n--- Stock breakdown for ${itemId} (${item.descripcion}) in ${dbName} ---`);

                // 1. Direct entries / adjustments
                try {
                    const [entradas] = await conn.query(`
                        SELECT de.inventario_id, de.cantidad, e.id AS entrada_id, e.tipo_orden, e.estado, e.fecha
                        FROM detalle_entradas_inv de
                        JOIN entradas_inv e ON e.id = de.entrada_id
                        WHERE de.inventario_id = ?
                    `, [itemId]);
                    console.log("Entradas directas:", entradas);
                } catch(e) { console.log("Error entradas:", e.message); }

                // 2. Recepciones OC
                try {
                    const [recepciones] = await conn.query(`
                        SELECT dr.inventario_id, dr.cantidad_recibida, r.id AS recepcion_id, r.oc_id, e.estado AS oc_estado, r.fecha
                        FROM detalle_recepciones_oc dr
                        JOIN recepciones_oc r ON r.id = dr.recepcion_id
                        LEFT JOIN entradas_inv e ON e.id = r.oc_id
                        WHERE dr.inventario_id = ?
                    `, [itemId]);
                    console.log("Recepciones OC:", recepciones);
                } catch(e) { console.log("Error recepciones:", e.message); }

                // 3. Salidas
                try {
                    const [salidasItem] = await conn.query(`
                        SELECT ds.inventario_id, ds.cantidad, s.id AS salida_id, s.estado, s.fecha
                        FROM detalle_salidas_inv ds
                        JOIN salidas_inv s ON s.id = ds.salida_id
                        WHERE ds.inventario_id = ?
                    `, [itemId]);
                    console.log("Salidas:", salidasItem);
                } catch(e) { console.log("Error salidas:", e.message); }

                // Run the exact calculation query used in backend
                try {
                    const [calcStock] = await conn.query(`
                        SELECT i.id, i.descripcion,
                               COALESCE(i.stock_regularizado, 0) AS stock_reg,
                               COALESCE(ent.total_entradas, 0) AS tot_ent,
                               COALESCE(rec.total_recepciones, 0) AS tot_rec,
                               COALESCE(sal.total_salidas, 0) AS tot_sal,
                               ROUND(COALESCE(i.stock_regularizado, 0) 
                                 + COALESCE(ent.total_entradas, 0) 
                                 + COALESCE(rec.total_recepciones, 0) 
                                 - COALESCE(sal.total_salidas, 0), 4) AS stock_actual
                        FROM inventario i
                        LEFT JOIN (
                            SELECT de.inventario_id, SUM(de.cantidad) AS total_entradas 
                            FROM detalle_entradas_inv de
                            JOIN entradas_inv e ON e.id = de.entrada_id
                            WHERE (e.estado IS NULL OR e.estado != 'Anulado') AND (e.tipo_orden = 'Entrada directa' OR e.tipo_orden = 'Ajuste')
                            GROUP BY de.inventario_id
                        ) ent ON ent.inventario_id = i.id
                        LEFT JOIN (
                            SELECT dr.inventario_id, SUM(dr.cantidad_recibida) AS total_recepciones
                            FROM detalle_recepciones_oc dr
                            JOIN recepciones_oc r ON r.id = dr.recepcion_id
                            JOIN entradas_inv e ON e.id = r.oc_id
                            WHERE (e.estado IS NULL OR (e.estado != 'Anulado' AND LOWER(e.estado) NOT LIKE '%anul%' AND LOWER(e.estado) NOT LIKE '%rechaz%'))
                            GROUP BY dr.inventario_id
                        ) rec ON rec.inventario_id = i.id
                        LEFT JOIN (
                            SELECT ds.inventario_id, SUM(ds.cantidad) AS total_salidas
                            FROM detalle_salidas_inv ds
                            JOIN salidas_inv s2 ON s2.id = ds.salida_id
                            WHERE s2.estado = 'Despachado'
                            GROUP BY ds.inventario_id
                        ) sal ON sal.inventario_id = i.id
                        WHERE i.id = ?
                    `, [itemId]);
                    console.log("Stock Calculado:", calcStock);
                } catch(e) { console.log("Error calc stock:", e.message); }
            }
        }
    }

    await conn.end();
}

checkStock().catch(console.error);
