import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, ClipboardCheck, Disc3, Plus, SearchX, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/auth/AuthProvider';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Button, PageLoader } from '../../core/ui/Button';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ToggleChips } from '../../core/ui/Chips';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { errorMessage } from '../../core/api/client';
import { spring } from '../../core/lib/motion';
import { abrirClasico } from '../../core/layout/navigation';
import { usePlacas, type Placa } from '../placas/api';
import { clavePlaca, useInspecciones, useInspeccionesNeumaticos, type Inspeccion } from './api';
import { ETIQUETA_ESTADO, evaluarCiclo, urgencia, type Ciclo, type Estado } from './vigencia';
import { InspeccionFicha } from './InspeccionFicha';
import './inspecciones.css';

type Vista = 'flota' | 'historial';
type Clase = 'todas' | 'motoras' | 'no-motoras';
interface Unidad { placa: Placa; ciclo: Ciclo }

const fechaCorta = (d: Date | null) => (d ? d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const diaTitulo = (d: Date | null) => (d ? d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin fecha');
const fallas = (i: Inspeccion) => i.puntos.filter(p => p.estado === 'FALLA').length;
const numId = (id: string) => Number(id.replace(/\D/g, '')) || 0;

// Mantenimiento › Inspecciones: estado de vigencia de la flota, historial y ficha de cada inspección.
export function InspeccionesPage() {
  const insp = useInspecciones();
  const neu = useInspeccionesNeumaticos();
  const placasQ = usePlacas();
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [vista, setVista] = useState<Vista>('flota');
  const [busqueda, setBusqueda] = useState('');
  const [clase, setClase] = useState<Clase>('todas');
  const [estados, setEstados] = useState<Estado[]>([]);
  const [abierta, setAbierta] = useState<Inspeccion | null>(null);

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

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Inspecciones"
        subtitle={cargando ? 'Cargando…' : `${total} unidades en operación · ${(insp.data ?? []).length} inspecciones registradas`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Abrir en la versión actual', detalle: 'Editar, PDF e importar', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/inspecciones') },
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
                            <button type="button" className={`insp-unidad insp-unidad--${c.estado} pressable`}
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

      <InspeccionFicha inspeccion={abierta} onClose={() => setAbierta(null)} />
    </Page>
  );
}
