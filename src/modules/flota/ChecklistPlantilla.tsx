import './ce-plantilla.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, CircleAlert, ListChecks, Lock, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { useConfigSistemas } from './api';
import { textoItem, type SistemaCfg } from './fman';

type Unidad = 'tracto' | 'remolque';
interface Sistema { key: string; title: string; icon?: string; items: string[] }
type Borrador = Record<Unidad, Sistema[]>;

/** El ítem se guarda como "01 Texto"; en el editor solo se ve el texto y el número se vuelve a poner por posición al guardar */
const sinCodigo = (it: string) => { const m = it.trim().match(/^(\d+)\s*[-.)]?\s*(.*)$/); return m ? m[2] : it.trim(); };
const copiar = (l: SistemaCfg[]): Sistema[] => l.map(s => ({ key: s.key, title: s.title, icon: (s as { icon?: string }).icon, items: s.items.map(textoItem).map(sinCodigo) }));

function mover<T>(lista: T[], de: number, a: number): T[] {
  if (a < 0 || a >= lista.length) return lista;
  const n = [...lista];
  const [x] = n.splice(de, 1);
  n.splice(a, 0, x);
  return n;
}

/**
 * Plantilla del reporte de fallas (formato F-MAN-001): sistemas e ítems de Camión y de Carreta.
 * Mismo diseño que la plantilla de inventario de vehículos: categorías a la izquierda y el editor de la elegida a la derecha.
 * Los cambios valen para los reportes nuevos; los ya guardados conservan la plantilla con la que se hicieron.
 */
