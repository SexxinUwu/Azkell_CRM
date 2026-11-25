import '../flota/documentos.css';
import './asistencia.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CameraOff, LogIn, LogOut, ScanLine, SwitchCamera, TriangleAlert } from 'lucide-react';
import { Page } from '../../core/ui/Display';
import { BotonTip } from '../../core/ui/BotonTip';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { cargarLibreria, type Html5QrcodeInstancia } from '../almacen/EscanerQr';

// Personas y seguridad › Marcación por QR: la cámara lee el QR del fotocheck y marca ingreso o salida.
// Sin un ingreso abierto, la lectura es un ingreso; con un ingreso abierto, es la salida de ese turno (lo decide el servidor).

interface PersonaMarca { id: number; nombres: string; apellidos: string; cargo: string | null; categoria_rol: string | null; foto_url: string | null }
interface RespuestaMarca {
  ok: boolean; ignorada?: boolean; tipo?: 'INGRESO' | 'SALIDA'; hora?: string; mensaje?: string;
  tardanza_min?: number; horas_trabajadas?: number; horas_extras?: number; persona?: PersonaMarca;
}
type Resultado = { clase: 'ok-ingreso' | 'ok-salida' | 'aviso' | 'error'; titulo: string; detalle?: string; persona?: PersonaMarca; hora?: string };
interface FilaMarca { id: number; tipo: 'INGRESO' | 'SALIDA'; hora: string; nombres: string; apellidos: string; cargo: string | null }

const ESPERA_MISMO_CODIGO_MS = 4000;
const VISIBLE_RESULTADO_MS = 6000;

function pitido(tono: 'ok' | 'error') {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx(); const osc = ctx.createOscillator(); const gan = ctx.createGain();
    osc.frequency.value = tono === 'ok' ? 880 : 220; gan.gain.value = 0.08;
    osc.connect(gan); gan.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + (tono === 'ok' ? 0.12 : 0.3));
    window.setTimeout(() => { void ctx.close(); }, 500);
  } catch { /* sin sonido */ }
}

