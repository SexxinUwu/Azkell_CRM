// Formato F-MAN-001 (Reporte de Fallas Flota Pesada): cuadrícula de ✓ / ✕ por ítem de tracto y carreta,
// detalle de cada falla, conformidad y firma. Portado de la versión actual (Modulos/mantenimiento/checklist/logica.js).
import './fman.css';
import { generarPDFBlob } from '../../core/lib/pdf';
import { conElemento } from './ce-pdf';
import type { ReporteFalla } from './api';

export interface SistemaCfg { key: string; title: string; items: Array<string | { id?: string; label?: string }> }
export interface ConfigSistemas { ok: boolean; tracto: SistemaCfg[]; remolque: SistemaCfg[] }
export interface FallaGuardada { sistema?: string; item?: string; obs?: string; observacion?: string; estado?: string; fecha?: string; backlog_id?: string | null; [k: string]: unknown }

/** Logo del tenant: el mismo que usa la barra lateral */
export const LOGO_FMAN = '/api/tenant-logo';

export const textoItem = (it: SistemaCfg['items'][number]) => (typeof it === 'string' ? it : it.label || it.id || '');

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const sistema = (lista: SistemaCfg[], clave: string) => (lista.find(s => s.key === clave)?.items ?? []).map(textoItem);
const numeroDe = (texto: string) => texto.match(/^(\d{1,2})\b/)?.[1]?.padStart(2, '0') ?? null;

/** Lista de fallas guardada: el formato plano actual, y el de secciones con `items` de versiones anteriores */
export function leerFallas(valor: unknown): FallaGuardada[] {
  let d = valor;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return []; } }
  if (!Array.isArray(d)) return [];
  return d.flatMap((x: Record<string, unknown>) => Array.isArray(x.items)
    ? (x.items as Array<{ nombre?: string; ok?: boolean }>).filter(i => !i.ok).map(i => ({ sistema: String(x.titulo ?? ''), item: i.nombre ?? '', obs: '' }))
    : [x as FallaGuardada]);
}

