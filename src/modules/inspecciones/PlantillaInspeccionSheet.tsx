import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Info, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import '../flota/ce-plantilla.css';
import './plantilla-inspeccion.css';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { ESQUEMA_POR_DEFECTO } from './esquemaPorDefecto';
import { asegurarNivelCombustible, useEsquema, type Seccion, type TipoPunto } from './registro';

// Plantilla de la inspección mecánica: sistemas (LLANTA, MOTOR…) con sus ítems.
// Lee la plantilla vigente con useEsquema y guarda con POST /api/mantenimiento/inspecciones/config/guardar
// { templates: [{ template_id, titulo, items_json: [{ id, label, type }] }] } (misma forma que el clásico).
// El servidor reemplaza la plantilla completa. "Valores de fábrica" solo carga la estándar en la pantalla:
// nada cambia hasta pulsar Guardar (igual que el clásico).

interface ItemEdit { id: string; label: string; tipo: TipoPunto }
interface SistemaEdit { id: string; titulo: string; items: ItemEdit[] }
interface Pendiente { titulo: string; mensaje: string; confirmar: string; accion: () => void }

const OPCIONES_TIPO: Array<{ value: TipoPunto; label: string }> = [
  { value: 'okfalla', label: 'OK / Falla' },
  { value: 'percent', label: '% Medición de desgaste' },
  { value: 'nivel', label: 'Nivel de combustible (medidor, solo motoras)' },
];

// Un ítem "texto libre" puede venir de la base; se conserva para no perderlo al guardar
const opcionesTipo = (tipo: TipoPunto) => (tipo === 'text' ? [...OPCIONES_TIPO, { value: 'text' as TipoPunto, label: 'Texto libre' }] : OPCIONES_TIPO);

let contadorIds = 0;
const nuevoId = (prefijo: string) => `${prefijo}_${Date.now().toString(36)}_${(contadorIds++).toString(36)}`;

function aEditable(esquema: Seccion[]): SistemaEdit[] {
  return esquema.map(s => ({
    id: nuevoId('cat'),
    titulo: s.titulo,
    items: s.items.map(it => ({ id: nuevoId('i'), label: it.label, tipo: it.tipo })),
  }));
}

/** Primer problema que impide guardar, o null si todo está bien */
function validar(sistemas: SistemaEdit[]): string | null {
  if (sistemas.length === 0) return 'La plantilla necesita al menos un sistema.';
  for (const s of sistemas) {
    const nombre = s.titulo.trim();
    if (!nombre) return 'Cada sistema necesita un nombre.';
    if (s.items.length === 0) return `${nombre} no tiene ítems. Agrega al menos uno o quita el sistema.`;
    if (s.items.some(it => !it.label.trim())) return `Hay ítems sin nombre en ${nombre}.`;
  }
  return null;
}

