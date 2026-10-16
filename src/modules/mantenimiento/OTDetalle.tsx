import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Download, Package, Play, Share2, Timer } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, Notice } from '../../core/ui/Display';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { abrirClasico } from '../../core/layout/navigation';
import { compartirPDF, descargarArchivo } from '../../core/lib/pdf';
import { InspeccionFicha } from '../inspecciones/InspeccionFicha';
import { useInspecciones, type Inspeccion } from '../inspecciones/api';
import {
  accionesDisponibles, costosOT, duracionPausa, etiquetaEstado, formatoDuracion, marcarTrabajo, otDetalles, otId,
  pausasDe, tiempoNetoOT, trabajoCosto, trabajosDeOT, useInspeccionesDeOT, useMateriales, useTrabajosOT,
  type AccionOT, type OrdenTrabajo, type PausaOT,
} from './api';
import { CerrarOTSheet, PausarOTSheet } from './OTAcciones';
import { pdfOt } from './otPdf';

export const ETIQUETA_ACCION: Record<AccionOT, string> = {
  iniciar:   'Iniciar OT',
  pausar:    'Pausar',
  reanudar:  'Reanudar',
  cerrar:    'Cerrar',
  anular:    'Anular',
  reactivar: 'Reactivar',
};

const soles = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaCorta = (s: string | null | undefined) => {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/** Reloj que avanza cada segundo mientras `activo`; un solo intervalo para toda la ficha */
function useAhora(activo: boolean) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!activo) return;
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activo]);
  return ahora;
}

/** Duración de una pausa; si está en curso, sigue contando */
function DuracionPausa({ pausa, ahora }: { pausa: PausaOT; ahora: number }) {
  return <span className="ot-cronometro t-numeric">{formatoDuracion(duracionPausa(pausa, ahora))}</span>;
}

/** Tono del badge según el estado de la OT */
function tonoEstado(estado: string): 'gray' | 'green' | 'amber' | 'accent' | 'red' {
  switch (estado) {
    case 'En Proceso': return 'green';
    case 'Pausada':    return 'amber';
    case 'Finalizado':
    case 'Cerrada':    return 'accent';
    case 'Anulado':    return 'red';
    default:           return 'gray';
  }
}

/** Backlog de la unidad enlazado a esta OT (se importa al crear la OT) */
interface BacklogOT { id: number; backlog_id: string; placa: string; km: number | null; tema: string | null; tarea: string; reportado_por: string | null; estado: string; ticket_ot: string | null }

function useBacklogDeOT(ticket: string) {
  return useQuery<BacklogOT[]>({
    queryKey: ['mant', 'ot-backlog', undefined],
    queryFn: () => api<BacklogOT[]>('/ot-backlog'),
    staleTime: 30_000,
    select: (rows) => rows.filter(r => !!r.ticket_ot && r.ticket_ot === ticket),
  });
}

type Seccion = 'tareas' | 'tiempos' | 'repuestos' | 'costos';

interface OTDetalleProps {
  ot: OrdenTrabajo;
  onVolver: () => void;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  onAccion: (a: AccionOT) => void;
  onEliminar: () => void;
}

