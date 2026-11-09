import './ce-detalle.css';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { CalendarDays, CarFront, Cog, FileText, Fingerprint, Gauge, Hash, Layers, MessageCircle, Palette, Pencil, ShieldAlert, ShieldCheck, Tag, Truck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../../core/ui/Button';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { formatFechaPe } from '../../core/lib/format';
import { spring } from '../../core/lib/motion';
import { CeCroquis } from './ce-croquis';
import { cargarPlantilla, leerPartes, PLANTILLA_FABRICA, resumenActa, type Calificacion } from './ce-plantilla';
import { codigoConfiguracion, estadoActa } from './ce-pdf';
import { normalizarConfig } from './croquisEntrega';
import type { EntregaVehiculo } from './ce-tipos';

const ETIQUETA: Record<Calificacion, string> = { B: 'OK', R: 'REG', M: 'MAL' };
type Filtro = 'todas' | 'novedades';

interface Props {
  acta: EntregaVehiculo | null;
  ocupado: boolean;
  puedeEditar: boolean;
  onClose: () => void;
  onEditar: (a: EntregaVehiculo) => void;
  onPdf: (a: EntregaVehiculo) => void;
  onWhatsApp: (a: EntregaVehiculo) => void;
}

/** Una especificación de la unidad: icono, etiqueta y valor (vacío si no se llenó) */
function Spec({ icono, etiqueta, valor, mono, ancho, destacado }: { icono: ReactNode; etiqueta: string; valor: unknown; mono?: boolean; ancho?: boolean; destacado?: boolean }) {
  const texto = String(valor ?? '').trim();
  return (
    <div className={`ced-spec${ancho ? ' ced-spec--ancho' : ''}${destacado ? ' ced-spec--destacado' : ''}${texto ? '' : ' ced-spec--vacio'}`}>
      <span className="ced-spec__icono" aria-hidden>{icono}</span>
      <div className="ced-spec__texto">
        <span className="ced-spec__etq">{etiqueta}</span>
        <span className={`ced-spec__valor${mono ? ' ced-spec__valor--mono' : ''}`}>{texto || 'Sin dato'}</span>
      </div>
    </div>
  );
}

function Persona({ rol, nombre, firma }: { rol: string; nombre: string; firma?: string | null }) {
  return (
    <div className="ced-persona">
      <span className="ced-dato__etq">{rol}</span>
      <strong className="ced-persona__nombre">{nombre || '—'}</strong>
      <div className="ced-persona__firma">
        {firma ? <img src={firma} alt={`Firma de ${nombre}`} /> : <span>Sin firma</span>}
      </div>
    </div>
  );
}

/** Detalle del acta de entrega en una ventana: estado general, datos, inventario por categoría, croquis y firmas */
export function CeDetalle({ acta, ocupado, puedeEditar, onClose, onEditar, onPdf, onWhatsApp }: Props) {
  const reducir = useReducedMotion();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const plantillaQ = useQuery({ queryKey: ['flota', 'ce-plantilla'], queryFn: cargarPlantilla, staleTime: 5 * 60_000, enabled: !!acta });
  const grupos = plantillaQ.data ?? PLANTILLA_FABRICA;

  const resumen = useMemo(() => resumenActa(acta ? leerPartes(acta.inventario_partes_json) : {}, grupos), [acta, grupos]);
  const visibles = useMemo(() => (filtro === 'todas'
    ? resumen.grupos
    : resumen.grupos.map(g => ({ ...g, items: g.items.filter(i => i.estado !== 'B') })).filter(g => g.items.length > 0)),
  [resumen, filtro]);

  const estado = estadoActa(resumen.malos);
  const pct = (n: number) => (resumen.total ? (n / resumen.total) * 100 : 0);
  const trans = reducir ? { duration: 0 } : spring;

  return (
    <Sheet open={!!acta} onClose={onClose} ancho anclaAbajo ligera title={acta ? `Acta ${acta.numero_inventario || acta.id}` : ''}
      footer={acta ? (
        <>
          <Button variant="secondary" icon={<FileText size={16} />} disabled={ocupado} onClick={() => onPdf(acta)}>PDF</Button>
          <Button variant="secondary" icon={<MessageCircle size={16} />} disabled={ocupado} onClick={() => onWhatsApp(acta)}>WhatsApp</Button>
          {puedeEditar && <Button variant="primary" icon={<Pencil size={16} />} disabled={ocupado} onClick={() => onEditar(acta)}>Editar acta</Button>}
        </>
      ) : undefined}>
      {acta && (
        <div className="ced">
          <header className="ced-hero">
            <div className="ced-hero__izq">
              <LicensePlate plate={acta.placa} size="lg" />
              <div className="ced-hero__texto">
                <span className="ced-hero__unidad">{[acta.clase, acta.marca, acta.modelo].filter(Boolean).join(' · ') || 'Unidad'}</span>
                <span className="ced-hero__sub"><CalendarDays size={14} /> {formatFechaPe(acta.fecha)} · {acta.motivo || 'Entrega de unidad'}</span>
              </div>
            </div>
            <span className={`ced-estado${estado.conNovedades ? ' ced-estado--nov' : ''}`}>
              {estado.conNovedades ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />} {estado.texto}
            </span>
          </header>

          <section className="ced-resumen" aria-label="Estado del inventario">
            <div className="ced-kpi"><strong>{resumen.total}</strong><span>Revisadas</span></div>
            <div className="ced-kpi ced-kpi--ok"><strong>{resumen.buenos}</strong><span>Buenas</span></div>
            <div className="ced-kpi ced-kpi--reg"><strong>{resumen.regulares}</strong><span>Regulares</span></div>
            <div className="ced-kpi ced-kpi--mal"><strong>{resumen.malos}</strong><span>Malas</span></div>
            <div className="ced-barra" role="img" aria-label={`${resumen.buenos} buenas, ${resumen.regulares} regulares, ${resumen.malos} malas`}>
              <motion.i className="ced-barra__ok" initial={{ width: 0 }} animate={{ width: `${pct(resumen.buenos)}%` }} transition={trans} />
              <motion.i className="ced-barra__reg" initial={{ width: 0 }} animate={{ width: `${pct(resumen.regulares)}%` }} transition={trans} />
              <motion.i className="ced-barra__mal" initial={{ width: 0 }} animate={{ width: `${pct(resumen.malos)}%` }} transition={trans} />
            </div>
          </section>

          <section className="ced-bloque">
            <h3 className="ced-titulo">Vehículo</h3>
            <div className="ced-specs">
              <Spec icono={<Truck size={18} />} etiqueta="Clase" valor={acta.clase} />
              <Spec icono={<Tag size={18} />} etiqueta="Marca" valor={acta.marca} />
              <Spec icono={<Layers size={18} />} etiqueta="Tipo" valor={acta.tipo} />
              <Spec icono={<CarFront size={18} />} etiqueta="Modelo" valor={acta.modelo} />
              <Spec icono={<Palette size={18} />} etiqueta="Color" valor={acta.color} />
              <Spec icono={<Gauge size={18} />} etiqueta="Kilometraje" destacado ancho
                valor={Number(acta.kilometraje) > 0 ? `${Number(acta.kilometraje).toLocaleString('es-PE')} km` : ''} mono />
              <Spec icono={<Hash size={18} />} etiqueta="N° inventario" valor={acta.numero_inventario || acta.id} mono />
              <Spec icono={<Cog size={18} />} etiqueta="Número del motor" valor={acta.numero_motor} mono ancho />
              <Spec icono={<Fingerprint size={18} />} etiqueta="Serie / VIN" valor={acta.numero_serie} mono ancho />
            </div>
          </section>

          <section className="ced-bloque">
            <h3 className="ced-titulo">Entrega y recepción</h3>
            <div className="ced-personas">
              <Persona rol="Entregado por · Control de flota" nombre={acta.quien_entrega} firma={acta.firma_entrega} />
              <Persona rol="Recibido por · Conductor asignado" nombre={acta.quien_recibe} firma={acta.firma_recibe} />
            </div>
          </section>

          <section className="ced-bloque">
            <div className="ced-titulo-fila">
              <h3 className="ced-titulo">Inventario de partes</h3>
              {resumen.regulares + resumen.malos > 0 && (
                <SegmentedControl<Filtro> label="Filtrar partes" value={filtro} onChange={setFiltro}
                  options={[{ value: 'todas', label: 'Todas' }, { value: 'novedades', label: `Con novedades (${resumen.regulares + resumen.malos})` }]} />
              )}
            </div>
            {visibles.length === 0 ? (
              <p className="ced-vacio">{resumen.total === 0 ? 'No se calificó ninguna parte en esta acta.' : 'Todas las partes están en buen estado.'}</p>
            ) : (
              <div className="ced-cats">
                {visibles.map(g => (
                  <article key={g.id} className="ced-cat">
                    <h4><span>{g.titulo}</span><em>{g.items.length}</em></h4>
                    <ul>
                      {g.items.map(it => (
                        <li key={it.nombre}>
                          <span>{it.nombre}</span>
                          {it.cantidad > 1 && <small>×{it.cantidad}</small>}
                          <span className={`ced-pill ced-pill--${it.estado}`}>{ETIQUETA[it.estado]}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="ced-bloque">
            <h3 className="ced-titulo">Diagrama de la unidad</h3>
            <CeCroquis configuracion={normalizarConfig(codigoConfiguracion(acta))} estiloCabina={acta.estilo_cabina === 'trompa' ? 'trompa' : 'chata'}
              estiloCarroceria={acta.estilo_carroceria === 'plataforma' ? 'plataforma' : 'furgon'} editable={false} onChange={() => undefined} />
          </section>

          <section className="ced-bloque">
            <h3 className="ced-titulo">Observaciones</h3>
            <p className={`ced-obs${acta.observaciones ? '' : ' ced-obs--vacia'}`}>{acta.observaciones || 'Sin observaciones registradas.'}</p>
          </section>
        </div>
      )}
    </Sheet>
  );
}
