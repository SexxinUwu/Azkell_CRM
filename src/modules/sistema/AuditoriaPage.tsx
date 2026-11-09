import './auditoriaPage.css';
import '../../core/ui/botonesIcono.css';
import { useEffect, useMemo, useState } from 'react';
import { Ban, CircleSlash, Eye, FileSpreadsheet, History, RefreshCw, ShieldCheck, ShieldAlert, Trash2, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { KpiTarjeta } from '../../core/ui/KpiTarjeta';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { formatSoles } from '../../core/lib/format';
import { MOBILE_QUERY, useMediaQuery } from '../../core/lib/useMediaQuery';
import { useLogFirmado, type LogFirmado } from './api';
import {
  diaLima, ETIQUETA_CATEGORIA, fechaLima, haceCuanto, todosLosEventos, useAnulaciones, useDetalleEvento, useEventos, useFiltrosEventos, useResumenEventos,
  type Anulacion, type CategoriaEvento, type FiltrosEventos,
} from './auditoriaApi';

// Sistema › Auditoría: quién hizo qué y cuándo. Solo lectura. Tres vistas:
//  · Actividad: lo que hicieron las personas, en lenguaje claro (sin el ruido de las consultas automáticas).
//  · Anulaciones y rechazos: órdenes y salidas anuladas o rechazadas, con quién y a qué hora (hora de Lima).
//  · Registro firmado: cada petición que modificó datos, con su firma de integridad.

type Vista = 'actividad' | 'anulaciones' | 'firmado';
const TABLA_QUERY = '(min-width: 768px)';
const TAMANOS = [25, 50, 100];

const COLORES = ['#6366f1', '#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#0284c7', '#14b8a6', '#e11d48'];
const colorDe = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffff; return COLORES[Math.abs(h) % COLORES.length]; };
const iniciales = (s: string) => { const p = s.trim().split(/[\s@._-]+/).filter(Boolean); return (p.length >= 2 ? p[0][0] + p[1][0] : (p[0] || 'A').slice(0, 2)).toUpperCase(); };

const COL_ACTIVIDAD: ColumnaTabla[] = [
  { id: 'fecha', titulo: 'Fecha y hora', ancho: 168 },
  { id: 'usuario', titulo: 'Usuario', ancho: 220 },
  { id: 'accion', titulo: 'Acción', ancho: 116 },
  { id: 'modulo', titulo: 'Módulo', ancho: 150 },
  { id: 'detalle', titulo: 'Qué hizo', ancho: 460 },
  { id: 'ver', titulo: 'Ver', ancho: 64, minimo: 56, alinear: 'center' },
];
const COL_ANULACIONES: ColumnaTabla[] = [
  { id: 'doc', titulo: 'Documento', ancho: 150 },
  { id: 'tipo', titulo: 'Tipo', ancho: 140 },
  { id: 'estado', titulo: 'Estado', ancho: 110, alinear: 'center' },
  { id: 'contraparte', titulo: 'Proveedor / destino', ancho: 220 },
  { id: 'total', titulo: 'Total (S/)', ancho: 112, alinear: 'right' },
  { id: 'quien', titulo: 'Anulada / rechazada por', ancho: 220 },
  { id: 'cuando', titulo: 'Fecha y hora', ancho: 168 },
  { id: 'motivo', titulo: 'Motivo o comentario', ancho: 280 },
  { id: 'creada', titulo: 'Creada por', ancho: 200 },
];
const COL_FIRMADO: ColumnaTabla[] = [
  { id: 'fecha', titulo: 'Fecha y hora', ancho: 168 },
  { id: 'usuario', titulo: 'Usuario', ancho: 210 },
  { id: 'metodo', titulo: 'Método', ancho: 86 },
  { id: 'ruta', titulo: 'Ruta', ancho: 420 },
  { id: 'http', titulo: 'HTTP', ancho: 70, alinear: 'center' },
  { id: 'firma', titulo: 'Firma', ancho: 130 },
];

