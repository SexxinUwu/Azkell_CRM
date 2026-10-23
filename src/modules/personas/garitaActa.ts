// Garita: acta del registro de control (F-SEG-002) en HTML para imprimir/guardar PDF y compartir.
// Replica el acta del clásico (modulos/seguridad/unidades/logica.js: _sguBuildPageHtml / Completo).
// Usa las clases de Tailwind de /libs/tailwind.min.js dentro de una ventana o iframe aparte, igual que el clásico.
import { api } from '../../core/api/client';

export type FaseActa = 'salida' | 'retorno' | 'completo';
type Chk = Record<string, string | number | undefined>;
interface ItemTpl { id: string; label: string }
interface CatTpl { id?: string; titulo?: string; items?: ItemTpl[] }

export interface RegistroActa {
  id: string; placa_tracto: string; placa_carreta: string | null; conductor: string; destino: string | null;
  salida_fecha: string | null; salida_hora: string | null; salida_km: number | null; salida_observaciones: string | null; salida_has_alert: number | boolean;
  retorno_fecha: string | null; retorno_hora: string | null; retorno_km: number | null; retorno_observaciones: string | null; retorno_has_alert: number | boolean;
  retorno_conductor?: string | null; retorno_placa_carreta?: string | null; creado_por: string | null; retorno_creado_por: string | null;
  salida_checklist_json?: Chk | null; retorno_checklist_json?: Chk | null; salida_template_json?: CatTpl[] | null; retorno_template_json?: CatTpl[] | null;
  firma_salida_conductor?: string | null; firma_salida_vigilancia?: string | null; firma_retorno_conductor?: string | null; firma_retorno_vigilancia?: string | null;
  fotos?: unknown[];
}
interface EstadoDoc { estado: string; pdfBg: string; pdfColor: string; fechaFmt: string }
export interface DocsVehiculo { soat: EstadoDoc | null; rt: EstadoDoc | null }
export interface FotoActa { tipo: string; url?: string; b64?: string }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const num = (v: unknown) => Number(v).toLocaleString('es-PE');
const pad = (x: number) => String(x).padStart(2, '0');
const BORDE = 'border:1.5px solid #0F172A;';

// ── Vigencias de SOAT y revisión técnica (misma lógica que el clásico) ──
function parsearFecha(raw: unknown): { fechaFmt: string; time: number } | null {
  const s = String(raw ?? '').trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; if (y === 2000 && m === 1 && d === 1) return null; }
  else if ((r = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else {
    const dt = new Date(s);
    if (isNaN(dt.getTime())) return null;
    y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
    if (y === 2000 && m === 1 && d === 1) return null;
  }
  return { fechaFmt: `${pad(d)}/${pad(m)}/${y}`, time: new Date(y, m - 1, d).getTime() };
}

function estadoDoc(raw: unknown): EstadoDoc | null {
  const p = parsearFecha(raw);
  if (!p) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dias = Math.ceil((p.time - hoy.getTime()) / 86_400_000);
  if (dias < 0) return { estado: 'VENCIDO', pdfBg: '#DC2626', pdfColor: '#FFFFFF', fechaFmt: p.fechaFmt };
  if (dias <= 15) return { estado: 'PRÓXIMO A VENCER', pdfBg: '#F59E0B', pdfColor: '#000000', fechaFmt: p.fechaFmt };
  return { estado: 'VIGENTE', pdfBg: '#15803D', pdfColor: '#FFFFFF', fechaFmt: p.fechaFmt };
}

/** SOAT y revisión técnica de una placa, desde /vehiculos-flota */
export async function docsDeVehiculos(flota: Array<Record<string, unknown>>, placa?: string | null): Promise<DocsVehiculo | null> {
  if (!placa) return null;
  const p = placa.trim().toUpperCase();
  const v = flota.find(x => String(x.placa ?? '').trim().toUpperCase() === p);
  if (!v) return { soat: null, rt: null };
  return {
    soat: estadoDoc(v.soat_vencimiento ?? v.soat_f_vencimiento ?? v.fecha_vencimiento_soat),
    rt: estadoDoc(v.rt_vencimiento ?? v.rt_f_vencimiento ?? v.fecha_vencimiento_rt ?? v.citv_vencimiento),
  };
}

export async function cargarFlotaDocs(): Promise<Array<Record<string, unknown>>> {
  try { const r = await api<Array<Record<string, unknown>>>('/vehiculos-flota'); return Array.isArray(r) ? r : []; } catch { return []; }
}

/** Fotos del registro con URL firmada vigente, convertidas a base64 para que salgan en el PDF */
export async function fotosParaActa(id: string, respaldo: unknown[] = []): Promise<FotoActa[]> {
  let fotos = respaldo as FotoActa[];
  try {
    const r = await api<FotoActa[]>(`/seguridad/unidades/${encodeURIComponent(id)}/fotos-presigned`);
    if (Array.isArray(r) && r.length) fotos = r;
  } catch { /* se usan las fotos de la lista */ }
  return Promise.all(fotos.map(async f => {
    const url = f.b64 || f.url || '';
    if (!url || url.startsWith('data:')) return { tipo: f.tipo, b64: url };
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const b64 = await new Promise<string>((ok, mal) => { const rd = new FileReader(); rd.onloadend = () => ok(String(rd.result)); rd.onerror = mal; rd.readAsDataURL(blob); });
      return { tipo: f.tipo, b64 };
    } catch { return { tipo: f.tipo, b64: url }; }
  }));
}

