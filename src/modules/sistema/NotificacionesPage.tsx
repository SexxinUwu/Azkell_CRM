import './configuracion.css';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Mail, MessageCircle, QrCode, RefreshCw, Send, Smartphone } from 'lucide-react';
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

function TarjetaWhatsapp({ canales }: { canales: Canales }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [qr, setQr] = useState<{ qr: string | null; codigo: string | null; conectado?: boolean } | null>(null);
  const wa = canales.whatsapp;
  const verQr = useMutation({
    mutationFn: () => api<{ conectado: boolean; qr: string | null; codigo: string | null }>('/notificaciones/whatsapp/qr'),
    onSuccess: r => { setQr(r); if (r.conectado) toast('WhatsApp ya está conectado'); },
    onError: err => toast(errorMessage(err), 'error'),
  });
  return (
    <section className="cfg-tarjeta">
      <h2 className="cfg-titulo"><MessageCircle size={17} /> WhatsApp</h2>
      <div className="cfg-fila__texto">
        <span>Instancia: {wa.instancia || 'sin asignar'}</span>
        <span><Badge tone={TONO_ESTADO[wa.estado] ?? 'gray'}>{TEXTO_ESTADO[wa.estado] ?? wa.estado}</Badge></span>
        {wa.detalle && <span className="cfg-ayuda">{wa.detalle}</span>}
      </div>
      <div className="cfg-prueba">
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => qc.invalidateQueries({ queryKey: ['sistema', 'notif-canales'] })}>Sincronizar</Button>
        <Button variant="secondary" icon={<QrCode size={16} />} loading={verQr.isPending} onClick={() => verQr.mutate()}>Ver QR</Button>
      </div>
      {qr && !qr.conectado && (
        <div className="cfg-logo__vista">
          {qr.qr ? <img src={qr.qr.startsWith('data:') ? qr.qr : `data:image/png;base64,${qr.qr}`} alt="QR para vincular WhatsApp" />
            : <span className="cfg-ayuda">{qr.codigo ? `Código: ${qr.codigo}` : 'No hay QR disponible ahora.'}</span>}
        </div>
      )}
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
    <div className="cfg-grid">
      <TarjetaWhatsapp canales={c} />
      <TarjetaCorreo canales={c} />
      <TarjetaSms canales={c} />
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
      <Field label="Destinatarios" hint="Teléfonos para WhatsApp o SMS, correos para Correo y Teléfono (app). Separados por coma. Ej.: 999000111, gerencia@empresa.com">
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
