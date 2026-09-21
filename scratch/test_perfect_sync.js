require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function testPerfectSync() {
    const pool = getTenantPool('azkell_tenant_marsisa').promise();
    const clean = str => (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const norm = str => (str || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // 1. Placas maestras
    const [placas] = await pool.query(`
        SELECT placa, cliente, marca, tipo, sub_tipo, combustible, uts, carga_util, capacidad_tanque, motora 
        FROM placas 
        WHERE (estado = 'Activa' OR estado IS NULL OR estado = '')
        ORDER BY placa ASC
    `);

    // 2. Reportes de fallas activos (En Taller / En Proceso / Pendiente)
    const [fallasRows] = await pool.query(`
        SELECT id, folio, fecha_reporte, placa_tracto, placa_remolque, conductor, estado, ots_generadas_json
        FROM reportes_fallas
        WHERE estado != 'Finalizado'
        ORDER BY id DESC
    `);

    // 3. OTs activas directas en ordenes_trabajo
    const [otRows] = await pool.query(`
        SELECT placa, id_ot, ticket_entrada, estado, fecha_ingreso
        FROM ordenes_trabajo
        WHERE estado NOT IN ('Finalizado', 'Finalizada', 'Anulado', 'Anulada', 'Cerrado', 'Cerrada')
    `);

    // 4. Unidades en ruta desde Checklist / Seguridad
    const [enRutaRows] = await pool.query(`
        SELECT id, placa_tracto, placa_carreta, conductor, destino, salida_fecha, salida_hora, estado, salida_observaciones
        FROM seg_unidades_registros
        WHERE estado = 'en_ruta'
        ORDER BY id DESC
    `);

    // 5. Últimos registros en Base desde Seguridad
    const [baseRows] = await pool.query(`
        SELECT placa_camion, placa_carreta, conductor, observacion
        FROM seg_unidades_base
        ORDER BY fecha DESC, id DESC
    `);

    // 6. Disponibilidad manual guardada
    const [dispRows] = await pool.query(`SELECT * FROM flota_disponibilidad`);

    // Sets & Maps
    const otSet = new Set();
    otRows.forEach(ot => {
        const p = clean(ot.placa);
        if (p) otSet.add(p);
    });

    // Mapeo de fallas activas (Taller)
    const fallasTractoMap = {};
    const fallasRemolqueSet = new Set();
    fallasRows.forEach(f => {
        const pt = clean(f.placa_tracto);
        const pr = clean(f.placa_remolque);
        if (pt && !fallasTractoMap[pt]) {
            fallasTractoMap[pt] = f;
            if (pr) fallasRemolqueSet.add(pr);
        }
    });

    // Mapeo de unidades en ruta
    const rutaCamionMap = {};
    const rutaCarretaSet = new Set();
    enRutaRows.forEach(r => {
        const pt = clean(r.placa_tracto);
        const pc = clean(r.placa_carreta);
        if (pt && !rutaCamionMap[pt]) {
            rutaCamionMap[pt] = r;
            if (pc) rutaCarretaSet.add(pc);
        }
    });

    // Mapeo de base
    const baseCamionMap = {};
    const baseCarretaSet = new Set();
    baseRows.forEach(b => {
        const pc = clean(b.placa_camion);
        const pcar = clean(b.placa_carreta);
        if (pc && !baseCamionMap[pc]) {
            baseCamionMap[pc] = b;
            if (pcar) baseCarretaSet.add(pcar);
        }
    });

    // Mapeo de disponibilidad manual
    const dispMap = {};
    dispRows.forEach(d => {
        const pc = clean(d.placa_camion);
        const pcar = clean(d.placa_carreta);
        if (pc) dispMap[pc] = d;
        else if (pcar) dispMap[pcar] = d;
    });

    const motoras = [];
    const remolques = [];
    const carretasAcopladas = new Set();

    placas.forEach(p => {
        const tipoNorm = norm(p.tipo);
        const subTipoNorm = norm(p.sub_tipo);
        const motoraNorm = norm(p.motora);

        const isMotora = (motoraNorm.includes('MOTORA') && !motoraNorm.includes('NO')) ||
            p.motora === '1' || p.motora === 1 || 
            ['CAMION', 'TRACTO', 'VOLQUETE', 'FURGON', 'CISTERNA', 'CAMIONETA', 'TRACTOCAMION'].some(t => tipoNorm.includes(t)) ||
            (subTipoNorm && (subTipoNorm.includes('TRACTO') || subTipoNorm.includes('CAMION')));
        
        if (isMotora) {
            motoras.push(p);
        } else {
            remolques.push(p);
        }
    });

    const resultado = [];

    // Procesar motoras (Camiones / Tractos)
    motoras.forEach(p => {
        const cPlaca = clean(p.placa);
        const falla = fallasTractoMap[cPlaca];
        const enRuta = rutaCamionMap[cPlaca];
        const enBase = baseCamionMap[cPlaca];
        const disp = dispMap[cPlaca];
        const hasDirectOT = otSet.has(cPlaca);

        let carreta = '';
        let conductor = '';
        let estado = 'En Base';
        let observaciones = '';

        if (falla || hasDirectOT) {
            estado = 'En Mantenimiento';
            if (falla) {
                carreta = falla.placa_remolque || (disp ? disp.placa_carreta : '') || '';
                conductor = falla.conductor || (disp ? disp.conductor_asignado : '') || '';
                observaciones = `En Taller / Folio ${falla.folio || ''}`;
            } else {
                carreta = (disp ? disp.placa_carreta : '') || '';
                conductor = (disp ? disp.conductor_asignado : '') || '';
                observaciones = 'En Taller / OT Activa';
            }
        } else if (enRuta) {
            estado = 'En Ruta';
            carreta = enRuta.placa_carreta || (disp ? disp.placa_carreta : '') || '';
            conductor = enRuta.conductor || (disp ? disp.conductor_asignado : '') || '';
            observaciones = enRuta.destino ? `Destino: ${enRuta.destino}` : (enRuta.salida_observaciones || (disp ? disp.observaciones : ''));
        } else if (enBase) {
            estado = 'En Base';
            carreta = enBase.placa_carreta || (disp ? disp.placa_carreta : '') || '';
            conductor = enBase.conductor || (disp ? disp.conductor_asignado : '') || '';
            observaciones = enBase.observacion || (disp ? disp.observaciones : '');
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
            tipo_unidad: p.tipo || 'Camión',
            observaciones: observaciones,
            is_motora: true
        });
    });

    // Procesar remolques/carretas sueltas
    remolques.forEach(p => {
        const cPlaca = clean(p.placa);
        if (carretasAcopladas.has(cPlaca)) return; // Ya está emparejada con un camión

        const disp = dispMap[cPlaca];
        const hasOT = otSet.has(cPlaca) || fallasRemolqueSet.has(cPlaca);
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
            observaciones: disp ? disp.observaciones : (hasOT ? 'En Taller / OT Activa' : ''),
            is_motora: false
        });
    });

    console.log(`✅ Total filas consolidadas: ${resultado.length}`);
    console.log(`🚛 Camiones/Tractos: ${motoras.length}`);
    console.log(`📦 Carretas libres: ${resultado.filter(r => !r.is_motora).length}`);
    const bdj = resultado.find(r => r.placa_camion === 'BDJ729');
    console.log('BDJ729:', bdj);
    process.exit(0);
}

testPerfectSync();
