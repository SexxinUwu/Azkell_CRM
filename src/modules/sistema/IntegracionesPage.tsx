import '../mantenimiento/mant.css';
import './integraciones.css';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Building2, CheckCircle2, ChevronDown, CircleAlert, KeyRound, Landmark, ListOrdered, MapPin, ShieldCheck, UserRound, Zap } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, PasswordInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { formatFechaHoraPe } from '../../core/lib/format';

// Identificador de la app en Wialon para el inicio de sesión (igual que la versión actual). No es un token.
const WIALON_CLIENT_ID = 'ACCESO API STHEFANO AVILA';

function urlAutorizacionWialon() {
  const redirect = `${window.location.origin}/wialon_callback.html`;
  return `https://hosting.wialon.us/login.html?access_type=-1&duration=0&client_id=${encodeURIComponent(`"${WIALON_CLIENT_ID}"`)}&response_type=token&redirect_uri=${encodeURIComponent(redirect)}`;
}

// Prueba de Wialon con el token guardado en el servidor
async function probarWialon(): Promise<number> {
  const r = await api<{ data?: unknown[] | { error?: string } }>('/script/obtenerDatosWialon', { method: 'POST', body: {} });
  const d = r.data;
  if (d && !Array.isArray(d) && d.error) throw new Error(d.error);
  return Array.isArray(d) ? d.length : 0;
}

interface Fila { clave: string; valor: string | null; actualizado_por: string | null; actualizado_en: string | null }

const fecha = (s: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : formatFechaHoraPe(d);
};

type Resultado = { ok: boolean; texto: string } | null;

