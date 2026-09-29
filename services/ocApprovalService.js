/**
 * ocApprovalService.js - Manejo de tokens criptográficos de aprobación de Órdenes de Compra
 */

const crypto = require('crypto');

/**
 * Genera un token criptográfico único y lo guarda en oc_approval_tokens
 */
async function createApprovalToken(db, { ocId, approverPhone, approverName, baseUrl }) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    await db.query(
        `INSERT INTO oc_approval_tokens (orden_compra_id, token, aprobador_telefono, aprobador_nombre, expira_en)
         VALUES (?, ?, ?, ?, ?)`,
        [ocId, token, approverPhone, approverName || 'Dueño / Gerencia', expiresAt]
    );

    const appUrl = baseUrl || process.env.APP_URL || 'http://localhost:3000';
    const approvalUrl = `${appUrl.replace(/\/$/, '')}/aprobaciones/oc?t=${token}`;

    return { token, approvalUrl, expiresAt };
}

module.exports = {
    createApprovalToken
};
