/**
 * services/notificaciones_eventos.js — Conecta los eventos del ERP con el servicio de notificaciones.
 *
 *  - notificar(): dispara un evento sin bloquear ni lanzar errores (un aviso nunca debe tumbar la operación) y puede
 *    evitar repetir el mismo aviso en un rato.
 *  - Textos de cada evento: aprobación de O/C, fin de OT / salida de rampa, falla crítica de checklist.
 *  - Vencimientos de flota: resumen diario (7:00, hora de Lima) de documentos vencidos y por vencer, una vez al día por empresa.
 *
 * Solo envía si la regla del evento está activa en la pantalla de Notificaciones y tiene destinatarios.
 */
const notif = require('./notificaciones');

const ZONA = 'America/Lima';
const DOCUMENTOS = [
  ['SOAT', 'soat_vencimiento'], ['Revisión técnica', 'rt_vencimiento'], ['Tarjeta de circulación', 'tc_vencimiento'],
  ['MATPEL', 'matpel_vencimiento'], ['Bonificación', 'boni_vencimiento'], ['Seguro vehicular', 'sv_vencimiento'],
  ['Fumigación', 'fum_vencimiento'], ['Extintores', 'ext_vencimiento'],
];

/** Ejecuta una consulta con pool de callbacks o de promesas */
function consulta(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    if (typeof db.promise === 'function') db.query(sql, params, (err, filas) => (err ? reject(err) : resolve(filas)));
    else db.query(sql, params).then(([filas]) => resolve(filas), reject);
  });
}

const fechaLima = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const aSql = d => d.toISOString().slice(0, 19).replace('T', ' ');
const dmy = f => { const [a, m, d] = f.split('-'); return `${d}/${m}/${a}`; };
const diasEntre = (hoy, f) => Math.round((Date.parse(f + 'T00:00:00Z') - Date.parse(hoy + 'T00:00:00Z')) / 86400000);

/** ¿Ya se envió algo igual hace poco? (asunto = null: cualquier aviso de ese evento desde `desde`) */
async function yaEnviado(db, evento, asunto, desde) {
  const filas = await consulta(db,
    `SELECT 1 FROM notificaciones_envios WHERE evento = ? AND created_at >= ? ${asunto ? 'AND asunto = ?' : ''} LIMIT 1`,
    asunto ? [evento, aSql(desde), asunto] : [evento, aSql(desde)]);
  return !!(filas && filas.length);
}

/** Dispara un evento. Nunca lanza. `dedupeMin`: no repite el mismo asunto dentro de esos minutos. */
async function notificar(db, evento, { asunto, texto, excluir }, { dedupeMin = 0 } = {}) {
  try {
    if (!db) return { enviados: 0, motivo: 'sin base de datos' };
    if (dedupeMin > 0 && await yaEnviado(db, evento, asunto, new Date(Date.now() - dedupeMin * 60000))) return { enviados: 0, motivo: 'repetido' };
    return await notif.disparar(db, evento, { asunto, texto, excluir });
  } catch (e) {
    console.error(`[Notificaciones] ${evento}:`, e.message);
    return { enviados: 0, error: e.message };
  }
}

