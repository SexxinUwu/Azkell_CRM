require('dotenv').config();
const mysql = require('mysql2/promise');
const xlsx = require('xlsx');

// Helper para rellenar con ceros (ej. 5 -> "0005")
const padZeros = (num, length = 4) => String(num).padStart(length, '0');

// Función para extraer año de una fecha (puede venir como Date o String de Excel)
const getYearFromDate = (dateVal) => {
    if (!dateVal) return new Date().getFullYear();
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) return d.getFullYear();
    const parts = String(dateVal).split('/');
    if (parts.length === 3) return parseInt(parts[2], 10);
    return new Date().getFullYear();
};

const parseDateFromExcel = (dateVal) => {
    if (!dateVal) return null;
    if (typeof dateVal === 'number') {
        // Excel Serial Date (1900 based)
        const d = new Date((dateVal - (25567 + 1)) * 86400 * 1000);
        return d;
    }
    return new Date(dateVal);
};

async function ejecutarImportacion() {
    console.log("==================================================");
    console.log("🚀 INICIANDO IMPORTACIÓN DESDE PLANTILLA EXCEL");
    console.log("==================================================");

    const filePath = 'Plantilla_Migracion_Azkell.xlsx';
    let workbook;
    try {
        workbook = xlsx.readFile(filePath, { cellDates: true });
    } catch(e) {
        console.error(`❌ Error al leer la plantilla: No se encontró el archivo ${filePath} o está abierto por otro programa.`);
        return;
    }

    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    });

    const DicRampas = {}; // AppSheet Rampa ID -> MySQL Rampa ID
    const DicOTs = {};    // AppSheet OT ID -> 'OT-YYYY-NNNN'

    try {
        // ==========================================
        // 1. RAMPAS
        // ==========================================
        console.log("\n[1/5] Importando Rampas...");
        const rampasSheet = workbook.Sheets['1. Rampas'];
        if (rampasSheet) {
            const rampas = xlsx.utils.sheet_to_json(rampasSheet);
            for (const row of rampas) {
                const oldId = row['ID_Rampa'];
                if (!oldId) continue;
                const estado = row['Estado'] || 'Liberado'; 
                
                const [result] = await db.query(
                    `INSERT INTO taller_rampas (rampa, placa, km, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs, estado)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [row['Rampa'] || 1, row['Placa'] || 'SIN-PLACA', row['Kilometraje'], parseDateFromExcel(row['Fecha Ingreso']), row['Hora Ingreso'], parseDateFromExcel(row['Fecha Salida']), row['Hora Salida'], row['Situacion'], row['Observaciones'], estado]
                );
                DicRampas[oldId] = result.insertId;
            }
            console.log(`✅ ${rampas.length} Rampas importadas.`);
        }

        // ==========================================
        // 2. ÓRDENES DE TRABAJO (OTs)
        // ==========================================
        console.log("\n[2/5] Importando Órdenes de Trabajo...");
        const ordenesSheet = workbook.Sheets['2. Ordenes'];
        if (ordenesSheet) {
            const ordenes = xlsx.utils.sheet_to_json(ordenesSheet);
            for (const row of ordenes) {
                const oldId = row['ID_OT'];
                if (!oldId) continue;
                const oldRampaId = row['ID_Padre_Rampa'];
                const newRampaId = DicRampas[oldRampaId] || null;
                
                const fecha = parseDateFromExcel(row['Fecha Ingreso']);
                const anio = fecha ? fecha.getFullYear() : new Date().getFullYear();
                
                const numOt = parseInt(oldId, 10) || 1; 
                const newTicket = `OT-${anio}-${padZeros(numOt)}`;
                
                const detallesJson = JSON.stringify({
                    tipo_ot: row['Tipo'],
                    sub_tipo: row['SubTipo'],
                    supervisor: row['Supervisor'],
                    origen: 'Migracion Excel'
                });

                await db.query(
                    `INSERT INTO ordenes_trabajo (ticket_entrada, id_ot, placa, estado, id_rampa, detalles_json, fecha_ingreso)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [newTicket, newTicket, row['Placa'] || 'SIN-PLACA', row['Estado'] || 'Finalizado', newRampaId, detallesJson, fecha || new Date()]
                );
                DicOTs[oldId] = newTicket;
            }
            console.log(`✅ ${ordenes.length} Órdenes importadas.`);
        }

        // ==========================================
        // 3. TRABAJOS OT
        // ==========================================
        console.log("\n[3/5] Importando Trabajos Asignados...");
        const trabajosSheet = workbook.Sheets['3. Trabajos'];
        if (trabajosSheet) {
            const trabajos = xlsx.utils.sheet_to_json(trabajosSheet);
            for (const row of trabajos) {
                const oldId = row['ID_Trabajo'];
                if (!oldId) continue;
                const oldOtId = row['ID_Padre_OT'];
                const ticketVisita = DicOTs[oldOtId];
                if (!ticketVisita) continue;
                
                const fecha = parseDateFromExcel(row['Fecha Trabajo']);
                const anio = fecha ? fecha.getFullYear() : new Date().getFullYear();
                const numTr = parseInt(oldId, 10) || 1;
                const newIdOt = `TR-${anio}-${padZeros(numTr)}`;

                const detallesJson = JSON.stringify({
                    personal: row['Tecnico'],
                    costo: row['Costo'] || 0
                });

                await db.query(
                    `INSERT INTO trabajos_ot (id_ot, ticket_visita, estado, trabajo_realizado, tecnico, fecha_trabajo, detalles_json)
                     VALUES (?, ?, 'Aprobado', ?, ?, ?, ?)`,
                    [newIdOt, ticketVisita, row['Trabajo Realizado'], row['Tecnico'], fecha || null, detallesJson]
                );
            }
            console.log(`✅ ${trabajos.length} Trabajos importados.`);
        }

        // ==========================================
        // 4. MATERIALES (Salidas)
        // ==========================================
        console.log("\n[4/5] Importando Materiales...");
        const matSheet = workbook.Sheets['4. Materiales'];
        if (matSheet) {
            const materiales = xlsx.utils.sheet_to_json(matSheet);
            let contMat = 0;
            for (const row of materiales) {
                const oldOtId = row['ID_Padre_OT'];
                const ticketOt = DicOTs[oldOtId];
                if (!ticketOt) continue;
                
                const costoUnit = parseFloat(row['Costo Unitario']) || 0;
                const cant = parseFloat(row['Cantidad']) || 0;
                const importe = costoUnit * cant;
                const fecha = parseDateFromExcel(row['Fecha']);

                const idSalida = `SA-HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                await db.query(
                    `INSERT INTO salidas_inv (id, fecha, tipo_destino, estado, total_pen, ticket_ot, observaciones)
                     VALUES (?, ?, 'Vehiculo', 'Despachado', ?, ?, 'Migracion Excel')`,
                    [idSalida, fecha || new Date(), importe, ticketOt]
                );
                await db.query(
                    `INSERT INTO detalle_salidas_inv (salida_id, descripcion, cantidad, costo_unitario, importe)
                     VALUES (?, ?, ?, ?, ?)`,
                    [idSalida, row['Descripcion'], cant, costoUnit, importe]
                );
                contMat++;
            }
            console.log(`✅ ${contMat} Salidas de materiales importadas.`);
        }

        // ==========================================
        // 5. INSPECCIONES
        // ==========================================
        console.log("\n[5/5] Importando Inspecciones...");
        const inspSheet = workbook.Sheets['5. Inspecciones'];
        if (inspSheet) {
            const inspecciones = xlsx.utils.sheet_to_json(inspSheet);
            let contInsp = 0;
            for (const row of inspecciones) {
                const oldOtId = row['ID_Padre_OT'];
                const ticketOt = DicOTs[oldOtId];
                if (!ticketOt) continue;

                const fecha = parseDateFromExcel(row['Fecha']);
                const datosJson = JSON.stringify(row);

                await db.query(
                    `INSERT INTO inspecciones (placa, categoria, estado, id_ot, datos_json, fecha_ingreso)
                     VALUES (?, ?, 'Completado', ?, ?, ?)`,
                    [row['Placa'], row['Categoria'], ticketOt, datosJson, fecha || new Date()]
                );
                contInsp++;
            }
            console.log(`✅ ${contInsp} Inspecciones importadas.`);
        }

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
