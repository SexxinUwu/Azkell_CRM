// Garita: acta del registro de control (F-SEG-002) en PDF vectorial (jsPDF + autoTable), sin capturas de pantalla.
// Mismas secciones y datos que el acta HTML (garitaActa.ts) y que el clásico. Como imágenes solo van el logo de la empresa
// y las firmas digitalizadas (son obligatorias por validez legal); las fotos de evidencia no se incrustan: el PDF indica cuántas hay.
import type { DocsVehiculo, FaseActa, RegistroActa } from './garitaActa';

type Chk = Record<string, string | number | undefined>;
interface CatTpl { id?: string; titulo?: string; items?: Array<{ id: string; label: string }> }
type RGB = [number, number, number];

const NEGRO: RGB = [15, 23, 42];
const GRIS: RGB = [226, 232, 240];
const GRIS_CLARO: RGB = [241, 245, 249];
const ROJO: RGB = [220, 38, 38];
const ROJO_SUAVE: RGB = [254, 242, 242];
const VERDE: RGB = [21, 128, 61];
const AMBAR: RGB = [245, 158, 11];

const pad = (x: number) => String(x).padStart(2, '0');
const hoyFmt = () => { const d = new Date(); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const num = (v: unknown) => Number(v).toLocaleString('es-PE');
const esMal = (v: string) => v === 'MAL' || v === 'NO CONFORME' || v === 'OBS';
const valor = (c: Chk, id: string) => (c[id] ? String(c[id]).toUpperCase() : '');
const cant = (c: Chk, id: string) => (c[`${id}_cant`] !== undefined && c[`${id}_cant`] !== '' ? String(c[`${id}_cant`]) : '-');
const txtEstado = (v: string) => (esMal(v) ? 'MAL' : v === 'OK' || v === 'CONFORME' ? 'OK' : v === 'NA' || v === 'N/A' ? 'N/A' : '-');
const estadoColor = (e: string): RGB => (e === 'VENCIDO' ? ROJO : e === 'PRÓXIMO A VENCER' ? AMBAR : VERDE);

async function logoDataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string>((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = mal; r.readAsDataURL(blob); });
  } catch { return null; }
}

