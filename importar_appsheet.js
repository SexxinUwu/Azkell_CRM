require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const csv = require('csv-parser');

// =========================================================================
// CONFIGURACIÓN DE NOMBRES DE COLUMNAS (Ajusta esto según tus CSV)
// =========================================================================

const COLUMNAS = {
    // 1. RAMPAS (taller_rampas)
    RAMPAS: {
        id_propio: 'ID',
        rampa: 'Rampa',
        placa: 'Placa',
        km: 'Kilometraje',
        fecha_ingreso: 'Fecha Ingreso',
        hora_ingreso: 'Hora Ingreso',
        fecha_salida: 'Fecha Salida',
        hora_salida: 'Hora Salida',
        situacion: 'Situacion',
        observaciones: 'Observaciones',
        estado: 'Estado' // ej: "Activo" o "Liberado"
    },
    // 2. ÓRDENES (ordenes_trabajo)
    ORDENES: {
        id_propio: 'ID_OT', // El número (ej. 1, 2, 105...)
        id_padre_rampa: 'ID_Rampa', // Apunta al ID de la rampa
        fecha_ingreso: 'Fecha Ingreso', // Para sacar el año (2025, 2026...)
        placa: 'Placa',
        estado: 'Estado', // ej: "Pendiente", "En Proceso", "Finalizado", "Aprobada"
        tipo: 'Tipo',
        subtipo: 'SubTipo',
        supervisor: 'Supervisor'
    },
    // 3. TRABAJOS (trabajos_ot)
    TRABAJOS: {
        id_propio: 'ID_Trabajo', // El número
        id_padre_ot: 'ID_OT', // Apunta a la OT
        fecha_trabajo: 'Fecha',
        tecnico: 'Tecnico',
        trabajo_realizado: 'Trabajo Realizado',
        costo: 'Costo'
    },
    // 4. MATERIALES (salidas_inv)
    MATERIALES: {
        id_propio: 'ID_Material',
        id_padre_ot: 'ID_OT',
        descripcion: 'Descripcion',
        cantidad: 'Cantidad',
        costo_unitario: 'Costo',
        fecha: 'Fecha'
    },
    // 5. INSPECCIONES (inspecciones)
    INSPECCIONES: {
        id_padre_ot: 'ID_OT',
        placa: 'Placa',
        categoria: 'Categoria',
        fecha: 'Fecha'
        // ... (resto de columnas se meten al json)
    }
};

// Diccionarios en Memoria
const DicRampas = {}; // AppSheet Rampa ID -> MySQL Rampa ID
const DicOTs = {};    // AppSheet OT ID -> 'OT-YYYY-NNNN'

// Helper para rellenar con ceros (ej. 5 -> "0005")
const padZeros = (num, length = 4) => String(num).padStart(length, '0');

// Función para extraer año de una fecha (ej. "2025-06-12" o "12/06/2025")
const getYearFromDate = (dateStr) => {
    if (!dateStr) return new Date().getFullYear();
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.getFullYear();
    // Intento manual (si es DD/MM/YYYY)
    const parts = String(dateStr).split('/');
    if (parts.length === 3) return parseInt(parts[2], 10);
    return new Date().getFullYear();
};

