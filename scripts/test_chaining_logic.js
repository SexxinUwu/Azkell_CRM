const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'azkell_tenant_marsisa'
    });

    const [rows] = await conn.query(
        "SELECT id, fecha, estado, correlativo, viaje, vehiculo, conductor, ruta, estacion, proveedor, tipo_combustible, kilometraje, peso_tn, galones, importe, numero_comprobante, tipo FROM combustible_vales WHERE vehiculo IN ('CLX861', 'BES829') AND estado != 'ANULADO' ORDER BY fecha ASC, id ASC"
    );

    const peruDateFmt = new Intl.DateTimeFormat('en-CA', {
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

    // Agrupar por vehiculo y viaje
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
            fechaRaw: v.fecha,
            producto: (v.tipo_combustible || 'D2').toUpperCase().trim(),
            odometro: parseFloat(v.kilometraje || 0),
            galones: parseFloat(v.galones || 0),
            importe: parseFloat(v.importe || 0),
            viaje: tripKey
        });
    });

    // Procesar cada vehículo
    ['BES829', 'CLX861'].forEach(vehKey => {
        console.log(`\n================== VEHÍCULO: ${vehKey} ==================`);
        const tripsObj = vehiculoMap[vehKey] || {};
        const vehTrips = Object.values(tripsObj).map(t => {
            t.vouchers.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.id - b.id));
            const earliestDate = t.vouchers[0]?.fecha || '';
            const latestDate = t.vouchers[t.vouchers.length - 1]?.fecha || '';
            return { ...t, earliestDate, latestDate };
        }).sort((a, b) => a.earliestDate.localeCompare(b.earliestDate));

        let lastVoucherGeneral = null;
        const lastVoucherByFuel = {};

        vehTrips.forEach(t => {
            const firstVCurrent = t.vouchers[0] || {};
            const lastVCurrent = t.vouchers[t.vouchers.length - 1] || {};

            // General
            const kmInicioGen = (lastVoucherGeneral && lastVoucherGeneral.fecha <= firstVCurrent.fecha) ? (lastVoucherGeneral.odometro || 0) : (firstVCurrent.odometro || 0);
            const fechaInicioGen = (lastVoucherGeneral && lastVoucherGeneral.fecha <= firstVCurrent.fecha) ? (lastVoucherGeneral.fecha || 'N/D') : (firstVCurrent.fecha || 'N/D');
            const kmFinGen = lastVCurrent.odometro || 0;
            const fechaFinGen = lastVCurrent.fecha || 'N/D';

            // Por combustible
            const fuelStats = {};
            const fuelsInTrip = new Set(t.vouchers.map(v => v.producto));

            fuelsInTrip.forEach(fuelType => {
                const fuelVouchers = t.vouchers.filter(v => v.producto === fuelType);
                const firstVFuel = fuelVouchers[0] || {};
                const lastVFuel = fuelVouchers[fuelVouchers.length - 1] || {};
                const prevVFuel = lastVoucherByFuel[fuelType];

                const validPrev = (prevVFuel && prevVFuel.fecha <= firstVFuel.fecha);
                const fKmInicio = validPrev ? (prevVFuel.odometro || 0) : (firstVFuel.odometro || 0);
                const fFechaInicio = validPrev ? (prevVFuel.fecha || 'N/D') : (firstVFuel.fecha || 'N/D');
                const fKmFin = lastVFuel.odometro || 0;
                const fFechaFin = lastVFuel.fecha || 'N/D';
                const fGalones = fuelVouchers.reduce((s, x) => s + x.galones, 0);

                fuelStats[fuelType] = {
                    fechaInicio: fFechaInicio,
                    fechaFin: fFechaFin,
                    kmInicio: fKmInicio,
                    kmFin: fKmFin,
                    totalGalones: fGalones
                };

                lastVoucherByFuel[fuelType] = { ...lastVFuel, viaje: t.viaje };
            });

            lastVoucherGeneral = { ...lastVCurrent, viaje: t.viaje };

            console.log(`[${t.viaje}] GENERAL -> Inicio: ${fechaInicioGen} | Fin: ${fechaFinGen} | KmIni: ${kmInicioGen} | KmFin: ${kmFinGen}`);
            if (fuelStats['D2']) {
                console.log(`       D2     -> Inicio: ${fuelStats['D2'].fechaInicio} | Fin: ${fuelStats['D2'].fechaFin} | KmIni: ${fuelStats['D2'].kmInicio} | KmFin: ${fuelStats['D2'].kmFin}`);
            }
        });
    });

    await conn.end();
}

main().catch(console.error);
