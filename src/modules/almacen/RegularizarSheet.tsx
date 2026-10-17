import { useState } from 'react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { regularizarStock, type ArticuloInv } from './api';
import { haptic } from '../../core/lib/haptics';

interface Props {
  open: boolean;
  articulo: ArticuloInv;
  onClose: () => void;
  onGuardado: () => void;
}

export function RegularizarSheet({ open, articulo: a, onClose, onGuardado }: Props) {
  const toast = useToast();
  const [stockFisico, setStockFisico] = useState('');
  const [motivo, setMotivo] = useState('');
  const [errStock, setErrStock] = useState<string | undefined>();
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const val = parseFloat(stockFisico);
    if (isNaN(val) || val < 0) { setErrStock('Ingresa una cantidad válida (0 o más).'); haptic('warning'); return; }
    setGuardando(true);
    try {
      await regularizarStock(a.id, val, motivo || 'Regularización manual');
      toast(`Stock de "${a.articulo}" actualizado a ${val}`);
      setStockFisico('');
      setMotivo('');
      onGuardado();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Regularizar stock">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)', padding: 'var(--s-2) 0' }}>
        <p style={{ color: 'var(--label-2)', fontSize: '0.9375rem' }}>
          Stock actual: <strong>{a.stock_actual} {a.unidad ?? 'und'}</strong> — ingresa el conteo físico real.
        </p>
        <Field label="Stock físico real" error={errStock}>
          {p => (
            <TextInput {...p} type="number" min={0} value={stockFisico}
              placeholder={String(a.stock_actual)} onChange={e => { setStockFisico(e.target.value); setErrStock(undefined); }} />
          )}
        </Field>
        <Field label="Motivo (opcional)">
          {p => (
            <TextInput {...p} value={motivo} placeholder="Ej: Inventario físico mensual"
              onChange={e => setMotivo(e.target.value)} />
          )}
        </Field>
        <Button variant="primary" loading={guardando} onClick={guardar} style={{ width: '100%' }}>
          Guardar regularización
        </Button>
      </div>
    </Sheet>
  );
}