function EtiquetaCategoria({ c }: { c: CategoriaEvento }) {
  return <span className={`aud2-cat aud2-cat--${c}`}>{ETIQUETA_CATEGORIA[c]}</span>;
}

function Persona({ nombre }: { nombre: string }) {
  return (
    <div className="aud2-usuario">
      <span className="aud2-avatar" style={{ background: colorDe(nombre) }} aria-hidden>{iniciales(nombre)}</span>
      <span className="aud2-nombre" title={nombre}>{nombre}</span>
    </div>
  );
}

function Fecha({ iso }: { iso: string | null }) {
  const rel = haceCuanto(iso);
  return <span className="aud2-fecha">{fechaLima(iso)}{rel && <span className="aud2-rel">{rel}</span>}</span>;
}

/** Valor legible dentro del antes/después */
function valor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function Cambios({ antes, despues }: { antes: Record<string, unknown> | string | null; despues: Record<string, unknown> | string | null }) {
  if (!antes && !despues) return null;
  if (typeof antes === 'object' && antes && typeof despues === 'object' && despues) {
    const claves = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter(k => valor(antes[k]) !== valor(despues[k]));
    if (claves.length) {
      return (
        <table className="aud2-diff">
          <thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead>
          <tbody>{claves.map(k => <tr key={k}><td>{k}</td><td>{valor(antes[k])}</td><td>{valor(despues[k])}</td></tr>)}</tbody>
        </table>
      );
    }
  }
  const txt = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  return (
    <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
      {antes ? <div><strong className="t-footnote">Antes</strong><pre className="aud2-pre">{txt(antes)}</pre></div> : null}
      {despues ? <div><strong className="t-footnote">Después</strong><pre className="aud2-pre">{txt(despues)}</pre></div> : null}
    </div>
  );
}

function DetalleSheet({ uid, onClose }: { uid: string | null; onClose: () => void }) {
  const q = useDetalleEvento(uid);
  const e = q.data;
  const firmaOk = e?.firma ? !/inv|mal|alter|fall/i.test(e.firma) : null;
  return (
    <Sheet open={!!uid} onClose={onClose} title={e ? ETIQUETA_CATEGORIA[e.categoria] + ' · ' + e.modulo : 'Detalle del evento'}>
      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : e && (
        <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
          <p className="t-callout" style={{ margin: 0, fontWeight: 600 }}>{e.descripcion}</p>
          <div className="aud2-campos">
            <div className="aud2-campo"><span className="aud2-campo__k">Fecha y hora (Lima)</span><span className="aud2-campo__v">{fechaLima(e.fecha)}</span></div>
            <div className="aud2-campo"><span className="aud2-campo__k">Usuario</span><span className="aud2-campo__v">{e.usuario}</span></div>
            <div className="aud2-campo"><span className="aud2-campo__k">Correo / documento</span><span className="aud2-campo__v">{e.correo || '—'}</span></div>
            <div className="aud2-campo"><span className="aud2-campo__k">Dirección IP</span><span className="aud2-campo__v">{e.ip || '—'}</span></div>
            <div className="aud2-campo"><span className="aud2-campo__k">Petición</span><span className="aud2-campo__v" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{e.metodo} {e.ruta}</span></div>
            <div className="aud2-campo"><span className="aud2-campo__k">Resultado</span><span className="aud2-campo__v">{e.status && e.status >= 400 ? `Con error (HTTP ${e.status})` : 'Correcto'}</span></div>
          </div>
          {e.firma && (
            <span className={`aud2-firma ${firmaOk ? 'aud2-firma--ok' : 'aud2-firma--mal'}`}>
              {firmaOk ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />} Firma {e.firma}{e.firmaHash ? ` · ${e.firmaHash}` : ''}
            </span>
          )}
          {(e.antes || e.despues) && <div><h3 className="t-headline" style={{ margin: '0 0 var(--s-2)' }}>Qué cambió</h3><Cambios antes={e.antes} despues={e.despues} /></div>}
          {e.cuerpo && <div><h3 className="t-headline" style={{ margin: '0 0 var(--s-2)' }}>Datos enviados</h3><pre className="aud2-pre">{typeof e.cuerpo === 'string' ? e.cuerpo : JSON.stringify(e.cuerpo, null, 2)}</pre></div>}
        </div>
      )}
    </Sheet>
  );
}

