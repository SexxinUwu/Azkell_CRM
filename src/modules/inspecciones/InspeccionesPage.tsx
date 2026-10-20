import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, ClipboardCheck, Disc3, Download, Plus, SearchX, Upload, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/auth/AuthProvider';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Button, PageLoader } from '../../core/ui/Button';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ToggleChips } from '../../core/ui/Chips';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { errorMessage } from '../../core/api/client';
import { spring } from '../../core/lib/motion';
import { abrirClasico } from '../../core/layout/navigation';
import { usePlacas, type Placa } from '../placas/api';
import { useDisponibilidad } from '../flota/api';
import { clavePlaca, useInspecciones, useInspeccionesNeumaticos, type Inspeccion } from './api';
import { ETIQUETA_ESTADO, evaluarCiclo, urgencia, type Ciclo, type Estado } from './vigencia';
import { InspeccionFicha } from './InspeccionFicha';
import { TipoInspeccionSheet } from './TipoInspeccionSheet';
import { NeumaticosInspeccionSheet } from './NeumaticosInspeccionSheet';
import { ImportarInspeccionesSheet, descargarPlantillaInspecciones } from './ImportarInspeccionesSheet';
import { useEsquema } from './registro';
import './inspecciones.css';

type Vista = 'flota' | 'historial';
type Formato = 'tarjetas' | 'tabla';
type Clase = 'todas' | 'motoras' | 'no-motoras';
interface Unidad { placa: Placa; ciclo: Ciclo }

