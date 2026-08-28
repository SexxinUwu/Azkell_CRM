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
        "SELECT id, fecha, estado, correlativo, viaje, vehiculo, conductor, ruta, estacion, proveedor, tipo_combustible, kilometraje, peso_tn, galones, importe, numero_comprobante, tipo FROM combustible_vales WHERE vehiculo = 'CLX861' AND estado != 'ANULADO' ORDER BY fecha ASC, id ASC"
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

    const tripsObj = {};
    rows.forEach(v => {
        const tripKey = String(v.viaje || 'SIN-VIAJE').trim();
        if (!tripsObj[tripKey]) {
            tripsObj[tripKey] = {
                viaje: tripKey,
                placa: v.vehiculo,
                ruta: v.ruta || 'Sin Ruta',
                vouchers: []
            };
        }
        tripsObj[tripKey].vouchers.push({
            id: v.id,
            fecha: formatPeruDate(v.fecha),
            producto: (v.tipo_combustible || 'D2').toUpperCase().trim(),
            odometro: parseFloat(v.kilometraje || 0),
            galones: parseFloat(v.galones || 0),
            importe: parseFloat(v.importe || 0),
            peso: parseFloat(v.peso_tn || 0),
            viaje: tripKey
        });
    });

    const vehTrips = Object.values(tripsObj).map(t => {
        t.vouchers.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.id - b.id));
        const earliestDate = t.vouchers[0]?.fecha || '';
        return { ...t, earliestDate };
    }).sort((a, b) => a.earliestDate.localeCompare(b.earliestDate));

    let lastVoucherGeneral = null;
    const lastVoucherByFuel = {};
    const trips = [];

    vehTrips.forEach((t) => {
        const firstVCurrent = t.vouchers[0] || {};
        const lastVCurrent = t.vouchers[t.vouchers.length - 1] || {};
        const totalGal = t.vouchers.reduce((s, x) => s + x.galones, 0);
        const totalCost = t.vouchers.reduce((s, x) => s + x.importe, 0);

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

            fuelStats[fuelType] = {
                kmInicio: fKmInicio,
                kmFin: fKmFin,
                fechaInicio: fFechaInicio,
                fechaFin: fFechaFin,
                recorridoKm: fRecorrido,
                totalGalones: fGalones,
                totalGasto: fGasto,
                rendimiento: fRendimiento
            };

            lastVoucherByFuel[fuelType] = { ...lastVFuel, viaje: t.viaje };
        });

        const validPrevGen = (lastVoucherGeneral && lastVoucherGeneral.fecha <= (firstVCurrent.fecha || ''));
        const kmInicio = validPrevGen ? (lastVoucherGeneral.odometro || 0) : (firstVCurrent.odometro || 0);
        const fechaInicio = validPrevGen ? (lastVoucherGeneral.fecha || 'N/D') : (firstVCurrent.fecha || 'N/D');
        const recorridoKm = (kmFin > kmInicio && kmInicio > 0) ? (kmFin - kmInicio) : 0;
        const rendimiento = (totalGal > 0 && recorridoKm > 0) ? (recorridoKm / totalGal) : 0;

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
            totalGalones: totalGal,
            totalGasto: totalCost,
            rendimiento,
            fuelStats
        });
    });

    console.log("=== VIAJES DE AGOSTO 2026 PARA CLX861 (MODO GENERAL / TODOS) ===");
    trips.filter(t => t.fechaInicio >= '2026-07-28' || t.fechaFin >= '2026-08-01').forEach(t => {
        console.log(`[${t.viaje}] Inicio: ${t.fechaInicio} | Fin: ${t.fechaFin} | Gal: ${t.totalGalones.toFixed(2)} | Km: ${t.recorridoKm.toFixed(1)}`);
    });

    console.log("\n=== VIAJES DE AGOSTO 2026 PARA CLX861 (MODO D2) ===");
    trips.filter(t => t.fechaInicio >= '2026-07-28' || t.fechaFin >= '2026-08-01').forEach(t => {
        const d2 = t.fuelStats['D2'];
        if (d2) {
            console.log(`[${t.viaje}] Inicio: ${d2.fechaInicio} | Fin: ${d2.fechaFin} | Gal: ${d2.totalGalones.toFixed(2)} | Km: ${d2.recorridoKm.toFixed(1)}`);
        }
    });

    await conn.end();
}

main().catch(console.error);
