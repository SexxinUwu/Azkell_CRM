/**
 * whatsappService.js - Integración Multi-Tenant con Evolution API v2 para el ERP Azkell
 * Soporta instancias y números independientes por cada empresa (Tenant).
 */

function getEvolutionConfig() {
    return {
        url: (process.env.EVOLUTION_API_URL || 'http://82.39.109.226:8085').replace(/\/$/, ''),
        key: process.env.EVOLUTION_API_KEY || 'AZKELL_ERP_WA_SECRET_2026',
        defaultInstance: process.env.EVOLUTION_INSTANCE || 'marsisa_bot'
    };
}

function resolveInstance(instanceName, tenantSlug) {
    if (instanceName) return instanceName;
    if (tenantSlug && !['admin', 'master', 'localhost', 'default', 'app', 'azkell'].includes(tenantSlug)) {
        return `${tenantSlug}_bot`;
    }
    const def = process.env.EVOLUTION_INSTANCE || 'marsisa_bot';
    return def;
}

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
    const { url, key, defaultInstance } = getEvolutionConfig();
    const target = instanceName || defaultInstance;
    const apiUrl = `${url}/instance/create`;
    try {
        await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': key
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

    const { url, key } = getEvolutionConfig();
    const finalInstance = resolveInstance(instanceName, tenantSlug);
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
${motivo ? `📝 *Motivo:* ${motivo}\n` : ''}━━━━━━━━━━━━━━━━━━
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

    const apiUrl = `${url}/message/sendText/${encodeURIComponent(finalInstance)}`;
    
    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': key
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
 * Envía confirmación al solicitante / dueño cuando la OC fue aprobada, rechazada u observada
 */
async function sendDecisionConfirmationWhatsapp({ phone, ocCode, status, reason, tenantSlug, instanceName, empresaNombre }) {
    const recipient = formatPhone(phone);
    if (!recipient) return { success: false, error: 'Número inválido' };

    const { url, key } = getEvolutionConfig();
    const finalInstance = resolveInstance(instanceName, tenantSlug);
    const isApproved = status === 'APROBADA' || status === 'Aprobado';
    const isObserved = status === 'OBSERVADA' || status === 'Observado';
    const headerEmpresa = empresaNombre ? `🏢 *[${empresaNombre}]*\n` : '';

    let messageText = '';
    if (isApproved) {
        messageText = `${headerEmpresa}✅ *ORDEN DE COMPRA APROBADA*\n\nLa orden *#${ocCode}* ha sido autorizada satisfactoriamente en el ERP.`;
    } else if (isObserved) {
        messageText = `${headerEmpresa}⚠️ *ORDEN DE COMPRA OBSERVADA*\n\nLa orden *#${ocCode}* tiene observaciones:\n*Motivo:* ${reason || 'Revisar observaciones en el ERP'}.`;
    } else {
        messageText = `${headerEmpresa}❌ *ORDEN DE COMPRA RECHAZADA*\n\nLa orden *#${ocCode}* ha sido desestimada.\n*Motivo:* ${reason || 'Sin observación especificada'}.`;
    }

    const payload = {
        number: recipient,
        text: messageText,
        delay: 500,
        linkPreview: false
    };

    const apiUrl = `${url}/message/sendText/${encodeURIComponent(finalInstance)}`;
    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': key
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errText = await res.text();
            console.error(`⚠️ [WhatsApp Confirmación Error - ${finalInstance}] Status: ${res.status}`, errText);
            return { success: false, error: errText };
        }
        return { success: true };
    } catch (err) {
        console.error(`❌ Error enviando confirmación WhatsApp (${finalInstance}):`, err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Envía notificación automática a Tesorería / Pagos cuando una OC ha sido aprobada
 */
async function sendTreasuryNotificationWhatsapp({ phone, ocCode, supplier, ruc, total, currency, approverName, reason, bankAccount, tenantSlug, instanceName, empresaNombre }) {
    const recipient = formatPhone(phone);
    if (!recipient) return { success: false, error: 'Número no configurado' };

    const { url, key } = getEvolutionConfig();
    const finalInstance = resolveInstance(instanceName, tenantSlug);
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

    const apiUrl = `${url}/message/sendText/${encodeURIComponent(finalInstance)}`;
    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': key
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const errText = await res.text();
            console.error(`⚠️ [WhatsApp Tesorería Error - ${finalInstance}] Status: ${res.status}`, errText);
            return { success: false, error: errText };
        }
        return { success: true };
    } catch (err) {
        console.error(`❌ Error enviando notificación WhatsApp a Tesorería (${finalInstance}):`, err.message);
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

    const { url, key } = getEvolutionConfig();
    const finalInstance = resolveInstance(instanceName, tenantSlug);
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

        const mediaApiUrl = `${url}/message/sendMedia/${encodeURIComponent(finalInstance)}`;

        try {
            const res = await fetch(mediaApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': key
                },
                body: JSON.stringify(mediaPayload)
            });

            if (res.ok) {
                return { success: true };
            } else {
                const errText = await res.text();
                console.warn(`⚠️ [sendMedia Fallback a sendText - ${finalInstance}] Status: ${res.status}`, errText);
            }
        } catch (errMedia) {
            console.warn(`⚠️ [sendMedia Fallback a sendText Error - ${finalInstance}]:`, errMedia.message);
        }
    }

    // Fallback: Si no hay voucher o falló sendMedia, enviar como texto estructurado
    const textPayload = {
        number: recipient,
        text: messageText,
        delay: 500,
        linkPreview: false
    };

    const textUrl = `${url}/message/sendText/${encodeURIComponent(finalInstance)}`;
    try {
        const res = await fetch(textUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': key
            },
            body: JSON.stringify(textPayload)
        });
        if (!res.ok) {
            const errText = await res.text();
            console.error(`⚠️ [WhatsApp Almacén Error - ${finalInstance}] Status: ${res.status}`, errText);
            return { success: false, error: errText };
        }
        return { success: true };
    } catch (err) {
        console.error(`❌ Error enviando notificación WhatsApp a Almacén (${finalInstance}):`, err.message);
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
