import { formatFechaHoraPe, formatSoles } from '../../core/lib/format';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Download, Package, Play, Plus, Share2, Timer } from 'lucide-react';
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
  aObjeto, trabajoId, accionesDisponibles, costosOT, duracionPausa, etiquetaEstado, formatoDuracion, otDetalles, otId,
  pausasDe, tiempoNetoOT, trabajoCosto, trabajosDeOT, useInspeccionesDeOT, useMateriales, useTrabajosOT,
  type AccionOT, type OrdenTrabajo, type PausaOT, type TrabajoOT,
} from './api';
import { CerrarOTSheet, PausarOTSheet } from './OTAcciones';
import { TrabajoOTSheet } from './TrabajoOTSheet';
import { OTServiciosTerceros } from './OTServiciosTerceros';
import { SalidaFormulario } from '../almacen/SalidaFormulario';
import { pdfOt, pdfPlantillaOt } from './otPdf';
import { rotGetCleanMotivoDisplay } from './otPdfClasico';

export const ETIQUETA_ACCION: Record<AccionOT, string> = {
  iniciar:   'Iniciar OT',
  pausar:    'Pausar',
  reanudar:  'Reanudar',
  cerrar:    'Cerrar',
  anular:    'Anular',
  reactivar: 'Reactivar',
};

