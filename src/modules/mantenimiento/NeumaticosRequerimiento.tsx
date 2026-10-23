import { useMemo, useState } from 'react';
import { ClipboardCopy, Disc3, ShoppingCart } from 'lucide-react';

/** Logos de archivo: PDF en rojo y Excel en verde (sin texto alrededor) */
const LogoArchivo = ({ tipo }: { tipo: 'pdf' | 'excel' }) => (
  <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill={tipo === 'pdf' ? '#dc2626' : '#15803d'} />
    <path d="M14 2v5h5" fill={tipo === 'pdf' ? '#fca5a5' : '#86efac'} />
    <text x="12" y="16.5" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">{tipo === 'pdf' ? 'PDF' : 'XLS'}</text>
  </svg>
);
import { VehiculosTarjetas } from './NeumaticosVehiculos';
import { Button } from '../../core/ui/Button';
import { EmptyState } from '../../core/ui/Display';
import { TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import {
  abrirResumenPdf, consolidarPorMedida, exportarResumenExcel, guardarUmbral, MM_REQ_MAX, MM_REQ_MIN,
  normalizarUmbral, remanenteLlanta, textoPedido, textoUmbral, totalesResumen, type LlantaUltima,
} from './neumaticosReposicion';

const TH: Record<string, [string, string]> = {
  del: ['#e0f2fe', '#0284c7'], trac: ['#fef3c7', '#b45309'], arr: ['#dcfce7', '#15803d'], rep: ['#f3e8ff', '#6b21a8'], total: ['#ffe4e6', '#be123c'],
};
const celdaTh = (k: string): React.CSSProperties => ({ background: TH[k][0], color: TH[k][1], textAlign: 'center', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.72rem', padding: '10px 12px' });

/** Control del remanente de requerimiento. Edita en texto y confirma al salir o con Enter; solo acepta 1 a 10 mm (pasos de 0.5). */
export function UmbralMm({ valor, onChange }: { valor: number; onChange: (n: number) => void }) {
  const [borrador, setBorrador] = useState<string | null>(null);
  const confirmar = () => {
    if (borrador === null) return;
    const n = normalizarUmbral(borrador);
    if (n !== null) { guardarUmbral(n); onChange(n); }
    setBorrador(null);
  };
  const invalido = borrador !== null && normalizarUmbral(borrador) === null;
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--label-2)' }}>
      Remanente ≤
      <TextInput type="number" inputMode="decimal" min={MM_REQ_MIN} max={MM_REQ_MAX} step={0.5}
        aria-label="Remanente de requerimiento en milímetros" aria-invalid={invalido}
        style={{ width: 84, minHeight: 44, textAlign: 'center', borderColor: invalido ? 'var(--red-ink)' : undefined }}
        value={borrador ?? String(valor)}
        onChange={e => setBorrador(e.target.value)} onBlur={confirmar}
        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }} />
      mm
    </label>
  );
}

