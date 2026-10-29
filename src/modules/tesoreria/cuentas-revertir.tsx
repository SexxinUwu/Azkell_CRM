import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import type { CuentaPorCobrar } from './api';
import { revertirPagoCuenta } from './api';

// Confirmación para volver una cuenta PAGADA a PENDIENTE. El depósito registrado no se borra.
export function RevertirPagoSheet({ cuenta, onClose }: { cuenta: CuentaPorCobrar | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    if (!cuenta) return;
    setEnviando(true); setError(null);
    try {
      await revertirPagoCuenta(cuenta.id);
      haptic('success'); toast('Cuenta vuelta a pendiente');
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'cuentas'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const referencia = cuenta
    ? (cuenta.serie && cuenta.factura ? `${cuenta.serie}-${cuenta.factura}` : cuenta.codigo_liquidacion ?? `ID ${cuenta.id}`)
    : '';

  return (
    <Sheet open={!!cuenta} onClose={() => !enviando && onClose()} title="¿Volver a pendiente?"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={confirmar} loading={enviando}>Volver a pendiente</Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
        <p className="t-callout c-secondary" style={{ margin: 0 }}>
          {cuenta ? `${referencia} · ${cuenta.cliente ?? cuenta.razon_social ?? 'Sin cliente'}` : ''}
        </p>
      </div>
    </Sheet>
  );
}