// Sistema › Integraciones: credenciales de Wialon (GPS) y APISUNAT (guías electrónicas), por empresa.
export function IntegracionesPage() {
  const q = useQuery<Fila[]>({
    queryKey: ['sistema', 'integraciones-cfg'],
    queryFn: () => api<Fila[]>('/integraciones').then(r => (Array.isArray(r) ? r : [])),
  });

  return (
    <Page>
      <PageHeader
        eyebrow="Configuración"
        title="Integraciones"
        subtitle="Servicios externos que usa el sistema"
      />
      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : (
        <div className="int-lista">
          <Wialon filas={q.data ?? []} />
          <Apisunat filas={q.data ?? []} />
          <Sire filas={q.data ?? []} />
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

// Tarjeta plegable: contraída muestra un resumen; al tocarla se abre con un resorte sin rebote (se puede volver a tocar a mitad del movimiento)
function Tarjeta({ icono, tono, titulo, resumen, estado, onGuardar, children }: {
  icono: React.ReactNode; tono: 'gps' | 'sunat' | 'sire'; titulo: string; resumen: string; estado: 'ok' | 'pendiente' | 'error'; onGuardar: () => void; children: React.ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);
  const reducir = useReducedMotion();
  return (
    <section className={`int-card${abierta ? ' int-card--abierta' : ''}`}>
      <button type="button" className="int-cab" aria-expanded={abierta} onClick={() => { haptic('selection'); setAbierta(a => !a); }}>
        <span className={`int-icono int-icono--${tono}`}>{icono}</span>
        <span className="int-cab__texto">
          <h2 className="int-titulo">{titulo}</h2>
          <div className="int-resumen">{resumen}</div>
        </span>
        <span className={`ot-estado ot-estado--${estado === 'ok' ? 'green' : estado === 'error' ? 'red' : 'neutral'}`}>
          {estado === 'ok' ? 'Configurado' : estado === 'error' ? 'Con error' : 'Sin configurar'}
        </span>
        <ChevronDown size={18} aria-hidden className={`int-chev${abierta ? ' int-chev--abierta' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {abierta && (
          <motion.div key="cuerpo" className="int-cuerpo-ext"
            initial={reducir ? { opacity: 0 } : { height: 0, opacity: 0 }} animate={reducir ? { opacity: 1 } : { height: 'auto', opacity: 1 }} exit={reducir ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.42 }}>
            <form className="int-cuerpo" onSubmit={e => { e.preventDefault(); onGuardar(); }}>{children}</form>
          </motion.div>
        )}
      </AnimatePresence>
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
        const n = await probarWialon();
        setRes({ ok: true, texto: `Conectado — ${n} unidades encontradas` });
      }
    } catch (err) { setRes({ ok: false, texto: errorMessage(err) }); haptic('warning'); }
    finally { setOcupado(false); }
  }

  // Conectar con Wialon (intgConectarWialon de la versión actual): la ventana de Wialon devuelve el token a
  // wialon_callback.html, que lo pasa por postMessage. Se guarda directo en el servidor y no entra al formulario.
  const [conectando, setConectando] = useState(false);
  const ventana = useRef<Window | null>(null);
  useEffect(() => {
    if (!conectando) return;
    const alRecibir = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const datos = e.data as { type?: unknown; token?: unknown } | null;
      if (datos?.type !== 'WIALON_AUTH_SUCCESS' || typeof datos.token !== 'string' || !datos.token.trim()) return;
      setConectando(false);
      setOcupado(true); setRes(null);
      try {
        await guardar([['wialon_token', datos.token.trim()], ['wialon_url', url]]);
        const n = await probarWialon();
        haptic('success'); toast('Wialon conectado');
        setRes({ ok: true, texto: `Conectado — ${n} unidades encontradas` });
      } catch (err) { setRes({ ok: false, texto: errorMessage(err) }); haptic('warning'); }
      finally { setOcupado(false); }
    };
    // Si la ventana se cierra sin autorizar, se deja de esperar
    const t = window.setInterval(() => { if (ventana.current?.closed) setConectando(false); }, 800);
    window.addEventListener('message', alRecibir);
    return () => { window.removeEventListener('message', alRecibir); window.clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectando]);

  function conectar() {
    const w = 720, h = 640;
    const left = Math.max(0, window.screen.width / 2 - w / 2);
    const top = Math.max(0, window.screen.height / 2 - h / 2);
    // window.open va directo en el clic para que el navegador no lo bloquee
    const v = window.open(urlAutorizacionWialon(), 'wialon_oauth_login',
      `width=${w},height=${h},top=${top},left=${left},menubar=no,toolbar=no,location=no,status=no,resizable=yes`);
    if (!v) { setRes({ ok: false, texto: 'El navegador bloqueó la ventana de Wialon. Permite las ventanas emergentes de este sitio.' }); haptic('warning'); return; }
    ventana.current = v;
    setConectando(true);
  }

  return (
    <Tarjeta icono={<MapPin size={20} />} tono="gps" titulo="Wialon · GPS" estado={res && !res.ok ? 'error' : token ? 'ok' : 'pendiente'}
      resumen={token ? `Token guardado · ${url || 'servidor predeterminado'}` : 'Aún sin token de acceso'} onGuardar={() => guardarYProbar(false)}>
      <div className="int-grid">
        <Field label="Token de acceso" hint="Se obtiene en Wialon › Mi cuenta › Tokens">{p => <PasswordInput {...p} value={token} onChange={e => setToken(e.target.value)} autoComplete="off" />}</Field>
        <Field label="URL del servidor" hint="Déjalo vacío para usar el predeterminado">{p => <TextInput {...p} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://hst-api.wialon.com" />}</Field>
      </div>
      {conectando && <Notice>Esperando la autorización en la ventana de Wialon…</Notice>}
      {res && <Notice tone={res.ok ? 'success' : 'error'} icon={res.ok ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}>{res.texto}</Notice>}
      <div className="int-acciones">
        <span className="int-acciones__meta">{metaDe(filas, 'wialon_token')}</span>
        <Button variant="primary" icon={<MapPin size={16} />} onClick={conectar} loading={conectando} disabled={ocupado}>Conectar con Wialon</Button>
        <Button variant="secondary" onClick={() => guardarYProbar(false)} disabled={ocupado || conectando}>Guardar</Button>
        <Button variant="primary" icon={<Zap size={16} />} onClick={() => guardarYProbar(true)} loading={ocupado} disabled={conectando}>Guardar y probar conexión</Button>
      </div>
    </Tarjeta>
  );
}

function Apisunat({ filas }: { filas: Fila[] }) {
  const toast = useToast();
  const guardar = useGuardar();
  const vacio = { modo: 'prueba', modoFact: 'prueba', ruc: '', razon: '', mtc: '', autorizacion: '', serieGrt: 'V001', serieGre: 'T001', serieFactura: 'F001', serieBoleta: 'B001', serieNcF: 'FC01', serieNcB: 'BC01', id: '', token: '', pid: '', ptoken: '' };
  const [v, setV] = useState(vacio);
  const [ocupado, setOcupado] = useState(false);
  const [res, setRes] = useState<Resultado>(null);
  const [pestana, setPestana] = useState<'empresa' | 'series' | 'conexion'>('empresa');
  const reducir = useReducedMotion();

  useEffect(() => {
    setV({
      modo: valorDe(filas, 'apisunat_modo') === 'produccion' ? 'produccion' : 'prueba',
      // La facturación tiene su propio ambiente; si nunca se definió, usa el mismo de las guías
      modoFact: (valorDe(filas, 'apisunat_modo_facturacion') || valorDe(filas, 'apisunat_modo')) === 'produccion' ? 'produccion' : 'prueba',
      ruc: valorDe(filas, 'apisunat_ruc_emisor') || valorDe(filas, 'sunat_ruc_emisor'), razon: valorDe(filas, 'apisunat_razon_social'), mtc: valorDe(filas, 'apisunat_registro_mtc'), autorizacion: valorDe(filas, 'apisunat_autorizacion_mtc'),
      serieGrt: valorDe(filas, 'apisunat_serie_grt') || 'V001', serieGre: valorDe(filas, 'apisunat_serie_gre') || 'T001',
      serieFactura: valorDe(filas, 'apisunat_serie_factura') || 'F001', serieBoleta: valorDe(filas, 'apisunat_serie_boleta') || 'B001',
      serieNcF: valorDe(filas, 'apisunat_serie_nc_factura') || 'FC01', serieNcB: valorDe(filas, 'apisunat_serie_nc_boleta') || 'BC01',
      id: valorDe(filas, 'apisunat_persona_id'), token: valorDe(filas, 'apisunat_persona_token'),
      pid: valorDe(filas, 'apisunat_prueba_persona_id'), ptoken: valorDe(filas, 'apisunat_prueba_persona_token'),
    });
  }, [filas]);

  async function guardarYProbar(probar: boolean) {
    // Pasar un documento a producción es serio: lo que se emita tendrá validez tributaria y no se puede borrar
    const guardadoGuias = valorDe(filas, 'apisunat_modo') === 'produccion';
    const guardadoFact = (valorDe(filas, 'apisunat_modo_facturacion') || valorDe(filas, 'apisunat_modo')) === 'produccion';
    const nuevos = [v.modo === 'produccion' && !guardadoGuias && 'las guías de remisión', v.modoFact === 'produccion' && !guardadoFact && 'la facturación electrónica'].filter(Boolean);
    if (nuevos.length && !window.confirm(`Vas a pasar a PRODUCCIÓN ${nuevos.join(' y ')}. Lo que se emita tendrá validez tributaria ante SUNAT y no se puede borrar. ¿Continuar?`)) return;
    setOcupado(true); setRes(null);
    try {
      await guardar([
        ['apisunat_modo', v.modo], ['apisunat_modo_facturacion', v.modoFact], ['apisunat_ruc_emisor', v.ruc], ['apisunat_razon_social', v.razon], ['apisunat_registro_mtc', v.mtc.toUpperCase()], ['apisunat_autorizacion_mtc', v.autorizacion],
        ['apisunat_serie_grt', v.serieGrt.toUpperCase()], ['apisunat_serie_gre', v.serieGre.toUpperCase()],
        ['apisunat_serie_factura', v.serieFactura.toUpperCase()], ['apisunat_serie_boleta', v.serieBoleta.toUpperCase()],
        ['apisunat_serie_nc_factura', v.serieNcF.toUpperCase()], ['apisunat_serie_nc_boleta', v.serieNcB.toUpperCase()],
        ['apisunat_persona_id', v.id], ['apisunat_persona_token', v.token],
        ['apisunat_prueba_persona_id', v.pid], ['apisunat_prueba_persona_token', v.ptoken],
      ]);
      haptic('success'); toast('APISUNAT guardado');
      if (probar) {
        const r = await api<{ ok?: boolean; error?: string; message?: string }>('/operaciones/gre/apisunat/probar', { method: 'POST', body: {} });
        if (r.ok === false) throw new Error(r.error || 'No se pudo conectar');
        setRes({ ok: true, texto: r.message || 'Conectado con APISUNAT' });
      }
    } catch (err) { setRes({ ok: false, texto: errorMessage(err) }); haptic('warning'); }
    finally { setOcupado(false); }
  }

  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV(a => ({ ...a, [k]: e.target.value }));
  const produccion = v.modo === 'produccion';
  const produccionFact = v.modoFact === 'produccion';

  const Aviso = res && <Notice tone={res.ok ? 'success' : 'error'} icon={res.ok ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}>{res.texto}</Notice>;
  const serie = (k: keyof typeof v, etiqueta: string) => (
    <div className="int-mono" key={k}><Field label={etiqueta}>{p => <TextInput {...p} maxLength={4} value={v[k]} onChange={set(k)} />}</Field></div>
  );
  const resumen = v.ruc ? `RUC ${v.ruc}${v.razon ? ` · ${v.razon}` : ''} · Guías en ${produccion ? 'producción' : 'prueba'} · Facturación en ${produccionFact ? 'producción' : 'prueba'}` : 'Aún sin RUC de la empresa';

  return (
    <Tarjeta icono={<ShieldCheck size={20} />} tono="sunat" titulo="APISUNAT · Guías y facturación electrónica" estado={res && !res.ok ? 'error' : v.id || v.pid ? 'ok' : 'pendiente'}
      resumen={resumen} onGuardar={() => guardarYProbar(false)}>
      <div className="int-barra">
        <SegmentedControl label="Sección" value={pestana} onChange={setPestana}
          options={[{ value: 'empresa', label: 'Empresa' }, { value: 'series', label: 'Series' }, { value: 'conexion', label: 'Conexión' }]} />
      </div>
      <Notice tone={produccion || produccionFact ? 'error' : 'accent'}>{produccion || produccionFact
        ? `Producción activa en ${[produccion && 'las guías', produccionFact && 'la facturación'].filter(Boolean).join(' y ')}: lo que se emita ahí tiene validez tributaria ante SUNAT.`
        : 'Prueba (modo DESARROLLO de APISUNAT): no se envía a SUNAT ni tiene validez tributaria. Solo se envía si APISUNAT confirma que el token es de desarrollo.'}</Notice>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={pestana} initial={reducir ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.3 }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {pestana === 'empresa' && (
            <div className="int-grid">
              <Field label="RUC de la empresa">{p => <TextInput {...p} inputMode="numeric" maxLength={11} value={v.ruc} onChange={set('ruc')} />}</Field>
              <Field label="Razón social">{p => <TextInput {...p} value={v.razon} onChange={set('razon')} />}</Field>
              <Field label="Registro MTC (transporte de carga)">{p => <TextInput {...p} value={v.mtc} onChange={set('mtc')} />}</Field>
              <Field label="Autorización especial del MTC" hint="Opcional">{p => <TextInput {...p} value={v.autorizacion} onChange={set('autorizacion')} />}</Field>
            </div>
          )}
          {pestana === 'series' && (
            <>
              <div className="int-grupo">
                <div className="int-grupo__titulo"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ListOrdered size={13} aria-hidden /> Guías de remisión</span></div>
                <div className="int-grid int-grid--series">{serie('serieGrt', 'Transportista')}{serie('serieGre', 'Remitente')}</div>
              </div>
              <div className="int-grupo">
                <div className="int-grupo__titulo"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Building2 size={13} aria-hidden /> Comprobantes</span></div>
                <div className="int-grid int-grid--series">
                  {serie('serieFactura', 'Facturas')}{serie('serieBoleta', 'Boletas')}
                  {serie('serieNcF', 'N. crédito (factura)')}{serie('serieNcB', 'N. crédito (boleta)')}
                </div>
              </div>
            </>
          )}
          {pestana === 'conexion' && (
            <>
            <div className="int-grupo">
              <div className="int-grupo__titulo"><span>Ambiente de emisión</span></div>
              <div className="int-dos">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="t-footnote c-secondary" style={{ fontWeight: 600 }}>Guías de remisión</span>
                  <SegmentedControl block label="Ambiente de las guías" value={v.modo as 'prueba' | 'produccion'} onChange={m => setV(a => ({ ...a, modo: m }))}
                    options={[{ value: 'prueba', label: 'Prueba' }, { value: 'produccion', label: 'Producción' }]} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="t-footnote c-secondary" style={{ fontWeight: 600 }}>Facturación electrónica</span>
                  <SegmentedControl block label="Ambiente de la facturación" value={v.modoFact as 'prueba' | 'produccion'} onChange={m => setV(a => ({ ...a, modoFact: m }))}
                    options={[{ value: 'prueba', label: 'Prueba' }, { value: 'produccion', label: 'Producción' }]} />
                </div>
              </div>
              <p className="t-footnote c-secondary" style={{ margin: 0 }}>Cada documento tiene su propio ambiente: puedes pasar la facturación a producción y dejar las guías en prueba, o al revés. Antes de pasar la facturación, usa «Pasar a producción» en Operaciones › Facturación para revisar que todo esté listo.</p>
            </div>
            <div className="int-dos">
              <div className={`int-grupo${produccion || produccionFact ? ' int-grupo--activo' : ''}`}>
                <div className="int-grupo__titulo"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><KeyRound size={13} aria-hidden /> Producción</span><span style={{ display: 'inline-flex', gap: 4 }}>{produccion && <span className="int-uso">Guías</span>}{produccionFact && <span className="int-uso">Facturación</span>}</span></div>
                <Field label="Persona ID">{p => <TextInput {...p} value={v.id} onChange={set('id')} autoComplete="off" />}</Field>
                <Field label="Token">{p => <PasswordInput {...p} value={v.token} onChange={set('token')} autoComplete="off" />}</Field>
              </div>
              <div className={`int-grupo${!produccion || !produccionFact ? ' int-grupo--activo' : ''}`}>
                <div className="int-grupo__titulo"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><KeyRound size={13} aria-hidden /> Desarrollo (pruebas)</span><span style={{ display: 'inline-flex', gap: 4 }}>{!produccion && <span className="int-uso">Guías</span>}{!produccionFact && <span className="int-uso">Facturación</span>}</span></div>
                <Field label="Persona ID">{p => <TextInput {...p} value={v.pid} onChange={set('pid')} autoComplete="off" />}</Field>
                <Field label="Token">{p => <PasswordInput {...p} value={v.ptoken} onChange={set('ptoken')} autoComplete="off" />}</Field>
              </div>
            </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {Aviso}
      <div className="int-acciones">
        <span className="int-acciones__meta">{metaDe(filas, 'apisunat_modo') || 'Es de esta empresa: cada empresa guarda la suya.'}</span>
        <Button variant="secondary" onClick={() => guardarYProbar(false)} disabled={ocupado}>Guardar</Button>
        <Button variant="primary" icon={<Zap size={16} />} onClick={() => guardarYProbar(true)} loading={ocupado}>Guardar y probar conexión</Button>
      </div>
    </Tarjeta>
  );
}

// SUNAT · SIRE: registros electrónicos de ventas (RVIE) y compras (RCE). Va DIRECTO a la API de SUNAT, no por APISUNAT.
// La clave SOL y el secreto se guardan cifrados y no se vuelven a mostrar completos.
function Sire({ filas }: { filas: Fila[] }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [v, setV] = useState({ ruc: '', usuario: '', clave: '', clientId: '', secreto: '' });
  const [ocupado, setOcupado] = useState(false);
  const [res, setRes] = useState<Resultado>(null);
  // Servicios de la API de SUNAT que la credencial tiene habilitados (SIRE, buzón de mensajes, guías)
  const [servicios, setServicios] = useState<Array<{ clave: string; nombre: string; ok: boolean; detalle: string }> | null>(null);
  const [comprobando, setComprobando] = useState(false);

  useEffect(() => {
    setV({
      // El RUC parte del de la empresa en APISUNAT, para no escribirlo dos veces
      ruc: valorDe(filas, 'sire_ruc') || valorDe(filas, 'apisunat_ruc_emisor') || valorDe(filas, 'sunat_ruc_emisor'),
      usuario: valorDe(filas, 'sire_usuario_sol'), clave: valorDe(filas, 'sire_clave_sol'),
      clientId: valorDe(filas, 'sire_client_id'), secreto: valorDe(filas, 'sire_client_secret'),
    });
  }, [filas]);

  async function guardarYProbar(probar: boolean) {
    setOcupado(true); setRes(null);
    try {
      await api('/sire/config', { method: 'PUT', body: { ruc: v.ruc, usuario_sol: v.usuario, client_id: v.clientId, client_secret: v.secreto, clave_sol: v.clave } });
      await qc.invalidateQueries({ queryKey: ['sistema', 'integraciones-cfg'] });
      haptic('success'); toast('SIRE guardado');
      if (probar) {
        const r = await api<{ ok?: boolean; error?: string; message?: string }>('/sire/probar', { method: 'POST', body: {} });
        if (r.ok === false) throw new Error(r.error || 'No se pudo conectar');
        setRes({ ok: true, texto: r.message || 'Conectado con el SIRE de SUNAT' });
      }
    } catch (err) { setRes({ ok: false, texto: errorMessage(err) }); haptic('warning'); }
    finally { setOcupado(false); }
  }

  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV(a => ({ ...a, [k]: e.target.value }));
  const completo = !!(v.ruc && v.usuario && v.clave && v.clientId && v.secreto);

  async function comprobarServicios() {
    setComprobando(true); setServicios(null);
    try {
      const r = await api<{ servicios: Array<{ clave: string; nombre: string; ok: boolean; detalle: string }> }>('/sire/servicios', { method: 'POST', body: {} });
      setServicios(r.servicios); haptic('success');
    } catch (err) { setRes({ ok: false, texto: errorMessage(err) }); haptic('warning'); } finally { setComprobando(false); }
  }

  return (
    <Tarjeta icono={<Landmark size={20} />} tono="sire" titulo="SUNAT · API (SIRE y buzón de mensajes)" estado={res && !res.ok ? 'error' : completo ? 'ok' : 'pendiente'}
      resumen={completo ? `RUC ${v.ruc} · usuario SOL ${v.usuario}` : 'Aún sin credenciales de SUNAT'} onGuardar={() => guardarYProbar(false)}>
      <Notice tone="accent">Esta conexión va directo con SUNAT (no con APISUNAT, que solo emite comprobantes). La clave SOL y el secreto se guardan cifrados y no se vuelven a mostrar. Usa un usuario SOL secundario con permiso de consulta del SIRE.</Notice>
      <div className="int-grupo">
        <div className="int-grupo__titulo"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><UserRound size={13} aria-hidden /> Empresa y usuario SOL</span></div>
        <div className="int-grid">
          <Field label="RUC de la empresa">{p => <TextInput {...p} inputMode="numeric" maxLength={11} value={v.ruc} onChange={set('ruc')} />}</Field>
          <Field label="Usuario SOL" hint="El secundario, no el principal">{p => <TextInput {...p} value={v.usuario} onChange={set('usuario')} autoComplete="off" />}</Field>
          <Field label="Clave SOL">{p => <PasswordInput {...p} value={v.clave} onChange={set('clave')} autoComplete="new-password" />}</Field>
        </div>
      </div>
      <div className="int-grupo">
        <div className="int-grupo__titulo"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><KeyRound size={13} aria-hidden /> Credenciales de API de SUNAT</span></div>
        <div className="int-grid">
          <Field label="Client ID" hint="Se generan una sola vez en SUNAT Operaciones en Línea (Clave SOL), en «Credenciales de API SUNAT»">{p => <TextInput {...p} value={v.clientId} onChange={set('clientId')} autoComplete="off" />}</Field>
          <Field label="Client Secret">{p => <PasswordInput {...p} value={v.secreto} onChange={set('secreto')} autoComplete="new-password" />}</Field>
        </div>
      </div>
      {res && <Notice tone={res.ok ? 'success' : 'error'} icon={res.ok ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}>{res.texto}</Notice>}
      {servicios && (
        <div className="int-grupo">
          <div className="int-grupo__titulo"><span>Servicios de SUNAT habilitados en esta credencial</span></div>
          {servicios.map(sv => (
            <div key={sv.clave} style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
              {sv.ok ? <CheckCircle2 size={16} style={{ color: 'var(--green-ink)' }} aria-hidden /> : <CircleAlert size={16} style={{ color: 'var(--red-ink)' }} aria-hidden />}
              <span><strong>{sv.nombre}</strong> <span className="t-footnote c-secondary">· {sv.detalle}</span></span>
            </div>
          ))}
        </div>
      )}
      <div className="int-acciones">
        <span className="int-acciones__meta">{metaDe(filas, 'sire_client_id') || 'Es de esta empresa: cada empresa guarda la suya.'}</span>
        <Button variant="plain" onClick={() => { void comprobarServicios(); }} loading={comprobando} disabled={!completo || ocupado}>Comprobar servicios habilitados</Button>
        <Button variant="secondary" onClick={() => guardarYProbar(false)} disabled={ocupado}>Guardar</Button>
        <Button variant="primary" icon={<Zap size={16} />} onClick={() => guardarYProbar(true)} loading={ocupado}>Guardar y probar conexión</Button>
      </div>
    </Tarjeta>
  );
}
