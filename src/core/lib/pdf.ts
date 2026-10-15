// Carga html2pdf.bundle.min.js desde /libs (ya existe en el proyecto, sin npm install)
let cargaPromesa: Promise<void> | null = null;

function cargarHtml2pdf(): Promise<void> {
  if (cargaPromesa) return cargaPromesa;
  cargaPromesa = new Promise((resolve, reject) => {
    if ((window as unknown as Record<string, unknown>).html2pdf) { resolve(); return; }
    const s = document.createElement('script');
    s.src = '/libs/html2pdf.bundle.min.js';
    s.onload = () => resolve();
    s.onerror = () => { cargaPromesa = null; reject(new Error('No se pudo cargar html2pdf')); };
    document.head.appendChild(s);
  });
  return cargaPromesa;
}

export interface OpcionesPDF {
  orientacion?: 'portrait' | 'landscape';
  formato?: 'a4' | 'letter';
  escala?: number;
  margen?: number | [number, number, number, number];
  /** Corta entre páginas sin partir una fila de tabla */
  paginado?: boolean;
}

type Html2pdfWorker = {
  from(el: HTMLElement): Html2pdfWorker;
  set(opciones: Record<string, unknown>): Html2pdfWorker;
  outputPdf(tipo: 'blob'): Promise<Blob>;
};

function opcionesH2P(nombre: string, opciones: OpcionesPDF) {
  return {
    margin: opciones.margen ?? [10, 10, 10, 10],
    filename: nombre,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: opciones.escala ?? 2, useCORS: true, logging: false },
    jsPDF: {
      unit: 'mm',
      format: opciones.formato ?? 'a4',
      orientation: opciones.orientacion ?? 'portrait',
    },
    ...(opciones.paginado ? { pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' } } : {}),
  };
}

export async function exportarPDF(
  elemento: HTMLElement,
  nombreArchivo: string,
  opciones: OpcionesPDF = {},
): Promise<void> {
  await cargarHtml2pdf();
  const h2p = (window as unknown as Record<string, unknown>).html2pdf as (
    el: HTMLElement,
    opt: Record<string, unknown>,
  ) => Promise<void>;
  const nombre = nombreArchivo.endsWith('.pdf') ? nombreArchivo : `${nombreArchivo}.pdf`;
  return h2p(elemento, opcionesH2P(nombre, opciones));
}

/** Genera el PDF sin descargarlo (para compartirlo como archivo) */
export async function generarPDFBlob(elemento: HTMLElement, opciones: OpcionesPDF = {}): Promise<Blob> {
  await cargarHtml2pdf();
  const h2p = (window as unknown as { html2pdf: () => Html2pdfWorker }).html2pdf;
  return h2p().from(elemento).set(opcionesH2P('reporte.pdf', opciones)).outputPdf('blob');
}

export async function exportarPDFPorId(
  id: string,
  nombreArchivo: string,
  opciones?: OpcionesPDF,
): Promise<void> {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} no encontrado en el DOM`);
  return exportarPDF(el, nombreArchivo, opciones);
}
