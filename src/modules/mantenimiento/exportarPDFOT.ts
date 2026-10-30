import { otDetalles, otFecha, otId, type OrdenTrabajo } from './api';
import { costoOT } from './tiemposTaller';
import { pestanaConCamion } from '../../core/ui/CargaCamion';

// PDF de Reportes OT con el mismo diseño del clásico (modulos/mantenimiento/reportes-ot, rotExportarPDF):
// encabezado azul, filtros, totales, tabla y franja verde con el costo total. Usa las mismas librerías locales
// (/libs/jspdf.umd.min.js y /libs/jspdf.plugin.autotable.min.js) y abre el PDF en una pestaña, sin descargarlo.

type JsPdfDoc = {
  internal: { pageSize: { getWidth(): number } };
  setFillColor(r: number, g: number, b: number): void;
  rect(x: number, y: number, w: number, h: number, estilo: string): void;
  setTextColor(r: number, g: number, b: number): void;
  setFontSize(n: number): void;
  setFont(fuente: string | undefined, estilo: string): void;
  text(t: string, x: number, y: number, opciones?: Record<string, unknown>): void;
  autoTable(opciones: Record<string, unknown>): void;
  lastAutoTable: { finalY: number };
  output(tipo: 'blob'): Blob;
};
type JsPdfNs = { jsPDF: new (o: Record<string, unknown>) => JsPdfDoc; };
type JsPdfWindow = Window & { jspdf?: JsPdfNs; };

function cargarScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}

const costoTxt = (n: number) => `S/${n.toFixed(2)}`;
const esCorrectivo = (o: OrdenTrabajo) => String(otDetalles(o).tipo_ot ?? '').toLowerCase() === 'correctivo';
const esPreventivo = (o: OrdenTrabajo) => String(otDetalles(o).tipo_ot ?? '').toLowerCase() === 'preventivo';

export async function abrirPdfReportesOT(lista: OrdenTrabajo[], filtros: string[]) {
  // La pestaña se abre en el gesto del usuario y muestra un aviso mientras se genera el PDF
  const win = window.open('', '_blank');
  pestanaConCamion(win);

  try {
    const w = window as JsPdfWindow;
    if (!w.jspdf) await cargarScript('/libs/jspdf.umd.min.js');
    if (!(w.jspdf as unknown as { jsPDF: { API: { autoTable?: unknown } } }).jsPDF.API.autoTable) {
      await cargarScript('/libs/jspdf.plugin.autotable.min.js');
    }
    const JsPDF = (window as JsPdfWindow).jspdf!.jsPDF;
    const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const azul: [number, number, number] = [37, 99, 235];
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFillColor(...azul);
    doc.rect(0, 0, pageW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text('REPORTE DE ÓRDENES DE TRABAJO — AZKELL FLEET', 14, 12);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text('Generado: ' + new Date().toLocaleString('es-PE'), pageW - 14, 12, { align: 'right' });

    let y = 23;
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    if (filtros.length) { doc.text('Filtros: ' + filtros.join('  |  '), 14, y); y += 5; }

    const costoTotal = lista.reduce((s, o) => s + costoOT(o), 0);
    const costoCorr = lista.filter(esCorrectivo).reduce((s, o) => s + costoOT(o), 0);
    const costoPrev = lista.filter(esPreventivo).reduce((s, o) => s + costoOT(o), 0);
    doc.setTextColor(60, 60, 60);
    doc.text(`Total OTs: ${lista.length}   |   Costo Total: ${costoTxt(costoTotal)}   |   Correctivo: ${costoTxt(costoCorr)}   |   Preventivo: ${costoTxt(costoPrev)}`, 14, y);
    y += 5;

    const body = lista.map(ot => {
      const det = otDetalles(ot);
      const tipo = String(det.tipo_ot ?? '—');
      const sub = String(det.sub_tipo ?? '—');
      const sup = String(det.supervisor ?? ot.supervisor ?? '—');
      const estado = String(ot.aprobacion ?? ot.estado ?? '—');
      return [otId(ot), ot.placa ?? '—', `${tipo} / ${sub}`, sup, estado, costoTxt(costoOT(ot)), otFecha(ot)];
    });

    doc.autoTable({
      startY: y,
      head: [['N° OT', 'Placa', 'Tipo / Sub Tipo', 'Supervisor', 'Estado', 'Costo Total', 'Fecha']],
      body,
      theme: 'striped',
      headStyles: { fillColor: azul, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [240, 245, 255] },
      columnStyles: { 5: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });

    const finalY = doc.lastAutoTable.finalY + 6;
    doc.setFillColor(22, 163, 74);
    doc.rect(14, finalY, pageW - 28, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text(`COSTO TOTAL: ${costoTxt(costoTotal)}   CORRECTIVO: ${costoTxt(costoCorr)}   PREVENTIVO: ${costoTxt(costoPrev)}`, pageW / 2, finalY + 6, { align: 'center' });

    const url = URL.createObjectURL(doc.output('blob'));
    if (win) win.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = `Reporte_OT_${new Date().toISOString().slice(0, 10)}.pdf`; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) {
    win?.close();
    throw err;
  }
}