export function OTDetalle({ ot, onVolver, puedeEditar, puedeEliminar, onAccion, onEliminar }: OTDetalleProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const usuario = user?.name ?? '';
  const idOt = otId(ot);
  const acciones = accionesDisponibles(ot.estado);
  const det = otDetalles(ot);
  const enCurso = ot.estado === 'En Proceso' || ot.estado === 'Pausada';

  const [seccion, setSeccion] = useState<Seccion>('tareas');
  const [pausando, setPausando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [inspeccionAbierta, setInspeccionAbierta] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);

  const ahora = useAhora(enCurso);
  const { data: materiales, isLoading: loadMat } = useMateriales(idOt);
  const { data: trabajosTodos, isLoading: loadTra } = useTrabajosOT();
  const { data: backlog = [] } = useBacklogDeOT(ot.ticket_entrada ?? idOt);
  const { data: idsInspeccion = [] } = useInspeccionesDeOT(idOt);
  const { data: inspecciones } = useInspecciones();

  const trabajos = trabajosDeOT(ot, trabajosTodos ?? []);
  const mats = (materiales ?? []).filter(m => m.estado !== 'Anulado');
  const costos = costosOT(ot, trabajosTodos ?? [], materiales ?? []);
  const pausas = pausasDe(ot);
  const pausaActiva = pausas.find(p => !p.fin) ?? null;
  const limitePausas = pausas.length >= 3;
  const tiempos = tiempoNetoOT(ot, ahora);
  const inspeccion: Inspeccion | null = useMemo(
    () => (inspeccionAbierta ? (inspecciones ?? []).find(i => i.id === inspeccionAbierta) ?? null : null),
    [inspeccionAbierta, inspecciones],
  );

  const hechos = trabajos.filter(t => (t.estado ?? '').toLowerCase() === 'realizado').length
    + backlog.filter(b => b.estado === 'Completado').length;
  const totalTareas = trabajos.length + backlog.length;

  /** Marca o desmarca un trabajo del checklist (estado Realizado / Pendiente) */
  async function alternarTrabajo(id: string, realizado: boolean, t: (typeof trabajos)[number]) {
    setMarcando(id);
    try {
      await marcarTrabajo(t, realizado);
      await qc.invalidateQueries({ queryKey: ['mant', 'trabajos-ot'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setMarcando(null);
    }
  }

  /** Marca o desmarca un ítem del backlog enlazado (Completado / Pendiente) */
  async function alternarBacklog(b: BacklogOT, completado: boolean) {
    setMarcando(b.backlog_id);
    try {
      await api(`/ot-backlog/${b.id}`, {
        method: 'PUT',
        body: { placa: b.placa, tarea: b.tarea, tema: b.tema ?? '', km: b.km ?? 0, reportado_por: b.reportado_por ?? '', ticket_ot: b.ticket_ot, estado: completado ? 'Completado' : 'En Progreso' },
      });
      await qc.invalidateQueries({ queryKey: ['mant', 'ot-backlog'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setMarcando(null);
    }
  }

  async function exportar(modo: 'descargar' | 'whatsapp') {
    setExportando(true);
    try {
      const blob = await pdfOt({ ot, trabajos: trabajosTodos ?? [], materiales: materiales ?? [], usuario });
      const nombre = `OT-${idOt}-${ot.placa}.pdf`;
      if (modo === 'descargar') descargarArchivo(blob, nombre);
      else await compartirPDF(blob, nombre, `Orden de trabajo ${idOt} · placa ${ot.placa}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setExportando(false);
    }
  }

  // Acciones principales según el ciclo de vida; el resto va al menú
  const principal = (() => {
    if (!puedeEditar) return null;
    if (acciones.includes('iniciar')) return <Button variant="primary" icon={<Play size={15} />} onClick={() => onAccion('iniciar')}>Iniciar OT</Button>;
    if (acciones.includes('reanudar')) return <Button variant="accent" icon={<Play size={15} />} onClick={() => onAccion('reanudar')}>Reanudar trabajo</Button>;
    return null;
  })();
  // En proceso: pausar o cerrar. Pausada: reanudar (cerrar queda en el menú).
  const botonesEstado = puedeEditar && acciones.includes('pausar') ? (
    <>
      <Button variant="accent" icon={<Timer size={15} />} onClick={() => setPausando(true)} disabled={limitePausas}>Pausar</Button>
      <Button variant="primary" onClick={() => setCerrando(true)}>Cerrar OT</Button>
    </>
  ) : null;

  const opcionesMenu = [
    ...acciones
      .filter(a => !['iniciar', 'reanudar', 'pausar', 'cerrar'].includes(a))
      .map(a => ({ label: ETIQUETA_ACCION[a], destructiva: a === 'anular', separado: a === 'anular', onSelect: () => onAccion(a) })),
    puedeEditar && ot.estado === 'Pausada' && { label: 'Cerrar OT', onSelect: () => setCerrando(true) },
    puedeEliminar && ot.estado === 'Anulado' && { label: 'Eliminar', destructiva: true, separado: true, onSelect: onEliminar },
    { label: 'Abrir en versión actual', icon: <ArrowUpRight size={15} />, onSelect: () => abrirClasico('mantenimiento/reportes-ot') },
  ].filter(Boolean) as Parameters<typeof MenuOtros>[0]['opciones'];

  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Órdenes
        </button>
        <div className="tarjeta__barra-acciones">
          {opcionesMenu.length > 0 && <MenuOtros opciones={opcionesMenu} />}
        </div>
      </div>

      <div className="ot-ficha__hero">
        <LicensePlate plate={ot.placa} size="lg" />
        <span className="ot-ficha__id t-numeric">{idOt}</span>
        <Badge tone={tonoEstado(ot.estado)}>{etiquetaEstado(ot.estado)}</Badge>
        {costos.total > 0 && <span className="ot-ficha__total t-numeric">{soles(costos.total)}</span>}
      </div>

      <div className="ot-acciones">
        {principal}
        {botonesEstado}
        <Button variant="secondary" icon={<Download size={15} />} onClick={() => exportar('descargar')} disabled={exportando || loadMat || loadTra}>
          Descargar PDF OT
        </Button>
        <Button variant="secondary" icon={<Share2 size={15} />} onClick={() => exportar('whatsapp')} disabled={exportando || loadMat || loadTra}>
          Compartir WhatsApp
        </Button>
        {idsInspeccion.map(id => (
          <button key={id} type="button" className="ot-enlace" onClick={() => setInspeccionAbierta(id)}>
            Inspección {id} <ArrowUpRight size={14} />
          </button>
        ))}
      </div>

      {pausaActiva && (
        <div className="ot-pausa-activa" role="status">
          <Timer size={18} />
          <div className="ot-pausa-activa__texto">
            <strong>En pausa · {pausaActiva.motivo}</strong>
            <span>Desde {fechaCorta(pausaActiva.inicio)}{pausaActiva.por ? ` · ${pausaActiva.por}` : ''}</span>
          </div>
          <DuracionPausa pausa={pausaActiva} ahora={ahora} />
        </div>
      )}

      <SegmentedControl<Seccion> label="Secciones de la OT" block value={seccion} onChange={setSeccion} options={[
        { value: 'tareas', label: 'Tareas' },
        { value: 'tiempos', label: 'Tiempos' },
        { value: 'repuestos', label: 'Repuestos' },
        { value: 'costos', label: 'Costos' },
      ]} />

      {seccion === 'tareas' && (
        <>
          <div>
            <p className="tarjeta__grupo-titulo">
              Checklist de trabajo
              {totalTareas > 0 && <span className="ot-progreso t-numeric">{hechos} de {totalTareas}</span>}
            </p>
            {loadTra ? <PageLoader /> : totalTareas === 0 ? (
              <p className="t-footnote c-secondary">Sin trabajos registrados. Los trabajos se cargan desde Historial de trabajos o al importar el backlog.</p>
            ) : (
              <div className="tarjeta__lista">
                {trabajos.map((t, i) => {
                  const realizado = (t.estado ?? '').toLowerCase() === 'realizado';
                  const clave = `t-${t.id_ot}-${i}`;
                  return (
                    <div key={clave} className="ot-linea">
                      <button type="button" role="checkbox" aria-checked={realizado} className={`ot-check-tarea${realizado ? ' ot-check-tarea--ok' : ''}`}
                        disabled={!puedeEditar || marcando === clave} onClick={() => alternarTrabajo(clave, !realizado, t)} aria-label={`Marcar ${t.trabajo_realizado ?? 'trabajo'}`}>
                        {realizado && <span aria-hidden>✓</span>}
                      </button>
                      <div className="ot-linea__cuerpo">
                        <span className={`ot-linea__titulo${realizado ? ' ot-linea__titulo--hecho' : ''}`}>{t.trabajo_realizado || 'Trabajo sin descripción'}</span>
                        <span className="ot-linea__sub">{[t.tecnico, t.fecha_trabajo?.split('T')[0]].filter(Boolean).join(' · ') || '—'}</span>
                      </div>
                      <span className="ot-linea__importe t-numeric">{soles(trabajoCosto(t))}</span>
                    </div>
                  );
                })}
                {backlog.map(b => {
                  const hecho = b.estado === 'Completado';
                  const clave = b.backlog_id;
                  return (
                    <div key={clave} className="ot-linea">
                      <button type="button" role="checkbox" aria-checked={hecho} className={`ot-check-tarea${hecho ? ' ot-check-tarea--ok' : ''}`}
                        disabled={!puedeEditar || marcando === clave} onClick={() => alternarBacklog(b, !hecho)} aria-label={`Marcar ${b.tarea}`}>
                        {hecho && <span aria-hidden>✓</span>}
                      </button>
                      <div className="ot-linea__cuerpo">
                        <span className={`ot-linea__titulo${hecho ? ' ot-linea__titulo--hecho' : ''}`}>{b.tarea}</span>
                        <span className="ot-linea__sub">Backlog {b.backlog_id}{b.tema ? ` · ${b.tema}` : ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <p className="tarjeta__grupo-titulo">Diagnóstico y asignación</p>
            <div className="tarjeta__lista">
              {(det.motivo || ot.observaciones) && <div className="dato"><span className="dato__label">Falla reportada</span><span className="dato__valor" style={{ whiteSpace: 'pre-wrap' }}>{String(det.motivo || ot.observaciones)}</span></div>}
              {ot.tecnico && <div className="dato"><span className="dato__label">Técnico responsable</span><span className="dato__valor">{ot.tecnico}</span></div>}
              {ot.supervisor && <div className="dato"><span className="dato__label">Supervisor</span><span className="dato__valor">{ot.supervisor}</span></div>}
              {(ot.rampa_origen || ot.id_rampa) && <div className="dato"><span className="dato__label">Rampa asignada</span><span className="dato__valor">{ot.rampa_origen ?? ot.id_rampa}</span></div>}
              {ot.situacion && <div className="dato"><span className="dato__label">Situación</span><span className="dato__valor">{ot.situacion}</span></div>}
              {(det.tipo_ot || det.sub_tipo) && <div className="dato"><span className="dato__label">Tipo</span><span className="dato__valor">{[det.tipo_ot, det.sub_tipo].filter(Boolean).join(' / ')}</span></div>}
              {det.km ? <div className="dato"><span className="dato__label">Kilometraje de ingreso</span><span className="dato__valor dato__valor--mono">{String(det.km)}</span></div> : null}
            </div>
          </div>

          {(ot.comentario_cierre || ot.cerrado_por) && (
            <div>
              <p className="tarjeta__grupo-titulo">Cierre</p>
              <div className="tarjeta__lista">
                {ot.comentario_cierre && <div className="dato"><span className="dato__label">Observaciones finales</span><span className="dato__valor" style={{ whiteSpace: 'pre-wrap' }}>{ot.comentario_cierre}</span></div>}
                {ot.cerrado_por && <div className="dato"><span className="dato__label">Cerrado por</span><span className="dato__valor">{ot.cerrado_por}</span></div>}
              </div>
            </div>
          )}
        </>
      )}

      {seccion === 'tiempos' && (
        <>
          <div className="ot-bento">
            <div className="ot-bento__card ot-bento__card--grande">
              <span className="ot-bento__etiqueta">Tiempo neto de trabajo</span>
              <span className="ot-bento__valor t-numeric">{tiempos.iniciado ? formatoDuracion(tiempos.neto) : '—'}</span>
              <span className="ot-bento__pie">{enCurso ? 'Contando en vivo' : ot.fecha_hora_salida ? 'Cerrada' : 'Sin iniciar'}</span>
            </div>
            <div className="ot-bento__card">
              <span className="ot-bento__etiqueta">En pausa</span>
              <span className="ot-bento__valor t-numeric">{formatoDuracion(tiempos.pausado)}</span>
              <span className="ot-bento__pie">{pausas.length} de 3 pausas</span>
            </div>
            <div className="ot-bento__card">
              <span className="ot-bento__etiqueta">Tiempo bruto</span>
              <span className="ot-bento__valor t-numeric">{formatoDuracion(tiempos.bruto)}</span>
              <span className="ot-bento__pie">Desde el inicio</span>
            </div>
          </div>

          {limitePausas && <Notice>Esta OT ya usó sus 3 pausas; no admite más.</Notice>}

          <div>
            <p className="tarjeta__grupo-titulo">Línea de tiempo</p>
            {!tiempos.iniciado ? (
              <p className="t-footnote c-secondary">La OT aún no tiene inicio de trabajo.</p>
            ) : (
              <ol className="ot-timeline">
                <li className="ot-timeline__item ot-timeline__item--inicio">
                  <span className="ot-timeline__punto" aria-hidden />
                  <div className="ot-timeline__cuerpo">
                    <span className="ot-timeline__titulo">Inicio de trabajo</span>
                    <span className="ot-timeline__sub">{fechaCorta(ot.fecha_inicio_ot)}{ot.iniciado_por ? ` · ${ot.iniciado_por}` : ''}</span>
                  </div>
                </li>
                {pausas.map(p => (
                  <li key={p.n} className={`ot-timeline__item${p.fin ? '' : ' ot-timeline__item--activa'}`}>
                    <span className="ot-timeline__punto" aria-hidden />
                    <div className="ot-timeline__cuerpo">
                      <span className="ot-timeline__titulo">Pausa {p.n} · {p.motivo}</span>
                      <span className="ot-timeline__sub">
                        {fechaCorta(p.inicio)} → {p.fin ? fechaCorta(p.fin) : 'en curso'}{p.por ? ` · ${p.por}` : ''}
                      </span>
                    </div>
                    <DuracionPausa pausa={p} ahora={ahora} />
                  </li>
                ))}
                {ot.fecha_hora_salida ? (
                  <li className="ot-timeline__item ot-timeline__item--fin">
                    <span className="ot-timeline__punto" aria-hidden />
                    <div className="ot-timeline__cuerpo">
                      <span className="ot-timeline__titulo">Salida de la unidad</span>
                      <span className="ot-timeline__sub">{fechaCorta(ot.fecha_hora_salida)}{ot.cerrado_por ? ` · ${ot.cerrado_por}` : ''}</span>
                    </div>
                  </li>
                ) : (
                  <li className="ot-timeline__item ot-timeline__item--activa">
                    <span className="ot-timeline__punto" aria-hidden />
                    <div className="ot-timeline__cuerpo">
                      <span className="ot-timeline__titulo">{ot.estado === 'Pausada' ? 'Trabajo pausado' : 'Trabajo en curso'}</span>
                      <span className="ot-timeline__sub">Sin cierre todavía</span>
                    </div>
                  </li>
                )}
              </ol>
            )}
          </div>
        </>
      )}

      {seccion === 'repuestos' && (
        <div>
          <p className="tarjeta__grupo-titulo" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Package size={14} /> Repuestos despachados desde almacén
            {costos.repuestos > 0 && <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--accent)' }}>{soles(costos.repuestos)}</span>}
          </p>
          <Button variant="accent" block icon={<Package size={15} />} onClick={() => abrirClasico('almacen/salidas')} disabled={!puedeEditar}>
            Solicitar repuesto a almacén
          </Button>
          {loadMat ? <PageLoader /> : mats.length === 0 ? (
            <p className="t-footnote c-secondary">Sin repuestos despachados a esta OT. Las salidas de almacén aparecen aquí valorizadas.</p>
          ) : (
            <div className="tarjeta__lista" style={{ overflowX: 'auto' }}>
              {mats.map(sal => (
                <div key={sal.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--separator)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent)' }}>{sal.id}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--label-2)' }}>{sal.fecha} · {sal.estado}</span>
                    <span className="t-numeric" style={{ fontWeight: 700, fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>{soles(Number(sal.total_pen))}</span>
                  </div>
                  {sal.items.length > 0 && (
                    <table className="ot-tabla-mat">
                      <thead>
                        <tr>
                          <th>Repuesto / insumo</th>
                          <th className="num">Cant.</th>
                          <th className="num">C. unit.</th>
                          <th className="num">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sal.items.map((it, idx) => (
                          <tr key={idx}>
                            <td>{it.descripcion || '—'}</td>
                            <td className="num">{it.cantidad}</td>
                            <td className="num c-secondary">{soles(Number(it.costo_unitario))}</td>
                            <td className="num strong">{soles(Number(it.importe))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {seccion === 'costos' && (
        <div className="ot-bento">
          <div className="ot-bento__card">
            <span className="ot-bento__etiqueta">Repuestos</span>
            <span className="ot-bento__valor t-numeric">{soles(costos.repuestos)}</span>
            <span className="ot-bento__pie">{mats.length} salida{mats.length === 1 ? '' : 's'} de almacén</span>
          </div>
          <div className="ot-bento__card">
            <span className="ot-bento__etiqueta">Mano de obra</span>
            <span className="ot-bento__valor t-numeric">{soles(costos.manoObra)}</span>
            <span className="ot-bento__pie">{trabajos.length} trabajo{trabajos.length === 1 ? '' : 's'}</span>
          </div>
          <div className="ot-bento__card ot-bento__card--total">
            <span className="ot-bento__etiqueta">Costo total de la OT</span>
            <span className="ot-bento__valor ot-bento__valor--total t-numeric">{soles(costos.total)}</span>
            <span className="ot-bento__pie">
              Repuestos {soles(costos.repuestos)} + Mano de obra {soles(costos.manoObra)}
              {costos.otros > 0 ? ` + Otros ${soles(costos.otros)}` : ''}
            </span>
          </div>
        </div>
      )}

      {exportando && <span className="t-footnote c-secondary">Preparando el PDF…</span>}

      <PausarOTSheet ot={ot} open={pausando} onClose={() => setPausando(false)} usuario={usuario} />
      <CerrarOTSheet ot={ot} open={cerrando} onClose={() => setCerrando(false)} usuario={usuario} />
      {inspeccion && <InspeccionFicha inspeccion={inspeccion} onClose={() => setInspeccionAbierta(null)} />}
    </div>
  );
}
