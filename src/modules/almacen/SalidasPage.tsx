import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, PackageMinus, Plus, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { eliminarSalida, useSalidas, type SalidaInv } from './api';
import { SalidaFormulario } from './SalidaFormulario';

export function SalidasPage() {
  const { data, isLoading, isError, error } = useSalidas();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const reduce = useReducedMotion();

  const [busqueda, setBusqueda] = useState('');
  const [seleccionada, setSeleccionada] = useState<SalidaInv | null>(null);
  const [formulario, setFormulario] = useState<{ salida: SalidaInv | null } | null>(null);
  const [porEliminar, setPorEliminar] = useState<SalidaInv | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const puedeCrear = can('sal_inv.crear');
  const puedeEditar = can('sal_inv.editar');
  const puedeEliminar = can('sal_inv.eliminar');

  const salidas = data ?? [];

  const visibles = useMemo(() => salidas.filter(s => {
    const q = busqueda.toUpperCase();
    if (!q) return true;
    return (
      String(s.id).includes(q) ||
      (s.placa ?? '').toUpperCase().includes(q) ||
      (s.tipo_destino ?? '').toUpperCase().includes(q) ||
      (s.responsable ?? '').toUpperCase().includes(q) ||
      (s.nro_documento ?? '').toUpperCase().includes(q) ||
      (s.ticket_ot ?? '').toUpperCase().includes(q)
    );
  }), [salidas, busqueda]);

  const resumen = useMemo(() => ({
    total: salidas.length,
    monto: salidas.reduce((s, e) => s + (e.total_pen || 0), 0),
  }), [salidas]);

  async function confirmarEliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await eliminarSalida(porEliminar.id);
      toast('Salida eliminada');
      haptic('success');
      if (seleccionada?.id === porEliminar.id) setSeleccionada(null);
      setPorEliminar(null);
      await qc.invalidateQueries({ queryKey: ['almacen', 'salidas'] });
      await qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setEliminando(false);
    }
  }

  const soloDetalle = !!seleccionada;

  return (
    <Page>
      {!soloDetalle && (
        <PageHeader
          eyebrow="Almacén"
          title="Salidas"
          subtitle={isLoading ? 'Cargando…' : `${resumen.total} salidas registradas`}
          actions={
            <>
              <MenuOtros opciones={[
                { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('almacen/salidas') },
              ]} />
              {puedeCrear && (
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ salida: null })}>
                  Nueva salida
                </Button>
              )}
            </>
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : soloDetalle ? (
        <SalidaDetalle
          salida={seleccionada}
          onVolver={() => setSeleccionada(null)}
          onEditar={puedeEditar ? () => setFormulario({ salida: seleccionada }) : undefined}
          onEliminar={puedeEliminar ? () => setPorEliminar(seleccionada) : undefined}
        />
      ) : salidas.length === 0 ? (
        <EmptyState icon={<PackageMinus size={22} />} title="Sin salidas registradas">
          {puedeCrear ? <>Registra la primera salida con <strong>Nueva salida</strong>.</> : 'Cuando se registren salidas, aparecerán aquí.'}
        </EmptyState>
      ) : (
        <div>
          <div className="inv-metricas" style={{ marginBottom: 'var(--s-4)' }}>
            <div className="inv-metrica">
              <span className="inv-metrica__num">{resumen.total}</span>
              <span className="inv-metrica__label">Total</span>
            </div>
            <div className="inv-metrica" style={{ gridColumn: 'span 2' }}>
              <span className="inv-metrica__num" style={{ fontSize: '1.25rem' }}>
                S/ {new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 }).format(resumen.monto)}
              </span>
              <span className="inv-metrica__label">Monto total</span>
            </div>
          </div>

          <div style={{ marginBottom: 'var(--s-4)' }}>
            <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, destino, OT o responsable" />
          </div>

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Ninguna salida coincide">
              <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              <AnimatePresence initial={false}>
                {visibles.map(s => (
                  <motion.div key={s.id} layout={!reduce} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring}>
                    <button type="button" className="mov-fila" onClick={() => { haptic('selection'); setSeleccionada(s); }}>
                      <div className="mov-fila__icon" style={{ background: 'var(--red-tint)', color: 'var(--red-ink)' }}>
                        <PackageMinus size={16} />
                      </div>
                      <div className="mov-fila__cuerpo">
                        <span className="mov-fila__titulo">
                          {s.placa ? `Placa: ${s.placa}` : (s.tipo_destino || 'Salida #' + s.id)}
                          {s.ticket_ot ? ` · OT: ${s.ticket_ot}` : ''}
                        </span>
                        <span className="mov-fila__sub">
                          {s.fecha?.split('T')[0] ?? '—'}
                          {s.responsable || s.creado_por ? ` · ${s.responsable || s.creado_por}` : ''}
                          {s.almacen ? ` · ${s.almacen}` : ''}
                          {` · ${s.items?.length ?? 0} ítem${(s.items?.length ?? 0) !== 1 ? 's' : ''}`}
                        </span>
                      </div>
                      <div className="mov-fila__derecha">
                        <span className="mov-fila__monto">S/ {(s.total_pen ?? 0).toFixed(2)}</span>
                      </div>
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      <SalidaFormulario
        open={!!formulario}
        salida={formulario?.salida ?? null}
        onClose={() => setFormulario(null)}
        onGuardado={() => {
          setFormulario(null);
          qc.invalidateQueries({ queryKey: ['almacen', 'salidas'] });
          qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] });
        }}
      />

      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !eliminando && setPorEliminar(null)}
        onConfirm={confirmarEliminar}
        loading={eliminando}
        title={`¿Eliminar salida #${porEliminar?.id}?`}
        message="Se eliminará la salida y se revertirán los movimientos de stock."
        confirmLabel="Eliminar"
      />
    </Page>
  );
}

