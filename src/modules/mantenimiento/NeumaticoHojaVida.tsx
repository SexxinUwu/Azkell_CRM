import './NeumaticoHojaVida.css';
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, CircleDot, Disc3, Flame, Gauge, Hammer, Heart, MapPin, Tag, Truck } from 'lucide-react';
import { api, errorMessage } from '../../core/api/client';
import { formatFechaHoraPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, Notice, Page } from '../../core/ui/Display';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Sheet } from '../../core/ui/Sheet';
import { NhvRanura } from './nhv2-Ranura';
import { NhvTimeline } from './nhv2-Timeline';
import {
  fmtCpk, fmtEntero, fmtKm, fmtPsi, fmtSoles, normalizarFicha,
  type Ficha, type FichaRaw, type Llanta,
} from './nhv2-datos';

// Ficha de un neumático (GET /api/neumaticos/ficha/:codigo).
// Dos modos: hoja modal (prop onClose, desde las hojas de inspección) y pantalla completa
// (ruta mantenimiento/neumaticos-ficha/:codigo, vía NeumaticoHojaVidaRuta).

const PESTANAS = [
  { id: 'presion', etiqueta: 'Presión y surco' },
  { id: 'vida', etiqueta: 'Vida actual del neumático' },
  { id: 'detalles', etiqueta: 'Detalles' },
] as const;
type IdPestana = (typeof PESTANAS)[number]['id'];

type Tono = 'gray' | 'green' | 'amber' | 'red';

/** Color del chip de estado: en actividad en ámbar, disponible en verde, reforma o descarte en rojo */
function tonoEstado(estado: string): Tono {
  const e = estado.toUpperCase();
  if (e.includes('ACTIV')) return 'amber';
  if (e.includes('DISPON')) return 'green';
  if (e.includes('REFORMA') || e.includes('DESCART')) return 'red';
  return 'gray';
}

/** "EN_ACTIVIDAD" -> "En actividad" */
function etiquetaEstado(estado: string): string {
  const s = estado.toLowerCase().replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function useFicha(codigo: string | null) {
  return useQuery<Ficha>({
    queryKey: ['mant', 'neumatico-ficha', codigo],
    enabled: codigo !== null && codigo !== '',
    queryFn: async () => {
      const r = await api<FichaRaw>(`/neumaticos/ficha/${encodeURIComponent(codigo ?? '')}`);
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo cargar la ficha');
      return normalizarFicha(r);
    },
  });
}
type ConsultaFicha = ReturnType<typeof useFicha>;

function Dato({ etiqueta, valor, icono, grande = false }: { etiqueta: string; valor: ReactNode; icono?: ReactNode; grande?: boolean }) {
  return (
    <div className={`nhv__dato${grande ? ' nhv__dato--grande' : ''}`}>
      <span className="nhv__dato-etiqueta">{icono}{etiqueta}</span>
      <strong className="nhv__dato-valor">{valor}</strong>
    </div>
  );
}

/** Bloque plegable de una pestaña (Presión, Ranura) */
function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [abierto, setAbierto] = useState(true);
  return (
    <section className="nhv__bloque">
      <button
        type="button"
        className="nhv__bloque-cab"
        aria-expanded={abierto}
        onClick={() => { haptic('selection'); setAbierto(v => !v); }}
      >
        <span>{titulo}</span>
        <ChevronDown size={18} className={`nhv__chev${abierto ? ' is-abierto' : ''}`} aria-hidden />
      </button>
      {abierto && <div className="nhv__bloque-cuerpo">{children}</div>}
    </section>
  );
}

/** Acción que todavía no está conectada: visible, deshabilitada, con su aviso */
function AccionProximamente({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <div className="nhv__accion">
      <span className="nhv__nota">Próximamente</span>
      <Button variant="primary" disabled icon={icono} title="Próximamente">{children}</Button>
    </div>
  );
}

