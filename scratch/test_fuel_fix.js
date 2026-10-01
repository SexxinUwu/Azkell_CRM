const mysql = require('mysql2/promise');
require('dotenv').config();

async function testFix() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '82.39.109.226',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: 'azkell_tenant_marsisa',
        port: process.env.DB_PORT || 3306
    });

    const [rows] = await conn.query(`
        SELECT 
            id, DATE_FORMAT(fecha, '%Y-%m-%d %H:%i:%s') AS fecha, estado, correlativo, viaje, vehiculo, conductor, ruta,
            estacion, proveedor, tipo_combustible, kilometraje, peso_tn, galones,
            importe, numero_comprobante, tipo
        FROM marsisa_combustible_vales 
        WHERE estado != 'ANULADO'
        ORDER BY fecha ASC, id ASC
    `);

    console.log("Total vales leídos:", rows.length);

    // Agrupar
    const vehiculoMap = {};
    rows.forEach(v => {
        const vehKey = String(v.vehiculo || 'SIN-PLACA').toUpperCase().trim();
        let rawTrip = String(v.viaje || '').trim();
        let tripKey = rawTrip;
        if (!tripKey || tripKey === '0' || tripKey.toUpperCase() === 'SIN-VIAJE') {
            const vYearMonth = (v.fecha && v.fecha.length >= 7) ? v.fecha.slice(0, 7) : 'OTROS';
            tripKey = `SIN-VIAJE (${vYearMonth})`;
        }

        const rawFuel = String(v.tipo_combustible || 'D2').trim();
        let fuelCategory = 'D2';
        if (/urea|adblue|def/i.test(rawFuel)) {
            fuelCategory = 'UREA';
        } else if (/gasohol|gasolina|gnv|glp/i.test(rawFuel)) {
            fuelCategory = rawFuel.toUpperCase();
        } else {
            fuelCategory = 'D2';
        }

        if (!vehiculoMap[vehKey]) vehiculoMap[vehKey] = {};
        if (!vehiculoMap[vehKey][tripKey]) {
            vehiculoMap[vehKey][tripKey] = {
                viaje: tripKey,
                placa: vehKey,
                carreta: v.carreta || '',
                ruta: v.ruta || 'Sin Ruta',
                vouchers: []
            };
        }

        vehiculoMap[vehKey][tripKey].vouchers.push({
            id: v.id,
            fecha: v.fecha,
            producto: fuelCategory,
            producto_nombre: rawFuel,
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
            return t;
        }).sort((a, b) => {
            if (a.viaje.startsWith('SIN-VIAJE')) return 1;
            if (b.viaje.startsWith('SIN-VIAJE')) return -1;
            return (a.viaje || '').localeCompare(b.viaje || '', undefined, { numeric: true });
        });

        let lastVoucherGeneral = null;
        const lastVoucherByFuel = {};

        vehTrips.forEach(t => {
            const firstVCurrent = t.vouchers[0] || {};
            const lastVCurrent = t.vouchers[t.vouchers.length - 1] || {};
            const totalGal = t.vouchers.reduce((s, x) => s + x.galones, 0);
            const totalCost = t.vouchers.reduce((s, x) => s + x.importe, 0);

            const kmFin = lastVCurrent.odometro || 0;
            const fechaFin = lastVCurrent.fecha || 'N/D';

            const fuelStats = {};
            const fuelsInTrip = new Set(t.vouchers.map(v => v.producto));

            fuelsInTrip.forEach(fuelType => {
                const fuelVouchers = t.vouchers.filter(v => v.producto === fuelType);
                const firstVFuel = fuelVouchers[0] || {};
                const lastVFuel = fuelVouchers[fuelVouchers.length - 1] || {};
                const prevVFuel = lastVoucherByFuel[fuelType];

                const validPrevFuel = Boolean(prevVFuel);
                const fKmFin = lastVFuel.odometro || 0;
                const fFechaFin = lastVFuel.fecha || 'N/D';
                const fKmInicio = validPrevFuel ? (prevVFuel.odometro || 0) : (firstVFuel.odometro || 0);
                const fFechaInicio = validPrevFuel ? (prevVFuel.fecha || 'N/D') : (firstVFuel.fecha || 'N/D');
                const fRecorrido = (fKmFin > fKmInicio && fKmInicio > 0) ? (fKmFin - fKmInicio) : 0;
                const fGalones = fuelVouchers.reduce((s, x) => s + x.galones, 0);
                const fGasto = fuelVouchers.reduce((s, x) => s + x.importe, 0);
                const fRendimiento = (fGalones > 0 && fRecorrido > 0) ? (fRecorrido / fGalones) : 0;

                fuelStats[fuelType] = {
                    kmInicio: fKmInicio,
                    kmFin: fKmFin,
                    fechaInicio: fFechaInicio,
                    fechaFin: fFechaFin,
                    recorridoKm: fRecorrido,
                    totalGalones: fGalones,
                    totalGasto: fGasto,
                    rendimiento: fRendimiento,
                    vouchers: fuelVouchers
                };

                lastVoucherByFuel[fuelType] = { ...lastVFuel, viaje: t.viaje };
            });

            const validPrevGen = Boolean(lastVoucherGeneral);
            const kmInicio = validPrevGen ? (lastVoucherGeneral.odometro || 0) : (firstVCurrent.odometro || 0);
            const fechaInicio = validPrevGen ? (lastVoucherGeneral.fecha || 'N/D') : (firstVCurrent.fecha || 'N/D');
            const recorridoKm = (kmFin > kmInicio && kmInicio > 0) ? (kmFin - kmInicio) : 0;
            const rendimiento = (totalGal > 0 && recorridoKm > 0) ? (recorridoKm / totalGal) : 0;

            t.kmInicio = kmInicio;
            t.kmFin = kmFin;
            t.fechaInicio = fechaInicio;
            t.fechaFin = fechaFin;
            t.recorridoKm = recorridoKm;
            t.totalGalones = totalGal;
            t.totalGasto = totalCost;
            t.rendimiento = rendimiento;
            t.fuelStats = fuelStats;

            trips.push(t);
            lastVoucherGeneral = { ...lastVCurrent, viaje: t.viaje };
        });
    });

    console.log("Total trips procesados:", trips.length);

    // Ahora simular filtro de fecha 2026-09-24 a 2026-10-01 con D2
    const dateFrom = '2026-09-24';
    const dateTo = '2026-10-01';
    const fuelFilter = 'D2';

    const filtered = trips.filter(t => {
        if (dateFrom || dateTo) {
            const dInicio = (t.fechaInicio && t.fechaInicio !== 'N/D') ? t.fechaInicio.slice(0, 10) : '';
            const dFin = (t.fechaFin && t.fechaFin !== 'N/D') ? t.fechaFin.slice(0, 10) : '';
            const tripMin = dInicio || dFin;
            const tripMax = dFin || dInicio;

            if (!tripMin && !tripMax) return false;
            if (dateFrom && dateTo && (tripMax < dateFrom || tripMin > dateTo)) return false;
            if (dateFrom && !dateTo && tripMax < dateFrom) return false;
            if (!dateFrom && dateTo && tripMin > dateTo) return false;
        }

        if (fuelFilter !== 'ALL') {
            const hasFuel = (t.vouchers || []).some(v => v.producto === fuelFilter);
            if (!hasFuel) return false;
        }

        return true;
    });

    console.log(`\n✅ CON EL FIX: Total viajes encontrados entre ${dateFrom} y ${dateTo} (D2):`, filtered.length);
    console.table(filtered.map(t => ({
        viaje: t.viaje,
        placa: t.placa,
        fechaInicio: t.fechaInicio,
        fechaFin: t.fechaFin,
        recorridoKm: t.recorridoKm,
        totalGalones: t.totalGalones,
        totalGasto: t.totalGasto,
        valesCount: t.vouchers.length
    })));

    await conn.end();
}

testFix();
