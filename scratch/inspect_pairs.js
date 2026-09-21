require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function inspectPairs() {
    const pool = getTenantPool('azkell_tenant_marsisa').promise();
    
    // Check seg_unidades_registros recent entries
    const [registros] = await pool.query(`
        SELECT id, placa_tracto, placa_carreta, conductor, estado, destino
        FROM seg_unidades_registros
        ORDER BY id DESC LIMIT 10
    `);
    console.log('--- seg_unidades_registros (last 10) ---');
    console.log(registros);

    // Check mant_incidencias_ruta (Reporte de fallas table)
    const [fallas] = await pool.query(`
        SELECT id, folio, fecha, placa_tracto, placa_remolque, conductor, estado
        FROM mant_incidencias_ruta
        WHERE estado = 'EN TALLER' OR estado = 'PENDIENTE'
        ORDER BY id DESC LIMIT 10
    `);
    console.log('--- mant_incidencias_ruta (activas) ---');
    console.log(fallas);

    // Check ordenes_trabajo
    const [ots] = await pool.query(`
        SELECT id, placa, id_ot, ticket_entrada, estado, fecha_ingreso
        FROM ordenes_trabajo
        WHERE estado NOT IN ('Finalizado', 'Finalizada', 'Anulado', 'Anulada', 'Cerrado', 'Cerrada')
        ORDER BY id DESC
    `);
    console.log('--- Active OTs in ordenes_trabajo ---');
    console.log(ots);

    process.exit(0);
}

inspectPairs();
