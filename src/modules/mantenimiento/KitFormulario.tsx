import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Layers, ListPlus, PackageSearch, Plus, Trash2, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import './kits.css';
import { BotonTip } from '../../core/ui/BotonTip';
import { Field, TextInput } from '../../core/ui/Field';
import { formatSoles } from '../../core/lib/format';
import { Combobox } from '../../core/ui/Combobox';
import { SeleccionMultiple, type OpcionSeleccion } from '../../core/ui/SeleccionMultiple';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useInventario } from '../almacen/api';
import { usePlacas } from '../placas/api';
import { useTiposPreventivo } from './fleetrunApi';
import { claseMp } from './KitTarjeta';
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

  // Resumen del kit: ítems y costo estimado (cantidad × costo de almacén)
  const totalKit = filas.reduce((n, f) => n + (parseFloat(f.cantidad) || 0) * (f.costo || 0), 0);
  const nuevoItem = () => setFilas(prev => [...prev, crearFila(listaRef.current, nuevaKey())]);

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
          <span className="kf-pie">{filas.length} {filas.length === 1 ? 'ítem' : 'ítems'} · <b className="t-numeric">{formatSoles(totalKit)}</b></span>
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando} disabled={!inventarioListo}>Guardar kit</Button>
        </>
      }
    >
      {!inventarioListo ? <PageLoader /> : (
        <div className="kf">
          <p className="kf-intro">
            {editando
              ? 'Modifique los repuestos, cantidades o modelos asignados al kit.'
              : 'Elija el vehículo y el tipo de preventivo, y agregue los repuestos que lleva el kit.'}
          </p>

          {/* 1 · Vehículo */}
          <section className="kf-seccion" aria-labelledby={`${idModelos}-s1`}>
            <header className="kf-seccion__cab">
              <span className="kf-num">1</span>
              <div><h3 id={`${idModelos}-s1`}>Vehículo y tipo de preventivo</h3><p>A qué unidades se aplica este kit</p></div>
            </header>

            <div className="kf-grid">
              <Field label="Marca">
                {p => <Combobox {...p} options={opcionesMarca} value={marca} onChange={cambiarMarca} placeholder="Seleccione marca…" />}
              </Field>
              <Field label="Nombre del kit (opcional)">
                {p => <TextInput {...p} value={alias} onChange={e => setAlias(e.target.value)} placeholder="Ej. Filtros y aceite de motor" />}
              </Field>

              <div className="field kf-ancho">
                <span className="field__label">Tipo de preventivo</span>
                <div className="kf-tipos" role="radiogroup" aria-label="Tipo de preventivo">
                  {opcionesTipo.map(t => (
                    <button key={t.value} type="button" role="radio" aria-checked={tipo === t.value} className={`kt-mp kf-tipo ${claseMp(t.value)}`} onClick={() => setTipo(t.value)}>{t.label}</button>
                  ))}
                </div>
              </div>

              <div className="field kf-ancho">
                <div className="kf-modelos__cab">
                  <label className="field__label" htmlFor={idModelos}>Modelos</label>
                  <span className="kf-modelos__acciones">
                    <Button variant="plain" size="sm" disabled={!hayModelosMarca} onClick={() => setModelos(modelosOpciones)}>Todos</Button>
                    <Button variant="plain" size="sm" disabled={!modelos.length} onClick={() => setModelos([])}>Limpiar</Button>
                  </span>
                </div>
                <div className="kf-modelos">
                  {modelos.map(m => (
                    <span key={m} className="kf-chip">
                      {m}
                      <button type="button" aria-label={`Quitar ${m}`} onClick={() => alternarModelo(m)}><X size={13} aria-hidden /></button>
                    </span>
                  ))}
                  <button type="button" id={idModelos} className="kf-agregar-modelo" onClick={() => setAbiertoModelos(true)} disabled={!hayModelosMarca}>
                    <Layers size={14} aria-hidden /> {modelos.length ? 'Cambiar modelos' : 'Elegir modelos'}
                  </button>
                </div>
                <span id={`${idModelos}-ayuda`} className="field__hint">
                  {!modelos.length && 'Sin modelos elegidos: el kit se aplica a «TODOS LOS MODELOS».'}
                  {!hayModelosMarca && marcaTxt && <> No hay modelos específicos registrados para <strong>{marcaTxt}</strong>.</>}
                </span>
              </div>
            </div>
          </section>

          {/* 2 · Repuestos */}
          <section className="kf-seccion" aria-labelledby={`${idModelos}-s2`}>
            <header className="kf-seccion__cab">
              <span className="kf-num">2</span>
              <div><h3 id={`${idModelos}-s2`}>Repuestos, lubricantes y materiales</h3><p>Se vinculan en tiempo real con el inventario de Almacén</p></div>
              <Button variant="secondary" size="sm" icon={<Plus size={15} />} onClick={nuevoItem}>Agregar ítem</Button>
            </header>

            <datalist id={dlCodigos}>
              {lista.map((a, i) => <option key={`c${i}`} value={codigoDeArticulo(a)}>{a.nombre}</option>)}
            </datalist>
            <datalist id={dlNombres}>
              {lista.map((a, i) => <option key={`n${i}`} value={a.nombre}>{codigoDeArticulo(a)}</option>)}
            </datalist>

            <div className="kf-items">
              <div className="kf-items__cab" aria-hidden>
                <span>Código</span><span>Repuesto</span><span>Cant.</span><span>Stock</span><span />
              </div>
              {filas.map((f, idx) => {
                const req = parseFloat(f.cantidad) || 0;
                const stockClase = !f.vinculo ? 'kt-stock--sin' : f.vinculo.stock >= req ? 'kt-stock--ok' : f.vinculo.stock > 0 ? 'kt-stock--bajo' : 'kt-stock--no';
                return (
                  <div key={f.key} className="kf-fila">
                    <span className="kf-fila__n" aria-hidden>{idx + 1}</span>
                    <TextInput list={dlCodigos} autoComplete="off" placeholder="Código" value={f.codigo} aria-label={`Código del ítem ${idx + 1}`}
                      className="kf-cod font-mono" onChange={e => cambiarCodigo(f.key, e.target.value)} />
                    <TextInput list={dlNombres} autoComplete="off" placeholder="Escriba o elija del inventario…" value={f.nombre} aria-label={`Repuesto del ítem ${idx + 1}`}
                      className="kf-nom" onChange={e => cambiarNombre(f.key, e.target.value)} />
                    <span className="kf-cant">
                      <TextInput type="number" inputMode="decimal" step="0.01" min="0.01" value={f.cantidad} aria-label={`Cantidad del ítem ${idx + 1}`}
                        onChange={e => editarFila(f.key, { cantidad: e.target.value })} />
                      <small>{f.unidad}</small>
                    </span>
                    <span className={`kt-stock ${stockClase} kf-stock`}>
                      {f.vinculo ? (f.vinculo.stock >= req ? `${f.vinculo.stock}` : f.vinculo.stock > 0 ? `${f.vinculo.stock} · bajo` : 'Sin stock') : 'Sin vincular'}
                    </span>
                    <BotonTip tip="Quitar ítem" className="btn btn--plain btn--icono btn-tip btn-tip--rojo" aria-label={`Quitar ítem ${idx + 1}`}
                      onClick={() => setFilas(prev => prev.filter(x => x.key !== f.key))}><Trash2 size={16} /></BotonTip>
                  </div>
                );
              })}
              {filas.length === 0 && (
                <div className="kf-vacio"><PackageSearch size={22} aria-hidden /><span>Todavía no hay repuestos.</span>
                  <Button variant="secondary" size="sm" icon={<ListPlus size={15} />} onClick={nuevoItem}>Agregar el primero</Button></div>
              )}
            </div>
          </section>
        </div>
      )}

      <SeleccionMultiple open={abiertoModelos} onClose={() => setAbiertoModelos(false)} titulo="Modelos"
        opciones={opcionesModelos} seleccionados={modelos} onToggle={alternarModelo} placeholder="Buscar modelo"
        vacio="No hay modelos para esta marca." />
    </Sheet>
  );
}