// ── Piezas del acta ──
const logo = () => {
  let u = '';
  try { u = localStorage.getItem('fleet_empresa_logo') || ''; } catch { /* sin almacenamiento */ }
  return u || (window as unknown as { _LOGO_BASE64?: string })._LOGO_BASE64 || '';
};

const encabezadoLogo = () => {
  const l = logo();
  return `<div class="col-span-3 p-2 flex flex-col items-center justify-center bg-white text-center" style="grid-column:span 3 / span 3;border-right:1.5px solid #0F172A;">`
    + (l ? `<img src="${esc(l)}" style="max-height:36px;max-width:115px;object-fit:contain;" crossorigin="anonymous">`
      : '<div class="flex items-center gap-1.5 mb-0.5"><svg viewBox="0 0 40 40" fill="none" style="width:24px;height:24px;"><path d="M10 32C10 20 18 10 20 8C20 16 14 26 10 32Z" fill="#15803D"/><path d="M18 32C18 18 26 8 28 6C28 15 22 25 18 32Z" fill="#22C55E"/><path d="M26 32C26 21 33 13 35 11C35 19 30 27 26 32Z" fill="#F97316"/></svg><span class="text-sm font-extrabold tracking-tight text-slate-900 leading-none">Marsisa</span></div>')
    + '<span class="text-[7.5px] font-semibold tracking-wider text-slate-500 uppercase">Transporte &amp; Logística</span></div>';
};

const filaMeta = (k: string, v: string, o: { ultima?: boolean; fondo?: string; mono?: boolean; k?: string } = {}) =>
  `<div class="px-2 py-1 flex items-center justify-between ${o.fondo ?? 'bg-white'}"${o.ultima ? '' : ' style="border-bottom:1.5px solid #0F172A;"'}><span class="font-bold text-slate-700 text-[9.5px] uppercase">${k}:</span><span class="${o.mono ? 'font-mono ' : ''}font-bold text-slate-900 text-[10.5px]">${v}</span></div>`;

const filaCtl = (k: string, v: string, ultima = false) =>
  `<div class="px-2 py-0.5 flex items-center justify-between"${ultima ? '' : ' style="border-bottom:1.5px solid #0F172A;"'}><span class="font-bold text-slate-600 uppercase text-[9px]">${k}:</span><span class="font-mono font-bold text-slate-900">${esc(v)}</span></div>`;

const cabecera = (titulo: string, sub: string, emision: string, columnas: string) =>
  `<header class="doc-grid-box rounded-lg overflow-hidden bg-white mb-2.5" style="${BORDE}">`
  + `<div class="grid grid-cols-12" style="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));border-bottom:1.5px solid #0F172A;">${encabezadoLogo()}`
  + `<div class="col-span-6 p-2 flex flex-col items-center justify-center text-center bg-slate-50/50" style="grid-column:span 6 / span 6;border-right:1.5px solid #0F172A;"><h1 class="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight uppercase leading-tight">${titulo}</h1><p class="text-[9.5px] font-semibold text-slate-600 tracking-normal mt-0.5 uppercase">${sub}</p></div>`
  + `<div class="col-span-3 text-[9.5px] flex flex-col bg-white" style="grid-column:span 3 / span 3;">${filaCtl('Código', 'F-SEG-002')}${filaCtl('Versión', '01')}${filaCtl('F. Emisión', emision, true)}</div></div>`
  + `<div class="grid grid-cols-3 text-[10.5px]" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));">${columnas}</div></header>`;

const chipDoc = (icono: string, color: string, nombre: string, d: EstadoDoc) =>
  `<div class="flex items-center justify-between p-1 rounded-md bg-slate-50 border border-slate-200"><div class="flex items-center gap-1.5"><span class="${color} font-bold">${icono}</span><div class="leading-tight"><span class="font-bold text-slate-800 text-[10px] block">${nombre}</span><span class="text-[9.5px] text-slate-500">Vence el <strong class="text-slate-800">${d.fechaFmt}</strong></span></div></div><span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold" style="background:${d.pdfBg};color:${d.pdfColor};">${d.estado}</span></div>`;