const horasTexto = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} h`;

export function MarcacionQrPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const elementoId = 'marcacion-qr-lector';
  const [frontal, setFrontal] = useState(false);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [hora, setHora] = useState('');
  const ultimo = useRef<{ codigo: string; en: number }>({ codigo: '', en: 0 });
  const ocupado = useRef(false);
  const temporizador = useRef<number | null>(null);

  const lista = useQuery<{ marcaciones: FilaMarca[] }>({
    queryKey: ['rrhh', 'marcaciones'],
    queryFn: () => api<{ marcaciones: FilaMarca[] }>('/rrhh/marcaciones'),
    refetchInterval: 20_000,
  });

  useEffect(() => {
    const t = () => setHora(new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/Lima' }));
    t(); const i = window.setInterval(t, 1000);
    return () => window.clearInterval(i);
  }, []);

  const mostrar = useCallback((r: Resultado) => {
    setResultado(r);
    if (temporizador.current) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setResultado(null), VISIBLE_RESULTADO_MS);
  }, []);

  const marcar = useCallback(async (codigo: string) => {
    const ahora = Date.now();
    if (ocupado.current || (ultimo.current.codigo === codigo && ahora - ultimo.current.en < ESPERA_MISMO_CODIGO_MS)) return;
    ultimo.current = { codigo, en: ahora };
    ocupado.current = true;
    try {
      const r = await api<RespuestaMarca>('/rrhh/marcacion/qr', { method: 'POST', body: { codigo, dispositivo: navigator.userAgent.slice(0, 100) } });
      if (r.ignorada) {
        pitido('error'); haptic('warning');
        mostrar({ clase: 'aviso', titulo: r.mensaje || 'Ya marcaste hace un momento.', persona: r.persona, hora: r.hora });
      } else if (r.tipo === 'INGRESO') {
        pitido('ok'); haptic('success');
        mostrar({ clase: 'ok-ingreso', titulo: 'Ingreso', persona: r.persona, hora: r.hora,
          detalle: r.tardanza_min ? `Tardanza de ${r.tardanza_min} min` : 'A tiempo' });
      } else {
        pitido('ok'); haptic('success');
        const extra = r.horas_extras ? ` · ${horasTexto(r.horas_extras)} extra` : '';
        mostrar({ clase: 'ok-salida', titulo: 'Salida', persona: r.persona, hora: r.hora,
          detalle: r.horas_trabajadas != null ? `Trabajó ${horasTexto(r.horas_trabajadas)}${extra}` : undefined });
      }
      void qc.invalidateQueries({ queryKey: ['rrhh', 'marcaciones'] });
    } catch (err) {
      pitido('error'); haptic('warning');
      mostrar({ clase: 'error', titulo: errorMessage(err) });
    } finally {
      ocupado.current = false;
    }
  }, [mostrar, qc]);
  const marcarRef = useRef(marcar);
  marcarRef.current = marcar;

  // Cámara: se enciende al entrar y se apaga al salir; "frontal" sirve para PC o tablet con cámara hacia el usuario
  useEffect(() => {
    let cancelado = false;
    let instancia: Html5QrcodeInstancia | null = null;
    setErrorCamara(null);
    const espera = window.setTimeout(() => {
      cargarLibreria()
        .then(Ctor => {
          if (cancelado) return undefined;
          instancia = new Ctor(elementoId);
          return instancia.start({ facingMode: frontal ? 'user' : 'environment' }, { fps: 10, qrbox: { width: 260, height: 260 } },
            texto => { void marcarRef.current(texto); }, () => { /* cuadros sin código */ });
        })
        .catch(err => { if (!cancelado) setErrorCamara(err instanceof Error ? err.message : 'No se pudo abrir la cámara'); });
    }, 150);
    return () => {
      cancelado = true;
      window.clearTimeout(espera);
      const activa = instancia;
      if (activa) activa.stop().catch(() => {}).finally(() => { try { activa.clear(); } catch { /* ya limpio */ } });
    };
  }, [frontal]);

  useEffect(() => () => { if (temporizador.current) window.clearTimeout(temporizador.current); }, []);

  const iniciales = (p: PersonaMarca) => `${p.nombres.charAt(0)}${p.apellidos.charAt(0)}`.toUpperCase();
  const filas = lista.data?.marcaciones ?? [];

  return (
    <Page wide fill>
      <header className="doc-cab asis-cab">
        <BotonTip tip="Volver a Asistencia" className="btn btn--plain btn--icono btn--icono-acento" onClick={() => navigate('/personas/asistencia')}><ArrowLeft size={18} /></BotonTip>
        <div className="doc-cab__titulo">
          <span className="t-eyebrow">Personas y seguridad</span>
          <h1 className="doc-cab__h1">Marcación por QR</h1>
        </div>
        <div className="doc-cab__acciones">
          <span className="marc-reloj t-numeric" aria-label="Hora actual">{hora}</span>
          <BotonTip tip={frontal ? 'Usar cámara trasera' : 'Usar cámara frontal'} className="btn btn--plain btn--icono btn--icono-acento" onClick={() => setFrontal(f => !f)}><SwitchCamera size={18} /></BotonTip>
        </div>
      </header>

      <div className="marc-cuerpo">
        <section className="marc-camara" aria-label="Cámara">
          <div id={elementoId} className="marc-video" />
          {errorCamara
            ? <p className="marc-pie marc-pie--error"><CameraOff size={16} /> {errorCamara}</p>
            : <p className="marc-pie"><ScanLine size={16} /> Acerca el QR del fotocheck a la cámara</p>}
        </section>

        <section className="marc-lado">
          <div className={`marc-resultado${resultado ? ` marc-resultado--${resultado.clase}` : ''}`} aria-live="polite">
            {!resultado ? (
              <div className="marc-vacio"><ScanLine size={40} /><span>Esperando fotocheck…</span></div>
            ) : (
              <>
                {resultado.persona && (
                  <div className="marc-persona">
                    {resultado.persona.foto_url
                      ? <img className="marc-foto" src={resultado.persona.foto_url} alt="" />
                      : <span className="marc-foto marc-foto--ini">{iniciales(resultado.persona)}</span>}
                    <div className="marc-nombre">
                      <strong>{resultado.persona.apellidos}, {resultado.persona.nombres}</strong>
                      <small>{resultado.persona.cargo || resultado.persona.categoria_rol || ''}</small>
                    </div>
                  </div>
                )}
                <div className="marc-estado">
                  {resultado.clase === 'ok-ingreso' && <LogIn size={30} />}
                  {resultado.clase === 'ok-salida' && <LogOut size={30} />}
                  {(resultado.clase === 'error' || resultado.clase === 'aviso') && <TriangleAlert size={30} />}
                  <div>
                    <strong>{resultado.titulo}{resultado.hora ? ` · ${resultado.hora}` : ''}</strong>
                    {resultado.detalle && <small>{resultado.detalle}</small>}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="marc-lista">
            <h2 className="marc-lista__titulo">Marcaciones de hoy <span className="t-numeric">{filas.length}</span></h2>
            <div className="marc-lista__filas">
              {filas.length === 0 ? <p className="t-footnote c-secondary">Aún no hay marcaciones hoy.</p> : filas.map(f => (
                <div key={f.id} className="marc-fila">
                  <span className="t-numeric marc-fila__hora">{f.hora}</span>
                  <span className={`marc-chip marc-chip--${f.tipo === 'INGRESO' ? 'in' : 'out'}`}>{f.tipo === 'INGRESO' ? 'Ingreso' : 'Salida'}</span>
                  <span className="marc-fila__nombre"><strong>{f.apellidos}, {f.nombres}</strong><small>{f.cargo || ''}</small></span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </Page>
  );
}
