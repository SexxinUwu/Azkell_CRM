'use strict';
// Carga las llantas de unidades que tienen inspecciones pero ninguna llanta instalada en el ciclo de vida, como provisionales
// (PROV-placa-posición), a partir de la ÚLTIMA inspección de cada placa. No toca placas que ya tienen alguna llanta instalada
// ni placas que ya no están en la flota (tabla placas).
//
//   node scripts/cargar_provisionales_desde_inspecciones.js --empresa marsisa            (simulación: no escribe nada)
//   node scripts/cargar_provisionales_desde_inspecciones.js --empresa marsisa --aplicar  (respalda las 3 tablas y escribe en una transacción)
//
// Reglas: una sola transacción con conteo exacto (si lo creado no coincide con lo esperado, ROLLBACK); respaldo con mysqldump antes de escribir.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { asegurarLlantasProvisionales, remanenteDeCocadas } = require('../services/neumaticos_provisionales');

const arg = n => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? null : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const empresa = String(arg('empresa') || '').trim();
const aplicar = !!arg('aplicar');
if (!/^[a-z0-9_]+$/.test(empresa)) { console.error('Indica --empresa <slug> (marsisa, rosymarperu, …)'); process.exit(1); }
const baseDatos = `azkell_tenant_${empresa}`;

const MYSQLDUMP = process.env.MYSQLDUMP || 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe';
const CARPETA_RESPALDOS = process.env.CARPETA_RESPALDOS || path.join(process.env.USERPROFILE || '.', 'Documents', 'respaldos-azkell');

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: baseDatos,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    try {
        // Placas con inspecciones y sin ninguna llanta instalada
        const [placas] = await conn.query(`
            SELECT DISTINCT UPPER(TRIM(i.placa)) AS placa FROM neumaticos_inspecciones i
            WHERE TRIM(i.placa) <> '' AND EXISTS (SELECT 1 FROM placas p WHERE UPPER(TRIM(p.placa)) = UPPER(TRIM(i.placa)))
              AND NOT EXISTS (SELECT 1 FROM neumaticos_instalaciones n WHERE UPPER(TRIM(n.placa)) = UPPER(TRIM(i.placa)) AND n.fecha_out IS NULL)
            ORDER BY placa`);

        const plan = [];
        for (const { placa } of placas) {
            // Última inspección: la fecha más reciente (y, si hay dos el mismo día, la creada después)
            const [ult] = await conn.query(
                `SELECT id_inspeccion, DATE_FORMAT(fecha_inspeccion, '%Y-%m-%d') AS fecha, km_vehiculo FROM neumaticos_inspecciones
                 WHERE UPPER(TRIM(placa)) = ? ORDER BY fecha_inspeccion DESC, created_at DESC, id_inspeccion DESC LIMIT 1`, [placa]);
            if (!ult.length) continue;
            const [det] = await conn.query(
                `SELECT posicion, marca, modelo, medida, r1, r2, r3, r4, remanente_promedio FROM neumaticos_inspecciones_det
                 WHERE id_inspeccion = ? ORDER BY id`, [ult[0].id_inspeccion]);
            // Una posición repetida en la misma inspección: queda la última
            const porPosicion = new Map();
            det.forEach(d => porPosicion.set(String(d.posicion || '').trim().toUpperCase(), d));
            const items = [...porPosicion.entries()].filter(([pos]) => pos).map(([pos, d]) => ({
                posicion: pos, marca: d.marca, modelo: d.modelo, medida: d.medida,
                remanente: Number(d.remanente_promedio) > 0 ? Number(d.remanente_promedio) : remanenteDeCocadas(d),
            }));
            if (items.length) plan.push({ placa, id: ult[0].id_inspeccion, fecha: ult[0].fecha, km: Number(ult[0].km_vehiculo) || 0, items });
        }

        const esperadas = plan.reduce((s, p) => s + p.items.length, 0);
        console.log(`${empresa}: ${plan.length} placas sin llantas instaladas -> ${esperadas} llantas provisionales por crear`);
        plan.slice(0, 8).forEach(p => console.log(`  ${p.placa}  ${p.items.length} llantas  (inspección ${p.id}, ${p.fecha})`));
        if (plan.length > 8) console.log(`  … y ${plan.length - 8} placas más`);
        if (!aplicar) { console.log('Simulación: no se escribió nada. Usa --aplicar para cargar.'); return; }
        if (!esperadas) { console.log('Nada que cargar.'); return; }

        // Respaldo de las tres tablas antes de escribir
        fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
        const archivo = path.join(CARPETA_RESPALDOS, `${empresa}_neumaticos_antes_provisionales_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
        execFileSync(MYSQLDUMP, ['-h', process.env.DB_HOST, '-P', String(process.env.DB_PORT || 3306), '-u', process.env.DB_USER, '--single-transaction', '--no-tablespaces',
            '--set-gtid-purged=OFF', '--skip-lock-tables', '--result-file', archivo, baseDatos, 'neumaticos_hoja_vida', 'neumaticos_instalaciones', 'neumaticos_movimientos'],
        { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD } });
        console.log(`Respaldo: ${archivo} (${fs.statSync(archivo).size} bytes)`);

        await conn.beginTransaction();
        try {
            let creadas = 0;
            for (const p of plan) {
                const r = await asegurarLlantasProvisionales(conn, { placa: p.placa, fecha: p.fecha, km: p.km, idInspeccion: p.id, items: p.items });
                creadas += r.creadas;
            }
            if (creadas !== esperadas) throw new Error(`Se crearon ${creadas} y se esperaban ${esperadas}: se revierte todo.`);
            const [[c]] = await conn.query(`SELECT COUNT(*) AS n FROM neumaticos_instalaciones WHERE usuario = 'Carga inicial desde inspección' AND created_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)`);
            console.log(`Creadas ${creadas} llantas (instalaciones recientes de esta carga: ${c.n}).`);
            await conn.commit();
            console.log('COMMIT hecho.');
        } catch (e) {
            await conn.rollback();
            console.error('ROLLBACK:', e.message);
            process.exitCode = 1;
        }
    } finally {
        await conn.end();
    }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