function bloqueDocs(titulo: string, docs: DocsVehiculo | null, aplica: boolean, nombreSoat: string, sinUnidad: string, borde: boolean) {
  let cuerpo: string;
  if (!aplica) cuerpo = `<div class="text-slate-400 italic text-[10px] py-3 text-center">${sinUnidad}</div>`;
  else {
    const partes = [docs?.soat ? chipDoc('✔', 'text-emerald-600', nombreSoat, docs.soat) : '', docs?.rt ? chipDoc('📋', 'text-sky-600', 'Revisión Técnica', docs.rt) : ''].join('');
    cuerpo = `<div class="space-y-1">${partes || '<div class="text-slate-400 italic text-[10px] py-2 text-center">Sin documentos registrados</div>'}</div>`;
  }
  return `<div class="p-2 bg-white"${borde ? ' style="border-right:1.5px solid #0F172A;"' : ''}><div class="flex items-center gap-1.5 mb-1.5 font-bold text-slate-900 text-[10.5px] uppercase"><span>${titulo}</span></div>${cuerpo}</div>`;
}

const seccionDocs = (rec: RegistroActa, docT: DocsVehiculo | null, docC: DocsVehiculo | null, carreta: string, hayCarreta: boolean) =>
  `<section class="mb-2.5 doc-grid-box rounded-lg overflow-hidden bg-white" style="${BORDE}">`
  + '<div class="px-3 py-1 text-white flex items-center justify-between" style="background:#0F172A;"><h2 class="text-[10.5px] font-bold uppercase tracking-wider text-white">Estado Documental Informativo (SOAT &amp; Revisión Técnica)</h2><span class="text-[8.5px] font-medium text-slate-300 font-mono">CONSULTA VIGENCIAS MTC</span></div>'
  + '<div class="grid grid-cols-2 text-xs" style="display:grid;grid-template-columns:1fr 1fr;">'
  + bloqueDocs(`TRACTO / CAMIÓN (${esc(rec.placa_tracto)})`, docT, true, 'SOAT', '', true)
  + bloqueDocs(`CARRETA / REMOLQUE (${esc(carreta)})`, docC, hayCarreta, 'SOAT / Seguro', 'No aplica / Sin semirremolque acoplado.', false)
  + '</div></section>';

const aviso = (titulo: string, texto: string) =>
  `<div class="doc-grid-box rounded-lg p-2 mb-2.5 flex items-start gap-2" style="${BORDE}background:#FEF2F2;"><div class="rounded-md text-white flex items-center justify-center shrink-0 mt-0.5" style="width:16px;height:16px;background:#DC2626;font-size:11px;font-weight:800;">!</div><div><span class="text-[10.5px] font-extrabold text-red-700 block uppercase tracking-wide">${titulo}</span><p class="text-[9.5px] text-red-600 font-medium leading-normal mt-0.5">${esc(texto)}</p></div></div>`;

const esMal = (v: string) => v === 'MAL' || v === 'NO CONFORME' || v === 'OBS';
const valorChk = (c: Chk, id: string) => (c[id] ? String(c[id]).toUpperCase() : '');
const cantChk = (c: Chk, id: string) => (c[`${id}_cant`] !== undefined && c[`${id}_cant`] !== '' ? String(c[`${id}_cant`]) : '-');

function chipEstado(v: string, chico: boolean) {
  const t = chico ? 'text-[8px]' : 'text-[8.5px]';
  if (esMal(v)) return `<span class="${t} font-extrabold px-1.5 rounded inline-block" style="background:#DC2626;color:#fff;">MAL</span>`;
  if (v === 'OK' || v === 'CONFORME') return `<span class="${t} font-bold px-1.5 rounded inline-block" style="background:#D1FAE5;color:#047857;">OK</span>`;
  if (v === 'NA' || v === 'N/A') return `<span class="${t} font-semibold text-slate-600 bg-slate-200 px-1.5 rounded inline-block">N/A</span>`;
  return `<span class="${t} font-medium text-slate-400 bg-slate-100 px-1.5 rounded inline-block">-</span>`;
}

const GRID12 = 'display:grid;grid-template-columns:repeat(12,minmax(0,1fr));';
const span = (n: number, extra = '') => `grid-column:span ${n} / span ${n};${extra}`;

/** Reparte las categorías en dos columnas con igual cantidad de ítems */
function dosColumnas(template: CatTpl[]): [CatTpl[], CatTpl[]] {
  const total = template.reduce((s, c) => s + (c.items ?? []).length, 0);
  const a: CatTpl[] = [], b: CatTpl[] = [];
  let n = 0;
  template.forEach(c => { if (n < total / 2 || a.length === 0) { a.push(c); n += (c.items ?? []).length; } else b.push(c); });
  return [a, b];
}