export function ChecklistPlantilla({ abierta, puedeEditar, onCerrar }: { abierta: boolean; puedeEditar: boolean; onCerrar: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const cfg = useConfigSistemas();
  const [b, setB] = useState<Borrador | null>(null);
  const [unidad, setUnidad] = useState<Unidad>('tracto');
  const [sel, setSel] = useState(0);
  const [nuevoItem, setNuevoItem] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [restaurar, setRestaurar] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [porQuitar, setPorQuitar] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);
  const refNombre = useRef<HTMLInputElement>(null);
  const refNuevo = useRef<HTMLInputElement>(null);
  const refItems = useRef<Array<HTMLInputElement | null>>([]);
  const enfocarItem = useRef<number | null>(null);

  // Cada vez que se abre, parte de lo guardado en el servidor
  useEffect(() => {
    if (abierta && cfg.data) { setB({ tracto: copiar(cfg.data.tracto), remolque: copiar(cfg.data.remolque) }); setSel(0); setNuevoItem(''); setError(null); setIntento(false); }
  }, [abierta, cfg.data]);
  useEffect(() => {
    if (enfocarItem.current !== null) { refItems.current[enfocarItem.current]?.focus(); enfocarItem.current = null; }
  });

  const lista = b ? b[unidad] : [];
  const actual = lista[Math.min(sel, Math.max(0, lista.length - 1))] as Sistema | undefined;
  const iSel = actual ? lista.indexOf(actual) : -1;
  const totalItems = useMemo(() => (b ? [...b.tracto, ...b.remolque] : []).reduce((s, c) => s + c.items.filter(x => x.trim()).length, 0), [b]);

  const cambiar = (f: (l: Sistema[]) => Sistema[]) => setB(a => (a ? { ...a, [unidad]: f(a[unidad]) } : a));
  const cambiarSel = (i: number, f: (s: Sistema) => Sistema) => cambiar(l => l.map((s, j) => (j === i ? f(s) : s)));

  function agregarCategoria() {
    haptic('selection');
    cambiar(l => [...l, { key: `sys_${Date.now()}`, title: '', icon: unidad === 'tracto' ? 'bi-gear' : 'bi-truck-flatbed', items: [] }]);
    setSel(lista.length); setNuevoItem('');
    window.setTimeout(() => refNombre.current?.focus(), 60);
  }
  function agregarItem() {
    const t = nuevoItem.trim();
    if (!t || iSel < 0) return;
    haptic('selection');
    cambiarSel(iSel, x => ({ ...x, items: [...x.items, t] }));
    setNuevoItem(''); refNuevo.current?.focus();
  }
  function moverCategoria(d: number) {
    if (iSel < 0) return;
    haptic('selection'); cambiar(l => mover(l, iSel, iSel + d)); setSel(iSel + d);
  }
  function moverItem(k: number, d: number) {
    haptic('selection'); enfocarItem.current = k + d;
    cambiarSel(iSel, x => ({ ...x, items: mover(x.items, k, k + d) }));
  }

  async function guardar() {
    if (!b) return;
    setIntento(true);
    // Se limpian los vacíos y se vuelve a numerar cada ítem por su posición ("01 Texto")
    const limpio: Borrador = { tracto: [], remolque: [] };
    for (const u of ['tracto', 'remolque'] as Unidad[]) {
      for (const s of b[u]) {
        const title = s.title.trim().toUpperCase();
        if (!title) { setUnidad(u); setSel(b[u].indexOf(s)); setError('Cada categoría necesita un nombre.'); haptic('warning'); return; }
        limpio[u].push({ ...s, title, items: s.items.map(x => x.trim()).filter(Boolean).map((x, k) => `${String(k + 1).padStart(2, '0')} ${x}`) });
      }
    }
    setError(null); setGuardando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>('/mantenimiento/checklist/config-sistemas', { method: 'POST', body: limpio });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar la plantilla');
      await qc.invalidateQueries({ queryKey: ['flota', 'config-sistemas'] });
      haptic('success'); toast('Plantilla de fallas actualizada con éxito.');
      onCerrar();
    } catch (err) { setError(`No se pudo guardar la plantilla. ${errorMessage(err)}`); haptic('warning'); }
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

  const bloqueada = !b || cfg.isError;
  const sinNombreActual = intento && actual && !actual.title.trim();

  return (
    <>
      <Sheet open={abierta} onClose={() => !guardando && onCerrar()} title="Plantilla de reporte de fallas" ancho
        footer={<>
          <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => setRestaurar(true)} disabled={bloqueada || !puedeEditar}>De fábrica</Button>
          <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando} disabled={bloqueada || guardando || !puedeEditar}>Guardar plantilla</Button>
        </>}>
        <div className="cep-pl">
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
          {cfg.isError && <Notice tone="error" icon={<CircleAlert size={16} />}>No se pudo cargar la plantilla de fallas. Revisa la conexión y vuelve a abrir esta ventana.</Notice>}

          <div className="cep-pl__aviso">
            <span className="cep-pl__aviso-icono" aria-hidden><Lock size={16} /></span>
            <p><strong>Los cambios valen para los reportes nuevos.</strong> Los ya registrados conservan la plantilla con la que se hicieron. Es la misma para toda la empresa.</p>
            <span className="cep-pl__resumen">{totalItems} ítems</span>
          </div>

          {b && (
            <SegmentedControl<Unidad> label="Unidad" block value={unidad}
              onChange={u => { setUnidad(u); setSel(0); setNuevoItem(''); }}
              options={[{ value: 'tracto', label: `Camión (${b.tracto.length})` }, { value: 'remolque', label: `Carreta (${b.remolque.length})` }]} />
          )}
          {!b && !cfg.isError && <p className="cep-pl__vacio">Cargando plantilla…</p>}

          {b && (
            <div className="cep-pl__cuerpo">
              <nav className="cep-pl__lista" aria-label="Categorías">
                <span className="cep-pl__lista-tit">Categorías</span>
                <ol>
                  {lista.map((c, i) => (
                    <li key={c.key + i}>
                      <button type="button" className={`cep-pl__cat${i === iSel ? ' cep-pl__cat--sel' : ''}${intento && !c.title.trim() ? ' cep-pl__cat--error' : ''}`}
                        aria-current={i === iSel} onClick={() => { haptic('selection'); setSel(i); setNuevoItem(''); }}>
                        <span className="cep-pl__num">{i + 1}</span>
                        <span className="cep-pl__cat-nombre">{c.title.trim() || 'Sin nombre'}</span>
                        <span className="cep-pl__cat-n">{c.items.filter(x => x.trim()).length}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <button type="button" className="cep-pl__nueva" disabled={!puedeEditar} onClick={agregarCategoria}><Plus size={16} /> Nueva categoría</button>
              </nav>

              <section className="cep-pl__editor" aria-label={actual?.title || 'Categoría'}>
                {!actual ? (
                  <div className="cep-pl__vacio cep-pl__vacio--grande">
                    <ListChecks size={28} aria-hidden />
                    <p>Aún no hay categorías para {unidad === 'tracto' ? 'camión' : 'carreta'}.</p>
                    <Button variant="secondary" icon={<Plus size={16} />} disabled={!puedeEditar} onClick={agregarCategoria}>Crear la primera</Button>
                  </div>
                ) : (
                  <>
                    <header className="cep-pl__cab">
                      <div className="cep-pl__nombre">
                        <label htmlFor="ckpl-nombre">Nombre de la categoría</label>
                        <input id="ckpl-nombre" ref={refNombre} className={`cep-pl__nombre-input${sinNombreActual ? ' cep-pl__nombre-input--error' : ''}`}
                          value={actual.title} placeholder="Ej. Sistema de frenos" autoComplete="off" disabled={!puedeEditar}
                          onChange={e => cambiarSel(iSel, x => ({ ...x, title: e.target.value.toUpperCase() }))} />
                        {sinNombreActual && <span className="cep-pl__error">Escribe un nombre para la categoría.</span>}
                      </div>
                      <div className="cep-pl__cab-acciones">
                        <button type="button" className="cep-pl__icono" aria-label="Subir categoría" title="Subir" disabled={!puedeEditar || iSel === 0} onClick={() => moverCategoria(-1)}><ChevronUp size={18} /></button>
                        <button type="button" className="cep-pl__icono" aria-label="Bajar categoría" title="Bajar" disabled={!puedeEditar || iSel === lista.length - 1} onClick={() => moverCategoria(1)}><ChevronDown size={18} /></button>
                        <button type="button" className="cep-pl__icono cep-pl__icono--peligro" aria-label={`Eliminar categoría ${actual.title || 'sin nombre'}`} title="Eliminar categoría" disabled={!puedeEditar} onClick={() => setPorQuitar(iSel)}><Trash2 size={17} /></button>
                      </div>
                    </header>

                    <div className="cep-pl__items-cab"><span>Ítems a revisar</span><em>{actual.items.length}</em></div>

                    <ul className="cep-pl__items">
                      {actual.items.map((it, k) => (
                        <li key={`${actual.key}-${k}`} className="cep-pl__item">
                          <span className="cep-pl__item-n">{k + 1}</span>
                          <input ref={el => { refItems.current[k] = el; }} value={it} aria-label={`Ítem ${k + 1} de ${actual.title || 'la categoría'}`} placeholder="Nombre del ítem" autoComplete="off" disabled={!puedeEditar}
                            onChange={e => cambiarSel(iSel, x => ({ ...x, items: x.items.map((y, j) => (j === k ? e.target.value : y)) }))} />
                          <span className="cep-pl__item-acciones">
                            <button type="button" aria-label="Subir ítem" title="Subir" disabled={!puedeEditar || k === 0} onClick={() => moverItem(k, -1)}><ChevronUp size={16} /></button>
                            <button type="button" aria-label="Bajar ítem" title="Bajar" disabled={!puedeEditar || k === actual.items.length - 1} onClick={() => moverItem(k, 1)}><ChevronDown size={16} /></button>
                            <button type="button" className="cep-pl__quitar" aria-label={`Quitar ítem ${it || k + 1}`} title="Quitar" disabled={!puedeEditar}
                              onClick={() => cambiarSel(iSel, x => ({ ...x, items: x.items.filter((_, j) => j !== k) }))}><X size={16} /></button>
                          </span>
                        </li>
                      ))}
                      {actual.items.length === 0 && <li className="cep-pl__vacio">Esta categoría todavía no tiene ítems.</li>}
                    </ul>

                    <form className="cep-pl__agregar" onSubmit={e => { e.preventDefault(); agregarItem(); }}>
                      <Plus size={16} aria-hidden />
                      <input ref={refNuevo} value={nuevoItem} onChange={e => setNuevoItem(e.target.value)} placeholder="Añadir un ítem y pulsar Enter" aria-label="Nuevo ítem" autoComplete="off" disabled={!puedeEditar} />
                      <button type="submit" disabled={!puedeEditar || !nuevoItem.trim()}>Añadir</button>
                    </form>
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      </Sheet>

      <ConfirmSheet open={porQuitar !== null} onClose={() => setPorQuitar(null)}
        onConfirm={() => { if (porQuitar !== null) { cambiar(l => l.filter((_, j) => j !== porQuitar)); setSel(s => Math.max(0, Math.min(s, lista.length - 2))); } setPorQuitar(null); }}
        title="¿Eliminar esta categoría?" message="Se quita la categoría completa con todos sus ítems. No se guarda hasta que pulses Guardar plantilla." confirmLabel="Eliminar" />
      <ConfirmSheet open={restaurar} onClose={() => !restaurando && setRestaurar(false)} onConfirm={restaurarFabrica} loading={restaurando}
        title="¿Restaurar los sistemas de fábrica?" message="Se descarta la plantilla personalizada de camión y carreta y se vuelve a la estándar (ISO). Se aplica de inmediato." confirmLabel="Restaurar" />
    </>
  );
}
