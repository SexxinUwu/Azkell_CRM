import './mant.css';
import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ChevronDown, ChevronRight, Download, FileSpreadsheet, PackageCheck, SearchX, Trash2, Upload } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { abrirClasico } from '../../core/layout/navigation';
import { descargarPlantillaKits, importarKitsMasivo, leerKitsExcel } from './kitsExcel';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface KitItem {
  id: number | string;
  marca_vehiculo: string;
  modelo_vehiculo: string;
  tipo_mp: string;
  nombre_kit?: string;
  item_codigo?: string;
  item_nombre?: string;
  cantidad: number;
  unidad_medida?: string;
  costo_unitario: number;
  costo_total: number;
  orden?: number;
}

interface KitGrupo {
  key: string;        // marca__modelo__tipo_mp
  marca: string;
  modelo: string;
  tipo_mp: string;
  nombre_kit: string;
  items: KitItem[];
  costoTotal: number;
}

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
  const items = data ?? [];

  const [busqueda, setBusqueda]               = useState('');
  const [abiertos, setAbiertos]               = useState<Set<string>>(new Set());
  const [confirmEliminar, setConfirmEliminar] = useState<KitGrupo | null>(null);
  const [eliminando, setEliminando]           = useState(false);
  const inputExcel                            = useRef<HTMLInputElement>(null);

  // Agrupar todos los kits
  const grupos = useMemo(() => agruparKits(items), [items]);

  // Stats
  const marcasUnicas  = useMemo(() => new Set(grupos.map(g => g.marca)).size, [grupos]);
  const modelosUnicos = useMemo(() => new Set(grupos.map(g => `${g.marca}__${g.modelo}`)).size, [grupos]);

  // Filtrar por búsqueda
  const gruposFiltrados = useMemo(() => {
    if (!busqueda) return grupos;
    const q = busqueda.toUpperCase();
    return grupos.filter(g =>
      g.marca.toUpperCase().includes(q) ||
      g.modelo.toUpperCase().includes(q) ||
      g.tipo_mp.toUpperCase().includes(q) ||
      g.nombre_kit.toUpperCase().includes(q) ||
      g.items.some(i => String(i.item_nombre ?? '').toUpperCase().includes(q) ||
                        String(i.item_codigo ?? '').toUpperCase().includes(q))
    );
  }, [grupos, busqueda]);

  // Ítems visibles (con la búsqueda aplicada), para exportar lo que se ve
  const itemsVisibles = useMemo(() => gruposFiltrados.reduce((n, g) => n + g.items.length, 0), [gruposFiltrados]);

  // Exporta lo que se ve (filtrado), con las mismas columnas del clásico (kitsExportarExcel)
  async function exportar() {
    if (!itemsVisibles) { toast('No hay datos para exportar.', 'error'); return; }
    const filas = gruposFiltrados.flatMap(g => g.items.map(it => [
      g.marca, g.modelo, g.tipo_mp, g.nombre_kit, it.item_nombre ?? '',
      Number(it.cantidad) || 0, it.unidad_medida || 'UND', Number(it.costo_unitario) || 0, Number(it.costo_total) || 0, '',
    ]));
    try {
      await exportarExcel('Kits_Mantenimiento', 'Kits_MP',
        ['Marca', 'Modelo', 'Tipo MP', 'Alias Kit', 'Repuesto / Ítem', 'Cantidad', 'Unidad', 'Costo Unitario (S/)', 'Costo Total (S/)', 'Observaciones'], filas);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  // Importación directa, como el clásico (kitsImportarExcel): sin vista previa
  async function subirExcel(archivo: File | undefined) {
    if (!archivo) return;
    try {
      const items = await leerKitsExcel(archivo);
      try {
        await importarKitsMasivo(items);
        toast(`Se importaron ${items.length} registros exitosamente.`);
        qc.invalidateQueries({ queryKey: ['mant', 'kits-mp'] });
      } catch {
        toast('Error al enviar la importación masiva.', 'error');
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      if (inputExcel.current) inputExcel.current.value = '';
    }
  }

  // Agrupar por marca para la vista
  const porMarca = useMemo(() => {
    const mapa = new Map<string, KitGrupo[]>();
    for (const g of gruposFiltrados) {
      if (!mapa.has(g.marca)) mapa.set(g.marca, []);
      mapa.get(g.marca)!.push(g);
    }
    return mapa;
  }, [gruposFiltrados]);

  function toggleGrupo(key: string) {
    setAbiertos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function eliminarGrupo() {
    if (!confirmEliminar) return;
    setEliminando(true);
    try {
      await api('/mantenimiento-kits/eliminarGrupo', {
        method: 'POST',
        body: {
          marca: confirmEliminar.marca,
          modelo: confirmEliminar.modelo,
          tipo_mp: confirmEliminar.tipo_mp,
          nombre_kit: confirmEliminar.nombre_kit,
        },
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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Kits de mantenimiento"
        subtitle={isLoading ? 'Cargando…' : `${grupos.length} kits · ${marcasUnicas} marcas · ${modelosUnicos} modelos`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="primary" size="sm" icon={<ArrowUpRight size={15} />}
              onClick={() => abrirClasico('mantenimiento/kits-mp')}>
              Crear / Editar kit
            </Button>
            <MenuOtros opciones={[
              { label: '1. Descargar Plantilla', icon: <FileSpreadsheet size={17} />,
                onSelect: () => descargarPlantillaKits().catch(e => toast(errorMessage(e), 'error')) },
              { label: '2. Subir Excel', icon: <Upload size={17} />, onSelect: () => inputExcel.current?.click() },
              { label: 'Exportar Excel', icon: <Download size={17} />, onSelect: exportar },
              { label: 'Abrir versión completa', icon: <ArrowUpRight size={17} />, separado: true,
                onSelect: () => abrirClasico('mantenimiento/kits-mp') },
            ]} />
          </div>
        }
      />

      {isError && <Notice tone="error">{errorMessage(error)}</Notice>}

      <SearchField value={busqueda} onChange={v => { setBusqueda(v); }} placeholder="Marca, modelo, tipo MP o ítem…" />

      {isLoading ? <PageLoader /> : gruposFiltrados.length === 0 ? (
        <EmptyState icon={busqueda ? <SearchX size={22} /> : <PackageCheck size={22} />}
          title={busqueda ? 'Sin coincidencias' : 'Sin kits configurados'}>
          {busqueda
            ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
            : 'Los kits de mantenimiento preventivo aparecerán aquí.'}
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', marginTop: 'var(--s-3)' }}>
          {Array.from(porMarca.entries()).map(([marca, kitsDelModelo]) => (
            <div key={marca}>
              {/* Cabecera de marca */}
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--label-3)', letterSpacing: '0.06em',
                textTransform: 'uppercase', padding: '6px 4px 4px', marginTop: 8 }}>
                {marca}
              </div>

              {/* Kits agrupados por modelo → tipo_mp */}
              {kitsDelModelo.map(g => {
                const abierto = abiertos.has(g.key);
                return (
                  <div key={g.key} style={{
                    background: 'var(--fill-1)', border: '1px solid var(--separator)',
                    borderRadius: 10, overflow: 'hidden', marginBottom: 4,
                  }}>
                    {/* Fila cabecera del kit */}
                    <div
                      onClick={() => toggleGrupo(g.key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', cursor: 'pointer', userSelect: 'none',
                        background: abierto ? 'var(--fill-2)' : undefined,
                      }}
                    >
                      <span style={{ color: 'var(--label-3)', flexShrink: 0 }}>
                        {abierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                          {g.modelo}
                          <span style={{ fontWeight: 500, color: 'var(--label-2)', marginLeft: 6 }}>— {g.tipo_mp}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', marginTop: 1 }}>
                          {g.items.length} ítems · S/ {g.costoTotal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      {/* Badge tipo */}
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                        background: 'var(--accent-tint)', color: 'var(--accent)',
                        border: '1px solid var(--accent)', whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        {g.tipo_mp}
                      </span>
                      {/* Eliminar */}
                      <button type="button" title="Eliminar kit"
                        onClick={e => { e.stopPropagation(); setConfirmEliminar(g); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                          color: 'var(--label-3)', flexShrink: 0, lineHeight: 1 }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--red-ink)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--label-3)')}>
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Detalle de ítems */}
                    {abierto && (
                      <div style={{ borderTop: '1px solid var(--separator)', overflowX: 'auto' }}>
                        <table className="inv-kardex" style={{ minWidth: '32rem' }}>
                          <thead>
                            <tr>
                              <th style={{ width: 24 }}>#</th>
                              <th>Código</th>
                              <th>Ítem / Repuesto</th>
                              <th style={{ textAlign: 'right' }}>Cant.</th>
                              <th>Unidad</th>
                              <th style={{ textAlign: 'right' }}>C. Unit.</th>
                              <th style={{ textAlign: 'right' }}>C. Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.items.map((it, idx) => (
                              <tr key={String(it.id)}>
                                <td style={{ color: 'var(--label-3)', fontSize: '0.8rem' }}>{idx + 1}</td>
                                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent)' }}>
                                  {it.item_codigo || '—'}
                                </td>
                                <td style={{ fontWeight: 500, fontSize: '0.875rem' }}>{it.item_nombre || '—'}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                                  {Number(it.cantidad).toLocaleString('es-PE')}
                                </td>
                                <td style={{ color: 'var(--label-2)', fontSize: '0.8rem' }}>
                                  {it.unidad_medida || 'UND'}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                                  {Number(it.costo_unitario) > 0 ? `S/ ${Number(it.costo_unitario).toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : '—'}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 600 }}>
                                  {Number(it.costo_total) > 0 ? `S/ ${Number(it.costo_total).toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : '—'}
                                </td>
                              </tr>
                            ))}
                            {/* Subtotal */}
                            <tr style={{ background: 'var(--fill-2)' }}>
                              <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.875rem', paddingRight: 12 }}>
                                Total del kit:
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>
                                S/ {g.costoTotal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <input ref={inputExcel} type="file" accept=".xlsx" hidden onChange={e => subirExcel(e.target.files?.[0])} />

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
