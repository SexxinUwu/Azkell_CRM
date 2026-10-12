const mysql = require('mysql2/promise');
const express = require('express');
const http = require('http');
require('dotenv').config();

const combustibleRoutes = require('../routes/combustible');

async function testFrontendFilter() {
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

    const res = await fetch(`http://127.0.0.1:${port}/api/combustible/analisis-viajes?modulo=marsisa`);
    const data = await res.json();
    const trips = data.trips || [];

    // EXACT FRONTEND FILTER LOGIC FROM logica.js:
    const dateFrom = '2026-09-24';
    const dateTo = '2026-10-01';
    const fState = {
        placas: new Set(),
        carretas: new Set(),
        rutas: new Set(),
        choferes: new Set(),
        motores: new Set(),
        pesos: new Set(),
        combustible: 'D2',
        anio: 'ALL',
        orden: 'trip_desc'
    };

    console.log("Total trips raw from backend:", trips.length);

    let matchDateCount = 0;
    let matchFuelCount = 0;
    let matchAllCount = 0;

    const matchingTrips = [];
    const rejectedTrips = [];

    trips.forEach(t => {
        let passDate = true;
        let passFuel = true;

        // Date filter
        if (dateFrom || dateTo) {
            const dInicio = (t.fechaInicio && t.fechaInicio !== 'N/D') ? t.fechaInicio.slice(0, 10) : '';
            const dFin = (t.fechaFin && t.fechaFin !== 'N/D') ? t.fechaFin.slice(0, 10) : '';
            const tripMin = dInicio || dFin;
            const tripMax = dFin || dInicio;

            if (!tripMin && !tripMax) passDate = false;
            else if (dateFrom && dateTo && (tripMax < dateFrom || tripMin > dateTo)) passDate = false;
            else if (dateFrom && !dateTo && tripMax < dateFrom) passDate = false;
            else if (!dateFrom && dateTo && tripMin > dateTo) passDate = false;
        }

        if (passDate) matchDateCount++;

        // Fuel filter:
        if (fState.combustible !== 'ALL') {
            const hasFuel = (t.vouchers || []).some(v => !v.esPuntoPartida && v.producto === fState.combustible);
            if (!hasFuel) passFuel = false;
        }

        if (passFuel) matchFuelCount++;

        if (passDate && passFuel) {
            matchAllCount++;
            matchingTrips.push(t);
        } else if (passDate && !passFuel) {
            rejectedTrips.push(t);
        }
    });

    console.log("Trips que pasan filtro de FECHA (2026-09-24 a 2026-10-01):", matchDateCount);
    console.log("Trips que pasan filtro de COMBUSTIBLE (v.producto === 'D2'):", matchFuelCount);
    console.log("Trips que pasan AMBOS filtros:", matchAllCount);

    console.log("\n=== RECHAZADOS POR FILTRO DE COMBUSTIBLE A PESAR DE ESTAR EN LA FECHA ===");
    console.log("Cantidad rechazados por combustible:", rejectedTrips.length);
    if (rejectedTrips.length > 0) {
        console.log("Muestra de 10 rechazados por combustible:");
        rejectedTrips.slice(0, 10).forEach(t => {
            console.log({
                viaje: t.viaje,
                placa: t.placa,
                fechaInicio: t.fechaInicio,
                fechaFin: t.fechaFin,
                productosEnVouchers: (t.vouchers || []).map(v => ({ id: v.id, prod: v.producto, esPartida: v.esPuntoPartida }))
            });
        });
    }

    console.log("\n=== VIAJES QUE SÍ PASARON AMBOS ===");
    matchingTrips.forEach(t => {
        console.log({
            viaje: t.viaje,
            placa: t.placa,
            fechaInicio: t.fechaInicio,
            fechaFin: t.fechaFin,
            vouchers: (t.vouchers || []).map(v => v.producto)
        });
    });

    server.close();
    await pool.end();
}

testFrontendFilter();
