// 2026-11-11: los 2 registros "Extintores" de BDA828 estaban vacíos (sin fechas ni constancia) y la placa ya tiene su EXTINTOR real.
// Se quitan para que quede un solo tipo. Simula; con --aplicar escribe, en transacción y comprobando el conteo.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const APLICAR = process.argv.includes('--aplicar');
(async () => {
  const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD = '', DB_SSL } = process.env;
  const c = await mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: DB_USER, password: DB_PASSWORD, database: 'azkell_tenant_marsisa', ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  try {
    const cond = "tipo_documento = 'Extintores' AND fecha_vencimiento IS NULL AND fecha_emision IS NULL AND COALESCE(nro_constancia,'') = '' AND COALESCE(pago,'') = '' AND COALESCE(observaciones,'') = ''";
    const [f] = await c.query(`SELECT id, placa FROM documentos_flota WHERE ${cond}`);
    const [otros] = await c.query("SELECT COUNT(*) n FROM documentos_flota WHERE tipo_documento = 'Extintores'");
    console.log('vacíos:', JSON.stringify(f), '| total "Extintores":', otros[0].n);
    if (!APLICAR) return;
    if (f.length !== otros[0].n) throw new Error('Hay "Extintores" con datos: no se toca nada');
    await c.beginTransaction();
    const [r] = await c.query(`DELETE FROM documentos_flota WHERE ${cond}`);
    if (r.affectedRows !== f.length) { await c.rollback(); throw new Error('conteo distinto ' + r.affectedRows); }
    await c.commit(); console.log('OK', r.affectedRows);
  } finally { await c.end(); }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
