import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, Check, CheckCheck, ChevronRight, ClipboardCheck, RotateCcw, Trash2, X } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Notice, Page } from '../../core/ui/Display';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { usePlacas } from '../placas/api';
import {
  armarDetalles, borrarBorrador, cabeceraDesde, claveRespuesta, guardarBorrador, guardarInspeccion, hoyISO, leerBorrador, reducirFoto, respuestasDesde,
  respuestaVacia, useEsquema, type Cabecera, type Respuesta,
} from './registro';
import { Firma, type FirmaHandle } from './Firma';
import { useFotosFirmadas, useInspecciones, type Inspeccion } from './api';
import './inspecciones.css';

const cabeceraInicial = (): Cabecera => ({
  placa: '', fecha: hoyISO(), km: '', cliente: '', tecnico: (localStorage.getItem('fleet_user') || '').toUpperCase(), dias: '30',
});

type Guardado = { fase: 'subiendo' | 'guardando'; hechas: number; total: number } | { fase: 'listo'; id: string } | null;

// Registrar una inspección: unidad → un paso por sistema → resumen y firma.
export function RegistrarInspeccionPage({ editar = null }: { editar?: Inspeccion | null } = {}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();
  const esquema = useEsquema();
  const placas = usePlacas();
  const firma = useRef<FirmaHandle>(null);

  const borradorInicial = useRef(leerBorrador());
  const [ofrecerBorrador, setOfrecerBorrador] = useState(!!borradorInicial.current && !editar);
  const [cab, setCab] = useState<Cabecera>(cabeceraInicial);
  const [resp, setResp] = useState<Record<string, Respuesta>>({});
  const [paso, setPaso] = useState(0);
  const [direccion, setDireccion] = useState(1);
  const [intentoCab, setIntentoCab] = useState(false);
  const [firmada, setFirmada] = useState(false);
  const [guardado, setGuardado] = useState<Guardado>(null);

  // Edición: se precarga la inspección guardada una sola vez (las fotos de S3 se conservan)
  const cargadoEdicion = useRef<string | null>(null);
  useEffect(() => {
    if (!editar || !esquema.data || cargadoEdicion.current === editar.id) return;
    cargadoEdicion.current = editar.id;
    setCab(cabeceraDesde(editar));
    setResp(respuestasDesde(editar, esquema.data));
  }, [editar, esquema.data]);
  // Fotos guardadas en S3: se firman para verlas; al guardar se conserva la URL original
  const urlsFotos = Object.values(resp).map(r => r.foto).filter(f => f.startsWith('https://') && f.includes('.s3.'));
  const firmadas = useFotosFirmadas(urlsFotos).data ?? {};
  const fotoSrc = (f: string) => firmadas[f] ?? f;

  const secciones = esquema.data ?? [];
  const totalPasos = secciones.length + 2; // unidad + sistemas + firma
  const enFirma = paso === totalPasos - 1;

  // Borrador automático (sin fotos)
  useEffect(() => {
    if (ofrecerBorrador || guardado || editar) return;
    if (!cab.placa && !Object.keys(resp).length) return;
    const t = setTimeout(() => guardarBorrador({ cabecera: cab, respuestas: resp, paso }), 600);
    return () => clearTimeout(t);
  }, [cab, resp, paso, ofrecerBorrador, guardado]);

  const opcionesPlaca = useMemo(() => (placas.data ?? []).filter(p => p.estado.toLowerCase() === 'activa')
    .map(p => ({ value: p.placa, label: p.placa, description: [p.tipo, p.marca, p.cliente].filter(Boolean).join(' · ') })), [placas.data]);
  const placaSel = (placas.data ?? []).find(p => p.placa === cab.placa);

  const erroresCab = {
    placa: !cab.placa ? 'Elige la placa de la unidad.' : null,
    tecnico: !cab.tecnico.trim() ? 'Escribe el nombre del técnico.' : null,
    fecha: !cab.fecha ? 'Elige la fecha.' : null,
    km: cab.km && !/^\d+$/.test(cab.km) ? 'Escribe solo números.' : null,
  };
  const cabValida = !Object.values(erroresCab).some(Boolean);

  const set = (k: string, cambio: Partial<Respuesta>) => setResp(r => ({ ...r, [k]: { ...(r[k] ?? respuestaVacia()), ...cambio } }));

  const ir = (n: number) => {
    if (n > paso && paso === 0 && !cabValida) { setIntentoCab(true); haptic('warning'); return; }
    setDireccion(n > paso ? 1 : -1);
    setPaso(Math.max(0, Math.min(totalPasos - 1, n)));
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  const conteo = useMemo(() => {
    let ok = 0, falla = 0, sin = 0;
    secciones.forEach((s, si) => s.items.forEach((it, ii) => {
      const r = resp[claveRespuesta(si, ii)];
      if (it.tipo === 'okfalla') { if (r?.estado === 'OK') ok++; else if (r?.estado === 'FALLA') falla++; else sin++; }
      else if (it.tipo === 'percent') { if (r?.porcentaje) ok++; else sin++; }
      else if (r?.texto?.trim()) ok++; else sin++;
    }));
    return { ok, falla, sin };
  }, [resp, secciones]);

  const fallasLista = secciones.flatMap((s, si) => s.items.map((it, ii) => ({ s, it, r: resp[claveRespuesta(si, ii)] })))
    .filter(x => x.r?.estado === 'FALLA');

  async function elegirFoto(k: string, archivo: File | undefined) {
    if (!archivo) return;
    try { set(k, { foto: await reducirFoto(archivo) }); haptic('selection'); }
    catch (err) { toast(errorMessage(err), 'error'); }
  }

  async function guardar() {
    if (!cabValida) { setPaso(0); setIntentoCab(true); return; }
    const conFoto = fallasLista.filter(x => x.r?.foto).length;
    setGuardado({ fase: 'subiendo', hechas: 0, total: conFoto });
    try {
      const detalles = await armarDetalles(secciones, resp, (hechas, total) => setGuardado({ fase: 'subiendo', hechas, total }));
      setGuardado({ fase: 'guardando', hechas: conFoto, total: conFoto });
      const firmaFinal = firma.current?.obtener() || editar?.firma || '';
      const id = await guardarInspeccion(cab, detalles, firmaFinal, editar?.id ?? '');
      borrarBorrador();
      haptic('success');
      await qc.invalidateQueries({ queryKey: ['inspecciones'] });
      setGuardado({ fase: 'listo', id });
    } catch (err) {
      setGuardado(null);
      haptic('warning');
      toast(errorMessage(err), 'error');
    }
  }

  const reiniciar = () => {
    setCab(cabeceraInicial()); setResp({}); setPaso(0); setIntentoCab(false); setGuardado(null); setFirmada(false);
  };

  if (esquema.isLoading || placas.isLoading) return <PageLoader />;

  // ── Pantalla final ──
  if (guardado?.fase === 'listo') {
    return (
      <Page narrow>
        <motion.div className="insp-listo" initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
          <svg className="importar__check" viewBox="0 0 64 64" aria-hidden>
            <motion.circle cx="32" cy="32" r="29" fill="none" stroke="var(--green)" strokeWidth="4" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : 0.45 }} />
            <motion.path d="M20 33 l8 8 l16 -18" fill="none" stroke="var(--green)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ delay: reduce ? 0 : 0.35, duration: reduce ? 0 : 0.3 }} />
          </svg>
          <h1 className="t-title1">{editar ? 'Inspección actualizada' : 'Inspección registrada'}</h1>
          <motion.div className="insp-listo__id" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: reduce ? 0 : 0.5 }}>{guardado.id}</motion.div>
          <LicensePlate plate={cab.placa} size="lg" />
          <p className="c-secondary">
            {conteo.falla ? `${conteo.falla} ${conteo.falla === 1 ? 'falla pasó' : 'fallas pasaron'} a Reportes de fallas.` : 'Sin fallas: unidad en buen estado.'}
          </p>
          <div className="insp-listo__acciones">
            <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={reiniciar}>Nueva inspección</Button>
            <Button variant="primary" onClick={() => navigate('/inspecciones')}>Ver inspecciones</Button>
          </div>
        </motion.div>
      </Page>
    );
  }

  return (
    <Page narrow>
      {/* Encabezado con progreso */}
      <div className="wiz-cabecera">
        <button type="button" className="back-link" onClick={() => (paso ? ir(paso - 1) : navigate('/inspecciones'))}>
          <ArrowLeft size={16} /> {paso ? 'Atrás' : 'Inspecciones'}
        </button>
        <div className="wiz-titulo">
          <span className="t-eyebrow">{editar ? 'Editar inspección' : 'Nueva inspección'} · paso {paso + 1} de {totalPasos}</span>
          <h1 className="t-title2">{paso === 0 ? 'Unidad' : enFirma ? 'Resumen y firma' : secciones[paso - 1]?.titulo.toLowerCase()}</h1>
        </div>
        <div className="wiz-progreso" aria-hidden>
          {Array.from({ length: totalPasos }).map((_, i) => (
            <button key={i} type="button" className="wiz-progreso__paso" onClick={() => (i <= paso || cabValida) && ir(i)} tabIndex={-1}>
              <motion.span className="wiz-progreso__lleno" initial={false} animate={{ scaleX: i <= paso ? 1 : 0 }} transition={spring} />
            </button>
          ))}
        </div>
      </div>

      {ofrecerBorrador && borradorInicial.current && (
        <Notice tone="accent">
          Tienes una inspección sin terminar de {borradorInicial.current.cabecera.placa || 'una unidad'}.{' '}
          <button type="button" className="placas-limpiar" onClick={() => {
            const b = borradorInicial.current!; setCab(b.cabecera); setResp(b.respuestas); setPaso(b.paso); setOfrecerBorrador(false);
          }}>Continuar</button>{' · '}
          <button type="button" className="placas-limpiar" onClick={() => { borrarBorrador(); setOfrecerBorrador(false); }}>Empezar de nuevo</button>
          <span className="c-secondary"> (las fotos no se guardan en el borrador)</span>
        </Notice>
      )}

      <AnimatePresence mode="wait" initial={false} custom={direccion}>
        <motion.div
          key={paso}
          custom={direccion}
          initial={{ opacity: 0, x: reduce ? 0 : 40 * direccion }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: reduce ? 0 : -40 * direccion }}
          transition={spring}
          className="wiz-paso"
        >
          {paso === 0 && (
            <div className="placa-form">
              <motion.div className="placa-form__preview" layout transition={spring}>
                <LicensePlate plate={cab.placa} size="xl" />
                {placaSel && <span className="placa-form__preview-texto">{[placaSel.marca, placaSel.tipo, placaSel.cliente].filter(Boolean).join(' · ')}</span>}
              </motion.div>
              <section className="form-section">
                <div className="form-grid">
                  <Field label="Placa" error={intentoCab ? erroresCab.placa : null} wide>
                    {props => (
                      <Combobox {...props} options={opcionesPlaca} value={cab.placa || null} placeholder="Busca la placa"
                        onChange={v => {
                          const p = (placas.data ?? []).find(x => x.placa === v);
                          setCab(c => ({ ...c, placa: v ?? '', cliente: p?.cliente ?? c.cliente }));
                        }} />
                    )}
                  </Field>
                  <Field label="Fecha" error={intentoCab ? erroresCab.fecha : null}>
                    {props => <TextInput {...props} type="date" value={cab.fecha} max={hoyISO()} onChange={e => setCab(c => ({ ...c, fecha: e.target.value }))} />}
                  </Field>
                  <Field label="Kilometraje del tablero" error={erroresCab.km}>
                    {props => <TextInput {...props} inputMode="numeric" value={cab.km} placeholder="Ej. 245300" onChange={e => setCab(c => ({ ...c, km: e.target.value.replace(/\D/g, '') }))} />}
                  </Field>
                  <Field label="Técnico" error={intentoCab ? erroresCab.tecnico : null} wide>
                    {props => <TextInput {...props} value={cab.tecnico} onChange={e => setCab(c => ({ ...c, tecnico: e.target.value.toUpperCase() }))} />}
                  </Field>
                  <Field label="Cliente">
                    {props => <TextInput {...props} value={cab.cliente} onChange={e => setCab(c => ({ ...c, cliente: e.target.value }))} />}
                  </Field>
                  <Field label="Vigencia (días)" hint="Hasta la próxima inspección">
                    {props => <TextInput {...props} inputMode="numeric" value={cab.dias} onChange={e => setCab(c => ({ ...c, dias: e.target.value.replace(/\D/g, '').slice(0, 3) }))} />}
                  </Field>
                </div>
              </section>
            </div>
          )}

          {paso > 0 && !enFirma && secciones[paso - 1] && (() => {
            const si = paso - 1;
            const s = secciones[si];
            const pendientes = s.items.filter((it, ii) => it.tipo === 'okfalla' && !resp[claveRespuesta(si, ii)]?.estado).length;
            return (
              <>
                <div className="wiz-seccion__barra">
                  <span className="t-footnote c-secondary">{s.items.length} puntos · {pendientes ? `${pendientes} sin marcar` : 'todos marcados'}</span>
                  {pendientes > 0 && (
                    <Button size="sm" variant="secondary" icon={<CheckCheck size={15} />} onClick={() => {
                      haptic('success');
                      s.items.forEach((it, ii) => { const k = claveRespuesta(si, ii); if (it.tipo === 'okfalla' && !resp[k]?.estado) set(k, { estado: 'OK' }); });
                    }}>Todo OK</Button>
                  )}
                </div>
                <ul className="wiz-puntos">
                  {s.items.map((it, ii) => {
                    const k = claveRespuesta(si, ii);
                    const r = resp[k] ?? respuestaVacia();
                    return (
                      <li key={k} className={`wiz-punto${r.estado === 'FALLA' ? ' wiz-punto--falla' : r.estado === 'OK' ? ' wiz-punto--ok' : ''}`}>
                        <div className="wiz-punto__fila">
                          <span className="wiz-punto__label">{it.label}</span>
                          {it.tipo === 'okfalla' && (
                            <div className="wiz-okfalla" role="radiogroup" aria-label={it.label}>
                              <button type="button" role="radio" aria-checked={r.estado === 'OK'} className="wiz-btn wiz-btn--ok pressable"
                                onClick={() => { haptic('selection'); set(k, { estado: r.estado === 'OK' ? '' : 'OK' }); }}>
                                <Check size={16} strokeWidth={3} /> OK
                              </button>
                              <button type="button" role="radio" aria-checked={r.estado === 'FALLA'} className="wiz-btn wiz-btn--falla pressable"
                                onClick={() => { haptic('warning'); set(k, { estado: r.estado === 'FALLA' ? '' : 'FALLA' }); }}>
                                <X size={16} strokeWidth={3} /> Falla
                              </button>
                            </div>
                          )}
                          {it.tipo === 'percent' && <span className="wiz-porcentaje t-numeric">{r.porcentaje === '' ? 'Sin medir' : `${r.porcentaje}%`}</span>}
                        </div>

                        {it.tipo === 'percent' && (
                          <input type="range" min={0} max={100} step={5} className="wiz-rango" aria-label={`${it.label} (%)`}
                            value={r.porcentaje === '' ? 50 : Number(r.porcentaje)} onChange={e => set(k, { porcentaje: e.target.value })} />
                        )}
                        {it.tipo === 'text' && (
                          <textarea className="input wiz-texto" rows={2} value={r.texto} onChange={e => set(k, { texto: e.target.value })} placeholder="Escribe aquí" />
                        )}

                        <AnimatePresence initial={false}>
                          {r.estado === 'FALLA' && (
                            <motion.div className="wiz-falla" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring}>
                              <textarea className="input wiz-texto" rows={2} value={r.observacion} placeholder="¿Qué encontraste? Ej. fuga en la manguera del radiador"
                                onChange={e => set(k, { observacion: e.target.value })} />
                              <div className="wiz-foto">
                                {r.foto ? (
                                  <>
                                    <img src={fotoSrc(r.foto)} alt="Foto de la falla" />
                                    <button type="button" className="placas-limpiar" onClick={() => set(k, { foto: '' })}><Trash2 size={13} style={{ verticalAlign: '-2px' }} /> Quitar foto</button>
                                  </>
                                ) : (
                                  <label className="wiz-foto__btn pressable">
                                    <Camera size={17} /> Tomar foto
                                    <input type="file" accept="image/*" capture="environment" hidden onChange={e => elegirFoto(k, e.target.files?.[0])} />
                                  </label>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </li>
                    );
                  })}
                </ul>
              </>
            );
          })()}

          {enFirma && (
            <div className="placa-form">
              <div className="insp-resumen">
                <div className="insp-resumen__item insp-resumen__item--ok"><AnimatedNumber value={conteo.ok} className="t-numeric" /><span>en buen estado</span></div>
                <div className="insp-resumen__item insp-resumen__item--falla"><AnimatedNumber value={conteo.falla} className="t-numeric" /><span>con falla</span></div>
                <div className="insp-resumen__item"><AnimatedNumber value={conteo.sin} className="t-numeric" /><span>sin marcar</span></div>
              </div>
              {conteo.sin > 0 && (
                <Notice tone="neutral">Hay {conteo.sin} puntos sin marcar: se guardarán como "sin datos". Puedes volver a cualquier paso tocando la barra de arriba.</Notice>
              )}
              {fallasLista.length > 0 && (
                <section className="ficha__grupo">
                  <div className="list__header">Fallas encontradas</div>
                  <div className="list">
                    {fallasLista.map(({ s, it, r }) => (
                      <div key={s.titulo + it.label} className="row insp-punto insp-punto--falla">
                        <span className="insp-punto__icono" aria-hidden><X size={14} strokeWidth={3} /></span>
                        <div className="row__main">
                          <div className="row__title">{it.label}</div>
                          <div className="row__subtitle row__subtitle--wrap">{[s.titulo, r?.observacion].filter(Boolean).join(' · ') || s.titulo}</div>
                        </div>
                        {r?.foto && <span className="insp-foto"><img src={fotoSrc(r.foto)} alt="" /></span>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <section className="form-section">
                <h3 className="form-section__title">Firma del técnico</h3>
                {editar?.firma && !firmada && <p className="t-footnote c-secondary">Se conserva la firma actual. Firma de nuevo para reemplazarla.</p>}
                <Firma ref={firma} onCambio={setFirmada} />
              </section>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Barra inferior */}
      <div className="wiz-pie glass">
        {paso > 0 && <Button variant="secondary" onClick={() => ir(paso - 1)} disabled={!!guardado}>Atrás</Button>}
        {!enFirma ? (
          <Button variant="primary" icon={<ChevronRight size={16} />} onClick={() => ir(paso + 1)}>
            {paso === 0 ? 'Empezar revisión' : 'Siguiente'}
          </Button>
        ) : (
          <Button variant="primary" icon={<ClipboardCheck size={16} />} onClick={guardar} loading={!!guardado}>
            {guardado?.fase === 'subiendo' && guardado.total ? `Subiendo fotos ${guardado.hechas}/${guardado.total}` : guardado ? 'Guardando…' : firmada ? 'Guardar inspección' : 'Guardar sin firma'}
          </Button>
        )}
      </div>
    </Page>
  );
}

/** Edición de una inspección guardada: se busca por su código en la ruta /inspecciones/:id/editar */
export function EditarInspeccionPage() {
  const { id } = useParams();
  const insp = useInspecciones();
  if (insp.isLoading) return <PageLoader />;
  const editar = (insp.data ?? []).find(i => i.id === id) ?? null;
  if (!editar) return <Page narrow><Notice tone="error">No encontramos la inspección {id}.</Notice></Page>;
  return <RegistrarInspeccionPage editar={editar} />;
}
