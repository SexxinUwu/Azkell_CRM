import type { ComponentType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Hourglass, ShieldCheck } from 'lucide-react';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { CabeceraHerramientas, IconoHerramienta } from './CabeceraHerramientas';
import { CATEGORIAS, deCategoria, porId } from './catalogo';
import { ComprimirPdf, DividirPdf, ImagenAPdf, MarcaAguaPdf, NumerarPdf, OrganizarPdf, PdfAImagen, RotarPdf, UnirPdf } from './Herramientas';
import { CompararPdf, EliminarPaginas, EscanearAPdf, ExtraerPaginas, FirmarPdf, FormulariosPdf, PdfAMarkdown, RecortarPdf, RepararPdf } from './HerramientasMas';
import './herramientas.css';

// Pantalla de cada herramienta, por su id del catálogo
const VISTAS: Record<string, ComponentType> = {
  unir: UnirPdf, dividir: DividirPdf, 'eliminar-paginas': EliminarPaginas, 'extraer-paginas': ExtraerPaginas, ordenar: OrganizarPdf, escanear: EscanearAPdf,
  comprimir: ComprimirPdf, reparar: RepararPdf,
  'jpg-a-pdf': ImagenAPdf, 'pdf-a-jpg': PdfAImagen, 'pdf-a-markdown': PdfAMarkdown,
  rotar: RotarPdf, numerar: NumerarPdf, 'marca-de-agua': MarcaAguaPdf, recortar: RecortarPdf, formularios: FormulariosPdf,
  firmar: FirmarPdf, comparar: CompararPdf,
};

const PRIVACIDAD = 'Tus archivos no salen de este equipo: todo se procesa aquí, en tu navegador. No se suben a internet ni pasan por el servidor de Azkell.';

// Herramientas PDF propias, como iLovePDF pero sin enviar los archivos a un tercero.
export function HerramientasPage() {
  const { herramienta } = useParams<{ herramienta?: string }>();
  const actual = porId(herramienta);

  if (actual) {
    const Vista = actual.listo ? VISTAS[actual.id] : undefined;
    return (
      <Page narrow>
        <CabeceraHerramientas />
        <Link to="/herramientas" className="hp-volver"><ArrowLeft size={16} /> Todas las herramientas</Link>
        <PageHeader eyebrow="Herramientas PDF" title={actual.titulo} subtitle={actual.descripcion} />
        {Vista ? (
          <>
            <div className="hp-privado"><ShieldCheck size={16} aria-hidden /> {PRIVACIDAD}</div>
            <Vista />
          </>
        ) : (
          <EmptyState icon={<Hourglass size={22} />} title="Pronto disponible">
            {actual.nota ?? 'Estamos preparando esta herramienta.'}
          </EmptyState>
        )}
      </Page>
    );
  }

  return (
    <Page wide>
      <CabeceraHerramientas />
      <PageHeader eyebrow="Herramientas" title="Herramientas PDF" subtitle="Unir, dividir, comprimir y más, sin enviar tus archivos a nadie." />
      <Notice tone="success" icon={<ShieldCheck size={16} />}>{PRIVACIDAD}</Notice>
      {CATEGORIAS.map(c => (
        <section key={c.id} className="hp-seccion">
          <h2 className="hp-seccion__titulo">{c.titulo}</h2>
          <div className="hp-grid">
            {deCategoria(c.id).map(h => (
              <Link key={h.id} to={`/herramientas/${h.id}`} className={`hp-tarjeta${h.listo ? '' : ' hp-tarjeta--pronto'}`}>
                <IconoHerramienta h={h} size={22} />
                <strong>{h.titulo}{!h.listo && <em className="hp-pronto">Pronto</em>}</strong>
                <span>{h.descripcion}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </Page>
  );
}