// ── Textos por evento ──────────────────────────────────────────────────────
const dinero = (monto, moneda) => `${String(moneda || '').toUpperCase().startsWith('USD') ? 'US$' : 'S/'} ${Number(monto || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function avisoOrdenCompra({ id, proveedor, moneda, totalPen, tipoCambio, motivo, solicitante, empresa }) {
  const usd = String(moneda || '').toUpperCase().startsWith('USD') && Number(tipoCambio) > 0;
  const monto = usd ? dinero(Math.round((Number(totalPen) / Number(tipoCambio)) * 100) / 100, 'USD') : dinero(totalPen, 'PEN');
  return {
    asunto: `Orden de compra ${id} por aprobar · ${monto}`,
    texto: [`🧾 Orden de compra por aprobar${empresa ? ` · ${empresa}` : ''}`, `Orden: ${id}`, `Proveedor: ${proveedor || '—'}`, `Monto: ${monto}`,
      motivo ? `Motivo: ${motivo}` : null, solicitante ? `Solicitó: ${solicitante}` : null, 'Ingresa al ERP › Gerencia › Aprobación de O/C para revisarla.'].filter(Boolean).join('\n'),
  };
}

function avisoSalidaTaller({ placa, ot, rampa, tecnicos, por, empresa }) {
  return {
    asunto: `Salida de taller · ${placa}`,
    texto: [`✅ Unidad ${placa} lista${empresa ? ` · ${empresa}` : ''}`, ot ? `La OT ${ot} se finalizó.` : 'La unidad salió de rampa.', rampa ? `Rampa / zona: ${rampa}` : null,
      tecnicos && tecnicos.length ? `Técnicos: ${tecnicos.join(', ')}` : null, por ? `Cerró: ${por}` : null].filter(Boolean).join('\n'),
  };
}

function avisoChecklistCritico({ folio, placa, reportadoPor, detalle, backlogId, empresa }) {
  return {
    asunto: `Falla crítica en ${placa || 'unidad'} · reporte ${folio}`,
    texto: [`🚨 Falla crítica reportada${empresa ? ` · ${empresa}` : ''}`, `Unidad: ${placa || '—'}`, `Reporte: ${folio}`, reportadoPor ? `Reportó: ${reportadoPor}` : null,
      `Detalle: ${detalle || 'ver reporte de fallas'}`, 'La unidad NO debe salir hasta ser atendida.', backlogId ? `Se abrió el pendiente ${backlogId} en el backlog.` : null].filter(Boolean).join('\n'),
  };
}

// ── Vencimientos de flota ──────────────────────────────────────────────────
/** Documentos vencidos y por vencer (hasta `dias` días) de las unidades registradas */
async function documentosPorVencer(db, { dias = 30, hoy = fechaLima() } = {}) {
  const columnas = DOCUMENTOS.map(([, c]) => `DATE_FORMAT(vf.${c}, '%Y-%m-%d') AS ${c}`).join(', ');
  const filas = await consulta(db,
    `SELECT p.placa, ${columnas} FROM placas p JOIN vehiculos_flota vf ON CONVERT(p.placa USING utf8mb4) = CONVERT(vf.placa USING utf8mb4)`);
  const items = [];
  for (const f of filas || []) {
    for (const [nombre, col] of DOCUMENTOS) {
      const fecha = f[col];
      if (!fecha) continue;
      const d = diasEntre(hoy, fecha);
      if (d <= dias) items.push({ placa: f.placa, documento: nombre, fecha, dias: d });
    }
  }
  return items.sort((a, b) => a.dias - b.dias || a.placa.localeCompare(b.placa));
}

function resumenVencimientos(items, { empresa, hoy = fechaLima(), maxPorLista = 18 } = {}) {
  const vencidos = items.filter(i => i.dias < 0), porVencer = items.filter(i => i.dias >= 0);
  const linea = i => `• ${i.placa} · ${i.documento} · ${i.dias < 0 ? `venció hace ${-i.dias} día${-i.dias === 1 ? '' : 's'}` : i.dias === 0 ? 'vence HOY' : `vence en ${i.dias} día${i.dias === 1 ? '' : 's'}`} (${dmy(i.fecha)})`;
  const bloque = (titulo, lista) => {
    if (!lista.length) return null;
    const corta = lista.slice(0, maxPorLista).map(linea);
    if (lista.length > maxPorLista) corta.push(`… y ${lista.length - maxPorLista} más (ver Documentos de flota)`);
    return `${titulo} (${lista.length})\n${corta.join('\n')}`;
  };
  return {
    asunto: `Documentos de flota: ${vencidos.length} vencidos y ${porVencer.length} por vencer`,
    texto: [`🚛 Documentos de flota${empresa ? ` · ${empresa}` : ''} — ${dmy(hoy)}`, bloque('VENCIDOS', vencidos), bloque('POR VENCER (30 días)', porVencer)].filter(Boolean).join('\n\n'),
    vencidos: vencidos.length, porVencer: porVencer.length,
  };
}

/** Arma y envía el resumen de vencimientos de una empresa. Una vez al día salvo `forzar`. */
async function ejecutarVencimientos(db, { empresa, forzar = false, soloVer = false } = {}) {
  const regla = (await notif.reglasDe(db)).find(r => r.evento === 'flota_vencimiento');
  if (!soloVer && (!regla || !regla.activo)) return { enviados: 0, motivo: 'regla inactiva' };
  const hoy = fechaLima();
  if (!forzar && !soloVer && await yaEnviado(db, 'flota_vencimiento', null, new Date(`${hoy}T05:00:00Z`))) return { enviados: 0, motivo: 'ya enviado hoy' };
  const items = await documentosPorVencer(db, { hoy });
  if (!items.length) return { enviados: 0, motivo: 'nada que avisar', items: 0 };
  const aviso = resumenVencimientos(items, { empresa, hoy });
  if (soloVer) return { ...aviso, items: items.length, enviados: 0 };
  const r = await notif.disparar(db, 'flota_vencimiento', { asunto: aviso.asunto, texto: aviso.texto });
  return { ...r, vencidos: aviso.vencidos, porVencer: aviso.porVencer };
}

/** Revisa cada 20 minutos; entre las 7:00 y las 7:59 (Lima) envía el resumen de cada empresa (la regla de una vez al día evita repetir) */
function programarVencimientos(listarEmpresas) {
  const horaLima = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hour12: false }).format(new Date()));
  const tick = async () => {
    if (horaLima() !== 7) return;
    let empresas = [];
    try { empresas = await listarEmpresas(); } catch (e) { console.warn('[Notificaciones] empresas:', e.message); return; }
    for (const e of empresas) {
      try {
        const r = await ejecutarVencimientos(e.db, { empresa: e.nombre });
        if (r.enviados || r.fallidos) console.log(`[Notificaciones] vencimientos ${e.nombre}: ${r.enviados} enviados, ${r.fallidos || 0} fallidos`);
      } catch (err) { console.warn(`[Notificaciones] vencimientos ${e.nombre}:`, err.message); }
    }
  };
  const t = setInterval(tick, 20 * 60 * 1000);
  if (t.unref) t.unref();
  return t;
}

// ── Avisos en el teléfono (canal push) ───────────────────────────────────────
// La cuenta se muestra enmascarada: el aviso puede verse en la pantalla de bloqueo.
function cuentaEnmascarada(texto) {
  const digitos = String(texto || '').replace(/\D/g, '');
  return digitos.length >= 4 ? `terminada en ${digitos.slice(-4)}` : 'sin cuenta registrada';
}

/** Orden aprobada: aviso a Tesorería con el monto y la cuenta del proveedor. Nunca lanza. */
async function avisarOcPagar(db, ocId) {
  try {
    const [filas] = await db.promise().query(
      'SELECT id, proveedor_nombre, total_pen, cuenta_bancaria_proveedor FROM entradas_inv WHERE id = ? LIMIT 1', [ocId]);
    const o = filas && filas[0];
    if (!o) return;
    const monto = Number(o.total_pen || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await notificar(db, 'oc_pagar', {
      asunto: `Pagar OC ${o.id}`,
      texto: `${o.proveedor_nombre || 'Proveedor'} · S/ ${monto} · cuenta ${cuentaEnmascarada(o.cuenta_bancaria_proveedor)}`,
    }, { dedupeMin: 5 });
  } catch (e) { console.warn('[Notificaciones] oc_pagar:', e.message); }
}

/** Tesorería subió el voucher: aviso a Almacén. Nunca lanza. */
async function avisarOcVoucher(db, ocId) {
  try {
    const [filas] = await db.promise().query('SELECT id, proveedor_nombre FROM entradas_inv WHERE id = ? LIMIT 1', [ocId]);
    const o = filas && filas[0];
    if (!o) return;
    await notificar(db, 'oc_voucher', {
      asunto: `Comprobante de pago ${o.id}`,
      texto: `Tesorería subió el voucher del pago a ${o.proveedor_nombre || 'el proveedor'}. Revísalo en Almacén.`,
    }, { dedupeMin: 5 });
  } catch (e) { console.warn('[Notificaciones] oc_voucher:', e.message); }
}

module.exports = {
  avisarOcPagar, avisarOcVoucher,
  notificar, avisoOrdenCompra, avisoSalidaTaller, avisoChecklistCritico,
  documentosPorVencer, resumenVencimientos, ejecutarVencimientos, programarVencimientos, fechaLima,
};
