import './checklist.css';
import '../../core/ui/acciones-iconos.css';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, Info, Package, Plus, RotateCcw, Save, Trash2, Truck, X } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { useConfigSistemas } from './api';
import { textoItem, type SistemaCfg } from './fman';

type Unidad = 'tracto' | 'remolque';
interface Sistema { key: string; title: string; icon?: string; items: string[] }
type Borrador = Record<Unidad, Sistema[]>;

// Un ítem se guarda como "01 Texto": el número correlativo va aparte del nombre (igual que el clásico)
function partir(it: string, idx: number) {
  const m = it.trim().match(/^(\d+)\s*[-.)]?\s*(.*)$/);
  return m ? { codigo: m[1].padStart(2, '0'), texto: m[2] } : { codigo: String(idx + 1).padStart(2, '0'), texto: it.trim() };
}

const copiar = (l: SistemaCfg[]): Sistema[] => l.map(s => ({ key: s.key, title: s.title, icon: (s as { icon?: string }).icon, items: s.items.map(textoItem) }));

/** Constructor dinámico de la plantilla de fallas (Camión y Carreta). Reemplaza la vista del clásico en la misma pantalla. */
export function ChecklistPlantilla({ puedeEditar, onVolver }: { puedeEditar: boolean; onVolver: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const cfg = useConfigSistemas();
  const [b, setB] = useState<Borrador | null>(null);
  const [unidad, setUnidad] = useState<Unidad>('tracto');
  const [guardando, setGuardando] = useState(false);
  const [restaurar, setRestaurar] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [porQuitar, setPorQuitar] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cfg.data) setB({ tracto: copiar(cfg.data.tracto), remolque: copiar(cfg.data.remolque) });
  }, [cfg.data]);

  if (cfg.isError) return <Notice tone="error">No se pudo cargar la plantilla de fallas.</Notice>;
  if (!b) return <PageLoader variante="camion" />;

  const lista = b[unidad];
  const cambiar = (f: (l: Sistema[]) => Sistema[]) => setB(a => (a ? { ...a, [unidad]: f(a[unidad]) } : a));
  const setSistema = (i: number, f: (s: Sistema) => Sistema) => cambiar(l => l.map((s, j) => (j === i ? f(s) : s)));

  async function guardar() {
    if (!b) return;
    setGuardando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string }>('/mantenimiento/checklist/config-sistemas', { method: 'POST', body: b });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar la plantilla');
      await qc.invalidateQueries({ queryKey: ['flota', 'config-sistemas'] });
      haptic('success'); toast('Plantilla de fallas actualizada con éxito.');
      onVolver();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  async function restaurarFabrica() {
    setRestaurando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>('/mantenimiento/checklist/config-sistemas/restaurar', { method: 'POST' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo restaurar');
      await qc.invalidateQueries({ queryKey: ['flota', 'config-sistemas'] });
      haptic('success'); toast('Sistemas restaurados a los valores de fábrica.');
      setRestaurar(false);
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setRestaurando(false); }
  }

  const nombreQuitar = porQuitar != null ? lista[porQuitar]?.title : '';

  return (
    <div className="ck-plantilla">
      <header className="cep-header">
        <div className="cep-header__izq">
          <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={onVolver}>Volver a la lista</Button>
          <div>
            <h2 className="cep-header__titulo">Constructor dinámico de plantilla</h2>
            <p className="cep-header__sub">Sistemas y fallas del formato F-MAN-001</p>
          </div>
        </div>
        <div className="cep-header__acciones">
          <div className="acciones-iconos">
            <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--violeta"
              data-tip="Restaurar de fábrica" aria-label="Restaurar de fábrica" disabled={!puedeEditar} onClick={() => setRestaurar(true)}>
              <RotateCcw size={17} />
            </button>
          </div>
          <Button variant="primary" icon={<Save size={16} />} loading={guardando} disabled={!puedeEditar} onClick={guardar}>Guardar plantilla</Button>
        </div>
      </header>

      <Notice tone="accent" icon={<Info size={16} />}>
        <b>Plantilla inmutable:</b> los cambios se aplican <b>solo a futuros registros</b>. Los reportes ya guardados conservan la plantilla con la que se hicieron.
      </Notice>
      {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 16rem', maxWidth: '24rem' }}>
          <SegmentedControl<Unidad>
            label="Unidad"
            block
            value={unidad}
            onChange={setUnidad}
            options={[
              { value: 'tracto', label: `Camión (${b.tracto.length})` },
              { value: 'remolque', label: `Carreta (${b.remolque.length})` },
            ]}
          />
        </div>
        <Button variant="secondary" icon={<Plus size={16} />} disabled={!puedeEditar}
          onClick={() => cambiar(l => [...l, { key: `sys_${Date.now()}`, title: `NUEVA CATEGORÍA ${String(l.length + 1).padStart(2, '0')}`, icon: unidad === 'tracto' ? 'bi-gear' : 'bi-truck-flatbed', items: [] }])}>
          Nuevo Sistema
        </Button>
      </div>

      {lista.length === 0 ? (
        <EmptyState icon={unidad === 'tracto' ? <Truck size={22} /> : <Package size={22} />} title={`No hay sistemas configurados para ${unidad === 'tracto' ? 'CAMIÓN' : 'CARRETA'}`}>
          Usa “Nuevo Sistema” para comenzar.
        </EmptyState>
      ) : lista.map((s, i) => (
        <section key={s.key + i} className="ck-sistema" aria-label={`Sistema ${i + 1}`}>
          <div className="ck-sistema__cabeza">
            <span className="ck-sistema__num" aria-hidden>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TextInput value={s.title} aria-label="Nombre de la categoría" placeholder="Nombre de la categoría" disabled={!puedeEditar}
                className="ck-sistema__titulo"
                onChange={e => setSistema(i, x => ({ ...x, title: e.target.value.toUpperCase() }))} />
            </div>
            <Button variant="secondary" iconOnly aria-label={`Eliminar la categoría ${s.title}`} icon={<Trash2 size={16} />} disabled={!puedeEditar}
              onClick={() => setPorQuitar(i)} />
          </div>

          {s.items.map((it, k) => {
            const p = partir(it, k);
            return (
              <div key={k} className="ck-sistema__item">
                <span className="ck-sistema__codigo">{p.codigo}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TextInput value={p.texto} aria-label="Subcategoría" placeholder="Nombre de la subcategoría / ítem" disabled={!puedeEditar}
                    onChange={e => setSistema(i, x => ({ ...x, items: x.items.map((y, j) => (j === k ? `${p.codigo} ${e.target.value}` : y)) }))} />
                </div>
                <Button variant="secondary" iconOnly aria-label="Eliminar ítem" icon={<X size={16} />} disabled={!puedeEditar}
                  onClick={() => setSistema(i, x => ({ ...x, items: x.items.filter((_, j) => j !== k) }))} />
              </div>
            );
          })}

          <div>
            <Button variant="secondary" icon={<Plus size={16} />} disabled={!puedeEditar}
              onClick={() => setSistema(i, x => ({ ...x, items: [...x.items, `${String(x.items.length + 1).padStart(2, '0')} Nuevo Ítem de Revisión`] }))}>
              Añadir Subcategoría
            </Button>
          </div>
        </section>
      ))}

      <ConfirmSheet open={porQuitar != null} onClose={() => setPorQuitar(null)}
        onConfirm={() => { if (porQuitar != null) cambiar(l => l.filter((_, j) => j !== porQuitar)); setPorQuitar(null); }}
        title={`¿Eliminar la categoría “${nombreQuitar}”?`} message="Se eliminan también sus subcategorías. Se aplica al guardar la plantilla." confirmLabel="Eliminar" />
      <ConfirmSheet open={restaurar} onClose={() => !restaurando && setRestaurar(false)} onConfirm={restaurarFabrica} loading={restaurando}
        title="¿Restaurar los sistemas de fábrica?" message="Se descarta la plantilla personalizada de camión y carreta y se vuelve a la estándar (ISO). Se aplica de inmediato." confirmLabel="Restaurar" />
    </div>
  );
}
