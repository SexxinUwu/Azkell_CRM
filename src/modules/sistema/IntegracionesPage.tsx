import './integraciones.css';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { useCssClasico } from '../../core/lib/clasicoCss';

// Calca de modulos/sistema/integraciones (vista.html + logica.js): mismo marcado, clases, textos y comportamiento.
// Bootstrap y sus íconos se cargan mientras la pantalla está abierta (el clásico los carga siempre).

interface Fila { clave: string; valor: string | null; actualizado_por: string | null; actualizado_en: string | null }
type EstadoTarjeta = { texto: string; clase: 'ok' | 'error' | 'pending' };
type Prueba = { ok: boolean; texto: string } | null;

const CSS_CLASICO = ['/libs/bootstrap.min.css', '/libs/bootstrap-icons.css'] as const;
// Identificador de la app en Wialon para el inicio de sesión, igual que la versión actual. No es un token.
const WIALON_CLIENT_ID = 'ACCESO API STHEFANO AVILA';

const valorDe = (filas: Fila[], clave: string) => filas.find(f => f.clave === clave)?.valor ?? '';

// intgFmtFecha del clásico
function intgFmtFecha(str: string | null) {
  if (!str) return '';
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const metaDe = (filas: Fila[], clave: string) => {
  const f = filas.find(x => x.clave === clave);
  return f?.actualizado_por ? `Guardado por ${f.actualizado_por} — ${intgFmtFecha(f.actualizado_en)}` : '';
};

function urlAutorizacionWialon() {
  const redirect = `${window.location.origin}/wialon_callback.html`;
  return `https://hosting.wialon.us/login.html?access_type=-1&duration=0&client_id=${encodeURIComponent(`"${WIALON_CLIENT_ID}"`)}&response_type=token&redirect_uri=${encodeURIComponent(redirect)}`;
}

// intgProbarWialon: el servidor usa el token guardado; el navegador no lo recibe
async function probarWialon(): Promise<number> {
  const r = await api<{ data?: unknown[] | { error?: string } }>('/script/obtenerDatosWialon', { method: 'POST', body: {} });
  const d = r.data;
  if (d && !Array.isArray(d) && d.error) throw new Error(d.error);
  return Array.isArray(d) ? d.length : 0;
}

// intgGuardar del clásico: un PUT por clave, mismos mensajes
function useGuardar() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  return async (pares: Array<[string, string]>) => {
    try {
      await Promise.all(pares.map(([clave, valor]) =>
        api('/integraciones', { method: 'PUT', body: { clave, valor: valor.trim(), actualizado_por: user?.email ?? '' } })));
      toast('Integración guardada correctamente');
    } catch (err) {
      toast('Error al guardar', 'error');
      throw err;
    } finally {
      await qc.invalidateQueries({ queryKey: ['sistema', 'integraciones-cfg'] });
    }
  };
}

function EtiquetaEstado({ estado }: { estado: EstadoTarjeta }) {
  return <span className={`intg-status ${estado.clase}`}>{estado.texto}</span>;
}

function TextoPrueba({ prueba, id }: { prueba: Prueba; id: string }) {
  if (!prueba) return <span className="intg-test-result" id={id} />;
  return <span className={`intg-test-result ${prueba.ok ? 'ok' : 'error'}`} id={id}>{prueba.texto}</span>;
}

export function IntegracionesPage() {
  useCssClasico(CSS_CLASICO);
  const q = useQuery<Fila[]>({
    queryKey: ['sistema', 'integraciones-cfg'],
    queryFn: () => api<Fila[]>('/integraciones').then(r => (Array.isArray(r) ? r : [])),
  });
  if (q.isError) console.error('Error cargando integraciones:', q.error);
  const filas = q.data ?? [];

  return (
    <div id="moduloIntegraciones">
      <div className="intg-header">
        <h2><i className="bi bi-plug-fill me-2" style={{ color: 'var(--primary,#5865F2)' }}></i>Integraciones</h2>
        <p>Configura los tokens y credenciales de servicios externos. Haz clic en cada tarjeta para expandir o contraer sus opciones.</p>
      </div>
      <Wialon filas={filas} cargado={q.isSuccess} />
      <Sunat filas={filas} cargado={q.isSuccess} />
    </div>
  );
}

