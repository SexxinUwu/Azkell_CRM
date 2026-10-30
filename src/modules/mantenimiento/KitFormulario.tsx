import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { SeleccionMultiple, type OpcionSeleccion } from '../../core/ui/SeleccionMultiple';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useInventario } from '../almacen/api';
import { usePlacas } from '../placas/api';
import { useTiposPreventivo } from './fleetrunApi';
import {
  buscarItemAlmacen, codigoDeArticulo, conFormatoInv, mapearAlmacen, marcasDisponibles, modelosDeMarca,
  type ArticuloKit, type KitGrupo, type KitItem,
} from './kitsFormulario';

// Crear o editar un kit de mantenimiento. Misma lógica que modulos/mantenimiento/kits-mp/logica.js
// (kitsAbrirModal, kitsEditarKit, kitsModalAgregarFila, kitsModalGuardar, kitsConfirmarEliminarKitGrupo).
// Las observaciones del clásico no se incluyen: su guardado nunca las enviaba.

const TIPOS_RESPALDO = ['MP1', 'MP2', 'MP3', 'MP4', 'INSPECCION'];
const MODELO_GENERAL = ['TODOS LOS MODELOS', 'TODOS'];

interface FilaKit {
  key: string;
  codigo: string;
  nombre: string;
  cantidad: string;
  unidad: string;
  costo: number;
  /** Stock y unidad del artículo vinculado a Almacén (null si no está vinculado) */
  vinculo: { stock: number; unidad: string } | null;
}

/** Fila nueva, o la de un ítem ya guardado (kitsModalAgregarFila): se vincula con el inventario en vivo */
function crearFila(lista: ArticuloKit[], key: string, it?: KitItem): FilaKit {
  const kCod = (it?.item_codigo ?? '').toString().trim();
  const kNom = (it?.item_nombre ?? '').toString().trim();
  const inv = buscarItemAlmacen(lista, kCod, kNom);
  let codigo = inv ? codigoDeArticulo(inv) : conFormatoInv(kCod);
  if (codigo === '-' || codigo === '—') codigo = '';
  let costo = Number(it?.costo_unitario ?? 0) || 0;
  if (inv && inv.costo > 0 && costo <= 0) costo = inv.costo;
  return {
    key,
    codigo,
    nombre: inv ? inv.nombre : kNom,
    cantidad: String(it ? Number(it.cantidad) || 1 : 1),
    unidad: it?.unidad_medida || (inv ? inv.unidad : 'UND'),
    costo,
    vinculo: inv ? { stock: inv.stock, unidad: inv.unidad } : null,
  };
}

function Seccion({ numero, titulo, derecha, children }: { numero: number; titulo: string; derecha?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 700 }}>{numero}</span>
          {titulo}
        </h3>
        {derecha}
      </div>
      {children}
    </section>
  );
}

/** Casilla de modelos: muestra lo elegido y abre la hoja de casillas (mismo diseño que el de placa) */
function CampoModelos({ id, describedBy, resumen, abrir }: { id: string; describedBy?: string; resumen: string; abrir: () => void }) {
  return (
    <button type="button" id={id} className="campo-picker" aria-haspopup="dialog" aria-describedby={describedBy} onClick={abrir}>
      {resumen
        ? <span className="campo-picker__detalle" style={{ textAlign: 'left' }}>{resumen}</span>
        : <span className="campo-picker__vacio">TODOS LOS MODELOS (o elija varios)</span>}
      <ChevronDown size={16} aria-hidden className="campo-picker__chevron" />
    </button>
  );
}

