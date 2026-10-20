import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Sheet, ConfirmSheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { useConfigSistemas } from './api';
import { textoItem, type SistemaCfg } from './fman';

type Unidad = 'tracto' | 'remolque';
type Borrador = Record<Unidad, Array<{ key: string; title: string; icon?: string; items: string[] }>>;

/** Un ítem se guarda como "01 Texto": el número correlativo va aparte del nombre (igual que en la versión actual). */
function partir(it: string, idx: number) {
  const m = it.trim().match(/^(\d+)\s*[-.)]?\s*(.*)$/);
  return m ? { codigo: m[1].padStart(2, '0'), texto: m[2] } : { codigo: String(idx + 1).padStart(2, '0'), texto: it.trim() };
}

const copiar = (l: SistemaCfg[]) => l.map(s => ({ key: s.key, title: s.title, icon: (s as { icon?: string }).icon, items: s.items.map(textoItem) }));

// Sistemas y fallas del checklist de tracto y remolque: crear, renombrar, quitar categorías y subcategorías.
export function ConfigSistemasSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const cfg = useConfigSistemas(open);
  const [b, setB] = useState<Borrador>({ tracto: [], remolque: [] });
  const [unidad, setUnidad] = useState<Unidad>('tracto');
  const [guardando, setGuardando] = useState(false);
  const [restaurar, setRestaurar] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !cfg.data) return;
    setB({ tracto: copiar(cfg.data.tracto), remolque: copiar(cfg.data.remolque) });
    setError(null);
  }, [open, cfg.data]);

  const lista = b[unidad];
  const cambiar = (f: (l: Borrador[Unidad]) => Borrador[Unidad]) => setB(a => ({ ...a, [unidad]: f(a[unidad]) }));
  const setSistema = (i: number, f: (s: Borrador[Unidad][number]) => Borrador[Unidad][number]) => cambiar(l => l.map((s, j) => (j === i ? f(s) : s)));

  async function guardar() {
    setGuardando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string }>('/mantenimiento/checklist/config-sistemas', { method: 'POST', body: b });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar la configuración');
      await qc.invalidateQueries({ queryKey: ['flota', 'config-sistemas'] });
      haptic('success'); toast('Sistemas de revisión actualizados');
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  async function restaurarFabrica() {
    setRestaurando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>('/mantenimiento/checklist/config-sistemas/restaurar', { method: 'POST' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo restaurar');
      await qc.invalidateQueries({ queryKey: ['flota', 'config-sistemas'] });
      haptic('success'); toast('Sistemas restaurados a los valores de fábrica');
      setRestaurar(false);
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setRestaurando(false); }
  }

  return (
    <>
      <Sheet open={open} onClose={() => !guardando && onClose()} title="Sistemas de revisión"
        footer={<>
          <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => setRestaurar(true)} disabled={guardando}>De fábrica</Button>
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando} disabled={!cfg.data}>Guardar</Button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
          {cfg.isLoading ? <p className="t-footnote c-secondary">Cargando sistemas…</p> : cfg.isError ? <Notice tone="error">No se pudo cargar la configuración.</Notice> : (
            <>
              <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                {(['tracto', 'remolque'] as const).map(u => (
                  <button key={u} type="button" className={`chip pressable${unidad === u ? ' chip--active' : ''}`}
                    onClick={() => { setUnidad(u); haptic('selection'); }}>
                    {u === 'tracto' ? 'Tracto' : 'Remolque'} ({b[u].length})
                  </button>
                ))}
              </div>
              {lista.length === 0 && <p className="t-footnote c-secondary">No hay sistemas para {unidad}. Agrega uno para comenzar.</p>}
              {lista.map((s, i) => (
                <div key={s.key + i}>
                  <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <TextInput value={s.title} aria-label="Nombre del sistema" placeholder="Nombre del sistema"
                        onChange={e => setSistema(i, x => ({ ...x, title: e.target.value.toUpperCase() }))} />
                    </div>
                    <Button variant="secondary" iconOnly aria-label={`Eliminar ${s.title}`} icon={<Trash2 size={16} />}
                      onClick={() => cambiar(l => l.filter((_, j) => j !== i))} />
                  </div>
                  <div className="tarjeta__lista" style={{ marginTop: 'var(--s-2)' }}>
                    {s.items.map((it, k) => {
                      const p = partir(it, k);
                      return (
                        <div key={k} className="dato" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-2)' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--label-2)' }}>{p.codigo}</span>
                          <div style={{ flex: 1 }}>
                            <TextInput value={p.texto} aria-label="Ítem de revisión" placeholder="Ítem de revisión"
                              onChange={e => setSistema(i, x => ({ ...x, items: x.items.map((y, j) => (j === k ? `${p.codigo} ${e.target.value}` : y)) }))} />
                          </div>
                          <Button variant="secondary" iconOnly aria-label="Quitar ítem" icon={<X size={16} />}
                            onClick={() => setSistema(i, x => ({ ...x, items: x.items.filter((_, j) => j !== k) }))} />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 'var(--s-2)' }}>
                    <Button variant="secondary" icon={<Plus size={16} />}
                      onClick={() => setSistema(i, x => ({ ...x, items: [...x.items, `${String(x.items.length + 1).padStart(2, '0')} Nuevo ítem de revisión`] }))}>
                      Añadir ítem
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="secondary" icon={<Plus size={16} />}
                onClick={() => cambiar(l => [...l, { key: `sys_${Date.now()}`, title: `NUEVA CATEGORÍA ${String(l.length + 1).padStart(2, '0')}`, items: [] }])}>
                Nuevo sistema
              </Button>
            </>
          )}
        </div>
      </Sheet>
      <ConfirmSheet open={restaurar} onClose={() => !restaurando && setRestaurar(false)} onConfirm={restaurarFabrica} loading={restaurando}
        title="¿Restaurar los sistemas de fábrica?" message="Se descarta la configuración personalizada de tracto y remolque y se vuelve a la plantilla estándar. Se aplica de inmediato." confirmLabel="Restaurar" />
    </>
  );
}
