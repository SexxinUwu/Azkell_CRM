import { useState } from 'react';
import { KeyRound, Fingerprint, ShieldCheck, Trash2, Plus, RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Page, PageHeader, Notice, EmptyState } from '../../core/ui/Display';
import { PageLoader } from '../../core/ui/Button';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe } from '../../core/lib/format';

interface TwoFAStatus {
  totp_activo: boolean;
  webauthn_count: number;
  webauthn_credentials: { id: string; nombre: string; device_type: string; backed_up: boolean; created_at: string }[];
}

// ─── TOTP Setup ───────────────────────────────────────────────────────────────
function TOTPSetup({ onDone }: { onDone: () => void }) {
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [codigo, setCodigo] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function iniciarSetup() {
    setLoading(true);
    try {
      const r = await api('/2fa/totp/setup', { method: 'POST' }) as { qr: string; secret: string };
      setQr(r.qr);
      setSecret(r.secret);
      setMsg('');
    } catch (e) { setMsg(errorMessage(e)); }
    setLoading(false);
  }

  async function confirmar() {
    if (codigo.length < 6) return setMsg('Ingresa el código de 6 dígitos');
    setLoading(true);
    try {
      await api('/2fa/totp/verify', { method: 'POST', body: { codigo } });
      onDone();
    } catch (e) { setMsg(errorMessage(e)); }
    setLoading(false);
  }

  if (!qr) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--label-2)', margin: 0 }}>
          Vincula tu cuenta con Google Authenticator, Authy u otra app TOTP compatible. Se generará un código único de 6 dígitos cada 30 segundos.
        </p>
        {msg && <Notice tone="error">{msg}</Notice>}
        <button
          type="button"
          disabled={loading}
          onClick={iniciarSetup}
          style={{ alignSelf: 'flex-start', padding: '8px 18px', borderRadius: 8, background: 'var(--ink)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }}
        >
          {loading ? 'Generando…' : 'Configurar autenticador'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--label-2)' }}>
        1. Escanea este código QR con tu app autenticadora.<br />
        2. Ingresa el código de 6 dígitos que aparece en la app para confirmar.
      </p>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <img src={qr} alt="QR 2FA" style={{ width: 160, height: 160, borderRadius: 10, border: '1px solid var(--separator)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: '14rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--label-2)', fontWeight: 600 }}>Clave manual (si no puedes escanear)</div>
          <code style={{ fontSize: '0.82rem', background: 'var(--fill-2)', padding: '6px 10px', borderRadius: 6, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{secret}</code>
          <input
            type="text"
            inputMode="numeric"
            placeholder="Código de 6 dígitos"
            maxLength={6}
            value={codigo}
            onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', fontSize: '1.1rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.2em', textAlign: 'center', width: '10rem' }}
          />
          {msg && <Notice tone="error">{msg}</Notice>}
          <button
            type="button"
            disabled={loading || codigo.length < 6}
            onClick={confirmar}
            style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--ink)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', alignSelf: 'flex-start', opacity: codigo.length < 6 ? 0.5 : 1 }}
          >
            {loading ? 'Verificando…' : 'Activar 2FA'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TOTP Disable ─────────────────────────────────────────────────────────────
function TOTPDisable({ onDone }: { onDone: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function desactivar() {
    setLoading(true);
    try {
      await api('/2fa/totp/disable', { method: 'POST', body: { codigo } });
      onDone();
    } catch (e) { setMsg(errorMessage(e)); }
    setLoading(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--label-2)' }}>
        Ingresa un código de tu app autenticadora para confirmar la desactivación.
      </p>
      <input
        type="text"
        inputMode="numeric"
        placeholder="Código de 6 dígitos"
        maxLength={6}
        value={codigo}
        onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', fontSize: '1.1rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.2em', textAlign: 'center', width: '10rem' }}
      />
      {msg && <Notice tone="error">{msg}</Notice>}
      <button
        type="button"
        disabled={loading || codigo.length < 6}
        onClick={desactivar}
        style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--red-ink)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', alignSelf: 'flex-start', opacity: codigo.length < 6 ? 0.5 : 1 }}
      >
        {loading ? 'Desactivando…' : 'Confirmar desactivación'}
      </button>
    </div>
  );
}

// ─── WebAuthn Passkey Registration ────────────────────────────────────────────
function WebAuthnRegister({ onDone }: { onDone: () => void }) {
  const [nombre, setNombre] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function registrar() {
    if (!window.PublicKeyCredential) {
      return setMsg('Tu navegador no soporta Passkeys. Usa Chrome, Edge o Safari actualizado.');
    }
    setLoading(true);
    try {
      const options = await api('/2fa/webauthn/register-options') as PublicKeyCredentialCreationOptions & {
        challenge: string;
        user: { id: string; name: string; displayName: string };
        excludeCredentials?: { id: string; transports?: string[] }[];
      };

      // Convertir strings base64url a ArrayBuffer
      function b64url(s: string) {
        return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)).buffer;
      }

      const publicKeyOptions: PublicKeyCredentialCreationOptions = {
        ...options,
        challenge: b64url(options.challenge as unknown as string),
        user: {
          ...options.user,
          id: b64url(options.user.id as unknown as string),
        },
        excludeCredentials: options.excludeCredentials?.map(c => ({
          ...c,
          id: b64url(c.id as unknown as string),
          type: 'public-key' as const,
        })),
      };

      const credential = await navigator.credentials.create({ publicKey: publicKeyOptions }) as PublicKeyCredential;
      if (!credential) throw new Error('Cancelado por el usuario');

      const resp = credential.response as AuthenticatorAttestationResponse;

      function ab2b64(buf: ArrayBuffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      }

      await api('/2fa/webauthn/register-verify', {
        method: 'POST',
        body: {
          nombre: nombre || undefined,
          credential: {
            id: credential.id,
            rawId: ab2b64(credential.rawId),
            type: credential.type,
            response: {
              clientDataJSON: ab2b64(resp.clientDataJSON),
              attestationObject: ab2b64(resp.attestationObject),
              transports: resp.getTransports?.() ?? [],
            },
          },
        },
      });

      onDone();
    } catch (e) {
      const err = e as Error;
      if (err.name === 'NotAllowedError') setMsg('Operación cancelada o denegada por el dispositivo.');
      else setMsg(errorMessage(e));
    }
    setLoading(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--label-2)' }}>
        Registra una Passkey usando la huella digital, Face ID o clave PIN de tu dispositivo.
      </p>
      <input
        type="text"
        placeholder="Nombre de esta clave (ej: MacBook, iPhone)"
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', fontSize: '0.875rem', maxWidth: '22rem' }}
      />
      {msg && <Notice tone="error">{msg}</Notice>}
      <button
        type="button"
        disabled={loading}
        onClick={registrar}
        style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--ink)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <Fingerprint size={16} />
        {loading ? 'Activando…' : 'Registrar Passkey'}
      </button>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function Seguridad2FAPage() {
  const qc = useQueryClient();
  const [seccionTOTP, setSeccionTOTP] = useState<'idle' | 'setup' | 'disable'>('idle');
  const [seccionWA, setSeccionWA] = useState(false);
  const [msgOK, setMsgOK] = useState('');

  const status = useQuery<TwoFAStatus>({
    queryKey: ['sistema', '2fa-status'],
    queryFn: () => api('/2fa/status') as Promise<TwoFAStatus>,
    staleTime: 30_000,
  });

  function invalidar() {
    qc.invalidateQueries({ queryKey: ['sistema', '2fa-status'] });
    setSeccionTOTP('idle');
    setSeccionWA(false);
  }

  async function eliminarPasskey(id: string) {
    try {
      await api(`/2fa/webauthn/credentials/${id}`, { method: 'DELETE' });
      setMsgOK('Passkey eliminada correctamente.');
      invalidar();
    } catch {}
  }

  if (status.isLoading) return <Page><PageLoader /></Page>;

  if (status.isError || !status.data) {
    return (
      <Page>
        <PageHeader eyebrow="Sistema" title="Seguridad de cuenta — 2FA" subtitle="Protege tu cuenta con un segundo factor de autenticación" />
        <Notice tone="error">No se pudo cargar el estado 2FA. Verifica tu sesión e intenta de nuevo.</Notice>
      </Page>
    );
  }

  const s = status.data;

  return (
    <Page>
      <PageHeader
        eyebrow="Sistema"
        title="Seguridad de cuenta — 2FA"
        subtitle="Protege tu cuenta con un segundo factor de autenticación"
        actions={
          <button type="button" onClick={() => status.refetch()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--label-2)', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
            <RefreshCw size={14} />
            Actualizar
          </button>
        }
      />

      {msgOK && <div onClick={() => setMsgOK('')}><Notice tone="success">{msgOK}</Notice></div>}

      {/* ── TOTP ─────────────────────────────────────────────────────────── */}
      <div className="tarjeta__lista" style={{ padding: 'var(--s-3)', marginBottom: 'var(--s-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <KeyRound size={20} style={{ color: s.totp_activo ? 'var(--green-ink)' : 'var(--label-2)' }} />
            <div>
              <div style={{ fontWeight: 700 }}>Autenticador TOTP</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--label-2)', marginTop: 2 }}>
                Google Authenticator, Authy, 1Password, etc.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
              background: s.totp_activo ? 'color-mix(in srgb, var(--green-ink) 15%, transparent)' : 'var(--fill-2)',
              color: s.totp_activo ? 'var(--green-ink)' : 'var(--label-2)',
              border: `1px solid ${s.totp_activo ? 'var(--green-ink)' : 'var(--separator)'}`,
            }}>
              {s.totp_activo ? 'Activo' : 'Inactivo'}
            </span>
            {s.totp_activo ? (
              <button type="button" className="pressable" onClick={() => { haptic('selection'); setSeccionTOTP(seccionTOTP === 'disable' ? 'idle' : 'disable'); }}
                style={{ padding: '5px 12px', borderRadius: 7, background: 'var(--fill-2)', border: '1px solid var(--separator)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: 'var(--red-ink)' }}>
                {seccionTOTP === 'disable' ? 'Cancelar' : 'Desactivar'}
              </button>
            ) : (
              <button type="button" className="pressable" onClick={() => { haptic('selection'); setSeccionTOTP(seccionTOTP === 'setup' ? 'idle' : 'setup'); }}
                style={{ padding: '5px 12px', borderRadius: 7, background: 'var(--ink)', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#fff' }}>
                {seccionTOTP === 'setup' ? 'Cancelar' : 'Activar'}
              </button>
            )}
          </div>
        </div>

        {seccionTOTP === 'setup' && (
          <TOTPSetup onDone={() => { invalidar(); setMsgOK('¡Autenticador TOTP activado correctamente!'); }} />
        )}
        {seccionTOTP === 'disable' && (
          <TOTPDisable onDone={() => { invalidar(); setMsgOK('Autenticador TOTP desactivado.'); }} />
        )}
      </div>

      {/* ── WebAuthn / Passkeys ──────────────────────────────────────────── */}
      <div className="tarjeta__lista" style={{ padding: 'var(--s-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Fingerprint size={20} style={{ color: s.webauthn_count > 0 ? 'var(--label-1)' : 'var(--label-2)' }} />
            <div>
              <div style={{ fontWeight: 700 }}>Passkeys (WebAuthn / FIDO2)</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--label-2)', marginTop: 2 }}>
                Huella digital, Face ID, clave PIN del dispositivo
              </div>
            </div>
          </div>
          <button type="button" className="pressable" onClick={() => { haptic('selection'); setSeccionWA(!seccionWA); }}
            style={{ padding: '5px 12px', borderRadius: 7, background: seccionWA ? 'var(--fill-2)' : 'var(--ink)', border: seccionWA ? '1px solid var(--separator)' : 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: seccionWA ? 'var(--label-1)' : '#fff', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={14} />
            {seccionWA ? 'Cancelar' : 'Añadir Passkey'}
          </button>
        </div>

        {seccionWA && (
          <div style={{ marginBottom: 'var(--s-3)', padding: 'var(--s-3)', background: 'var(--fill-1)', borderRadius: 10, border: '1px solid var(--separator)' }}>
            <WebAuthnRegister onDone={() => { invalidar(); setMsgOK('Passkey registrada correctamente.'); }} />
          </div>
        )}

        {s.webauthn_credentials.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={22} />} title="Sin Passkeys registradas">
            Añade una Passkey para iniciar sesión sin contraseña usando biometría.
          </EmptyState>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {s.webauthn_credentials.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'var(--fill-1)', border: '1px solid var(--separator)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Fingerprint size={16} style={{ color: 'var(--label-1)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{c.nombre}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--label-2)' }}>
                      {c.device_type} · {c.backed_up ? 'Con respaldo en nube' : 'Solo dispositivo'} · {formatFechaPe(c.created_at)}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => eliminarPasskey(c.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-ink)', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', padding: '4px 8px' }}>
                  <Trash2 size={14} />
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
