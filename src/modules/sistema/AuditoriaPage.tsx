import '../mantenimiento/mant.css';
import './auditoria.css';
import { useMemo, useState } from 'react';
import {
  ArrowUpRight, Eye, LogIn, LogOut, Pencil, Plus, SearchX, ShieldCheck, Trash2, type LucideIcon,
} from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { useAuditoria, useLogFirmado, type AuditoriaEntrada, type LogFirmado } from './api';
import { formatFechaHoraPe, formatFechaPe } from '../../core/lib/format';

type Tipo = 'todos' | 'crear' | 'editar' | 'eliminar' | 'acceso';
type Vista = 'actividad' | 'firmado';

const TIPOS: { value: Tipo; label: string }[] = [
  { value: 'todos', label: 'Todo' },
  { value: 'crear', label: 'Creaciones' },
  { value: 'editar', label: 'Cambios' },
  { value: 'eliminar', label: 'Eliminaciones' },
  { value: 'acceso', label: 'Accesos' },
];

/** Clasifica una acción libre ("CREÓ", "Ingreso", "MODIFICÓ"…) en un tipo con ícono y color */
function clasificar(accion: string | null | undefined, detalle?: string | null): Exclude<Tipo, 'todos'> | 'otro' {
  const t = `${accion ?? ''} ${detalle ?? ''}`.toLowerCase();
  if (/cerr[óo] sesi|cierre de sesi|logout/.test(t)) return 'acceso';
  if (/ingres[óo]|inicio de sesi|login|inici[óo] sesi/.test(t)) return 'acceso';
  if (/elimin|delet|borr|remov|anul/.test(t)) return 'eliminar';
  if (/cre[óo]|crear|creat|registr|insert|agreg|import/.test(t)) return 'crear';
  if (/edit|modific|actualiz|updat|cambi/.test(t)) return 'editar';
  return 'otro';
}

const ICONO: Record<string, { Icono: LucideIcon; tono: string }> = {
  crear: { Icono: Plus, tono: 'verde' },
  editar: { Icono: Pencil, tono: 'ambar' },
  eliminar: { Icono: Trash2, tono: 'rojo' },
  acceso: { Icono: LogIn, tono: 'azul' },
  otro: { Icono: Eye, tono: 'gris' },
};

const clave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function etiquetaDia(d: Date): string {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(d); dia.setHours(0, 0, 0, 0);
  const diff = Math.round((hoy.getTime() - dia.getTime()) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return formatFechaPe(d);
}


interface Evento {
  id: string | number;
  fecha: Date;
  usuario: string;
  tipo: ReturnType<typeof clasificar>;
  accion: string;
  modulo: string;
  texto: string;
  ip: string;
}

/** Frase en lenguaje natural: "Administrador ingresó al sistema", "Ana creó …" */
function frase(usuario: string, tipo: ReturnType<typeof clasificar>, accion: string, detalle: string, modulo: unknown): string {
  const d = detalle.trim();
  if (d && d.toLowerCase().startsWith(usuario.toLowerCase())) return d;
  const bajo = `${accion} ${d}`.toLowerCase();
  if (tipo === 'acceso') {
    const salio = /cerr|cierre|logout/.test(bajo);
    return `${usuario} ${salio ? 'cerró sesión' : 'ingresó al sistema'}${d && !/^(ingreso|cierre)/i.test(d) ? ` (${d})` : ''}`;
  }
  const verbo = { crear: 'creó', editar: 'modificó', eliminar: 'eliminó', otro: 'realizó una acción' }[tipo];
  const donde = modulo ? ` en ${String(modulo)}` : '';
  return d ? `${usuario} ${verbo}${donde}: ${d}` : `${usuario} ${verbo}${donde}`;
}

function aEvento(e: AuditoriaEntrada, i: number): Evento | null {
  const fecha = e.created_at ? new Date(e.created_at) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) return null;
  const usuario = String(e.usuario ?? '').trim() || 'Sistema';
  const detalle = String(e.detalle ?? '').trim();
  const accion = String(e.accion ?? '').trim();
  const tipo = clasificar(accion, detalle);
  return {
    id: e.id ?? i, fecha, usuario, tipo, accion,
    modulo: [e.modulo, e.submodulo].filter(Boolean).join(' / '),
    texto: frase(usuario, tipo, accion, detalle, e.modulo),
    ip: String(e.ip ?? ''),
  };
}

