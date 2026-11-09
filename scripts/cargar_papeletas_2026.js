// Carga única de PAPELETAS 2026.xlsx. Por defecto solo simula; con --aplicar escribe (una transacción por empresa).
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const APLICAR = process.argv.includes('--aplicar');
const OBS_SIN_MONTO = 'Sin monto en el Excel de control: completar al consultar la entidad.';
const DOC = (n, f, cod, grav, extra = {}) => ({ tipo_documento: 'OTRO', entidad_codigo: 'SUTRAN', numero: n, fecha: f, infraccion_codigo: cod, gravedad: grav, monto: 0, estado: 'PENDIENTE', observaciones: OBS_SIN_MONTO, ...extra });
const FALTA = 'El Excel no trae la placa ni el estado: completarlos.';
const DATOS = {
  azkell_tenant_marsisa: [
    { tipo_documento: 'PAPELETA', entidad_codigo: 'SUTRAN', numero: '2501158043', fecha: '2026-06-27', placa: 'CFR727', infraccion_codigo: 'G18', gravedad: 'GRAVE', agente: 'Conductor', conductor_nombre: 'SANCHEZ RIOJA JOSE ALONSO', monto: 440, estado: 'PENDIENTE',
      observaciones: 'Del Excel: monto pronto pago S/ 145.20 y beneficio DS017-2026-MTC S/ 44.00. Completar la fecha límite del descuento.' },
    DOC('8721031961', '2024-11-03', 'P.29', 'MUY_GRAVE', { placa: 'AMV974' }),
    DOC('8721031962', '2024-11-03', 'P.22', 'LEVE', { placa: 'AMV974' }),
    { tipo_documento: 'PAPELETA', entidad_codigo: 'SUTRAN', numero: '2450660813', fecha: '2026-05-19', placa: 'CFA910', infraccion_codigo: 'M20', gravedad: 'MUY_GRAVE', agente: 'Propietario', asume_nombre: 'ROSYMAR PERU S.A.C.', monto: 1320, estado: 'PAGADA', pago: 1320,
      observaciones: 'Del Excel: pagada (beneficio DS017-2026-MTC S/ 132.00). La fecha del pago no estaba en el Excel: corregirla.' },
    { tipo_documento: 'OTRO', entidad_codigo: 'SUTRAN', numero: '3101002331', fecha: '2023-05-16', placa: 'BSS899', infraccion_codigo: 'P.1', gravedad: 'LEVE', agente: 'Transportista', asume_nombre: 'CENTRAL PERU S.A', monto: 692.31, estado: 'PAGADA', pago: 692.31,
      observaciones: 'Formulario de infracción. Del Excel: pagada. La fecha del pago no estaba en el Excel: corregirla.' },
    { tipo_documento: 'PAPELETA', entidad_codigo: 'SUTRAN', numero: '7106009969', fecha: '2026-07-24', placa: 'CJJ736', infraccion_codigo: 'S.3.d', agente: 'Transportista', asume_nombre: 'MARSISA S.A.C.', monto: 2750, estado: 'PAGADA', pago: 2750,
      observaciones: 'Del Excel: pronto pago S/ 1,375.00, estado pagado. Revisar si se pagó con descuento y la fecha del pago.' },
    { tipo_documento: 'PAPELETA', entidad_codigo: 'SAT_LIMA', numero: 'AF301686', fecha: '2026-09-03', placa: 'CLQ747', infraccion_codigo: 'U07', monto: 27.5, estado: 'PENDIENTE', observaciones: 'Reglamento RTC.' },
    { tipo_documento: 'PAPELETA', entidad_codigo: 'SAT_LIMA', numero: 'AF301813', fecha: '2026-09-04', placa: 'CLQ747', infraccion_codigo: 'U07', monto: 27.5, estado: 'PENDIENTE', observaciones: 'Reglamento RTC.' },
  ],
  azkell_tenant_trahesa: [
    DOC('8721038058', '2026-02-11', 'P.29', 'MUY_GRAVE', { placa: 'BUE998' }),
    DOC('8721038059', '2026-02-11', 'P.15', 'MUY_GRAVE', { placa: 'BUE998' }),
  ],
  azkell_tenant_rosymarperu: [
    { tipo_documento: 'PAPELETA', entidad_codigo: 'SUTRAN', numero: '2450480138', fecha: '2024-01-14', placa: 'SINPLACA', infraccion_codigo: 'M20', agente: 'Propietario', asume_nombre: 'ROSYMAR PERU S.A.C.', monto: 1050.5, estado: 'PENDIENTE', observaciones: FALTA },
    { tipo_documento: 'PAPELETA', entidad_codigo: 'SUTRAN', numero: '2450531166', fecha: '2024-08-06', placa: 'SINPLACA', infraccion_codigo: 'M20', agente: 'Propietario', asume_nombre: 'ROSYMAR PERU S.A.C.', monto: 1050.5, estado: 'PENDIENTE', observaciones: FALTA },
    { tipo_documento: 'PAPELETA', entidad_codigo: 'SUTRAN', numero: '3117004473', fecha: '2023-04-15', placa: 'SINPLACA', infraccion_codigo: 'P.3', agente: 'Generador de Carga', quien_asume: 'TERCERO', asume_nombre: 'RETIS NOREÑA WALTER', monto: 49500, estado: 'PENDIENTE', observaciones: FALTA },
  ],
};
const EMPRESA = { azkell_tenant_marsisa: 'MARSISA', azkell_tenant_trahesa: 'TRAHESA', azkell_tenant_rosymarperu: 'ROSYMAR PERU S.A.C.' };
const USUARIO = 'Carga Excel PAPELETAS 2026';