export function KitFormulario({ kit, kitsExistentes, open, onClose, onPedirEliminar }: {
  /** null = kit nuevo */
  kit: KitGrupo | null;
  /** Todos los ítems de kits guardados (para marcas y modelos ya usados) */
  kitsExistentes: KitItem[];
  open: boolean;
  onClose: () => void;
  onPedirEliminar: (kit: KitGrupo) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const inv = useInventario();
  const placas = usePlacas();
  const tipos = useTiposPreventivo();
  const editando = !!kit;
  const idModelos = useId();
  const dlCodigos = useId();
  const dlNombres = useId();

  const lista = useMemo(() => mapearAlmacen(inv.data ?? []), [inv.data]);
  // La lista llega en vivo: se guarda en una ref para no reiniciar el formulario cuando el inventario se vuelve a cargar
  const listaRef = useRef(lista);
  listaRef.current = lista;
  const inventarioListo = !!inv.data;

  const [marca, setMarca] = useState<string | null>(null);
  const [tipo, setTipo] = useState<string | null>(null);
  const [modelos, setModelos] = useState<string[]>([]);
  const [alias, setAlias] = useState('');
  const [filas, setFilas] = useState<FilaKit[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [abiertoModelos, setAbiertoModelos] = useState(false);
  const secuencia = useRef(0);
  const nuevaKey = () => `kit-fila-${++secuencia.current}`;

  // Al abrir (o al llegar el inventario, si estaba cargando) se carga el kit o un formulario vacío
  useEffect(() => {
    if (!open || !inventarioListo) return;
    const l = listaRef.current;
    if (kit) {
      setMarca(kit.marca.trim().toUpperCase());
      setTipo(kit.tipo_mp.trim().toUpperCase());
      const modelo = (kit.modelo || '').trim().toUpperCase();
      setModelos(modelo && !MODELO_GENERAL.includes(modelo) ? [modelo] : []);
      setAlias(kit.alias || '');
      setFilas(kit.items.length
        ? kit.items.map(it => crearFila(l, nuevaKey(), it))
        : [crearFila(l, nuevaKey())]);
    } else {
      setMarca(null);
      setTipo(null);
      setModelos([]);
      setAlias('');
      setFilas([crearFila(l, nuevaKey())]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kit, inventarioListo]);

  const marcaTxt = (marca ?? '').trim().toUpperCase();
  const tipoTxt = (tipo ?? '').trim().toUpperCase();

  // Opciones: como el clásico, salen de las motoras de la flota y de los kits ya guardados
  const opcionesMarca = useMemo(() => {
    const lista = marcasDisponibles(placas.data ?? [], kitsExistentes.map(i => i.marca_vehiculo.trim().toUpperCase()));
    if (marcaTxt && !lista.includes(marcaTxt)) lista.push(marcaTxt);
    return lista.map(m => ({ value: m, label: m }));
  }, [placas.data, kitsExistentes, marcaTxt]);

  const opcionesTipo = useMemo(() => {
    const base = tipos.data?.length ? tipos.data : TIPOS_RESPALDO;
    const lista = [...base];
    if (tipoTxt && !lista.includes(tipoTxt)) lista.push(tipoTxt);
    return lista.map(t => ({ value: t, label: t }));
  }, [tipos.data, tipoTxt]);

  const modelosOpciones = useMemo(() => {
    const deKits = kitsExistentes
      .filter(i => i.marca_vehiculo.trim().toUpperCase() === marcaTxt)
      .map(i => i.modelo_vehiculo);
    const lista = modelosDeMarca(marcaTxt, placas.data ?? [], deKits);
    for (const m of modelos) if (!lista.includes(m)) lista.push(m);
    return lista.sort();
  }, [marcaTxt, placas.data, kitsExistentes, modelos]);

  const hayModelosMarca = modelosOpciones.length > 0;

  // Título: fijo al editar; al crear, cambia con la marca, los modelos y el tipo (kitsModalActualizarTitulo)
  const modStr = modelos.length === 1 ? ` • ${modelos[0]}` : modelos.length > 1 ? ` • ${modelos.length} Modelos` : '';
  const titulo = editando && kit
    ? `Editar Kit: ${kit.marca} • ${kit.modelo} (${kit.nombre_kit})`
    : (marcaTxt || tipoTxt) ? `Configurar Kit: ${marcaTxt || 'Vehículo'}${modStr} (${tipoTxt || 'MP'})` : 'Nuevo Kit de Mantenimiento';

  function editarFila(key: string, cambios: Partial<FilaKit>) {
    setFilas(prev => prev.map(f => (f.key === key ? { ...f, ...cambios } : f)));
  }

  // Al escribir un código o elegirlo: se completan nombre, unidad, costo y stock (kitsModalItemCodigoCambiado)
  function cambiarCodigo(key: string, valor: string) {
    const m = valor.trim() ? buscarItemAlmacen(listaRef.current, valor.trim(), '') : null;
    editarFila(key, m
      ? { codigo: valor, nombre: m.nombre, unidad: m.unidad || 'UND', costo: m.costo || 0, vinculo: { stock: m.stock, unidad: m.unidad } }
      : { codigo: valor });
  }

  // Al escribir un repuesto o elegirlo: se completan código, unidad, costo y stock (kitsModalItemNombreCambiado)
  function cambiarNombre(key: string, valor: string) {
    const m = valor.trim() ? buscarItemAlmacen(listaRef.current, '', valor.trim()) : null;
    editarFila(key, m
      ? { nombre: valor, codigo: codigoDeArticulo(m), unidad: m.unidad || 'UND', costo: m.costo || 0, vinculo: { stock: m.stock, unidad: m.unidad } }
      : { nombre: valor });
  }

  function cambiarMarca(valor: string | null) {
    setMarca(valor);
    setModelos([]); // kitsModalMarcaCambiada: al cambiar de marca se limpian los modelos
  }

  function alternarModelo(valor: string) {
    const m = valor.trim().toUpperCase();
    setModelos(prev => (prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]));
  }

  const opcionesModelos: OpcionSeleccion[] = modelosOpciones.map(m => ({ valor: m, titulo: m }));

  async function guardar() {
    const marcaV = marcaTxt;
    const tipoV = tipoTxt;
    if (!marcaV) return toast('Por favor seleccione la marca del vehículo.', 'error');
    if (!tipoV) return toast('Por favor seleccione el tipo de preventivo (MP1, MP2, etc.).', 'error');

    const baseItems: { item_codigo: string; item_nombre: string; cantidad: number; unidad_medida: string; costo_unitario: number }[] = [];
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      const itemCodigo = f.codigo.trim();
      const itemNombre = f.nombre.trim();
      const cant = parseFloat(f.cantidad) || 0;
      if (!itemNombre) return toast(`El ítem #${i + 1} no tiene nombre de repuesto.`, 'error');
      if (cant <= 0) return toast(`El ítem "${itemNombre}" debe tener una cantidad mayor a 0.`, 'error');

      // Vincular con Almacén en vivo para la unidad y el costo referencial exactos
      const match = buscarItemAlmacen(listaRef.current, itemCodigo, itemNombre);
      const unid = (match ? match.unidad : (f.unidad || 'UND')).toUpperCase();
      const cu = match ? (match.costo || 0) : (f.costo || 0);
      const codFinal = match ? codigoDeArticulo(match) : conFormatoInv(itemCodigo);
      baseItems.push({
        item_codigo: codFinal || '-',
        item_nombre: match ? match.nombre : itemNombre,
        cantidad: cant,
        unidad_medida: unid,
        costo_unitario: cu,
      });
    }
    if (!baseItems.length) return toast('Debe registrar al menos un ítem o repuesto en el kit.', 'error');

    const payload = {
      marca_vehiculo: marcaV,
      modelos: modelos.length ? modelos : ['TODOS LOS MODELOS'],
      tipo_mp: tipoV,
      nombre_kit: alias.trim() || null,
      items: baseItems,
      kitOrig: kit ? {
        marca: kit.marca.trim().toUpperCase(),
        modelo: (kit.modelo || 'TODOS LOS MODELOS').trim().toUpperCase(),
        tipo_mp: kit.tipo_mp.trim().toUpperCase(),
        nombre_kit: kit.alias || null,
      } : null,
    };

    setGuardando(true);
    try {
      await api('/mantenimiento-kits/guardarKitLote', { method: 'POST', body: payload });
      qc.invalidateQueries({ queryKey: ['mant', 'kits-mp'] });
      onClose();
    } catch (e) {
      toast(`Ocurrió un error al guardar los cambios del kit: ${errorMessage(e)}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => !guardando && onClose()}
      title={titulo}
      ancho
      footer={
        <>
          {editando && kit && (
            <Button variant="danger" icon={<Trash2 size={16} />} disabled={guardando} onClick={() => onPedirEliminar(kit)}>
              Eliminar kit
            </Button>
          )}
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando} disabled={!inventarioListo}>Guardar kit</Button>
        </>
      }
    >
      {!inventarioListo ? <PageLoader /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
          <p className="field__hint" style={{ margin: 0 }}>
            {editando
              ? 'Modifique los repuestos, cantidades o modelos asignados al kit'
              : 'Configure el vehículo, tipo de preventivo y agregue repuestos requeridos'}
          </p>

          <Seccion numero={1} titulo="Vehículo y tipo de preventivo">
            <div className="form-grid">
              <Field label="Marca">
                {p => (
                  <Combobox {...p} options={opcionesMarca} value={marca} onChange={cambiarMarca} placeholder="Seleccione marca…" />
                )}
              </Field>
              <Field label="Tipo de preventivo">
                {p => (
                  <Combobox {...p} options={opcionesTipo} value={tipo} onChange={setTipo} placeholder="Seleccione tipo…" />
                )}
              </Field>

              <div className="field field--wide">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <label className="field__label" htmlFor={idModelos}>Modelos</label>
                  <span style={{ display: 'flex', gap: 4 }}>
                    <Button variant="plain" size="sm" disabled={!hayModelosMarca}
                      onClick={() => setModelos(modelosOpciones)}>Todos</Button>
                    <Button variant="plain" size="sm" disabled={!modelos.length}
                      onClick={() => setModelos([])}>Limpiar</Button>
                  </span>
                </div>
                <CampoModelos id={idModelos} resumen={modelos.join(' · ')} abrir={() => setAbiertoModelos(true)}
                  describedBy={!hayModelosMarca && marcaTxt ? `${idModelos}-ayuda` : undefined} />
                {modelos.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {modelos.map(m => (
                      <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 4px 2px 10px', borderRadius: 999,
                        background: 'var(--accent-tint)', color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 600 }}>
                        {m}
                        <button type="button" aria-label={`Quitar ${m}`} onClick={() => alternarModelo(m)}
                          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', minWidth: 28, minHeight: 28,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <X size={14} aria-hidden />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <span id={`${idModelos}-ayuda`} className="field__hint">
                  {!modelos.length && 'Sin modelos elegidos: el kit se aplica a "TODOS LOS MODELOS".'}
                  {!hayModelosMarca && marcaTxt && (
                    <> No hay modelos específicos registrados para <strong>{marcaTxt}</strong>. Se aplicará a "TODOS LOS MODELOS".</>
                  )}
                </span>
              </div>

              <Field label="Nombre / alias descriptivo del kit (opcional)" wide>
                {p => (
                  <TextInput {...p} value={alias} onChange={e => setAlias(e.target.value)}
                    placeholder="Ej: Kit Completo Filtros y Aceite Motor 15W-40" />
                )}
              </Field>
            </div>
          </Seccion>

          <Seccion numero={2} titulo="Repuestos, lubricantes y materiales del kit"
            derecha={<Button variant="secondary" size="sm" icon={<Plus size={15} />}
              onClick={() => setFilas(prev => [...prev, crearFila(listaRef.current, nuevaKey())])}>Agregar ítem</Button>}>
            <datalist id={dlCodigos}>
              {lista.map((a, i) => <option key={`c${i}`} value={codigoDeArticulo(a)}>{a.nombre}</option>)}
            </datalist>
            <datalist id={dlNombres}>
              {lista.map((a, i) => <option key={`n${i}`} value={a.nombre}>{codigoDeArticulo(a)}</option>)}
            </datalist>

            {filas.map(f => (
              <div key={f.key} style={{ border: '1px solid var(--separator)', borderRadius: 12, padding: 12, background: 'var(--fill-1)',
                display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="form-grid">
                  <Field label="Código artículo">
                    {p => (
                      <TextInput {...p} list={dlCodigos} autoComplete="off" placeholder="CÓDIGO…" value={f.codigo}
                        className="font-mono" onChange={e => cambiarCodigo(f.key, e.target.value)} />
                    )}
                  </Field>
                  <Field label="Cantidad">
                    {p => (
                      <TextInput {...p} type="number" inputMode="decimal" step="0.01" min="0.01" value={f.cantidad}
                        onChange={e => editarFila(f.key, { cantidad: e.target.value })} />
                    )}
                  </Field>
                  <Field label="Repuesto / lubricante / material" wide>
                    {p => (
                      <TextInput {...p} list={dlNombres} autoComplete="off" placeholder="Escriba o elija del inventario…" value={f.nombre}
                        onChange={e => cambiarNombre(f.key, e.target.value)} />
                    )}
                  </Field>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span className="field__hint">
                    {f.vinculo
                      ? <>Stock Almacén: <strong>{f.vinculo.stock}</strong> {f.vinculo.unidad}</>
                      : 'Ingrese código o nombre para vincular a Almacén'}
                  </span>
                  <Button variant="plain" iconOnly icon={<Trash2 size={16} />} title="Quitar ítem" aria-label="Quitar ítem"
                    onClick={() => setFilas(prev => prev.filter(x => x.key !== f.key))} />
                </div>
              </div>
            ))}

            <div className="field__hint">
              {filas.length} {filas.length === 1 ? 'Ítem' : 'Ítems'} · Los códigos y descripciones se vinculan en tiempo real al catálogo oficial de Almacén
            </div>
          </Seccion>
        </div>
      )}

      <SeleccionMultiple open={abiertoModelos} onClose={() => setAbiertoModelos(false)} titulo="Modelos"
        opciones={opcionesModelos} seleccionados={modelos} onToggle={alternarModelo} placeholder="Buscar modelo"
        vacio="No hay modelos para esta marca." />
    </Sheet>
  );
}
