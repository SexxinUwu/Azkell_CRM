const express = require('express');
const http = require('http');
const mysql = require('mysql2/promise');
require('dotenv').config();

const combustibleRoutes = require('../routes/combustible');

async function testAnalisisEndpoint() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || '82.39.109.226',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: 'azkell_tenant_marsisa',
        port: process.env.DB_PORT || 3306
    });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.db = pool;
        req.tenantSlug = 'marsisa';
        next();
    });

    const router = combustibleRoutes();
    app.use('/api/combustible', router);

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;

    const url = `http://127.0.0.1:${port}/api/combustible/analisis-viajes?modulo=marsisa`;
    console.log("Haciendo fetch a:", url);
    const res = await fetch(url);
    const data = await res.json();

    console.log("Status:", res.status);
    console.log("Trips obtenidos:", data.trips ? data.trips.length : 0);

    // Let's filter the trips exactly like logica.js does for date 24/09/2026 to 01/10/2026 and fuel D2
    const dateFrom = '2026-09-24';
    const dateTo = '2026-10-01';
    const fuelFilter = 'D2';

    const trips = data.trips || [];

    const filtered = trips.filter(t => {
        // Date range filter
        if (dateFrom || dateTo) {
            const dInicio = (t.fechaInicio && t.fechaInicio !== 'N/D') ? t.fechaInicio.slice(0, 10) : '';
            const dFin = (t.fechaFin && t.fechaFin !== 'N/D') ? t.fechaFin.slice(0, 10) : '';
            const tripMin = dInicio || dFin;
            const tripMax = dFin || dInicio;

            if (!tripMin && !tripMax) return false;

            if (dateFrom && dateTo) {
                if (tripMax < dateFrom || tripMin > dateTo) return false;
            } else if (dateFrom) {
                if (tripMax < dateFrom) return false;
            } else if (dateTo) {
                if (tripMin > dateTo) return false;
            }
        }

        if (fuelFilter !== 'ALL') {
            const hasFuel = (t.vouchers || []).some(v => !v.esPuntoPartida && (v.producto === fuelFilter || (v.producto || '').includes(fuelFilter) || (fuelFilter === 'D2' && (v.producto || '').toLowerCase().includes('diésel')) || (fuelFilter === 'D2' && (v.producto || '').toLowerCase().includes('diesel'))));
            if (!hasFuel) return false;
        }

        return true;
    });

    console.log(`\nTrips filtrados entre ${dateFrom} y ${dateTo} (Combustible ${fuelFilter}):`, filtered.length);

    console.log("\nMuestra de los primeros 5 viajes filtrados:");
    filtered.slice(0, 5).forEach(t => {
        console.log({
            viaje: t.viaje,
            placa: t.placa,
            fechaInicio: t.fechaInicio,
            fechaFin: t.fechaFin,
            vouchersCount: t.vouchers ? t.vouchers.length : 0,
            productos: (t.vouchers || []).map(v => v.producto)
        });
    });

    // Check why the user only saw #SIN-VIAJE
    console.log("\nRevisando viajes con fechas alrededor de septiembre/octubre 2026 en data.trips:");
    const sep2026 = trips.filter(t => (t.fechaFin && t.fechaFin.includes('2026-09')) || (t.fechaInicio && t.fechaInicio.includes('2026-09')) || (t.fechaFin && t.fechaFin.includes('2026-10')));
    console.log("Viajes con fechas en Sep/Oct 2026:", sep2026.length);

    if (sep2026.length > 0) {
        console.log("Muestra de sep2026 (primeros 5):");
        sep2026.slice(0, 5).forEach(t => {
            console.log({
                viaje: t.viaje,
                placa: t.placa,
                fechaInicio: t.fechaInicio,
                fechaFin: t.fechaFin,
                fuelStatsKeys: Object.keys(t.fuelStats || {}),
                vouchers: (t.vouchers || []).map(v => ({ id: v.id, fecha: v.fecha, producto: v.producto, esPuntoPartida: v.esPuntoPartida }))
            });
        });
    }

    server.close();
    await pool.end();
}

testAnalisisEndpoint();