/** Detalle del checklist: una fase (3 columnas) o ida contra vuelta (5 columnas) */
function detalleChecklist(template: CatTpl[], ida: Chk, vta: Chk | null) {
  const contraste = vta !== null;
  const col = (cats: CatTpl[], derecha: boolean) => `<div style="${derecha ? '' : 'border-right:1.5px solid #0F172A;'}">${cats.map(cat => {
    const cab = contraste
      ? `<div class="px-1.5 py-0.5 text-[8px] font-extrabold text-slate-700 uppercase text-center" style="${GRID12}background:#E2E8F0;border-bottom:1px solid #CBD5E1;"><div style="${span(4, 'text-align:left;')}">Componente</div><div style="${span(2)}">Cant. Ida</div><div style="${span(2)}">Est. Ida</div><div style="${span(2)}">Cant. Vta</div><div style="${span(2)}">Est. Vta</div></div>`
      : `<div class="px-2 py-0.5 text-[8.5px] font-extrabold text-slate-700 uppercase" style="${GRID12}background:#E2E8F0;border-bottom:1px solid #CBD5E1;"><div style="${span(7)}">Componente / Ítem</div><div style="${span(2, 'text-align:center;')}">Cant.</div><div style="${span(3, 'text-align:center;')}">Estado</div></div>`;
    const filas = (cat.items ?? []).map(it => {
      const vi = valorChk(ida, it.id), vv = contraste ? valorChk(vta, it.id) : '';
      const mal = esMal(vi) || esMal(vv);
      const fondo = mal ? 'background:#FEF2F2;border-left:3px solid #DC2626;' : '';
      const etq = esc(it.label);
      return contraste
        ? `<div class="items-center px-1.5 py-0.5" style="${GRID12}min-height:20px;${fondo}border-bottom:1px solid #F1F5F9;"><div class="font-medium text-slate-800 text-[9px]" style="${span(4)}">${etq}</div><div class="text-center font-bold text-slate-700 text-[9px]" style="${span(2, 'text-align:center;')}">${esc(cantChk(ida, it.id))}</div><div style="${span(2, 'text-align:center;')}">${chipEstado(vi, true)}</div><div class="font-bold text-slate-700 text-[9px]" style="${span(2, 'text-align:center;')}">${esc(cantChk(vta, it.id))}</div><div style="${span(2, 'text-align:center;')}">${chipEstado(vv, true)}</div></div>`
        : `<div class="items-center px-2 py-0.5" style="${GRID12}min-height:20px;${fondo}border-bottom:1px solid #F1F5F9;"><div class="font-medium text-slate-800 text-[9.5px]" style="${span(7)}">${etq}</div><div class="font-bold text-slate-700 text-[9.5px]" style="${span(2, 'text-align:center;')}">${esc(cantChk(ida, it.id))}</div><div style="${span(3, 'text-align:center;')}">${chipEstado(vi, false)}</div></div>`;
    }).join('');
    return `<div class="px-2 py-0.5 font-extrabold text-slate-800 text-[9.5px] uppercase tracking-wider" style="background:#F1F5F9;border-bottom:1px solid #CBD5E1;border-top:1px solid #CBD5E1;">${esc(cat.titulo || 'CATEGORÍA')}</div>${cab}${filas}`;
  }).join('')}</div>`;

  const [a, b] = dosColumnas(template);
  return `<section class="doc-grid-box rounded-lg overflow-hidden bg-white mb-2.5" style="${BORDE}"><div class="px-3 py-1 text-white text-center" style="background:#0F172A;"><h2 class="text-[11px] font-extrabold uppercase tracking-widest text-white">${contraste ? 'Detalle de Inspección Técnica y Contraste (Ida vs Vuelta)' : 'Detalle de Inspección Técnica y Equipamiento'}</h2></div>`
    + (template.length ? `<div class="grid grid-cols-2 text-[10px]" style="display:grid;grid-template-columns:1fr 1fr;">${col(a, false)}${col(b, true)}</div>`
      : '<div class="p-4 text-center text-slate-400 italic text-[10px]">No se registró detalle de checklist en esta fase.</div>')
    + '</section>';
}

const trazoFirma = (alt: boolean) => `<svg class="text-slate-900" style="width:120px;height:24px;stroke:currentColor;fill:none;stroke-width:1.8;" viewBox="0 0 140 40"><path d="${alt ? 'M20 30 Q 40 4 60 14 T 90 28 T 120 10' : 'M15 28 Q 35 4 55 18 T 95 24 T 125 12'}"/></svg>`;

