const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { getTenantPool } = require(path.join(__dirname, '../services/tenant_master'));

(async () => {
    try {
        const tdb = getTenantPool('azkell_tenant_yoguitransport').promise();
        
        console.log('Limpiando documentos de D8O846 en vehiculos_flota...');
        await tdb.query(`
            UPDATE vehiculos_flota SET
                tc_vencimiento = NULL, tc_constancia = NULL, tc_url = NULL,
                soat_entidad = NULL, soat_pago = NULL, soat_vencimiento = NULL, soat_url = NULL,
                matpel_constancia = NULL, matpel_vencimiento = NULL, matpel_url = NULL,
                rt_emision = NULL, rt_vencimiento = NULL, rt_url = NULL,
                boni_emision = NULL, boni_vencimiento = NULL, boni_url = NULL,
                sv_entidad = NULL, sv_asesor = NULL, sv_vencimiento = NULL, sv_url = NULL,
                sc_entidad = NULL, sc_asesor = NULL, sc_vencimiento = NULL, sc_url = NULL,
                fum_emision = NULL, fum_vencimiento = NULL, fum_url = NULL,
                ext_emision = NULL, ext_vencimiento = NULL, ext_url = NULL, ext_cantidad = 1
            WHERE UPPER(TRIM(placa)) = 'D8O846'
        `);

        console.log('Eliminando registros de documentos_flota para D8O846...');
        await tdb.query(`DELETE FROM documentos_flota WHERE UPPER(TRIM(placa)) = 'D8O846'`);

        const [vf] = await tdb.query("SELECT placa, tc_vencimiento, matpel_vencimiento, soat_vencimiento FROM vehiculos_flota WHERE UPPER(TRIM(placa)) = 'D8O846'");
        console.log('Estado actual de vehiculos_flota para D8O846:', vf);

        const [docs] = await tdb.query("SELECT * FROM documentos_flota WHERE UPPER(TRIM(placa)) = 'D8O846'");
        console.log('Estado actual de documentos_flota para D8O846 (debe estar vacio):', docs);

        console.log('¡Limpieza completada exitosamente!');
        process.exit(0);
    } catch (e) {
        console.error('Error durante la limpieza:', e);
        process.exit(1);
    }
})();
