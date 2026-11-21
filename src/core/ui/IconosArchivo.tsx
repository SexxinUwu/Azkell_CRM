import type { CSSProperties } from 'react';
import pdf from '../../assets/iconos/pdf.png';
import excel from '../../assets/iconos/excel.svg';
import whatsapp from '../../assets/iconos/whatsapp.png';
import editar from '../../assets/iconos/editar.png';

// Iconos propios de la empresa: PDF, WhatsApp y Editar (PNG). Excel: «vscode-icons» (MIT, Iconify).
// PDF, WhatsApp y Excel se usan como imagen: llevan sus propios colores. Editar es una silueta y toma el color del texto.
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
/** WhatsApp: reemplaza al icono genérico de mensaje en los botones que envían por WhatsApp */
export const MessageCircle = iconoDe(whatsapp);

/** Editar: silueta propia que toma el color del texto (sirve en modo claro y oscuro) */
export function Pencil({ size = 20, style, className }: PropsIcono) {
  const m = `url(${editar}) center / contain no-repeat`;
  return <span aria-hidden className={className} style={{ width: size, height: size, display: 'inline-block', flex: 'none', background: 'currentColor', WebkitMask: m, mask: m, ...style }} />;
}