const cajaFirma = (img: string | null | undefined, rol: string, sub: string, alt: boolean, chico: boolean) =>
  `<div class="p-2 rounded-xl flex flex-col items-center justify-between text-center" style="border:1px solid #E2E8F0;background:#F8FAFC;min-height:${chico ? 70 : 75}px;"><div class="flex items-center justify-center" style="height:30px;">${img ? `<img src="${esc(img)}" style="max-height:${chico ? 24 : 28}px;max-width:${chico ? 95 : 140}px;object-fit:contain;" crossorigin="anonymous">` : trazoFirma(alt)}</div><div class="w-full pt-1" style="border-top:1px solid #E2E8F0;"><span class="${chico ? 'text-[9px]' : 'text-[10px]'} font-extrabold text-slate-900 block uppercase tracking-tight">${rol}</span><span class="${chico ? 'text-[8px]' : 'text-[9px]'} text-slate-500 font-medium block">${esc(sub)}</span></div></div>`;

const pieFirmas = (titulo: string, cajas: string, cols: number) =>
  `<footer class="doc-grid-box rounded-lg p-2.5 bg-white" style="${BORDE}"><div class="flex items-center gap-1.5 mb-2 pb-1" style="border-bottom:1px solid #E2E8F0;"><span class="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-700">${titulo}</span></div><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:${cols === 4 ? 8 : 10}px;">${cajas}</div></footer>`;

const marco = (cuerpo: string) => `<main class="report-page w-full max-w-[840px] bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 text-slate-900 mx-auto" style="box-sizing:border-box;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;">${cuerpo}</main>`;

const hoyFmt = () => { const d = new Date(); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };

function actaFase(rec: RegistroActa, tipo: 'salida' | 'retorno', docT: DocsVehiculo | null, docC: DocsVehiculo | null) {
  const sal = tipo === 'salida';
  const chk = (sal ? rec.salida_checklist_json : rec.retorno_checklist_json) ?? {};
  const tpl = (sal ? rec.salida_template_json : rec.retorno_template_json) ?? [];
  const fecha = sal ? rec.salida_fecha : rec.retorno_fecha;
  const hora = sal ? rec.salida_hora : rec.retorno_hora;
  const km = sal ? rec.salida_km : rec.retorno_km;
  const conductor = (!sal && rec.retorno_conductor) || rec.conductor || '---';
  const carreta = (!sal && rec.retorno_placa_carreta) || rec.placa_carreta || '---';
  const obsRaw = ((sal ? rec.salida_observaciones : (rec.retorno_observaciones || rec.salida_observaciones)) || '').trim();
  const obs = obsRaw ? obsRaw.toUpperCase() : 'SIN OBSERVACIONES';
  const malos: string[] = [];
  tpl.forEach(c => (c.items ?? []).forEach(it => { if (esMal(valorChk(chk, it.id))) malos.push(it.label); }));
  const alerta = !!(sal ? rec.salida_has_alert : rec.retorno_has_alert) || malos.length > 0;
  const fase = sal ? 'SALIDA (IDA)' : 'RETORNO (VUELTA)';
  const estado = alerta
    ? '<span class="font-bold text-red-600 text-[10.5px] uppercase">● Con Observaciones</span>'
    : '<span class="font-bold text-emerald-600 text-[10.5px] uppercase">● Conforme</span>';

  const cols = `<div style="border-right:1.5px solid #0F172A;">${filaMeta('Nº Expediente', esc(rec.id), { mono: true })}${filaMeta('Conductor', esc(conductor))}${filaMeta('Fecha / Hora', `${esc(fecha || '--')} ${esc(hora || '')}`, { ultima: true, mono: true })}</div>`
    + `<div style="border-right:1.5px solid #0F172A;">${filaMeta('Placa Tracto', esc(rec.placa_tracto), { mono: true })}${filaMeta('Fase', fase)}${filaMeta('Kilometraje', km ? `${num(km)} KM` : '---', { ultima: true, mono: true })}</div>`
    + `<div>${filaMeta('Placa Carreta', esc(carreta), { mono: true })}${filaMeta('Destino', esc(rec.destino || '---'))}${filaMeta('Estado', estado, { ultima: true, fondo: alerta ? 'bg-rose-50/70' : 'bg-emerald-50/50' })}</div>`;

  const hayCarreta = !!(rec.placa_carreta || (!sal && rec.retorno_placa_carreta));
  return marco(
    cabecera('Checklist de Inspección Vehicular', 'Control de Seguridad, Ingreso y Salida de Unidades', fecha || hoyFmt(), cols)
    + seccionDocs(rec, docT, docC, carreta, hayCarreta)
    + (alerta ? aviso('Atención: Se reportaron novedades / anomalías en la revisión técnica de la unidad',
      obs !== 'SIN OBSERVACIONES' ? obs : (malos.length ? `Observaciones registradas en: ${malos.join(', ')}` : 'Los certificados físicos de revisión técnica del tracto y carreta no fueron presentados físicamente durante la verificación.')) : '')
    + detalleChecklist(tpl, chk, null)
    + `<div class="doc-grid-box rounded-lg px-3 py-1.5 mb-2.5 bg-white flex items-center justify-between text-[10.5px]" style="${BORDE}"><div class="flex items-center gap-2"><span class="font-extrabold text-slate-800 uppercase text-[10px]">Observaciones:</span><span class="font-bold ${obs === 'SIN OBSERVACIONES' ? 'text-slate-500' : 'text-slate-900'} uppercase tracking-wide">${esc(obs)}</span></div><span class="text-[9px] font-mono text-slate-400">Auditoría Conforme</span></div>`
    + pieFirmas(`Firmas Digitales de ${sal ? 'Salida' : 'Retorno'}`,
      cajaFirma(sal ? rec.firma_salida_conductor : rec.firma_retorno_conductor, `Firma del Conductor (${sal ? 'Salida' : 'Retorno'})`, rec.conductor || '---', false, false)
      + cajaFirma(sal ? rec.firma_salida_vigilancia : rec.firma_retorno_vigilancia, 'Inspector de Seguridad / Vigilancia', `VoBo CONTROL ${sal ? 'DESPACHO' : 'RECEPCIÓN'}`, true, false), 2),
  );
}