function Wialon({ filas, cargado }: { filas: Fila[]; cargado: boolean }) {
  const toast = useToast();
  const guardar = useGuardar();
  const [abierta, setAbierta] = useState(false);
  const [url, setUrl] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [prueba, setPrueba] = useState<Prueba>(null);
  const ventana = useRef<Window | null>(null);
  // El token guardado nunca se carga en pantalla: solo se sabe si existe
  const tieneToken = valorDe(filas, 'wialon_token') !== '';

  // intgCargar: la URL se llena con lo guardado al cargar
  const urlGuardada = valorDe(filas, 'wialon_url');
  const [urlVista, setUrlVista] = useState<string | null>(null);
  if (cargado && urlVista !== urlGuardada) { setUrlVista(urlGuardada); setUrl(urlGuardada); }

  async function probarConexion() {
    setOcupado(true);
    setPrueba(null);
    try {
      const n = await probarWialon();
      setPrueba({ ok: true, texto: `✓ Conectado — ${n} unidades encontradas` });
    } catch (err) {
      setPrueba({ ok: false, texto: `✗ ${errorMessage(err)}` });
    } finally { setOcupado(false); }
  }

  // Mientras se espera la ventana de Wialon: la respuesta llega por postMessage desde wialon_callback.html
  useEffect(() => {
    if (!conectando) return;
    const alRecibir = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const datos = e.data as { type?: unknown; token?: unknown } | null;
      if (datos?.type !== 'WIALON_AUTH_SUCCESS' || typeof datos.token !== 'string' || !datos.token.trim()) return;
      setConectando(false);
      toast('✓ Token de Wialon capturado con éxito. Guardando credenciales...');
      try {
        await guardar([['wialon_token', datos.token], ['wialon_url', url]]);
        await probarConexion();
      } catch { /* guardar ya avisó */ }
    };
    // Si la ventana se cierra sin autorizar, se deja de esperar
    const t = window.setInterval(() => { if (ventana.current?.closed) setConectando(false); }, 800);
    window.addEventListener('message', alRecibir);
    return () => { window.removeEventListener('message', alRecibir); window.clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectando]);

  // intgConectarWialon: window.open va directo en el clic para que el navegador no lo bloquee
  function conectar() {
    const w = 720, h = 640;
    const left = Math.max(0, window.screen.width / 2 - w / 2);
    const top = Math.max(0, window.screen.height / 2 - h / 2);
    const v = window.open(urlAutorizacionWialon(), 'wialon_oauth_login',
      `width=${w},height=${h},top=${top},left=${left},menubar=no,toolbar=no,location=no,status=no,resizable=yes`);
    if (!v) { toast('El navegador bloqueó la ventana de Wialon. Permite las ventanas emergentes de este sitio.', 'error'); return; }
    ventana.current = v;
    setConectando(true);
  }

  async function guardarUrl() {
    try { await guardar([['wialon_url', url]]); } catch { /* ya avisó */ }
  }

  const estado: EstadoTarjeta = prueba?.ok === true ? { texto: 'Activo', clase: 'ok' }
    : prueba?.ok === false ? { texto: 'Error', clase: 'error' }
    : !cargado ? { texto: 'Sin probar', clase: 'pending' }
    : tieneToken ? { texto: 'Configurado', clase: 'ok' } : { texto: 'Sin configurar', clase: 'pending' };

  return (
    <div className={`intg-card${abierta ? ' open' : ''}`} id="intg-card-wialon">
      <div className="intg-card-header" onClick={() => setAbierta(a => !a)}>
        <div className="intg-card-icon wialon"><i className="bi bi-geo-alt-fill"></i></div>
        <div>
          <p className="intg-card-title">Wialon — GPS / Flota</p>
          <p className="intg-card-subtitle">Plataforma de rastreo vehicular. Se usa en el módulo GPS Flota.</p>
        </div>
        <EtiquetaEstado estado={estado} />
        <i className="bi bi-chevron-down intg-card-chevron"></i>
      </div>

      <div className="intg-card-body">
        <div style={{ paddingTop: 18 }}>
          <div className="intg-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ marginBottom: 0 }}>Token de autenticación</label>
              <button type="button" className="btn btn-sm btn-warning text-dark fw-bold"
                style={{ fontSize: '0.74rem', padding: '2px 10px', borderRadius: 6 }} onClick={conectar} disabled={conectando || ocupado}>
                <i className="bi bi-box-arrow-up-right me-1"></i> Iniciar Sesión en Wialon y Conectar
              </button>
            </div>
            <div className="intg-hint">Haz clic en <strong>"Iniciar Sesión en Wialon y Conectar"</strong> para ingresar tus credenciales y vincular el token automáticamente.</div>
            <div className="intg-meta">{metaDe(filas, 'wialon_token')}</div>
          </div>

          <div className="intg-field">
            <label>URL base API <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional)</span></label>
            <div className="input-wrap">
              <input type="text" id="intg-wialon-url" value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://hst-api.wialon.us/wialon/ajax.html" autoComplete="off" />
            </div>
            <div className="intg-hint">Dejar vacío para usar el servidor por defecto (hst-api.wialon.us).</div>
          </div>

          <div className="intg-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={guardarUrl} disabled={ocupado || conectando}>
              <i className="bi bi-floppy me-1"></i>Guardar
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={probarConexion} disabled={ocupado || conectando}>
              {ocupado ? <><span className="spinner-border spinner-border-sm me-1"></span>Probando…</> : <><i className="bi bi-lightning me-1"></i>Probar conexión</>}
            </button>
            <TextoPrueba prueba={prueba} id="intg-wialon-testresult" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Sunat({ filas, cargado }: { filas: Fila[]; cargado: boolean }) {
  const guardar = useGuardar();
  const [abierta, setAbierta] = useState(false);
  const [v, setV] = useState({ ruc: '', usuario: '', clave: '', id: '', secreto: '' });
  const [cargadoEn, setCargadoEn] = useState(false);
  const [ver, setVer] = useState<Record<string, boolean>>({});
  const [ocupado, setOcupado] = useState(false);
  const [prueba, setPrueba] = useState<Prueba>(null);

  // intgCargar: al cargar, los campos se llenan con lo guardado
  if (cargado && !cargadoEn) {
    setCargadoEn(true);
    setV({
      ruc: valorDe(filas, 'sunat_ruc_emisor'), usuario: valorDe(filas, 'sunat_usuario_sol'), clave: valorDe(filas, 'sunat_clave_sol'),
      id: valorDe(filas, 'sunat_client_id'), secreto: valorDe(filas, 'sunat_client_secret'),
    });
  }
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV(a => ({ ...a, [k]: e.target.value }));
  const alternarVer = (campo: string) => setVer(s => ({ ...s, [campo]: !s[campo] }));

  const estado: EstadoTarjeta = prueba?.ok === true ? { texto: 'Activo', clase: 'ok' }
    : prueba?.ok === false ? { texto: 'Error', clase: 'error' }
    : !cargado ? { texto: 'Sin probar', clase: 'pending' }
    : valorDe(filas, 'sunat_client_id') ? { texto: 'Configurado', clase: 'ok' } : { texto: 'Sin configurar', clase: 'pending' };

  const pares = (): Array<[string, string]> => [
    ['sunat_ruc_emisor', v.ruc], ['sunat_usuario_sol', v.usuario], ['sunat_clave_sol', v.clave],
    ['sunat_client_id', v.id], ['sunat_client_secret', v.secreto], ['sunat_modo_entorno', 'produccion'],
  ];

  async function guardarCredenciales() {
    try { await guardar(pares()); } catch { /* ya avisó */ }
  }

  // intgProbarSunat: guarda primero y luego pide el token OAuth 2.0
  async function probarSunat() {
    setOcupado(true);
    setPrueba(null);
    try {
      await guardar(pares());
      const r = await api<{ ok?: boolean; error?: string }>('/guias-remision/test-token-sunat', { method: 'POST', body: {} });
      if (!r.ok) throw new Error(r.error || 'Credenciales inválidas');
      setPrueba({ ok: true, texto: '✓ Conectado con SUNAT — Token OAuth 2.0 generado con éxito' });
    } catch (err) {
      setPrueba({ ok: false, texto: `✗ ${errorMessage(err)}` });
    } finally { setOcupado(false); }
  }

  const ojo = (campo: string) => (
    <button type="button" className="btn-toggle-pwd" onClick={() => alternarVer(campo)} title="Mostrar/Ocultar">
      <i className={ver[campo] ? 'bi bi-eye-slash' : 'bi bi-eye'}></i>
    </button>
  );

  return (
    <div className={`intg-card${abierta ? ' open' : ''}`} id="intg-card-sunat">
      <div className="intg-card-header" onClick={() => setAbierta(a => !a)}>
        <div className="intg-card-icon" style={{ background: 'rgba(14, 165, 233, 0.12)', color: '#0284c7' }}>
          <i className="bi bi-file-earmark-lock-fill"></i>
        </div>
        <div>
          <p className="intg-card-title">SUNAT — Guías de Remisión Electrónica (GRE)</p>
          <p className="intg-card-subtitle">Lectura y consulta directa de GRE vía API Oficial y Clave SOL.</p>
        </div>
        <EtiquetaEstado estado={estado} />
        <i className="bi bi-chevron-down intg-card-chevron"></i>
      </div>

      <div className="intg-card-body">
        <div style={{ paddingTop: 18 }}>
          <div className="row g-2 mb-2">
            <div className="col-md-6">
              <div className="intg-field">
                <label>RUC Emisor</label>
                <div className="input-wrap">
                  <input type="text" id="intg-sunat-ruc" value={v.ruc} onChange={set('ruc')} placeholder="Ej. 20609532484" autoComplete="off" />
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="intg-field">
                <label>Usuario Clave SOL</label>
                <div className="input-wrap">
                  <input type="text" id="intg-sunat-usuario" value={v.usuario} onChange={set('usuario')} placeholder="Ej. OPERMAR1" autoComplete="off" />
                </div>
              </div>
            </div>
          </div>

          <div className="intg-field">
            <label>Contraseña Clave SOL</label>
            <div className="input-wrap">
              <input type={ver.clave ? 'text' : 'password'} id="intg-sunat-clave" value={v.clave} onChange={set('clave')} placeholder="••••••••••••" autoComplete="off" />
              {ojo('clave')}
            </div>
          </div>

          <div className="row g-2 mb-2">
            <div className="col-md-6">
              <div className="intg-field">
                <label>Client ID (API SUNAT)</label>
                <div className="input-wrap">
                  <input type="text" id="intg-sunat-client-id" value={v.id} onChange={set('id')} placeholder="ID generado en Clave SOL…" autoComplete="off" />
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="intg-field">
                <label>Client Secret</label>
                <div className="input-wrap">
                  <input type={ver.secreto ? 'text' : 'password'} id="intg-sunat-client-secret" value={v.secreto} onChange={set('secreto')} placeholder="Secret de la aplicación…" autoComplete="off" />
                  {ojo('secreto')}
                </div>
              </div>
            </div>
          </div>

          <div className="intg-hint mb-3">Las credenciales Client ID y Secret se obtienen en SUNAT Operaciones en Línea &gt; Gestión de desarrollo de aplicaciones.</div>
          <div className="intg-meta mb-3">{metaDe(filas, 'sunat_client_id')}</div>

          <div className="intg-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={guardarCredenciales} disabled={ocupado}>
              <i className="bi bi-floppy me-1"></i>Guardar Credenciales
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={probarSunat} disabled={ocupado}>
              {ocupado ? <><span className="spinner-border spinner-border-sm me-1"></span>Autenticando…</> : <><i className="bi bi-shield-check me-1"></i>Probar Conexión (OAuth 2.0)</>}
            </button>
            <TextoPrueba prueba={prueba} id="intg-sunat-testresult" />
          </div>
        </div>
      </div>
    </div>
  );
}
