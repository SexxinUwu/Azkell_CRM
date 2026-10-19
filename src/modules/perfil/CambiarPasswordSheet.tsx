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

type Campo = 'actual' | 'nueva' | 'confirmar';

// Cambio manual de la contraseña desde Mi cuenta. Los errores de validación se muestran debajo de cada
// campo; si la clave nueva se filtró o es común, el servidor responde con el motivo y aquí se muestra tal cual.
export function CambiarPasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Partial<Record<Campo, string>>>({});

  useEffect(() => {
    if (!open) return;
    setActual(''); setNueva(''); setConfirmar(''); setError(null); setErrs({});
  }, [open]);

  const quitar = (c: Campo) => setErrs(e => ({ ...e, [c]: undefined }));

  async function guardar() {
    const nuevos: Partial<Record<Campo, string>> = {};
    if (!actual) nuevos.actual = 'Escribe tu contraseña actual.';
    if (nueva.length < LARGO_MIN) nuevos.nueva = `Debe tener al menos ${LARGO_MIN} caracteres.`;
    else if (nueva === actual) nuevos.nueva = 'Debe ser distinta de la actual.';
    if (nueva !== confirmar) nuevos.confirmar = 'Las contraseñas nuevas no coinciden.';
    setErrs(nuevos);
    if (Object.values(nuevos).some(Boolean)) { haptic('warning'); return; }

    setEnviando(true); setError(null);
    try {
      await api('/perfil/password', { method: 'PUT', body: { actual, nueva } });
      haptic('success');
      // Al entrar con la clave nueva, el navegador la guarda y deja de avisar que la anterior se filtró
      toast('Contraseña actualizada. Úsala en tu próximo ingreso.');
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Cambiar contraseña"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Cambiar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Contraseña actual" wide error={errs.actual}>
          {p => <PasswordInput {...p} autoComplete="current-password" value={actual}
            onChange={e => { setActual(e.target.value); quitar('actual'); }} />}
        </Field>
        <Field label="Contraseña nueva" wide error={errs.nueva} hint={`Mínimo ${LARGO_MIN} caracteres. Evita una que ya se haya filtrado.`}>
          {p => <PasswordInput {...p} autoComplete="new-password" value={nueva}
            onChange={e => { setNueva(e.target.value); quitar('nueva'); }} />}
        </Field>
        <Field label="Repite la contraseña nueva" wide error={errs.confirmar}>
          {p => <PasswordInput {...p} autoComplete="new-password" value={confirmar}
            onChange={e => { setConfirmar(e.target.value); quitar('confirmar'); }} />}
        </Field>
      </div>
    </Sheet>
  );
}
