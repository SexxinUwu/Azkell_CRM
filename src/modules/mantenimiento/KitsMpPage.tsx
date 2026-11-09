import './mant.css';
import './kits.css';
import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronsDownUp, ChevronsUpDown, Download, FileSpreadsheet, PackageCheck, Plus, SearchX, Upload } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { BotonTip } from '../../core/ui/BotonTip';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { EmptyState, Notice, Page } from '../../core/ui/Display';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { useInventario } from '../almacen/api';
import { descargarPlantillaKits, exportarKitsExcel, importarKitsExcel } from './kitsExcel';
import { KitFormulario } from './KitFormulario';
import { KitsArbol, type NodoMarca, type SeleccionKits } from './KitsArbol';
import { KitTarjeta } from './KitTarjeta';
import { mapearAlmacen, type KitGrupo, type KitItem } from './kitsFormulario';

// ─── Hook ────────────────────────────────────────────────────────────────────

function useKitsMp(marca?: string, modelo?: string) {
  return useQuery<KitItem[]>({
    queryKey: ['mant', 'kits-mp', marca, modelo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (marca)  params.set('marca', marca);
      if (modelo) params.set('modelo', modelo);
      return api<{ data?: KitItem[] }>(`/mantenimiento-kits?${params}`).then(r => r.data ?? []);
    },
    staleTime: 120_000,
  });
}

// ─── Agrupar ítems en kits ────────────────────────────────────────────────────

