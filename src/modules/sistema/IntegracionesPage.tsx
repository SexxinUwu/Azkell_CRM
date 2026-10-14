import '../mantenimiento/mant.css';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CheckCircle2, CircleAlert, MapPin, ShieldCheck, Zap } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, PasswordInput, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';

interface Fila { clave: string; valor: string | null; actualizado_por: string | null; actualizado_en: string | null }

const fecha = (s: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

type Resultado = { ok: boolean; texto: string } | null;

// Sistema › Integraciones: credenciales de Wialon (GPS) y SUNAT (guías electrónicas).
export function IntegracionesPage() {
  const q = useQuery<Fila[]>({
    queryKey: ['sistema', 'integraciones-cfg'],
    queryFn: () => api<Fila[]>('/integraciones').then(r => (Array.isArray(r) ? r : [])),
  });

  return (
    <Page narrow>
      <PageHeader
        eyebrow="Configuración"
        title="Integraciones"
        subtitle="Servicios externos que usa el sistema"
        actions={<MenuOtros opciones={[{ label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('sistema/integraciones') }]} />}
      />
      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
          <Wialon filas={q.data ?? []} />
          <Sunat filas={q.data ?? []} />
        </div>
      )}
    </Page>
  );
}

const valorDe = (filas: Fila[], clave: string) => filas.find(f => f.clave === clave)?.valor ?? '';
const metaDe = (filas: Fila[], clave: string) => {
  const f = filas.find(x => x.clave === clave);
  return f?.actualizado_por ? `Guardado por ${f.actualizado_por} — ${fecha(f.actualizado_en)}` : '';
};

function useGuardar() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return async (pares: Array<[string, string]>) => {
    await Promise.all(pares.map(([clave, valor]) =>
      api('/integraciones', { method: 'PUT', body: { clave, valor: valor.trim(), actualizado_por: user?.email ?? '' } })));
    await qc.invalidateQueries({ queryKey: ['sistema', 'integraciones-cfg'] });
  };
}

function Tarjeta({ icono, titulo, estado, meta, children }: {
  icono: React.ReactNode; titulo: string; estado: 'ok' | 'pendiente' | 'error'; meta?: string; children: React.ReactNode;
}) {
  return (
    <section className="tarjeta__lista" style={{ padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
        <span style={{ color: 'var(--accent)' }}>{icono}</span>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 700 }}>{titulo}</h2>
          {meta && <div className="t-footnote c-secondary">{meta}</div>}
        </div>
        <span className={`ot-estado ot-estado--${estado === 'ok' ? 'green' : estado === 'error' ? 'red' : 'neutral'}`}>
          {estado === 'ok' ? 'Configurado' : estado === 'error' ? 'Con error' : 'Sin configurar'}
        </span>
      </div>
      {children}
    </section>
  );
}