function Cabecera({ l }: { l: Llanta }) {
  return (
    <header className="nhv__cab">
      <div className="nhv__cab-foto">
        <span className="nhv__disco" aria-hidden><Disc3 size={40} strokeWidth={1.5} /></span>
        {l.estado && <Badge tone={tonoEstado(l.estado)}>{etiquetaEstado(l.estado)}</Badge>}
      </div>
      <div className="nhv__cab-datos">
        <Dato grande etiqueta="Nombre / Marca de fuego" icono={<Flame size={14} />} valor={l.codigo} />
        <Dato grande etiqueta="Vida del neumático" icono={<Heart size={14} />} valor={fmtEntero(l.vida)} />
        <Dato grande etiqueta="Marca de neumático" icono={<Tag size={14} />} valor={l.marca ?? '—'} />
        <Dato grande etiqueta="Modelo de neumático" icono={<CircleDot size={14} />} valor={l.modelo ?? '—'} />
        <Dato grande etiqueta="Medida de neumático" icono={<Truck size={14} />} valor={l.medida ?? '—'} />
      </div>
    </header>
  );
}

function PanelPresionSurco({ f }: { f: Ficha }) {
  return (
    <>
      <Bloque titulo="Presión de neumático">
        <div className="nhv__par">
          <Dato etiqueta="Fecha/Hora" valor={formatFechaHoraPe(f.presionFecha)} />
          <Dato etiqueta="Última medición" valor={fmtPsi(f.presionUltima)} />
        </div>
        <AccionProximamente icono={<Gauge size={16} />}>Medición de presión</AccionProximamente>
      </Bloque>
      <Bloque titulo="Ranura del neumático">
        {f.surcoFecha && <p className="nhv__nota nhv__nota--arriba">Último apunte: {formatFechaHoraPe(f.surcoFecha)}</p>}
        <NhvRanura filas={f.surco} />
        <AccionProximamente icono={<Hammer size={16} />}>Apuntar sulco</AccionProximamente>
      </Bloque>
    </>
  );
}

function PanelVida({ l }: { l: Llanta }) {
  const costoTotal = l.costoCompra === null && l.costoReencauches === null
    ? null
    : (l.costoCompra ?? 0) + (l.costoReencauches ?? 0);
  return (
    <>
      <Bloque titulo="Indicadores de costo">
        <div className="nhv__rejilla">
          <Dato etiqueta="Costo total de la vida" valor={fmtSoles(costoTotal)} />
          <Dato etiqueta="Costo de compra" valor={fmtSoles(l.costoCompra)} />
          <Dato etiqueta="Costo de reencauches" valor={fmtSoles(l.costoReencauches)} />
          <Dato etiqueta="CPK (S/ por km)" valor={fmtCpk(l.cpk)} />
        </div>
      </Bloque>
      <Bloque titulo="Indicadores de desgaste">
        <div className="nhv__rejilla">
          <Dato etiqueta="Vida" valor={fmtEntero(l.vida)} />
          <Dato etiqueta="Reencauches" valor={fmtEntero(l.reencauches)} />
          <Dato etiqueta="Km acumulados" valor={fmtKm(l.kmAcumulado)} />
        </div>
      </Bloque>
    </>
  );
}

function PanelDetalles({ l }: { l: Llanta }) {
  return (
    <>
      <Bloque titulo="Documentación">
        <div className="nhv__rejilla">
          <Dato etiqueta="Código" valor={l.codigo} />
          <Dato etiqueta="Marca" valor={l.marca ?? '—'} />
          <Dato etiqueta="Modelo" valor={l.modelo ?? '—'} />
          <Dato etiqueta="Medida" valor={l.medida ?? '—'} />
          <Dato etiqueta="Estado" valor={l.estado ? etiquetaEstado(l.estado) : '—'} />
          <Dato etiqueta="Almacén" valor={l.almacen ?? '—'} />
        </div>
      </Bloque>
      <Bloque titulo="Ubicación">
        <div className="nhv__rejilla">
          <Dato etiqueta="Vehículo actual" valor={l.placaActual ? <LicensePlate plate={l.placaActual} size="sm" /> : '—'} />
          <Dato etiqueta="Posición actual" valor={l.posicionActual ?? '—'} icono={<MapPin size={14} />} />
        </div>
      </Bloque>
    </>
  );
}

