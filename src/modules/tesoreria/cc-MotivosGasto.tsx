import './cc-motivos.css';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Plus, SquarePen, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { escribirTesoreria, guardarMotivoGasto, useCentrosCostos, useMotivosGastos, type MotivoGasto } from './api';

// Motivos de gasto: copia de la pestaña «Motivos y Sub Motivos de Gasto» del clásico
// (modulos/tesoreria/centros-costos). Mismos textos, columnas, búsqueda, formulario y validación.
export function CcMotivosGasto({ arriba }: { arriba: ReactNode }) {
  const q = useMotivosGastos();
  const cc = useCentrosCostos();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [buscar, setBuscar] = useState('');
  const [modal, setModal] = useState<{ item: MotivoGasto | null } | null>(null);

  const puedeEscribir = can('tesoreria_centros_costos.crear', 'tesoreria_caja.crear');
  const puedeEliminar = can('tesoreria_centros_costos.eliminar', 'tesoreria_caja.eliminar');
  const lista: MotivoGasto[] = useMemo(() => q.data ?? [], [q.data]);
  const centros = cc.data ?? [];

  // Igual que el clásico: busca en motivo, sub motivo y código de centro
  const visibles = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter(m => [m.motivo, m.sub_motivo, m.centro_costo_codigo].some(v => String(v ?? '').toLowerCase().includes(t)));
  }, [lista, buscar]);

  // Igual que el clásico (eliminarMotivoGastoTab): confirm nativo y alert si falla
  async function eliminar(item: MotivoGasto) {
    if (!window.confirm('¿Está seguro de eliminar este concepto de gasto?')) return;
    try {
      await escribirTesoreria(`/tesoreria/motivos-gastos/${item.id}`, 'DELETE');
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'motivos-gastos'] });
    } catch (err) {
      alert(`Error al eliminar: ${errorMessage(err)}`);
    }
  }

  return (
    <div className="cc-motivos">
      {arriba}
      <div className="cc-table-card">
        <div className="cc-table-toolbar justify-content-between flex-wrap gap-2">
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-indigo-subtle text-indigo border border-indigo-subtle px-2.5 py-1.5 fw-bold">
              {lista.length} Conceptos de Gasto
            </span>
          </div>
          <div className="d-flex align-items-center gap-2">
            <input type="text" className="form-control form-control-sm" placeholder="Buscar motivo, submotivo, CC..."
              value={buscar} onChange={e => setBuscar(e.target.value)} style={{ width: 240, borderRadius: 8 }} />
            {puedeEscribir && (
              <button type="button" className="btn btn-sm cc-btn-nuevo px-3 d-flex align-items-center gap-1 rounded-3 fw-bold"
                onClick={() => setModal({ item: null })}>
                <Plus size={16} /> Nuevo Concepto
              </button>
            )}
          </div>
        </div>

        <div className="cc-scroll-table">
          <table className="cc-table">
            <thead>
              <tr>
                <th className="text-center" style={{ width: 70 }}>ACCIÓN</th>
                <th>MOTIVO PRINCIPAL (CATEGORÍA)</th>
                <th>SUB MOTIVO (CONCEPTO DETALLADO)</th>
                <th>CENTRO DE COSTOS PREDETERMINADO</th>
                <th className="text-center">ESTADO</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? (
                <tr><td colSpan={5} className="text-center py-5 text-muted">Cargando catálogo de motivos...</td></tr>
              ) : q.isError ? (
                <tr><td colSpan={5} className="text-center py-4 text-danger">Error cargando conceptos de gasto.</td></tr>
              ) : visibles.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-5 text-muted">No se encontraron conceptos de gasto.</td></tr>
              ) : visibles.map(item => {
                const activo = String(item.estado).toUpperCase() === 'ACTIVO';
                return (
                  <tr key={String(item.id)}>
                    <td className="text-center">
                      <div className="d-inline-flex align-items-center gap-1.5">
                        {puedeEscribir && (
                          <button type="button" className="btn-action-pastel btn-edit" title="Editar Concepto"
                            onClick={() => setModal({ item })}>
                            <SquarePen size={15} />
                          </button>
                        )}
                        {puedeEliminar && (
                          <button type="button" className="btn-action-pastel btn-delete" title="Eliminar Concepto"
                            onClick={() => eliminar(item)}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="cc-celda-motivo">{item.motivo}</td>
                    <td className="cc-celda-sub">{item.sub_motivo}</td>
                    <td>
                      {item.centro_costo_codigo
                        ? <span className="badge font-monospace cc-badge-cc">{item.centro_costo_codigo}</span>
                        : <span className="cc-celda-vacia">—</span>}
                    </td>
                    <td className="text-center">
                      <span className={`badge ${activo ? 'cc-badge-activo' : 'cc-badge-inactivo'}`}>{activo ? 'ACTIVO' : 'INACTIVO'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <CcMotivoModal key={modal.item?.id ?? 'nuevo'} item={modal.item} lista={lista}
          centros={centros} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function CcMotivoModal({ item, lista, centros, onClose }: {
  item: MotivoGasto | null;
  lista: MotivoGasto[];
  centros: Array<{ codigo: string; nombre: string; estado: string }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [motivo, setMotivo] = useState(item?.motivo ?? '');
  const [sub, setSub] = useState(item?.sub_motivo ?? '');
  const [centro, setCentro] = useState(item?.centro_costo_codigo ?? '');
  const [estado, setEstado] = useState(item?.estado || 'ACTIVO');
  const [enviando, setEnviando] = useState(false);

  // Igual que el clásico: los principales ya existentes sugeridos; los centros inactivos no se ofrecen
  const principales = useMemo(() => Array.from(new Set(lista.map(m => m.motivo))), [lista]);
  const opcionesCentro = centros.filter(c => c.estado !== 'INACTIVO');
  const centroValor = opcionesCentro.some(c => c.codigo === centro) ? centro : '';

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const mot = motivo.trim();
    const s = sub.trim();
    if (!mot || !s) { alert('Motivo Principal y Sub Motivo son obligatorios.'); return; }

    setEnviando(true);
    try {
      await guardarMotivoGasto(item?.id ?? null, { motivo: mot, sub_motivo: s, centro_costo_codigo: centroValor, estado });
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'motivos-gastos'] });
      toast('El concepto de gasto fue guardado correctamente.');
      onClose();
    } catch (err) {
      alert(`Error: ${errorMessage(err)}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Sheet open onClose={() => !enviando && onClose()}
      title={item ? `Editar Concepto: ${item.sub_motivo}` : 'Nuevo Concepto de Gasto'}
      footer={
        <div className="cc-motivo-modal d-flex justify-content-between">
          <button type="button" className="btn btn-light rounded-3 px-3 fw-semibold" onClick={onClose} disabled={enviando}>Cancelar</button>
          <button type="submit" form="formMotivoGasto" id="motivo-modal-btn-submit" className="btn cc-btn-nuevo px-4 fw-bold" disabled={enviando}>
            {enviando ? 'Guardando...' : <><Check size={16} /> Guardar Concepto</>}
          </button>
        </div>
      }>
      <div className="cc-motivo-modal">
        <small className="text-secondary" style={{ fontSize: '0.75rem' }}>Configuración de Motivo, Submotivo y Centro de Costos</small>
        <form id="formMotivoGasto" onSubmit={guardar} style={{ marginTop: '0.75rem' }}>
          <div className="card border-0 rounded-3 p-3 shadow-sm bg-white">
            <div className="row g-3">
              <div className="col-12">
                <label className="form-label small fw-bold text-dark text-uppercase" htmlFor="motivo-modal-motivo">Motivo Principal (Categoría) (*)</label>
                <input id="motivo-modal-motivo" type="text" className="form-control fw-bold" placeholder="EJ: Servicios Operativos"
                  list="cc-dl-motivos-principales" required value={motivo} onChange={e => setMotivo(e.target.value)} />
                <datalist id="cc-dl-motivos-principales">
                  {principales.map(m => <option key={m} value={m} />)}
                </datalist>
                <small className="text-muted" style={{ fontSize: '0.7rem' }}>Puede ingresar uno nuevo o seleccionar uno ya existente</small>
              </div>
              <div className="col-12">
                <label className="form-label small fw-bold text-dark text-uppercase" htmlFor="motivo-modal-submotivo">Sub Motivo (Concepto Detallado) (*)</label>
                <input id="motivo-modal-submotivo" type="text" className="form-control" placeholder="EJ: Servicio de grúa pesada"
                  required value={sub} onChange={e => setSub(e.target.value)} />
              </div>
              <div className="col-12">
                <label className="form-label small fw-bold text-indigo text-uppercase" htmlFor="motivo-modal-centro-costo">Centro de Costos Predeterminado (Sugerido)</label>
                <select id="motivo-modal-centro-costo" className="form-select fw-semibold" value={centroValor} onChange={e => setCentro(e.target.value)}>
                  <option value="">-- Sin sugerencia automática --</option>
                  {opcionesCentro.map(c => <option key={c.codigo} value={c.codigo}>{`${c.codigo} - ${c.nombre}`}</option>)}
                </select>
                <small className="text-muted" style={{ fontSize: '0.7rem' }}>Al elegir este motivo en Caja, se autoseleccionará este centro de costos</small>
              </div>
              <div className="col-12">
                <label className="form-label small fw-bold text-dark text-uppercase" htmlFor="motivo-modal-estado">Estado</label>
                <select id="motivo-modal-estado" className="form-select fw-semibold" value={estado} onChange={e => setEstado(e.target.value)}>
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="INACTIVO">INACTIVO</option>
                </select>
              </div>
            </div>
          </div>
        </form>
      </div>
    </Sheet>
  );
}
