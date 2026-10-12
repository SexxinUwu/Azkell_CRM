const mysql = require('mysql2/promise');
require('dotenv').config();

async function testFullEndpoint() {
    const tdb = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'fleet_db',
        port: process.env.DB_PORT || 3306
    });

    const [rows] = await tdb.query(`
        SELECT 
            id, fecha, estado, correlativo, viaje, clase_vehiculo, vehiculo,
            conductor, ruta, estacion, tipo_combustible, proveedor,
            kilometraje, peso_tn, galones, costo_gl, tipo_pago,
            moneda, importe, numero_comprobante, tipo
        FROM combustible_vales
        WHERE estado = 'VÁLIDO'
        ORDER BY vehiculo ASC, fecha ASC
    `);

    const peruDateFmt = new Intl.DateTimeFormat('es-PE', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const formatPeruDate = (f) => {
        if (!f) return '';
        const d = new Date(f);
        if (isNaN(d.getTime())) return String(f);
        return peruDateFmt.format(d).replace(',', '');
    };

    const vehiculoMap = {};

    rows.forEach(v => {
        const vehKey = String(v.vehiculo || 'SIN-PLACA').toUpperCase().trim();
        const tripKey = String(v.viaje || 'SIN-VIAJE').trim();

        if (!vehiculoMap[vehKey]) vehiculoMap[vehKey] = {};
        if (!vehiculoMap[vehKey][tripKey]) {
            vehiculoMap[vehKey][tripKey] = {
                viaje: tripKey,
                placa: vehKey,
                ruta: v.ruta || 'Sin Ruta',
                vouchers: []
            };
        }

        vehiculoMap[vehKey][tripKey].vouchers.push({
            id: v.id,
            fecha: formatPeruDate(v.fecha),
            producto: v.tipo_combustible || 'D2',
            grifo: v.estacion || v.proveedor || 'Estación',
            odometro: parseFloat(v.kilometraje || 0),
            galones: parseFloat(v.galones || 0),
            importe: parseFloat(v.importe || 0),
            peso: parseFloat(v.peso_tn || 0),
            conductor: v.conductor || 'Sin Especificar',
            correlativo: v.correlativo || '',
            numero_comprobante: v.numero_comprobante || '',
            tipo: v.tipo || ''
        });
    });

    const trips = [];

    Object.keys(vehiculoMap).forEach(vehKey => {
        const tripsObj = vehiculoMap[vehKey];
        const vehTrips = Object.values(tripsObj).map(t => {
            t.vouchers.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.id - b.id));
            const earliestDate = t.vouchers[0]?.fecha || '';
            return { ...t, earliestDate };
        }).sort((a, b) => a.earliestDate.localeCompare(b.earliestDate));

        let lastVoucherGeneral = null;
        const lastVoucherByFuel = {};

        vehTrips.forEach((t) => {
            const firstVCurrent = t.vouchers[0] || {};
            const lastVCurrent = t.vouchers[t.vouchers.length - 1] || {};
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

            const kmFin = lastVCurrent.odometro || 0;
            const fechaFin = lastVCurrent.fecha || 'N/D';

            const fuelStats = {};
            const fuelsInTrip = new Set(t.vouchers.map(v => (v.producto || 'D2').toUpperCase()));

            fuelsInTrip.forEach(fuelType => {
                const fuelVouchers = t.vouchers.filter(v => (v.producto || 'D2').toUpperCase() === fuelType);
                const firstVFuel = fuelVouchers[0] || {};
                const lastVFuel = fuelVouchers[fuelVouchers.length - 1] || {};
                const prevVFuel = lastVoucherByFuel[fuelType];

                const validPrevFuel = (prevVFuel && prevVFuel.fecha <= (firstVFuel.fecha || ''));
                const fKmFin = lastVFuel.odometro || 0;
                const fFechaFin = lastVFuel.fecha || 'N/D';
                const fKmInicio = validPrevFuel ? (prevVFuel.odometro || 0) : (firstVFuel.odometro || 0);
                const fFechaInicio = validPrevFuel ? (prevVFuel.fecha || 'N/D') : (firstVFuel.fecha || 'N/D');
                const fRecorrido = (fKmFin > fKmInicio && fKmInicio > 0) ? (fKmFin - fKmInicio) : 0;
                const fGalones = fuelVouchers.reduce((s, x) => s + x.galones, 0);
                const fGasto = fuelVouchers.reduce((s, x) => s + x.importe, 0);
                const fRendimiento = (fGalones > 0 && fRecorrido > 0) ? (fRecorrido / fGalones) : 0;

                const fPartidaVoucher = validPrevFuel ? {
                    ...prevVFuel,
                    id: `partida_${fuelType}_${prevVFuel.id}`,
                    esPuntoPartida: true,
                    viajeOriginal: prevVFuel.viaje
                } : null;

                fuelStats[fuelType] = {
                    kmInicio: fKmInicio,
                    kmFin: fKmFin,
                    fechaInicio: fFechaInicio,
                    fechaFin: fFechaFin,
                    recorridoKm: fRecorrido,
                    totalGalones: fGalones,
                    totalGasto: fGasto,
                    rendimiento: fRendimiento,
                    voucherPartida: fPartidaVoucher,
                    vouchers: fPartidaVoucher ? [fPartidaVoucher, ...fuelVouchers] : [...fuelVouchers]
                };

                lastVoucherByFuel[fuelType] = { ...lastVFuel, viaje: t.viaje };
            });

            const validPrevGen = (lastVoucherGeneral && lastVoucherGeneral.fecha <= (firstVCurrent.fecha || ''));
            const kmInicio = validPrevGen ? (lastVoucherGeneral.odometro || 0) : (firstVCurrent.odometro || 0);
            const fechaInicio = validPrevGen ? (lastVoucherGeneral.fecha || 'N/D') : (firstVCurrent.fecha || 'N/D');
            const recorridoKm = (kmFin > kmInicio && kmInicio > 0) ? (kmFin - kmInicio) : 0;
            const rendimiento = (totalGal > 0 && recorridoKm > 0) ? (recorridoKm / totalGal) : 0;

            const genPartidaVoucher = validPrevGen ? {
                ...lastVoucherGeneral,
                id: `partida_gen_${lastVoucherGeneral.id}`,
                esPuntoPartida: true,
                viajeOriginal: lastVoucherGeneral.viaje
            } : null;

            lastVCurrent.esPuntoCierre = true;
            const modalVouchers = genPartidaVoucher ? [genPartidaVoucher, ...t.vouchers] : [...t.vouchers];
            lastVoucherGeneral = { ...lastVCurrent, viaje: t.viaje };

            trips.push({
                viaje: t.viaje,
                placa: t.placa,
                ruta: t.ruta,
                fechaInicio,
                fechaFin,
                kmInicio,
                kmFin,
                recorridoKm,
                odometroInconsistente: (kmInicio > 0 && kmFin > 0 && kmFin < kmInicio),
                pesoMaxTn: pesoCalculadoTn,
                pesoMaxKg: maxPesoRaw,
                galonesIda: parseFloat(galonesIda.toFixed(2)),
                galonesRetorno: parseFloat(galonesRetorno.toFixed(2)),
                pesoIda: (pesoIdaCalculado > 0 ? pesoIdaCalculado : pesoCalculadoTn),
                pesoRetorno: pesoRetornoCalculado,
                totalGalones: totalGal,
                totalGasto: totalCost,
                rendimiento,
                vouchers: modalVouchers,
                vouchersPropiosCount: t.vouchers.length,
                fuelStats
            });
        });
    });

    console.log(`✅ Procesamiento 100% exitoso. ${trips.length} viajes generados.`);
    await tdb.end();
}

testFullEndpoint().catch(console.error);