function Paginacion({ pagina, total, tamano, onPagina, onTamano }: { pagina: number; total: number; tamano: number; onPagina: (p: number) => void; onTamano: (n: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const desde = total === 0 ? 0 : (pagina - 1) * tamano + 1;
  const hasta = Math.min(pagina * tamano, total);
  return (
    <nav className="aud2-pag" aria-label="Páginas">
      <span>Mostrando {desde}–{hasta} de {total.toLocaleString('es-PE')}</span>
      <div className="aud2-pag__botones">
        <SelectInput aria-label="Filas por página" value={tamano} onChange={e => onTamano(Number(e.target.value))} style={{ width: 'auto' }}>
          {TAMANOS.map(n => <option key={n} value={n}>{n} por página</option>)}
        </SelectInput>
        <Button size="sm" variant="secondary" disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>‹ Anterior</Button>
        <span>Pág. <b>{pagina}</b> / {paginas}</span>
        <Button size="sm" variant="secondary" disabled={pagina >= paginas} onClick={() => onPagina(pagina + 1)}>Siguiente ›</Button>
      </div>
    </nav>
  );
}

// ───────── Actividad ─────────

const FILTROS_INICIALES = (): FiltrosEventos => ({ q: '', modulo: '', usuario: '', categoria: '', from: diaLima(-6), to: diaLima(0) });

function Actividad({ esTabla }: { esTabla: boolean }) {
  const toast = useToast();
  const [f, setF] = useState<FiltrosEventos>(FILTROS_INICIALES);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [detalle, setDetalle] = useState<string | null>(null);
  const eventos = useEventos(f, pagina, tamano);
  const resumen = useResumenEventos(f);
  const filtros = useFiltrosEventos();
  const qc = useQueryClient();
  const set = <K extends keyof FiltrosEventos>(k: K, v: FiltrosEventos[K]) => { setF(a => ({ ...a, [k]: v })); setPagina(1); };
  const items = eventos.data?.items ?? [];
  const total = eventos.data?.total ?? 0;
  const por = resumen.data?.por ?? {};

  async function exportar() {
    try {
      const todos = await todosLosEventos(f);
      await exportarExcel('Auditoria', 'Actividad', ['ID', 'Fecha y hora (Lima)', 'Usuario', 'Acción', 'Módulo', 'Qué hizo', 'IP'],
        todos.map(e => [e.uid, fechaLima(e.fecha), e.usuario, ETIQUETA_CATEGORIA[e.categoria], e.modulo, e.descripcion, e.ip ?? '']));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <>
      <div className="inv-kpis" style={{ marginBottom: 'var(--s-4)' }}>
        <KpiTarjeta etiqueta="Eventos" valor={(resumen.data?.total ?? 0).toLocaleString('es-PE')} sub="En el filtro" icono={<History size={18} />}
          onClick={() => set('categoria', '')} activo={f.categoria === ''} />
        <KpiTarjeta etiqueta="Anulaciones y rechazos" valor={String((por.anulo ?? 0) + (por.rechazo ?? 0))} sub="Requieren revisión" icono={<Ban size={18} />} tono="warning"
          onClick={() => set('categoria', f.categoria === 'anulo' ? '' : 'anulo')} activo={f.categoria === 'anulo'} />
        <KpiTarjeta etiqueta="Eliminaciones" valor={String(por.elimino ?? 0)} sub="Registros borrados" icono={<Trash2 size={18} />}
          onClick={() => set('categoria', f.categoria === 'elimino' ? '' : 'elimino')} activo={f.categoria === 'elimino'} />
        <KpiTarjeta etiqueta="Personas activas" valor={String(resumen.data?.personas ?? 0)} sub="Con actividad en el filtro" icono={<Users size={18} />} tono="valor" />
      </div>

      <div className="aud2-filtros">
        <SearchField value={f.q} onChange={v => set('q', v)} placeholder="Buscar por persona, código (ENT-2026-…), módulo o detalle" />
        <div className="aud2-fila">
          <div className="aud2-fechas">
            <TextInput type="date" aria-label="Desde" value={f.from} max={f.to || undefined} onChange={e => set('from', e.target.value)} />
            <span className="t-footnote c-secondary">a</span>
            <TextInput type="date" aria-label="Hasta" value={f.to} min={f.from || undefined} onChange={e => set('to', e.target.value)} />
            <button type="button" className="aud2-quitar" aria-label="Quitar fechas" onClick={() => { setF(a => ({ ...a, from: '', to: '' })); setPagina(1); }}>×</button>
          </div>
          <SelectInput aria-label="Módulo" value={f.modulo} onChange={e => set('modulo', e.target.value)}>
            <option value="">Todos los módulos</option>
            {(filtros.data?.modulos ?? []).map(m => <option key={m.valor} value={m.valor}>{m.etiqueta} ({m.n})</option>)}
          </SelectInput>
          <SelectInput aria-label="Persona" value={f.usuario} onChange={e => set('usuario', e.target.value)}>
            <option value="">Todas las personas</option>
            {(filtros.data?.personas ?? []).map(p => <option key={p.valor} value={p.valor}>{p.valor} ({p.n})</option>)}
          </SelectInput>
          <SelectInput aria-label="Acción" value={f.categoria} onChange={e => set('categoria', e.target.value as FiltrosEventos['categoria'])}>
            <option value="">Todas las acciones</option>
            {(Object.keys(ETIQUETA_CATEGORIA) as CategoriaEvento[]).map(c => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}
          </SelectInput>
          <span className="badge aud2-contador">{total.toLocaleString('es-PE')} {total === 1 ? 'evento' : 'eventos'}</span>
          <div className="oc-acciones" style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn--secondary btn--icon btn-tip btn-tip--verde" data-tip="Exportar a Excel" aria-label="Exportar a Excel" onClick={exportar} disabled={total === 0}><FileSpreadsheet size={17} /></button>
            <button type="button" className="btn btn--secondary btn--icon btn-tip btn-tip--celeste" data-tip="Actualizar" aria-label="Actualizar"
              onClick={() => { void qc.invalidateQueries({ queryKey: ['auditoria'] }); }}><RefreshCw size={17} /></button>
          </div>
        </div>
      </div>

      {eventos.isLoading ? <PageLoader /> : eventos.isError ? <Notice tone="error">{errorMessage(eventos.error)}</Notice> : items.length === 0 ? (
        <EmptyState icon={<CircleSlash size={22} />} title="Ningún evento coincide">
          <Button variant="plain" onClick={() => { setF({ q: '', modulo: '', usuario: '', categoria: '', from: '', to: '' }); setPagina(1); }}>Quitar filtros</Button>
        </EmptyState>
      ) : esTabla ? (
        <TablaRedimensionable id="auditoria-actividad" columnas={COL_ACTIVIDAD} ariaLabel="Actividad del sistema" altoMax="64vh">
          {items.map(e => (
            <tr key={e.uid}>
              <Celda><Fecha iso={e.fecha} /></Celda>
              <Celda><Persona nombre={e.usuario} /></Celda>
              <Celda><EtiquetaCategoria c={e.categoria} /></Celda>
              <Celda>{e.modulo}</Celda>
              <Celda><span className="aud2-texto" title={e.descripcion}>{e.descripcion}</span><span className="aud2-ruta">{e.metodo} {e.ruta}</span></Celda>
              <Celda alinear="center"><button type="button" className="aud2-ver btn-tip" data-tip="Ver detalle" aria-label={`Ver detalle del evento ${e.uid}`} onClick={() => setDetalle(e.uid)}><Eye size={16} /></button></Celda>
            </tr>
          ))}
        </TablaRedimensionable>
      ) : (
        <div className="aud2-tarjetas">
          {items.map(e => (
            <button key={e.uid} type="button" className="aud2-tarjeta pressable" onClick={() => setDetalle(e.uid)}>
              <div className="aud2-tarjeta__cabeza"><EtiquetaCategoria c={e.categoria} /><Fecha iso={e.fecha} /></div>
              <span className="aud2-texto" style={{ WebkitLineClamp: 3 }}>{e.descripcion}</span>
              <div className="aud2-tarjeta__pie"><Persona nombre={e.usuario} /><span>{e.modulo}</span></div>
            </button>
          ))}
        </div>
      )}
      {total > 0 && <Paginacion pagina={pagina} total={total} tamano={tamano} onPagina={setPagina} onTamano={n => { setTamano(n); setPagina(1); }} />}
      <DetalleSheet uid={detalle} onClose={() => setDetalle(null)} />
    </>
  );
}

// ───────── Anulaciones y rechazos ─────────

function Anulaciones({ esTabla }: { esTabla: boolean }) {
  const toast = useToast();
  const q = useAnulaciones(true);
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const qc = useQueryClient();

  const filas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return (q.data ?? []).filter(a => {
      if (tipo && a.tipo !== tipo) return false;
      if (estado && a.estado !== estado) return false;
      const dia = (a.cuando ?? a.creadaEn ?? '').slice(0, 10);
      if (desde && dia < desde) return false;
      if (hasta && dia > hasta) return false;
      if (t && ![a.codigo, a.contraparte, a.porQuien, a.creadoPor, a.motivo].join(' ').toLowerCase().includes(t)) return false;
      return true;
    });
  }, [q.data, busqueda, tipo, estado, desde, hasta]);
  useEffect(() => { setPagina(1); }, [busqueda, tipo, estado, desde, hasta]);

  const pag = filas.slice((pagina - 1) * tamano, pagina * tamano);
  const kpis = useMemo(() => ({
    anuladas: filas.filter(a => a.estado === 'Anulada').length,
    rechazadas: filas.filter(a => a.estado === 'Rechazada').length,
    monto: filas.reduce((s, a) => s + a.total, 0),
    sinRegistro: filas.filter(a => !a.conRegistro).length,
  }), [filas]);

  async function exportar() {
    try {
      await exportarExcel('Anulaciones_y_rechazos', 'Anulaciones y rechazos',
        ['Documento', 'Tipo', 'Estado', 'Proveedor / destino', 'Total (S/)', 'Anulada o rechazada por', 'Fecha y hora (Lima)', 'Motivo o comentario', 'Creada por'],
        filas.map(a => [a.codigo, a.tipo, a.estado, a.contraparte, a.total, a.porQuien ?? 'Sin registro', a.cuando ? fechaLima(a.cuando) : 'Sin registro', a.motivo, a.creadoPor]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const Quien = ({ a }: { a: Anulacion }) => (a.porQuien ? <Persona nombre={a.porQuien} /> : <span className="aud2-sin">Sin registro</span>);
  const Cuando = ({ a }: { a: Anulacion }) => (a.cuando ? <Fecha iso={a.cuando} /> : <span className="aud2-sin">Sin registro</span>);
  const Estado = ({ a }: { a: Anulacion }) => <span className={`aud2-cat aud2-cat--${a.estado === 'Anulada' ? 'anulada' : 'rechazada'}`}>{a.estado}</span>;

  return (
    <>
      <div className="inv-kpis" style={{ marginBottom: 'var(--s-4)' }}>
        <KpiTarjeta etiqueta="Anuladas" valor={String(kpis.anuladas)} sub="En el filtro" icono={<Ban size={18} />} tono="warning" onClick={() => setEstado(estado === 'Anulada' ? '' : 'Anulada')} activo={estado === 'Anulada'} />
        <KpiTarjeta etiqueta="Rechazadas" valor={String(kpis.rechazadas)} sub="Por Gerencia" icono={<CircleSlash size={18} />} onClick={() => setEstado(estado === 'Rechazada' ? '' : 'Rechazada')} activo={estado === 'Rechazada'} />
        <KpiTarjeta etiqueta="Monto involucrado (S/)" valor={formatSoles(kpis.monto)} sub="Suma de los documentos" icono={<History size={18} />} tono="valor" />
        <KpiTarjeta etiqueta="Sin registro de quién" valor={String(kpis.sinRegistro)} sub="Anteriores a la auditoría" icono={<ShieldAlert size={18} />} />
      </div>

      <div className="aud2-filtros">
        <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar por documento, proveedor, persona o motivo" />
        <div className="aud2-fila">
          <div className="aud2-fechas">
            <TextInput type="date" aria-label="Desde" value={desde} onChange={e => setDesde(e.target.value)} />
            <span className="t-footnote c-secondary">a</span>
            <TextInput type="date" aria-label="Hasta" value={hasta} onChange={e => setHasta(e.target.value)} />
            <button type="button" className="aud2-quitar" aria-label="Quitar fechas" onClick={() => { setDesde(''); setHasta(''); }}>×</button>
          </div>
          <SelectInput aria-label="Tipo de documento" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="">Todos los tipos</option><option>Orden de compra</option><option>Orden de servicio</option><option>Salida</option>
          </SelectInput>
          <SelectInput aria-label="Estado" value={estado} onChange={e => setEstado(e.target.value)}>
            <option value="">Anuladas y rechazadas</option><option value="Anulada">Solo anuladas</option><option value="Rechazada">Solo rechazadas</option>
          </SelectInput>
          <span className="badge aud2-contador">{filas.length} {filas.length === 1 ? 'documento' : 'documentos'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn--secondary btn--icon btn-tip btn-tip--verde" data-tip="Exportar a Excel" aria-label="Exportar a Excel" onClick={exportar} disabled={!filas.length}><FileSpreadsheet size={17} /></button>
            <button type="button" className="btn btn--secondary btn--icon btn-tip btn-tip--celeste" data-tip="Actualizar" aria-label="Actualizar" onClick={() => { void qc.invalidateQueries({ queryKey: ['auditoria', 'anulaciones'] }); }}><RefreshCw size={17} /></button>
          </div>
        </div>
      </div>

      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : filas.length === 0 ? (
        <EmptyState icon={<CircleSlash size={22} />} title="Ningún documento coincide">Prueba quitando algún filtro.</EmptyState>
      ) : esTabla ? (
        <TablaRedimensionable id="auditoria-anulaciones" columnas={COL_ANULACIONES} ariaLabel="Anulaciones y rechazos" altoMax="64vh">
          {pag.map(a => (
            <tr key={a.codigo}>
              <Celda><span className="aud2-codigo">{a.codigo}</span></Celda>
              <Celda>{a.tipo}</Celda>
              <Celda alinear="center"><Estado a={a} /></Celda>
              <Celda>{a.contraparte || '—'}</Celda>
              <Celda alinear="right"><span className="aud2-importe">{formatSoles(a.total)}</span></Celda>
              <Celda><Quien a={a} /></Celda>
              <Celda><Cuando a={a} /></Celda>
              <Celda><span className="aud2-texto" title={a.motivo}>{a.motivo || '—'}</span></Celda>
              <Celda>{a.creadoPor || '—'}</Celda>
            </tr>
          ))}
        </TablaRedimensionable>
      ) : (
        <div className="aud2-tarjetas">
          {pag.map(a => (
            <article key={a.codigo} className="aud2-tarjeta" style={{ cursor: 'default' }}>
              <div className="aud2-tarjeta__cabeza"><span className="aud2-codigo">{a.codigo}</span><Estado a={a} /></div>
              <span className="t-footnote c-secondary">{a.tipo}{a.contraparte ? ` · ${a.contraparte}` : ''} · <b>{formatSoles(a.total)}</b></span>
              {a.motivo && <span className="aud2-texto" style={{ WebkitLineClamp: 3 }}>{a.motivo}</span>}
              <div className="aud2-tarjeta__pie"><Quien a={a} /><Cuando a={a} /></div>
            </article>
          ))}
        </div>
      )}
      {filas.length > 0 && <Paginacion pagina={pagina} total={filas.length} tamano={tamano} onPagina={setPagina} onTamano={n => { setTamano(n); setPagina(1); }} />}
    </>
  );
}

// ───────── Registro firmado ─────────

function RegistroFirmado({ esTabla }: { esTabla: boolean }) {
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const q = useLogFirmado(busqueda || undefined, true);
  const filas: LogFirmado[] = q.data ?? [];
  useEffect(() => { setPagina(1); }, [busqueda]);
  const pag = filas.slice((pagina - 1) * tamano, pagina * tamano);
  const firmaOk = (f: LogFirmado) => !/inv|mal|alter|fall/i.test(String(f.firma_estado ?? 'ok'));
  return (
    <>
      <div className="aud2-filtros"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar en el registro firmado (persona, ruta…)" /></div>
      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : filas.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={22} />} title="Sin registros">No hay mutaciones registradas.</EmptyState>
      ) : esTabla ? (
        <TablaRedimensionable id="auditoria-firmado" columnas={COL_FIRMADO} ariaLabel="Registro firmado" altoMax="64vh">
          {pag.map(f => (
            <tr key={f.id}>
              <Celda><Fecha iso={f.created_at ? `${String(f.created_at).replace(' ', 'T')}${/Z|[+-]\d\d:?\d\d$/.test(String(f.created_at)) ? '' : 'Z'}` : null} /></Celda>
              <Celda><Persona nombre={f.usuario || 'Sistema'} /></Celda>
              <Celda mono>{f.metodo}</Celda>
              <Celda mono>{f.ruta}</Celda>
              <Celda alinear="center">{f.status_codigo ?? '—'}</Celda>
              <Celda><span className={`aud2-firma ${firmaOk(f) ? 'aud2-firma--ok' : 'aud2-firma--mal'}`}>{firmaOk(f) ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}{firmaOk(f) ? 'Íntegra' : 'Revisar'}</span></Celda>
            </tr>
          ))}
        </TablaRedimensionable>
      ) : (
        <div className="aud2-tarjetas">
          {pag.map(f => (
            <article key={f.id} className="aud2-tarjeta" style={{ cursor: 'default' }}>
              <div className="aud2-tarjeta__cabeza"><span className="aud2-fecha">{f.metodo}</span><span className={`aud2-firma ${firmaOk(f) ? 'aud2-firma--ok' : 'aud2-firma--mal'}`}>{firmaOk(f) ? 'Íntegra' : 'Revisar'}</span></div>
              <span className="aud2-ruta" style={{ whiteSpace: 'normal' }}>{f.ruta}</span>
              <div className="aud2-tarjeta__pie"><Persona nombre={f.usuario || 'Sistema'} /><span>HTTP {f.status_codigo ?? '—'}</span></div>
            </article>
          ))}
        </div>
      )}
      {filas.length > 0 && <Paginacion pagina={pagina} total={filas.length} tamano={tamano} onPagina={setPagina} onTamano={n => { setTamano(n); setPagina(1); }} />}
    </>
  );
}

export function AuditoriaPage() {
  const [vista, setVista] = useState<Vista>('actividad');
  const esTabla = useMediaQuery(TABLA_QUERY);
  const movil = useMediaQuery(MOBILE_QUERY);
  return (
    <Page>
      <PageHeader eyebrow="Sistema" title="Auditoría" subtitle="Quién hizo qué y cuándo, en hora de Lima. Los registros no se pueden editar ni borrar." />
      <div style={{ marginBottom: 'var(--s-4)' }}>
        <SegmentedControl<Vista> label="Vista de auditoría" block={movil} value={vista} onChange={setVista}
          options={[{ value: 'actividad', label: 'Actividad' }, { value: 'anulaciones', label: 'Anulaciones y rechazos' }, { value: 'firmado', label: 'Registro firmado' }]} />
      </div>
      {vista === 'actividad' && <Actividad esTabla={esTabla} />}
      {vista === 'anulaciones' && <Anulaciones esTabla={esTabla} />}
      {vista === 'firmado' && <RegistroFirmado esTabla={esTabla} />}
    </Page>
  );
}
