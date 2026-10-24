import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { ESQUEMA_POR_DEFECTO } from './esquemaPorDefecto';
import { useEsquema, type Seccion, type TipoPunto } from './registro';

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

  // Al abrir: copia editable de la plantilla vigente
  useEffect(() => {
    if (!open) return;
    setError(null);
    setRecienAgregado(null);
    setSistemas(esquema.data ? aEditable(esquema.data) : null);
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
        const fabrica = aEditable(ESQUEMA_POR_DEFECTO);
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
          <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
            <Notice>
              Cada sistema es una sección de la inspección mecánica. Los ítems de OK / Falla se marcan con OK o FALLA;
              los de % Medición de desgaste reciben un porcentaje.
            </Notice>
            {error && <Notice tone="error">{error}</Notice>}

            {sistemas.map((s, si) => (
              <section key={s.id} className="card" style={{ display: 'grid', gap: 'var(--s-3)' }}>
                <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
                  <TextInput
                    aria-label={`Nombre del sistema ${si + 1}`}
                    placeholder="Nombre del sistema, ej. MOTOR"
                    value={s.titulo}
                    autoFocus={s.id === recienAgregado}
                    onChange={e => cambiarTitulo(s.id, e.target.value)}
                    style={{ fontWeight: 700, flex: 1 }}
                  />
                  <Button variant="plain" iconOnly icon={<Trash2 size={16} />} aria-label={`Quitar sistema ${s.titulo.trim() || si + 1}`} onClick={() => pedirQuitarSistema(s)} />
                </div>

                {s.items.length === 0 && <p className="t-footnote c-secondary">Sin ítems todavía.</p>}
                {s.items.map(it => (
                  <div key={it.id} style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextInput
                      aria-label={`Ítem de ${s.titulo.trim() || `sistema ${si + 1}`}`}
                      placeholder="Nombre del ítem"
                      value={it.label}
                      autoFocus={it.id === recienAgregado}
                      onChange={e => cambiarItem(s.id, it.id, { label: e.target.value })}
                      style={{ flex: '1 1 220px' }}
                    />
                    <SelectInput
                      aria-label="Tipo de ítem"
                      value={it.tipo}
                      onChange={e => cambiarItem(s.id, it.id, { tipo: e.target.value as TipoPunto })}
                      style={{ width: 'auto' }}
                    >
                      {opcionesTipo(it.tipo).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </SelectInput>
                    <Button variant="plain" iconOnly icon={<Trash2 size={16} />} aria-label="Quitar ítem" onClick={() => quitarItem(s.id, it.id)} />
                  </div>
                ))}

                <div>
                  <Button variant="secondary" size="sm" icon={<Plus size={15} />} onClick={() => agregarItem(s.id)}>Agregar ítem</Button>
                </div>
              </section>
            ))}

            {sistemas.length === 0 && <p className="t-callout c-secondary">Aún no hay sistemas en la plantilla.</p>}
            <div>
              <Button variant="secondary" icon={<Plus size={16} />} onClick={agregarSistema}>Agregar sistema</Button>
            </div>
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