const soles = (n: number) => formatSoles(n);
const fechaCorta = (s: string | null | undefined) => {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '—' : formatFechaHoraPe(d);
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
    case 'Cerrada':    return 'gray';
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

type Seccion = 'tareas' | 'tiempos' | 'repuestos' | 'terceros' | 'costos';

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
  const [solicitando, setSolicitando] = useState(false);
  // Formulario de trabajo: abierto para agregar (trabajoSel null) o para editar uno existente
  const [trabajoAbierto, setTrabajoAbierto] = useState(false);
  const [trabajoSel, setTrabajoSel] = useState<TrabajoOT | null>(null);
  // Igual que el clásico (esAprobada): se pueden agregar trabajos desde Aprobada hasta Cerrada, también ya finalizada
  const puedeAgregarTrabajo = puedeEditar && ['Aprobada', 'En Proceso', 'Pausada', 'Finalizado', 'Cerrada'].includes(ot.estado);

  const ahora = useAhora(enCurso);
  const { data: materiales, isLoading: loadMat } = useMateriales(idOt);
  const { data: trabajosTodos, isLoading: loadTra } = useTrabajosOT();
  const { data: backlog = [] } = useBacklogDeOT(ot.ticket_entrada ?? idOt);
  const { data: idsInspeccion = [] } = useInspeccionesDeOT(idOt);
  const { data: inspecciones } = useInspecciones();

  const trabajos = trabajosDeOT(ot, trabajosTodos ?? []);
  const totalTrabajos = trabajos.reduce((sum, t) => sum + trabajoCosto(t), 0);
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

  async function descargarPlantilla() {
    setExportando(true);
    try {
      const blob = await pdfPlantillaOt(ot);
      descargarArchivo(blob, `Plantilla_OT_${idOt}.pdf`);
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
    if (acciones.includes('reanudar')) return <Button variant="primary" icon={<Play size={15} />} onClick={() => onAccion('reanudar')}>Reanudar trabajo</Button>;
    return null;
  })();
  // En proceso: pausar o cerrar. Pausada: reanudar (cerrar queda en el menú).
  const botonesEstado = puedeEditar && acciones.includes('pausar') ? (
    <>
      <Button variant="primary" icon={<Timer size={15} />} onClick={() => setPausando(true)} disabled={limitePausas}>Pausar</Button>
      <Button variant="primary" onClick={() => setCerrando(true)}>Cerrar OT</Button>
    </>
  ) : null;

  const opcionesMenu = [
    ...acciones
      .filter(a => !['iniciar', 'reanudar', 'pausar', 'cerrar'].includes(a))
      .map(a => ({ label: ETIQUETA_ACCION[a], destructiva: a === 'anular', separado: a === 'anular', onSelect: () => onAccion(a) })),
    puedeEditar && ot.estado === 'Pausada' && { label: 'Cerrar OT', onSelect: () => setCerrando(true) },
    puedeEliminar && ot.estado === 'Anulado' && { label: 'Eliminar', destructiva: true, separado: true, onSelect: onEliminar },
    { label: 'Descargar plantilla', onSelect: descargarPlantilla },
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
        { value: 'terceros', label: 'Terceros' },
        { value: 'costos', label: 'Costos' },
      ]} />

      {seccion === 'tareas' && (
        <>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 'var(--s-2)' }}>
              <p className="tarjeta__grupo-titulo" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                Trabajos realizados <Badge>{trabajos.length}</Badge>
              </p>
              {puedeAgregarTrabajo && (
                <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => { setTrabajoSel(null); setTrabajoAbierto(true); }}>
                  Agregar trabajo
                </Button>
              )}
            </div>
            {loadTra ? <PageLoader /> : trabajos.length === 0 ? (
              <p className="t-footnote c-secondary">No hay trabajos registrados</p>
            ) : (
              <div className="tarjeta__lista">
                {trabajos.map(t => {
                  const costo = trabajoCosto(t);
                  const personal = String(aObjeto(t.detalles_json).personal ?? t.tecnico ?? '');
                  const fechas = [t.fecha_trabajo, t.fecha_salida]
                    .filter(Boolean)
                    .map(f => formatFechaHoraPe(String(f).replace('Z', '').replace(' ', 'T').slice(0, 16)));
                  return (
                    <button key={trabajoId(t)} type="button" disabled={!puedeEditar}
                      onClick={() => { setTrabajoSel(t); setTrabajoAbierto(true); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: puedeEditar ? 'pointer' : 'default' }}>
                      <div className="dato" style={{ alignItems: 'flex-start' }}>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="t-footnote c-secondary">{t.ticket_visita}</span>
                          </span>
                          <span>{t.trabajo_realizado || '—'}</span>
                          {personal && <span className="t-footnote c-secondary">{personal}</span>}
                          {fechas.length > 0 && <span className="t-footnote c-secondary">{fechas.join(' → ')}</span>}
                          {puedeEditar && <span className="t-footnote c-secondary" style={{ opacity: 0.7 }}>Toca para editar</span>}
                        </span>
                        {costo > 0 && <span className="t-numeric" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{soles(costo)}</span>}
                      </div>
                    </button>
                  );
                })}
                {totalTrabajos > 0 && (
                  <div className="dato"><span className="dato__label">Total</span><span className="dato__valor t-numeric">{soles(totalTrabajos)}</span></div>
                )}
              </div>
            )}
          </div>

          {backlog.length > 0 && (
            <div>
              <p className="tarjeta__grupo-titulo">Mantenimientos pendientes (Backlog) <Badge>{backlog.length}</Badge></p>
              <div className="tarjeta__lista">
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
            </div>
          )}

          <div>
            <p className="tarjeta__grupo-titulo">Diagnóstico y asignación</p>
            <div className="tarjeta__lista">
              {(det.motivo || ot.observaciones) && <div className="dato"><span className="dato__label">Falla reportada</span><span className="dato__valor" style={{ whiteSpace: 'pre-wrap' }}>{String(rotGetCleanMotivoDisplay(det, ot)).replace(/^•s*/gm, '').replace(/^(Falla Manual|MANUAL)s*:s*/i, '')}</span></div>}
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
            {costos.repuestos > 0 && <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--label)' }}>{soles(costos.repuestos)}</span>}
          </p>
          <Button variant="primary" block icon={<Package size={15} />} onClick={() => setSolicitando(true)} disabled={!puedeEditar}>
            Solicitar repuesto a almacén
          </Button>
          {loadMat ? <PageLoader /> : mats.length === 0 ? (
            <p className="t-footnote c-secondary">Sin repuestos despachados a esta OT. Las salidas de almacén aparecen aquí valorizadas.</p>
          ) : (
            <div className="tarjeta__lista" style={{ overflowX: 'auto' }}>
              {mats.map(sal => (
                <div key={sal.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--separator)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--label)' }}>{sal.id}</span>
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

      {seccion === 'terceros' && <OTServiciosTerceros ot={ot.ticket_entrada || ot.id_ot} puedeEditar={puedeEditar} />}

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
      <TrabajoOTSheet ot={ot} trabajo={trabajoSel} open={trabajoAbierto} onClose={() => setTrabajoAbierto(false)} usuario={usuario} />
      <SalidaFormulario
        open={solicitando}
        salida={null}
        onClose={() => setSolicitando(false)}
        onGuardado={() => {
          // El repuesto ya descontó stock: se refrescan los materiales de la OT, su costo y el almacén
          setSolicitando(false);
          qc.invalidateQueries({ queryKey: ['mant', 'ot-materiales', idOt] });
          qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
          qc.invalidateQueries({ queryKey: ['almacen'] });
        }}
        preset={{ placa: ot.placa, ticket_ot: idOt, responsable: ot.tecnico ?? '', tipo_destino: 'Vehiculo' }}
      />
      {inspeccion && <InspeccionFicha inspeccion={inspeccion} onClose={() => setInspeccionAbierta(null)} />}
    </div>
  );
}
