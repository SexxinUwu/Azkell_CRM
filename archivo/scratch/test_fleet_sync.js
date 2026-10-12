require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function testFleetSync() {
    const pool = getTenantPool('azkell_tenant_marsisa').promise();
    const clean = str => (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    // 1. Placas maestras
    const [placas] = await pool.query(`
        SELECT placa, cliente, marca, tipo, combustible, uts, carga_util, capacidad_tanque, motora 
        FROM placas 
        WHERE (estado = 'Activa' OR estado IS NULL OR estado = '')
        ORDER BY placa ASC
    `);

    // 2. En ruta desde seg_unidades_registros
    const [enRutaRows] = await pool.query(`
        SELECT id, placa_tracto, placa_carreta, conductor, destino, salida_fecha, salida_hora, estado, salida_observaciones
        FROM seg_unidades_registros
        WHERE estado = 'en_ruta'
    `);

    // 3. OTs activas
    const [otRows] = await pool.query(`
        SELECT placa, id_ot, ticket_entrada, estado, fecha_ingreso
        FROM ordenes_trabajo
        WHERE estado NOT IN ('Finalizado', 'Finalizada', 'Anulado', 'Anulada', 'Cerrado', 'Cerrada')
    `);

    // 4. Base
    const [baseRows] = await pool.query(`
        SELECT placa_camion, placa_carreta, conductor, observacion
        FROM seg_unidades_base
        ORDER BY fecha DESC, id DESC
        LIMIT 500
    `);

    // 5. Disponibilidad guardada
    const [dispRows] = await pool.query(`SELECT * FROM flota_disponibilidad`);

    console.log(`📊 Placas: ${placas.length}`);
    console.log(`🛣️ En Ruta: ${enRutaRows.length}`);
    console.log(`🔧 OTs Activas: ${otRows.length}`);
    console.log(`🏢 Base Registros: ${baseRows.length}`);
    console.log(`📋 Disponibilidad guardada: ${dispRows.length}`);

    const otSet = new Set();
    otRows.forEach(ot => {
        const p = clean(ot.placa);
        if (p) otSet.add(p);
    });

    const rutaCamionMap = {};
    const rutaCarretaMap = {};
    enRutaRows.forEach(r => {
        const pt = clean(r.placa_tracto);
        const pc = clean(r.placa_carreta);
        if (pt) rutaCamionMap[pt] = r;
        if (pc) rutaCarretaMap[pc] = r;
    });

    console.log('Sample OTs activas placas:', Array.from(otSet));
    process.exit(0);
}

testFleetSync();