export function RequerimientoNeumaticos({ llantas, umbral, onUmbral, hayBusqueda, medidaSel, onMedida, onInspeccionar }: {
  /** Llantas de la última inspección que ya pasaron el umbral y los filtros */
  llantas: LlantaUltima[]; umbral: number; onUmbral: (n: number) => void; hayBusqueda: boolean;
  /** Medida elegida en el cuadro resumen (filtra la lista de vehículos, como el clásico) */
  medidaSel: string | null; onMedida: (m: string | null) => void;
  onInspeccionar: (placa: string) => void;
}) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState<'excel' | 'pdf' | null>(null);
  const filas = useMemo(() => consolidarPorMedida(llantas).sort((a, b) => b.total - a.total || a.medida.localeCompare(b.medida)), [llantas]);
  const tot = totalesResumen(filas);

  // Lista de vehículos: ordenada por menor remanente y, si hay medida elegida en el resumen, solo esa medida
  const visibles = useMemo(() => llantas
    .filter(l => !medidaSel || (l.medida || 'SIN ESPECIFICAR').toUpperCase().trim() === medidaSel)
    .sort((a, b) => (remanenteLlanta(a) ?? 0) - (remanenteLlanta(b) ?? 0)), [llantas, medidaSel]);

  const copiar = async () => {
    if (!filas.length) { toast('No hay requerimientos activos para copiar', 'error'); return; }
    try { await navigator.clipboard.writeText(textoPedido(filas, umbral)); toast('Resumen de compra copiado al portapapeles'); }
    catch { toast('No se pudo copiar al portapapeles', 'error'); }
  };
  const correr = async (tipo: 'excel' | 'pdf', fn: () => Promise<void>) => {
    if (!filas.length) { toast('No hay requerimientos para exportar', 'error'); return; }
    setOcupado(tipo);
    try { await fn(); } catch (e) { toast(errorMessage(e), 'error'); } finally { setOcupado(null); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <section style={{ background: 'var(--surface, #fff)', border: '1px solid var(--separator)', borderRadius: 'var(--r-lg, 16px)', padding: 'var(--s-4)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-3)', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s-3)' }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingCart size={18} color="var(--accent, #ff9500)" /> Resumen consolidado para compras / reposición
            </h2>
            <div style={{ fontSize: '0.78rem', color: 'var(--label-2)' }}>Total a reposición por medida ({tot.total} llanta{tot.total === 1 ? '' : 's'} con remanente {textoUmbral(umbral)})</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <UmbralMm valor={umbral} onChange={onUmbral} />
            <Button variant="secondary" icon={<ClipboardCopy size={15} />} onClick={copiar} style={{ minHeight: 44 }}>Copiar pedido</Button>
            <Button variant="secondary" iconOnly icon={<LogoArchivo tipo="excel" />} loading={ocupado === 'excel'} disabled={!!ocupado}
              aria-label="Exportar a Excel" title="Exportar a Excel" style={{ minHeight: 44, minWidth: 44 }}
              onClick={() => correr('excel', () => exportarResumenExcel(filas, umbral))} />
            <Button variant="secondary" iconOnly icon={<LogoArchivo tipo="pdf" />} loading={ocupado === 'pdf'} disabled={!!ocupado}
              aria-label="Abrir PDF" title="Abrir PDF" style={{ minHeight: 44, minWidth: 44 }}
              onClick={() => correr('pdf', () => abrirResumenPdf(filas, umbral))} />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="inv-kardex" style={{ minWidth: '40rem' }}>
            <thead>
              <tr>
                <th style={{ background: '#1e293b', color: '#fff', padding: '10px 12px' }}>MEDIDA LLANTA</th>
                <th style={celdaTh('del')}>Delanteras</th><th style={celdaTh('trac')}>Tracción</th><th style={celdaTh('arr')}>Arrastre</th>
                <th style={celdaTh('rep')}>Repuestos</th><th style={celdaTh('total')}>Total reposición</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--label-2)', padding: 16 }}>No hay llantas con remanente {textoUmbral(umbral)}{hayBusqueda ? ' para la búsqueda' : ''}.</td></tr>
              ) : filas.map(f => (
                <tr key={f.medida} onClick={() => onMedida(medidaSel === f.medida ? null : f.medida)} title={`Clic para filtrar por la medida ${f.medida}`}
                  style={{ textAlign: 'center', fontWeight: 700, cursor: 'pointer', background: medidaSel === f.medida ? 'var(--accent-tint)' : undefined }}>
                  <td style={{ textAlign: 'left', fontFamily: 'var(--mono, monospace)' }}>{f.medida}{medidaSel === f.medida && <span className="badge badge--accent" style={{ marginLeft: 8 }}>Filtrando</span>}</td>
                  <td style={{ color: f.del ? '#0284c7' : 'var(--label-3)' }}>{f.del}</td>
                  <td style={{ color: f.trac ? undefined : 'var(--label-3)' }}>{f.trac}</td>
                  <td style={{ color: f.arr ? undefined : 'var(--label-3)' }}>{f.arr}</td>
                  <td style={{ color: f.rep ? undefined : 'var(--label-3)' }}>{f.rep}</td>
                  <td style={{ color: '#dc2626', fontSize: '1rem' }}>{f.total}</td>
                </tr>
              ))}
              {filas.length > 0 && (
                <tr style={{ textAlign: 'center', fontWeight: 800, color: '#fff', cursor: 'pointer' }} onClick={() => onMedida(null)}>
                  <td style={{ textAlign: 'left', background: '#1e293b' }}>TOTAL GENERAL A COMPRAR</td>
                  <td style={{ background: '#1e293b' }}>{tot.del}</td><td style={{ background: '#1e293b' }}>{tot.trac}</td>
                  <td style={{ background: '#1e293b' }}>{tot.arr}</td><td style={{ background: '#1e293b' }}>{tot.rep}</td>
                  <td style={{ background: '#ff3b30', fontSize: '1.05rem' }}>{tot.total}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {medidaSel && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--s-3)', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-ink)' }}>
            <span>Filtrando tabla por Medida: {medidaSel}</span>
            <button type="button" onClick={() => onMedida(null)} style={{ background: 'none', border: 0, color: 'var(--red-ink)', fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>Mostrar todas ✕</button>
          </div>
        )}
      </section>

      {visibles.length === 0 ? (
        <EmptyState icon={<Disc3 size={22} />} title="Sin requerimientos">Ninguna llanta de la última inspección tiene remanente {textoUmbral(umbral)}{hayBusqueda ? ' para los filtros aplicados' : ''}.</EmptyState>
      ) : (
        <VehiculosTarjetas llantas={visibles} onInspeccionar={onInspeccionar} />
      )}
    </div>
  );
}
