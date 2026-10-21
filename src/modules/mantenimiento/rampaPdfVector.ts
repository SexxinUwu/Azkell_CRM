// PDF vectorial del Status de rampa (F-MAN-005). Mismo diseño y columnas que el clásico (jsPDF + autoTable):
// texto real y seleccionable, sin imágenes de la página.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DatosPdfRampa, FilaPdfRampa } from './RampasHerramientas';

const rgb = (hex: string): [number, number, number] => {
  let h = String(hex || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
};

/** Logo de la empresa como data URL; si no se puede leer, el PDF sale solo con el nombre */
async function logoDataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function construirPdfRampas(filas: FilaPdfRampa[], empresa: string, d: DatosPdfRampa, logoUrl: string): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();   // 297
  const H = doc.internal.pageSize.getHeight();  // 210
  const M = 7;

  // Marco exterior
  doc.setDrawColor(0);
  doc.setLineWidth(0.7);
  doc.rect(M - 2, M - 2, W - 2 * (M - 2), H - 2 * (M - 2));

  // Logo y nombre de la empresa
  let xTexto = M + 2;
  const logo = await logoDataUrl(logoUrl);
  if (logo) {
    const formato = /image\/png/i.test(logo) ? 'PNG' : 'JPEG';
    doc.addImage(logo, formato, M + 1, M + 1, 22, 17);
    xTexto = M + 26;
  }
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text(empresa.toUpperCase(), xTexto, M + 11);

  // Títulos y caja de control del documento
  doc.setFontSize(16);
  doc.text('ESTATUS DE UNIDADES EN TALLER', W / 2, M + 8, { align: 'center' });
  doc.setFontSize(8.5);
  doc.text('CONTROL DE OCUPACIÓN DE RAMPA Y TURNOS DE MANTENIMIENTO', W / 2, M + 14, { align: 'center' });

  const bx = W - M - 62;
  const by = M;
  const bw = 60;
  const bh = 17;
  doc.setLineWidth(0.4);
  doc.rect(bx, by, bw, bh);
  doc.setFontSize(8);
  doc.text('CÓDIGO: F-MAN-005', bx + bw - 2, by + 5, { align: 'right' });
  doc.text('VERSIÓN: 0', bx + bw - 2, by + 9.5, { align: 'right' });
  doc.text('F. EMISIÓN: 10/11/2025', bx + bw - 2, by + 14, { align: 'right' });

  doc.setLineWidth(0.8);
  doc.line(M, M + 20, W - M, M + 20);

  // Barra de resumen
  const ky = M + 23;
  const kh = 8;
  doc.setLineWidth(0.5);
  doc.roundedRect(M, ky, W - 2 * M, kh, 2, 2);
  doc.setFontSize(8);
  const yT = ky + 5.3;
  doc.setFont('helvetica', 'normal');
  doc.text('EMISIÓN:', M + 3, yT);
  doc.setFont('helvetica', 'bold');
  doc.text(d.fecha, M + 18, yT);
  doc.setFont('helvetica', 'normal');
  doc.text('EMITIDO POR:', M + 55, yT);
  doc.setFont('helvetica', 'bold');
  doc.text(d.emisor, M + 76, yT);

  const items: [string, number, string][] = [
    ['TOTAL RAMPAS:', d.total, '#000000'],
    ['OCUPADAS:', d.ocupadas, '#dc2626'],
    ['EN ESPERA / LAVADO:', d.espera, '#b45309'],
    ['LIBRES:', d.libres, '#15803d'],
  ];
  let xk = W - M - 125;
  for (const [etiqueta, valor, color] of items) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    doc.text(etiqueta, xk, yT);
    const w = doc.getTextWidth(etiqueta);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...rgb(color));
    doc.text(String(valor), xk + w + 1.5, yT);
    xk += w + 14;
  }
  doc.setTextColor(0);

  // Tabla: columnas del F-MAN-005 con sus anchos
  const definicion = [
    { k: 'rampa', h: 'RAMPA', w: 28, est: { fontStyle: 'bold' as const } },
    { k: 'fIn', h: 'F. INGRESO', w: 20, est: { halign: 'center' as const } },
    { k: 'hIn', h: 'HORA', w: 13, est: { halign: 'center' as const } },
    { k: 'placa', h: 'PLACA', w: 22, est: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 9 } },
    { k: 'situacion', h: 'SITUACIÓN', w: 26, est: { halign: 'center' as const, fontStyle: 'bold' as const } },
    { k: 'obs', h: 'OBSERVACIONES / TRABAJOS A REALIZAR', w: 0, est: { halign: 'left' as const } },
    { k: 'fOut', h: 'SALIDA (EST.)', w: 20, est: { halign: 'center' as const } },
    { k: 'hOut', h: 'HORA', w: 13, est: { halign: 'center' as const } },
    { k: 'horas', h: 'H. TALLER', w: 18, est: { halign: 'center' as const, fontStyle: 'bold' as const } },
    { k: 'tecnicos', h: 'TÉCNICOS', w: 30, est: { halign: 'left' as const } },
    { k: 'insp', h: 'INSPECCIÓN?', w: 21, est: { halign: 'center' as const, fontStyle: 'bold' as const } },
  ];
  const posicion = Object.fromEntries(definicion.map((c, i) => [c.k, i]));
  const columnStyles: Record<number, Record<string, unknown>> = {};
  definicion.forEach((c, i) => {
    columnStyles[i] = { ...c.est, ...(c.w ? { cellWidth: c.w } : {}) };
  });

  autoTable(doc, {
    head: [definicion.map(c => c.h)],
    body: filas.map(f => [f.rampa, f.fIn, f.hIn, f.placa, f.situacion, f.obs, f.fOut, f.hOut, f.horas, f.tecnicos, f.insp]),
    startY: ky + kh + 4,
    margin: { left: M, right: M, bottom: 14 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 1.6, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.25, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 7.4 },
    columnStyles,
    didParseCell: data => {
      if (data.section !== 'body') return;
      const f = filas[data.row.index];
      if (!f) return;
      const col = data.column.index;
      if (col === posicion.insp) data.cell.styles.textColor = rgb(f.inspColor);
      if (col === posicion.situacion) data.cell.styles.textColor = rgb(f.situacionColor);
      if (col === posicion.horas) data.cell.styles.textColor = rgb(f.horasColor);
      if (f.libre && col !== posicion.rampa && col !== posicion.situacion) data.cell.styles.fontStyle = 'normal';
    },
  });

  // Pie: semáforo de inspección y leyenda del documento
  const fy = H - M - 1;
  doc.setLineWidth(0.4);
  doc.line(M, fy - 4, W - M, fy - 4);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);
  doc.text('Sistema ERP Azkell Fleet · Módulo de Control de Rampa y Mantenimiento', M, fy);
  const txt = 'Semáforo Inspección:  ';
  const xs = W / 2 - 38;
  doc.text(txt, xs, fy);
  let ww = doc.getTextWidth(txt);
  doc.setFont('helvetica', 'bold');
  for (const [etiqueta, color] of [['>7d Vigente', '#15803d'], ['0-7d Próximo', '#854d0e'], ['<0d Vencido', '#b91c1c']] as const) {
    doc.setTextColor(...rgb(color));
    doc.text(etiqueta, xs + ww, fy);
    ww += doc.getTextWidth(etiqueta) + 4;
  }
  doc.setTextColor(0);
  doc.text('DOCUMENTO OFICIAL · HOJA 1 DE 1', W - M, fy, { align: 'right' });

  return doc.output('blob');
}
