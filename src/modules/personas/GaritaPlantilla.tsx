import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CloudUpload, Info, Plus, Trash2, X } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { useTemplateGarita, type CatChk } from './garitaComponentes';

/** Constructor dinámico de la plantilla del checklist (Ajustes del clásico) */
export function GaritaPlantilla({ onVolver }: { onVolver: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const actual = useTemplateGarita();
  const [plantilla, setPlantilla] = useState<CatChk[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [porBorrar, setPorBorrar] = useState<string | null>(null);

  useEffect(() => { if (actual.data && plantilla === null) setPlantilla(JSON.parse(JSON.stringify(actual.data))); }, [actual.data, plantilla]);
  const p = plantilla ?? [];
  const cambiarCat = (id: string, f: (c: CatChk) => CatChk) => setPlantilla(p.map(c => (c.id === id ? f(c) : c)));

  async function guardar() {
    setGuardando(true);
    try {
      await api('/seguridad/template', { method: 'PUT', body: { template: p } });
      haptic('success'); toast('¡Plantilla actualizada con éxito!');
      await qc.invalidateQueries({ queryKey: ['personas', 'garita-template'] });
      onVolver();
    } catch (err) { toast(`Error al guardar: ${errorMessage(err)}`, 'error'); haptic('warning'); setGuardando(false); }
  }

  return (
    <div className="gar">
      <div className="gar-cab">
        <div className="gar-cab__izq">
          <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={onVolver}>Volver a la Lista</Button>
          <h2>Constructor Dinámico de Plantilla</h2>
        </div>
        <Button variant="accent" icon={<CloudUpload size={16} />} loading={guardando} onClick={guardar}>Guardar Plantilla</Button>
      </div>

      <div className="gar-aviso"><Info size={18} style={{ flexShrink: 0 }} />
        <div><strong>Plantilla inmutable:</strong> agrega o modifica categorías e ítems de inspección. Los cambios se aplican <strong>exclusivamente a futuros registros</strong>, conservando íntegro el historial anterior.</div>
      </div>

      {plantilla === null ? <div className="gar-vacio">Cargando plantilla…</div> : p.length === 0 ? (
        <div className="gar-vacio">No hay categorías. Crea una nueva.</div>
      ) : p.map((cat, i) => (
        <div key={cat.id} className="gar-card">
          <div className="gar-card__cab">
            <span className="gar-badge gar-badge--azul">{i + 1}</span>
            <input className="gar-input" style={{ fontWeight: 800 }} value={cat.titulo} placeholder="Nombre de Categoría" aria-label="Nombre de la categoría"
              onChange={e => cambiarCat(cat.id, c => ({ ...c, titulo: e.target.value }))} />
            <Button variant="danger" iconOnly icon={<Trash2 size={16} />} aria-label="Eliminar categoría" title="Eliminar Categoría" onClick={() => setPorBorrar(cat.id)} />
          </div>
          {(cat.items ?? []).map(it => (
            <div key={it.id} className="gar-pl-item">
              <input className="gar-input" value={it.label} placeholder="Nombre de Subcategoría / Ítem" aria-label="Nombre del ítem"
                onChange={e => cambiarCat(cat.id, c => ({ ...c, items: c.items.map(x => (x.id === it.id ? { ...x, label: e.target.value } : x)) }))} />
              <label className="gar-pl-check">
                <input type="checkbox" checked={!!it.tiene_cantidad}
                  onChange={e => cambiarCat(cat.id, c => ({ ...c, items: c.items.map(x => (x.id === it.id ? { ...x, tiene_cantidad: e.target.checked } : x)) }))} />
                Pedir Cantidad
              </label>
              <Button variant="secondary" iconOnly icon={<X size={16} />} aria-label="Eliminar ítem" title="Eliminar ítem"
                onClick={() => cambiarCat(cat.id, c => ({ ...c, items: c.items.filter(x => x.id !== it.id) }))} />
            </div>
          ))}
          <Button variant="secondary" block icon={<Plus size={16} />}
            onClick={() => cambiarCat(cat.id, c => ({ ...c, items: [...(c.items ?? []), { id: `i_${Date.now()}`, label: 'Nuevo Ítem de Revisión', tiene_cantidad: false }] }))}>Añadir Subcategoría</Button>
        </div>
      ))}

      {plantilla !== null && (
        <Button variant="secondary" size="lg" block icon={<Plus size={16} />} style={{ border: '2px dashed var(--separator-strong)', background: 'transparent' }}
          onClick={() => setPlantilla([...p, { id: `cat_${Date.now()}`, titulo: 'Nueva Categoría', items: [] }])}>Añadir Nueva Categoría</Button>
      )}

      <ConfirmSheet open={!!porBorrar} onClose={() => setPorBorrar(null)} title="¿Eliminar esta categoría completa?" message="Se quitan la categoría y todos sus ítems de la plantilla (aplica al guardar)." confirmLabel="Eliminar"
        onConfirm={() => { setPlantilla(p.filter(c => c.id !== porBorrar)); setPorBorrar(null); }} />
    </div>
  );
}
