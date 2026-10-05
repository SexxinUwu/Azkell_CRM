/**
 * whatsappService.js - Integración Multi-Tenant con Evolution API v2 para el ERP Azkell
 * Soporta instancias y números independientes por cada empresa (Tenant).
 */

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://82.39.109.226:8085';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'AZKELL_ERP_WA_SECRET_2026';
const DEFAULT_INSTANCE = process.env.EVOLUTION_INSTANCE || 'azkell_erp_bot';

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
 * Asegura que la instancia de WhatsApp de la empresa exista en Evolution API
 */
async function ensureInstanceExists(instanceName) {
    const target = instanceName || DEFAULT_INSTANCE;
    const url = `${EVOLUTION_URL.replace(/\/$/, '')}/instance/create`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_KEY
            },
            body: JSON.stringify({
                instanceName: target,
                qrcode: true,
                integration: 'WHATSAPP-BAILEYS'
            })
        });
    } catch(e) {
        // Ignorar si ya existe
    }
    return target;
}

/**
 * Envía el mensaje con el Magic Link de aprobación de Orden de Compra
 */
async function sendApprovalWhatsapp({ phone, ocCode, supplier, total, currency, approvalUrl, solicitadoPor, motivo, tenantSlug, instanceName, empresaNombre }) {
    const recipient = formatPhone(phone);
    if (!recipient) throw new Error('Número de teléfono inválido para WhatsApp');

    const finalInstance = instanceName || (tenantSlug ? `${tenantSlug}_bot` : DEFAULT_INSTANCE);
    await ensureInstanceExists(finalInstance);

    const monedaSym = currency === 'USD' ? '$' : 'S/';
    const montoFormateado = `${monedaSym} ${parseFloat(total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const headerEmpresa = empresaNombre ? `🏢 *[${empresaNombre}]*\n` : '';

    const messageText = 
`${headerEmpresa}🔔 *NUEVA ORDEN DE COMPRA PENDIENTE DE APROBACIÓN*

📋 *N° Orden:* ${ocCode}
🤝 *Proveedor:* ${supplier}
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

    const url = `${EVOLUTION_URL.replace(/\/$/, '')}/message/sendText/${finalInstance}`;
    
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
            console.error(`⚠️ [Evolution API Error - ${finalInstance}] Status: ${res.status}`, errText);
            return { success: false, error: errText, status: res.status };
        }

        const data = await res.json();
        return { success: true, data };
    } catch (err) {
        console.error(`❌ [WhatsApp Service Error - ${finalInstance}]:`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Envía confirmación al dueño / solicitante cuando la OC fue aprobada o rechazada
 */
async function sendDecisionConfirmationWhatsapp({ phone, ocCode, status, reason, tenantSlug, instanceName }) {
    const recipient = formatPhone(phone);
    if (!recipient) return;

    const finalInstance = instanceName || (tenantSlug ? `${tenantSlug}_bot` : DEFAULT_INSTANCE);
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

    const url = `${EVOLUTION_URL.replace(/\/$/, '')}/message/sendText/${finalInstance}`;
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

/**
 * Envía notificación automática a Tesorería / Pagos cuando una OC ha sido aprobada
 */
async function sendTreasuryNotificationWhatsapp({ phone, ocCode, supplier, ruc, total, currency, approverName, reason, bankAccount, tenantSlug, instanceName, empresaNombre }) {
    const recipient = formatPhone(phone);
    if (!recipient) return;

    const finalInstance = instanceName || (tenantSlug ? `${tenantSlug}_bot` : DEFAULT_INSTANCE);
    await ensureInstanceExists(finalInstance);

    const monedaSym = currency === 'USD' ? '$' : 'S/';
    const montoFormateado = `${monedaSym} ${parseFloat(total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const headerEmpresa = empresaNombre ? `🏢 *[${empresaNombre}]*\n` : '';

    const messageText = 
`${headerEmpresa}💳 *NUEVA ORDEN APROBADA LISTA PARA PAGO*

📋 *N° Orden:* ${ocCode}
🤝 *Proveedor:* ${supplier}
${ruc && ruc !== 'No registrado' ? `🆔 *RUC:* ${ruc}\n` : ''}💰 *Monto Autorizado:* ${montoFormateado}
👤 *Autorizado por:* ${approverName || 'Gerencia General'}
${reason ? `📝 *Motivo:* ${reason}\n` : ''}${bankAccount ? `🏦 *Cuenta Destino:* ${bankAccount}\n` : ''}━━━━━━━━━━━━━━━━━━
⚡ _Esta orden ya se encuentra lista en el módulo 'Pago de Requerimientos' de Tesorería para su procesamiento de pago._`;

    const payload = {
        number: recipient,
        text: messageText,
        delay: 500,
        linkPreview: false
    };

    const url = `${EVOLUTION_URL.replace(/\/$/, '')}/message/sendText/${finalInstance}`;
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
            console.error(`⚠️ [WhatsApp Tesorería Error] Status: ${res.status}`, errText);
            return { success: false, error: errText };
        }
        return { success: true };
    } catch (err) {
        console.error('❌ Error enviando notificación WhatsApp a Tesorería:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Envía la constancia / comprobante de pago con su desglose detallado a Almacén / Logística
 * Si hay imagen o PDF del comprobante, lo despacha como Media con caption (descripción) directo.
 */
async function sendWarehousePaymentVoucherWhatsapp({
    phone,
    ocCode,
    supplier,
    ruc,
    total,
    currency,
    paidBy,
    reason,
    bankAccount,
    operationNumber,
    mediaUrl,
    mimeType,
    tenantSlug,
    instanceName,
    empresaNombre
}) {
    const recipient = formatPhone(phone);
    if (!recipient) return { success: false, error: 'Número no configurado' };

    const finalInstance = instanceName || (tenantSlug ? `${tenantSlug}_bot` : DEFAULT_INSTANCE);
    await ensureInstanceExists(finalInstance);

    const monedaSym = (currency || 'PEN').toUpperCase() === 'USD' ? '$' : 'S/';
    const montoFormateado = `${monedaSym} ${parseFloat(total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const headerEmpresa = empresaNombre ? `🏢 *[${empresaNombre}]*\n` : '';

    const messageText = 
`${headerEmpresa}✅ *PAGO DE ORDEN DE COMPRA REALIZADO*

📋 *N° Orden:* ${ocCode}
🤝 *Proveedor:* ${supplier || 'Proveedor General'}
${ruc && ruc !== 'No registrado' ? `🆔 *RUC:* ${ruc}\n` : ''}💰 *Monto Pagado:* ${montoFormateado}
${bankAccount ? `🏦 *Cuenta Destino:* ${bankAccount}\n` : ''}${operationNumber ? `📄 *N° Operación / Constancia:* ${operationNumber}\n` : ''}👤 *Procesado por:* ${paidBy || 'Tesorería'}
${reason ? `📝 *Motivo:* ${reason}\n` : ''}━━━━━━━━━━━━━━━━━━
📦 _El requerimiento ha sido liquidado con éxito por Tesorería. Se adjunta el comprobante/constancia de transferencia bancaria._`;

    // Si tenemos una URL válida de imagen / PDF, enviamos por sendMedia
    if (mediaUrl) {
        const isPdf = (mimeType && mimeType.includes('pdf')) || mediaUrl.toLowerCase().includes('.pdf');
        const mediaType = isPdf ? 'document' : 'image';
        const finalMime = mimeType || (isPdf ? 'application/pdf' : 'image/jpeg');
        const fileName = `Constancia_Pago_${ocCode}.${isPdf ? 'pdf' : 'jpg'}`;

        const mediaPayload = {
            number: recipient,
            media: mediaUrl,
            mediatype: mediaType,
            mimetype: finalMime,
            caption: messageText,
            fileName: fileName,
            delay: 1000
        };

        const mediaApiUrl = `${EVOLUTION_URL.replace(/\/$/, '')}/message/sendMedia/${finalInstance}`;

        try {
            const res = await fetch(mediaApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': EVOLUTION_KEY
                },
                body: JSON.stringify(mediaPayload)
            });

            if (res.ok) {
                return { success: true };
            } else {
                const errText = await res.text();
                console.warn(`⚠️ [sendMedia Fallback a sendText] Status: ${res.status}`, errText);
            }
        } catch (errMedia) {
            console.warn('⚠️ [sendMedia Fallback a sendText Error]:', errMedia.message);
        }
    }

    // Fallback: Si no hay voucher o falló sendMedia, enviar como texto estructurado
    const textPayload = {
        number: recipient,
        text: messageText,
        delay: 500,
        linkPreview: false
    };

    const textUrl = `${EVOLUTION_URL.replace(/\/$/, '')}/message/sendText/${finalInstance}`;
    try {
        const res = await fetch(textUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_KEY
            },
            body: JSON.stringify(textPayload)
        });
        if (!res.ok) {
            const errText = await res.text();
            console.error(`⚠️ [WhatsApp Almacén Error] Status: ${res.status}`, errText);
            return { success: false, error: errText };
        }
        return { success: true };
    } catch (err) {
        console.error('❌ Error enviando notificación WhatsApp a Almacén:', err.message);
        return { success: false, error: err.message };
    }
}

module.exports = {
    formatPhone,
    ensureInstanceExists,
    sendApprovalWhatsapp,
    sendDecisionConfirmationWhatsapp,
    sendTreasuryNotificationWhatsapp,
    sendWarehousePaymentVoucherWhatsapp
};