export async function construirPdfActa(
  rec: RegistroActa, fase: FaseActa,
  o: { docT: DocsVehiculo | null; docC: DocsVehiculo | null; plantillaGlobal?: CatTpl[]; nFotos?: number; logoUrl: string },
): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 8;
  const ancho = W - 2 * M;
  const completo = fase === 'completo';
  const sal = fase !== 'retorno';
  const finY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const ida: Chk = rec.salida_checklist_json ?? {};
  const vta: Chk = rec.retorno_checklist_json ?? {};
  const chk: Chk = completo ? ida : ((sal ? rec.salida_checklist_json : rec.retorno_checklist_json) ?? {});
  const tpl: CatTpl[] = completo
    ? (rec.retorno_template_json ?? rec.salida_template_json ?? o.plantillaGlobal ?? [])
    : ((sal ? rec.salida_template_json : rec.retorno_template_json) ?? []);

  const condS = rec.conductor || '---';
  const condR = rec.retorno_conductor || rec.conductor || '---';
  const carS = rec.placa_carreta || '---';
  const carR = rec.retorno_placa_carreta || rec.placa_carreta || '---';
  const carFull = completo ? (carS === carR ? carS : `${carS} -> ${carR}`) : (sal ? carS : carR);
  const hayCarreta = !!(rec.placa_carreta || rec.retorno_placa_carreta);
  const km = (v: unknown) => (v ? `${num(v)} km` : '---');

  const malos: string[] = [];
  tpl.forEach(c => (c.items ?? []).forEach(it => {
    if (esMal(valor(chk, it.id)) || (completo && esMal(valor(vta, it.id)))) malos.push(it.label);
  }));
  const alerta = completo
    ? !!(rec.salida_has_alert || rec.retorno_has_alert)
    : (!!(sal ? rec.salida_has_alert : rec.retorno_has_alert) || malos.length > 0);

  // ── Cabecera ──
  const emision = completo ? (rec.retorno_fecha || rec.salida_fecha || hoyFmt()) : ((sal ? rec.salida_fecha : rec.retorno_fecha) || hoyFmt());
  const titulo = completo ? 'EXPEDIENTE INTEGRAL DE INSPECCIÓN VEHICULAR' : 'CHECKLIST DE INSPECCIÓN VEHICULAR';
  const sub = completo ? 'Control de Seguridad y Contraste de Unidades (Ida y Vuelta)' : 'Control de Seguridad, Ingreso y Salida de Unidades';
  let y = M;
  doc.setDrawColor(...NEGRO); doc.setLineWidth(0.4);
  doc.rect(M, y, ancho, 18);
  doc.line(M + 40, y, M + 40, y + 18);
  doc.line(W - M - 50, y, W - M - 50, y + 18);
  const logo = await logoDataUrl(o.logoUrl);
  if (logo) doc.addImage(logo, /image\/png/i.test(logo) ? 'PNG' : 'JPEG', M + 4, y + 2, 32, 14, undefined, 'FAST');
  else { doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('TRANSPORTE & LOGÍSTICA', M + 20, y + 10, { align: 'center' }); }
  doc.setTextColor(...NEGRO); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
  const cx = M + 40 + (ancho - 90) / 2;
  doc.text(titulo, cx, y + 8, { align: 'center', maxWidth: ancho - 96 });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text(sub, cx, y + 13, { align: 'center', maxWidth: ancho - 96 });
  const ctl: Array<[string, string]> = [['CÓDIGO', 'F-SEG-002'], ['VERSIÓN', '01'], ['F. EMISIÓN', emision]];
  ctl.forEach(([k, v], i) => {
    const yy = y + 4.5 + i * 5.5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text(`${k}:`, W - M - 48, yy);
    doc.setFont('courier', 'bold'); doc.setFontSize(8); doc.text(String(v), W - M - 2, yy, { align: 'right' });
  });
  y += 18;

  // ── Datos del registro ──
  const estadoTxt = alerta ? 'CON OBSERVACIONES' : 'CONFORME';
  const filas: string[][] = completo
    ? [
      ['Nº Expediente', rec.id, 'Conductor Ida', condS, 'Salida (Ida)', `${rec.salida_fecha || '--'} ${rec.salida_hora || ''} (${rec.salida_km ? `${num(rec.salida_km)} km` : '0'})`],
      ['Placa Tracto', rec.placa_tracto, 'Conductor Vuelta', condR, 'Llegada (Vta)', `${rec.retorno_fecha || '--'} ${rec.retorno_hora || ''} (${rec.retorno_km ? `${num(rec.retorno_km)} km` : '--'})`],
      ['Carreta (Ida / Vta)', carFull, 'Destino / Ruta', rec.destino || '---',
        'Recorrido Total', `${rec.retorno_km && rec.salida_km ? `${num(Number(rec.retorno_km) - Number(rec.salida_km))} KM` : '---'}  ${estadoTxt}`],
    ]
    : [
      ['Nº Expediente', rec.id, 'Placa Tracto', rec.placa_tracto, 'Placa Carreta', carFull],
      ['Conductor', sal ? condS : condR, 'Fase', sal ? 'SALIDA (IDA)' : 'RETORNO (VUELTA)', 'Destino', rec.destino || '---'],
      ['Fecha / Hora', `${(sal ? rec.salida_fecha : rec.retorno_fecha) || '--'} ${(sal ? rec.salida_hora : rec.retorno_hora) || ''}`, 'Kilometraje', km(sal ? rec.salida_km : rec.retorno_km), 'Estado', estadoTxt],
    ];
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: 'grid', body: filas,
    styles: { fontSize: 8, cellPadding: 1.4, lineColor: NEGRO, lineWidth: 0.3, textColor: NEGRO, valign: 'middle' },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: GRIS_CLARO, cellWidth: 26 }, 1: { font: 'courier', fontStyle: 'bold' },
      2: { fontStyle: 'bold', fillColor: GRIS_CLARO, cellWidth: 26 }, 3: { font: 'courier', fontStyle: 'bold' },
      4: { fontStyle: 'bold', fillColor: GRIS_CLARO, cellWidth: 26 }, 5: { font: 'courier', fontStyle: 'bold' },
    },
    didParseCell: d => { if (d.row.index === 2 && d.column.index === 5) d.cell.styles.textColor = alerta ? ROJO : VERDE; },
  });
  y = finY() + 3;

  // ── Estado documental (SOAT y revisión técnica) ──
  type LineaDoc = { t: string; c: RGB | null };
  const docTxt = (d: DocsVehiculo | null, aplica: boolean, nombreSoat: string, sinUnidad: string): LineaDoc[] => {
    if (!aplica) return [{ t: sinUnidad, c: null }];
    const l: LineaDoc[] = [];
    if (d?.soat) l.push({ t: `${nombreSoat}: ${d.soat.estado} · vence ${d.soat.fechaFmt}`, c: estadoColor(d.soat.estado) });
    if (d?.rt) l.push({ t: `Revisión Técnica: ${d.rt.estado} · vence ${d.rt.fechaFmt}`, c: estadoColor(d.rt.estado) });
    return l.length ? l : [{ t: 'Sin documentos registrados', c: null }];
  };
  const bT = docTxt(o.docT, true, 'SOAT', '');
  const bC = docTxt(o.docC ?? (hayCarreta ? { soat: null, rt: null } : null), hayCarreta, 'SOAT / Seguro', 'No aplica / Sin semirremolque acoplado.');
  const nF = Math.max(bT.length, bC.length);
  doc.setFillColor(...NEGRO); doc.rect(M, y, ancho, 5.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text('ESTADO DOCUMENTAL INFORMATIVO (SOAT & REVISIÓN TÉCNICA)', M + 3, y + 3.8);
  y += 5.5;
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: 'grid',
    head: [[`TRACTO / CAMIÓN (${rec.placa_tracto})`, `CARRETA / REMOLQUE (${carFull})`]],
    body: Array.from({ length: nF }, (_, i) => [bT[i]?.t ?? '', bC[i]?.t ?? '']),
    styles: { fontSize: 8, cellPadding: 1.4, lineColor: NEGRO, lineWidth: 0.3, textColor: NEGRO },
    headStyles: { fillColor: GRIS_CLARO, textColor: NEGRO, fontStyle: 'bold' },
    didParseCell: d => {
      if (d.section !== 'body') return;
      const it = (d.column.index === 0 ? bT : bC)[d.row.index];
      if (it?.c) { d.cell.styles.textColor = it.c; d.cell.styles.fontStyle = 'bold'; }
      else if (it) d.cell.styles.fontStyle = 'italic';
    },
  });
  y = finY() + 3;

  // ── Aviso de novedades ──
  if (alerta) {
    const obsRaw = ((sal ? rec.salida_observaciones : (rec.retorno_observaciones || rec.salida_observaciones)) || '').trim();
    const cuerpo = completo
      ? 'Se detectaron ítems observados o novedades registradas durante la auditoría de salida o retorno de la unidad.'
      : (obsRaw ? obsRaw.toUpperCase() : (malos.length ? `Observaciones registradas en: ${malos.join(', ')}` : 'Los certificados físicos de revisión técnica del tracto y carreta no fueron presentados físicamente durante la verificación.'));
    autoTable(doc, {
      startY: y, margin: { left: M, right: M }, theme: 'grid',
      body: [[`ATENCIÓN: ${completo ? 'Se reportaron anomalías u observaciones en la inspección' : 'Se reportaron novedades / anomalías en la revisión técnica de la unidad'}\n${cuerpo}`]],
      styles: { fontSize: 8, cellPadding: 2, lineColor: NEGRO, lineWidth: 0.3, textColor: ROJO, fillColor: ROJO_SUAVE, fontStyle: 'bold' },
    });
    y = finY() + 3;
  }

  // ── Detalle del checklist ──
  if (y + 20 > H - M) { doc.addPage(); y = M; }
  doc.setFillColor(...NEGRO); doc.rect(M, y, ancho, 5.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text(completo ? 'CONTRASTE DE INSPECCIÓN: SALIDA (IDA) VS RETORNO (VUELTA)' : `DETALLE DEL CHECKLIST · FASE ${sal ? 'SALIDA' : 'RETORNO'}`, W / 2, y + 3.8, { align: 'center' });
  y += 5.5;
  if (!tpl.length) {
    doc.setTextColor(120, 120, 120); doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
    doc.text('No se registró detalle de checklist en esta fase.', W / 2, y + 6, { align: 'center' });
    y += 10;
  } else {
    type Celda = string | { content: string; colSpan: number; styles: Record<string, unknown> };
    const body: Celda[][] = [];
    const malFilas = new Set<number>();
    tpl.forEach(c => {
      body.push([{ content: (c.titulo || 'CATEGORÍA').toUpperCase(), colSpan: completo ? 5 : 3, styles: { fillColor: GRIS, fontStyle: 'bold', textColor: NEGRO } }]);
      (c.items ?? []).forEach(it => {
        const vi = valor(chk, it.id), vv = completo ? valor(vta, it.id) : '';
        if (esMal(vi) || esMal(vv)) malFilas.add(body.length);
        body.push(completo
          ? [it.label, cant(ida, it.id), txtEstado(vi), cant(vta, it.id), txtEstado(vv)]
          : [it.label, cant(chk, it.id), txtEstado(vi)]);
      });
    });
    autoTable(doc, {
      startY: y, margin: { left: M, right: M }, theme: 'grid', body,
      head: [completo ? ['Componente', 'Cant. Ida', 'Estado Ida', 'Cant. Vta', 'Estado Vta'] : ['Componente / Ítem', 'Cant.', 'Estado']],
      styles: { fontSize: 7.5, cellPadding: 1, lineColor: [203, 213, 225], lineWidth: 0.2, textColor: NEGRO },
      headStyles: { fillColor: GRIS_CLARO, textColor: NEGRO, fontStyle: 'bold', halign: 'center' },
      columnStyles: completo
        ? { 1: { halign: 'center', cellWidth: 20 }, 2: { halign: 'center', cellWidth: 24 }, 3: { halign: 'center', cellWidth: 20 }, 4: { halign: 'center', cellWidth: 24 } }
        : { 1: { halign: 'center', cellWidth: 24 }, 2: { halign: 'center', cellWidth: 30 } },
      didParseCell: d => {
        if (d.section !== 'body' || d.cell.colSpan > 1) return;
        if (malFilas.has(d.row.index)) d.cell.styles.fillColor = ROJO_SUAVE;
        const t = String(d.cell.raw);
        if (d.column.index > 0 && t === 'MAL') { d.cell.styles.textColor = ROJO; d.cell.styles.fontStyle = 'bold'; }
        else if (d.column.index > 0 && t === 'OK') { d.cell.styles.textColor = VERDE; d.cell.styles.fontStyle = 'bold'; }
      },
    });
    y = finY() + 3;
  }

  // ── Observaciones ──
  const obsS = (rec.salida_observaciones || '').trim(), obsR = (rec.retorno_observaciones || '').trim();
  const ob = (v: string) => (v ? v.toUpperCase() : 'SIN OBSERVACIONES');
  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, theme: 'grid',
    body: completo
      ? [[`OBS. SALIDA: ${ob(obsS)}`, `OBS. RETORNO: ${ob(obsR)}`]]
      : [[`OBSERVACIONES: ${ob(sal ? obsS : (obsR || obsS))}`]],
    styles: { fontSize: 8, cellPadding: 2, lineColor: NEGRO, lineWidth: 0.3, textColor: NEGRO, fontStyle: 'bold' },
  });
  y = finY() + 3;

  // ── Firmas digitalizadas en su recuadro (si no hay firma, se indica SIN FIRMA) ──
  const cajas: Array<{ rol: string; nombre: string; firma: string | null }> = completo
    ? [
      { rol: 'Cond. Salida', nombre: condS, firma: rec.firma_salida_conductor || null },
      { rol: 'Vig. Salida', nombre: rec.creado_por || 'Vigilancia', firma: rec.firma_salida_vigilancia || null },
      { rol: 'Cond. Retorno', nombre: condR, firma: rec.firma_retorno_conductor || null },
      { rol: 'Vig. Retorno', nombre: rec.retorno_creado_por || rec.creado_por || 'Vigilancia', firma: rec.firma_retorno_vigilancia || null },
    ]
    : [
      { rol: `Firma del Conductor (${sal ? 'Salida' : 'Retorno'})`, nombre: rec.conductor || '---', firma: (sal ? rec.firma_salida_conductor : rec.firma_retorno_conductor) || null },
      { rol: 'Inspector de Seguridad / Vigilancia', nombre: `VoBo CONTROL ${sal ? 'DESPACHO' : 'RECEPCIÓN'}`, firma: (sal ? rec.firma_salida_vigilancia : rec.firma_retorno_vigilancia) || null },
    ];
  const ALTO_CAJA = 30;
  if (y + ALTO_CAJA + 10 > H - M) { doc.addPage(); y = M; }
  doc.setTextColor(...NEGRO); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text(completo ? 'FIRMAS DIGITALES DE CONFORMIDAD (DESPACHO Y RECEPCIÓN)' : `FIRMAS DIGITALES DE ${sal ? 'SALIDA' : 'RETORNO'}`, M, y + 3);
  y += 5;
  const cw = (ancho - (cajas.length - 1) * 3) / cajas.length;
  cajas.forEach((c, i) => {
    const x = M + i * (cw + 3);
    doc.setDrawColor(...GRIS); doc.setFillColor(248, 250, 252); doc.roundedRect(x, y, cw, ALTO_CAJA, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    const colorEstado: RGB = c.firma ? VERDE : [120, 120, 120];
    doc.setTextColor(...colorEstado);
    doc.text(c.firma ? 'FIRMADO DIGITALMENTE' : 'SIN FIRMA', x + cw / 2, y + 5, { align: 'center' });
    if (c.firma) {
      try {
        const alto = 11;
        const { width, height } = doc.getImageProperties(c.firma);
        const anchoImg = Math.min(cw - 8, alto * width / height);
        const altoImg = anchoImg * height / width;
        doc.addImage(c.firma, c.firma.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', x + (cw - anchoImg) / 2, y + 6 + (alto - altoImg) / 2, anchoImg, altoImg);
      } catch { /* firma no legible: queda el texto FIRMADO DIGITALMENTE */ }
    }
    doc.setDrawColor(...NEGRO); doc.setLineWidth(0.2); doc.line(x + 4, y + 19, x + cw - 4, y + 19);
    doc.setTextColor(...NEGRO); doc.setFontSize(7);
    doc.text(c.rol.toUpperCase(), x + cw / 2, y + 22.5, { align: 'center', maxWidth: cw - 4 });
    doc.setFont('helvetica', 'normal');
    doc.text(String(c.nombre), x + cw / 2, y + 26.5, { align: 'center', maxWidth: cw - 4 });
  });
  y += ALTO_CAJA + 3;
  if (o.nFotos) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(100, 100, 100);
    doc.text(`Evidencias fotográficas: ${o.nFotos} foto(s) registradas en el sistema (no se incluyen en este PDF).`, M, y + 2);
  }

  // Pie de página con numeración
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
    doc.text(`Azkell Fleet · Documento digital de control vehicular · Página ${p} de ${n}`, W / 2, H - 4, { align: 'center' });
  }
  return doc.output('blob');
}
