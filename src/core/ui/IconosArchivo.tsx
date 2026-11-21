import type { CSSProperties } from 'react';
import pdf from '../../assets/iconos/pdf.svg';
import excel from '../../assets/iconos/excel.svg';
import whatsapp from '../../assets/iconos/whatsapp.svg';

// Iconos originales de tipo de archivo y de marca (colección Iconify: PDF y Excel de «vscode-icons», MIT; WhatsApp de «logos», CC0).
// Se usan como imagen: llevan sus propios colores y no se tiñen con el color del texto.
const base = { width: 22, height: 22, display: 'block' } as const;
export const IconoPdf = () => <img src={pdf} alt="" aria-hidden style={base} />;
export const IconoExcel = () => <img src={excel} alt="" aria-hidden style={base} />;
export const IconoWhatsapp = () => <img src={whatsapp} alt="" aria-hidden style={base} />;

interface PropsIcono { size?: number | string; style?: CSSProperties; className?: string; [k: string]: unknown }

/** Mismo uso que un icono de lucide (`size`, `style`, `className`), pero con la imagen original */
function iconoDe(src: string) {
  return function IconoArchivo({ size = 20, style, className }: PropsIcono) {
    return <img src={src} alt="" aria-hidden className={className} style={{ width: size, height: size, display: 'inline-block', flex: 'none', ...style }} />;
  };
}
/** Excel: reemplaza al icono genérico de hoja de cálculo en toda la aplicación */
export const FileSpreadsheet = iconoDe(excel);
/** PDF: para los botones y acciones que descargan o abren un PDF */
export const FilePdf = iconoDe(pdf);
