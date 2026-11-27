import type { ComponentType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Combine, FileDown, FileImage, GalleryHorizontalEnd, Images, LayoutGrid, ListOrdered, RotateCw, Scissors, ShieldCheck, Stamp, type LucideIcon } from 'lucide-react';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { ComprimirPdf, DividirPdf, ImagenAPdf, MarcaAguaPdf, NumerarPdf, OrganizarPdf, PdfAImagen, RotarPdf, UnirPdf } from './Herramientas';
import './herramientas.css';

interface Herramienta { id: string; titulo: string; descripcion: string; icono: LucideIcon; color: string; Vista: ComponentType }

const HERRAMIENTAS: Herramienta[] = [
  { id: 'unir', titulo: 'Unir PDF', descripcion: 'Junta varios PDF en uno solo, en el orden que quieras.', icono: Combine, color: '#e5322d', Vista: UnirPdf },
  { id: 'dividir', titulo: 'Dividir PDF', descripcion: 'Separa un PDF por rangos, cada N páginas o extrae las que necesites.', icono: Scissors, color: '#f59e0b', Vista: DividirPdf },
  { id: 'organizar', titulo: 'Organizar y borrar páginas', descripcion: 'Mira las páginas, cámbialas de lugar, gíralas o bórralas.', icono: LayoutGrid, color: '#7c3aed', Vista: OrganizarPdf },
  { id: 'rotar', titulo: 'Girar PDF', descripcion: 'Gira todas las páginas o solo algunas.', icono: RotateCw, color: '#0891b2', Vista: RotarPdf },
  { id: 'imagen-a-pdf', titulo: 'Imagen a PDF', descripcion: 'Convierte fotos y capturas en un PDF. Corrige las fotos del celular.', icono: FileImage, color: '#16a34a', Vista: ImagenAPdf },
  { id: 'pdf-a-imagen', titulo: 'PDF a imagen', descripcion: 'Saca cada página como JPG o PNG.', icono: Images, color: '#2563eb', Vista: PdfAImagen },
  { id: 'numerar', titulo: 'Numerar páginas', descripcion: 'Agrega el número a cada página: «Página 1 de 10».', icono: ListOrdered, color: '#db2777', Vista: NumerarPdf },
  { id: 'marca-de-agua', titulo: 'Marca de agua', descripcion: 'Escribe un texto como CONFIDENCIAL sobre todas las páginas.', icono: Stamp, color: '#475569', Vista: MarcaAguaPdf },
  { id: 'comprimir', titulo: 'Comprimir PDF', descripcion: 'Reduce el peso para enviarlo por correo o WhatsApp.', icono: FileDown, color: '#ea580c', Vista: ComprimirPdf },
];

const PRIVACIDAD = 'Tus archivos no salen de este equipo: todo se procesa aquí, en tu navegador. No se suben a internet ni pasan por el servidor de Azkell.';

// Herramientas PDF propias, como iLovePDF pero sin enviar los archivos a un tercero.
export function HerramientasPage() {
  const { herramienta } = useParams<{ herramienta?: string }>();
  const actual = HERRAMIENTAS.find(h => h.id === herramienta);

  if (actual) {
    const { Vista } = actual;
    return (
      <Page narrow>
        <Link to="/herramientas" className="hp-volver"><ArrowLeft size={16} /> Todas las herramientas</Link>
        <PageHeader eyebrow="Herramientas PDF" title={actual.titulo} subtitle={actual.descripcion} />
        <div className="hp-privado"><ShieldCheck size={16} aria-hidden /> {PRIVACIDAD}</div>
        <Vista />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader eyebrow="Herramientas" title="Herramientas PDF" subtitle="Unir, dividir, comprimir y más, sin enviar tus archivos a nadie." />
      <Notice tone="success" icon={<ShieldCheck size={16} />}>{PRIVACIDAD}</Notice>
      <div className="hp-grid">
        {HERRAMIENTAS.map(h => (
          <Link key={h.id} to={`/herramientas/${h.id}`} className="hp-tarjeta">
            <span className="hp-tarjeta__icono" style={{ background: h.color }} aria-hidden><h.icono size={22} /></span>
            <strong>{h.titulo}</strong>
            <span>{h.descripcion}</span>
          </Link>
        ))}
      </div>
      <p className="hp-pie"><GalleryHorizontalEnd size={14} aria-hidden /> Los archivos se procesan en la memoria de tu equipo: los PDF muy grandes pueden ir lentos en celulares.</p>
    </Page>
  );
}
