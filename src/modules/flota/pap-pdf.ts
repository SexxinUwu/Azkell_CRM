// PDF de Papeletas: ficha de una papeleta (A4) y reporte de un listado (A4 horizontal). El HTML se arma aquí y el servidor lo convierte
// con Chromium (texto real, no imagen). Las evidencias (fotos) no entran: solo se ven en el detalle.
import { apiFetch } from '../../core/api/client';
import { pestanaConCamion } from '../../core/ui/CargaCamion';
import { ASUME_TXT, ESTADO_TXT, GRAVEDAD_TXT, TIPO_DOC_TXT, entidadTexto, fechaTxt, type Papeleta, type PapeletaDetalle } from './pap-api';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const dinero = (n: number, moneda: string) => `${moneda === 'USD' ? 'US$' : 'S/'} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function logoEmpresa(): string { try { return localStorage.getItem('fleet_empresa_logo') || ''; } catch { return ''; } }
async function aDataUrl(src: string): Promise<string> {
  if (!src || src.startsWith('data:')) return src;
  try {
    const blob = await (await fetch(src, { mode: 'cors' })).blob();
    return await new Promise<string>((ok, mal) => { const l = new FileReader(); l.onload = () => ok(String(l.result)); l.onerror = () => mal(l.error); l.readAsDataURL(blob); });
  } catch { return ''; }
}

const CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: 'Inter', 'Liberation Sans', Arial, sans-serif; color: #0f172a; font-size: 9px; line-height: 1.3; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.hoja { width: 210mm; min-height: 295mm; padding: 9mm; display: flex; flex-direction: column; gap: 3mm; }
.hoja.h { width: 297mm; min-height: 208mm; }
.etq { font-size: 6px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: #64748b; }
.mono { font-family: 'JetBrains Mono', 'Liberation Mono', monospace; }
.cab { display: grid; grid-template-columns: 38mm 1fr auto; align-items: center; gap: 5mm; padding-bottom: 3mm; border-bottom: .5mm solid #0f172a; }
.cab img { max-height: 13mm; max-width: 36mm; object-fit: contain; }
.cab h1 { margin: 0; font-size: 15px; font-weight: 800; letter-spacing: -.01em; text-transform: uppercase; }
.cab p { margin: 1mm 0 0; font-size: 7.5px; color: #475569; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
.estado { padding: 1mm 4mm; border-radius: 99px; font-size: 9px; font-weight: 800; border: .25mm solid; }
.e-green { background: #d1fae5; color: #065f46; border-color: #6ee7b7; } .e-amber { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
.e-red { background: #ffe4e6; color: #9f1239; border-color: #fda4af; } .e-blue { background: #dbeafe; color: #1e40af; border-color: #93c5fd; } .e-gray { background: #f1f5f9; color: #475569; border-color: #cbd5e1; }
.bloque { border: .25mm solid #e2e8f0; border-radius: 2.4mm; overflow: hidden; break-inside: avoid; }
.bloque > h2 { margin: 0; padding: 1.5mm 3mm; background: #0f172a; color: #fff; font-size: 7px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.rejilla { display: grid; grid-template-columns: repeat(4, 1fr); }
.rejilla > div { padding: 1.6mm 3mm; border-top: .25mm solid #e2e8f0; min-width: 0; }
.rejilla > div:nth-child(-n+4) { border-top: 0; }
.rejilla > div + div { border-left: .25mm solid #e2e8f0; }
.rejilla > div:nth-child(4n+1) { border-left: 0; }
.rejilla b { display: block; margin-top: .6mm; font-size: 9px; font-weight: 700; min-height: 3.4mm; border-bottom: .2mm dotted #cbd5e1; overflow-wrap: anywhere; }
.s2 { grid-column: span 2; } .s4 { grid-column: span 4; }
.importes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; padding: 2.4mm 3mm; background: #f8fafc; }
.importes div { text-align: center; } .importes strong { display: block; font-size: 13px; font-weight: 800; margin-top: .6mm; }
table { width: 100%; border-collapse: collapse; font-size: 8px; }
th { text-align: left; padding: 1.4mm 2mm; background: #f1f5f9; font-size: 6.4px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #475569; }
td { padding: 1.3mm 2mm; border-top: .2mm solid #e2e8f0; vertical-align: top; }
.der { text-align: right; white-space: nowrap; }
tfoot td { font-weight: 800; background: #f1f5f9; }
.pie { margin-top: auto; display: flex; justify-content: space-between; padding-top: 1.6mm; border-top: .2mm solid #e2e8f0; font-size: 6px; color: #94a3b8; letter-spacing: .04em; }
.vacio { padding: 2.4mm 3mm; color: #94a3b8; font-style: italic; }
`;

const documento = (cuerpo: string, titulo: string, horizontal = false) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"><style>${CSS}</style></head><body><div class="hoja${horizontal ? ' h' : ''}">${cuerpo}</div></body></html>`;

