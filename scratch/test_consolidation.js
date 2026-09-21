require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function testConsolidation() {
    const pool = getTenantPool('azkell_tenant_marsisa').promise();
    const clean = str => (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    // 1. Placas maestras
    const [placas] = await pool.query(`
        SELECT placa, cliente, marca, tipo, sub_tipo, combustible, uts, carga_util, capacidad_tanque, motora 
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
    `);

    // 5. Disponibilidad manual guardada
    const [dispRows] = await pool.query(`SELECT * FROM flota_disponibilidad`);

    const otSet = new Set();
    otRows.forEach(ot => {
        const p = clean(ot.placa);
        if (p) otSet.add(p);
    });

    const rutaCamionMap = {};
    const rutaCarretaSet = new Set();
    enRutaRows.forEach(r => {
        const pt = clean(r.placa_tracto);
        const pc = clean(r.placa_carreta);
        if (pt) rutaCamionMap[pt] = r;
        if (pc) rutaCarretaSet.add(pc);
    });

    const baseCamionMap = {};
    const baseCarretaSet = new Set();
    baseRows.forEach(b => {
        const pc = clean(b.placa_camion);
        const pcar = clean(b.placa_carreta);
        if (pc && !baseCamionMap[pc]) baseCamionMap[pc] = b;
        if (pcar) baseCarretaSet.add(pcar);
    });

    const dispMap = {};
    dispRows.forEach(d => {
        const pc = clean(d.placa_camion);
        const pcar = clean(d.placa_carreta);
        if (pc) dispMap[pc] = d;
        else if (pcar) dispMap[pcar] = d;
    });

    const resultado = [];
    const carretasAcopladas = new Set();

    // Separar motoras vs remolques
    const motoras = [];
    const remolques = [];

    placas.forEach(p => {
        const tipoUpper = (p.tipo || '').toUpperCase();
        const isMotora = p.motora === '1' || p.motora === 1 || 
            ['CAMION', 'TRACTO', 'TRACTOCAMION', 'VOLQUETE', 'FURGON', 'CISTERNA', 'CAMIONETA', 'TRACTO CAMION'].some(t => tipoUpper.includes(t));
        
        if (isMotora) {
            motoras.push(p);
        } else {
            remolques.push(p);
        }
    });

    // Procesar motoras
    motoras.forEach(p => {
        const cPlaca = clean(p.placa);
        const enRuta = rutaCamionMap[cPlaca];
        const enBase = baseCamionMap[cPlaca];
        const disp = dispMap[cPlaca];
        const hasOT = otSet.has(cPlaca);

        let carreta = '';
        let conductor = '';
        let estado = 'En Base';
        let observaciones = '';

        if (hasOT) {
            estado = 'En Mantenimiento';
        } else if (enRuta) {
            estado = 'En Ruta';
            carreta = enRuta.placa_carreta || '';
            conductor = enRuta.conductor || '';
            observaciones = enRuta.destino ? `Destino: ${enRuta.destino}` : (enRuta.salida_observaciones || '');
        } else if (enBase) {
            estado = 'En Base';
            carreta = enBase.placa_carreta || '';
            conductor = enBase.conductor || '';
            observaciones = enBase.observacion || '';
        } else if (disp) {
            carreta = disp.placa_carreta || '';
            conductor = disp.conductor_asignado || '';
            observaciones = disp.observaciones || '';
        }

        if (carreta) carretasAcopladas.add(clean(carreta));

        let capTanque = p.capacidad_tanque || (disp ? disp.capacidad_tanque : '') || '0';
        if (capTanque && !String(capTanque).toUpperCase().includes('GLN') && !String(capTanque).toUpperCase().includes('M³') && capTanque !== '0') {
            capTanque = capTanque + ' Gln';
        }

        resultado.push({
            id: disp ? disp.id : null,
            placa_camion: p.placa,
            placa_carreta: carreta,
            conductor_asignado: conductor,
            estado: estado,
            marca: p.marca || (disp ? disp.marca : '') || '',
            capacidad_tanque: capTanque,
            tipo_unidad: p.tipo || 'Tracto Camión',
            observaciones: observaciones,
            is_motora: true
        });
    });

    // Procesar remolques/carretas sueltas
    remolques.forEach(p => {
        const cPlaca = clean(p.placa);
        if (carretasAcopladas.has(cPlaca)) return; // Ya acoplada a un camión

        const disp = dispMap[cPlaca];
        const hasOT = otSet.has(cPlaca);
        const enRuta = rutaCarretaSet.has(cPlaca);

        let estado = 'En Base';
        if (hasOT) estado = 'En Mantenimiento';
        else if (enRuta) estado = 'En Ruta';

        resultado.push({
            id: disp ? disp.id : null,
            placa_camion: '',
            placa_carreta: p.placa,
            conductor_asignado: disp ? disp.conductor_asignado : '',
            estado: estado,
            marca: p.marca || (disp ? disp.marca : '') || '',
            capacidad_tanque: '—',
            tipo_unidad: p.tipo || 'Carreta / Remolque',
            observaciones: disp ? disp.observaciones : '',
            is_motora: false
        });
    });

    console.log(`✅ Total filas consolidadas: ${resultado.length}`);
    console.log(`🚛 Camiones/Tractos: ${motoras.length}`);
    console.log(`📦 Carretas libres: ${resultado.filter(r => !r.is_motora).length}`);
    console.log('Sample 3 rows:', resultado.slice(0, 3));
    process.exit(0);
}

testConsolidation();
