import { formatFechaHoraPe, formatSoles } from '../../core/lib/format';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Ban, CalendarDays, ChevronRight, ClipboardCheck, Disc, FileText, Gauge, Package, Play, Plus, Receipt, RotateCcw, Timer, Trash2, Wrench } from 'lucide-react';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { AccionesExpandibles, type AccionExpandible } from '../../core/ui/AccionesExpandibles';
import { IconoPdf, IconoWhatsapp, Pencil } from '../../core/ui/IconosArchivo';
import { pestanaConCamion } from '../../core/ui/CargaCamion';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { compartirPDF } from '../../core/lib/pdf';
import { InspeccionFicha } from '../inspecciones/InspeccionFicha';
import { useInspecciones, type Inspeccion } from '../inspecciones/api';
import {
  aObjeto, trabajoId, accionesDisponibles, costosOT, duracionPausa, etiquetaEstado, formatoDuracion, otDetalles, otId,
  pausasDe, tiempoNetoOT, trabajoCosto, trabajosDeOT, useInspeccionesDeOT, useMateriales, useTrabajosOT,
  type AccionOT, type MaterialSalida, type OrdenTrabajo, type PausaOT, type TrabajoOT,
} from './api';
import { CerrarOTSheet, PausarOTSheet } from './OTAcciones';
import '../../core/ui/botonesIcono.css';
import './ot-detalle.css';
import { TrabajoOTSheet } from './TrabajoOTSheet';
import { OTServiciosTerceros } from './OTServiciosTerceros';
import { OTNeumaticos } from './OTNeumaticos';
import { EditarFechasSheet, EditarKmSheet, EditarOTSheet, EditarSolicitudSheet } from './OTEditar';
import { SalidaFormulario } from '../almacen/SalidaFormulario';
import { pdfOt, pdfPlantillaInspeccion, pdfPlantillaLlantas, pdfPlantillaOt } from './otPdf';
import { usePlacas } from '../placas/api';
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

/** Color del encabezado según el estado de la OT */
function tonoEstado(estado: string): 'gris' | 'verde' | 'ambar' | 'azul' | 'rojo' {
  switch (estado) {
    case 'En Proceso': return 'verde';
    case 'Pausada':    return 'ambar';
    case 'Finalizado': return 'azul';
    case 'Cerrada':    return 'gris';
    case 'Anulado':    return 'rojo';
    default:           return 'azul';
  }
}

/** Etapas que muestra la barra de avance del encabezado */
const PASOS = ['Ingreso', 'En trabajo', 'Cerrada'];
function pasoDe(estado: string): number {
  if (estado === 'Cerrada' || estado === 'Finalizado') return 2;
  if (estado === 'En Proceso' || estado === 'Pausada') return 1;
  return 0;
}

