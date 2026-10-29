import './configuracion.css';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  CheckCircle2,
  CreditCard,
  Mail,
  MessageCircle,
  Package,
  QrCode,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Switch } from '../../core/ui/Switch';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { formatFechaHoraPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';

type Pestana = 'canales' | 'eventos' | 'historial';
type Canal = 'whatsapp' | 'email' | 'sms' | 'push';

interface Canales {
  whatsapp: { configurado: boolean; instancia?: string; estado: string; detalle?: string };
  correo: { proveedor: string; from_name: string; from_email: string; proveedores: string[] };
  sms: { proveedor: string; activo: boolean; proveedores: string[] };
}
interface Regla { evento: string; titulo: string; detalle: string; activo: boolean; canales: Canal[]; destinatarios: string }
interface Envio { id: number; canal: Canal; destinatario: string; evento: string | null; asunto: string | null; estado: string; error: string | null; created_at: string }

interface WhatsappConfig {
  status?: string;
  instance?: string;
  empresa_nombre?: string;
  receptor_telefono?: string;
  receptor_nombre?: string;
  tesoreria_telefono?: string;
  tesoreria_nombre?: string;
  almacen_telefono?: string;
  almacen_nombre?: string;
  base64?: string;
  qr?: string;
  code?: string;
  pairingCode?: string;
  error?: string;
  conectado?: boolean;
}

const NOMBRE_CANAL: Record<Canal, string> = { whatsapp: 'WhatsApp', email: 'Correo', sms: 'SMS', push: 'Teléfono (app)' };
const TONO_ESTADO: Record<string, 'green' | 'amber' | 'red' | 'gray'> = {
  conectado: 'green', ENVIADO: 'green', desconectado: 'amber', error: 'red', FALLIDO: 'red', sin_configurar: 'gray',
};
const TEXTO_ESTADO: Record<string, string> = {
  conectado: 'Conectado', desconectado: 'Desconectado', error: 'Sin respuesta', sin_configurar: 'Sin configurar',
  ENVIADO: 'Enviado', FALLIDO: 'Fallido',
};

function IconoCanal({ canal }: { canal: Canal }) {
  if (canal === 'whatsapp') return <MessageCircle size={16} aria-label="WhatsApp" />;
  if (canal === 'email') return <Mail size={16} aria-label="Correo" />;
  if (canal === 'push') return <BellRing size={16} aria-label="Teléfono (app)" />;
  return <Smartphone size={16} aria-label="SMS" />;
}

function limpiarCelular(tel?: string | null): string {
  if (!tel) return '';
  let clean = String(tel).replace(/\D/g, '');
  if (clean.startsWith('51') && clean.length > 9) clean = clean.substring(2);
  return clean.slice(0, 9);
}

function formatearParaEnvio(tel: string): string {
  const clean = tel.replace(/\D/g, '');
  if (!clean) return '';
  if (!clean.startsWith('51') && clean.length === 9) return '51' + clean;
  return clean;
}

function SeccionWhatsappMultiTenant({ canales }: { canales: Canales }) {
  const qc = useQueryClient();
  const toast = useToast();

  const waQuery = useQuery<WhatsappConfig>({
    queryKey: ['sistema', 'whatsapp-config'],
    queryFn: () => api<WhatsappConfig>('/whatsapp/qr'),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const [gerenciaTel, setGerenciaTel] = useState('');
  const [gerenciaNom, setGerenciaNom] = useState('');
  const [tesoreriaTel, setTesoreriaTel] = useState('');
  const [tesoreriaNom, setTesoreriaNom] = useState('');
  const [almacenTel, setAlmacenTel] = useState('');
  const [almacenNom, setAlmacenNom] = useState('');
  const [editado, setEditado] = useState(false);
  const [mostrarQrForzado, setMostrarQrForzado] = useState(false);

  useEffect(() => {
    if (waQuery.data && !editado) {
      if (waQuery.data.receptor_telefono !== undefined) setGerenciaTel(limpiarCelular(waQuery.data.receptor_telefono));
      if (waQuery.data.receptor_nombre !== undefined) setGerenciaNom(waQuery.data.receptor_nombre);
      if (waQuery.data.tesoreria_telefono !== undefined) setTesoreriaTel(limpiarCelular(waQuery.data.tesoreria_telefono));
      if (waQuery.data.tesoreria_nombre !== undefined) setTesoreriaNom(waQuery.data.tesoreria_nombre);
      if (waQuery.data.almacen_telefono !== undefined) setAlmacenTel(limpiarCelular(waQuery.data.almacen_telefono));
      if (waQuery.data.almacen_nombre !== undefined) setAlmacenNom(waQuery.data.almacen_nombre);
    }
  }, [waQuery.data, editado]);

  const guardar = useMutation({
    mutationFn: () =>
      api<{ success: boolean; message?: string }>('/whatsapp/config-receptor', {
        method: 'POST',
        body: {
          telefono: formatearParaEnvio(gerenciaTel),
          nombre: gerenciaNom.trim() || 'Gerencia General',
          tesoreria_telefono: formatearParaEnvio(tesoreriaTel),
          tesoreria_nombre: tesoreriaNom.trim() || 'Tesorería / Pagos',
          almacen_telefono: formatearParaEnvio(almacenTel),
          almacen_nombre: almacenNom.trim() || 'Almacén / Logística',
        },
      }),
    onSuccess: async () => {
      haptic('success');
      toast('¡Contactos de WhatsApp guardados exitosamente!');
      setEditado(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['sistema', 'whatsapp-config'] }),
        qc.invalidateQueries({ queryKey: ['sistema', 'notif-canales'] }),
      ]);
    },
    onError: err => {
      haptic('warning');
      toast(errorMessage(err), 'error');
    },
  });

  const data = waQuery.data;
  const estaConectado = (data?.status === 'CONNECTED' || data?.conectado || canales.whatsapp.estado === 'conectado') && !mostrarQrForzado;
  const instancia = data?.instance || canales.whatsapp.instancia || 'marsisa_bot';
  const qrBase64 = data?.base64 || data?.qr;
  const empresaNombre = data?.empresa_nombre || 'MARSISA S.A.C.';

  return (
    <section className="wa-destacada">
      <div className="wa-header">
        <div className="wa-header__top">
          <div className="wa-header__badge-group">
            <span className="wa-badge-tenant">WhatsApp Multi-Tenant</span>
            <Badge tone="accent">{empresaNombre}</Badge>
          </div>
          <Badge tone={estaConectado ? 'green' : 'amber'}>
            {estaConectado ? 'Bot Conectado' : 'Esperando Vinculación'}
          </Badge>
        </div>
        <h2 className="wa-header__title">Vinculación y Aprobaciones</h2>
        <p className="wa-header__desc">
          Configura el número emisor del bot y los teléfonos responsables de autorizar, pagar y recepcionar compras por Órdenes de Compra.
        </p>
      </div>

      <div className="wa-grid">
        {/* COLUMNA 1: BOT EMISOR / QR */}
        <div className="wa-col-emisor">
          <div className="wa-subseccion-titulo">1. Número Emisor (WhatsApp Bot)</div>

          <div className="wa-bot-card">
            {estaConectado ? (
              <div className="wa-conectado-box">
                <div className="wa-conectado-icono">
                  <CheckCircle2 size={30} strokeWidth={2.5} />
                </div>
                <h3 className="wa-conectado-titulo">¡WhatsApp Emisor Conectado!</h3>
                <p className="wa-conectado-desc">
                  El bot de esta empresa está en línea y listo para despachar mensajes y autorizaciones.
                </p>
              </div>
            ) : (
              <div className="wa-qr-box">
                {qrBase64 ? (
                  <img
                    src={qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                    alt="Código QR WhatsApp"
                  />
                ) : (
                  <div style={{ padding: '60px 16px', color: 'var(--label-2)', fontSize: '0.8125rem' }}>
                    {waQuery.isLoading ? 'Generando código QR...' : 'Sin código QR disponible'}
                  </div>
                )}
              </div>
            )}

            <div className="wa-instancia-tag">
              <span>Instancia:</span>
              <strong>{instancia}</strong>
            </div>

            <div className="wa-instrucciones">
              <ol>
                <li>Abre <strong>WhatsApp</strong> en el teléfono emisor de la empresa.</li>
                <li>Toca los <strong>3 puntos</strong> o <strong>Configuración</strong>.</li>
                <li>Selecciona <strong>Dispositivos vinculados</strong>.</li>
                <li>Toca <strong>Vincular un dispositivo</strong> y apunta la cámara a este código QR.</li>
              </ol>
            </div>

            <div style={{ display: 'flex', gap: 'var(--s-2)', width: '100%', flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
                icon={<RefreshCw size={15} className={waQuery.isFetching ? 'spin' : ''} />}
                loading={waQuery.isFetching}
                onClick={() => {
                  waQuery.refetch();
                  qc.invalidateQueries({ queryKey: ['sistema', 'notif-canales'] });
                }}
                style={{ flex: 1 }}
              >
                Actualizar QR
              </Button>
              {estaConectado ? (
                <Button
                  variant="secondary"
                  icon={<QrCode size={15} />}
                  onClick={() => setMostrarQrForzado(true)}
                  title="Generar nuevo QR para vincular otro teléfono"
                >
                  Reconectar
                </Button>
              ) : mostrarQrForzado ? (
                <Button
                  variant="secondary"
                  onClick={() => setMostrarQrForzado(false)}
                >
                  Volver al estado
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* COLUMNA 2: RECEPTORES DEL FLUJO DE APROBACIÓN */}
        <div className="wa-col-receptores">
          <div className="wa-subseccion-titulo">Contactos de Autorización y Pagos</div>

          {/* 2. RECEPTOR GERENCIA */}
          <div className="wa-receptor-card">
            <div className="wa-receptor-header">
              <div className="wa-receptor-icono wa-receptor-icono--gerencia">
                <ShieldCheck size={20} />
              </div>
              <div className="wa-receptor-info">
                <h3 className="wa-receptor-title">2. Aprobador Directivo (Gerencia)</h3>
                <p className="wa-receptor-sub">Recibirá el enlace interactivo para autorizar cada O/C por WhatsApp</p>
              </div>
            </div>

            <div className="wa-form-row">
              <Field label="Celular WhatsApp de Gerencia" hint="Ingresa los 9 dígitos de celular del dueño o gerente aprobador.">
                {p => (
                  <div className="wa-phone-input">
                    <span className="wa-phone-prefix">+51</span>
                    <input
                      {...p}
                      type="tel"
                      inputMode="numeric"
                      className="wa-phone-field"
                      placeholder="971444110"
                      maxLength={9}
                      value={gerenciaTel}
                      onChange={e => {
                        setEditado(true);
                        setGerenciaTel(e.target.value.replace(/\D/g, '').slice(0, 9));
                      }}
                    />
                  </div>
                )}
              </Field>

              <Field label="Nombre Completo del Aprobador" hint="Aparecerá en el módulo 'Pago de Requerimientos' como Usuario de Aprobación.">
                {p => (
                  <TextInput
                    {...p}
                    placeholder="Ej: Saul Rosas"
                    value={gerenciaNom}
                    onChange={e => {
                      setEditado(true);
                      setGerenciaNom(e.target.value);
                    }}
                  />
                )}
              </Field>
            </div>
          </div>

          {/* 3. RECEPTOR TESORERÍA */}
          <div className="wa-receptor-card">
            <div className="wa-receptor-header">
              <div className="wa-receptor-icono wa-receptor-icono--tesoreria">
                <CreditCard size={20} />
              </div>
              <div className="wa-receptor-info">
                <h3 className="wa-receptor-title">3. Notificación de Pagos (Tesorería / Finanzas)</h3>
                <p className="wa-receptor-sub">Recibirá el aviso automático con el monto y cuenta una vez aprobada la O/C</p>
              </div>
            </div>

            <div className="wa-form-row">
              <Field label="Celular WhatsApp de Tesorería" hint="Ingresa los 9 dígitos del responsable de transferencias bancarias.">
                {p => (
                  <div className="wa-phone-input">
                    <span className="wa-phone-prefix">+51</span>
                    <input
                      {...p}
                      type="tel"
                      inputMode="numeric"
                      className="wa-phone-field"
                      placeholder="919473196"
                      maxLength={9}
                      value={tesoreriaTel}
                      onChange={e => {
                        setEditado(true);
                        setTesoreriaTel(e.target.value.replace(/\D/g, '').slice(0, 9));
                      }}
                    />
                  </div>
                )}
              </Field>

              <Field label="Nombre / Área de Tesorería">
                {p => (
                  <TextInput
                    {...p}
                    placeholder="Ej: Tesorería"
                    value={tesoreriaNom}
                    onChange={e => {
                      setEditado(true);
                      setTesoreriaNom(e.target.value);
                    }}
                  />
                )}
              </Field>
            </div>
          </div>

          {/* 4. RECEPTOR ALMACÉN */}
          <div className="wa-receptor-card">
            <div className="wa-receptor-header">
              <div className="wa-receptor-icono wa-receptor-icono--almacen">
                <Package size={20} />
              </div>
              <div className="wa-receptor-info">
                <h3 className="wa-receptor-title">4. Comprobante de Pago (Almacén / Logística)</h3>
                <p className="wa-receptor-sub">Recibirá la foto/voucher de constancia cuando Tesorería ejecute el pago</p>
              </div>
            </div>

            <div className="wa-form-row">
              <Field label="Celular WhatsApp de Almacén / Solicitante" hint="Ingresa los 9 dígitos del encargado de recepción de compras.">
                {p => (
                  <div className="wa-phone-input">
                    <span className="wa-phone-prefix">+51</span>
                    <input
                      {...p}
                      type="tel"
                      inputMode="numeric"
                      className="wa-phone-field"
                      placeholder="935142537"
                      maxLength={9}
                      value={almacenTel}
                      onChange={e => {
                        setEditado(true);
                        setAlmacenTel(e.target.value.replace(/\D/g, '').slice(0, 9));
                      }}
                    />
                  </div>
                )}
              </Field>

              <Field label="Nombre / Área de Almacén">
                {p => (
                  <TextInput
                    {...p}
                    placeholder="Ej: Almacén / Logística"
                    value={almacenNom}
                    onChange={e => {
                      setEditado(true);
                      setAlmacenNom(e.target.value);
                    }}
                  />
                )}
              </Field>
            </div>
          </div>

          {/* BOTÓN GUARDAR */}
          <div className="wa-guardar-wrapper">
            <Button
              variant="primary"
              icon={<Save size={16} />}
              loading={guardar.isPending}
              onClick={() => guardar.mutate()}
            >
              Guardar Configuración de Contactos
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function TarjetaCorreo({ canales }: { canales: Canales }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [nombre, setNombre] = useState(canales.correo.from_name);
  const [correo, setCorreo] = useState(canales.correo.from_email);
  const [destino, setDestino] = useState('');
  useEffect(() => { setNombre(canales.correo.from_name); setCorreo(canales.correo.from_email); }, [canales.correo.from_name, canales.correo.from_email]);

  const guardar = useMutation({
    mutationFn: () => api('/notificaciones/canales', { method: 'PUT', body: { from_name: nombre.trim(), from_email: correo.trim() } }),
    onSuccess: async () => { haptic('success'); toast('Remitente guardado'); await qc.invalidateQueries({ queryKey: ['sistema', 'notif-canales'] }); },
    onError: err => { toast(errorMessage(err), 'error'); haptic('warning'); },
  });
  const proveedor = useMutation({
    mutationFn: (p: string) => api('/notificaciones/canales', { method: 'PUT', body: { correo_proveedor: p } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sistema', 'notif-canales'] }),
    onError: err => toast(errorMessage(err), 'error'),
  });
  // Envía un correo real: solo al pulsar
  const probar = useMutation({
    mutationFn: () => api<{ ok: boolean; error?: string }>('/notificaciones/prueba', { method: 'POST', body: { canal: 'email', destino: destino.trim() } }),
    onSuccess: r => { if (r.ok) { haptic('success'); toast('Correo de prueba enviado'); } else toast(r.error || 'No se pudo enviar', 'error'); },
    onError: err => toast(errorMessage(err), 'error'),
  });

  return (
    <section className="cfg-tarjeta">
      <h2 className="cfg-titulo"><Mail size={17} /> Correo electrónico</h2>
      <div className="form-grid">
        <Field label="Nombre del remitente">{p => <TextInput {...p} value={nombre} onChange={e => setNombre(e.target.value)} />}</Field>
        <Field label="Correo del remitente">{p => <TextInput {...p} inputMode="email" value={correo} onChange={e => setCorreo(e.target.value)} />}</Field>
        <Field label="Proveedor de envío" wide>
          {p => (
            <SelectInput {...p} value={canales.correo.proveedor} onChange={e => proveedor.mutate(e.target.value)}>
              <option value="ses">Amazon SES (API)</option>
              <option value="smtp">SMTP de la empresa</option>
            </SelectInput>
          )}
        </Field>
      </div>
      <Button variant="secondary" loading={guardar.isPending} onClick={() => guardar.mutate()}>Guardar remitente</Button>
      <div className="cfg-prueba">
        <Field label="Correo de prueba">{p => <TextInput {...p} inputMode="email" value={destino} onChange={e => setDestino(e.target.value)} />}</Field>
        <Button variant="secondary" icon={<Send size={16} />} loading={probar.isPending}
          disabled={!destino.includes('@')} onClick={() => probar.mutate()}>Enviar correo de prueba</Button>
      </div>
    </section>
  );
}

function TarjetaSms({ canales }: { canales: Canales }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [destino, setDestino] = useState('');
  const cambiar = useMutation({
    mutationFn: (body: { sms_proveedor?: string; sms_activo?: boolean }) => api('/notificaciones/canales', { method: 'PUT', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sistema', 'notif-canales'] }),
    onError: err => toast(errorMessage(err), 'error'),
  });
  const probar = useMutation({
    mutationFn: () => api<{ ok: boolean; error?: string }>('/notificaciones/prueba', { method: 'POST', body: { canal: 'sms', destino: destino.trim() } }),
    onSuccess: r => { if (r.ok) { haptic('success'); toast('SMS de prueba enviado'); } else toast(r.error || 'No se pudo enviar', 'error'); },
    onError: err => toast(errorMessage(err), 'error'),
  });
  return (
    <section className="cfg-tarjeta">
      <h2 className="cfg-titulo"><Smartphone size={17} /> SMS</h2>
      <div className="cfg-fila">
        <div className="cfg-fila__texto"><strong>Activo</strong><span>Las credenciales del proveedor van en el servidor (.env), no aquí.</span></div>
        <Switch id="sms-activo" checked={canales.sms.activo} onChange={v => cambiar.mutate({ sms_activo: v })} label="Activar SMS" />
      </div>
      <Field label="Proveedor">
        {p => (
          <SelectInput {...p} value={canales.sms.proveedor} onChange={e => cambiar.mutate({ sms_proveedor: e.target.value })}>
            <option value="twilio">Twilio</option>
            <option value="infobip">Infobip</option>
          </SelectInput>
        )}
      </Field>
      <div className="cfg-prueba">
        <Field label="Número de prueba">{p => <TextInput {...p} inputMode="tel" value={destino} onChange={e => setDestino(e.target.value)} />}</Field>
        <Button variant="secondary" icon={<Send size={16} />} loading={probar.isPending}
          disabled={destino.replace(/\D/g, '').length < 9} onClick={() => probar.mutate()}>Enviar SMS de prueba</Button>
      </div>
    </section>
  );
}

function TabCanales() {
  const q = useQuery<Canales>({ queryKey: ['sistema', 'notif-canales'], queryFn: () => api('/notificaciones/canales') });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <Notice tone="error">{errorMessage(q.error)}</Notice>;
  const c = q.data!;
  return (
    <div>
      <SeccionWhatsappMultiTenant canales={c} />

      <div className="wa-seccion-otros">
        <h3>Otros Canales de Comunicación</h3>
        <div className="cfg-grid">
          <TarjetaCorreo canales={c} />
          <TarjetaSms canales={c} />
        </div>
      </div>
    </div>
  );
}

function TarjetaEvento({ regla }: { regla: Regla }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [activo, setActivo] = useState(regla.activo);
  const [canales, setCanales] = useState<Canal[]>(regla.canales);
  const [destinatarios, setDestinatarios] = useState(regla.destinatarios);
  useEffect(() => { setActivo(regla.activo); setCanales(regla.canales); setDestinatarios(regla.destinatarios); }, [regla]);

  const guardar = useMutation({
    mutationFn: (body: { activo: boolean; canales: Canal[]; destinatarios: string }) =>
      api(`/notificaciones/reglas/${encodeURIComponent(regla.evento)}`, { method: 'PUT', body }),
    onSuccess: async () => { haptic('success'); toast('Regla guardada'); await qc.invalidateQueries({ queryKey: ['sistema', 'notif-reglas'] }); },
    onError: err => { toast(errorMessage(err), 'error'); haptic('warning'); },
  });
  const alternar = (c: Canal) => setCanales(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]);

  return (
    <section className="cfg-tarjeta">
      <div className="cfg-fila">
        <div className="cfg-fila__texto"><strong>{regla.titulo}</strong><span>{regla.detalle}</span></div>
        <Switch id={`ev-${regla.evento}`} checked={activo} onChange={setActivo} label={`Activar ${regla.titulo}`} />
      </div>
      <div className="cfg-prueba" role="group" aria-label="Canales">
        {(['whatsapp', 'email', 'sms', 'push'] as Canal[]).map(c => (
          <button key={c} type="button" aria-pressed={canales.includes(c)} onClick={() => alternar(c)}
            className={canales.includes(c) ? 'cfg-boton-secundario cfg-boton--on' : 'cfg-boton-secundario'}>
            <IconoCanal canal={c} /> {NOMBRE_CANAL[c]}
          </button>
        ))}
      </div>
      <Field label="Destinatarios adicionales (opcional)" hint="Teléfonos para WhatsApp o SMS, correos para Correo. Teléfono (app) llega solo a quien tiene el permiso del evento; aquí solo agregas extras. Separados por coma.">
        {p => <TextInput {...p} value={destinatarios} onChange={e => setDestinatarios(e.target.value)} />}
      </Field>
      <Button variant="primary" loading={guardar.isPending}
        onClick={() => guardar.mutate({ activo, canales, destinatarios })}>Guardar</Button>
    </section>
  );
}

interface ResumenVencimientos { vencidos?: number; porVencer?: number; texto?: string }
interface EnvioVencimientos { enviados?: number; fallidos?: number; motivo?: string }

// Resumen diario de documentos de flota por vencer: se puede ver lo que saldría o enviarlo ahora (envío real)
function TarjetaVencimientos() {
  const qc = useQueryClient();
  const toast = useToast();
  const [resumen, setResumen] = useState<ResumenVencimientos | null>(null);
  const [confirmar, setConfirmar] = useState(false);

  const ver = useMutation({
    mutationFn: () => api<ResumenVencimientos>('/notificaciones/vista-previa/flota_vencimiento'),
    onSuccess: r => setResumen(r),
    onError: err => toast(errorMessage(err), 'error'),
  });
  const enviar = useMutation({
    mutationFn: () => api<EnvioVencimientos>('/notificaciones/ejecutar/flota_vencimiento', { method: 'POST' }),
    onSuccess: r => {
      haptic(r.motivo ? 'warning' : 'success');
      toast(r.motivo ? `No se envió: ${r.motivo}` : `Resumen enviado (${r.enviados ?? 0} enviados${r.fallidos ? `, ${r.fallidos} fallidos` : ''})`, r.motivo ? 'error' : 'success');
      qc.invalidateQueries({ queryKey: ['sistema', 'notif-historial'] });
    },
    onError: err => { toast(errorMessage(err), 'error'); haptic('warning'); },
  });

  return (
    <>
      <section className="cfg-tarjeta">
        <div className="cfg-fila">
          <div className="cfg-fila__texto">
            <strong>Vencimientos de documentos de flota</strong>
            <span>SOAT, revisión técnica y demás documentos. Sale una vez al día a las 7:00 (hora de Lima) si la regla está activa.</span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            <Button variant="secondary" loading={ver.isPending} onClick={() => ver.mutate()}>Ver resumen de hoy</Button>
            <Button variant="primary" icon={<Send size={16} />} loading={enviar.isPending} onClick={() => setConfirmar(true)}>Enviar ahora</Button>
          </div>
        </div>
      </section>

      <Sheet open={!!resumen} onClose={() => setResumen(null)} title="Resumen de vencimientos"
        footer={<Button variant="secondary" onClick={() => setResumen(null)}>Cerrar</Button>}>
        {resumen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            <p className="t-footnote c-secondary">{resumen.vencidos ?? 0} vencidos · {resumen.porVencer ?? 0} por vencer en 30 días. Esto solo se muestra: no se envió nada.</p>
            {resumen.texto
              ? <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', margin: 0 }}>{resumen.texto}</pre>
              : <EmptyState icon={<Send size={22} />} title="Nada que avisar">No hay documentos vencidos ni por vencer en 30 días.</EmptyState>}
          </div>
        )}
      </Sheet>

      <ConfirmSheet open={confirmar} onClose={() => !enviar.isPending && setConfirmar(false)} loading={enviar.isPending}
        title="¿Enviar el resumen ahora?"
        message="Se envía de verdad a los destinatarios de la regla de vencimientos, por los canales activos (WhatsApp y correo)."
        confirmLabel="Enviar"
        onConfirm={async () => { await enviar.mutateAsync(); setConfirmar(false); }} />
    </>
  );
}

function TabEventos() {
  const q = useQuery<Regla[]>({ queryKey: ['sistema', 'notif-reglas'], queryFn: () => api('/notificaciones/reglas') });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <Notice tone="error">{errorMessage(q.error)}</Notice>;
  return (
    <>
      <TarjetaVencimientos />
      <div className="cfg-grid">{(q.data ?? []).map(r => <TarjetaEvento key={r.evento} regla={r} />)}</div>
    </>
  );
}

function TabHistorial() {
  const q = useQuery<Envio[]>({ queryKey: ['sistema', 'notif-historial'], queryFn: () => api('/notificaciones/historial?limit=50'), refetchInterval: 30_000 });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <Notice tone="error">{errorMessage(q.error)}</Notice>;
  const filas = q.data ?? [];
  if (!filas.length) return <EmptyState icon={<Send size={22} />} title="Sin envíos todavía">Aquí aparecen las notificaciones que salen del sistema.</EmptyState>;
  return (
    <section className="cfg-tarjeta">
      {filas.map(f => (
        <div key={f.id} className="cfg-fila">
          <div className="cfg-fila__texto">
            <strong><IconoCanal canal={f.canal} /> {f.asunto || f.evento || 'Notificación'} · {f.destinatario}</strong>
            <span>{formatFechaHoraPe(f.created_at)}{f.error ? ` · ${f.error}` : ''}</span>
          </div>
          <Badge tone={TONO_ESTADO[f.estado] ?? 'gray'}>{TEXTO_ESTADO[f.estado] ?? f.estado}</Badge>
        </div>
      ))}
    </section>
  );
}

// Sistema › Notificaciones: canales de envío, reglas por evento e historial.
export function NotificacionesPage() {
  const [pestana, setPestana] = useState<Pestana>('canales');
  return (
    <Page>
      <PageHeader
        eyebrow="Configuración"
        title="Notificaciones"
        subtitle="WhatsApp, correo y SMS para avisar a personal y conductores."
      />
      <div className="aud-filtros">
        <SegmentedControl<Pestana> label="Sección" value={pestana} onChange={setPestana}
          options={[
            { value: 'canales', label: 'Canales de comunicación' },
            { value: 'eventos', label: 'Eventos' },
            { value: 'historial', label: 'Historial' },
          ]} />
      </div>
      {pestana === 'canales' && <TabCanales />}
      {pestana === 'eventos' && <TabEventos />}
      {pestana === 'historial' && <TabHistorial />}
      {pestana !== 'historial' && <Notice tone="neutral">Las pruebas envían un mensaje real: úsalo con tu propio número o correo.</Notice>}
    </Page>
  );
}
