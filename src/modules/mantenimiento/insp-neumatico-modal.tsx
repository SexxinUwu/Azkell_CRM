import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, Images, Minus, Plus, X } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Sheet } from '../../core/ui/Sheet';
import { prepararEvidencia } from '../../core/lib/imagen';
import type { LlantaTablero } from './neumaticos-tablero-tipos';
import { tituloLlanta } from './ntb-api';

// Ventana de una posición dentro de la inspección: R1, R2 y R3 con − / + y la evidencia (fotos del neumático).

export const MAX_FOTOS = 3;
const MAX_MM = 25;

export interface MedidaPosicion { r1: string; r2: string; r3: string; fotos: string[]; psiEncontrado: string; psiDejado: string; estado: string; obs: string }

function Contador({ etiqueta, valor, onCambiar }: { etiqueta: string; valor: string; onCambiar: (v: string) => void }) {
  const n = Number(valor) || 0;
  return (
    <div className="ninsp-contador">
      <span className="ninsp-contador__etiqueta">{etiqueta}</span>
      <div className="ninsp-contador__control">
        <button type="button" aria-label={`Bajar ${etiqueta}`} disabled={n <= 0} onClick={() => onCambiar(String(Math.max(0, n - 1)))}><Minus size={16} /></button>
        <input inputMode="numeric" aria-label={`${etiqueta} en milímetros`} value={valor} onChange={e => onCambiar(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        <button type="button" aria-label={`Subir ${etiqueta}`} disabled={n >= MAX_MM} onClick={() => onCambiar(String(Math.min(MAX_MM, n + 1)))}><Plus size={16} /></button>
      </div>
      <span className="ninsp-contador__unidad">mm</span>
    </div>
  );
}

/** Foto reducida como texto (data URL) para enviarla con la inspección: el servidor la guarda en S3 */
async function comoDataUrl(f: File): Promise<string> {
  const reducida = await prepararEvidencia(f);
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('No se pudo leer la foto.'));
    r.readAsDataURL(reducida);
  });
}

export function InspeccionPosicionSheet({ abierta, posicion, llanta, inicial, onConfirmar, onClose }: {
  abierta: boolean;
  posicion: string;
  llanta: LlantaTablero | null;
  /** Lo último que se conoce de esa llanta (o lo ya confirmado en esta inspección) */
  inicial: MedidaPosicion;
  onConfirmar: (m: MedidaPosicion) => void;
  onClose: () => void;
}) {
  const [r, setR] = useState({ r1: '', r2: '', r3: '' });
  const [fotos, setFotos] = useState<string[]>([]);
  const [datos, setDatos] = useState({ psiEncontrado: '', psiDejado: '', estado: '', obs: '' });
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierta) return;
    setR({ r1: inicial.r1, r2: inicial.r2, r3: inicial.r3 });
    setFotos(inicial.fotos); setError(null);
    setDatos({ psiEncontrado: inicial.psiEncontrado, psiDejado: inicial.psiDejado, estado: inicial.estado, obs: inicial.obs });
  }, [abierta, posicion]); // eslint-disable-line react-hooks/exhaustive-deps

  async function agregar(e: ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    e.target.value = '';
    if (!elegidos.length) return;
    setProcesando(true); setError(null);
    try {
      const cupo = MAX_FOTOS - fotos.length;
      const nuevas = await Promise.all(elegidos.slice(0, Math.max(0, cupo)).map(comoDataUrl));
      setFotos(f => [...f, ...nuevas]);
      if (elegidos.length > cupo) setError(`Se pueden adjuntar hasta ${MAX_FOTOS} fotos por neumático.`);
    } catch (err) { setError(String((err as Error).message ?? err)); }
    finally { setProcesando(false); }
  }

  function confirmar() {
    const vals = [r.r1, r.r2, r.r3].map(Number);
    if (vals.some(v => !Number.isInteger(v) || v < 1 || v > MAX_MM)) { setError(`R1, R2 y R3 deben estar entre 1 y ${MAX_MM} mm.`); return; }
    if (!(Number(datos.psiEncontrado) > 0) || !(Number(datos.psiDejado) > 0)) { setError('Escribe el Psi con que lo encontraste y el Psi con que lo dejas.'); return; }
    onConfirmar({ ...r, fotos, ...datos, obs: datos.obs.trim() });
  }

  return (
    <Sheet open={abierta} onClose={onClose} title={`Inspección · Pos ${posicion}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={confirmar} disabled={procesando}>Confirmar</Button></>}>
      <div className="ninsp-modal">
        {llanta && <p className="ninsp-modal__llanta"><strong>{llanta.codigo}</strong> · {tituloLlanta(llanta)}</p>}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="ninsp-modal__medidas">
          <Contador etiqueta="R1" valor={r.r1} onCambiar={v => setR(x => ({ ...x, r1: v }))} />
          <Contador etiqueta="R2" valor={r.r2} onCambiar={v => setR(x => ({ ...x, r2: v }))} />
          <Contador etiqueta="R3" valor={r.r3} onCambiar={v => setR(x => ({ ...x, r3: v }))} />
        </div>

        <div className="ninsp-modal__psi">
          <label className="ninsp-modal__campo"><span>Psi encontrado</span>
            <input inputMode="numeric" value={datos.psiEncontrado} placeholder="Ej. 90" onChange={e => setDatos(d => ({ ...d, psiEncontrado: e.target.value.replace(/\D/g, '').slice(0, 3) }))} /></label>
          <label className="ninsp-modal__campo"><span>Psi dejado</span>
            <input inputMode="numeric" value={datos.psiDejado} placeholder="Ej. 110" onChange={e => setDatos(d => ({ ...d, psiDejado: e.target.value.replace(/\D/g, '').slice(0, 3) }))} /></label>
        </div>
        <label className="ninsp-modal__campo"><span>Observaciones</span>
          <input value={datos.obs} placeholder="Opcional" onChange={e => setDatos(d => ({ ...d, obs: e.target.value }))} /></label>

        <div className="ninsp-modal__evidencia">
          <h4 className="ninsp-modal__sub">Adjuntar evidencia</h4>
          <div className="ninsp-modal__botones">
            <Button variant="secondary" icon={<Camera size={16} />} disabled={procesando || fotos.length >= MAX_FOTOS} onClick={() => camara.current?.click()}>Tomar foto</Button>
            <Button variant="secondary" icon={<Images size={16} />} disabled={procesando || fotos.length >= MAX_FOTOS} onClick={() => galeria.current?.click()}>Adjuntar fotos</Button>
            <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={e => { void agregar(e); }} />
            <input ref={galeria} type="file" accept="image/*" multiple hidden onChange={e => { void agregar(e); }} />
          </div>
          {fotos.length > 0 && (
            <div className="ninsp-modal__fotos">
              {fotos.map((f, i) => (
                <div key={i} className="ninsp-modal__foto">
                  <img src={f} alt={`Evidencia ${i + 1}`} />
                  <button type="button" aria-label="Quitar foto" onClick={() => setFotos(x => x.filter((_, j) => j !== i))}><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
          <p className="ninsp-modal__ayuda">{fotos.length}/{MAX_FOTOS} fotos · opcional</p>
        </div>
      </div>
    </Sheet>
  );
}
