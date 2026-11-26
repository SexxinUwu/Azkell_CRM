import { useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, TextInput } from '../../core/ui/Field';
import { Notice } from '../../core/ui/Display';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { asignarUbicacionMasiva, type ArticuloInv } from './api';

/** Asigna el mismo anaquel (y, si hace falta, la misma ubicación) a los artículos marcados. Sirve para ordenar el almacén rápido. */
export function UbicacionLoteSheet({ open, articulos, anaquelesEnUso, onClose, onListo }: {
  open: boolean;
  articulos: ArticuloInv[];
  /** Anaqueles que ya existen, para sugerir y no escribirlos distinto («A-1» y «A1») */
  anaquelesEnUso: string[];
  onClose: () => void;
  onListo: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [anaquel, setAnaquel] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [guardando, setGuardando] = useState(false);

  const yaTienen = useMemo(() => articulos.filter(a => (a.anaquel ?? '').trim() || (a.ubicacion ?? '').trim()).length, [articulos]);
  const nuevo = anaquel.trim().toUpperCase();
  const parecido = useMemo(() => {
    // «A1» y «A-1» son el mismo lugar escrito distinto: se avisa para no crear un anaquel duplicado
    const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');
    return nuevo && !anaquelesEnUso.includes(nuevo) ? anaquelesEnUso.find(x => norm(x) === norm(nuevo)) ?? null : null;
  }, [nuevo, anaquelesEnUso]);

  async function aplicar() {
    if (!nuevo && !ubicacion.trim()) return;
    setGuardando(true);
    try {
      const r = await asignarUbicacionMasiva(articulos.map(a => a.id), { anaquel: nuevo || undefined, ubicacion: ubicacion.trim() || undefined });
      haptic('success');
      toast(`Ubicación asignada a ${r.actualizados} ${r.actualizados === 1 ? 'artículo' : 'artículos'}`);
      await qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] });
      setAnaquel(''); setUbicacion('');
      onListo();
    } catch (err) {
      haptic('warning');
      toast(errorMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => !guardando && onClose()} title={`Asignar ubicación · ${articulos.length} ${articulos.length === 1 ? 'artículo' : 'artículos'}`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" icon={<MapPin size={16} />} loading={guardando} disabled={!nuevo && !ubicacion.trim()} onClick={aplicar}>
          Asignar a {articulos.length}
        </Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)', padding: 'var(--s-2) 0' }}>
        <Field label="Anaquel" hint="Como ya se usa en el almacén, por ejemplo 1-4, 9-2 o A-1.">
          {p => (
            <>
              <TextInput {...p} value={anaquel} onChange={e => setAnaquel(e.target.value)} placeholder="Ej: 6-1" list="ub-anaqueles" autoCapitalize="characters" />
              <datalist id="ub-anaqueles">{anaquelesEnUso.map(x => <option key={x} value={x} />)}</datalist>
            </>
          )}
        </Field>
        <Field label="Ubicación o zona (opcional)">
          {p => <TextInput {...p} value={ubicacion} onChange={e => setUbicacion(e.target.value)} placeholder="Ej: Pasillo A" />}
        </Field>
        {parecido && <Notice tone="accent">Ya existe el anaquel <b>{parecido}</b>, que se escribe casi igual. Si es el mismo lugar, usa ese para no duplicarlo.</Notice>}
        {yaTienen > 0 && <Notice>{yaTienen} de estos artículos ya tienen una ubicación; se reemplaza lo que indiques arriba. Lo que dejes vacío no se toca.</Notice>}
      </div>
    </Sheet>
  );
}
