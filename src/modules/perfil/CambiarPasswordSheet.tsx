import { useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, PasswordInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

const LARGO_MIN = 10; // igual que el servidor (services/politica_clave.js), que vuelve a validar todo

// Cambio manual de la contraseña desde Mi cuenta. Si la clave nueva se filtró o es común, el
// servidor responde con el motivo y aquí se muestra tal cual.
export function CambiarPasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setActual(''); setNueva(''); setConfirmar(''); setError(null);
  }, [open]);

  async function guardar() {
    if (!actual) { setError('Escribe tu contraseña actual.'); return; }
    if (nueva.length < LARGO_MIN) { setError(`La contraseña nueva debe tener al menos ${LARGO_MIN} caracteres.`); return; }
    if (nueva === actual) { setError('La contraseña nueva debe ser distinta de la actual.'); return; }
    if (nueva !== confirmar) { setError('Las contraseñas nuevas no coinciden.'); return; }
    setEnviando(true); setError(null);
    try {
      await api('/perfil/password', { method: 'PUT', body: { actual, nueva } });
      haptic('success');
      toast('Contraseña actualizada');
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Cambiar contraseña"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando} disabled={!actual || !nueva || !confirmar}>Cambiar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Contraseña actual" wide>
          {p => <PasswordInput {...p} autoComplete="current-password" value={actual} onChange={e => setActual(e.target.value)} />}
        </Field>
        <Field label="Contraseña nueva" wide hint={`Mínimo ${LARGO_MIN} caracteres. Evita una que ya se haya filtrado.`}>
          {p => <PasswordInput {...p} autoComplete="new-password" value={nueva} onChange={e => setNueva(e.target.value)} />}
        </Field>
        <Field label="Repite la contraseña nueva" wide>
          {p => <PasswordInput {...p} autoComplete="new-password" value={confirmar} onChange={e => setConfirmar(e.target.value)} />}
        </Field>
      </div>
    </Sheet>
  );
}
