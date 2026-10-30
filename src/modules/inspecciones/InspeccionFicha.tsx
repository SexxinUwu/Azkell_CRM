import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, Check, Disc3, Download, Minus, Pencil, Share2, Trash2, Wrench, X } from 'lucide-react';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { spring } from '../../core/lib/motion';
import { useAuth } from '../../core/auth/AuthProvider';
import { Notice } from '../../core/ui/Display';
import { InspeccionDetalleSheet } from '../mantenimiento/NeumaticosDetalleSheet';
import { compartirPDF, descargarArchivo } from '../../core/lib/pdf';
import { fallaEstadoColor, useChecklist, type ReporteFalla } from '../flota/api';
import { GenerarOTsSheet } from '../flota/GenerarOTsSheet';
import { VisorFotos, type FotoVisor } from '../../core/ui/VisorFotos';
import { clavePlaca, useFotosFirmadas, useInspeccionesNeumaticos, type Inspeccion, type PuntoRevisado } from './api';
import { pdfInspeccion } from './inspeccionPdf';

const fechaLarga = (d: Date | null) => (d ? d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin fecha');

/** Reporte de fallas que nació de esta inspección (legacy.js lo marca en el texto y en cada falla) */
function reporteDeInspeccion(r: ReporteFalla, id: string): boolean {
  if ((r.fallas_libres_text ?? '').includes(`Inspección ${id}`)) return true;
  return [r.fallas_tracto_json, r.fallas_remolque_json].some(j => (j ?? '').includes(`"origen_inspeccion":"${id}"`));
}

// Ficha de una inspección: resumen, puntos revisados por categoría (fallas primero), fotos y firma.
export function InspeccionFicha({ inspeccion, onClose }: { inspeccion: Inspeccion | null; onClose: () => void }) {
  const ultima = useRef<Inspeccion | null>(null);
  if (inspeccion) ultima.current = inspeccion;
  const i = inspeccion ?? ultima.current;
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const checklist = useChecklist();
  const [visor, setVisor] = useState<{ lista: FotoVisor[]; i: number } | null>(null);
  const [otAbierta, setOtAbierta] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tono: 'error' | 'neutral'; texto: string } | null>(null);
  // Eliminar (clásico: "Eliminar Insp. Mecánica" / "Eliminar Insp. Neumáticos" con confirmación)
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmar, setConfirmar] = useState<'mecanica' | 'neumaticos' | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const fotos = useMemo(() => [...(i?.puntos.map(p => p.foto).filter(Boolean) ?? []), i?.firma ?? ''].filter(Boolean), [i]);
  const firmadas = useFotosFirmadas(fotos);
  const ver = (url: string) => firmadas.data?.[url] ?? url;
  // Abre el visor con todas las fotos de la inspección, empezando por la tocada
  const abrirFoto = (foto: string) => {
    const lista: FotoVisor[] = (i?.puntos ?? []).filter(p => p.foto).map(p => ({ url: ver(p.foto), titulo: p.item }));
    setVisor({ lista, i: Math.max(0, lista.findIndex(f => f.url === ver(foto))) });
  };
  // El PDF necesita las fotos ya firmadas: si todavía se están firmando, los botones esperan
  const fotosListas = fotos.length === 0 || !firmadas.isPending;

  const reporte = useMemo(() => (i && checklist.data ? checklist.data.find(r => reporteDeInspeccion(r, i.id)) ?? null : null), [i, checklist.data]);

  // Inspección de neumáticos asociada: misma placa y dentro de 35 días de esta inspección (como el clásico)
  const neu = useInspeccionesNeumaticos();
  const neuAsociada = useMemo(() => {
    if (!i) return null;
    const clave = clavePlaca(i.placa);
    return (neu.data ?? []).find(n => clavePlaca(n.placa) === clave && (!n.fecha || !i.fecha || Math.abs(n.fecha.getTime() - i.fecha.getTime()) / 86_400_000 <= 35)) ?? null;
  }, [i, neu.data]);
  const [neuDetalle, setNeuDetalle] = useState<string | null>(null);
  const reporteActivo = !!reporte && fallaEstadoColor(reporte) === 'amber';

  const conteo = useMemo(() => {
    const c = { OK: 0, FALLA: 0, otros: 0 };
    i?.puntos.forEach(p => { if (p.estado === 'OK') c.OK++; else if (p.estado === 'FALLA') c.FALLA++; else c.otros++; });
    return c;
  }, [i]);

  // Fallas en formato tabla (sistema, ítem, estado y observación), como en la versión actual
  const fallasLista = useMemo(() => i?.puntos.filter(p => p.estado === 'FALLA') ?? [], [i]);

  const categorias = useMemo(() => {
    const g = new Map<string, PuntoRevisado[]>();
    i?.puntos.forEach(p => g.set(p.categoria, [...(g.get(p.categoria) ?? []), p]));
    const orden = (p: PuntoRevisado) => (p.estado === 'FALLA' ? 0 : p.estado === 'OK' ? 2 : 1);
    return [...g.entries()].map(([cat, ps]) => [cat, [...ps].sort((a, b) => orden(a) - orden(b))] as const)
      .sort((a, b) => b[1].filter(p => p.estado === 'FALLA').length - a[1].filter(p => p.estado === 'FALLA').length);
  }, [i]);

  // Acciones: PDF oficial, WhatsApp y, si hay fallas, generar las OT desde su reporte de fallas
  const generarPdf = () => pdfInspeccion({ inspeccion: i!, fotos: firmadas.data ?? {}, usuario: user?.name ?? '' });
  const nombreArchivo = i ? `Inspeccion-${i.placa}-${i.id}.pdf` : 'Inspeccion.pdf';
  const descargar = async () => {
    if (!i) return;
    setOcupado(true); setAviso(null);
    try {
      descargarArchivo(await generarPdf(), nombreArchivo);
    } catch (err) {
      console.error('PDF de inspección:', err);
      setAviso({ tono: 'error', texto: 'No se pudo generar el PDF. Intenta de nuevo.' });
    } finally { setOcupado(false); }
  };
  const whatsapp = async () => {
    if (!i) return;
    setOcupado(true); setAviso(null);
    try {
      await compartirPDF(await generarPdf(), nombreArchivo, `Informe técnico de la inspección ${i.id} · placa ${i.placa}`);
    } catch (err) {
      console.error('WhatsApp de inspección:', err);
      setAviso({ tono: 'error', texto: 'No se pudo preparar el PDF para WhatsApp.' });
    } finally { setOcupado(false); }
  };
  const generarOt = () => {
    if (!reporte) {
      setAviso({ tono: 'neutral', texto: 'Esta inspección no tiene un reporte de fallas enlazado. Si la unidad ya tenía una OT activa, sus fallas se añadieron a esa OT.' });
      return;
    }
    setAviso(null);
    setOtAbierta(true);
  };

  // Eliminar la inspección mecánica (eliminarInspeccion del clásico) o la de neumáticos (neuEliminarInspeccion)
  const confirmarEliminar = async () => {
    if (!confirmar || !i) return;
    const neuId = neuAsociada?.id ?? '';
    setEliminando(true);
    try {
      if (confirmar === 'mecanica') {
        const r = await api<{ ok?: boolean; data?: unknown }>('/script/eliminarRegistro', { method: 'POST', body: { id: i.id, coleccion: 'Inspecciones' } });
        if (r.ok === false) throw new Error(String(r.data ?? 'No se pudo eliminar la inspección'));
        toast(`Inspección ${i.id} eliminada`);
        setConfirmar(null);
        onClose();
        await qc.invalidateQueries({ queryKey: ['inspecciones'] });
      } else {
        await api(`/neumaticos/inspecciones/${encodeURIComponent(neuId)}`, { method: 'DELETE' });
        toast(`Inspección ${neuId} eliminada`);
        setConfirmar(null);
        setNeuDetalle(null);
        await qc.invalidateQueries({ queryKey: ['inspecciones'] });
      }
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setEliminando(false);
    }
  };

  return (
    <>
      <Sheet
        anclaAbajo
        open={!!inspeccion}
        onClose={onClose}
        title={i ? `Inspección ${i.id}` : 'Inspección'}
        footer={
          <>
            {i && can('insp.eliminar') && (
              <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => setConfirmar('mecanica')}>Eliminar</Button>
            )}
            <span style={{ flex: 1 }} />
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
            {i && (can('insp.editar') || can('insp.crear')) && (
              <Button variant="primary" icon={<Pencil size={16} />} onClick={() => { onClose(); navigate(`/inspecciones/${i.id}/editar`); }}>Editar</Button>
            )}
          </>
        }
      >
        {i && (
          <div className="ficha">
            <motion.div className="ficha__hero" initial={{ opacity: 0, scale: reduce ? 1 : 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
              <LicensePlate plate={i.placa} size="xl" />
              <div className="ficha__titulo insp-ficha__fecha">{fechaLarga(i.fecha)}</div>
              <div className="ficha__chips">
                {i.tecnico && <span className="chip chip--static">Técnico: {i.tecnico}</span>}
                {i.km !== null && <span className="chip chip--static">{i.km.toLocaleString('es-PE')} km</span>}
                {i.tipo && <span className="chip chip--static">{i.tipo}</span>}
                {i.idOt && <span className="chip chip--static">OT {i.idOt}</span>}
              </div>
            </motion.div>

            <div className="insp-acciones">
              <Button variant="secondary" icon={<Download size={16} />} onClick={descargar} disabled={ocupado || !fotosListas}>PDF</Button>
              <Button variant="secondary" icon={<Share2 size={16} />} onClick={whatsapp} disabled={ocupado || !fotosListas}>WhatsApp</Button>
              {conteo.FALLA > 0 && (
                <Button variant="secondary" icon={<Wrench size={16} />} onClick={generarOt} disabled={!!reporte && !reporteActivo}>Generar OT desde inspección</Button>
              )}
            </div>
            {neuAsociada && (
              <div className="insp-neu-asociada">
                <div className="insp-neu-asociada__texto">
                  <strong>Inspección de neumáticos asociada</strong>
                  <span className="insp-neu-asociada__id">{neuAsociada.id}</span>
                  <small>{neuAsociada.fecha ? neuAsociada.fecha.toLocaleDateString('es-PE') : 'Sin fecha'} · Llantas críticas: {neuAsociada.llantasCriticas}</small>
                </div>
                <Button variant="secondary" icon={<Disc3 size={16} />} onClick={() => setNeuDetalle(neuAsociada.id)}>Ver detalle de neumáticos</Button>
                {can('insp.eliminar') && (
                  <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => setConfirmar('neumaticos')}>Eliminar neumáticos</Button>
                )}
              </div>
            )}
            {aviso && <Notice tone={aviso.tono}>{aviso.texto}</Notice>}

            <div className="insp-resumen">
              <div className="insp-resumen__item insp-resumen__item--ok"><AnimatedNumber value={conteo.OK} className="t-numeric" /><span>en buen estado</span></div>
              <div className="insp-resumen__item insp-resumen__item--falla"><AnimatedNumber value={conteo.FALLA} className="t-numeric" /><span>con falla</span></div>
              <div className="insp-resumen__item"><AnimatedNumber value={conteo.otros} className="t-numeric" /><span>sin datos</span></div>
            </div>

            {fallasLista.length > 0 && (
              <section className="ficha__grupo insp-fallas-tabla">
                <div className="list__header insp-fallas-tabla__titulo"><AlertTriangle size={15} /> Detalle de fallas detectadas ({fallasLista.length})</div>
                <div className="insp-tabla-fallas" role="table" aria-label="Fallas detectadas">
                  <div className="insp-tabla-fallas__fila insp-tabla-fallas__fila--cab" role="row">
                    <span role="columnheader">Sistema</span><span role="columnheader">Ítem / componente</span><span role="columnheader">Estado</span><span role="columnheader">Observación del técnico</span>
                  </div>
                  {fallasLista.map((p, n) => (
                    <div key={n} className="insp-tabla-fallas__fila" role="row">
                      <span role="cell"><span className="insp-tag">{p.categoria}</span></span>
                      <span role="cell" className="insp-tabla-fallas__item">{p.item}</span>
                      <span role="cell"><span className="insp-pill-falla"><X size={12} strokeWidth={3} /> FALLA</span></span>
                      <span role="cell" className="insp-tabla-fallas__obs">{p.observacion || '—'}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {categorias.map(([cat, ps], k) => (
              <motion.section key={cat} className="ficha__grupo" initial={{ opacity: 0, y: reduce ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: reduce ? 0 : 0.04 * k }}>
                <div className="list__header insp-cat">
                  {cat}
                  {ps.some(p => p.estado === 'FALLA') && <span className="insp-fallas">{ps.filter(p => p.estado === 'FALLA').length}</span>}
                </div>
                <div className="list">
                  {ps.map((p, n) => (
                    <div key={n} className={`row insp-punto insp-punto--${p.estado === 'FALLA' ? 'falla' : p.estado === 'OK' ? 'ok' : 'nd'}`}>
                      <span className="insp-punto__icono" aria-hidden>
                        {p.estado === 'OK' ? <Check size={14} strokeWidth={3} /> : p.estado === 'FALLA' ? <X size={14} strokeWidth={3} /> : <Minus size={14} strokeWidth={3} />}
                      </span>
                      <div className="row__main">
                        <div className="row__title">{p.item}</div>
                        {p.observacion && <div className="row__subtitle row__subtitle--wrap">{p.observacion}</div>}
                        {!['OK', 'FALLA', 'SIN DATOS'].includes(p.estado) && <div className="row__subtitle">{p.estado}</div>}
                      </div>
                      {p.foto && (
                        <button type="button" className="insp-foto pressable" onClick={() => abrirFoto(p.foto)} aria-label={`Ver foto de ${p.item}`}>
                          <img src={ver(p.foto)} alt="" loading="lazy" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.section>
            ))}

            {i.firma && (
              <section className="ficha__grupo">
                <div className="list__header">Firma</div>
                <div className="insp-firma"><img src={ver(i.firma)} alt="Firma del técnico" /></div>
              </section>
            )}
          </div>
        )}
      </Sheet>

      {reporte && <GenerarOTsSheet falla={reporte} open={otAbierta} onClose={() => setOtAbierta(false)} />}
      <ConfirmSheet
        open={confirmar !== null}
        onClose={() => !eliminando && setConfirmar(null)}
        onConfirm={confirmarEliminar}
        loading={eliminando}
        title={confirmar === 'neumaticos' ? '¿Eliminar Inspección de Neumáticos?' : '¿Eliminar Inspección?'}
        message={confirmar === 'neumaticos'
          ? <>Se eliminará permanentemente la inspección <strong>{neuAsociada?.id}</strong> y todos sus registros de llantas y presiones.</>
          : 'Esta acción eliminará el registro de inspección de forma permanente del sistema. ¿Deseas continuar?'}
        confirmLabel="Sí, eliminar"
      />
      <InspeccionDetalleSheet id={neuDetalle} onClose={() => setNeuDetalle(null)} />

      {/* Visor de fotos: el mismo de Seguridad (galería con zoom y miniaturas) */}
      <VisorFotos open={visor !== null} onClose={() => setVisor(null)} fotos={visor?.lista ?? []} indiceInicial={visor?.i ?? 0} titulo="Fotos de la inspección" />
    </>
  );
}
