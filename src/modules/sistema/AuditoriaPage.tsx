import '../mantenimiento/mant.css';
import './auditoria.css';
import { useMemo, useState } from 'react';
import {
  ArrowUpRight, Eye, KeyRound, LogIn, LogOut, Pencil, Plus, SearchX, ShieldCheck, Trash2, type LucideIcon,
} from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { useToast } from '../../core/ui/Toast';
import { FileSpreadsheet } from 'lucide-react';
import { formatFechaHoraPe } from '../../core/lib/format';
import { useLogFirmado, type LogFirmado } from './api';
import {
  etiquetaAccion, etiquetaCampo, useActividadAudit, useAuditoriaEnVivo, usePersonasAudit,
  ENTIDAD_LABELS, ACCION_LABELS, type EventoAudit, type FiltrosAudit,
} from './auditoriaActividad';

type Vista = 'actividad' | 'firmado';

const FILTROS_VACIOS: FiltrosAudit = { q: '', entity: '', action: '', userId: '', from: '', to: '' };

/** Ícono y color según la acción: verde ingresos, rojo borrados y fallos, azul creaciones, ámbar cambios */
function iconoDe(e: EventoAudit): { Icono: LucideIcon; tono: string } {
  const a = e.action;
  if (a === 'LOGIN') return { Icono: LogIn, tono: 'verde' };
  if (a === 'LOGOUT') return { Icono: LogOut, tono: 'gris' };
  if (a === 'LOGIN_FAILED' || a === 'DELETE' || a === 'ANNUL') return { Icono: Trash2, tono: 'rojo' };
  if (a.startsWith('PASSWORD')) return { Icono: KeyRound, tono: 'ambar' };
  if (a === 'CREATE' || a === 'IMPORT') return { Icono: Plus, tono: 'azul' };
  if (a === 'UPDATE' || a === 'CORRECT' || a === 'REOPEN' || a === 'QR_REGENERATE') return { Icono: Pencil, tono: 'ambar' };
  if (a === 'VALIDATE' || a === 'APPROVE') return { Icono: ShieldCheck, tono: 'verde' };
  if (a === 'PAYMENT') return { Icono: Plus, tono: 'azul' };
  return { Icono: Eye, tono: 'gris' };
}

const TZ = 'America/Lima';
const claveDia = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