function Wialon({ filas }: { filas: Fila[] }) {
  const toast = useToast();
  const guardar = useGuardar();
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [res, setRes] = useState<Resultado>(null);

  useEffect(() => { setToken(valorDe(filas, 'wialon_token')); setUrl(valorDe(filas, 'wialon_url')); }, [filas]);

  async function guardarYProbar(probar: boolean) {
    setOcupado(true); setRes(null);
    try {
      await guardar([['wialon_token', token], ['wialon_url', url]]);
      haptic('success'); toast('Wialon guardado');
      if (probar) {
        const r = await api<{ data?: unknown[] | { error?: string } }>('/script/obtenerDatosWialon', { method: 'POST', body: {} });
        const d = r.data;
        if (d && !Array.isArray(d) && d.error) throw new Error(d.error);
        setRes({ ok: true, texto: `Conectado — ${Array.isArray(d) ? d.length : 0} unidades encontradas` });
      }
    } catch (err) { setRes({ ok: false, texto: errorMessage(err) }); haptic('warning'); }
    finally { setOcupado(false); }
  }

  return (
    <Tarjeta icono={<MapPin size={22} />} titulo="Wialon · GPS" estado={res && !res.ok ? 'error' : token ? 'ok' : 'pendiente'} meta={metaDe(filas, 'wialon_token')}>
      <Field label="Token de acceso" hint="Se obtiene en Wialon › Mi cuenta › Tokens">{p => <PasswordInput {...p} value={token} onChange={e => setToken(e.target.value)} autoComplete="off" />}</Field>
      <Field label="URL del servidor" hint="Déjalo vacío para usar el predeterminado">{p => <TextInput {...p} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://hst-api.wialon.com" />}</Field>
      {res && <Notice tone={res.ok ? 'success' : 'error'} icon={res.ok ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}>{res.texto}</Notice>}
      <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={() => guardarYProbar(false)} disabled={ocupado}>Guardar</Button>
        <Button variant="primary" icon={<Zap size={16} />} onClick={() => guardarYProbar(true)} loading={ocupado}>Guardar y probar conexión</Button>
      </div>
    </Tarjeta>
  );
}

function Sunat({ filas }: { filas: Fila[] }) {
  const toast = useToast();
  const guardar = useGuardar();
  const [v, setV] = useState({ ruc: '', usuario: '', clave: '', id: '', secreto: '' });
  const [ocupado, setOcupado] = useState(false);
  const [res, setRes] = useState<Resultado>(null);

  useEffect(() => {
    setV({
      ruc: valorDe(filas, 'sunat_ruc_emisor'), usuario: valorDe(filas, 'sunat_usuario_sol'), clave: valorDe(filas, 'sunat_clave_sol'),
      id: valorDe(filas, 'sunat_client_id'), secreto: valorDe(filas, 'sunat_client_secret'),
    });
  }, [filas]);

  async function guardarYProbar(probar: boolean) {
    setOcupado(true); setRes(null);
    try {
      await guardar([
        ['sunat_ruc_emisor', v.ruc], ['sunat_usuario_sol', v.usuario], ['sunat_clave_sol', v.clave],
        ['sunat_client_id', v.id], ['sunat_client_secret', v.secreto], ['sunat_modo_entorno', 'produccion'],
      ]);
      haptic('success'); toast('SUNAT guardado');
      if (probar) {
        const r = await api<{ ok?: boolean; error?: string }>('/guias-remision/test-token-sunat', { method: 'POST', body: {} });
        if (!r.ok) throw new Error(r.error || 'Credenciales inválidas');
        setRes({ ok: true, texto: 'Conectado con SUNAT: se generó el token OAuth 2.0' });
      }
    } catch (err) { setRes({ ok: false, texto: errorMessage(err) }); haptic('warning'); }
    finally { setOcupado(false); }
  }

  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV(a => ({ ...a, [k]: e.target.value }));

  return (
    <Tarjeta icono={<ShieldCheck size={22} />} titulo="SUNAT · Guías de remisión electrónicas" estado={res && !res.ok ? 'error' : v.id ? 'ok' : 'pendiente'} meta={metaDe(filas, 'sunat_client_id')}>
      <Field label="RUC del emisor">{p => <TextInput {...p} inputMode="numeric" value={v.ruc} onChange={set('ruc')} />}</Field>
      <Field label="Usuario SOL">{p => <TextInput {...p} value={v.usuario} onChange={set('usuario')} autoComplete="off" />}</Field>
      <Field label="Clave SOL">{p => <PasswordInput {...p} value={v.clave} onChange={set('clave')} autoComplete="off" />}</Field>
      <Field label="Client ID (API SUNAT)">{p => <TextInput {...p} value={v.id} onChange={set('id')} autoComplete="off" />}</Field>
      <Field label="Client Secret (API SUNAT)">{p => <PasswordInput {...p} value={v.secreto} onChange={set('secreto')} autoComplete="off" />}</Field>
      {res && <Notice tone={res.ok ? 'success' : 'error'} icon={res.ok ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}>{res.texto}</Notice>}
      <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={() => guardarYProbar(false)} disabled={ocupado}>Guardar</Button>
        <Button variant="primary" icon={<Zap size={16} />} onClick={() => guardarYProbar(true)} loading={ocupado}>Guardar y probar conexión</Button>
      </div>
    </Tarjeta>
  );
}
