const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  console.log('--- Conectando a las bases de datos ---');
  // Conectar a Marsisa
  const connMarsisa = await mysql.createConnection({
    host: process.env.DB_HOST || '82.39.109.226',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'azkell_app',
    password: process.env.DB_PASSWORD,
    database: 'azkell_tenant_marsisa'
  });

  // Conectar a Rosymar
  const connRosymar = await mysql.createConnection({
    host: process.env.DB_HOST || '82.39.109.226',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'azkell_app',
    password: process.env.DB_PASSWORD,
    database: 'azkell_tenant_rosymarperu'
  });

  console.log('=== 1. VERIFICACIÓN PREVIA EN ROSYMAR ===');
  const [rosymarRows] = await connRosymar.query(
    'SELECT id, rampa, placa, conductor, creado_por, fecha_ingreso, estado, creado_en FROM taller_rampas WHERE id IN (264, 288)'
  );
  console.log(`Filas encontradas en Rosymar (IDs 264 y 288): ${rosymarRows.length}`);
  for (const r of rosymarRows) {
    console.log(` - ID ${r.id}: Placa ${r.placa}, Rampa ${r.rampa}, Creador: "${r.creado_por}", Estado: ${r.estado}`);
  }

  if (rosymarRows.length !== 2) {
    throw new Error('ABORTADO: No se encontraron las 2 filas (264 y 288) en Rosymar.');
  }

  console.log('\n=== 2. RESPALDO PREVIO DE LAS FILAS EN MARSISA ===');
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const [marsisaTargetRows] = await connMarsisa.query(
    'SELECT * FROM taller_rampas WHERE id IN (526, 589, 590, 591)'
  );
  console.log(`Filas objetivo en Marsisa: ${marsisaTargetRows.length}`);
  for (const r of marsisaTargetRows) {
    console.log(` - ID ${r.id}: Placa ${r.placa}, Rampa ${r.rampa}, Creador: "${r.creado_por}", Estado: ${r.estado}`);
  }

  if (marsisaTargetRows.length !== 4) {
    throw new Error(`ABORTADO: Se esperaban 4 filas en Marsisa, pero se encontraron ${marsisaTargetRows.length}.`);
  }

  // Guardar JSON de respaldo
  const jsonBackupPath = path.join(backupDir, 'marsisa_taller_rampas_deleted_rows_20261015.json');
  fs.writeFileSync(jsonBackupPath, JSON.stringify(marsisaTargetRows, null, 2));
  console.log('Respaldo JSON guardado en:', jsonBackupPath);

  // Guardar script SQL de restauración exacta
  let sqlRestore = `-- Script de restauración para los registros eliminados de azkell_tenant_marsisa.taller_rampas\n`;
  sqlRestore += `INSERT INTO taller_rampas (id, rampa, placa, km, conductor, falla, tipo_servicio, fecha_ingreso, hora_ingreso, hora_estimada_salida, fecha_liberacion, hora_liberacion, estado, tiempo_transcurrido, creado_por, creado_en) VALUES\n`;
  sqlRestore += marsisaTargetRows.map(r => {
    return `(${r.id}, ${connMarsisa.escape(r.rampa)}, ${connMarsisa.escape(r.placa)}, ${r.km ? connMarsisa.escape(r.km) : 'NULL'}, ${r.conductor ? connMarsisa.escape(r.conductor) : 'NULL'}, ${r.falla ? connMarsisa.escape(r.falla) : 'NULL'}, ${r.tipo_servicio ? connMarsisa.escape(r.tipo_servicio) : 'NULL'}, ${r.fecha_ingreso ? connMarsisa.escape(r.fecha_ingreso) : 'NULL'}, ${r.hora_ingreso ? connMarsisa.escape(r.hora_ingreso) : 'NULL'}, ${r.hora_estimada_salida ? connMarsisa.escape(r.hora_estimada_salida) : 'NULL'}, ${r.fecha_liberacion ? connMarsisa.escape(r.fecha_liberacion) : 'NULL'}, ${r.hora_liberacion ? connMarsisa.escape(r.hora_liberacion) : 'NULL'}, ${connMarsisa.escape(r.estado)}, ${r.tiempo_transcurrido ? connMarsisa.escape(r.tiempo_transcurrido) : 'NULL'}, ${connMarsisa.escape(r.creado_por)}, ${connMarsisa.escape(r.creado_en)})`;
  }).join(',\n') + ';\n';

  const sqlBackupPath = path.join(backupDir, 'marsisa_restore_taller_rampas_deleted_rows_20261015.sql');
  fs.writeFileSync(sqlBackupPath, sqlRestore);
  console.log('Script de restauración SQL guardado en:', sqlBackupPath);

  console.log('\n=== 3. INICIO DE TRANSACCIÓN Y DELETE EN MARSISA ===');
  await connMarsisa.beginTransaction();
  try {
    const [delResult] = await connMarsisa.query(
      "DELETE FROM taller_rampas WHERE id IN (526, 589, 590, 591) AND creado_por = 'Administrador ROSYMAR PERU S.A.C.'"
    );
    console.log(`Filas afectadas por DELETE: ${delResult.affectedRows}`);

    if (delResult.affectedRows === 4) {
      await connMarsisa.commit();
      console.log('>>> COMMIT EJECUTADO: Las 4 filas fueron eliminadas correctamente de Marsisa.');
    } else {
      await connMarsisa.rollback();
      throw new Error(`ABORTADO: Se afectaron ${delResult.affectedRows} filas, se esperaba 4. Se aplicó ROLLBACK.`);
    }
  } catch (err) {
    await connMarsisa.rollback();
    console.error('Error durante la transacción, ROLLBACK aplicado:', err);
    throw err;
  }

  console.log('\n=== 4. VERIFICACIÓN POST-EJECUCIÓN ===');
  const [marsisaRosymarCheck] = await connMarsisa.query(
    "SELECT COUNT(*) AS total FROM taller_rampas WHERE creado_por LIKE '%ROSYMAR%'"
  );
  console.log(`Filas restantes con 'ROSYMAR' en Marsisa: ${marsisaRosymarCheck[0].total}`);

  const [rosymarFinalCheck] = await connRosymar.query(
    'SELECT id, rampa, placa, estado FROM taller_rampas WHERE id IN (264, 288)'
  );
  console.log(`Verificación final en Rosymar (filas 264 y 288 intactas):`, rosymarFinalCheck);

  await connMarsisa.end();
  await connRosymar.end();
  console.log('\n=== PROCESO COMPLETADO SATISFACTORIAMENTE ===');
}

run().catch(e => {
  console.error('Fallo en la ejecución:', e);
  process.exit(1);
});