// Sistema › Auditoría: línea de tiempo por día — quién hizo qué y cuándo.
export function AuditoriaPage() {
  const [vista, setVista] = useState<Vista>('actividad');
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<Tipo>('todos');
  const [persona, setPersona] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const act = useAuditoria({ q: busqueda || undefined });
  const log = useLogFirmado(busqueda || undefined, vista === 'firmado');
  const firmado = vista === 'firmado';
  const { isLoading, isError, error } = firmado ? log : act;

  const eventos = useMemo(() => (act.data ?? []).map(aEvento).filter((e): e is Evento => !!e), [act.data]);
  const personas = useMemo(() => [...new Set(eventos.map(e => e.usuario))].sort((a, b) => a.localeCompare(b, 'es')), [eventos]);

  const visibles = useMemo(() => eventos.filter(e => {
    if (tipo !== 'todos' && e.tipo !== tipo) return false;
    if (persona && e.usuario !== persona) return false;
    const k = clave(e.fecha);
    if (desde && k < desde) return false;
    if (hasta && k > hasta) return false;
    return true;
  }), [eventos, tipo, persona, desde, hasta]);

  const dias = useMemo(() => {
    const m = new Map<string, { fecha: Date; items: Evento[] }>();
    for (const e of visibles) {
      const k = clave(e.fecha);
      if (!m.has(k)) m.set(k, { fecha: e.fecha, items: [] });
      m.get(k)!.items.push(e);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([k, v]) => ({ k, ...v }));
  }, [visibles]);

  const filas: LogFirmado[] = log.data ?? [];
  const hayFiltros = tipo !== 'todos' || !!persona || !!desde || !!hasta || !!busqueda;
  const limpiar = () => { setTipo('todos'); setPersona(''); setDesde(''); setHasta(''); setBusqueda(''); };
  const total = firmado ? filas.length : visibles.length;

  return (
    <Page>
      <PageHeader
        eyebrow="Sistema"
        title="Auditoría"
        subtitle={isLoading ? 'Cargando…' : 'Quién hizo qué y cuándo. Los registros no se pueden editar ni borrar.'}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('sistema/auditoria') },
          ]} />
        }
      />

      <div className="aud-filtros">
        <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar en la actividad" />
        <SegmentedControl<Vista> label="Vista" value={vista} onChange={setVista}
          options={[{ value: 'actividad', label: 'Actividad' }, { value: 'firmado', label: 'Registro firmado' }]} />
        {!firmado && (
          <div className="aud-filtros__fila">
            <SelectInput value={tipo} onChange={e => setTipo(e.target.value as Tipo)} aria-label="Tipo de actividad">
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </SelectInput>
            <SelectInput value={persona} onChange={e => setPersona(e.target.value)} aria-label="Persona">
              <option value="">Todas las personas</option>
              {personas.map(p => <option key={p} value={p}>{p}</option>)}
            </SelectInput>
            <label className="aud-fecha"><span>Desde</span>
              <input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} />
            </label>
            <label className="aud-fecha"><span>Hasta</span>
              <input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} />
            </label>
          </div>
        )}
      </div>

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <>
          <p className="aud-conteo">{total} registro{total !== 1 ? 's' : ''}{hayFiltros && !firmado ? ' con estos filtros' : ''}</p>

          {firmado ? (
            filas.length === 0 ? (
              <EmptyState icon={<ShieldCheck size={22} />} title="Sin registros">No hay mutaciones registradas.</EmptyState>
            ) : (
              <div className="aud-dia">
                <div className="aud-lista">
                  {filas.map(f => <FilaFirmada key={f.id} f={f} />)}
                </div>
              </div>
            )
          ) : dias.length === 0 ? (
            <EmptyState icon={hayFiltros ? <SearchX size={22} /> : <ShieldCheck size={22} />}
              title={hayFiltros ? 'Sin coincidencias' : 'Sin registros'}>
              {hayFiltros
                ? <button type="button" className="placas-limpiar" onClick={limpiar}>Quitar filtros</button>
                : 'Aún no hay actividad registrada.'}
            </EmptyState>
          ) : (
            dias.map(d => (
              <section key={d.k} className="aud-dia">
                <h2 className="aud-dia__titulo">{etiquetaDia(d.fecha)}</h2>
                <div className="aud-lista">
                  {d.items.map(e => {
                    const { Icono, tono } = e.tipo === 'acceso' && /cerr|cierre|logout/i.test(`${e.accion} ${e.texto}`)
                      ? { Icono: LogOut, tono: 'gris' } : ICONO[e.tipo];
                    return (
                      <article key={e.id} className="aud-evento">
                        <span className={`aud-evento__icono aud-evento__icono--${tono}`}><Icono size={17} strokeWidth={2} /></span>
                        <div className="aud-evento__cuerpo">
                          <div className="aud-evento__texto">{e.texto}</div>
                          <div className="aud-evento__meta">
                            {[e.accion, formatFechaHoraPe(e.fecha), e.usuario, e.modulo, e.ip].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </>
      )}
    </Page>
  );
}

function FilaFirmada({ f }: { f: LogFirmado }) {
  const tipo = clasificar(f.accion, f.ruta);
  const { Icono, tono } = ICONO[tipo];
  const fecha = new Date(f.created_at);
  return (
    <article className="aud-evento">
      <span className={`aud-evento__icono aud-evento__icono--${tono}`}><Icono size={17} strokeWidth={2} /></span>
      <div className="aud-evento__cuerpo">
        <div className="aud-evento__texto">{f.usuario || 'Sistema'} · {f.metodo} {f.ruta}</div>
        <div className="aud-evento__meta">
          {[f.accion, formatFechaHoraPe(fecha), f.ip, f.status_codigo ? `HTTP ${f.status_codigo}` : ''].filter(Boolean).join(' · ')}
        </div>
        {(f.antes || f.despues || f.detalle) && (
          <details className="aud-evento__detalle">
            <summary>Antes / después</summary>
            <div><strong>Antes</strong><pre>{f.antes || '—'}</pre></div>
            <div><strong>Después</strong><pre>{f.despues || f.detalle || '—'}</pre></div>
            <code title={f.firma_estado ?? f.firma}>Firma {(f.firma_estado ?? f.firma).slice(0, 12)}</code>
          </details>
        )}
      </div>
    </article>
  );
}
