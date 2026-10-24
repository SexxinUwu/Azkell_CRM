// Recalcula neumaticos_hoja_vida.km_acumulado de todos los neumáticos de UNA base de tenant.
//
// Uso:
//   node scripts/backfill_km_neumaticos.js --db azkell_tenant_marsisa            (dry-run, por defecto)
//   node scripts/backfill_km_neumaticos.js --db azkell_tenant_marsisa --apply    (escribe en la base)
//
// Sin --apply no escribe nada: solo calcula y muestra la tabla de cambios.
// La conexión usa las variables DB_HOST, DB_USER, DB_PASSWORD, DB_PORT (.env), igual que el resto de scripts.

require('dotenv').config();
const mysql = require('mysql2/promise');
const { calcularKmAcumuladoLlanta, actualizarKmAcumuladoLlanta } = require('../services/km_neumaticos');

function leerArgs(argv) {
    const args = { db: null, apply: false, dryRun: false, error: null };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply') args.apply = true;
        else if (a === '--dry-run') args.dryRun = true;
        else if (a === '--db') args.db = argv[++i] || null;
        else if (a.startsWith('--db=')) args.db = a.slice('--db='.length) || null;
        else args.error = `Argumento no reconocido: ${a}`;
    }
    if (args.apply && args.dryRun) args.error = 'Use --apply o --dry-run, no ambos';
    if (!args.db && !args.error) args.error = 'Falta --db <nombre_base>';
    return args;
}

async function main() {
    const args = leerArgs(process.argv);
    if (args.error) {
        console.error(`Error: ${args.error}`);
        console.error('Uso: node scripts/backfill_km_neumaticos.js --db <base> [--apply]');
        process.exit(1);
    }

    const modo = args.apply ? 'APLICAR (escribe en neumaticos_hoja_vida)' : 'DRY-RUN (no escribe)';
    console.log(`Base: ${args.db} | Modo: ${modo}`);

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        database: args.db,
        ssl: (process.env.DB_HOST && (process.env.DB_HOST.includes('railway') || process.env.DB_HOST.includes('aiven') || process.env.DB_SSL === 'true')) ? { rejectUnauthorized: false } : undefined
    });

    const filas = [];
    let errores = 0;
    try {
        const [neumaticos] = await conn.query(
            'SELECT id_neumatico, km_acumulado FROM neumaticos_hoja_vida ORDER BY id_neumatico'
        );
        console.log(`Neumáticos a recalcular: ${neumaticos.length}`);

        for (const n of neumaticos) {
            try {
                const r = args.apply
                    ? await actualizarKmAcumuladoLlanta(conn, n.id_neumatico)
                    : await calcularKmAcumuladoLlanta(conn, n.id_neumatico);
                const sinDato = r.instalaciones.filter(i => i.fuente === 'sin_dato').length;
                filas.push({
                    id_neumatico: n.id_neumatico,
                    km_actual: Number(n.km_acumulado) || 0,
                    km_nuevo: r.km_acumulado,
                    diferencia: r.km_acumulado - (Number(n.km_acumulado) || 0),
                    instalaciones: r.instalaciones.length,
                    sin_dato: sinDato
                });
            } catch (err) {
                errores++;
                console.warn(`Error en ${n.id_neumatico}: ${err.message}`);
            }
        }
    } finally {
        await conn.end();
    }

    if (filas.length) console.table(filas);

    const cambian = filas.filter(f => f.diferencia !== 0).length;
    console.log(`Resumen: ${filas.length} calculados, ${cambian} con cambio, ${errores} con error.`);
    if (!args.apply) console.log('Dry-run: no se escribió nada. Para aplicar, repetir con --apply.');
}

main().catch(err => {
    console.error('Error fatal:', err.message);
    process.exit(1);
});
