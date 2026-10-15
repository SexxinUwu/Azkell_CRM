// Archivos de los reportes del asistente. Los datos llegan del servidor (con los permisos de la
// persona) y el archivo se arma aquí, en el navegador. Las librerías se cargan solo al usarlas.
import { api } from '../../core/api/client';

export type ReportType = 'placas' | 'inspecciones' | 'conductores' | 'fleetrun';
export interface ReportRequest {
  tipo: ReportType;
  formato: 'excel' | 'pdf';
  desde?: string;
  hasta?: string;
  /** Solo placas */
  cliente?: string;
  marca?: string;
  tipo_unidad?: string;
  estado?: string;
  title: string;
}

interface ReportColumn { key: string; label: string; type?: 'text' | 'number' | 'money' }
interface ReportData {
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, number>;
  truncated?: boolean;
}

export interface ReportFile { blob: Blob; fileName: string; rows: number; truncated: boolean }

const integer = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });

function display(value: string | number | null | undefined, type: ReportColumn['type']): string {
  if (value == null || value === '') return '';
  if (typeof value !== 'number') return String(value);
  if (type === 'number') return integer.format(value);
  return String(value);
}

const isNumeric = (c: ReportColumn) => c.type === 'number' || c.type === 'money';

function buildFileName(req: ReportRequest, ext: string) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const range = req.desde ? (req.desde === req.hasta ? `-${req.desde}` : `-${req.desde}-al-${req.hasta}`) : `-${today}`;
  return `${req.title.replace(/\s+/g, '-')}-AzkellFleet${range}.${ext}`;
}

async function toExcel(data: ReportData): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const head = (value: string) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#F5F5F7' });
  const fmt: Record<string, string> = { number: '#,##0', money: '"S/" #,##0.00' };
  const cell = (value: string | number | null, c: ReportColumn) =>
    value == null || value === '' ? null : typeof value === 'number' ? { value, format: fmt[c.type ?? ''] } : { value: String(value) };

  const rows: unknown[][] = [
    [{ value: `Azkell Fleet · ${data.title}`, fontWeight: 'bold' as const }],
    [{ value: data.subtitle }],
    [],
    data.columns.map(c => head(c.label)),
    ...data.rows.map(r => data.columns.map(c => cell(r[c.key], c))),
  ];
  if (data.totals) {
    rows.push(data.columns.map((c, i) =>
      (c.key in data.totals! ? { ...cell(data.totals![c.key], c), fontWeight: 'bold' as const } : i === 0 ? { value: 'Total', fontWeight: 'bold' as const } : null)
    ));
  }
  const columns = data.columns.map(c => ({ width: isNumeric(c) ? 14 : Math.min(40, Math.max(12, c.label.length + 4)) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return writeExcelFile([{ data: rows as any, sheet: data.title.slice(0, 31), columns, stickyRowsCount: 4 }]).toBlob();
}

// Carga html2pdf una sola vez desde /libs (ya existe en el proyecto)
let _html2pdfPromise: Promise<void> | null = null;
function cargarHtml2pdf(): Promise<void> {
  if (_html2pdfPromise) return _html2pdfPromise;
  _html2pdfPromise = new Promise((resolve, reject) => {
    if ((window as unknown as Record<string, unknown>).html2pdf) { resolve(); return; }
    const s = document.createElement('script');
    s.src = '/libs/html2pdf.bundle.min.js';
    s.onload = () => resolve();
    s.onerror = () => { _html2pdfPromise = null; reject(new Error('No se pudo cargar html2pdf')); };
    document.head.appendChild(s);
  });
  return _html2pdfPromise;
}

type Html2PdfBuilder = {
  set(opts: Record<string, unknown>): Html2PdfBuilder;
  from(el: HTMLElement): Html2PdfBuilder;
  outputPdf(type: 'blob'): Promise<Blob>;
};

async function toPdf(data: ReportData, req: ReportRequest): Promise<Blob> {
  await cargarHtml2pdf();
  const h2pFn = (window as unknown as Record<string, unknown>).html2pdf as () => Html2PdfBuilder;

  const wide = data.columns.length > 7;
  const div = document.createElement('div');
  div.style.cssText = 'font-family:-apple-system,Helvetica,sans-serif;font-size:11px;padding:24px;color:#1d1d1f;background:#fff;';

  const headerHtml = `
    <div style="margin-bottom:16px;">
      <div style="font-size:8px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Azkell Fleet</div>
      <h1 style="font-size:18px;font-weight:700;margin:0 0 4px;">${data.title}</h1>
      <p style="font-size:9px;color:#6e6e73;margin:0;">${data.subtitle}</p>
    </div>`;

  const thStyle = 'text-align:left;padding:6px 8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e5ea;background:#f5f5f7;';
  const colsHtml = data.columns.map(c => `<th style="${thStyle}${isNumeric(c) ? 'text-align:right;' : ''}">${c.label}</th>`).join('');

  const rowsHtml = data.rows.length
    ? data.rows.map((r, i) => {
        const bgStyle = i % 2 === 1 ? 'background:#f9f9fb;' : '';
        const cells = data.columns.map(c => {
          const v = display(r[c.key], c.type);
          return `<td style="padding:5px 8px;border-bottom:1px solid #e5e5ea;${isNumeric(c) ? 'text-align:right;' : ''}">${v}</td>`;
        }).join('');
        return `<tr style="${bgStyle}">${cells}</tr>`;
      }).join('')
    : `<tr><td colspan="${data.columns.length}" style="padding:20px;text-align:center;color:#6e6e73;">No hay registros para este reporte.</td></tr>`;

  div.innerHTML = `${headerHtml}
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>${colsHtml}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  document.body.appendChild(div);
  try {
    const blob = await h2pFn().set({
      margin: [10, 10, 10, 10],
      filename: buildFileName(req, 'pdf'),
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: wide ? 'landscape' : 'portrait' },
    }).from(div).outputPdf('blob');
    return blob;
  } finally {
    document.body.removeChild(div);
  }
}

/** Pide los datos al servidor y arma el archivo (Excel o PDF) en el navegador. */
export async function buildReportFile(req: ReportRequest): Promise<ReportFile> {
  const query = { desde: req.desde, hasta: req.hasta, cliente: req.cliente, marca: req.marca, tipo_unidad: req.tipo_unidad, estado: req.estado };
  const data = await api<ReportData>(`/asistente/reportes/${req.tipo}`, { query });
  const blob = req.formato === 'pdf' ? await toPdf(data, req) : await toExcel(data);
  return { blob, fileName: buildFileName(req, req.formato === 'pdf' ? 'pdf' : 'xlsx'), rows: data.rows.length, truncated: !!data.truncated };
}

export function saveFile(file: ReportFile) {
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function openFile(file: ReportFile) {
  const url = URL.createObjectURL(file.blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
