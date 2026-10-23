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
  /** Título del documento: es lo que muestra el visor de PDF */
  titulo?: string;
  /** Formato de la imagen de cada página: PNG da texto más nítido (más pesado) */
  imagen?: 'jpeg' | 'png';
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
    image: { type: opciones.imagen ?? 'jpeg', quality: 0.95 },
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
  if (!opciones.titulo) return h2p().from(elemento).set(opcionesH2P('reporte.pdf', opciones)).outputPdf('blob');
  const worker = h2p().from(elemento).set(opcionesH2P('reporte.pdf', opciones)) as unknown as { toPdf(): { get(k: 'pdf'): Promise<{ setProperties(p: { title: string }): void; output(t: 'blob'): Blob }> } };
  const pdf = await worker.toPdf().get('pdf');
  pdf.setProperties({ title: opciones.titulo });
  return pdf.output('blob');
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

/**
 * Monta el elemento para generar su PDF. html2canvas no dibuja lo que está en coordenadas negativas
 * ni posicionado fuera de flujo, así que va dentro de una caja de 0×0 que lo oculta al usuario.
 * Devuelve la función que lo quita.
 */
export function montarParaPDF(el: HTMLElement): () => void {
  const caja = document.createElement('div');
  caja.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;';
  caja.appendChild(el);
  document.body.appendChild(caja);
  return () => caja.remove();
}

/** Descarga un archivo desde el navegador */
export function descargarArchivo(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Toque nuevo para compartir: el navegador exige un gesto reciente del usuario y, si el PDF tardó en generarse,
 * lo da por perdido (NotAllowedError). Igual que el clásico, se muestra un botón para repetir el gesto.
 */
function pedirToqueParaCompartir(archivo: File, nombre: string, texto: string): Promise<'compartido' | 'descargado' | 'cancelado'> {
  return new Promise(resolve => {
    const capa = document.createElement('div');
    capa.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
    const caja = document.createElement('div');
    caja.style.cssText = 'background:#fff;border-radius:24px;padding:26px 20px;text-align:center;max-width:320px;width:88%;box-shadow:0 20px 40px rgba(0,0,0,.25);font-family:inherit;';
    const titulo = document.createElement('h3');
    titulo.textContent = 'PDF listo';
    titulo.style.cssText = 'margin:0 0 8px;font-weight:800;color:#0f172a;font-size:1.1rem;';
    const aviso = document.createElement('p');
    aviso.textContent = 'Toca el botón para abrir WhatsApp y seleccionar el chat.';
    aviso.style.cssText = 'margin:0 0 20px;color:#64748b;font-size:.83rem;';
    const enviar = document.createElement('button');
    enviar.type = 'button';
    enviar.textContent = 'Enviar por WhatsApp';
    enviar.style.cssText = 'background:#25D366;color:#fff;font-weight:700;border:none;padding:12px 24px;border-radius:14px;width:100%;font-size:.95rem;cursor:pointer;min-height:44px;';
    const cancelar = document.createElement('button');
    cancelar.type = 'button';
    cancelar.textContent = 'Cancelar';
    cancelar.style.cssText = 'background:transparent;color:#94a3b8;font-weight:600;border:none;margin-top:12px;font-size:.8rem;cursor:pointer;min-height:44px;';
    caja.append(titulo, aviso, enviar, cancelar);
    capa.append(caja);
    document.body.appendChild(capa);

    cancelar.onclick = () => { capa.remove(); resolve('cancelado'); };
    enviar.onclick = async () => {
      capa.remove();
      try {
        await navigator.share({ files: [archivo], title: nombre, text: texto });
        resolve('compartido');
      } catch (err) {
        if ((err as Error).name === 'AbortError') { resolve('cancelado'); return; }
        window.location.href = 'whatsapp://';
        resolve('compartido');
      }
    };
  });
}

/**
 * Envía un PDF por WhatsApp, como el clásico.
 * - Celular y navegadores que permiten compartir archivos: hoja de compartir del sistema con el PDF adjunto.
 * - Si el navegador pierde el gesto mientras se genera el PDF: botón "Enviar por WhatsApp" para repetirlo.
 * - Sin compartir nativo: se abre la aplicación de WhatsApp. No se descarga el archivo.
 */
export async function compartirPDF(blob: Blob, nombre: string, texto: string): Promise<'compartido' | 'descargado' | 'cancelado'> {
  const archivo = new File([blob], nombre, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre, text: texto });
      return 'compartido';
    } catch (err) {
      const causa = (err as Error).name;
      if (causa === 'AbortError') return 'cancelado';
      if (causa === 'NotAllowedError') return pedirToqueParaCompartir(archivo, nombre, texto);
    }
  }
  window.location.href = 'whatsapp://';
  return 'compartido';
}
