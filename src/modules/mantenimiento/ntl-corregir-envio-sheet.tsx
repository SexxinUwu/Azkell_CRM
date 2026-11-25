// Corrección de un envío equivocado a reforma o descarte (solo administradores): la llanta vuelve a disponible en el Retén
// y el motivo queda en su historial. Solo mientras siga en el Retén (aún no despachada a la reformadora ni desactivada).
import { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

export function CorregirEnvioSheet({ llanta, onClose, onHecho }: {
  llanta: { codigo: string; situacion: string } | null; onClose: () => void; onHecho: (mensaje: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valido = motivo.trim().length >= 8;

  async function confirmar() {
    if (!llanta || !valido) return;
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string }>('/neumaticos/corregir-envio', { method: 'POST', body: { codigo: llanta.codigo, motivo: motivo.trim() } });
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo corregir el envío');
      haptic('success');
      onHecho(`${llanta.codigo} volvió a estar disponible en el Retén`);
      setMotivo('');
      onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setEnviando(false); }
  }

  return (
    <Sheet open={!!llanta} onClose={onClose} title="Corregir envío"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button><Button variant="accent" onClick={confirmar} loading={enviando} disabled={!valido}>Corregir</Button></>}>
      <div className="ntb-hoja">
        <div className="ntb-resumen">
          <p>La llanta <b>{llanta?.codigo}</b> está en «{llanta?.situacion}» y vuelve a <b>Disponible para uso</b> (Retén).</p>
          <p className="ntb-hoja__nota">Solo es posible mientras siga en el Retén. Quedan registrados el motivo y quién lo corrigió. Para montarla de nuevo en una unidad, usa el Tablero de movimientos.</p>
        </div>
        <Field label="Motivo de la corrección" hint="Obligatorio (mínimo 8 letras). Por ejemplo: se envió a reforma por error.">
          {p => <TextInput {...p} value={motivo} autoComplete="off" onChange={e => setMotivo(e.target.value)} />}
        </Field>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
      </div>
    </Sheet>
  );
}