function agruparKits(items: KitItem[]): KitGrupo[] {
  const mapa = new Map<string, KitGrupo>();
  for (const it of items) {
    const key = `${it.marca_vehiculo}__${it.modelo_vehiculo}__${it.tipo_mp}`;
    if (!mapa.has(key)) {
      mapa.set(key, {
        key,
        marca:      it.marca_vehiculo,
        modelo:     it.modelo_vehiculo,
        tipo_mp:    it.tipo_mp,
        nombre_kit: it.nombre_kit || it.tipo_mp,
        alias:      it.nombre_kit || '',
        items:      [],
        costoTotal: 0,
      });
    }
    const g = mapa.get(key)!;
    g.items.push(it);
    g.costoTotal += Number(it.costo_total) || 0;
  }
  return Array.from(mapa.values());
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function KitsMpPage() {
  const qc    = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, error } = useKitsMp();
  const inv = useInventario();
  const items = data ?? [];
  const inventario = useMemo(() => mapearAlmacen(inv.data ?? []), [inv.data]);

  const [busqueda, setBusqueda]               = useState('');
  const [seleccion, setSeleccion]             = useState<SeleccionKits>({ marca: null, modelo: null });
  const [abiertos, setAbiertos]               = useState<Set<string>>(new Set());
  const [confirmEliminar, setConfirmEliminar] = useState<KitGrupo | null>(null);
  const [eliminando, setEliminando]           = useState(false);
  const [formAbierto, setFormAbierto]         = useState(false);
  const [kitEditando, setKitEditando]         = useState<KitGrupo | null>(null);
  const inputExcel                            = useRef<HTMLInputElement>(null);

  const grupos = useMemo(() => agruparKits(items), [items]);
  const marcasUnicas  = useMemo(() => new Set(grupos.map(g => g.marca)).size, [grupos]);
  const modelosUnicos = useMemo(() => new Set(grupos.map(g => `${g.marca}__${g.modelo}`)).size, [grupos]);

  // La búsqueda recorta la lista lateral y los kits de la derecha
  const gruposBuscados = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    if (!q) return grupos;
    return grupos.filter(g =>
      g.marca.toUpperCase().includes(q) || g.modelo.toUpperCase().includes(q) || g.tipo_mp.toUpperCase().includes(q) || g.nombre_kit.toUpperCase().includes(q) ||
      g.items.some(i => String(i.item_nombre ?? '').toUpperCase().includes(q) || String(i.item_codigo ?? '').toUpperCase().includes(q)));
  }, [grupos, busqueda]);

  // Lista lateral: marcas con sus modelos y cuántos kits tiene cada uno
  const arbol = useMemo<NodoMarca[]>(() => {
    const m = new Map<string, Map<string, number>>();
    for (const g of gruposBuscados) {
      if (!m.has(g.marca)) m.set(g.marca, new Map());
      const mod = m.get(g.marca)!;
      mod.set(g.modelo, (mod.get(g.modelo) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([marca, mods]) => ({
      marca,
      kits: [...mods.values()].reduce((s, n) => s + n, 0),
      modelos: [...mods.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([modelo, kits]) => ({ modelo, kits })),
    }));
  }, [gruposBuscados]);

  // Kits de lo elegido (todos, una marca o un modelo), por modelo
  const visibles = useMemo(
    () => gruposBuscados.filter(g => (!seleccion.marca || g.marca === seleccion.marca) && (!seleccion.modelo || g.modelo === seleccion.modelo)),
    [gruposBuscados, seleccion],
  );
  const porModelo = useMemo(() => {
    const m = new Map<string, KitGrupo[]>();
    for (const g of [...visibles].sort((a, b) => a.marca.localeCompare(b.marca) || a.modelo.localeCompare(b.modelo) || a.tipo_mp.localeCompare(b.tipo_mp))) {
      const k = `${g.marca}__${g.modelo}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(g);
    }
    return [...m.entries()];
  }, [visibles]);
  const totalItems = useMemo(() => visibles.reduce((n, g) => n + g.items.length, 0), [visibles]);
  const costoTotal = useMemo(() => visibles.reduce((n, g) => n + g.costoTotal, 0), [visibles]);

  const titulo = seleccion.modelo ? seleccion.modelo : seleccion.marca ? seleccion.marca : 'Todos los kits';

  async function exportar() {
    if (!totalItems) { toast('No hay datos para exportar.', 'error'); return; }
    const filas = visibles.flatMap(g => g.items.map(it => ({
      'Marca': g.marca, 'Modelo': g.modelo, 'Tipo MP': g.tipo_mp, 'Alias Kit': g.nombre_kit || '',
      'Repuesto / Ítem': it.item_nombre, 'Cantidad': it.cantidad, 'Unidad': it.unidad_medida,
      'Costo Unitario (S/)': it.costo_unitario, 'Costo Total (S/)': it.costo_total, 'Observaciones': '',
    })));
    try { await exportarKitsExcel(filas); } catch (e) { toast(errorMessage(e), 'error'); }
  }

  // Importación directa, como el clásico (kitsImportarExcel): sin vista previa, con sus avisos
  async function subirExcel(archivo: File | undefined) {
    if (!archivo) return;
    try {
      if (await importarKitsExcel(archivo)) qc.invalidateQueries({ queryKey: ['mant', 'kits-mp'] });
    } finally {
      if (inputExcel.current) inputExcel.current.value = '';
    }
  }

  const alternarKit = (key: string) => setAbiertos(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const expandirTodo = () => { haptic('selection'); setAbiertos(new Set(visibles.map(g => g.key))); };
  const contraerTodo = () => { haptic('selection'); setAbiertos(new Set()); };

  async function eliminarGrupo() {
    if (!confirmEliminar) return;
    setEliminando(true);
    try {
      await api('/mantenimiento-kits/eliminarGrupo', {
        method: 'POST',
        body: { marca: confirmEliminar.marca, modelo: confirmEliminar.modelo, tipo_mp: confirmEliminar.tipo_mp, nombre_kit: confirmEliminar.nombre_kit },
      });
      toast('Kit eliminado');
      setConfirmEliminar(null);
      qc.invalidateQueries({ queryKey: ['mant', 'kits-mp'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setEliminando(false);
    }
  }

  return (
    <Page wide>
      <header className="kt-cabecera">
        <div className="kt-cabecera__titulo">
          <span className="t-eyebrow">Mantenimiento</span>
          <h1 className="kt-h1">Kits de mantenimiento</h1>
          <p className="kt-sub">{isLoading ? 'Cargando…' : `${grupos.length} kits · ${marcasUnicas} marcas · ${modelosUnicos} modelos`}</p>
        </div>
        <div className="kt-cabecera__acciones">
          <BotonTip tip="Descargar plantilla Excel" className="btn btn--secondary btn--icon btn-tip btn-tip--verde" onClick={() => { void descargarPlantillaKits(); }}><FileSpreadsheet size={17} /></BotonTip>
          <BotonTip tip="Subir Excel" className="btn btn--secondary btn--icon btn-tip btn-tip--celeste" onClick={() => inputExcel.current?.click()}><Upload size={17} /></BotonTip>
          <BotonTip tip="Exportar Excel" className="btn btn--secondary btn--icon btn-tip btn-tip--violeta" onClick={() => { void exportar(); }}><Download size={17} /></BotonTip>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setKitEditando(null); setFormAbierto(true); }}>Nuevo kit</Button>
        </div>
      </header>

      {isError && <Notice tone="error">{errorMessage(error)}</Notice>}

      {isLoading ? <PageLoader /> : grupos.length === 0 ? (
        <EmptyState icon={<PackageCheck size={22} />} title="Sin kits configurados">Los kits de mantenimiento preventivo aparecerán aquí.</EmptyState>
      ) : (
        <div className="kt-cuerpo">
          <KitsArbol marcas={arbol} total={gruposBuscados.length} seleccion={seleccion} onSeleccion={s => { setSeleccion(s); setAbiertos(new Set()); }} busqueda={busqueda} onBusqueda={setBusqueda} />

          <section className="kt-detalle" aria-label={`Kits de ${titulo}`}>
            <div className="kt-detalle__cab">
              <div className="kt-detalle__tit">
                <nav className="kt-ruta" aria-label="Ubicación">
                  <button type="button" onClick={() => setSeleccion({ marca: null, modelo: null })}>Todos</button>
                  {seleccion.marca && <><span aria-hidden>›</span><button type="button" onClick={() => setSeleccion({ marca: seleccion.marca, modelo: null })}>{seleccion.marca}</button></>}
                  {seleccion.modelo && <><span aria-hidden>›</span><span>{seleccion.modelo}</span></>}
                </nav>
                <h2>{titulo}</h2>
              </div>
              <div className="kt-cifras">
                <span className="kt-cifra"><b className="t-numeric">{visibles.length}</b> kits</span>
                <span className="kt-cifra"><b className="t-numeric">{totalItems}</b> ítems</span>
                <span className="kt-cifra"><b className="t-numeric">{formatSoles(costoTotal)}</b> en total</span>
              </div>
              <span className="kt-detalle__botones">
                <BotonTip tip="Expandir todos" className="btn btn--plain btn--icono btn-tip btn-tip--azul" onClick={expandirTodo}><ChevronsUpDown size={17} /></BotonTip>
                <BotonTip tip="Contraer todos" className="btn btn--plain btn--icono btn-tip btn-tip--azul" onClick={contraerTodo}><ChevronsDownUp size={17} /></BotonTip>
              </span>
            </div>

            {visibles.length === 0 ? (
              <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
                <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setSeleccion({ marca: null, modelo: null }); }}>Quitar filtros</button>
              </EmptyState>
            ) : porModelo.map(([k, kits]) => (
              <div key={k} className="kt-grupo">
                {(!seleccion.modelo) && (
                  <h3 className="kt-grupo__tit">{!seleccion.marca && <span>{kits[0].marca}</span>}{kits[0].modelo}<em>{kits.length} {kits.length === 1 ? 'kit' : 'kits'}</em></h3>
                )}
                {kits.map(g => (
                  <KitTarjeta key={g.key} kit={g} inventario={inventario} abierto={abiertos.has(g.key)} onAlternar={() => alternarKit(g.key)} puedeEditar
                    onEditar={() => { setKitEditando(g); setFormAbierto(true); }} onEliminar={() => setConfirmEliminar(g)} />
                ))}
              </div>
            ))}
          </section>
        </div>
      )}

      <input ref={inputExcel} type="file" accept=".xlsx,.xls" hidden onChange={e => subirExcel(e.target.files?.[0])} />

      <KitFormulario
        kit={kitEditando}
        kitsExistentes={items}
        open={formAbierto}
        onClose={() => setFormAbierto(false)}
        onPedirEliminar={g => { setFormAbierto(false); setConfirmEliminar(g); }}
      />

      <ConfirmSheet
        open={!!confirmEliminar}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={eliminarGrupo}
        title="Eliminar kit"
        message={confirmEliminar
          ? `¿Eliminar el kit "${confirmEliminar.tipo_mp}" para ${confirmEliminar.marca} – ${confirmEliminar.modelo}? Se eliminarán todos sus ${confirmEliminar.items.length} ítems.`
          : ''}
        confirmLabel="Eliminar"
        loading={eliminando}
      />
    </Page>
  );
}
