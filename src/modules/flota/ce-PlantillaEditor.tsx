import './ce-plantilla.css';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { cargarPlantilla, guardarPlantilla, PLANTILLA_FABRICA } from './ce-plantilla';
import type { CategoriaPlantilla } from './ce-tipos';

const copia = (c: CategoriaPlantilla[]): CategoriaPlantilla[] => JSON.parse(JSON.stringify(c));

const nuevaCategoria = (): CategoriaPlantilla => ({ id: `cat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, titulo: '', items: [] });

/**
 * Editor de la plantilla de inventario (Entrega de vehículos › Plantilla).
 * Categorías e ítems que se califican (B / R / M) en cada acta. Es corporativa: vale para toda la empresa
 * y no cambia las actas ya hechas. "De fábrica" reemplaza lo que se ve por la plantilla original; se guarda al pulsar Guardar.
 */
export function CePlantilla({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [cats, setCats] = useState<CategoriaPlantilla[]>([]);
  const [cargando, setCargando] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);
  const [intento, setIntento] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restaurar, setRestaurar] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierta) return;
    let vigente = true;
    setError(null); setIntento(false); setSinConexion(false); setCargando(true);
    cargarPlantilla().then(lista => {
      if (!vigente) return;
      if (lista === null) { setSinConexion(true); setCats([]); }
      else setCats(copia(lista));
    }).finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [abierta]);

  const cambiarCat = (i: number, f: (c: CategoriaPlantilla) => CategoriaPlantilla) =>
    setCats(l => l.map((c, j) => (j === i ? f(c) : c)));

  async function guardar() {
    const limpia = cats.map(c => ({ ...c, titulo: c.titulo.trim(), items: c.items.map(x => x.trim()).filter(Boolean) }));
    setIntento(true);
    if (limpia.some(c => !c.titulo)) { setError('Cada categoría necesita un nombre.'); return; }
    if (!limpia.length) { setError('Deja al menos una categoría con ítems.'); return; }
    setError(null);
    setGuardando(true);
    try {
      await guardarPlantilla(limpia);
      qc.invalidateQueries({ queryKey: ['flota', 'entrega-plantilla'] });
      haptic('success');
      toast('Plantilla de entrega guardada para toda la empresa');
      onCerrar();
    } catch (err) {
      setError(`No se pudo guardar la plantilla. ${errorMessage(err)}`);
      haptic('warning');
    } finally {
      setGuardando(false);
    }
  }

  const bloqueada = cargando || sinConexion;

  return (
    <>
      <Sheet open={abierta} onClose={onCerrar} title="Plantilla de inventario" ancho
        footer={<>
          <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => setRestaurar(true)} disabled={bloqueada}>De fábrica</Button>
          <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando} disabled={bloqueada || guardando}>Guardar</Button>
        </>}>
        <div className="ce-plantilla">
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
          {sinConexion && (
            <Notice tone="error" icon={<CircleAlert size={16} />}>
              No se pudo leer la plantilla del servidor. Revisa la conexión y vuelve a abrir esta ventana.
            </Notice>
          )}
          <p className="t-footnote c-secondary ce-plantilla__ayuda">
            Las categorías e ítems de abajo son los que se califican (Bueno, Regular, Malo) en cada acta nueva.
            Se guardan en el servidor y valen para toda la empresa.
          </p>

          {cargando && <p className="t-footnote c-secondary">Cargando plantilla…</p>}
          {!cargando && !sinConexion && cats.length === 0 && (
            <p className="t-footnote c-secondary">No hay categorías. Agrega una para comenzar.</p>
          )}

          {cats.map((c, i) => {
            const sinNombre = intento && !c.titulo.trim();
            return (
              <section key={c.id} className="ce-plantilla__cat" aria-label={c.titulo || 'Categoría sin nombre'}>
                <div className="ce-plantilla__cat-cab">
                  <div className="ce-plantilla__cat-nombre">
                    <Field label="Categoría" error={sinNombre ? 'Escribe un nombre para la categoría.' : null}>
                      {p => (
                        <TextInput {...p} value={c.titulo} placeholder="Nombre de la categoría" disabled={bloqueada}
                          onChange={e => cambiarCat(i, x => ({ ...x, titulo: e.target.value }))} />
                      )}
                    </Field>
                  </div>
                  <Button variant="secondary" iconOnly icon={<Trash2 size={16} />} disabled={bloqueada}
                    aria-label={`Eliminar categoría ${c.titulo || 'sin nombre'}`}
                    onClick={() => setCats(l => l.filter((_, j) => j !== i))} />
                </div>

                <ul className="ce-plantilla__items">
                  {c.items.map((it, k) => (
                    <li key={k} className="ce-plantilla__item">
                      <TextInput value={it} aria-label={`Ítem ${k + 1} de ${c.titulo || 'la categoría'}`}
                        placeholder="Nombre del ítem" disabled={bloqueada}
                        onChange={e => cambiarCat(i, x => ({ ...x, items: x.items.map((y, j) => (j === k ? e.target.value : y)) }))} />
                      <Button variant="secondary" iconOnly icon={<X size={16} />} disabled={bloqueada}
                        aria-label={`Quitar ítem ${it || k + 1}`}
                        onClick={() => cambiarCat(i, x => ({ ...x, items: x.items.filter((_, j) => j !== k) }))} />
                    </li>
                  ))}
                </ul>

                <Button variant="secondary" icon={<Plus size={16} />} disabled={bloqueada}
                  onClick={() => cambiarCat(i, x => ({ ...x, items: [...x.items, ''] }))}>Añadir ítem</Button>
              </section>
            );
          })}

          <Button variant="secondary" icon={<Plus size={16} />} disabled={bloqueada}
            onClick={() => setCats(l => [...l, nuevaCategoria()])}>Nueva categoría</Button>
        </div>
      </Sheet>

      <ConfirmSheet open={restaurar} onClose={() => setRestaurar(false)}
        onConfirm={() => { setCats(copia(PLANTILLA_FABRICA)); setError(null); setRestaurar(false); }}
        title="¿Volver a la plantilla de fábrica?"
        message="Se reemplaza lo que ves por las categorías originales. No se guarda hasta que pulses Guardar."
        confirmLabel="Restaurar" />
    </>
  );
}