const normaliza = (s: unknown) => String(s ?? '').toLowerCase().replace(/^\d+\s*[-.]*\s*/, '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
const PALABRAS_VACIAS = new Set(['de', 'la', 'el', 'en', 'los', 'las', 'un', 'una', 'y', 'o', 'con', 'sin', 'por', 'para', 'aire', 'motor', 'fuga', 'fugas', 'nivel', 'sistema', 'general']);

/** ¿La falla guardada corresponde a este ítem del checklist? (mismas reglas que la versión actual) */
export function coincide(itemTxt: string, sysKey: string, fallas: FallaGuardada[]): FallaGuardada | undefined {
  if (!fallas.length) return undefined;
  const numItem = numeroDe(itemTxt);
  const normItem = normaliza(itemTxt);
  const normSys = normaliza(sysKey);
  return fallas.find(f => {
    if (!f) return false;
    const rawItem = String(f.item ?? '').trim();
    const numF = numeroDe(rawItem);
    if (numItem && numF && numItem === numF) return true;                 // 1. mismo número correlativo
    const normF = normaliza(rawItem);
    const normFSys = normaliza(f.sistema);
    if (normItem && normF && normItem === normF) return true;               // 2. mismo texto
    if (normItem && normF) {                                                // 3. texto contenido
      if (normF.startsWith(normItem) || normItem.startsWith(normF)) return true;
      if (normItem.length >= 7 && normF.includes(normItem)) return true;
      if (normF.length >= 7 && normItem.includes(normF)) return true;
    }
    if (normFSys && (normFSys === normSys || normFSys.includes(normSys) || normSys.includes(normFSys))) {   // 4. mismo sistema y palabra clave
      const pItem = normItem.split(' ').filter(w => w.length >= 3 && !PALABRAS_VACIAS.has(w));
      const pF = normF.split(' ').filter(w => w.length >= 3 && !PALABRAS_VACIAS.has(w));
      if (pItem.length && pF.length && pItem.some(w => pF.includes(w))) return true;
    }
    return false;
  });
}

/** Número del ítem en la columna Nº del detalle (el del catálogo cuando la falla no lo trae) */
export function numeroFalla(falla: FallaGuardada, esTracto: boolean, cfg: ConfigSistemas): string {
  const raw = String(falla.item ?? '').trim();
  const directo = numeroDe(raw);
  if (directo) return directo;
  if (falla.sistema === 'MANUAL' || raw.includes('Falla Manual')) return 'MAN';
  for (const s of esTracto ? cfg.tracto : cfg.remolque) {
    for (const it of s.items.map(textoItem)) {
      if (coincide(it, s.key, [falla])) { const n = numeroDe(it); if (n) return n; }
    }
  }
  return raw.match(/\d+/)?.[0].padStart(2, '0') ?? '—';
}

const fecha = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const kmTxt = (v: unknown) => (Number(v) > 0 ? Number(v).toLocaleString('es-PE') : '');

/** HTML del formato F-MAN-001 para un reporte */
export function htmlFman(r: ReporteFalla, cfg: ConfigSistemas, logo: string = LOGO_FMAN): string {
  const fT = leerFallas(r.fallas_tracto_json);
  const fR = leerFallas(r.fallas_remolque_json);
  const folio = r.folio || `F-${String(r.id).padStart(5, '0')}`;
  const kmIni = kmTxt(r.km_inicial) || '—';
  const kmFin = kmTxt(r.km_final) || kmIni;
  const horas = r.horas_motor ? String(r.horas_motor) : '—';
  const fechaFmt = fecha(r.fecha_reporte);

  const itemT = (it: string, clave: string) => coincide(it, clave, fT)
    ? `<div class="chk-item"><span class="box-x">[ ✕ ]</span> <span class="text-danger font-bold">${esc(it)}</span></div>`
    : `<div class="chk-item"><span class="box-v">[ ✓ ]</span> <span>${esc(it)}</span></div>`;
  const itemR = (it: string, clave: string) => coincide(it, clave, fR)
    ? `<div class="chk-item"><span class="box-x">[ ✕ ]</span> <span class="text-danger font-bold">${esc(it)}</span></div>`
    : `<div class="chk-item"><span class="box-v">[ ✓ ]</span> <span>${esc(it)}</span></div>`;
  const col = (titulo: string, items: string[], fn: (it: string) => string) =>
    `<div class="sys-title">${esc(titulo)}</div>${items.map(fn).join('')}`;

  // Detalle de fallas del tracto: dos columnas de 7 filas como mínimo
  const filasT = Math.max(7, Math.ceil(fT.length / 2));
  let detalleT = '';
  for (let i = 0; i < filasT; i++) {
    const a = fT[i]; const b = fT[i + filasT];
    detalleT += `<tr>
      <td class="text-center font-bold text-danger" style="width:6%; font-size:10px;">${a ? esc(numeroFalla(a, true, cfg)) : ''}</td>
      <td style="width:44%;">${a ? esc(a.obs || a.item) : ''}</td>
      <td class="text-center font-bold text-danger" style="width:6%; font-size:10px;">${b ? esc(numeroFalla(b, true, cfg)) : ''}</td>
      <td style="width:44%;">${b ? esc(b.obs || b.item) : ''}</td></tr>`;
  }
  // Detalle de fallas de la carreta: T / S marca la unidad de la falla
  const filasR = Math.max(7, Math.ceil(fR.length / 2));
  let detalleR = '';
  for (let i = 0; i < filasR; i++) {
    const a = fR[i]; const b = fR[i + filasR];
    detalleR += `<tr>
      <td class="text-center" style="width:3%;"> </td><td class="text-center" style="width:3%;">${a ? 'S' : ''}</td>
      <td class="text-center font-bold text-danger" style="width:6%; font-size:10px;">${a ? esc(numeroFalla(a, false, cfg)) : ''}</td>
      <td style="width:38%;">${a ? esc(a.obs || a.item) : ''}</td>
      <td class="text-center" style="width:3%;"> </td><td class="text-center" style="width:3%;">${b ? 'S' : ''}</td>
      <td class="text-center font-bold text-danger" style="width:6%; font-size:10px;">${b ? esc(numeroFalla(b, false, cfg)) : ''}</td>
      <td style="width:38%;">${b ? esc(b.obs || b.item) : ''}</td></tr>`;
  }

  const firma = r.firma_conductor
    ? `<img src="${esc(r.firma_conductor)}" alt="Firma Conductor">`
    : '<span style="color:#94a3b8; font-size:9px;">(Sin firma digital)</span>';

  return `<div class="fman"><div class="page-a4">
    <div>
      <table class="iso-header"><tr>
        <td class="logo-cell" rowspan="3"><img src="${esc(logo)}" alt="Logo" style="max-width: 100%; max-height: 44px; object-fit: contain;"></td>
        <td class="title-cell" rowspan="3">REPORTE DE FALLAS FLOTA PESADA</td>
        <td class="qms-item"><b>CÓDIGO:</b> F-MAN-001</td></tr>
        <tr><td class="qms-item"><b>VERSIÓN:</b> 0</td></tr>
        <tr><td class="qms-item"><b>EMISIÓN:</b> 10/11/2025</td></tr>
      </table>
      <div class="folio-banner">Nº ${esc(folio)}</div>
    </div>

    <div>
      <div class="blue-bar"><span>DATOS DE TRACTO Y CONDUCTOR</span><span>O.S. ${esc(r.orden_servicio ?? '—')}</span></div>
      <table class="table-grid">
        <tr>
          <td class="bg-light-blue" style="width:14%;">PROCEDENCIA:</td><td style="width:36%;">${esc(r.procedencia || '—')}</td>
          <td class="bg-light-blue text-center" style="width:16%;">DATOS UNIDAD</td><td class="bg-light-blue text-center" style="width:11%;">PLACA</td>
          <td class="bg-light-blue text-center" style="width:11%;">KM INICIAL</td><td class="bg-light-blue text-center" style="width:12%;">KM FINAL / HRS</td>
        </tr>
        <tr>
          <td class="bg-light-blue">CONDUCTOR:</td><td class="font-bold">${esc(r.conductor || '—')}</td>
          <td class="text-center font-bold">TRACTO</td><td class="text-center font-bold" style="color:#0056b3; font-size:11px;">${esc(r.placa_tracto || '—')}</td>
          <td class="text-center font-bold">${esc(kmIni)}</td><td class="text-center font-bold">${esc(kmFin)}</td>
        </tr>
        <tr>
          <td class="bg-light-blue">FECHA:</td><td>${esc(fechaFmt)}</td>
          <td class="text-center font-bold">REMOLQUE</td><td class="text-center font-bold" style="color:#0056b3; font-size:11px;">${esc(r.placa_remolque || '—')}</td>
          <td class="text-center">${horas !== '—' ? 'HRS: ' + esc(horas) : '—'}</td><td class="text-center">—</td>
        </tr>
      </table>
    </div>

    <div>
      <div class="sub-instructions">1.- MARQUE CON "✓" SI SE ENCUENTRA EN BUEN ESTADO, MARQUE CON "X" SI SE PRESENTA OBSERVACIÓN, LUEGO DETALLE LA OCURRENCIA EN EL RECUADRO COLOCANDO EL NÚMERO DEL ÍTEM OBSERVADO.</div>
      <div class="checklist-4col">
        <div class="col-sys">${col('MOTOR', sistema(cfg.tracto, 'motor'), it => itemT(it, 'motor'))}</div>
        <div class="col-sys">${col('CAJA - CORONAS', sistema(cfg.tracto, 'caja'), it => itemT(it, 'caja'))}</div>
        <div class="col-sys">${col('REFRIGERACIÓN', sistema(cfg.tracto, 'refri'), it => itemT(it, 'refri'))}
          <div class="sys-title" style="margin-top:2px;">DIRECCIÓN</div>${sistema(cfg.tracto, 'direccion').map(it => itemT(it, 'direccion')).join('')}</div>
        <div class="col-sys">${col('CABINA Y CHASIS', sistema(cfg.tracto, 'cabina'), it => itemT(it, 'cabina'))}</div>
      </div>
      <table class="table-fallas">
        <thead><tr><th style="width:6%;">Nº</th><th style="width:44%;">DETALLE DE FALLA DE TRACTO</th><th style="width:6%;">Nº</th><th style="width:44%;">DETALLE DE FALLA DE TRACTO</th></tr></thead>
        <tbody>${detalleT}</tbody>
      </table>
    </div>

    <div>
      <div class="sub-instructions">2.- MARQUE CON "✓" SI SE ENCUENTRA EN BUEN ESTADO, MARQUE CON "X" SI SE PRESENTA OBSERVACIÓN, LUEGO DETALLE LA OCURRENCIA EN EL RECUADRO MARCANDO "T" O "S" SI LA OBSERVACIÓN CORRESPONDE AL TRACTO O A LA CARRETA.</div>
      <div class="checklist-4col">
        <div class="col-sys">${col('FRENOS', sistema(cfg.remolque, 'frenos'), it => itemR(it, 'frenos'))}
          <div class="sys-title" style="margin-top:2px;">CARRETA</div>${sistema(cfg.remolque, 'carreta').map(it => itemR(it, 'carreta')).join('')}</div>
        <div class="col-sys">${col('SISTEMA ELÉCTRICO', sistema(cfg.remolque, 'electrico'), it => itemR(it, 'electrico'))}</div>
        <div class="col-sys">${col('SUSPENSIÓN', sistema(cfg.remolque, 'suspension'), it => itemR(it, 'suspension'))}
          <div class="sys-title" style="margin-top:2px;">FURGÓN</div>${sistema(cfg.remolque, 'furgon').map(it => itemR(it, 'furgon')).join('')}</div>
        <div class="col-sys">${col('LLANTAS & ACCESORIOS', sistema(cfg.remolque, 'llantas').slice(0, 8), it => itemR(it, 'llantas'))}
          <div class="sys-title" style="margin-top:2px;">TERMOKING / OTROS</div>${sistema(cfg.remolque, 'termoking').slice(0, 7).map(it => itemR(it, 'termoking')).join('')}</div>
      </div>
      <table class="table-fallas">
        <thead><tr><th style="width:3%;">T</th><th style="width:3%;">S</th><th style="width:6%;">Nº</th><th style="width:38%;">FALLAS CARRETA</th>
          <th style="width:3%;">T</th><th style="width:3%;">S</th><th style="width:6%;">Nº</th><th style="width:38%;">FALLAS CARRETA</th></tr></thead>
        <tbody>${detalleR}</tbody>
      </table>
    </div>

    <div>
      <div class="blue-bar"><span>3.- CONFORMIDAD DEL REPORTE</span></div>
      <div class="conformidad-box">
        <div class="sign-col"><div class="sign-img-area">${firma}</div><div class="sign-footer-text">FIRMA DEL CONDUCTOR</div></div>
        <div class="sign-col"><div class="sign-img-area"></div><div class="sign-footer-text">SELLO Y FIRMA DE MANTENIMIENTO</div></div>
      </div>
    </div>
  </div></div>`;
}

/**
 * PDF del formato F-MAN-001 para compartir o descargar. La hoja mide A4 (210 × 296 mm) y va en flujo normal
 * sin márgenes: con márgenes de 10 mm el área útil es menor que la hoja y se cortaban la derecha y el final.
 */
export async function pdfFman(r: ReporteFalla, cfg: ConfigSistemas): Promise<Blob> {
  return conElemento(htmlFman(r, cfg), el => generarPDFBlob(el, { orientacion: 'portrait', margen: 0 }));
}

/** Texto que acompaña el PDF por WhatsApp (el mismo que usa la versión actual) */
export function textoFman(r: ReporteFalla): string {
  const total = leerFallas(r.fallas_tracto_json).length + leerFallas(r.fallas_remolque_json).length;
  return `Estimados,\n\nAdjunto compartimos el Reporte de Fallas Oficial F-MAN-001 N° ${r.folio} emitido desde el ERP.\n\n` +
    `• Unidad Tracto: ${r.placa_tracto || '—'}\n• Semirremolque: ${r.placa_remolque || 'Sin carreta'}\n• Conductor: ${r.conductor || 'No asignado'}\n` +
    `• Fecha de Emisión: ${fecha(r.fecha_reporte)}\n• Total Fallas Detectadas: ${total}\n\nSaludos cordiales,\nEquipo de Mantenimiento y Operaciones`;
}
