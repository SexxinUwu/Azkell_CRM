import './flota.css';
import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, FileText, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { docEstadoColor, docEstadoLabel, useDocumentosFlota, type DocumentoFlota } from './api';

const TODOS = 'Todos';
const FILTROS = [TODOS, 'Vigente', 'Por vencer', 'Vencido'] as const;

export function DocumentosPage() {
  const { data, isLoading, isError, error } = useDocumentosFlota();
  const [filtro, setFiltro] = useState(TODOS);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<DocumentoFlota | null>(null);

  const docs = data ?? [];

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
        (d.numero ?? '').toUpperCase().includes(q)
      );
    }
    return lista;
  }, [docs, filtro, busqueda]);

  if (seleccionado) {
    return (
      <Page push>
        <DocumentoDetalle doc={seleccionado} onVolver={() => setSeleccionado(null)} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Documentos"
        subtitle={isLoading ? 'Cargando…' : `${docs.length} documentos`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('flota/documentos') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
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

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, tipo de documento, número…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <FileText size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin documentos'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Los documentos de flota aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              <AnimatePresence mode="popLayout">
                {visibles.map((d) => {
                  const color = docEstadoColor(d);
                  const label = docEstadoLabel(d);
                  return (
                    <motion.button key={String(d.id)} type="button"
                      className="doc-fila"
                      onClick={() => { haptic('selection'); setSeleccionado(d); }}
                      layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <span className="doc-fila__indicador" style={{ background: `var(--${color}-ink)` }} />
                      <span className="doc-fila__placa">{d.placa}</span>
                      <span className="doc-fila__tipo">{d.tipo_documento}</span>
                      {d.numero && <span className="doc-fila__numero">{d.numero}</span>}
                      <span className={`ot-estado ot-estado--${color}`}>{label}</span>
                      {d.fecha_vencimiento && (
                        <span className="doc-fila__venc" style={{ color: color === 'red' ? 'var(--red-ink)' : color === 'amber' ? 'var(--amber-ink)' : 'var(--label-2)' }}>
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
    </Page>
  );
}

function DocumentoDetalle({ doc, onVolver }: { doc: DocumentoFlota; onVolver: () => void }) {
  const color = docEstadoColor(doc);
  const label = docEstadoLabel(doc);
  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Documentos
        </button>
      </div>
      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${color}`}>{label}</span>
        <h2 className="ot-ficha__placa">{doc.placa}</h2>
        <span className="ot-ficha__id">{doc.tipo_documento}</span>
      </div>
      <div>
        <p className="tarjeta__grupo-titulo">Documento</p>
        <div className="tarjeta__lista">
          {doc.numero && <div className="dato"><span className="dato__label">Número</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)' }}>{doc.numero}</span></div>}
          {doc.fecha_emision && <div className="dato"><span className="dato__label">Emisión</span><span className="dato__valor">{String(doc.fecha_emision).split('T')[0]}</span></div>}
          {doc.fecha_vencimiento && <div className="dato"><span className="dato__label">Vencimiento</span><span className="dato__valor" style={{ color: color === 'red' ? 'var(--red-ink)' : color === 'amber' ? 'var(--amber-ink)' : undefined, fontWeight: color !== 'green' ? 600 : undefined }}>{String(doc.fecha_vencimiento).split('T')[0]}</span></div>}
          {doc.observaciones && <div className="dato"><span className="dato__label">Observaciones</span><span className="dato__valor">{doc.observaciones}</span></div>}
        </div>
      </div>
      {doc.archivo_url && (
        <div style={{ paddingTop: 'var(--s-3)' }}>
          <a href={String(doc.archivo_url)} target="_blank" rel="noopener noreferrer"
            className="btn btn--secondary btn--sm">
            Ver archivo
          </a>
        </div>
      )}
    </div>
  );
}
