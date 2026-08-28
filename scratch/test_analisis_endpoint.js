const mysql = require('mysql2/promise');
require('dotenv').config();

async function testAnalisisEndpoint() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'fleet_db',
        port: process.env.DB_PORT || 3306
    });

    const [rows] = await conn.query(`
        SELECT 
            id, fecha, estado, correlativo, viaje, clase_vehiculo, vehiculo,
            conductor, ruta, estacion, tipo_combustible, proveedor,
            kilometraje, peso_tn, galones, costo_gl, tipo_pago,
            moneda, importe, tipo
        FROM combustible_vales
        WHERE estado = 'VÁLIDO'
        ORDER BY vehiculo ASC, fecha ASC
        LIMIT 500
    `);

    console.log(`Leídos ${rows.length} vales válidos.`);

    // Agrupar por vehiculo y luego por viaje
    const vehMap = {};
    rows.forEach(r => {
        const v = r.vehiculo || 'SIN_PLACA';
        if (!vehMap[v]) vehMap[v] = {};
        const tr = r.viaje || `V_${r.fecha ? r.fecha.slice(0, 10) : 'ND'}_${r.id}`;
        if (!vehMap[v][tr]) {
            vehMap[v][tr] = {
                viaje: tr,
                placa: v,
                ruta: r.ruta || '---',
                vouchers: []
            };
        }
        vehMap[v][tr].vouchers.push({
            id: r.id,
            correlativo: r.correlativo,
            fecha: r.fecha ? r.fecha.slice(0, 19).replace('T', ' ') : 'N/D',
            odometro: parseFloat(r.kilometraje || 0),
            galones: parseFloat(r.galones || 0),
            precioGalon: parseFloat(r.costo_gl || 0),
            importe: parseFloat(r.importe || 0),
            producto: r.tipo_combustible || 'D2',
            estacion: r.estacion || '---',
            proveedor: r.proveedor || '---',
            conductor: r.conductor || '---',
            peso: parseFloat(r.peso_tn || 0),
            tipo: r.tipo || 'RECARGA VUELTA'
        });
    });

    const trips = [];
    Object.keys(vehMap).forEach(placa => {
        const vehTrips = Object.values(vehMap[placa]);
        vehTrips.forEach(t => {
            const totalGal = t.vouchers.reduce((s, x) => s + x.galones, 0);
            const totalCost = t.vouchers.reduce((s, x) => s + x.importe, 0);
            const maxPesoRaw = Math.max(0, ...t.vouchers.map(x => parseFloat(x.peso || 0)));
            const pesoCalculadoTn = maxPesoRaw > 50 ? parseFloat((maxPesoRaw / 1000).toFixed(2)) : parseFloat(maxPesoRaw.toFixed(2));

            const vouchersIda = t.vouchers.filter(v => !v.esPuntoPartida && (v.tipo || '').toUpperCase().includes('IDA'));
            const vouchersRetorno = t.vouchers.filter(v => !v.esPuntoPartida && ((v.tipo || '').toUpperCase().includes('VUELTA') || (v.tipo || '').toUpperCase().includes('SERVICIO')));

            const galonesIda = vouchersIda.reduce((s, x) => s + (x.galones || 0), 0);
            const galonesRetorno = vouchersRetorno.reduce((s, x) => s + (x.galones || 0), 0);

            const rawPesoIda = Math.max(0, ...vouchersIda.map(x => parseFloat(x.peso || 0)));
            const pesoIdaCalculado = rawPesoIda > 50 ? parseFloat((rawPesoIda / 1000).toFixed(2)) : parseFloat(rawPesoIda.toFixed(2));

            const rawPesoRet = Math.max(0, ...vouchersRetorno.map(x => parseFloat(x.peso || 0)));
            const pesoRetornoCalculado = rawPesoRet > 50 ? parseFloat((rawPesoRet / 1000).toFixed(2)) : parseFloat(rawPesoRet.toFixed(2));

            trips.push({
                viaje: t.viaje,
                placa: t.placa,
                ruta: t.ruta,
                pesoMaxTn: pesoCalculadoTn,
                galonesIda: parseFloat(galonesIda.toFixed(2)),
                galonesRetorno: parseFloat(galonesRetorno.toFixed(2)),
                pesoIda: (pesoIdaCalculado > 0 ? pesoIdaCalculado : pesoCalculadoTn),
                pesoRetorno: pesoRetornoCalculado,
                totalGalones: totalGal,
                totalGasto: totalCost
            });
        });
    });

    console.log(`✅ Procesados exitosamente ${trips.length} viajes sin errores.`);
    console.log("Muestra de viaje procesado:", trips[0]);

    await conn.end();
}

testAnalisisEndpoint().catch(console.error);
