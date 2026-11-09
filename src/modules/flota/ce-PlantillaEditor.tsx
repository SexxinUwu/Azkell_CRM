import './ce-plantilla.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, CircleAlert, ListChecks, Lock, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { cargarPlantilla, guardarPlantilla, PLANTILLA_FABRICA } from './ce-plantilla';
import type { CategoriaPlantilla } from './ce-tipos';

const copia = (c: CategoriaPlantilla[]): CategoriaPlantilla[] => JSON.parse(JSON.stringify(c));

const nuevaCategoria = (): CategoriaPlantilla => ({ id: `cat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, titulo: '', items: [] });

/** Mueve el elemento `de` a la posición `a` (sin tocar el resto del orden) */
function mover<T>(lista: T[], de: number, a: number): T[] {
  if (a < 0 || a >= lista.length) return lista;
  const n = [...lista];
  const [x] = n.splice(de, 1);
  n.splice(a, 0, x);
  return n;
}

/**
 * Editor de la plantilla de inventario (Inventario de vehículos › Plantilla).
 * Categorías e ítems que se califican (OK / regular / mal) en cada acta. Es corporativa: vale para toda la empresa
 * y no cambia las actas ya hechas (aplica a futuros registros). "De fábrica" reemplaza lo que se ve por la plantilla original;
 * se guarda al pulsar Guardar plantilla.
 * Diseño: lista de categorías a la izquierda y el editor de la elegida a la derecha (en celular, una sobre otra).
 */
export function CePlantilla({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [cats, setCats] = useState<CategoriaPlantilla[]>([]);
  const [sel, setSel] = useState(0);
  const [nuevoItem, setNuevoItem] = useState('');
  const [cargando, setCargando] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);
  const [intento, setIntento] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restaurar, setRestaurar] = useState(false);
  const [porQuitar, setPorQuitar] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const refNombre = useRef<HTMLInputElement>(null);
  const refNuevo = useRef<HTMLInputElement>(null);
  const refItems = useRef<Array<HTMLInputElement | null>>([]);
  const enfocarItem = useRef<number | null>(null);

  useEffect(() => {
    if (!abierta) return;
    let vigente = true;
    setError(null); setIntento(false); setSinConexion(false); setCargando(true); setSel(0); setNuevoItem('');
    cargarPlantilla().then(lista => {
      if (!vigente) return;
      if (lista === null) { setSinConexion(true); setCats([]); }
      else setCats(copia(lista));
    }).finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [abierta]);

  // Tras añadir un ítem, el cursor pasa a su campo
  useEffect(() => {
    if (enfocarItem.current !== null) { refItems.current[enfocarItem.current]?.focus(); enfocarItem.current = null; }
  });

  const actual = cats[Math.min(sel, Math.max(0, cats.length - 1))] as CategoriaPlantilla | undefined;
  const iSel = actual ? cats.indexOf(actual) : -1;
  const totalItems = useMemo(() => cats.reduce((s, c) => s + c.items.filter(x => x.trim()).length, 0), [cats]);

  const cambiarCat = (i: number, f: (c: CategoriaPlantilla) => CategoriaPlantilla) =>
    setCats(l => l.map((c, j) => (j === i ? f(c) : c)));

  function agregarCategoria() {
    haptic('selection');
    setCats(l => [...l, nuevaCategoria()]);
    setSel(cats.length);
    setNuevoItem('');
    window.setTimeout(() => refNombre.current?.focus(), 60);
  }

  function agregarItem() {
    const t = nuevoItem.trim();
    if (!t || iSel < 0) return;
    haptic('selection');
    enfocarItem.current = null;
    cambiarCat(iSel, x => ({ ...x, items: [...x.items, t] }));
    setNuevoItem('');
    refNuevo.current?.focus();
  }

  function moverCategoria(delta: number) {
    if (iSel < 0) return;
    haptic('selection');
    setCats(l => mover(l, iSel, iSel + delta));
    setSel(iSel + delta);
  }

  function moverItem(k: number, delta: number) {
    haptic('selection');
    enfocarItem.current = k + delta;
    cambiarCat(iSel, x => ({ ...x, items: mover(x.items, k, k + delta) }));
  }

  async function guardar() {
    const limpia = cats.map(c => ({ ...c, titulo: c.titulo.trim(), items: c.items.map(x => x.trim()).filter(Boolean) }));
    setIntento(true);
    const sinNombre = limpia.findIndex(c => !c.titulo);
    if (sinNombre >= 0) { setSel(sinNombre); setError('Cada categoría necesita un nombre.'); haptic('warning'); return; }
    if (!limpia.length) { setError('Deja al menos una categoría con ítems.'); return; }
    setError(null);
    setGuardando(true);
    try {
      await guardarPlantilla(limpia);
      qc.invalidateQueries({ queryKey: ['flota', 'entrega-plantilla'] });
      qc.invalidateQueries({ queryKey: ['flota', 'ce-plantilla'] });
      qc.invalidateQueries({ queryKey: ['entrega-vehiculos', 'plantilla'] });
      haptic('success');
      toast('Plantilla guardada para toda la empresa');
      onCerrar();
    } catch (err) {
      setError(`No se pudo guardar la plantilla. ${errorMessage(err)}`);
      haptic('warning');
    } finally {
      setGuardando(false);
    }
  }

  const bloqueada = cargando || sinConexion;
  const sinNombreActual = intento && actual && !actual.titulo.trim();

  return (
    <>
      <Sheet open={abierta} onClose={onCerrar} title="Plantilla de inventario" ancho
        footer={<>
          <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => setRestaurar(true)} disabled={bloqueada}>De fábrica</Button>
          <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando} disabled={bloqueada || guardando}>Guardar plantilla</Button>
        </>}>
        <div className="cep-pl">
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
          {sinConexion && (
            <Notice tone="error" icon={<CircleAlert size={16} />}>
              No se pudo leer la plantilla del servidor. Revisa la conexión y vuelve a abrir esta ventana.
            </Notice>
          )}

          <div className="cep-pl__aviso">
            <span className="cep-pl__aviso-icono" aria-hidden><Lock size={16} /></span>
            <p><strong>Los cambios valen para las actas nuevas.</strong> Las ya registradas conservan la plantilla con la que se hicieron. Es la misma para toda la empresa.</p>
            <span className="cep-pl__resumen">{cats.length} categorías · {totalItems} ítems</span>
          </div>

          {cargando && <p className="cep-pl__vacio">Cargando plantilla…</p>}

          {!cargando && !sinConexion && (
            <div className="cep-pl__cuerpo">
              {/* Categorías */}
              <nav className="cep-pl__lista" aria-label="Categorías">
                <span className="cep-pl__lista-tit">Categorías</span>
                <ol>
                  {cats.map((c, i) => (
                    <li key={c.id}>
                      <button type="button" className={`cep-pl__cat${i === iSel ? ' cep-pl__cat--sel' : ''}${intento && !c.titulo.trim() ? ' cep-pl__cat--error' : ''}`}
                        aria-current={i === iSel} onClick={() => { haptic('selection'); setSel(i); setNuevoItem(''); }}>
                        <span className="cep-pl__num">{i + 1}</span>
                        <span className="cep-pl__cat-nombre">{c.titulo.trim() || 'Sin nombre'}</span>
                        <span className="cep-pl__cat-n">{c.items.filter(x => x.trim()).length}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <button type="button" className="cep-pl__nueva" onClick={agregarCategoria}><Plus size={16} /> Nueva categoría</button>
              </nav>

              {/* Editor de la categoría elegida */}
              <section className="cep-pl__editor" aria-label={actual?.titulo || 'Categoría'}>
                {!actual ? (
                  <div className="cep-pl__vacio cep-pl__vacio--grande">
                    <ListChecks size={28} aria-hidden />
                    <p>Aún no hay categorías.</p>
                    <Button variant="secondary" icon={<Plus size={16} />} onClick={agregarCategoria}>Crear la primera</Button>
                  </div>
                ) : (
                  <>
                    <header className="cep-pl__cab">
                      <div className="cep-pl__nombre">
                        <label htmlFor="cep-pl-nombre">Nombre de la categoría</label>
                        <input id="cep-pl-nombre" ref={refNombre} className={`cep-pl__nombre-input${sinNombreActual ? ' cep-pl__nombre-input--error' : ''}`}
                          value={actual.titulo} placeholder="Ej. Frente exterior" autoComplete="off"
                          onChange={e => cambiarCat(iSel, x => ({ ...x, titulo: e.target.value }))} />
                        {sinNombreActual && <span className="cep-pl__error">Escribe un nombre para la categoría.</span>}
                      </div>
                      <div className="cep-pl__cab-acciones">
                        <button type="button" className="cep-pl__icono" aria-label="Subir categoría" title="Subir" disabled={iSel === 0} onClick={() => moverCategoria(-1)}><ChevronUp size={18} /></button>
                        <button type="button" className="cep-pl__icono" aria-label="Bajar categoría" title="Bajar" disabled={iSel === cats.length - 1} onClick={() => moverCategoria(1)}><ChevronDown size={18} /></button>
                        <button type="button" className="cep-pl__icono cep-pl__icono--peligro" aria-label={`Eliminar categoría ${actual.titulo || 'sin nombre'}`} title="Eliminar categoría" onClick={() => setPorQuitar(iSel)}><Trash2 size={17} /></button>
                      </div>
                    </header>

                    <div className="cep-pl__items-cab">
                      <span>Ítems a calificar</span>
                      <em>{actual.items.length}</em>
                    </div>

                    <ul className="cep-pl__items">
                      {actual.items.map((it, k) => (
                        <li key={`${actual.id}-${k}`} className="cep-pl__item">
                          <span className="cep-pl__item-n">{k + 1}</span>
                          <input ref={el => { refItems.current[k] = el; }} value={it} aria-label={`Ítem ${k + 1} de ${actual.titulo || 'la categoría'}`} placeholder="Nombre del ítem" autoComplete="off"
                            onChange={e => cambiarCat(iSel, x => ({ ...x, items: x.items.map((y, j) => (j === k ? e.target.value : y)) }))} />
                          <span className="cep-pl__item-acciones">
                            <button type="button" aria-label="Subir ítem" title="Subir" disabled={k === 0} onClick={() => moverItem(k, -1)}><ChevronUp size={16} /></button>
                            <button type="button" aria-label="Bajar ítem" title="Bajar" disabled={k === actual.items.length - 1} onClick={() => moverItem(k, 1)}><ChevronDown size={16} /></button>
                            <button type="button" className="cep-pl__quitar" aria-label={`Quitar ítem ${it || k + 1}`} title="Quitar" onClick={() => cambiarCat(iSel, x => ({ ...x, items: x.items.filter((_, j) => j !== k) }))}><X size={16} /></button>
                          </span>
                        </li>
                      ))}
                      {actual.items.length === 0 && <li className="cep-pl__vacio">Esta categoría todavía no tiene ítems.</li>}
                    </ul>

                    <form className="cep-pl__agregar" onSubmit={e => { e.preventDefault(); agregarItem(); }}>
                      <Plus size={16} aria-hidden />
                      <input ref={refNuevo} value={nuevoItem} onChange={e => setNuevoItem(e.target.value)} placeholder="Añadir un ítem y pulsar Enter" aria-label="Nuevo ítem" autoComplete="off" />
                      <button type="submit" disabled={!nuevoItem.trim()}>Añadir</button>
                    </form>
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      </Sheet>

      <ConfirmSheet open={restaurar} onClose={() => setRestaurar(false)}
        onConfirm={() => { setCats(copia(PLANTILLA_FABRICA)); setSel(0); setError(null); setRestaurar(false); }}
        title="¿Volver a la plantilla de fábrica?"
        message="Se reemplaza lo que ves por las categorías originales. No se guarda hasta que pulses Guardar plantilla."
        confirmLabel="Restaurar" />

      <ConfirmSheet open={porQuitar !== null} onClose={() => setPorQuitar(null)}
        onConfirm={() => { if (porQuitar !== null) { setCats(l => l.filter((_, j) => j !== porQuitar)); setSel(s => Math.max(0, Math.min(s, cats.length - 2))); } setPorQuitar(null); }}
        title="¿Eliminar esta categoría?"
        message="Se quita la categoría completa con todos sus ítems. No se guarda hasta que pulses Guardar plantilla."
        confirmLabel="Eliminar" />
    </>
  );
}
