import './api-desarrolladores.css';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, History, Link as LinkIcon, Plus, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Switch } from '../../core/ui/Switch';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { formatFechaHoraPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';

interface EventoCatalogo { evento: string; titulo: string }

interface Webhook {
  id: number;
  nombre: string;
  url: string;
  eventos: string[];
  activo: boolean;
  secreto_pista: string;
  creado_por: string | null;
  creado_en: string | null;
  ultimo_envio: string | null;
  ultimo_estado: 'PENDIENTE' | 'ENTREGADO' | 'FALLIDO' | null;
}

interface Envio {
  id: number;
  evento: string;
  estado: 'PENDIENTE' | 'ENTREGADO' | 'FALLIDO';
  intentos: number;
  codigo_http: number | null;
  error: string | null;
  creado_en: string;
  entregado_en: string | null;
}

const ESTADO_ENVIO: Record<Envio['estado'], string> = { PENDIENTE: 'En curso', ENTREGADO: 'Entregado', FALLIDO: 'Fallido' };

/** Copia al portapapeles con confirmación háptica */
async function copiar(texto: string) {
  await navigator.clipboard.writeText(texto);
  haptic('success');
}

function NuevoWebhookSheet({ open, onClose, catalogo, onCreado }: {
  open: boolean; onClose: () => void; catalogo: EventoCatalogo[]; onCreado: (secreto: string) => void;
}) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [url, setUrl] = useState('');
  const [eventos, setEventos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const crear = useMutation({
    mutationFn: () => api<{ ok: boolean; id: number; secreto: string }>('/sistema/webhooks', {
      method: 'POST',
      body: { nombre: nombre.trim(), url: url.trim(), eventos },
    }),
    onSuccess: async r => {
      haptic('success');
      await qc.invalidateQueries({ queryKey: ['sistema', 'webhooks'] });
      setNombre(''); setUrl(''); setEventos([]); setError(null);
      onCreado(r.secreto);
    },
    onError: err => { setError(errorMessage(err)); haptic('warning'); },
  });

  function alternar(v: string) {
    setEventos(s => (s.includes(v) ? s.filter(x => x !== v) : [...s, v]));
  }

  function guardar() {
    if (!nombre.trim()) { setError('Ponle un nombre al webhook.'); return; }
    if (!url.trim()) { setError('Escribe la URL que recibirá los avisos.'); return; }
    if (!eventos.length) { setError('Elige al menos un evento.'); return; }
    setError(null);
    crear.mutate();
  }

  return (
    <Sheet open={open} onClose={() => !crear.isPending && onClose()} title="Nuevo webhook"
      footer={<><Button variant="secondary" onClick={onClose} disabled={crear.isPending}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={crear.isPending}>Crear webhook</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error">{error}</Notice></div>}
        <Field label="Nombre" wide>{p => <TextInput {...p} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Sistema de tesorería" />}</Field>
        <Field label="URL de destino" wide>{p => <TextInput {...p} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://tu-sistema.com/azkell" />}</Field>
        <div className="field field--wide">
          <span className="apigw-etiqueta">Eventos</span>
          <div className="apigw-permisos">
            {catalogo.map(c => (
              <label key={c.evento} className="apigw-permiso">
                <input type="checkbox" checked={eventos.includes(c.evento)} onChange={() => alternar(c.evento)} />
                <span>{c.titulo}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function SecretoSheet({ secreto, onClose }: { secreto: string | null; onClose: () => void }) {
  const toast = useToast();
  return (
    <Sheet open={!!secreto} onClose={onClose} title="Webhook creado"
      footer={<Button variant="primary" onClick={onClose}>Listo</Button>}>
      <p className="apigw-aviso"><ShieldCheck size={16} /> Este es el secreto para verificar las firmas de cada aviso. Guárdalo ahora: no se vuelve a mostrar completo.</p>
      <div className="apigw-token apigw-token--grande">
        <code>{secreto}</code>
        <button type="button" className="apigw-copiar" aria-label="Copiar secreto"
          onClick={() => copiar(secreto ?? '').then(() => toast('Secreto copiado')).catch(() => toast('No se pudo copiar', 'error'))}>
          <Copy size={15} /> Copiar
        </button>
      </div>
    </Sheet>
  );
}

function EnviosSheet({ webhook, onClose }: { webhook: Webhook | null; onClose: () => void }) {
  const envios = useQuery<Envio[]>({
    queryKey: ['sistema', 'webhooks', webhook?.id ?? 0, 'envios'],
    queryFn: () => api(`/sistema/webhooks/${webhook?.id}/envios`),
    enabled: !!webhook,
  });
  const filas = envios.data ?? [];
  return (
    <Sheet open={!!webhook} onClose={onClose} title={`Envíos de ${webhook?.nombre ?? ''}`}
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      {envios.isLoading ? <PageLoader /> : envios.isError ? (
        <Notice tone="error">{errorMessage(envios.error)}</Notice>
      ) : filas.length === 0 ? (
        <p className="apigw-vacio">Este webhook todavía no ha enviado avisos.</p>
      ) : (
        <div className="apigw-tabla-caja">
          <table className="apigw-tabla">
            <thead><tr><th>Cuándo</th><th>Evento</th><th>Estado</th><th>Intentos</th><th>Código</th><th>Detalle</th></tr></thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.id}>
                  <td>{formatFechaHoraPe(f.creado_en)}</td>
                  <td>{f.evento}</td>
                  <td>{ESTADO_ENVIO[f.estado] ?? f.estado}</td>
                  <td>{f.intentos}</td>
                  <td>{f.codigo_http ?? '—'}</td>
                  <td className="apigw-ruta">{f.error ?? (f.entregado_en ? `Entregado ${formatFechaHoraPe(f.entregado_en)}` : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Sheet>
  );
}

function TarjetaWebhook({ w, titulos, onActivo, onProbar, onVerEnvios, onEliminar, probando }: {
  w: Webhook; titulos: Record<string, string>; onActivo: (activo: boolean) => void;
  onProbar: () => void; onVerEnvios: () => void; onEliminar: () => void; probando: boolean;
}) {
  return (
    <article className="apigw-tarjeta">
      <header className="apigw-tarjeta__cab">
        <span className="apigw-icono"><LinkIcon size={18} /></span>
        <div className="apigw-tarjeta__titulo">
          <strong>{w.nombre}</strong>
          <span className="apigw-ruta">{w.url}</span>
        </div>
        <Switch id={`webhook-${w.id}`} checked={w.activo} label={`Activar el webhook ${w.nombre}`}
          onChange={v => onActivo(v)} />
      </header>

      <div className="apigw-chips">
        {w.eventos.map(e => <span key={e} className="apigw-chip">{titulos[e] ?? e}</span>)}
      </div>

      <footer className="apigw-tarjeta__pie">
        <span>Secreto {w.secreto_pista}</span>
        <span>Último envío: {w.ultimo_envio ? formatFechaHoraPe(w.ultimo_envio) : 'nunca'}{w.ultimo_estado ? ` · ${ESTADO_ENVIO[w.ultimo_estado]}` : ''}</span>
        <button type="button" className="apigw-copiar" onClick={onProbar} disabled={probando}>
          <Send size={15} /> {probando ? 'Probando…' : 'Probar'}
        </button>
        <button type="button" className="apigw-copiar" onClick={onVerEnvios}>
          <History size={15} /> Envíos
        </button>
        <button type="button" className="apigw-eliminar" onClick={onEliminar} aria-label={`Eliminar ${w.nombre}`}>
          <Trash2 size={15} /> Eliminar
        </button>
      </footer>
    </article>
  );
}

/** Sistema › API y desarrolladores: webhooks salientes firmados (ver docs/api-webhooks.md). */
export function WebhooksSeccion() {
  const qc = useQueryClient();
  const toast = useToast();
  const catalogo = useQuery<EventoCatalogo[]>({
    queryKey: ['sistema', 'webhooks', 'catalogo'],
    queryFn: () => api('/sistema/webhooks/catalogo'),
    staleTime: Infinity,
  });
  const lista = useQuery<Webhook[]>({ queryKey: ['sistema', 'webhooks'], queryFn: () => api('/sistema/webhooks') });
  const [nuevo, setNuevo] = useState(false);
  const [secreto, setSecreto] = useState<string | null>(null);
  const [verEnvios, setVerEnvios] = useState<Webhook | null>(null);
  const [aEliminar, setAEliminar] = useState<Webhook | null>(null);

  const refrescar = () => qc.invalidateQueries({ queryKey: ['sistema', 'webhooks'] });
  const titulos = Object.fromEntries((catalogo.data ?? []).map(c => [c.evento, c.titulo]));

  const cambiarActivo = useMutation({
    mutationFn: (p: { id: number; activo: boolean }) => api(`/sistema/webhooks/${p.id}`, { method: 'PUT', body: { activo: p.activo } }),
    onSuccess: () => { haptic('success'); refrescar(); },
    onError: err => { toast(errorMessage(err), 'error'); haptic('warning'); },
  });

  const probar = useMutation({
    mutationFn: (id: number) => api<{ ok: boolean; codigo_http: number | null; error: string | null }>(`/sistema/webhooks/${id}/probar`, { method: 'POST' }),
    onSuccess: r => {
      refrescar();
      if (r.ok) toast(`Prueba entregada (respuesta ${r.codigo_http}).`);
      else toast(`No se entregó: ${r.error ?? 'error desconocido'}`, 'error');
    },
    onError: err => { toast(errorMessage(err), 'error'); },
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api(`/sistema/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setAEliminar(null); haptic('success'); toast('Webhook eliminado'); refrescar(); },
    onError: err => { toast(errorMessage(err), 'error'); haptic('warning'); },
  });

  const filas = lista.data ?? [];

  return (
    <section className="apigw-webhooks">
      <div className="apigw-webhooks__cab">
        <div>
          <h2>Webhooks salientes</h2>
          <p className="apigw-vacio">Azkell avisa a tu URL cuando ocurre un evento. Cada aviso va firmado con HMAC-SHA256.</p>
        </div>
        <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setNuevo(true)}>Nuevo webhook</Button>
      </div>

      {lista.isLoading ? <PageLoader /> : lista.isError ? (
        <Notice tone="error">{errorMessage(lista.error)}</Notice>
      ) : filas.length === 0 ? (
        <EmptyState icon={<Send size={22} />} title="Sin webhooks todavía">
          Registra una URL para recibir avisos de órdenes de compra, taller, checklist y vencimientos de flota.
        </EmptyState>
      ) : (
        <div className="apigw-lista">
          {filas.map(w => (
            <TarjetaWebhook key={w.id} w={w} titulos={titulos} probando={probar.isPending && probar.variables === w.id}
              onActivo={activo => cambiarActivo.mutate({ id: w.id, activo })}
              onProbar={() => probar.mutate(w.id)}
              onVerEnvios={() => setVerEnvios(w)}
              onEliminar={() => setAEliminar(w)} />
          ))}
        </div>
      )}

      <NuevoWebhookSheet open={nuevo} onClose={() => setNuevo(false)} catalogo={catalogo.data ?? []}
        onCreado={s => { setNuevo(false); setSecreto(s); }} />
      <SecretoSheet secreto={secreto} onClose={() => setSecreto(null)} />
      <EnviosSheet webhook={verEnvios} onClose={() => setVerEnvios(null)} />
      <ConfirmSheet open={!!aEliminar} onClose={() => !eliminar.isPending && setAEliminar(null)}
        onConfirm={() => aEliminar && eliminar.mutate(aEliminar.id)} loading={eliminar.isPending}
        title={`¿Eliminar ${aEliminar?.nombre ?? 'el webhook'}?`}
        message="Se borra también su historial de envíos. Esta URL dejará de recibir avisos."
        confirmLabel="Eliminar" />
    </section>
  );
}
