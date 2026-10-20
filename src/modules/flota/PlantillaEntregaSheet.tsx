import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { GRUPOS_INVENTARIO, guardarPlantillaEntrega, leerPlantillaEntrega, type GrupoInventario } from './plantillaEntrega';

const copia = (g: GrupoInventario[]): GrupoInventario[] => JSON.parse(JSON.stringify(g));

// Entrega de vehículos › plantilla del inventario de partes: categorías e ítems que se califican en cada acta.
// Se guarda en el servidor y es la misma para toda la empresa; las actas ya hechas no cambian.
export function PlantillaEntregaSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [b, setB] = useState<GrupoInventario[]>([]);
  const [restaurar, setRestaurar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setError(null); leerPlantillaEntrega().then(setB); } }, [open]);

  const setGrupo = (i: number, f: (g: GrupoInventario) => GrupoInventario) => setB(l => l.map((g, j) => (j === i ? f(g) : g)));

  async function guardar() {
    const limpia = b
      .map(g => ({ ...g, titulo: g.titulo.trim(), items: g.items.map(x => x.trim()).filter(Boolean) }))
      .filter(g => g.titulo || g.items.length);
    if (limpia.some(g => !g.titulo)) { setError('Cada categoría necesita un nombre.'); return; }
    if (!limpia.length) { setError('Deja al menos una categoría con ítems.'); return; }
    try {
      await guardarPlantillaEntrega(limpia);
      qc.invalidateQueries({ queryKey: ['flota', 'entrega-plantilla'] });
      haptic('success'); toast('Plantilla de entrega guardada');
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Plantilla de inventario"
        footer={<>
          <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => setRestaurar(true)}>De fábrica</Button>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={guardar}>Guardar</Button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
          <p className="t-footnote c-secondary" style={{ margin: 0 }}>
            Las categorías y los ítems de abajo son los que se califican (Bueno, Regular, Malo) en cada acta nueva. Se guarda en este navegador.
          </p>
          {b.length === 0 && <p className="t-footnote c-secondary">No hay categorías. Agrega una para comenzar.</p>}
          {b.map((g, i) => (
            <div key={g.id}>
              <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <TextInput value={g.titulo} aria-label="Nombre de la categoría" placeholder="Nombre de la categoría"
                    onChange={e => setGrupo(i, x => ({ ...x, titulo: e.target.value }))} />
                </div>
                <Button variant="secondary" iconOnly aria-label={`Eliminar ${g.titulo || 'categoría'}`} icon={<Trash2 size={16} />}
                  onClick={() => setB(l => l.filter((_, j) => j !== i))} />
              </div>
              <div className="tarjeta__lista" style={{ marginTop: 'var(--s-2)' }}>
                {g.items.map((it, k) => (
                  <div key={k} className="dato" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-2)' }}>
                    <div style={{ flex: 1 }}>
                      <TextInput value={it} aria-label="Ítem del inventario" placeholder="Ítem del inventario"
                        onChange={e => setGrupo(i, x => ({ ...x, items: x.items.map((y, j) => (j === k ? e.target.value : y)) }))} />
                    </div>
                    <Button variant="secondary" iconOnly aria-label="Quitar ítem" icon={<X size={16} />}
                      onClick={() => setGrupo(i, x => ({ ...x, items: x.items.filter((_, j) => j !== k) }))} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 'var(--s-2)' }}>
                <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setGrupo(i, x => ({ ...x, items: [...x.items, ''] }))}>Añadir ítem</Button>
              </div>
            </div>
          ))}
          <Button variant="secondary" icon={<Plus size={16} />}
            onClick={() => setB(l => [...l, { id: `cat_${Date.now()}`, titulo: '', items: [] }])}>Nueva categoría</Button>
        </div>
      </Sheet>
      <ConfirmSheet open={restaurar} onClose={() => setRestaurar(false)}
        onConfirm={() => { setB(copia(GRUPOS_INVENTARIO)); setRestaurar(false); }}
        title="¿Volver a la plantilla de fábrica?" message="Se reemplaza lo que ves por las categorías originales. No se guarda hasta que pulses Guardar." confirmLabel="Restaurar" />
    </>
  );
}