export function PlantillaInspeccionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const esquema = useEsquema();
  const qc = useQueryClient();
  const toast = useToast();
  const [sistemas, setSistemas] = useState<SistemaEdit[] | null>(null);
  const [recienAgregado, setRecienAgregado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const selIdx = sistemas && sistemas.length ? Math.max(0, sistemas.findIndex(x => x.id === selId)) : 0;
  const actual = sistemas && sistemas.length ? sistemas[selIdx] : null;
  function moverSistema(d: number) {
    editar(l => { const n = [...l]; const j = selIdx + d; if (j < 0 || j >= n.length) return l; [n[selIdx], n[j]] = [n[j], n[selIdx]]; return n; });
  }
  function moverItem(sid: string, k: number, d: number) {
    editar(l => l.map(x => { if (x.id !== sid) return x; const it = [...x.items]; const j = k + d; if (j < 0 || j >= it.length) return x; [it[k], it[j]] = [it[j], it[k]]; return { ...x, items: it }; }));
  }

  // Al abrir: copia editable de la plantilla vigente
  useEffect(() => {
    if (!open) return;
    setError(null);
    setRecienAgregado(null);
    setSistemas(esquema.data ? aEditable(esquema.data) : null);
    setSelId(null);
  }, [open]);

  // Si la plantilla aún se estaba cargando al abrir, se llena cuando llegue
  useEffect(() => {
    if (open && sistemas === null && esquema.data) setSistemas(aEditable(esquema.data));
  }, [open, sistemas, esquema.data]);

  const editar = (fn: (s: SistemaEdit[]) => SistemaEdit[]) => setSistemas(prev => (prev ? fn(prev) : prev));

  const cambiarTitulo = (sid: string, titulo: string) =>
    editar(s => s.map(x => (x.id === sid ? { ...x, titulo } : x)));
  const cambiarItem = (sid: string, iid: string, cambios: Partial<ItemEdit>) =>
    editar(s => s.map(x => (x.id !== sid ? x : { ...x, items: x.items.map(it => (it.id === iid ? { ...it, ...cambios } : it)) })));
  const quitarItem = (sid: string, iid: string) =>
    editar(s => s.map(x => (x.id !== sid ? x : { ...x, items: x.items.filter(it => it.id !== iid) })));
  const agregarItem = (sid: string) => {
    const id = nuevoId('i');
    setRecienAgregado(id);
    editar(s => s.map(x => (x.id !== sid ? x : { ...x, items: [...x.items, { id, label: '', tipo: 'okfalla' }] })));
  };
  const agregarSistema = () => {
    const id = nuevoId('cat');
    setRecienAgregado(id);
    editar(s => [...s, { id, titulo: '', items: [] }]);
    setSelId(id);
  };

  function pedirQuitarSistema(s: SistemaEdit) {
    const n = s.items.length;
    setPendiente({
      titulo: `¿Quitar "${s.titulo.trim() || 'sin nombre'}"?`,
      mensaje: `Se quitan el sistema y sus ${n} ${n === 1 ? 'ítem' : 'ítems'}. Nada se guarda hasta que pulses Guardar plantilla.`,
      confirmar: 'Quitar',
      accion: () => editar(lista => lista.filter(x => x.id !== s.id)),
    });
  }

  function pedirRestaurar() {
    setPendiente({
      titulo: '¿Restaurar la plantilla de fábrica?',
      mensaje: 'Se reemplaza la plantilla actual por la estándar y se guarda de inmediato.',
      confirmar: 'Restaurar y guardar',
      accion: () => {
        setRecienAgregado(null);
        setError(null);
        const fabrica = aEditable(asegurarNivelCombustible(ESQUEMA_POR_DEFECTO));
        setSistemas(fabrica);
        void guardarLista(fabrica);
      },
    });
  }

  function guardar() {
    if (sistemas) void guardarLista(sistemas);
  }

  async function guardarLista(lista: NonNullable<typeof sistemas>) {
    if (enviando) return;
    const problema = validar(lista);
    if (problema) { setError(problema); return; }
    setError(null);
    setEnviando(true);
    try {
      const templates = lista.map((s, idx) => ({
        template_id: s.id || `cat_${idx + 1}`,
        titulo: s.titulo.trim().toUpperCase(),
        items_json: s.items.map(it => ({ id: it.id, label: it.label.trim(), type: it.tipo })),
      }));
      await api<{ ok?: boolean }>('/mantenimiento/inspecciones/config/guardar', { method: 'POST', body: { templates } });
      // Misma clave que useEsquema: las hojas de registro toman la plantilla nueva
      await qc.invalidateQueries({ queryKey: ['inspecciones', 'esquema'] });
      toast('Plantilla de inspección guardada');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setEnviando(false);
    }
  }

  const cerrar = () => { if (!enviando) onClose(); };

  return (
    <>
      <Sheet
        open={open}
        onClose={cerrar}
        title="Plantilla de inspección"
        ancho
        footer={
          <>
            <Button variant="plain" icon={<RotateCcw size={16} />} onClick={pedirRestaurar} disabled={sistemas === null || enviando} style={{ marginRight: 'auto' }}>
              Valores de fábrica
            </Button>
            <Button variant="secondary" onClick={cerrar} disabled={enviando}>Cancelar</Button>
            <Button variant="primary" onClick={guardar} loading={enviando} disabled={sistemas === null}>Guardar plantilla</Button>
          </>
        }
      >
        {sistemas === null ? <PageLoader /> : (
          <div className="cep-pl">
            {error && <Notice tone="error">{error}</Notice>}
            <div className="cep-pl__aviso">
              <span className="cep-pl__aviso-icono" aria-hidden><Info size={16} /></span>
              <p><strong>Cada sistema es una sección de la inspección mecánica.</strong> OK / Falla se marca con OK o FALLA; % Medición recibe un porcentaje; Nivel de combustible muestra el medidor (solo camiones, tractos y unidades motoras).</p>
              <span className="cep-pl__resumen">{sistemas.length} sistemas · {sistemas.reduce((n, x) => n + x.items.length, 0)} ítems</span>
            </div>

            {sistemas.length === 0 ? (
              <div className="cep-pl__vacio cep-pl__vacio--grande">
                <p>Aún no hay sistemas en la plantilla.</p>
                <Button variant="secondary" icon={<Plus size={16} />} onClick={agregarSistema}>Crear el primero</Button>
              </div>
            ) : (
              <div className="cep-pl__cuerpo">
                <nav className="cep-pl__lista" aria-label="Sistemas">
                  <span className="cep-pl__lista-tit">Sistemas</span>
                  <ol>
                    {sistemas.map((s, i) => (
                      <li key={s.id}>
                        <button type="button" className={`cep-pl__cat${i === selIdx ? ' cep-pl__cat--sel' : ''}`}
                          aria-current={i === selIdx} onClick={() => setSelId(s.id)}>
                          <span className="cep-pl__num">{i + 1}</span>
                          <span className="cep-pl__cat-nombre">{s.titulo.trim() || 'Sin nombre'}</span>
                          <span className="cep-pl__cat-n">{s.items.length}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                  <button type="button" className="cep-pl__nueva" onClick={agregarSistema}><Plus size={16} /> Nuevo sistema</button>
                </nav>

                {actual && (
                  <section className="cep-pl__editor" aria-label={actual.titulo || 'Sistema'}>
                    <header className="cep-pl__cab">
                      <div className="cep-pl__nombre">
                        <label htmlFor="insp-pl-nombre">Nombre del sistema</label>
                        <input id="insp-pl-nombre" className="cep-pl__nombre-input"
                          ref={el => { if (el && actual.id === recienAgregado) el.focus(); }}
                          value={actual.titulo} placeholder="Ej. MOTOR" autoComplete="off"
                          onChange={e => cambiarTitulo(actual.id, e.target.value.toUpperCase())} />
                      </div>
                      <div className="cep-pl__cab-acciones">
                        <button type="button" className="cep-pl__icono" aria-label="Subir sistema" title="Subir" disabled={selIdx === 0}
                          onClick={() => moverSistema(-1)}><ChevronUp size={18} /></button>
                        <button type="button" className="cep-pl__icono" aria-label="Bajar sistema" title="Bajar" disabled={selIdx === sistemas.length - 1}
                          onClick={() => moverSistema(1)}><ChevronDown size={18} /></button>
                        <button type="button" className="cep-pl__icono cep-pl__icono--peligro" aria-label={`Quitar sistema ${actual.titulo.trim() || selIdx + 1}`} title="Quitar sistema"
                          onClick={() => pedirQuitarSistema(actual)}><Trash2 size={17} /></button>
                      </div>
                    </header>

                    <div className="cep-pl__items-cab"><span>Ítems a revisar</span><em>{actual.items.length}</em></div>
                    <ul className="cep-pl__items">
                      {actual.items.map((it, k) => (
                        <li key={it.id} className="cep-pl__item">
                          <span className="cep-pl__item-n">{k + 1}</span>
                          <input value={it.label} aria-label={`Ítem ${k + 1}`} placeholder="Nombre del ítem" autoComplete="off"
                            autoFocus={it.id === recienAgregado}
                            onChange={e => cambiarItem(actual.id, it.id, { label: e.target.value })} />
                          <select className="cep-pl__tipo" aria-label={`Tipo del ítem ${k + 1}`} value={it.tipo}
                            onChange={e => cambiarItem(actual.id, it.id, { tipo: e.target.value as TipoPunto })}>
                            {opcionesTipo(it.tipo).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <span className="cep-pl__item-acciones">
                            <button type="button" aria-label="Subir ítem" title="Subir" disabled={k === 0} onClick={() => moverItem(actual.id, k, -1)}><ChevronUp size={16} /></button>
                            <button type="button" aria-label="Bajar ítem" title="Bajar" disabled={k === actual.items.length - 1} onClick={() => moverItem(actual.id, k, 1)}><ChevronDown size={16} /></button>
                            <button type="button" className="cep-pl__quitar" aria-label={`Quitar ítem ${it.label || k + 1}`} title="Quitar" onClick={() => quitarItem(actual.id, it.id)}><X size={16} /></button>
                          </span>
                        </li>
                      ))}
                      {actual.items.length === 0 && <li className="cep-pl__vacio">Este sistema todavía no tiene ítems.</li>}
                    </ul>
                    <div className="cep-pl__agregar">
                      <Button variant="secondary" icon={<Plus size={16} />} onClick={() => agregarItem(actual.id)}>Añadir ítem</Button>
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={!!pendiente}
        onClose={() => setPendiente(null)}
        onConfirm={() => { pendiente?.accion(); setPendiente(null); }}
        title={pendiente?.titulo ?? ''}
        message={pendiente?.mensaje ?? ''}
        confirmLabel={pendiente?.confirmar ?? 'Confirmar'}
      />
    </>
  );
}