/** Iniciales del primer técnico de un trabajo (avatar de la fila) */
function iniciales(personal: string): string {
  const primero = personal.split(',')[0]?.trim() ?? '';
  const partes = primero.split(/\s+/).filter(Boolean);
  if (!partes.length) return '·';
  return ((partes[0][0] ?? '') + (partes.length > 2 ? partes[2][0] : partes[1]?.[0] ?? '')).toUpperCase();
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

type Seccion = 'tareas' | 'tiempos' | 'repuestos' | 'terceros' | 'neumaticos' | 'costos';

interface OTDetalleProps {
  ot: OrdenTrabajo;
  onVolver: () => void;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  onAccion: (a: AccionOT) => void;
  onEliminar: () => void;
}

/** Fecha de una salida en dd/mm/yyyy, sin pasar por la zona horaria (la base guarda medianoche UTC) */
function diaPe(s: string | null | undefined): string {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** Código INV-xxxx y nombre del repuesto, quitando el código repetido del texto */
function partesItem(d: string | null | undefined): { codigo: string; nombre: string } {
  const t = String(d ?? '').trim();
  const m = t.match(/^((?:INV-\d+\s*—\s*)+)(.*)$/);
  if (!m) return { codigo: '', nombre: t || '—' };
  const cod = m[1].match(/INV-\d+/);
  return { codigo: cod ? cod[0] : '', nombre: m[2].trim() || t };
}

/** Palabras que marcan un ítem de vale como servicio tercerizado (lista del clásico) */
const PALABRAS_SERVICIO = ['SERVICIO', 'TORNO', 'SOLDADURA', 'RECTIFICAC', 'MANTENIMIENTO EXTERNO', 'REPARACION DE TANQUE', 'REPARACIÓN DE TANQUE', 'ALINEAMIENTO', 'BALANCEO', 'VULCANIZADO', 'LABORATORIO DIESEL'];

/** Pastilla de estado de una salida: Despachado en verde, Pendiente en ámbar, lo demás en gris */
function pastillaEstado(e: string | null | undefined): React.CSSProperties {
  const l = String(e ?? '').toLowerCase();
  const [fondo, color] = l.includes('pend') ? ['#fef3c7', '#b45309'] : l.includes('anul') ? ['#e5e7eb', '#374151'] : ['#dcfce7', '#15803d'];
  return { fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: fondo, color, whiteSpace: 'nowrap' };
}

export function OTDetalle({ ot, onVolver, puedeEditar, puedeEliminar, onAccion, onEliminar }: OTDetalleProps) {
  const qc = useQueryClient();
  // La OT guarda el DNI de quien la inició o cerró, y el número de rampa: aquí se muestran nombre y nombre de rampa
  const { data: conductoresLista } = useQuery({
    queryKey: ['mant', 'conductores-nombres'],
    queryFn: () => api<unknown>('/conductores').then(r => (Array.isArray(r) ? r : ((r as { data?: unknown[] })?.data ?? [])) as Record<string, unknown>[]),
    staleTime: 10 * 60_000,
  });
  const { data: catalogoTaller } = useQuery({
    queryKey: ['mant', 'catalogo-taller'],
    queryFn: () => api<{ rampas?: Record<string, unknown>[] }>('/catalogos_taller').catch(() => ({ rampas: [] })),
    staleTime: 10 * 60_000,
  });
  const nombrePersona = (v: string | null | undefined) => {
    const t = (v ?? '').trim();
    if (!/^\d{6,}$/.test(t)) return t;
    const c = (conductoresLista ?? []).find(x => String(x.dni ?? '').trim() === t);
    return c ? String(c.nombre ?? t) : t;
  };
  // La OT guarda el id de una fila de taller_rampas; esa fila tiene el número de rampa, y el catálogo le da el nombre
  const { data: rampasLista } = useQuery({
    queryKey: ['mant', 'rampas-nombres'],
    queryFn: async () => {
      const [activas, historial] = await Promise.all([
        api<unknown>('/taller-rampas').catch(() => []),
        api<unknown>('/taller-rampas?historial=1').catch(() => []),
      ]);
      return [...(Array.isArray(activas) ? activas : []), ...(Array.isArray(historial) ? historial : [])] as Record<string, unknown>[];
    },
    staleTime: 10 * 60_000,
  });
  const nombreRampa = (id: string | number | null | undefined) => {
    if (id == null || id === '') return '';
    const fila = (rampasLista ?? []).find(x => String(x.id) === String(id));
    const numero = fila ? String(fila.rampa) : String(id);
    const c = (catalogoTaller?.rampas ?? []).find(x => String(x.id) === numero);
    return c ? String(c.nombre_rampa ?? c.nombre ?? numero) : numero;
  };
  // Marca (tabla de placas), rampa (catálogo) y kilometraje: el PDF los muestra junto a los datos de la OT
  const { data: placasLista } = usePlacas();
  const extrasPdf = () => {
    const d = aObjeto(ot.detalles_json);
    return {
      marca: (placasLista ?? []).find(p => p.placa === ot.placa)?.marca || undefined,
      rampa: nombreRampa(ot.id_rampa) || undefined,
      kmTablero: (d.km ?? d.kilometraje ?? d.km_tablero) as string | number | undefined,
      kmGps: d.km_gps as string | number | undefined,
    };
  };
  const toast = useToast();
  const { user, can } = useAuth();
  // Mismo criterio que el servidor (rbac.js): pedir repuestos exige crear en estos módulos
  const puedeSolicitarRepuesto = puedeEditar || ['ot', 'trabajos_ot', 'status_rampa', 'sal_inv', 'inv'].some(m => can(`${m}.crear`));
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
  // Edición de la OT (encabezado, fechas, kilometraje) y de solicitudes de material (clásico: rot-drawer-editar-ot, fechas, km)
  const [editandoOT, setEditandoOT] = useState(false);
  const [editandoFechas, setEditandoFechas] = useState(false);
  const [editandoKm, setEditandoKm] = useState(false);
  const [solicitudEdit, setSolicitudEdit] = useState<MaterialSalida | null>(null);
  const [solicitudBorrar, setSolicitudBorrar] = useState<MaterialSalida | null>(null);
  const [borrando, setBorrando] = useState(false);
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
  // Servicios que llegaron como ítems de vale (clásico: rotEsItemServicio): salen de Repuestos y van a Terceros
  const esServicioItem = (d: string) => {
    const u = d.toUpperCase();
    return u.includes('SERV-') || u.includes('SRV-') || PALABRAS_SERVICIO.some(p => u.includes(p));
  };
  const partesSalida = (s: MaterialSalida) => s.items.filter(it => !esServicioItem(it.descripcion));
  const serviciosSalida = (s: MaterialSalida) => s.items.filter(it => esServicioItem(it.descripcion));
  const repuestosVista = mats
    .filter(s => partesSalida(s).length > 0 || serviciosSalida(s).length === 0)
    .map(s => {
      const partes = partesSalida(s);
      return partes.length && partes.length !== s.items.length
        ? { ...s, items: partes, total_pen: partes.reduce((n, it) => n + (Number(it.importe) || 0), 0) }
        : s;
    });
  const valesServicio = mats
    .filter(s => serviciosSalida(s).length > 0)
    .map(s => {
      const items = serviciosSalida(s);
      return { id: s.id, fecha: s.fecha, items, total: items.reduce((n, it) => n + (Number(it.importe) || 0), 0) };
    });
  const costos = costosOT(ot, trabajosTodos ?? [], materiales ?? []);
  const pausas = pausasDe(ot);
  const pausaActiva = pausas.find(p => !p.fin) ?? null;
  const limitePausas = pausas.length >= 3;
  const tiempos = tiempoNetoOT(ot, ahora);
  const inspeccion: Inspeccion | null = useMemo(
    () => (inspeccionAbierta ? (inspecciones ?? []).find(i => i.id === inspeccionAbierta) ?? null : null),
    [inspeccionAbierta, inspecciones],
  );


  /** Elimina una solicitud de material (rotEliminarMaterial del clásico: DELETE /ot-materiales/:id) */
  async function eliminarSolicitud() {
    if (!solicitudBorrar) return;
    setBorrando(true);
    try {
      await api(`/ot-materiales/${encodeURIComponent(solicitudBorrar.id)}`, { method: 'DELETE' });
      toast('Solicitud eliminada');
      setSolicitudBorrar(null);
      await qc.invalidateQueries({ queryKey: ['mant', 'ot-materiales', idOt] });
      await qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBorrando(false);
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

  /** PDF en otra pestaña (visor de PDF): la pestaña se abre al tocar el botón y muestra el camión mientras se genera, como en el acta de entrega */
  async function abrirPdf(generar: () => Promise<Blob>, nombre: string) {
    const win = window.open('', '_blank');
    pestanaConCamion(win);
    try {
      const url = URL.createObjectURL(await generar());
      if (win) win.location.href = url;
      else { const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch (err) {
      win?.close();
      throw err;
    }
  }

  async function exportar(modo: 'descargar' | 'whatsapp') {
    setExportando(true);
    try {
      if (modo === 'descargar') {
        await abrirPdf(() => pdfOt({ ot, trabajos, materiales: materiales ?? [], usuario, extras: extrasPdf() }), `Orden de trabajo ${idOt} ${ot.placa}.pdf`);
        return;
      }
      const blob = await pdfOt({ ot, trabajos, materiales: materiales ?? [], usuario, extras: extrasPdf() });
      await compartirPDF(blob, `Orden de trabajo ${idOt} ${ot.placa}.pdf`, `Orden de trabajo ${idOt} · placa ${ot.placa}`);
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
      <Button variant="secondary" icon={<Timer size={15} />} onClick={() => setPausando(true)} disabled={limitePausas}>Pausar</Button>
      <Button variant="primary" onClick={() => setCerrando(true)}>Cerrar OT</Button>
    </>
  ) : null;

  // Diagnóstico y asignación: en pantallas anchas van en la columna lateral; en el celular, dentro de Tareas
  const motivo = det.motivo || ot.observaciones
    ? String(rotGetCleanMotivoDisplay(det, ot)).replace(/^•\s*/gm, '').replace(/^(Falla Manual|MANUAL)\s*:\s*/i, '')
    : '';
  const datosFicha = ([
    ['Técnico responsable', ot.tecnico],
    ['Supervisor', ot.supervisor],
    ['Rampa', ot.rampa_origen || ot.id_rampa ? nombreRampa(ot.id_rampa) || ot.rampa_origen : ''],
    ['Situación', ot.situacion],
    ['Tipo', [det.tipo_ot, det.sub_tipo].filter(Boolean).join(' / ')],
    ['Km de ingreso', det.km ? String(det.km) : ''],
  ] as Array<[string, unknown]>)
    .map(([k, v]) => [k, String(v ?? '').trim()] as [string, string])
    .filter(([, v]) => !!v);
  const hayCierre = !!(ot.comentario_cierre || ot.cerrado_por);

  const ficha = (clase: string) => (
    <div className={`otd-ficha ${clase}`}>
      {motivo && (
        <section className="otd-grupo">
          <h3 className="otd-grupo__titulo">Falla reportada</h3>
          <p className="otd-falla">{motivo}</p>
        </section>
      )}
      {datosFicha.length > 0 && (
        <section className="otd-grupo">
          <h3 className="otd-grupo__titulo">Asignación</h3>
          <dl className="otd-datos">
            {datosFicha.map(([k, v]) => (
              <div key={k} className="otd-datos__fila">
                <dt>{k}</dt>
                <dd className={k === 'Km de ingreso' ? 't-numeric' : undefined}>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {idsInspeccion.length > 0 && (
        <section className="otd-grupo">
          <h3 className="otd-grupo__titulo">Inspecciones</h3>
          <div className="otd-enlaces">
            {idsInspeccion.map(id => (
              <button key={id} type="button" className="ot-enlace" onClick={() => setInspeccionAbierta(id)}>
                Inspección {id} <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        </section>
      )}
      {hayCierre && (
        <section className="otd-grupo">
          <h3 className="otd-grupo__titulo">Cierre</h3>
          <dl className="otd-datos">
            {ot.comentario_cierre && <div className="otd-datos__fila otd-datos__fila--bloque"><dt>Observaciones finales</dt><dd>{ot.comentario_cierre}</dd></div>}
            {ot.cerrado_por && <div className="otd-datos__fila"><dt>Cerrado por</dt><dd>{nombrePersona(ot.cerrado_por)}</dd></div>}
          </dl>
        </section>
      )}
    </div>
  );

  // Resumen: cada casilla abre su sección
  const tabsRef = useRef<HTMLDivElement>(null);
  const irA = (s: Seccion) => {
    setSeccion(s);
    tabsRef.current?.scrollIntoView({ block: 'nearest' });
  };
  const kpis: Array<{ s: Seccion; etiqueta: string; valor: string; pie: string; icon: React.ReactNode; total?: boolean }> = [
    { s: 'tareas', etiqueta: 'Trabajos', valor: String(trabajos.length), pie: totalTrabajos > 0 ? soles(totalTrabajos) : 'Mano de obra', icon: <Wrench size={16} /> },
    { s: 'repuestos', etiqueta: 'Repuestos', valor: soles(costos.repuestos), pie: `${mats.length} salida${mats.length === 1 ? '' : 's'}`, icon: <Package size={16} /> },
    { s: 'tiempos', etiqueta: 'Pausas', valor: `${pausas.length} de 3`, pie: tiempos.pausado > 0 ? formatoDuracion(tiempos.pausado) : 'Sin pausas', icon: <Timer size={16} /> },
    { s: 'costos', etiqueta: 'Costo total', valor: soles(costos.total), pie: 'Ver desglose', icon: <Receipt size={16} />, total: true },
  ];

  // Acciones: iconos de color (el nombre se abre al costado al pasar el mouse), con las destructivas al final y separadas
  const sinDatos = exportando || loadMat || loadTra;
  const pdfSeguro = (generar: () => Promise<Blob>, nombre: string) =>
    abrirPdf(generar, nombre).catch(err => toast(errorMessage(err), 'error'));
  const accionesOT: Array<AccionExpandible | false> = [
    puedeEditar && { label: 'Editar OT', icon: <Pencil />, tono: 'azul', onSelect: () => setEditandoOT(true) },
    puedeEditar && { label: 'Fechas', icon: <CalendarDays />, tono: 'violeta', onSelect: () => setEditandoFechas(true) },
    puedeEditar && { label: 'Kilometraje', icon: <Gauge />, tono: 'ambar', onSelect: () => setEditandoKm(true) },
    { label: 'Descargar PDF', detalle: 'PDF de la orden', icon: <IconoPdf />, tono: 'original', onSelect: () => exportar('descargar'), disabled: sinDatos, separado: true },
    { label: 'Compartir por WhatsApp', detalle: 'PDF de la orden', icon: <IconoWhatsapp />, tono: 'original', onSelect: () => exportar('whatsapp'), disabled: sinDatos },
    { label: 'Plantilla de inspecciones', detalle: 'F-MAN-001', icon: <ClipboardCheck />, tono: 'verde', separado: true,
      onSelect: () => pdfSeguro(() => pdfPlantillaInspeccion(idOt, ot.placa, ot.fecha_inicio_ot || ot.fecha_ingreso || ot.creado_en || null, extrasPdf().kmTablero, extrasPdf().rampa), `Plantilla inspecciones ${idOt}.pdf`) },
    { label: 'Plantilla OT', detalle: 'Impresión rápida', icon: <FileText />, tono: 'azul',
      onSelect: () => pdfSeguro(() => pdfPlantillaOt(ot, extrasPdf()), `Plantilla orden de trabajo ${idOt}.pdf`) },
    { label: 'Plantilla de llantas', detalle: 'Formato A4 blanco', icon: <Disc />, tono: 'violeta',
      onSelect: () => pdfSeguro(() => pdfPlantillaLlantas(ot, extrasPdf()), `Plantilla de llantas ${idOt}.pdf`) },
    puedeEditar && acciones.includes('reactivar') && { label: 'Reactivar OT', icon: <RotateCcw />, tono: 'verde', onSelect: () => onAccion('reactivar'), separado: true },
    puedeEditar && acciones.includes('anular') && { label: 'Anular OT', icon: <Ban />, tono: 'ambar', onSelect: () => onAccion('anular'), separado: true },
    puedeEliminar && { label: 'Eliminar OT', icon: <Trash2 />, tono: 'rojo', onSelect: onEliminar, separado: !(puedeEditar && (acciones.includes('anular') || acciones.includes('reactivar'))) },
  ];

  const tono = tonoEstado(ot.estado);
  const paso = pasoDe(ot.estado);
  const cerrarPausada = puedeEditar && ot.estado === 'Pausada'
    ? <Button variant="secondary" onClick={() => setCerrando(true)}>Cerrar OT</Button>
    : null;
  const pieReloj = ot.estado === 'Pausada' ? 'Reloj detenido por pausa'
    : ot.estado === 'En Proceso' ? 'Contando en vivo'
    : ot.fecha_hora_salida ? `Salida ${fechaCorta(ot.fecha_hora_salida)}`
    : 'Aún sin iniciar';

  return (
    <div className="otd">
      <div className="tarjeta__barra tarjeta__barra--plana otd__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Órdenes
        </button>
        <div className="otd__barra-acciones">
          <AccionesExpandibles acciones={accionesOT} etiqueta="Acciones de la orden de trabajo" />
        </div>
      </div>

      <div className="otd__layout">
        <aside className="otd__lateral">
          <section className={`otd-hero otd-hero--${tono}`} aria-label="Resumen de la orden">
            <div className="otd-hero__cabecera">
              <LicensePlate plate={ot.placa} size="lg" />
              <div className="otd-hero__ident">
                <span className="otd-hero__id t-numeric">{idOt}</span>
                <span className="otd-estado"><span className="otd-estado__punto" aria-hidden />{etiquetaEstado(ot.estado)}</span>
              </div>
            </div>

            <div className="otd-hero__reloj">
              <span className="otd-hero__etiqueta">Tiempo neto de trabajo</span>
              <span className="otd-hero__tiempo t-numeric">{tiempos.iniciado ? formatoDuracion(tiempos.neto) : '—'}</span>
              <span className="otd-hero__pie">{pieReloj}</span>
            </div>

            {ot.estado !== 'Anulado' && (
              <ol className="otd-pasos" aria-label="Avance de la orden">
                {PASOS.map((p, i) => (
                  <li key={p} className={`otd-pasos__paso${i < paso ? ' is-hecho' : ''}${i === paso ? ' is-actual' : ''}`} aria-current={i === paso ? 'step' : undefined}>
                    <span className="otd-pasos__barra" aria-hidden />
                    <span className="otd-pasos__nombre">{i === 1 && ot.estado === 'Pausada' ? 'En pausa' : p}</span>
                  </li>
                ))}
              </ol>
            )}

            {pausaActiva && (
              <div className="otd-pausa" role="status">
                <Timer size={18} />
                <div className="otd-pausa__texto">
                  <strong>{pausaActiva.motivo}</strong>
                  <span>Desde {fechaCorta(pausaActiva.inicio)}{pausaActiva.por ? ` · ${pausaActiva.por}` : ''}</span>
                </div>
                <DuracionPausa pausa={pausaActiva} ahora={ahora} />
              </div>
            )}

            {(principal || botonesEstado || cerrarPausada) && (
              <div className="otd-hero__acciones">
                {principal}
                {botonesEstado}
                {cerrarPausada}
              </div>
            )}
          </section>

          <div className="otd-kpis">
            {kpis.map(k => (
              <button key={k.s} type="button" className={`otd-kpi${k.total ? ' otd-kpi--total' : ''}`} aria-pressed={seccion === k.s} onClick={() => irA(k.s)}>
                <span className="otd-kpi__icono" aria-hidden>{k.icon}</span>
                <span className="otd-kpi__etiqueta">{k.etiqueta}</span>
                <span className="otd-kpi__valor t-numeric">{k.valor}</span>
                <span className="otd-kpi__pie">{k.pie}</span>
              </button>
            ))}
          </div>

          {ficha('otd-ficha--lateral')}
        </aside>

        <div className="otd__principal">
          <div className="otd-tabs" ref={tabsRef}>
            <SegmentedControl<Seccion> label="Secciones de la OT" block value={seccion} onChange={setSeccion} options={[
              { value: 'tareas', label: 'Tareas' },
              { value: 'tiempos', label: 'Tiempos' },
              { value: 'repuestos', label: 'Repuestos' },
              { value: 'terceros', label: 'Servicios' },
              { value: 'neumaticos', label: 'Neumáticos' },
              { value: 'costos', label: 'Costos' },
            ]} />
          </div>

      {seccion === 'tareas' && (
        <>
          <section className="otd-seccion">
            <header className="otd-seccion__cabecera">
              <h3 className="otd-seccion__titulo">Trabajos realizados <span className="otd-cuenta">{trabajos.length}</span></h3>
              {puedeAgregarTrabajo && (
                <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => { setTrabajoSel(null); setTrabajoAbierto(true); }}>
                  Agregar
                </Button>
              )}
            </header>
            {loadTra ? <PageLoader /> : trabajos.length === 0 ? (
              <p className="otd-vacio">No hay trabajos registrados{puedeAgregarTrabajo ? '. Toca «Agregar» para registrar el primero.' : '.'}</p>
            ) : (
              <ul className="otd-lista">
                {trabajos.map(t => {
                  const costo = trabajoCosto(t);
                  const personal = String(aObjeto(t.detalles_json).personal ?? t.tecnico ?? '');
                  const det = aObjeto(t.detalles_json);
                  const registrado = !!(t.fecha_trabajo || t.fecha_salida || costo > 0 || det.realizado_registrado === true);
                  const reportado = String(det.falla_reportada ?? '').trim();
                  const origen = det.origen === 'reporte_falla' ? `Reporte de fallas${det.folio_reporte ? ` ${det.folio_reporte}` : ''}` : det.origen === 'rampa' ? 'Status de rampa' : '';
                  const fechas = [t.fecha_trabajo, t.fecha_salida]
                    .filter(Boolean)
                    .map(f => formatFechaHoraPe(String(f).replace('Z', '').replace(' ', 'T').slice(0, 16)));
                  return (
                    <li key={trabajoId(t)}>
                      <button type="button" className="otd-fila" disabled={!puedeEditar}
                        onClick={() => { setTrabajoSel(t); setTrabajoAbierto(true); }}
                        aria-label={puedeEditar ? `Editar trabajo: ${t.trabajo_realizado || 'sin descripción'}` : undefined}>
                        <span className="otd-avatar" aria-hidden>{iniciales(personal)}</span>
                        <span className="otd-fila__cuerpo">
                          <span className="otd-fila__titulo">{t.trabajo_realizado || '—'}</span>
                          <span className="otd-fila__sub">{personal || 'Sin técnico asignado'}</span>
                          {fechas.length > 0 && <span className="otd-fila__meta t-numeric">{fechas.join(' → ')}</span>}
                          {origen && <span className="otd-fila__meta">Reportado: {reportado || t.trabajo_realizado} · {origen}</span>}
                          {origen && <span className={`otd-fila__estado${registrado ? ' otd-fila__estado--ok' : ''}`}>{registrado ? 'Realizado' : 'Falta registrar lo realizado (fechas y horas)'}</span>}
                        </span>
                        {costo > 0 && <span className="otd-fila__importe t-numeric">{soles(costo)}</span>}
                        {puedeEditar && <ChevronRight size={16} className="otd-fila__chevron" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
                {totalTrabajos > 0 && (
                  <li className="otd-total"><span>Total mano de obra</span><span className="t-numeric">{soles(totalTrabajos)}</span></li>
                )}
              </ul>
            )}
          </section>

          {backlog.length > 0 && (
            <section className="otd-seccion">
              <header className="otd-seccion__cabecera">
                <h3 className="otd-seccion__titulo">Pendientes del backlog <span className="otd-cuenta">{backlog.filter(b => b.estado === 'Completado').length}/{backlog.length}</span></h3>
              </header>
              <div className="otd-lista otd-lista--checks">
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
            </section>
          )}

          {ficha('otd-ficha--movil')}
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
            <p className="tarjeta__grupo-titulo">Línea de Tiempo</p>
            {!tiempos.iniciado ? (
              <p className="t-footnote c-secondary">La OT aún no tiene inicio de trabajo.</p>
            ) : (
              <ol className="ot-timeline">
                <li className="ot-timeline__item ot-timeline__item--inicio">
                  <span className="ot-timeline__punto" aria-hidden />
                  <div className="ot-timeline__cuerpo">
                    <span className="ot-timeline__titulo">Inicio de Trabajo</span>
                    <span className="ot-timeline__sub">{fechaCorta(ot.fecha_inicio_ot)}{ot.iniciado_por ? ` · ${nombrePersona(ot.iniciado_por)}` : ''}</span>
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
                      <span className="ot-timeline__titulo">Salida de la Unidad</span>
                      <span className="ot-timeline__sub">{fechaCorta(ot.fecha_hora_salida)}{ot.cerrado_por ? ` · ${nombrePersona(ot.cerrado_por)}` : ''}</span>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--separator)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 38, height: 38, borderRadius: 12, background: '#fff1e6', color: '#f56300', display: 'grid', placeItems: 'center' }}><Package size={18} /></span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>Repuestos despachados</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{mats.length} salida{mats.length === 1 ? '' : 's'} de almacén</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</div>
              <div className="t-numeric" style={{ fontWeight: 800, fontSize: '1.15rem' }}>{soles(costos.repuestos)}</div>
            </div>
          </div>

          <Button variant="primary" block icon={<Package size={15} />} onClick={() => setSolicitando(true)} disabled={!puedeSolicitarRepuesto}>
            Solicitar repuesto a almacén
          </Button>

          {loadMat ? <PageLoader /> : mats.length === 0 ? (
            <p className="t-footnote c-secondary" style={{ textAlign: 'center', padding: '12px 0' }}>Sin repuestos despachados a esta OT. Las salidas de almacén aparecen aquí valorizadas.</p>
          ) : repuestosVista.map(sal => (
            <div key={sal.id} style={{ borderRadius: 16, border: '1px solid var(--separator)', background: 'var(--surface)', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', background: 'var(--fill-1)' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem' }}>{sal.id}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{diaPe(sal.fecha)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={pastillaEstado(sal.estado)}>{sal.estado}</span>
                  <span className="t-numeric" style={{ fontWeight: 800, fontSize: '0.95rem' }}>{soles(Number(sal.total_pen))}</span>
                  {puedeEditar && (
                    <>
                      {/* Ya despachado: ni se editan las cantidades ni se elimina (el stock ya salió del almacén) */}
                      {sal.estado !== 'Despachado' && (
                        <>
                          <Button size="sm" variant="plain" iconOnly icon={<Pencil size={14} />} aria-label={`Editar cantidades de ${sal.id}`} className="btn-tip btn-tip--azul" data-tip="Editar cantidades"
                            onClick={() => setSolicitudEdit(sal)} />
                          <Button size="sm" variant="plain" iconOnly icon={<Trash2 size={14} />} aria-label={`Eliminar solicitud ${sal.id}`} className="btn-tip btn-tip--rojo" data-tip="Eliminar solicitud"
                            onClick={() => setSolicitudBorrar(sal)} />
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
              {sal.items.map((it, idx) => {
                const { codigo, nombre } = partesItem(it.descripcion);
                return (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '10px 14px', borderTop: idx ? '1px solid var(--separator)' : 'none' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{nombre}</div>
                      {codigo && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--label-2)' }}>{codigo}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="t-numeric" style={{ fontWeight: 700, fontSize: '0.875rem' }}>{soles(Number(it.importe))}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--label-2)' }}>{it.cantidad} × {soles(Number(it.costo_unitario))}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {seccion === 'terceros' && (
        <>
          <OTServiciosTerceros ot={ot.ticket_entrada || ot.id_ot} puedeEditar={puedeEditar} />
          {valesServicio.length > 0 && (
            <div>
              <p className="tarjeta__grupo-titulo">Servicios registrados en vales ({valesServicio.length})</p>
              <div className="tarjeta__lista">
                {valesServicio.map(v => (
                  <div key={v.id} className="dato" style={{ alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>Servicio (Vale) · {v.id}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>
                        {diaPe(v.fecha)} · {v.items.map(it => partesItem(it.descripcion).nombre).join(', ')}
                      </div>
                    </div>
                    <span className="t-numeric" style={{ fontWeight: 700 }}>{soles(v.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {seccion === 'neumaticos' && <OTNeumaticos idOt={idOt} puedeEditar={puedeEditar} />}

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

        </div>
      </div>

      {exportando && <span className="t-footnote c-secondary" role="status">Preparando el PDF…</span>}

      <EditarOTSheet ot={ot} open={editandoOT} onClose={() => setEditandoOT(false)} />
      <EditarFechasSheet ot={ot} open={editandoFechas} onClose={() => setEditandoFechas(false)} />
      <EditarKmSheet ot={ot} open={editandoKm} onClose={() => setEditandoKm(false)} />
      <EditarSolicitudSheet idOt={idOt} solicitud={solicitudEdit} onClose={() => setSolicitudEdit(null)} />
      <ConfirmSheet open={!!solicitudBorrar} onClose={() => !borrando && setSolicitudBorrar(null)} loading={borrando}
        onConfirm={eliminarSolicitud} title="Eliminar solicitud"
        message="¿Eliminar esta solicitud de material?" confirmLabel="Eliminar" />
      <PausarOTSheet ot={ot} open={pausando} onClose={() => setPausando(false)} usuario={usuario} />
      <CerrarOTSheet ot={ot} open={cerrando} onClose={() => setCerrando(false)} usuario={usuario} />
      <TrabajoOTSheet ot={ot} trabajo={trabajoSel} open={trabajoAbierto} onClose={() => setTrabajoAbierto(false)} usuario={usuario} />
      <SalidaFormulario
        comoSolicitud
        open={solicitando}
        salida={null}
        onClose={() => setSolicitando(false)}
        onGuardado={() => {
          // Es una solicitud (queda pendiente hasta que almacén despache): se refrescan los materiales de la OT, su costo y el almacén
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