/** "Hoy", "Ayer" o "Viernes, 16 de octubre" — según el día de Lima */
function etiquetaDia(iso: string): string {
  const clave = claveDia(iso);
  const hoy = claveDia(new Date().toISOString());
  const ayer = claveDia(new Date(Date.now() - 86_400_000).toISOString());
  if (clave === hoy) return 'Hoy';
  if (clave === ayer) return 'Ayer';
  const texto = new Intl.DateTimeFormat('es-PE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Valor legible para la tabla de cambios */
function valorLegible(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatFechaHoraPe(v);
  return String(v);
}

function FilaActividad({ e }: { e: EventoAudit }) {
  const { Icono, tono } = iconoDe(e);
  const cambios = e.changes ? Object.entries(e.changes) : [];
  const creacion = cambios.length > 0 && cambios.every(([, c]) => c.from === null || c.from === undefined);
  return (
    <article className="aud-evento">
      <span className={`aud-evento__icono aud-evento__icono--${tono}`}><Icono size={17} strokeWidth={2} /></span>
      <div className="aud-evento__cuerpo">
        <div className="aud-evento__texto">{e.summary}</div>
        <div className="aud-evento__meta">
          {[etiquetaAccion(e.action), formatFechaHoraPe(e.created_at), e.user_name, e.ip].filter(Boolean).join(' · ')}
        </div>
        {cambios.length > 0 && (
          <details className="aud-evento__detalle">
            <summary>{creacion ? 'Datos del registro' : `Cambios (${cambios.length})`}</summary>
            <table className="aud-cambios">
              <thead>
                <tr><th>Campo</th>{!creacion && <th>Antes</th>}<th>{creacion ? 'Valor' : 'Después'}</th></tr>
              </thead>
              <tbody>
                {cambios.map(([campo, c]) => (
                  <tr key={campo}>
                    <td>{etiquetaCampo(campo)}</td>
                    {!creacion && <td>{valorLegible(c.from)}</td>}
                    <td>{valorLegible(c.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>
    </article>
  );
}

function ActividadAuditoria() {
  const [filtros, setFiltros] = useState<FiltrosAudit>(FILTROS_VACIOS);
  useAuditoriaEnVivo();
  const actividad = useActividadAudit(filtros);
  const personas = usePersonasAudit();
  const eventos = useMemo(() => (actividad.data?.pages ?? []).flatMap(p => p.items), [actividad.data]);
  const total = actividad.data?.pages[0]?.total ?? 0;
  const set = (k: keyof FiltrosAudit) => (v: string) => setFiltros(f => ({ ...f, [k]: v }));
  const hayFiltros = Object.values(filtros).some(Boolean);
  const toast = useToast();

  // Exporta los eventos cargados (los filtros del servidor ya aplicados), con fecha y hora nativas de Lima
  async function exportar() {
    try {
      const aLima = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'America/Lima' });
      await exportarExcel('Auditoria', 'Auditoría', ['ID Evento', 'Fecha y hora', 'Usuario', 'Registro', 'Acción', 'Resumen', 'IP'],
        eventos.map(e => [e.id, aLima(e.created_at), e.user_name || '—', ENTIDAD_LABELS[e.entity] ?? e.entity,
          ACCION_LABELS[e.action] ?? e.action, e.summary || '—', e.ip ?? '']));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  // Agrupa por día de Lima, en el orden que llega (del más reciente al más antiguo)
  const dias = useMemo(() => {
    const grupos: { clave: string; iso: string; items: EventoAudit[] }[] = [];
    for (const e of eventos) {
      const clave = claveDia(e.created_at);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.clave === clave) ultimo.items.push(e);
      else grupos.push({ clave, iso: e.created_at, items: [e] });
    }
    return grupos;
  }, [eventos]);

  return (
    <>
      <div className="aud-filtros">
        <SearchField value={filtros.q} onChange={set('q')} placeholder="Buscar en la actividad" />
        <div className="aud-filtros__fila">
          <SelectInput value={filtros.entity} onChange={e => set('entity')(e.target.value)} aria-label="Tipo de registro">
            <option value="">Todos los registros</option>
            {Object.keys(ENTIDAD_LABELS).map(k => <option key={k} value={k}>{ENTIDAD_LABELS[k]}</option>)}
          </SelectInput>
          <SelectInput value={filtros.action} onChange={e => set('action')(e.target.value)} aria-label="Acción">
            <option value="">Todas las acciones</option>
            {Object.keys(ACCION_LABELS).map(k => <option key={k} value={k}>{ACCION_LABELS[k]}</option>)}
          </SelectInput>
          {(personas.data?.length ?? 0) > 0 && (
            <SelectInput value={filtros.userId} onChange={e => set('userId')(e.target.value)} aria-label="Persona">
              <option value="">Todas las personas</option>
              {personas.data!.map(p => <option key={p.user_id} value={String(p.user_id)}>{p.user_name}</option>)}
            </SelectInput>
          )}
          <label className="aud-fecha"><span>Desde</span>
            <input type="date" value={filtros.from} max={filtros.to || undefined} onChange={e => set('from')(e.target.value)} />
          </label>
          <label className="aud-fecha"><span>Hasta</span>
            <input type="date" value={filtros.to} min={filtros.from || undefined} onChange={e => set('to')(e.target.value)} />
          </label>
          {eventos.length > 0 && <Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={exportar}>Exportar Excel</Button>}
        </div>
      </div>

      {actividad.isLoading ? <PageLoader /> : actividad.isError ? (
        <Notice tone="error">{errorMessage(actividad.error)}</Notice>
      ) : (
        <>
          <p className="aud-conteo">{total} registro{total !== 1 ? 's' : ''}{hayFiltros ? ' con estos filtros' : ''}</p>
          {dias.length === 0 ? (
            <EmptyState icon={hayFiltros ? <SearchX size={22} /> : <ShieldCheck size={22} />}
              title={hayFiltros ? 'Sin coincidencias' : 'Sin registros'}>
              {hayFiltros
                ? <button type="button" className="placas-limpiar" onClick={() => setFiltros(FILTROS_VACIOS)}>Quitar filtros</button>
                : 'Aún no hay actividad registrada.'}
            </EmptyState>
          ) : (
            dias.map(d => (
              <section key={d.clave} className="aud-dia">
                <h2 className="aud-dia__titulo">{etiquetaDia(d.iso)}</h2>
                <div className="aud-lista">
                  {d.items.map(e => <FilaActividad key={e.id} e={e} />)}
                </div>
              </section>
            ))
          )}
          {actividad.hasNextPage && (
            <div className="aud-mas">
              <Button variant="secondary" onClick={() => actividad.fetchNextPage()} loading={actividad.isFetchingNextPage}>
                Cargar más
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function FilaFirmada({ f }: { f: LogFirmado }) {
  const { Icono, tono } = f.accion?.toUpperCase().includes('LOGIN') ? { Icono: LogIn, tono: 'verde' } : { Icono: Eye, tono: 'gris' };
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

function RegistroFirmado({ q }: { q: string }) {
  const log = useLogFirmado(q || undefined, true);
  if (log.isLoading) return <PageLoader />;
  if (log.isError) return <Notice tone="error">{errorMessage(log.error)}</Notice>;
  const filas: LogFirmado[] = log.data ?? [];
  return filas.length === 0 ? (
    <EmptyState icon={<ShieldCheck size={22} />} title="Sin registros">No hay mutaciones registradas.</EmptyState>
  ) : (
    <div className="aud-dia"><div className="aud-lista">{filas.map(f => <FilaFirmada key={f.id} f={f} />)}</div></div>
  );
}

// Sistema › Auditoría: quién hizo qué y cuándo. Solo lectura.
export function AuditoriaPage() {
  const [vista, setVista] = useState<Vista>('actividad');
  const [busqueda, setBusqueda] = useState('');
  return (
    <Page>
      <PageHeader
        eyebrow="Sistema"
        title="Auditoría"
        subtitle="Quién hizo qué y cuándo. Los registros no se pueden editar ni borrar."
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('sistema/auditoria') },
          ]} />
        }
      />
      <div className="aud-filtros">
        <SegmentedControl<Vista> label="Vista" value={vista} onChange={setVista}
          options={[{ value: 'actividad', label: 'Actividad' }, { value: 'firmado', label: 'Registro firmado' }]} />
      </div>
      {vista === 'actividad' ? <ActividadAuditoria /> : (
        <>
          <div className="aud-filtros"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar en el registro firmado" /></div>
          <RegistroFirmado q={busqueda} />
        </>
      )}
    </Page>
  );
}
