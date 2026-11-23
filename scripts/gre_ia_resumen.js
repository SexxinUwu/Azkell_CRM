'use strict';
// Resume las correcciones que hacen las personas a la lectura de guías (XML o IA), por empresa.
// Muestra en qué campos se equivoca más el lector y ejemplos «IA → final», para ajustar sus instrucciones (services/gre_lectura.js).
// Solo lee (SELECT). Uso: node scripts/gre_ia_resumen.js [--solo <slug>] [--fuente IA|XML] [--ejemplos 5]
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const args = process.argv.slice(2);
const opcion = (n, def) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const EMPRESAS = opcion('--solo', null) ? [opcion('--solo')] : ['marsisa', 'rosymarperu', 'yoguitransport', 'trahesa'];
const FUENTE = opcion('--fuente', 'IA').toUpperCase();
const EJEMPLOS = Math.max(0, Number(opcion('--ejemplos', 5)) || 0);
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

async function resumir(slug) {
    const c = await mysql.createConnection({
        host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
        database: `azkell_tenant_${slug}`, connectTimeout: 10000, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    try {
        let filas;
        try {
            [filas] = await c.query('SELECT numero_completo, modelo, campos_total, campos_corregidos, diferencias_json, DATE_FORMAT(creado_en, "%Y-%m-%d") AS dia FROM gre_lecturas_ia WHERE fuente = ? ORDER BY id DESC LIMIT 5000', [FUENTE]);
        } catch (e) {
            console.log(`\n== ${slug}: la tabla gre_lecturas_ia aún no existe (falta la migración 10_gre_lecturas_ia).`);
            return;
        }
        if (!filas.length) { console.log(`\n== ${slug}: todavía no hay guías leídas con ${FUENTE} registradas.`); return; }
        const sinCambios = filas.filter(f => f.campos_corregidos === 0).length;
        const total = filas.reduce((s, f) => s + f.campos_total, 0);
        const corr = filas.reduce((s, f) => s + f.campos_corregidos, 0);
        console.log(`\n== ${slug} · fuente ${FUENTE} · ${filas.length} guías (${filas[filas.length - 1].dia} a ${filas[0].dia})`);
        console.log(`Guías confirmadas sin cambios: ${sinCambios} (${pct(sinCambios, filas.length)}) · campos corregidos: ${corr} de ${total} (${pct(corr, total)})`);

        const porCampo = new Map();
        const porModelo = new Map();
        for (const f of filas) {
            const m = porModelo.get(f.modelo || '(sin dato)') || { guias: 0, sinCambios: 0 };
            m.guias++; if (f.campos_corregidos === 0) m.sinCambios++;
            porModelo.set(f.modelo || '(sin dato)', m);
            let difs = [];
            try { difs = JSON.parse(f.diferencias_json || '[]'); } catch (e) { difs = []; }
            for (const d of difs) {
                const x = porCampo.get(d.campo) || { veces: 0, ejemplos: [] };
                x.veces++;
                if (x.ejemplos.length < EJEMPLOS) x.ejemplos.push(`${f.numero_completo}: ${d.ia ?? '(vacío)'} → ${d.final ?? '(vacío)'}`);
                porCampo.set(d.campo, x);
            }
        }
        console.log('\nCampos más corregidos:');
        console.table([...porCampo.entries()].sort((a, b) => b[1].veces - a[1].veces).map(([campo, x]) => ({ campo, veces: x.veces, '% de guías': pct(x.veces, filas.length) })));
        if (EJEMPLOS) {
            for (const [campo, x] of [...porCampo.entries()].sort((a, b) => b[1].veces - a[1].veces).slice(0, 8)) {
                console.log(`  ${campo}:`); x.ejemplos.forEach(e => console.log(`    ${e}`));
            }
        }
        console.log('\nPor modelo:');
        console.table([...porModelo.entries()].map(([modelo, m]) => ({ modelo, guias: m.guias, 'sin cambios': pct(m.sinCambios, m.guias) })));
    } finally { await c.end(); }
}

(async () => {
    for (const slug of EMPRESAS) {
        try { await resumir(slug); } catch (e) { console.log(`\n== ${slug}: no se pudo consultar (${e.code || e.message})`); }
    }
})();