(async () => {
  const { DB_HOST, DB_PORT = '3306', DB_USER, DB_PASSWORD = '', DB_SSL } = process.env;
  for (const [db, filas] of Object.entries(DATOS)) {
    const c = await mysql.createConnection({ host: DB_HOST, port: +DB_PORT, user: DB_USER, password: DB_PASSWORD, database: db, ssl: DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
    const [[{ n }]] = await c.query('SELECT COUNT(*) n FROM papeletas');
    console.log(`\n== ${db}: papeletas existentes ${n}; a cargar ${filas.length}`);
    if (!APLICAR) { filas.forEach(f => console.log(`  ${f.entidad_codigo} ${f.numero} ${f.placa} ${f.fecha} ${f.infraccion_codigo} S/${f.monto} ${f.estado}`)); await c.end(); continue; }
    await c.beginTransaction();
    try {
      let ins = 0, pagos = 0, omit = 0;
      for (const f of filas) {
        const [dup] = await c.query('SELECT id FROM papeletas WHERE entidad_codigo=? AND numero=?', [f.entidad_codigo, f.numero]);
        if (dup.length) { omit++; continue; }
        const anio = new Date().getFullYear();
        const [ult] = await c.query('SELECT codigo FROM papeletas WHERE codigo LIKE ? ORDER BY id DESC LIMIT 1', [`PAP-${anio}-%`]);
        const sig = ult.length ? parseInt(/(\d+)$/.exec(ult[0].codigo)[1], 10) + 1 : 1;
        const codigo = `PAP-${anio}-${String(sig).padStart(4, '0')}`;
        const [r] = await c.query('INSERT INTO papeletas SET ?', [{
          codigo, entidad_codigo: f.entidad_codigo, tipo_documento: f.tipo_documento, numero: f.numero, fecha_infraccion: `${f.fecha} 00:00:00`, placa: f.placa, empresa_unidad: EMPRESA[db],
          agente: f.agente || null, conductor_nombre: f.conductor_nombre || null, infraccion_codigo: f.infraccion_codigo, gravedad: f.gravedad || null, moneda: 'PEN', monto: f.monto,
          quien_asume: f.quien_asume || 'EMPRESA', asume_nombre: f.asume_nombre || EMPRESA[db], estado: f.estado, observaciones: f.observaciones, creado_por: USUARIO }]);
        if (r.affectedRows !== 1) throw new Error('La papeleta no se insertó');
        await c.query('INSERT INTO papeletas_historial (papeleta_id, accion, detalle, usuario) VALUES (?, ?, ?, ?)', [r.insertId, 'IMPORTÓ', 'Cargada desde PAPELETAS 2026.xlsx', USUARIO]);
        ins++;
        if (f.estado === 'PAGADA') {
          const [p] = await c.query('INSERT INTO papeletas_pagos (papeleta_id, fecha, monto, observacion, registrado_por) VALUES (?, CURDATE(), ?, ?, ?)', [r.insertId, f.pago, 'Pago cargado desde Excel: fecha no registrada', USUARIO]);
          if (p.affectedRows !== 1) throw new Error('El pago no se insertó');
          pagos++;
        }
      }
      const esperadosPagos = filas.filter(f => f.estado === 'PAGADA').length;
      if (ins + omit !== filas.length || pagos !== esperadosPagos) throw new Error(`Conteo distinto: ins=${ins} omit=${omit} pagos=${pagos}`);
      await c.commit(); console.log(`  OK: ${ins} papeletas, ${pagos} pagos, ${omit} repetidas`);
    } catch (e) { await c.rollback(); console.log('  ROLLBACK:', e.message); }
    await c.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