const fechaCorta = (d: Date | null) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '—');
const fechaDMY = (d: Date | null) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '—');
const diaTitulo = (d: Date | null) => (d ? d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin fecha');
const fallas = (i: Inspeccion) => i.puntos.filter(p => p.estado === 'FALLA').length;
const numId = (id: string) => Number(id.replace(/\D/g, '')) || 0;
const DIA = 86_400_000;

/** Evaluación del ciclo, con las mismas palabras que la versión actual */
function evaluacion(c: Ciclo): { texto: string; tono: 'ok' | 'amber' | 'mal' | 'neutral' } {
  if (c.cobertura === 'ambas') return { texto: 'Mecánica y neumáticos', tono: 'ok' };
  if (c.cobertura === 'solo-mecanica') return { texto: 'Solo mecánica · falta neumáticos', tono: 'amber' };
  if (c.cobertura === 'solo-neumaticos') return { texto: 'Solo neumáticos · falta mecánica', tono: 'amber' };
  if (c.cobertura === 'vencida') return { texto: 'Ciclo vencido', tono: 'mal' };
  return { texto: 'Sin registro', tono: 'neutral' };
}

// Mantenimiento › Análisis de inspecciones: estado de vigencia de la flota (tarjetas o tabla),
// historial y ficha. Desde aquí se inspecciona: se elige Neumáticos o Mecánica Integral.
export function InspeccionesPage() {
  const insp = useInspecciones();
  const neu = useInspeccionesNeumaticos();
  const placasQ = usePlacas();
  const esquema = useEsquema();
  const toast = useToast();
  const [importando, setImportando] = useState(false);
  const dispQ = useDisponibilidad();
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const [vista, setVista] = useState<Vista>('flota');
  const [formato, setFormato] = useState<Formato>('tarjetas');
  const [busqueda, setBusqueda] = useState('');
  const [clase, setClase] = useState<Clase>('todas');
  const [estados, setEstados] = useState<Estado[]>([]);
  const [abierta, setAbierta] = useState<Inspeccion | null>(null);
  const [eleccion, setEleccion] = useState<string | null>(null);   // placa a inspeccionar (selector)
  const [neuPlaca, setNeuPlaca] = useState<string | null>(null);   // placa del formulario de neumáticos

  // Última inspección por placa, como la versión actual: general (no "Solo Frenos"), la más reciente
  const generales = useMemo(() => (insp.data ?? []).filter(i => i.tipo !== 'Solo Frenos')
    .sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0) || numId(b.id) - numId(a.id)), [insp.data]);

  const unidades = useMemo<Unidad[]>(() => {
    const ultimaMec = new Map<string, Inspeccion>();
    generales.forEach(i => { const k = clavePlaca(i.placa); if (!ultimaMec.has(k)) ultimaMec.set(k, i); });
    const ultimaNeu = new Map<string, NonNullable<typeof neu.data>[number]>();
    (neu.data ?? []).forEach(n => { const k = clavePlaca(n.placa); if (!ultimaNeu.has(k)) ultimaNeu.set(k, n); });
    // Solo unidades activas y en uso
    return (placasQ.data ?? []).filter(p => p.estado.toLowerCase() === 'activa' && p.enUso)
      .map(p => ({ placa: p, ciclo: evaluarCiclo(ultimaMec.get(clavePlaca(p.placa)) ?? null, ultimaNeu.get(clavePlaca(p.placa)) ?? null) }))
      .sort((a, b) => urgencia(a.ciclo) - urgencia(b.ciclo));
  }, [generales, neu.data, placasQ.data]);

  // Ubicación (En Base / En Ruta) según Disponibilidad de flota
  const ubicacion = useMemo(() => {
    const m = new Map<string, string>();
    (dispQ.data ?? []).forEach(d => { const k = clavePlaca(d.placa_camion || ''); if (k) m.set(k, d.estado); });
    return m;
  }, [dispQ.data]);

  const resumen = useMemo(() => {
    const r = { vigente: 0, proximo: 0, vencido: 0, 'sin-registro': 0 } as Record<Estado, number>;
    unidades.forEach(u => { r[u.ciclo.estado]++; });
    return r;
  }, [unidades]);
  const total = unidades.length;
  const alDia = resumen.vigente + resumen.proximo;
  const porcentaje = total ? Math.round((alDia / total) * 100) : 0;

  const pal = busqueda.trim().toUpperCase();
  const unidadesVisibles = unidades.filter(u =>
    (clase === 'todas' || (clase === 'motoras' ? u.placa.motora : !u.placa.motora))
    && (!estados.length || estados.includes(u.ciclo.estado))
    && (!pal || [u.placa.placa, u.placa.cliente, u.placa.marca, u.placa.tipo].join(' ').toUpperCase().includes(pal) || clavePlaca(u.placa.placa).includes(clavePlaca(pal))));

  const historial = (insp.data ?? []).filter(i => i.tipo !== 'Solo Frenos')
    .filter(i => !pal || [i.placa, i.tecnico, i.cliente, i.id].join(' ').toUpperCase().includes(pal) || clavePlaca(i.placa).includes(clavePlaca(pal)))
    .sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0) || numId(b.id) - numId(a.id));
  const porDia = useMemo(() => {
    const g = new Map<string, Inspeccion[]>();
    historial.slice(0, 200).forEach(i => { const k = i.fecha ? i.fecha.toDateString() : 'sin'; g.set(k, [...(g.get(k) ?? []), i]); });
    return [...g.values()];
  }, [historial]);

  const cargando = insp.isLoading || placasQ.isLoading;
  const error = insp.error || placasQ.error;

  // Botón Inspeccionar: el selector y luego el formulario que corresponda
  const inspeccionar = (placa: string) => setEleccion(placa);
  const puedeInspeccionar = can('insp.crear');

  const botonInspeccionar = (placa: string) => (
    puedeInspeccionar ? (
      // Mismo botón azul del clásico (#0284c7) con su respuesta al mouse y al toque
      <button type="button" className="insp-inspeccionar" onClick={() => inspeccionar(placa)} aria-label={`Inspeccionar ${placa}`}>
        <Plus size={15} strokeWidth={2.5} /> Inspeccionar
      </button>
    ) : null
  );

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Análisis de inspecciones"
        subtitle={cargando ? 'Cargando…' : `${total} unidades en operación · ${(insp.data ?? []).length} inspecciones registradas`}
        actions={
          <>
            <MenuOtros opciones={[
              can('insp.crear') && { label: 'Importar Excel', detalle: 'Con revisión antes de guardar', icon: <Upload size={17} />, onSelect: () => setImportando(true) },
              can('insp.crear') && { label: 'Descargar plantilla', icon: <Download size={17} />, onSelect: () => { descargarPlantillaInspecciones(esquema.data ?? []).catch(err => toast(errorMessage(err), 'error')); } },
              { label: 'Abrir en la versión actual', detalle: 'Editar y PDF', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/inspecciones') },
            ]} />
            {can('insp.crear') && <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/inspecciones/nueva')}>Nueva inspección</Button>}
          </>
        }
      />

      {cargando ? <PageLoader /> : error ? <Notice tone="error">{errorMessage(error)}</Notice> : (
        <>
          <div className="insp-vistas">
            <SegmentedControl<Vista> label="Vista" value={vista} onChange={setVista}
              options={[{ value: 'flota', label: 'Estado de la flota' }, { value: 'historial', label: 'Historial' }]} />
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {vista === 'flota' ? (
              <motion.div key="flota" initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                {/* Anillo de vigencia + cifras */}
                <div className="insp-hero card">
                  <div className="insp-anillo" aria-label={`${porcentaje} % de la flota con inspección al día`}>
                    <svg viewBox="0 0 120 120" aria-hidden>
                      <circle cx="60" cy="60" r="50" className="insp-anillo__pista" />
                      <motion.circle cx="60" cy="60" r="50" className="insp-anillo__valor"
                        initial={{ pathLength: reduce ? porcentaje / 100 : 0 }} animate={{ pathLength: porcentaje / 100 }}
                        transition={{ type: 'spring', bounce: 0, duration: reduce ? 0 : 1.2 }} />
                    </svg>
                    <div className="insp-anillo__texto">
                      <span className="insp-anillo__numero t-numeric"><AnimatedNumber value={porcentaje} />%</span>
                      <span className="insp-anillo__label">al día</span>
                    </div>
                  </div>
                  <div className="insp-hero__cifras">
                    {(['vigente', 'proximo', 'vencido', 'sin-registro'] as Estado[]).map((e, i) => (
                      <motion.button key={e} type="button" className={`insp-cifra insp-cifra--${e} pressable`} aria-pressed={estados.includes(e)}
                        onClick={() => setEstados(s => (s.includes(e) ? s.filter(x => x !== e) : [...s, e]))}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: reduce ? 0 : 0.05 * i }}>
                        <AnimatedNumber value={resumen[e]} className="insp-cifra__valor t-numeric" />
                        <span className="insp-cifra__label">{ETIQUETA_ESTADO[e]}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div className="toolbar placas-toolbar">
                  <div className="placas-toolbar__buscar"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, cliente, marca o tipo" /></div>
                  <SegmentedControl<Formato> label="Formato" value={formato} onChange={setFormato}
                    options={[{ value: 'tarjetas', label: 'Tarjetas' }, { value: 'tabla', label: 'Tabla' }]} />
                  <SegmentedControl<Clase> label="Clase" value={clase} onChange={setClase}
                    options={[{ value: 'todas', label: 'Todas' }, { value: 'motoras', label: 'Motoras' }, { value: 'no-motoras', label: 'No motoras' }]} />
                </div>
                {estados.length > 0 && (
                  <div className="placas-tipos">
                    <ToggleChips label="Estado" value={estados} onChange={v => setEstados(v as Estado[])}
                      options={(['vigente', 'proximo', 'vencido', 'sin-registro'] as Estado[]).map(e => ({ value: e, label: ETIQUETA_ESTADO[e] }))} />
                  </div>
                )}

                {unidadesVisibles.length === 0 ? (
                  <EmptyState icon={<SearchX size={22} />} title="No hay unidades con esos filtros">Prueba con otra búsqueda o quita los filtros.</EmptyState>
                ) : formato === 'tabla' ? (
                  <div className="insp-tabla" role="region" aria-label="Estado de la flota en tabla">
                    <table>
                      <thead>
                        <tr>
                          <th>Placa / cliente</th><th>Tipo</th><th>Técnico</th><th>Fecha insp.</th><th>Próxima insp.</th>
                          <th>Semáforo</th><th>Evaluación</th><th>Ubicación</th><th>Km insp.</th><th aria-label="Acciones" />
                        </tr>
                      </thead>
                      <tbody>
                        {unidadesVisibles.map(u => {
                          const c = u.ciclo;
                          const mec = c.mecanica;
                          const ev = evaluacion(c);
                          const prox = mec?.fecha ? new Date(mec.fecha.getTime() + mec.diasPropuestos * DIA) : null;
                          const ubic = ubicacion.get(clavePlaca(u.placa.placa));
                          return (
                            <tr key={u.placa.placa}>
                              <td>
                                <span className="insp-tabla__placa">{u.placa.placa}</span>
                                <span className="insp-tabla__cliente">{u.placa.cliente || '—'}</span>
                              </td>
                              <td>{u.placa.tipo || '—'}</td>
                              <td>{mec?.tecnico || '—'}</td>
                              <td className="t-numeric">{fechaDMY(mec?.fecha ?? null)}</td>
                              <td className="t-numeric">{prox ? <span className={`insp-estado insp-estado--${c.estado}`}>{fechaDMY(prox)}</span> : <span className="insp-estado insp-estado--sin-registro">Sin registro</span>}</td>
                              <td><span className={`insp-estado insp-estado--${c.estado}`}>{ETIQUETA_ESTADO[c.estado]}</span></td>
                              <td><span className={`insp-ev insp-ev--${ev.tono}`}>{ev.texto}</span></td>
                              <td>{ubic ? <span className={`insp-ubic${ubic === 'En Ruta' ? ' insp-ubic--ruta' : ''}`}>{ubic}</span> : <span className="c-secondary">—</span>}</td>
                              <td className="t-numeric">{mec?.km != null ? `${mec.km.toLocaleString('es-PE')} km` : '—'}</td>
                              <td className="insp-tabla__acciones">
                                {botonInspeccionar(u.placa.placa)}
                                {mec && <Button variant="plain" size="sm" onClick={() => setAbierta(mec)}>Ver</Button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <motion.ul className="insp-unidades" layout={!reduce}>
                    <AnimatePresence mode="popLayout" initial={!reduce}>
                      {unidadesVisibles.map((u, i) => {
                        const c = u.ciclo;
                        const avance = c.dias === null ? 0 : Math.max(0, Math.min(1, c.dias / 30));
                        return (
                          <motion.li key={u.placa.placa} layout={!reduce}
                            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                            transition={{ ...spring, delay: reduce ? 0 : Math.min(i, 12) * 0.02 }}>
                            <div className={`insp-unidad insp-unidad--${c.estado}`}>
                              <button type="button" className="insp-unidad__cuerpo pressable"
                                onClick={() => c.mecanica && setAbierta(c.mecanica)} disabled={!c.mecanica}>
                                <div className="insp-unidad__top">
                                  <LicensePlate plate={u.placa.placa} size="lg" />
                                  <span className={`insp-estado insp-estado--${c.estado}`}>{ETIQUETA_ESTADO[c.estado]}</span>
                                </div>
                                <div className="insp-unidad__titulo">{[u.placa.marca, u.placa.tipo].filter(Boolean).join(' · ') || 'Unidad'}</div>
                                <div className="insp-cobertura">
                                  <span className={`insp-chip${c.mecanica ? (c.mecanicaVigente ? ' insp-chip--ok' : ' insp-chip--mal') : ''}`}>
                                    <Wrench size={13} /> Mecánica{c.diasMecanica !== null ? ` · ${c.diasMecanica >= 0 ? c.diasMecanica + ' d' : 'vencida'}` : ' · sin registro'}
                                  </span>
                                  <span className={`insp-chip${c.neumaticos ? (c.neumaticosVigente ? ' insp-chip--ok' : ' insp-chip--mal') : ''}`}>
                                    <Disc3 size={13} /> Neumáticos{c.diasNeumaticos !== null ? ` · ${c.diasNeumaticos >= 0 ? c.diasNeumaticos + ' d' : 'vencida'}` : ' · sin registro'}
                                  </span>
                                </div>
                                <div className="insp-dias">
                                  <div className="insp-dias__barra"><motion.span className="insp-dias__lleno" initial={{ width: 0 }} animate={{ width: `${avance * 100}%` }} transition={{ ...spring, duration: reduce ? 0 : 0.9 }} /></div>
                                  <span className="insp-dias__texto">{c.texto}</span>
                                </div>
                                <div className="insp-unidad__pie">
                                  {c.ultimaActividad ? `Última: ${fechaCorta(c.ultimaActividad)}` : 'Nunca inspeccionada'}
                                  {c.mecanica && fallas(c.mecanica) > 0 && <span className="insp-fallas">{fallas(c.mecanica)} fallas</span>}
                                </div>
                              </button>
                              {puedeInspeccionar && (
                                <div className="insp-unidad__acciones">
                                  {botonInspeccionar(u.placa.placa)}
                                </div>
                              )}
                            </div>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </motion.ul>
                )}
              </motion.div>
            ) : (
              <motion.div key="historial" initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                <div className="toolbar placas-toolbar">
                  <div className="placas-toolbar__buscar"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, técnico, cliente o N.º de inspección" /></div>
                </div>
                <p className="placas-conteo t-footnote c-secondary">{historial.length} inspecciones{historial.length > 200 ? ' · se muestran las 200 más recientes' : ''}</p>
                {porDia.length === 0 ? (
                  <EmptyState icon={<ClipboardCheck size={22} />} title="Sin inspecciones">No hay inspecciones con esa búsqueda.</EmptyState>
                ) : porDia.map(grupo => (
                  <section key={grupo[0].fecha?.toDateString() ?? 'sin'} className="insp-dia">
                    <div className="list__header insp-dia__titulo">{diaTitulo(grupo[0].fecha)}</div>
                    <div className="list">
                      {grupo.map(i => (
                        <button key={i.id} type="button" className="row insp-fila" onClick={() => setAbierta(i)}>
                          <LicensePlate plate={i.placa} size="sm" />
                          <div className="row__main">
                            <div className="row__title">{i.id}</div>
                            <div className="row__subtitle">{[i.tecnico, i.km !== null ? `${i.km.toLocaleString('es-PE')} km` : '', i.cliente].filter(Boolean).join(' · ')}</div>
                          </div>
                          {fallas(i) > 0 ? <span className="insp-fallas">{fallas(i)} fallas</span> : <span className="insp-ok">Sin fallas</span>}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <TipoInspeccionSheet
        placa={eleccion}
        onClose={() => setEleccion(null)}
        onMecanica={() => { const p = eleccion ?? ''; setEleccion(null); navigate(`/inspecciones/nueva?placa=${encodeURIComponent(p)}`); }}
        onNeumaticos={() => { const p = eleccion; setEleccion(null); setNeuPlaca(p); }}
      />
      <NeumaticosInspeccionSheet placa={neuPlaca} usuario={user?.name ?? ''} onClose={() => setNeuPlaca(null)} />
      <InspeccionFicha inspeccion={abierta} onClose={() => setAbierta(null)} />
      <ImportarInspeccionesSheet open={importando} onClose={() => setImportando(false)}
        existentes={insp.data ?? []} placasRegistradas={(placasQ.data ?? []).map(p => p.placa)} />
    </Page>
  );
}
