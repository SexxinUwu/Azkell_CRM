require('dotenv').config();
const mysql = require('mysql2');
const fs = require('fs');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'azkell_tenant_marsisa',
    port: process.env.DB_PORT || 3306
});

const tables = [
  'almacen_familias', 'almacen_marcas', 'almacen_sistemas', 'almacen_unidades',
  'configuracion_almacen', 'configuracion_flota', 'destinatarios_alertas',
  'detalle_entradas_inv', 'detalle_salidas_inv', 'documentos_flota', 'entradas_inv',
  'integraciones_api', 'inventario', 'km_snapshots', 'mant_insp_templates',
  'mantenimiento_kits', 'planificacion', 'proveedor_marcas_inv', 'proveedores_inv',
  'requerimientos_planificacion', 'salidas_inv', 'seg_asistencia',
  'seg_checklist_templates', 'seg_unidades_fotos', 'seg_unidades_registros',
  'taller_personal', 'tipos_preventivo', 'clientes'
];

async function dump() {
    let out = [];
    for (const t of tables) {
        try {
            const [rows] = await pool.promise().query("SHOW CREATE TABLE `" + t + "`");
            out.push({ nombre: t, sql: rows[0]['Create Table'] });
        } catch(e) {
            console.error('Error in ' + t + ':', e.message);
        }
    }
    fs.writeFileSync('_missing_tables.json', JSON.stringify(out, null, 2));
    console.log('✅ Dumped ' + out.length + ' table definitions to _missing_tables.json');
    process.exit(0);
}
dump();