const leerCSV = (filePath) => {
    return new Promise((resolve, reject) => {
        const results = [];
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️  Archivo no encontrado: ${filePath} (Saltando...)`);
            return resolve([]);
        }
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
};

async function ejecutarImportacion() {
    console.log("==================================================");
    console.log("🚀 INICIANDO IMPORTACIÓN DESDE APPSHEET");
    console.log("==================================================");

    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    });

    try {
        // ==========================================
        // 1. RAMPAS
        // ==========================================
        console.log("\n[1/5] Importando Rampas...");
        const rampas = await leerCSV('rampas.csv');
        for (const row of rampas) {
            const oldId = row[COLUMNAS.RAMPAS.id_propio];
            const rampaNum = row[COLUMNAS.RAMPAS.rampa] || 1;
            const placa = row[COLUMNAS.RAMPAS.placa] || 'SIN-PLACA';
            const estado = row[COLUMNAS.RAMPAS.estado] || 'Liberado'; // Asumimos historico liberado
            
            const [result] = await db.query(
                `INSERT INTO taller_rampas (rampa, placa, km, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs, estado)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [rampaNum, placa, row[COLUMNAS.RAMPAS.km], row[COLUMNAS.RAMPAS.fecha_ingreso], row[COLUMNAS.RAMPAS.hora_ingreso], row[COLUMNAS.RAMPAS.fecha_salida], row[COLUMNAS.RAMPAS.hora_salida], row[COLUMNAS.RAMPAS.situacion], row[COLUMNAS.RAMPAS.observaciones], estado]
            );
            DicRampas[oldId] = result.insertId;
        }
        console.log(`✅ ${rampas.length} Rampas importadas.`);

        // ==========================================
        // 2. ÓRDENES DE TRABAJO (OTs)
        // ==========================================
        console.log("\n[2/5] Importando Órdenes de Trabajo...");
        const ordenes = await leerCSV('ordenes.csv');
        for (const row of ordenes) {
            const oldId = row[COLUMNAS.ORDENES.id_propio];
            const oldRampaId = row[COLUMNAS.ORDENES.id_padre_rampa];
            const newRampaId = DicRampas[oldRampaId] || null;
            
            const fechaStr = row[COLUMNAS.ORDENES.fecha_ingreso];
            const anio = getYearFromDate(fechaStr);
            
            // Generar correlativo: OT-YYYY-NNNN
            const numOt = parseInt(oldId, 10) || 1; 
            const newTicket = `OT-${anio}-${padZeros(numOt)}`;
            
            const placa = row[COLUMNAS.ORDENES.placa] || 'SIN-PLACA';
            const estado = row[COLUMNAS.ORDENES.estado] || 'Finalizado';
            
            const detallesJson = JSON.stringify({
                tipo_ot: row[COLUMNAS.ORDENES.tipo],
                sub_tipo: row[COLUMNAS.ORDENES.subtipo],
                supervisor: row[COLUMNAS.ORDENES.supervisor],
                origen: 'AppSheet'
            });

            await db.query(
                `INSERT INTO ordenes_trabajo (ticket_entrada, id_ot, placa, estado, id_rampa, detalles_json, fecha_ingreso)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [newTicket, newTicket, placa, estado, newRampaId, detallesJson, fechaStr ? new Date(fechaStr) : new Date()]
            );
            DicOTs[oldId] = newTicket;
        }
        console.log(`✅ ${ordenes.length} Órdenes importadas.`);

        // ==========================================
        // 3. TRABAJOS OT
        // ==========================================
        console.log("\n[3/5] Importando Trabajos Asignados...");
        const trabajos = await leerCSV('trabajos.csv');
        for (const row of trabajos) {
            const oldId = row[COLUMNAS.TRABAJOS.id_propio];
            const oldOtId = row[COLUMNAS.TRABAJOS.id_padre_ot];
            const ticketVisita = DicOTs[oldOtId];
            if (!ticketVisita) continue; // Si no hay OT padre, salta
            
            const fechaStr = row[COLUMNAS.TRABAJOS.fecha_trabajo];
            const anio = getYearFromDate(fechaStr);
            const numTr = parseInt(oldId, 10) || 1;
            const newIdOt = `TR-${anio}-${padZeros(numTr)}`;

            const detallesJson = JSON.stringify({
                personal: row[COLUMNAS.TRABAJOS.tecnico],
                costo: row[COLUMNAS.TRABAJOS.costo] || 0
            });

            await db.query(
                `INSERT INTO trabajos_ot (id_ot, ticket_visita, estado, trabajo_realizado, tecnico, fecha_trabajo, detalles_json)
                 VALUES (?, ?, 'Aprobado', ?, ?, ?, ?)`,
                [newIdOt, ticketVisita, row[COLUMNAS.TRABAJOS.trabajo_realizado], row[COLUMNAS.TRABAJOS.tecnico], fechaStr ? new Date(fechaStr) : null, detallesJson]
            );
        }
        console.log(`✅ ${trabajos.length} Trabajos importados.`);

        // ==========================================
        // 4. MATERIALES (Salidas)
        // ==========================================
        console.log("\n[4/5] Importando Materiales...");
        const materiales = await leerCSV('materiales.csv');
        let contMat = 0;
        for (const row of materiales) {
            const oldOtId = row[COLUMNAS.MATERIALES.id_padre_ot];
            const ticketOt = DicOTs[oldOtId];
            if (!ticketOt) continue;
            
            const costoUnit = parseFloat(row[COLUMNAS.MATERIALES.costo_unitario]) || 0;
            const cant = parseFloat(row[COLUMNAS.MATERIALES.cantidad]) || 0;
            const importe = costoUnit * cant;

            // Creamos una salida por fila para simplificar
            const idSalida = `SA-HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            await db.query(
                `INSERT INTO salidas_inv (id, fecha, tipo_destino, estado, total_pen, ticket_ot, observaciones)
                 VALUES (?, ?, 'Vehiculo', 'Despachado', ?, ?, 'Migracion AppSheet')`,
                [idSalida, row[COLUMNAS.MATERIALES.fecha] ? new Date(row[COLUMNAS.MATERIALES.fecha]) : new Date(), importe, ticketOt]
            );
            await db.query(
                `INSERT INTO detalle_salidas_inv (salida_id, descripcion, cantidad, costo_unitario, importe)
                 VALUES (?, ?, ?, ?, ?)`,
                [idSalida, row[COLUMNAS.MATERIALES.descripcion], cant, costoUnit, importe]
            );
            contMat++;
        }
        console.log(`✅ ${contMat} Salidas de materiales importadas.`);

        // ==========================================
        // 5. INSPECCIONES
        // ==========================================
        console.log("\n[5/5] Importando Inspecciones...");
        const inspecciones = await leerCSV('inspecciones.csv');
        let contInsp = 0;
        for (const row of inspecciones) {
            const oldOtId = row[COLUMNAS.INSPECCIONES.id_padre_ot];
            const ticketOt = DicOTs[oldOtId];
            if (!ticketOt) continue;

            const datosJson = JSON.stringify(row); // Guardamos toda la info de la fila como JSON

            await db.query(
                `INSERT INTO inspecciones (placa, categoria, estado, id_ot, datos_json, fecha_ingreso)
                 VALUES (?, ?, 'Completado', ?, ?, ?)`,
                [row[COLUMNAS.INSPECCIONES.placa], row[COLUMNAS.INSPECCIONES.categoria], ticketOt, datosJson, row[COLUMNAS.INSPECCIONES.fecha] ? new Date(row[COLUMNAS.INSPECCIONES.fecha]) : new Date()]
            );
            contInsp++;
        }
        console.log(`✅ ${contInsp} Inspecciones importadas.`);

        console.log("==================================================");
        console.log("🎉 IMPORTACIÓN FINALIZADA CORRECTAMENTE 🎉");
        console.log("==================================================");

    } catch (err) {
        console.error("❌ ERROR DURANTE LA IMPORTACIÓN:");
        console.error(err);
    } finally {
        await db.end();
    }
}

ejecutarImportacion();