function actaCompleta(rec: RegistroActa, docT: DocsVehiculo | null, docC: DocsVehiculo | null, plantillaGlobal: CatTpl[]) {
  const ida = rec.salida_checklist_json ?? {}, vta = rec.retorno_checklist_json ?? {};
  const tpl = rec.retorno_template_json ?? rec.salida_template_json ?? plantillaGlobal;
  const condS = rec.conductor || '---', condR = rec.retorno_conductor || rec.conductor || '---';
  const carS = rec.placa_carreta || '---', carR = rec.retorno_placa_carreta || rec.placa_carreta || '---';
  const carFull = carS === carR ? carS : `${carS} ➜ ${carR}`;
  const recorrido = rec.retorno_km && rec.salida_km ? Number(rec.retorno_km) - Number(rec.salida_km) : null;
  const alerta = !!(rec.salida_has_alert || rec.retorno_has_alert);
  const obsS = (rec.salida_observaciones || '').trim(), obsR = (rec.retorno_observaciones || '').trim();
  const estado = alerta
    ? '<span class="font-bold text-red-600 text-[10px] uppercase">● Con Obs.</span>'
    : '<span class="font-bold text-emerald-600 text-[10px] uppercase">● Conforme</span>';
  const mono = (v: string) => `<span class="font-mono text-[9.5px] text-slate-900">${v}</span>`;
  const fila = (k: string, v: string, ultima = false, fondo = 'bg-white') =>
    `<div class="px-2 py-0.5 flex items-center justify-between ${fondo}"${ultima ? '' : ' style="border-bottom:1.5px solid #0F172A;"'}><span class="font-bold text-slate-700 text-[9px] uppercase">${k}:</span>${v}</div>`;

  const cols = `<div style="border-right:1.5px solid #0F172A;">${filaMeta('Nº Expediente', esc(rec.id), { mono: true })}${filaMeta('Placa Tracto', esc(rec.placa_tracto), { mono: true })}${filaMeta('Carreta (Ida / Vta)', esc(carFull), { ultima: true, mono: true })}</div>`
    + `<div style="border-right:1.5px solid #0F172A;">${filaMeta('Conductor Ida', esc(condS))}${filaMeta('Conductor Vuelta', esc(condR))}${filaMeta('Destino / Ruta', esc(rec.destino || '---'), { ultima: true })}</div>`
    + `<div>${fila('Salida (Ida)', mono(`${esc(rec.salida_fecha || '--')} ${esc(rec.salida_hora || '')} (${rec.salida_km ? `${num(rec.salida_km)} km` : '0'})`))}`
    + `${fila('Llegada (Vta)', mono(`${esc(rec.retorno_fecha || '--')} ${esc(rec.retorno_hora || '')} (${rec.retorno_km ? `${num(rec.retorno_km)} km` : '--'})`))}`
    + `${fila('Recorrido Total', `<div class="flex items-center gap-1.5"><span class="font-mono font-bold text-slate-900">${recorrido !== null ? `${num(recorrido)} KM` : '---'}</span>${estado}</div>`, true, alerta ? 'bg-rose-50/70' : 'bg-emerald-50/50')}</div>`;

  const obsCelda = (k: string, v: string) => `<div><strong class="text-slate-800 uppercase text-[9.5px]">${k}:</strong> <span class="${v ? 'text-slate-900 font-semibold' : 'text-slate-500'}">${esc(v ? v.toUpperCase() : 'SIN OBSERVACIONES')}</span></div>`;
  return marco(
    cabecera('Expediente Integral de Inspección Vehicular', 'Control de Seguridad y Contraste de Unidades (Ida y Vuelta)', rec.retorno_fecha || rec.salida_fecha || hoyFmt(), cols)
    + seccionDocs(rec, docT, docC, carFull, !!(rec.placa_carreta || rec.retorno_placa_carreta))
    + (alerta ? aviso('Atención: Se reportaron anomalías u observaciones en la inspección', 'Se detectaron ítems observados o novedades registradas durante la auditoría de salida o retorno de la unidad.') : '')
    + detalleChecklist(tpl, ida, vta)
    + `<div class="doc-grid-box rounded-lg p-2 mb-2.5 bg-white text-[10px]" style="${BORDE}"><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">${obsCelda('Obs. Salida', obsS)}${obsCelda('Obs. Retorno', obsR)}</div></div>`
    + pieFirmas('Firmas Digitales de Conformidad (Despacho y Recepción)',
      cajaFirma(rec.firma_salida_conductor, 'Cond. Salida', condS, false, true)
      + cajaFirma(rec.firma_salida_vigilancia, 'Vig. Salida', rec.creado_por || 'Vigilancia', true, true)
      + cajaFirma(rec.firma_retorno_conductor, 'Cond. Retorno', condR, false, true)
      + cajaFirma(rec.firma_retorno_vigilancia, 'Vig. Retorno', rec.retorno_creado_por || rec.creado_por || 'Vigilancia', true, true), 4),
  );
}

