const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { getTenantPool } = require(path.join(__dirname, '../services/tenant_master'));

(async () => {
    try {
        const pool = getTenantPool('azkell_tenant_yoguitransport').promise();
        const placa = 'D0L914';
        const docId = `DOC-${Date.now()}-${Math.floor(Math.random()*1000)}`;
        const tipoDoc = 'Tarjeta de Identificación Vehicular (TIVe / SUNARP)';
        const nroConstancia = 'Partida 52674690 / Título 2590186-2026';
        const fechaEmision = '2026-08-13';
        const fechaVencimiento = null;
        const observaciones = 'https://azkell-fleet-storage-939903246652-us-east-2-an.s3.us-east-2.amazonaws.com/flota/documentos/1789769257753_D0L914_TIVEactualizada.pdf';
        const usuario = 'GERENCIA';

        await pool.query(`
            INSERT INTO documentos_flota
            (id, placa, tipo_documento, nro_constancia, fecha_emision, fecha_vencimiento, observaciones, usuario)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [docId, placa, tipoDoc, nroConstancia, fechaEmision, fechaVencimiento, observaciones, usuario]);

        console.log(`Documento TIVe registrado exitosamente para ${placa} (ID: ${docId})`);
        
        const [docs] = await pool.query("SELECT * FROM documentos_flota WHERE placa = ?", [placa]);
        console.log('Documentos actuales de D0L914:', docs);
        process.exit(0);
    } catch(e) {
        console.error('Error registrando documento:', e);
        process.exit(1);
    }
})();
