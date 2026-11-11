// HTML del informe de una inspección (puro, sin dependencias del navegador). Ver inspeccionPdf.ts para generar y abrir el PDF.
import type { Inspeccion, PuntoRevisado } from './api';

export interface DatosInspeccionPdf {
  inspeccion: Inspeccion;
  usuario: string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const fechaCorta = (d: Date | null) => (d ? d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const sumarDias = (d: Date | null, dias: number) => (d ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias) : null);

/** Punto de nivel de combustible: su estado es un porcentaje y su nombre habla de combustible */
const esNivel = (p: PuntoRevisado) => /combustible/i.test(p.item) && /^\d{1,3}%$/.test(p.estado);

/** Medidor de combustible dibujado (E a la izquierda, F a la derecha) con la aguja en el porcentaje */
function medidorSvg(pct: number): string {
  const v = Math.max(0, Math.min(100, pct));
  const marcas = Array.from({ length: 21 }, (_, i) => {
    const a = (-90 + i * 9) * Math.PI / 180, r1 = i % 4 === 0 ? 68 : 74, r2 = 86;
    return `<line x1="${(100 + r1 * Math.sin(a)).toFixed(1)}" y1="${(100 - r1 * Math.cos(a)).toFixed(1)}" x2="${(100 + r2 * Math.sin(a)).toFixed(1)}" y2="${(100 - r2 * Math.cos(a)).toFixed(1)}" stroke="${i <= 2 ? '#dc2626' : '#94a3b8'}" stroke-width="2" stroke-linecap="round"/>`;
  }).join('');
  return `<svg viewBox="0 0 200 118" width="100%" style="max-width:62mm"><path d="M 15 100 A 85 85 0 0 1 185 100" fill="none" stroke="#e2e8f0" stroke-width="3" stroke-linecap="round"/>${marcas}
    <text x="12" y="113" font-size="15" font-weight="800" fill="#dc2626" font-family="Inter,Arial,sans-serif">E</text><text x="178" y="113" font-size="15" font-weight="800" fill="#0f172a" font-family="Inter,Arial,sans-serif">F</text>
    <g transform="rotate(${(-90 + v * 1.8).toFixed(1)} 100 100)"><polygon points="97,100 103,100 100,22" fill="#dc2626"/></g><circle cx="100" cy="100" r="7" fill="#0f172a"/></svg>`;
}

const CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: 'Inter', 'Liberation Sans', Arial, sans-serif; color: #0f172a; font-size: 10px; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.hoja { width: 210mm; padding: 0 11mm; }
.mono { font-family: 'JetBrains Mono', 'Liberation Mono', monospace; }
.cab { display: grid; grid-template-columns: 38mm 1fr auto; align-items: center; gap: 5mm; padding-bottom: 3mm; border-bottom: .5mm solid #0f172a; }
.cab img { max-height: 14mm; max-width: 36mm; object-fit: contain; }
.cab h1 { margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -.01em; text-transform: uppercase; }
.cab p { margin: 1mm 0 0; font-size: 8px; color: #475569; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
.cab .fecha { text-align: right; font-size: 8px; color: #475569; }
.unidad { display: grid; grid-template-columns: 1fr 64mm; gap: 5mm; margin-top: 4mm; align-items: stretch; }
.tarjeta { border: .25mm solid #e2e8f0; border-radius: 3mm; padding: 3.5mm 4mm; background: #f8fafc; }
.placa { display: inline-block; padding: 1mm 5mm; border: .5mm solid #0f172a; border-radius: 2.5mm; background: #fff; font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 22px; letter-spacing: 2px; }
.datos { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 6mm; margin-top: 3.5mm; }
.datos span { display: block; font-size: 7px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #64748b; }
.datos b { display: block; font-size: 10px; font-weight: 700; }
.medidor { text-align: center; }
.medidor .v { font-size: 20px; font-weight: 800; margin-top: -1mm; }
.medidor .t { font-size: 7px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #64748b; }
.resumen { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin-top: 4mm; }
.resumen div { border-radius: 3mm; padding: 2.5mm 3mm; text-align: center; }
.resumen strong { display: block; font-size: 17px; font-weight: 800; }
.resumen span { font-size: 7px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
h2 { margin: 5mm 0 2mm; font-size: 8px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #475569; }
table { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-bottom: 1mm; break-inside: auto; }
tr { break-inside: avoid; }
th { text-align: left; padding: 1.6mm 2mm; background: #f1f5f9; font-size: 7px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #475569; }
td { padding: 1.6mm 2mm; border-bottom: .2mm solid #e2e8f0; vertical-align: top; }
.sist { break-inside: avoid-page; }
.ok, .fa, .pc, .na { display: inline-block; min-width: 6mm; padding: .5mm 2mm; border-radius: 4mm; text-align: center; font-weight: 800; font-size: 8.5px; }
.ok { background: #dcfce7; color: #15803d; } .fa { background: #fee2e2; color: #b91c1c; } .pc { background: #e0f2fe; color: #075985; } .na { color: #94a3b8; font-weight: 600; }
.obs { margin-top: .8mm; font-size: 8.5px; color: #b91c1c; white-space: pre-wrap; }
.fallas .caso { border: .25mm solid #fecaca; background: #fef2f2; border-radius: 3mm; padding: 2.5mm 3mm; margin-bottom: 2mm; break-inside: avoid; display: grid; grid-template-columns: 1fr auto; gap: 3mm; }
.fallas .caso img { width: 30mm; height: 22mm; object-fit: cover; border-radius: 2mm; }
.fallas small { color: #64748b; font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
.fotos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
.fotos figure { margin: 0; border: .25mm solid #e2e8f0; border-radius: 2.5mm; overflow: hidden; break-inside: avoid; }
.fotos img { display: block; width: 100%; height: 38mm; object-fit: cover; }
.fotos figcaption { padding: 1.5mm 2mm; font-size: 8px; color: #475569; }
.firma { margin-top: 7mm; padding-top: 3mm; border-top: .25mm solid #cbd5e1; display: flex; justify-content: space-between; align-items: flex-end; break-inside: avoid; }
.firma img { max-height: 22mm; max-width: 60mm; object-fit: contain; }
.pie { margin-top: 4mm; font-size: 7px; color: #94a3b8; letter-spacing: .04em; text-align: right; }
`;

/** HTML del informe y las fotos que el servidor debe incrustar (índice = número de la marca @@FOTO:n@@) */
export function htmlInspeccion(d: DatosInspeccionPdf, logo: string | null): { html: string; fotos: string[] } {
  const i = d.inspeccion;
  const fotos: string[] = [];
  const esDoc = (url: string) => /^data:application\/pdf/i.test(url) || /\.pdf(\?|$)/i.test(url);
  const foto = (url: string) => {
    if (!url || esDoc(url)) return '';
    if (url.startsWith('data:image/')) return url;
    let k = fotos.indexOf(url);
    if (k < 0) { fotos.push(url); k = fotos.length - 1; }
    return `@@FOTO:${k}@@`;
  };
  const puntos = i.puntos;
  const nivel = puntos.find(esNivel);
  const ok = puntos.filter(p => p.estado.toUpperCase() === 'OK').length;
  const falla = puntos.filter(p => p.estado.toUpperCase() === 'FALLA').length;
  const medidos = puntos.filter(p => /^\d{1,3}%$/.test(p.estado)).length;
  const vigencia = sumarDias(i.fecha, i.diasPropuestos);
  const emitido = new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });

  const marca = (p: PuntoRevisado) => {
    const e = p.estado.toUpperCase();
    if (e === 'OK') return '<span class="ok">OK</span>';
    if (e === 'FALLA') return '<span class="fa">FALLA</span>';
    if (/^\d{1,3}%$/.test(p.estado)) return `<span class="pc">${esc(p.estado)}</span>`;
    return '<span class="na">—</span>';
  };

  const datos: Array<[string, string]> = [
    ['Cliente', i.cliente || '—'], ['Fecha de inspección', fechaCorta(i.fecha)],
    ['Kilometraje', i.km !== null ? `${i.km.toLocaleString('es-PE')} km` : '—'], ['Técnico', i.tecnico || '—'],
    ['Tipo', i.tipo || 'General'], ['Vigente hasta', fechaCorta(vigencia)],
  ];

  const porSistema = new Map<string, PuntoRevisado[]>();
  puntos.forEach(p => porSistema.set(p.categoria, [...(porSistema.get(p.categoria) ?? []), p]));
  const sistemas = [...porSistema.entries()].map(([cat, ps]) => {
    const n = ps.filter(p => p.estado.toUpperCase() === 'FALLA').length;
    return `<div class="sist"><h2>${esc(cat)}${n ? ` · ${n} ${n === 1 ? 'falla' : 'fallas'}` : ''}</h2><table><thead><tr><th>Punto revisado</th><th style="width:22mm;text-align:center">Estado</th></tr></thead><tbody>${
      ps.map(p => `<tr><td${p.estado.toUpperCase() === 'FALLA' ? ' style="font-weight:700"' : ''}>${esc(p.item)}</td><td style="text-align:center">${marca(p)}</td></tr>`).join('')}</tbody></table></div>`;
  }).join('');

  const fallasLista = puntos.filter(p => p.estado.toUpperCase() === 'FALLA');
  const fallas = fallasLista.length ? `<h2>Fallas encontradas (${fallasLista.length})</h2><div class="fallas">${fallasLista.map(p => `
    <div class="caso"><div><small>${esc(p.categoria)}</small><div style="font-weight:700;font-size:10.5px">${esc(p.item)}</div>${p.observacion ? `<div class="obs">${esc(p.observacion)}</div>` : '<div class="obs" style="color:#64748b">Sin observación</div>'}${esDoc(p.foto) ? '<div class="obs" style="color:#64748b">Documento adjunto en el sistema</div>' : ''}</div>${foto(p.foto) ? `<img src="${foto(p.foto)}" alt="">` : ''}</div>`).join('')}</div>` : '';

  // Evidencia: todas las fotos o documentos subidos (incluida la del nivel de combustible), sin repetir las de las fallas ya mostradas
  const mostradas = new Set(fallasLista.map(p => p.foto).filter(Boolean));
  const evid = puntos.filter(p => p.foto && !mostradas.has(p.foto));
  const evidencia = evid.length ? `<h2>Evidencia adjunta</h2><div class="fotos">${evid.map(p => esDoc(p.foto)
    ? `<figure><div style="height:38mm;display:grid;place-items:center;background:#fee2e2;color:#b91c1c;font-weight:800">DOCUMENTO PDF</div><figcaption>${esc(p.categoria)} · ${esc(p.item)} (ver en el sistema)</figcaption></figure>`
    : `<figure><img src="${foto(p.foto)}" alt=""><figcaption>${esc(p.categoria)} · ${esc(p.item)}</figcaption></figure>`).join('')}</div>` : '';

  const firma = i.firma ? `<img src="${foto(i.firma)}" alt="Firma">` : '<span style="color:#94a3b8">Sin firma registrada</span>';

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Inspección ${esc(i.id)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"><style>${CSS}</style></head><body><div class="hoja">
  <header class="cab">
    <div>${logo ? `<img src="${esc(logo)}" alt="">` : ''}</div>
    <div><h1>Informe de inspección</h1><p>N° ${esc(i.id)} · ${esc(i.tipo || 'General')}${i.idOt ? ` · OT ${esc(i.idOt)}` : ''}</p></div>
    <div class="fecha">Emitido<br>${esc(emitido)}</div>
  </header>
  <section class="unidad">
    <div class="tarjeta"><span class="placa">${esc(i.placa || '—')}</span>
      <div class="datos">${datos.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div></div>
    ${nivel ? `<div class="tarjeta medidor"><div class="t">Nivel de combustible</div>${medidorSvg(parseInt(nivel.estado, 10))}<div class="v">${esc(nivel.estado)}</div></div>` : ''}
  </section>
  <section class="resumen">
    <div style="background:#dcfce7;color:#15803d"><strong>${ok}</strong><span>En buen estado</span></div>
    <div style="background:#fee2e2;color:#b91c1c"><strong>${falla}</strong><span>Con falla</span></div>
    <div style="background:#e0f2fe;color:#075985"><strong>${medidos}</strong><span>Medidos (%)</span></div>
  </section>
  ${fallas}
  ${sistemas || '<p>Sin puntos revisados.</p>'}
  ${evidencia}
  <section class="firma"><div><div style="font-size:7px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:2mm">Firma del inspector</div>${firma}<div style="font-weight:700;margin-top:1mm">${esc(i.tecnico || '—')}</div></div>
    <div class="pie">ERP AZKELL FLEET · INSPECCIONES<br>Generado por ${esc(d.usuario || 'sistema')}</div></section>
</div></body></html>`;
  return { html, fotos };
}

