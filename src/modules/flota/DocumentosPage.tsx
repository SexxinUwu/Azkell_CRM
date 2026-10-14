import './flota.css';
import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, FileSpreadsheet, FileText, Plus, RefreshCw, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { docEstadoColor, docEstadoLabel, expandirDocumentos, urlTemporalDocumento, useVehiculosFlota, type DocumentoFlota } from './api';
import { DocumentoFormulario } from './DocumentoFormulario';

const TODOS = 'Todos';
const FILTROS = [TODOS, 'Vigente', 'Por vencer', 'Vencido'] as const;

export function DocumentosPage() {
  const { data, isLoading, isError, error } = useVehiculosFlota();
  const [filtro, setFiltro] = useState(TODOS);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<DocumentoFlota | null>(null);
  const [formulario, setFormulario] = useState<{ placa: string | null; prefijo: string | null } | null>(null);
  const { can, user } = useAuth();
  const toast = useToast();
  const puedeEditar = can('docs_flota.crear', 'docs_flota.editar');

  const docs = useMemo(() => expandirDocumentos(data ?? []), [data]);

  const conteos = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of docs) {
      const label = docEstadoLabel(d);
      m[label] = (m[label] ?? 0) + 1;
    }
    return m;
  }, [docs]);

  const visibles = useMemo(() => {
    let lista = docs;
    if (filtro !== TODOS) lista = lista.filter(d => docEstadoLabel(d) === filtro);
    if (busqueda) {
      const q = busqueda.toUpperCase();
      lista = lista.filter(d =>
        d.placa.toUpperCase().includes(q) ||
        d.tipo_documento.toUpperCase().includes(q) ||
        (d.entidad ?? '').toUpperCase().includes(q)
      );
    }
    return lista;
  }, [docs, filtro, busqueda]);

  if (seleccionado) {
    const prefijo = seleccionado.id.slice(seleccionado.placa.length + 1).replace('_vencimiento', '');
    return (
      <Page push>
        <DocumentoDetalle
          doc={seleccionado}
          onVolver={() => setSeleccionado(null)}
          onRenovar={puedeEditar ? () => setFormulario({ placa: seleccionado.placa, prefijo }) : undefined}
        />
        <DocumentoFormulario open={!!formulario} placa={formulario?.placa ?? null} prefijo={formulario?.prefijo ?? null}
          usuario={user?.name ?? ''} onClose={() => { setFormulario(null); setSeleccionado(null); }} />
      </Page>
    );
  }

  async function exportar() {
    try {
      await exportarExcel('Documentos-flota', 'Documentos',
        ['Placa', 'Documento', 'Estado', 'Vencimiento', 'Entidad'],
        visibles.map(d => [d.placa, d.tipo_documento, docEstadoLabel(d), String(d.fecha_vencimiento ?? '').split('T')[0], d.entidad]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const vencidosCount = conteos['Vencido'] ?? 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Documentos"
        subtitle={isLoading ? 'Cargando…' : `${docs.length} documentos`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} documentos`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'Importar vehículos y alta de unidades', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('flota/documentos') },
            ]} />
            {puedeEditar && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormulario({ placa: null, prefijo: null })}>Cargar</Button>}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {vencidosCount > 0 && (
            <Notice tone="error">
              {vencidosCount} documento{vencidosCount > 1 ? 's' : ''} vencido{vencidosCount > 1 ? 's' : ''} — revisar con urgencia.
            </Notice>
          )}

          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            {FILTROS.map(f => {
              const cnt = f === TODOS ? docs.length : (conteos[f] ?? 0);
              return (
                <button key={f} type="button"
                  className={`chip${filtro === f ? ' chip--active' : ''}`}
                  onClick={() => { setFiltro(f); haptic('selection'); }}>
                  {f} {cnt > 0 && <span className="chip__badge">{cnt}</span>}
                </button>
              );
            })}
          </div>

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, tipo de documento, entidad…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <FileText size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin documentos'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'No hay documentos registrados para los filtros actuales.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              <AnimatePresence mode="popLayout">
                {visibles.map((d) => {
                  const color = docEstadoColor(d);
                  const label = docEstadoLabel(d);
                  return (
                    <motion.button key={d.id} type="button"
                      className="doc-fila"
                      onClick={() => { haptic('selection'); setSeleccionado(d); }}
                      layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <span className="doc-fila__indicador" style={{ background: `var(--${color}-ink)` }} />
                      <span className="doc-fila__placa">{d.placa}</span>
                      <span className="doc-fila__tipo">{d.tipo_documento}</span>
                      {d.entidad && <span className="doc-fila__numero">{d.entidad}</span>}
                      <span className={`ot-estado ot-estado--${color}`}>{label}</span>
                      {d.fecha_vencimiento && (
                        <span className="doc-fila__venc" style={{
                          color: color === 'red' ? 'var(--red-ink)' : color === 'amber' ? 'var(--amber-ink)' : 'var(--label-2)',
                          fontWeight: color !== 'green' ? 600 : undefined,
                        }}>
                          {String(d.fecha_vencimiento).split('T')[0]}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      <DocumentoFormulario open={!!formulario} placa={formulario?.placa ?? null} prefijo={formulario?.prefijo ?? null}
        usuario={user?.name ?? ''} onClose={() => setFormulario(null)} />
    </Page>
  );
}

function DocumentoDetalle({ doc, onVolver, onRenovar }: { doc: DocumentoFlota; onVolver: () => void; onRenovar?: () => void }) {
  const toast = useToast();
  const [abriendo, setAbriendo] = useState(false);
  async function verArchivo() {
    if (!doc.archivo_url) return;
    setAbriendo(true);
    try { window.open(await urlTemporalDocumento(String(doc.archivo_url)), '_blank', 'noopener,noreferrer'); }
    catch (err) { toast(errorMessage(err), 'error'); }
    finally { setAbriendo(false); }
  }
  const color = docEstadoColor(doc);
  const label = docEstadoLabel(doc);
  const diasRestantes = doc.fecha_vencimiento ? (() => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const venc = new Date(String(doc.fecha_vencimiento).split('T')[0] + 'T00:00:00');
    return Math.round((venc.getTime() - hoy.getTime()) / 86_400_000);
  })() : null;

  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Documentos
        </button>
        {onRenovar && (
          <div className="tarjeta__barra-acciones">
            <Button variant="primary" icon={<RefreshCw size={16} />} onClick={onRenovar}>Renovar</Button>
          </div>
        )}
      </div>
      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${color}`}>{label}</span>
        <h2 className="ot-ficha__placa">{doc.placa}</h2>
        <span className="ot-ficha__id">{doc.tipo_documento}</span>
      </div>
      <div>
        <p className="tarjeta__grupo-titulo">Documento</p>
        <div className="tarjeta__lista">
          {doc.entidad && <div className="dato"><span className="dato__label">Entidad</span><span className="dato__valor">{doc.entidad}</span></div>}
          {doc.fecha_vencimiento && (
            <div className="dato">
              <span className="dato__label">Vencimiento</span>
              <span className="dato__valor" style={{
                color: color === 'red' ? 'var(--red-ink)' : color === 'amber' ? 'var(--amber-ink)' : undefined,
                fontWeight: color !== 'green' ? 700 : undefined,
              }}>
                {String(doc.fecha_vencimiento).split('T')[0]}
                {diasRestantes !== null && (
                  <span style={{ marginLeft: 6, fontSize: '0.8125rem', opacity: 0.8 }}>
                    ({diasRestantes < 0 ? `vencido hace ${Math.abs(diasRestantes)}d` : `${diasRestantes} días`})
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
      {doc.archivo_url && (
        <div style={{ paddingTop: 'var(--s-3)' }}>
          <Button variant="secondary" onClick={verArchivo} loading={abriendo}>Ver archivo</Button>
        </div>
      )}
    </div>
  );
}
