import './api-desarrolladores.css';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Copy, Gauge, KeyRound, Plus, ShieldCheck, Trash2, Webhook } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Switch } from '../../core/ui/Switch';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { formatFechaHoraPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { WebhooksSeccion } from './WebhooksSeccion';

interface LlaveApi {
  id: number;
  nombre: string;
  api_key: string;
  cliente_empresa: string | null;
  scopes: string[] | string;
  limite_rpm: number;
  estado: 'activo' | 'inactivo' | 'revocado';
  ultimo_uso: string | null;
  peticiones_total: number;
  creado_por: string | null;
  created_at: string;
}

interface Bitacora {
  endpoint: string;
  metodo: string;
  status_code: number;
  tiempo_ms: number;
  api_key_nombre: string;
  ip: string | null;
  created_at?: string;
}

interface Metricas { total_activas: number; peticiones_historicas: number; logs: Bitacora[] }

/** Permisos que una llave puede tener, con su nombre en español */
const PERMISOS: { value: string; label: string }[] = [
  { value: 'flota:read', label: 'Flota: unidades' },
  { value: 'gps:read', label: 'GPS en vivo' },
  { value: 'ot:read', label: 'Órdenes de trabajo' },
  { value: 'inventario:read', label: 'Stock de almacén' },
  { value: 'guias:read', label: 'Guías de remisión' },
  { value: 'etiquetas:imprimir', label: 'Etiquetadora del almacén' },
];

const ESTADO_LABEL: Record<LlaveApi['estado'], string> = { activo: 'Activa', inactivo: 'Pausada', revocado: 'Revocada' };

function scopesDe(k: LlaveApi): string[] {
  if (Array.isArray(k.scopes)) return k.scopes;
  try { const v = JSON.parse(k.scopes || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

function etiquetaPermiso(v: string): string {
  return PERMISOS.find(p => p.value === v)?.label ?? v;
}

/** Copia al portapapeles con confirmación háptica. Sin avisos emergentes. */
async function copiar(texto: string) {
  await navigator.clipboard.writeText(texto);
  haptic('success');
}

function TarjetaLlave({ k, onEstado, onEliminar }: {
  k: LlaveApi; onEstado: (estado: 'activo' | 'inactivo') => void; onEliminar: () => void;
}) {
  const toast = useToast();
  const activa = k.estado === 'activo';
  const revocada = k.estado === 'revocado';
  const permisos = scopesDe(k);
  return (
    <article className={`apigw-tarjeta${activa ? '' : ' apigw-tarjeta--apagada'}`}>
      <header className="apigw-tarjeta__cab">
        <span className="apigw-icono"><KeyRound size={18} /></span>
        <div className="apigw-tarjeta__titulo">
          <strong>{k.nombre}</strong>
          <span>{k.cliente_empresa || 'Sin cliente asignado'}</span>
        </div>
        <span className={`apigw-pildora apigw-pildora--${activa ? 'ok' : revocada ? 'off' : 'aviso'}`}>{ESTADO_LABEL[k.estado]}</span>
        {!revocada && (
          <Switch id={`llave-${k.id}`} checked={activa} label={`Activar la llave ${k.nombre}`}
            onChange={v => onEstado(v ? 'activo' : 'inactivo')} />
        )}
      </header>

      <div className="apigw-token">
        <code>{k.api_key}</code>
        <button type="button" className="apigw-copiar" aria-label="Copiar token"
          onClick={() => copiar(k.api_key).then(() => toast('Token copiado')).catch(() => toast('No se pudo copiar', 'error'))}>
          <Copy size={15} /> Copiar
        </button>
      </div>

      <div className="apigw-seccion-mini">
        <span className="apigw-etiqueta">Permisos</span>
        <div className="apigw-chips">
          {permisos.length ? permisos.map(s => <span key={s} className="apigw-chip">{etiquetaPermiso(s)}</span>) : <span className="apigw-chip">Sin permisos</span>}
        </div>
      </div>

      <dl className="apigw-datos">
        <div><dt>Límite</dt><dd>{k.limite_rpm}<small> /min</small></dd></div>
        <div><dt>Peticiones</dt><dd>{k.peticiones_total.toLocaleString('es-PE')}</dd></div>
        <div><dt>Último uso</dt><dd className="apigw-datos__texto">{k.ultimo_uso ? formatFechaHoraPe(k.ultimo_uso) : 'Nunca'}</dd></div>
      </dl>

      <footer className="apigw-tarjeta__pie">
        <span>{k.creado_por ? `Creada por ${k.creado_por}` : 'Creada'} · {formatFechaHoraPe(k.created_at)}</span>
        <button type="button" className="apigw-eliminar" onClick={onEliminar} aria-label={`Eliminar ${k.nombre}`}>
          <Trash2 size={15} /> Eliminar
        </button>
      </footer>
    </article>
  );
}

function NuevaLlaveSheet({ open, onClose, onCreada }: { open: boolean; onClose: () => void; onCreada: (token: string) => void }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [cliente, setCliente] = useState('');
  const [scopes, setScopes] = useState<string[]>(['gps:read', 'flota:read']);
  const [rpm, setRpm] = useState('60');
  const [error, setError] = useState<string | null>(null);
  const crear = useMutation({
    mutationFn: () => api<{ ok: boolean; api_key: string }>('/sistema/api-keys', {
      method: 'POST',
      body: { nombre: nombre.trim(), cliente_empresa: cliente.trim(), scopes, limite_rpm: Number(rpm) || 60 },
    }),
    onSuccess: async r => {
      haptic('success');
      await qc.invalidateQueries({ queryKey: ['sistema', 'api-keys'] });
      setNombre(''); setCliente(''); setError(null);
      onCreada(r.api_key);
    },
    onError: err => { setError(errorMessage(err)); haptic('warning'); },
  });

  function alternar(v: string) {
    setScopes(s => s.includes(v) ? s.filter(x => x !== v) : [...s, v]);
  }

  return (
    <Sheet open={open} onClose={() => !crear.isPending && onClose()} title="Nueva llave de API"
      footer={<><Button variant="secondary" onClick={onClose} disabled={crear.isPending}>Cancelar</Button>
        <Button variant="primary" onClick={() => {
          if (!nombre.trim()) { setError('Ponle un nombre a la llave.'); return; }
          if (!scopes.length) { setError('Elige al menos un permiso.'); return; }
          setError(null); crear.mutate();
        }} loading={crear.isPending}>Crear llave</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error">{error}</Notice></div>}
        <Field label="Nombre" wide>{p => <TextInput {...p} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Tablero de flota" />}</Field>
        <Field label="Cliente o empresa" wide>{p => <TextInput {...p} value={cliente} onChange={e => setCliente(e.target.value)} />}</Field>
        <Field label="Límite por minuto">{p => <TextInput {...p} inputMode="numeric" value={rpm} onChange={e => setRpm(e.target.value.replace(/\D/g, ''))} />}</Field>
        <div className="field field--wide">
          <span className="apigw-etiqueta">Permisos</span>
          <div className="apigw-permisos">
            {PERMISOS.map(p => (
              <label key={p.value} className="apigw-permiso">
                <input type="checkbox" checked={scopes.includes(p.value)} onChange={() => alternar(p.value)} />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function TokenCreadoSheet({ token, onClose }: { token: string | null; onClose: () => void }) {
  const toast = useToast();
  return (
    <Sheet open={!!token} onClose={onClose} title="Llave creada"
      footer={<Button variant="primary" onClick={onClose}>Listo</Button>}>
      <p className="apigw-aviso"><ShieldCheck size={16} /> Esta es la única vez que se muestra completa. Guárdala ahora.</p>
      <div className="apigw-token apigw-token--grande">
        <code>{token}</code>
        <button type="button" className="apigw-copiar" onClick={() => copiar(token ?? '').then(() => toast('Token copiado')).catch(() => toast('No se pudo copiar', 'error'))}>
          <Copy size={15} /> Copiar
        </button>
      </div>
    </Sheet>
  );
}

// Sistema › API y desarrolladores: llaves de acceso, uso y bitácora.
export function ApiDesarrolladoresPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const llaves = useQuery<LlaveApi[]>({ queryKey: ['sistema', 'api-keys'], queryFn: () => api('/sistema/api-keys') });
  const metricas = useQuery<Metricas>({ queryKey: ['sistema', 'api-keys', 'metricas'], queryFn: () => api('/sistema/api-keys/metrics') });
  const [nueva, setNueva] = useState(false);
  const [tokenCreado, setTokenCreado] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<LlaveApi | null>(null);

  const cambiarEstado = useMutation({
    mutationFn: (p: { id: number; estado: 'activo' | 'inactivo' }) =>
      api(`/sistema/api-keys/${p.id}/estado`, { method: 'PUT', body: { estado: p.estado } }),
    onSuccess: () => { haptic('success'); qc.invalidateQueries({ queryKey: ['sistema', 'api-keys'] }); },
    onError: err => { toast(errorMessage(err), 'error'); haptic('warning'); },
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api(`/sistema/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setAEliminar(null); haptic('success'); toast('Llave eliminada'); qc.invalidateQueries({ queryKey: ['sistema', 'api-keys'] }); },
    onError: err => { toast(errorMessage(err), 'error'); haptic('warning'); },
  });

  const lista = llaves.data ?? [];
  const logs = useMemo(() => metricas.data?.logs ?? [], [metricas.data]);
  const webhooks = useQuery<{ id: number; activo: boolean }[]>({ queryKey: ['sistema', 'webhooks'], queryFn: () => api('/sistema/webhooks') });
  const [pestana, setPestana] = useState<'llaves' | 'webhooks' | 'peticiones'>('llaves');
  const sinMovimiento = useReducedMotion();
  const webhooksActivos = (webhooks.data ?? []).filter(w => w.activo).length;
  const pestanas: { id: typeof pestana; etiqueta: string; n: number }[] = [
    { id: 'llaves', etiqueta: 'Llaves', n: lista.length },
    { id: 'webhooks', etiqueta: 'Webhooks', n: (webhooks.data ?? []).length },
    { id: 'peticiones', etiqueta: 'Peticiones', n: logs.length },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Sistema"
        title="API y desarrolladores"
        subtitle="Llaves de acceso, webhooks firmados y uso de cada uno."
        actions={pestana === 'llaves' ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => setNueva(true)}>Nueva llave</Button> : undefined}
      />

      <div className="apigw-metricas">
        <div className="apigw-metrica"><span className="apigw-metrica__icono"><KeyRound size={16} /></span><span>Llaves activas</span><strong>{metricas.data?.total_activas ?? '—'}</strong></div>
        <div className="apigw-metrica"><span className="apigw-metrica__icono"><Webhook size={16} /></span><span>Webhooks activos</span><strong>{webhooks.data ? webhooksActivos : '—'}</strong></div>
        <div className="apigw-metrica"><span className="apigw-metrica__icono"><Gauge size={16} /></span><span>Peticiones en total</span><strong>{(metricas.data?.peticiones_historicas ?? 0).toLocaleString('es-PE')}</strong></div>
      </div>

      <div className="apigw-pestanas" role="tablist" aria-label="Secciones de API y desarrolladores">
        {pestanas.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={pestana === t.id}
            className={`apigw-pestana${pestana === t.id ? ' apigw-pestana--on' : ''}`} onClick={() => setPestana(t.id)}>
            {pestana === t.id && (
              <motion.span layoutId="apigw-pestana-fondo" className="apigw-pestana__fondo"
                transition={sinMovimiento ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.35 }} />
            )}
            <span className="apigw-pestana__texto">{t.etiqueta}<em>{t.n}</em></span>
          </button>
        ))}
      </div>

      {pestana === 'llaves' && (
        llaves.isLoading ? <PageLoader /> : llaves.isError ? (
          <Notice tone="error">{errorMessage(llaves.error)}</Notice>
        ) : lista.length === 0 ? (
          <EmptyState icon={<KeyRound size={22} />} title="Sin llaves todavía">
            Crea una llave para que un sistema externo consulte los datos permitidos.
          </EmptyState>
        ) : (
          <div className="apigw-lista">
            {lista.map(k => (
              <TarjetaLlave key={k.id} k={k}
                onEstado={estado => cambiarEstado.mutate({ id: k.id, estado })}
                onEliminar={() => setAEliminar(k)} />
            ))}
          </div>
        )
      )}

      {pestana === 'webhooks' && <WebhooksSeccion />}

      {pestana === 'peticiones' && (
        <section className="apigw-bitacora">
          {logs.length === 0 ? (
            <EmptyState icon={<Activity size={22} />} title="Sin peticiones todavía">
              Aquí aparecerán las consultas que hagan tus llaves, con su respuesta y tiempo.
            </EmptyState>
          ) : (
            <div className="apigw-tabla-caja">
              <table className="apigw-tabla">
                <thead><tr><th>Cuándo</th><th>Llave</th><th>Método</th><th>Ruta</th><th>Respuesta</th><th>Tiempo</th></tr></thead>
                <tbody>
                  {logs.map((l, i) => (
                    <tr key={i}>
                      <td>{l.created_at ? formatFechaHoraPe(l.created_at) : '—'}</td>
                      <td>{l.api_key_nombre}</td>
                      <td><span className="apigw-metodo">{l.metodo}</span></td>
                      <td className="apigw-ruta">{l.endpoint}</td>
                      <td><span className={`apigw-codigo apigw-codigo--${l.status_code < 400 ? 'ok' : 'error'}`}>{l.status_code}</span></td>
                      <td className="apigw-num">{l.tiempo_ms} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <NuevaLlaveSheet open={nueva} onClose={() => setNueva(false)} onCreada={t => { setNueva(false); setTokenCreado(t); }} />
      <TokenCreadoSheet token={tokenCreado} onClose={() => setTokenCreado(null)} />
      <ConfirmSheet open={!!aEliminar} onClose={() => !eliminar.isPending && setAEliminar(null)}
        onConfirm={() => aEliminar && eliminar.mutate(aEliminar.id)} loading={eliminar.isPending}
        title={`¿Eliminar ${aEliminar?.nombre ?? 'la llave'}?`}
        message="Los sistemas que la usan dejarán de tener acceso. No se puede deshacer."
        confirmLabel="Eliminar" />
    </Page>
  );
}