function FichaContenido({ f, l }: { f: Ficha; l: Llanta }) {
  const [pestana, setPestana] = useState<IdPestana>('presion');
  const contenido = pestana === 'presion' ? <PanelPresionSurco f={f} />
    : pestana === 'vida' ? <PanelVida l={l} />
    : <PanelDetalles l={l} />;

  return (
    <div className="nhv">
      <Cabecera l={l} />
      <div className="nhv__cuerpo">
        <div className="nhv__principal">
          <div className="nhv__pestanas" role="tablist" aria-label="Secciones de la ficha">
            {PESTANAS.map(p => (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`nhv-tab-${p.id}`}
                aria-selected={pestana === p.id}
                aria-controls={`nhv-panel-${p.id}`}
                className={`nhv__pestana${pestana === p.id ? ' is-activa' : ''}`}
                onClick={() => { if (pestana !== p.id) { haptic('selection'); setPestana(p.id); } }}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
          <div className="nhv__panel" role="tabpanel" id={`nhv-panel-${pestana}`} aria-labelledby={`nhv-tab-${pestana}`}>
            {contenido}
          </div>
        </div>
        <aside className="nhv__lateral">
          <NhvTimeline eventos={f.timeline} />
        </aside>
      </div>
    </div>
  );
}

function FichaCuerpo({ codigo, consulta }: { codigo: string | null; consulta: ConsultaFicha }) {
  const { data, isLoading, error } = consulta;
  if (error) return <Notice tone="error">{errorMessage(error)}</Notice>;
  if (isLoading) return <PageLoader />;
  if (!data) return null;
  if (!data.llanta) return <Notice tone="error">No se encontró el neumático {codigo}.</Notice>;
  return <FichaContenido f={data} l={data.llanta} />;
}

function FichaPagina({ codigo, consulta }: { codigo: string | null; consulta: ConsultaFicha }) {
  const navigate = useNavigate();
  // Volver a la pantalla anterior; si la ficha se abrió directo, a la lista de neumáticos
  const volver = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/mantenimiento/neumaticos-ultimas');
  };
  return (
    <Page wide>
      <nav className="nhv__ruta" aria-label="Ubicación">
        <button type="button" className="nhv__volver" onClick={volver}>
          <ChevronLeft size={16} aria-hidden />Neumáticos
        </button>
        <span aria-hidden>/</span>
        <span className="nhv__ruta-actual">{codigo ?? '—'}</span>
      </nav>
      <FichaCuerpo codigo={codigo} consulta={consulta} />
    </Page>
  );
}

/**
 * Ficha de un neumático.
 * - Con `onClose`: se muestra como hoja modal (codigo null = cerrada).
 * - Sin `onClose`: pantalla completa, para la ruta de la ficha.
 * Un error del servidor se muestra como aviso dentro de la ficha.
 */
export function NeumaticoHojaVida({ codigo, onClose }: { codigo: string | null; onClose?: () => void }) {
  const consulta = useFicha(codigo);
  if (onClose) {
    return (
      <Sheet open={codigo !== null} onClose={onClose} title={codigo ? `Ficha · ${codigo}` : 'Ficha del neumático'} ancho
        footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
        <FichaCuerpo codigo={codigo} consulta={consulta} />
      </Sheet>
    );
  }
  return <FichaPagina codigo={codigo} consulta={consulta} />;
}

/** Página de la ruta mantenimiento/neumaticos-ficha/:codigo: toma el código de la URL */
export function NeumaticoHojaVidaRuta() {
  const { codigo } = useParams();
  return <NeumaticoHojaVida codigo={codigo ? codigo : null} />;
}
