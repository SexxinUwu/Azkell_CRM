import { useEffect, useState } from 'react';
import { CircleAlert, ServerCog } from 'lucide-react';
import { Notice } from '../../core/ui/Display';
import { ZonaArchivos } from './ZonaArchivos';
import { Accion, Aviso, Cuadro, ElegirPdf, useTarea, useUnPdf } from './Herramientas';
import { convertirEnServidor, estadoConversiones, type DestinoServidor } from './motorServidor';
import { pdfAExcel } from './motorPdf';

// Conversiones con el servidor de Azkell (Word, PowerPoint, Excel y HTML ↔ PDF) y PDF a Excel (en el navegador).

/** Pantalla de una conversión por servidor: se elige el archivo y se descarga el resultado */
function ConversionServidor({ destino, extensiones, etiquetaArchivo, etiquetaBoton, ayuda }: {
  destino: DestinoServidor; extensiones: string[]; etiquetaArchivo: string; etiquetaBoton: string; ayuda?: string;
}) {
  const t = useTarea();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  // null = consultando; false = este servidor todavía no tiene el motor instalado
  const [disponible, setDisponible] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    estadoConversiones().then(e => { if (vivo) setDisponible(e ? e.destinos.includes(destino) : true); });
    return () => { vivo = false; };
  }, [destino]);
  return (
    <Cuadro>
      <Notice tone="neutral" icon={<ServerCog size={16} />}>
        Esta conversión se hace en el servidor de Azkell, no en tu equipo. El archivo se borra apenas termina; no se guarda ni se envía a terceros.
      </Notice>
      {disponible === false && <Notice tone="error" icon={<CircleAlert size={16} />}>Esta conversión todavía no está instalada en el servidor. Avisa a Sistemas.</Notice>}
      <ZonaArchivos tipo="archivo" extensiones={extensiones} accept={extensiones.map(e => `.${e}`).join(',')} archivos={archivos} onChange={a => { setArchivos(a); t.limpiar(); }} etiqueta={etiquetaArchivo} onAviso={setAviso} disabled={t.trabajando} />
      <Aviso texto={aviso} />
      {ayuda && <p className="hp-ayuda">{ayuda}</p>}
      <Accion t={t} etiqueta={etiquetaBoton} listo={archivos.length > 0 && disponible !== false} onOtra={() => { setArchivos([]); t.limpiar(); }}
        correr={() => t.ejecutar(() => convertirEnServidor(archivos[0], destino))} />
    </Cuadro>
  );
}

export const WordAPdf = () => <ConversionServidor destino="pdf" extensiones={['doc', 'docx', 'odt', 'rtf', 'txt']} etiquetaArchivo="Elegir documento de Word" etiquetaBoton="Convertir a PDF" />;
export const PowerpointAPdf = () => <ConversionServidor destino="pdf" extensiones={['ppt', 'pptx', 'odp']} etiquetaArchivo="Elegir presentación" etiquetaBoton="Convertir a PDF" />;
export const ExcelAPdf = () => <ConversionServidor destino="pdf" extensiones={['xls', 'xlsx', 'ods', 'csv']} etiquetaArchivo="Elegir hoja de cálculo" etiquetaBoton="Convertir a PDF" ayuda="Cada hoja del libro sale como una o más páginas del PDF." />;
export const HtmlAPdf = () => <ConversionServidor destino="pdf-html" extensiones={['html', 'htm']} etiquetaArchivo="Elegir archivo HTML" etiquetaBoton="Convertir a PDF" ayuda="Se convierte el contenido del archivo. Por seguridad no se ejecuta JavaScript ni se descarga nada de internet: las imágenes y estilos deben venir dentro del propio archivo." />;
export const PdfAWord = () => <ConversionServidor destino="docx" extensiones={['pdf']} etiquetaArchivo="Elegir archivo PDF" etiquetaBoton="Convertir a Word" ayuda="La conversión es aproximada: el texto queda editable, pero el diseño complejo (tablas, columnas) puede cambiar." />;
export const PdfAPowerpoint = () => <ConversionServidor destino="pptx" extensiones={['pdf']} etiquetaArchivo="Elegir archivo PDF" etiquetaBoton="Convertir a PowerPoint" ayuda="Cada página del PDF pasa a ser una diapositiva. La conversión es aproximada." />;

// ─── PDF a Excel (en el navegador) ───
export function PdfAExcel() {
  const t = useTarea();
  const u = useUnPdf();
  return (
    <Cuadro>
      <ElegirPdf u={u} disabled={t.trabajando} />
      <p className="hp-ayuda">Detecta las columnas por la posición del texto y arma una hoja por página. Funciona con PDF que tienen texto (no con escaneos) y mejor con tablas simples: revisa el resultado.</p>
      <Accion t={t} etiqueta="Convertir a Excel" listo={!!u.archivo && u.paginas !== null} onOtra={() => { u.setArchivos([]); t.limpiar(); }} correr={() => t.ejecutar(av => pdfAExcel(u.archivo as File, av))} />
    </Cuadro>
  );
}