// ─── Detalle de una salida ────────────────────────────────────────────────────

interface DetalleProps {
  salida: SalidaInv;
  onVolver: () => void;
  onEditar?: () => void;
  onEliminar?: () => void;
}

function SalidaDetalle({ salida: s, onVolver, onEditar, onEliminar }: DetalleProps) {
  const total = s.items?.reduce((acc, i) => acc + (i.importe || 0), 0) ?? s.total_pen;

  return (
    <div className="inv-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Salidas
        </button>
        <div className="tarjeta__barra-acciones">
          <MenuOtros opciones={[
            onEditar && { label: 'Editar', onSelect: onEditar },
            onEliminar && { label: 'Eliminar', destructiva: true, separado: true, onSelect: onEliminar },
          ]} />
        </div>
      </div>

      <div className="inv-ficha__hero" style={{ paddingTop: 'var(--s-2)' }}>
        <div className="inv-ficha__imagen-vacia"><PackageMinus size={28} /></div>
        <span className="inv-ficha__id">Salida #{s.id}</span>
        <h2 className="inv-ficha__nombre">{s.placa ? `Placa ${s.placa}` : (s.tipo_destino || 'Sin destino')}</h2>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Datos de la salida</p>
        <div className="tarjeta__lista">
          {s.fecha && <div className="dato"><span className="dato__label">Fecha</span><span className="dato__valor">{s.fecha.split('T')[0]}</span></div>}
          {s.tipo_destino && <div className="dato"><span className="dato__label">Destino</span><span className="dato__valor">{s.tipo_destino}</span></div>}
          {s.placa && <div className="dato"><span className="dato__label">Placa</span><span className="dato__valor dato__valor--mono">{s.placa}</span></div>}
          {s.ticket_ot && <div className="dato"><span className="dato__label">OT</span><span className="dato__valor dato__valor--mono">{s.ticket_ot}</span></div>}
          {s.nro_documento && <div className="dato"><span className="dato__label">N° documento</span><span className="dato__valor dato__valor--mono">{s.nro_documento}</span></div>}
          {s.almacen && <div className="dato"><span className="dato__label">Almacén</span><span className="dato__valor">{s.almacen}</span></div>}
          {(s.responsable || s.creado_por) && <div className="dato"><span className="dato__label">Responsable</span><span className="dato__valor">{s.responsable || s.creado_por}</span></div>}
          {s.observaciones && <div className="dato"><span className="dato__label">Observaciones</span><span className="dato__valor">{s.observaciones}</span></div>}
        </div>
      </div>

      {s.items && s.items.length > 0 && (
        <div>
          <p className="tarjeta__grupo-titulo">Artículos ({s.items.length})</p>
          <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
            <table className="inv-kardex">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th style={{ textAlign: 'right' }}>Cant.</th>
                  <th style={{ textAlign: 'right' }}>P.U.</th>
                  <th style={{ textAlign: 'right' }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((it, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, fontSize: '0.875rem' }}>{it.descripcion || it.inventario_id || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{it.cantidad}</td>
                    <td style={{ textAlign: 'right', color: 'var(--label-2)' }}>S/ {(it.costo_unitario ?? 0).toFixed(2)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>S/ {(it.importe ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, padding: 'var(--s-2) var(--s-3)' }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '1rem', padding: 'var(--s-2) var(--s-3)' }}>S/ {total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