function paginaFotos(fotos: FotoActa[], tipo: string) {
  const l = logo();
  return `<main class="report-page report-page-break w-full max-w-[840px] bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 text-slate-900 mx-auto" style="box-sizing:border-box;page-break-before:always;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;">`
    + `<header class="doc-grid-box rounded-lg overflow-hidden bg-white mb-3" style="${BORDE}"><div style="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));">`
    + `<div class="p-2.5 flex flex-col items-center justify-center bg-white text-center" style="grid-column:span 3 / span 3;border-right:1.5px solid #0F172A;">${l ? `<img src="${esc(l)}" style="max-height:36px;max-width:115px;object-fit:contain;" crossorigin="anonymous">` : '<span class="text-sm font-extrabold text-slate-900">Marsisa</span>'}</div>`
    + `<div class="p-2.5 flex flex-col items-center justify-center text-center bg-slate-50/50" style="grid-column:span 9 / span 9;"><h1 class="text-sm font-extrabold text-slate-900 tracking-tight uppercase">Evidencias Fotográficas — Fase ${tipo.toUpperCase()}</h1><p class="text-[10px] font-semibold text-slate-600 uppercase">Registro de Condiciones Visuales del Vehículo</p></div></div></header>`
    + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${fotos.map((f, i) =>
      `<div class="doc-grid-box rounded-lg p-2 bg-slate-50/50 text-center" style="${BORDE}"><div class="text-[10.5px] font-extrabold mb-1 uppercase text-slate-900">Evidencia ${i + 1}</div><img src="${esc(f.b64 || f.url)}" style="max-width:100%;max-height:180px;height:auto;object-fit:contain;display:block;margin:0 auto;border:1px solid #E2E8F0;border-radius:6px;"></div>`).join('')}</div></main>`;
}

/** HTML completo del acta: fase de salida, de retorno o expediente completo, más páginas de fotos */
export function htmlActaGarita(rec: RegistroActa, fase: FaseActa, o: { docT: DocsVehiculo | null; docC: DocsVehiculo | null; fotos: FotoActa[]; plantillaGlobal?: CatTpl[] }): string {
  const docC = o.docC ?? (rec.placa_carreta ? { soat: null, rt: null } : null);
  const docT = o.docT ?? { soat: null, rt: null };
  const cuerpo = fase === 'completo' ? actaCompleta(rec, docT, docC, o.plantillaGlobal ?? []) : actaFase(rec, fase, docT, docC);
  const fotosDe = (t: string) => o.fotos.filter(f => f.tipo === t && (f.b64 || f.url));
  const fases = fase === 'completo' ? ['salida', 'retorno'] : [fase];
  return cuerpo + fases.map(t => { const f = fotosDe(t); return f.length ? paginaFotos(f, t) : ''; }).join('');
}

/** Nombre del archivo: fecha - placas - km (igual que el clásico) */
export function nombreArchivoActa(rec: RegistroActa, fase: FaseActa): string {
  const ret = fase === 'retorno';
  const fecha = String((ret ? (rec.retorno_fecha || rec.salida_fecha) : rec.salida_fecha) || 'FECHA').slice(0, 10).replace(/\//g, '-').trim();
  const p1 = (rec.placa_tracto || 'TRACTO').trim();
  const p2 = (rec.placa_carreta || '').trim();
  const km = (ret ? (rec.retorno_km || rec.salida_km) : rec.salida_km) || '0';
  const placas = p2 && p2.toUpperCase() !== 'CARRETA' && p2 !== '-' ? `${p1} _ ${p2}` : p1;
  return `${fecha} - ${placas} - ${km} km.pdf`.replace(/[/\\?%*:|"<>]/g, '-');
}

// URL completa: dentro de una página blob: una ruta relativa como /libs/... no se resuelve y el acta salía sin estilos
const CABEZA = `<meta charset="UTF-8"><script src="${window.location.origin}/libs/tailwind.min.js"></script>`
  + `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">`;

/** Abre el acta en una pestaña con botón de imprimir (guardar como PDF), igual que el clásico */
export function abrirActaParaImprimir(html: string, titulo: string, placas: string, folio: string, imprimirYa: boolean) {
  const doc = `<!DOCTYPE html><html lang="es"><head>${CABEZA}<title>${esc(titulo)}</title><meta name="viewport" content="width=device-width, initial-scale=1.0">`
    + `<style>body{background:#F1F5F9;color:#0F172A;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}.doc-grid-box{border:1.5px solid #0F172A}.btn-action{transition:all .15s cubic-bezier(0.4,0,0.2,1)}.btn-action:hover{transform:translateY(-1px)}.btn-action:active{transform:scale(.98)}.report-page-break{page-break-before:always!important}`
    + `@media print{@page{size:A4 portrait;margin:4mm 5mm}body{background:#fff!important;padding:0!important;margin:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.no-print{display:none!important}.report-page{box-shadow:none!important;border:none!important;border-radius:0!important;padding:0!important;margin:0!important;width:100%!important;max-width:100%!important}}</style></head>`
    + `<body class="py-4 md:py-6 px-2 sm:px-4 flex flex-col items-center min-h-screen">`
    + `<nav class="no-print w-full max-w-[840px] mb-4 flex flex-wrap items-center justify-between gap-3 bg-white/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-200/80 shadow-xs">`
    + `<div class="flex items-center gap-3"><button onclick="window.close()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"><svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg><span>Cerrar Vista</span></button><div class="h-4 w-px bg-slate-200"></div><div class="flex items-center gap-2"><span class="text-xs font-bold text-slate-900 font-mono">${esc(placas || 'MARSISA SGC')}</span><span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase">${esc(folio || 'F-SEG-002')}</span></div></div>`
    + `<div class="flex items-center gap-2"><button onclick="window.print()" class="btn-action inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-medium rounded-xl shadow-xs transition"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg><span>Guardar / Descargar PDF (Vectorial HD)</span></button></div></nav>`
    + `<div class="w-full flex flex-col items-center gap-4">${html}</div>`
    + `<aside class="no-print mt-3 text-center text-[10px] text-slate-400">Azkell Fleet • Documento digital de control vehicular 2026</aside>`
    + (imprimirYa ? '<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>' : '')
    + `</body></html>`;
  const url = URL.createObjectURL(new Blob([doc], { type: 'text/html;charset=utf-8' }));
  const w = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return !!w;
}

/** Genera el PDF del acta en un iframe aparte (Tailwind + html2pdf), como el clásico, para compartirlo como archivo */
export function pdfBlobDeActa(html: string, nombre: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:840px;height:1200px;border:none;z-index:-999;';
    document.body.appendChild(iframe);
    const w = iframe.contentWindow;
    const d = w?.document;
    if (!w || !d) { iframe.remove(); reject(new Error('No se pudo preparar el PDF')); return; }
    d.open();
    d.write(`<!DOCTYPE html><html lang="es"><head>${CABEZA}<script src="/libs/html2pdf.bundle.min.js"></script>`
      + `<style>body{background:#fff;color:#0F172A;margin:0;padding:0;font-family:"Inter",-apple-system,sans-serif}.doc-grid-box{border:1.5px solid #0F172A}.report-page{width:100%;max-width:820px;box-sizing:border-box;padding:16px 20px;background:#fff;margin:0 auto}.report-page-break{page-break-before:always!important}</style></head>`
      + `<body><div id="acta-raiz" style="width:100%;max-width:820px;margin:0 auto;">${html}</div></body></html>`);
    d.close();
    iframe.onload = async () => {
      try {
        await new Promise(r => setTimeout(r, 900));
        const h2p = (w as unknown as { html2pdf?: () => { set(o: unknown): { from(e: unknown): { outputPdf(t: string): Promise<Blob> } } } }).html2pdf;
        const raiz = d.getElementById('acta-raiz');
        if (!h2p || !raiz) throw new Error('No se pudo cargar el generador de PDF');
        const blob = await h2p().set({
          margin: 0, filename: nombre, image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2.5, useCORS: true, logging: false, scrollX: 0, scrollY: 0, windowWidth: 840 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] },
        }).from(raiz).outputPdf('blob');
        resolve(blob);
      } catch (e) { reject(e); }
      finally { iframe.remove(); }
    };
  });
}