const tonoEstado = (e: keyof typeof ESTADO_TXT) => ({ PENDIENTE: 'amber', CON_DESCUENTO: 'blue', PARCIAL: 'amber', VENCIDA: 'red', EN_DESCARGO: 'blue', PAGADA: 'green', ANULADA: 'gray' }[e] ?? 'gray');
const dato = (k: string, v: unknown, cls = '', mono = false) => `<div class="${cls}"><span class="etq">${k}</span><b${mono ? ' class="mono"' : ''}>${esc(v)}</b></div>`;

export function htmlFichaPapeleta(d: PapeletaDetalle, logo: string): string {
  const ahora = new Date();
  const impreso = `${ahora.toLocaleDateString('es-PE')} ${ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
  const cuerpo = `
  <header class="cab">
    <div>${logo ? `<img src="${esc(logo)}" alt="">` : ''}</div>
    <div><h1>Ficha de papeleta</h1><p>${esc(TIPO_DOC_TXT[d.tipo_documento] || d.tipo_documento)} · ${esc(entidadTexto(d))} · N° ${esc(d.numero)}</p></div>
    <div style="text-align:right"><div class="mono" style="font-weight:800;font-size:11px;margin-bottom:1mm">${esc(d.codigo)}</div><span class="estado e-${tonoEstado(d.estado_efectivo)}">${esc(ESTADO_TXT[d.estado_efectivo])}</span></div>
  </header>

  <section class="bloque"><h2>Documento</h2><div class="rejilla">
    ${dato('Entidad', entidadTexto(d), 's2')}${dato('Tipo', TIPO_DOC_TXT[d.tipo_documento] || d.tipo_documento)}${dato('N° documento', d.numero, '', true)}
    ${dato('Fecha y hora', fechaTxt(d.fecha_infraccion, true), '', true)}${dato('Departamento', d.departamento)}${dato('Lugar', d.lugar, 's2')}
    ${dato('Agente o inspector', d.agente, 's2')}${dato('Registrada por', d.creado_por, 's2')}
  </div></section>

  <section class="bloque"><h2>Unidad y conductor</h2><div class="rejilla">
    ${dato('Placa', d.placa, '', true)}${dato('Empresa dueña', d.empresa_unidad, 's2')}${dato('Licencia', d.licencia, '', true)}
    ${dato('Conductor', d.conductor_nombre, 's2')}${dato('DNI', d.conductor_dni, '', true)}${dato('Quién asume el pago', `${ASUME_TXT[d.quien_asume]}${d.asume_nombre ? ` · ${d.asume_nombre}` : ''}`)}
  </div></section>

  <section class="bloque"><h2>Infracción</h2><div class="rejilla">
    ${dato('Código', d.infraccion_codigo, '', true)}${dato('Gravedad', d.gravedad ? GRAVEDAD_TXT[d.gravedad] : '')}${dato('Puntos', d.puntos ?? '')}${dato('Medida', d.medida)}
    ${dato('Descripción', d.infraccion_desc, 's4')}
  </div></section>

  <section class="bloque"><h2>Importe y plazos</h2>
    <div class="importes">
      <div><span class="etq">Multa</span><strong>${dinero(d.monto, d.moneda)}</strong></div>
      <div><span class="etq">Recargos</span><strong>${dinero(d.recargos, d.moneda)}</strong></div>
      <div><span class="etq">Con descuento${d.fecha_limite_descuento ? ` hasta ${fechaTxt(d.fecha_limite_descuento)}` : ''}</span><strong>${d.descuento_monto > 0 ? dinero(d.total_sin_descuento - d.descuento_monto, d.moneda) : '—'}</strong></div>
      <div><span class="etq">Saldo por pagar</span><strong>${dinero(d.saldo, d.moneda)}</strong></div>
    </div>
    <div class="rejilla">
      ${dato('Notificación', fechaTxt(d.fecha_notificacion), '', true)}${dato('Límite de descargo', fechaTxt(d.fecha_limite_descargo), '', true)}${dato('Límite de descuento', fechaTxt(d.fecha_limite_descuento), '', true)}${dato('Límite de pago', fechaTxt(d.fecha_limite_pago), '', true)}
      ${dato('Descargo', d.descargo_expediente ? `Exp. ${d.descargo_expediente} (${(d.descargo_resultado || '').toLowerCase()})` : '', 's2')}${dato('Reembolso del conductor', d.reembolso_monto ? `${dinero(d.reembolso_monto, d.moneda)} el ${fechaTxt(d.reembolso_fecha)}` : '', 's2')}
    </div>
  </section>

  <section class="bloque"><h2>Pagos</h2>
    ${d.pagos.length ? `<table><thead><tr><th>Fecha</th><th>Medio</th><th>N° operación</th><th>Pagó</th><th class="der">Monto</th></tr></thead><tbody>
      ${d.pagos.map(p => `<tr><td>${fechaTxt(p.fecha)}</td><td>${esc(p.medio || '')}</td><td class="mono">${esc(p.nro_operacion || '')}</td><td>${esc(p.pagado_por || '')}</td><td class="der">${dinero(p.monto, d.moneda)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="4">Total pagado</td><td class="der">${dinero(d.pagado, d.moneda)}</td></tr></tfoot></table>` : '<div class="vacio">Sin pagos registrados.</div>'}
  </section>

  ${d.observaciones ? `<section class="bloque"><h2>Observaciones</h2><div class="vacio" style="font-style:normal;color:#0f172a">${esc(d.observaciones)}</div></section>` : ''}

  <section class="bloque"><h2>Historial</h2>
    <table><tbody>${d.historial.slice(0, 10).map(h => `<tr><td class="mono" style="white-space:nowrap">${esc(String(h.created_at).slice(0, 16).replace('T', ' '))}</td><td><b>${esc(h.accion)}</b> · ${esc(h.detalle || '')}</td><td>${esc(h.usuario || '')}</td></tr>`).join('')}</tbody></table>
  </section>

  <footer class="pie"><span>ERP AZKELL FLEET · PAPELETAS</span><span class="mono">IMPRESO ${esc(impreso)}</span></footer>`;
  return documento(cuerpo, `Ficha ${d.codigo}`);
}

export function htmlReportePapeletas(filas: Papeleta[], logo: string, subtitulo: string): string {
  const ahora = new Date();
  const impreso = `${ahora.toLocaleDateString('es-PE')} ${ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
  const totales = filas.reduce((a, p) => { const k = p.moneda; a[k] = a[k] || { total: 0, pagado: 0, saldo: 0 }; a[k].total += p.total_vigente; a[k].pagado += p.pagado; a[k].saldo += p.saldo; return a; }, {} as Record<string, { total: number; pagado: number; saldo: number }>);
  const cuerpo = `
  <header class="cab">
    <div>${logo ? `<img src="${esc(logo)}" alt="">` : ''}</div>
    <div><h1>Reporte de papeletas</h1><p>${esc(subtitulo)} · ${filas.length} registros</p></div>
    <div class="mono" style="font-size:8px;color:#475569">${esc(impreso)}</div>
  </header>
  <section class="bloque"><table>
    <thead><tr><th>Código</th><th>Fecha</th><th>Entidad</th><th>N°</th><th>Placa</th><th>Conductor</th><th>Infracción</th><th class="der">Total</th><th class="der">Pagado</th><th class="der">Saldo</th><th>Estado</th></tr></thead>
    <tbody>${filas.map(p => `<tr><td class="mono">${esc(p.codigo)}</td><td class="mono">${fechaTxt(p.fecha_infraccion)}</td><td>${esc(entidadTexto(p))}</td><td class="mono">${esc(p.numero)}</td><td class="mono"><b>${esc(p.placa)}</b></td><td>${esc(p.conductor_nombre || '')}</td><td>${esc([p.infraccion_codigo, p.infraccion_desc].filter(Boolean).join(' · ').slice(0, 70))}</td><td class="der">${dinero(p.total_vigente, p.moneda)}</td><td class="der">${dinero(p.pagado, p.moneda)}</td><td class="der"><b>${dinero(p.saldo, p.moneda)}</b></td><td>${esc(ESTADO_TXT[p.estado_efectivo])}</td></tr>`).join('')}</tbody>
    <tfoot>${Object.entries(totales).map(([m, t]) => `<tr><td colspan="7">Totales en ${m === 'USD' ? 'dólares' : 'soles'}</td><td class="der">${dinero(t.total, m)}</td><td class="der">${dinero(t.pagado, m)}</td><td class="der">${dinero(t.saldo, m)}</td><td></td></tr>`).join('')}</tfoot>
  </table></section>
  <footer class="pie"><span>ERP AZKELL FLEET · PAPELETAS</span><span class="mono">${esc(subtitulo)}</span></footer>`;
  return documento(cuerpo, 'Reporte de papeletas', true);
}

async function abrirPdf(html: string, titulo: string, horizontal: boolean, unaHoja: boolean) {
  const ventana = window.open('', '_blank');
  pestanaConCamion(ventana);
  try {
    const res = await apiFetch('/papeletas/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html, titulo, horizontal, unaHoja }) });
    if (!res.ok) throw new Error(`No se pudo generar el PDF (HTTP ${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    if (ventana) ventana.location.href = url; else window.open(url, '_blank');
  } catch (err) { ventana?.close(); throw err; }
}

export async function abrirPdfFicha(d: PapeletaDetalle) {
  await abrirPdf(htmlFichaPapeleta(d, await aDataUrl(logoEmpresa())), `Ficha ${d.codigo}`, false, true);
}
export async function abrirPdfReporte(filas: Papeleta[], subtitulo: string) {
  await abrirPdf(htmlReportePapeletas(filas, await aDataUrl(logoEmpresa()), subtitulo), 'Reporte de papeletas', true, false);
}
