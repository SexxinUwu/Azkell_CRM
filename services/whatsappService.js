/**
 * whatsappService.js - Integración con Evolution API v2 para el ERP Azkell
 * Permite despachar alertas de aprobación, confirmaciones y mensajes transaccionales.
 */

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'AZKELL_ERP_WA_SECRET_2026';
const INSTANCE = process.env.EVOLUTION_INSTANCE || 'azkell_erp_bot';

/**
 * Normaliza y formatea el número de teléfono (por defecto formato Perú 51XXXXXXXXX)
 */
function formatPhone(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/\D/g, '');
    if (!clean.startsWith('51') && clean.length === 9) {
        clean = '51' + clean;
    }
    return clean;
}

/**
 * Envía el mensaje con el Magic Link de aprobación de Orden de Compra
 */
async function sendApprovalWhatsapp({ phone, ocCode, supplier, total, currency, approvalUrl, solicitadoPor, motivo }) {
    const recipient = formatPhone(phone);
    if (!recipient) throw new Error('Número de teléfono inválido para WhatsApp');

    const monedaSym = currency === 'USD' ? '$' : 'S/';
    const montoFormateado = `${monedaSym} ${parseFloat(total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const messageText = 
`🔔 *NUEVA ORDEN DE COMPRA PENDIENTE DE APROBACIÓN*

📋 *N° Orden:* ${ocCode}
🏢 *Proveedor:* ${supplier}
💰 *Monto Total:* ${montoFormateado}
👤 *Solicitado por:* ${solicitadoPor || 'Área de Compras / Taller'}
${motivo ? `📝 *Motivo:* ${motivo}\n` : ''}
━━━━━━━━━━━━━━━━━━
📄 *Acción requerida:*
Revisa el desglose de ítems, precios unitarios y la cotización adjunta antes de autorizar:

👉 *Link de Aprobación Móvil:*
${approvalUrl}

⏳ _Enlace seguro de uso único. Expira en 24 horas._`;

    const payload = {
        number: recipient,
        text: messageText,
        delay: 1000,
        linkPreview: true
    };

    const url = `${EVOLUTION_URL.replace(/\/$/, '')}/message/sendText/${INSTANCE}`;
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(`⚠️ [Evolution API Error] Status: ${res.status}`, errText);
            return { success: false, error: errText, status: res.status };
        }

        const data = await res.json();
        return { success: true, data };
    } catch (err) {
        console.error('❌ [WhatsApp Service Error]:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Envía confirmación al dueño / solicitante cuando la OC fue aprobada o rechazada
 */
async function sendDecisionConfirmationWhatsapp({ phone, ocCode, status, reason }) {
    const recipient = formatPhone(phone);
    if (!recipient) return;

    const isApproved = status === 'APROBADA';
    const messageText = isApproved
        ? `✅ *ORDEN DE COMPRA APROBADA*\n\nLa orden *#${ocCode}* ha sido autorizada satisfactoriamente en el ERP.`
        : `❌ *ORDEN DE COMPRA OBSERVADA / RECHAZADA*\n\nLa orden *#${ocCode}* ha sido rechazada.\n*Motivo:* ${reason || 'Sin observación especificada'}.`;

    const payload = {
        number: recipient,
        text: messageText,
        delay: 500,
        linkPreview: false
    };

    const url = `${EVOLUTION_URL.replace(/\/$/, '')}/message/sendText/${INSTANCE}`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_KEY
            },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error('❌ Error enviando confirmación WhatsApp:', err.message);
    }
}

module.exports = {
    formatPhone,
    sendApprovalWhatsapp,
    sendDecisionConfirmationWhatsapp
};
