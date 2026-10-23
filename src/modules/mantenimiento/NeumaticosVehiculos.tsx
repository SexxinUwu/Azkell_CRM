import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '../../core/ui/Display';
import { MM_CRITICO, MM_PREVENTIVO } from './neumaticosSemaforo';
import type { LlantaUltima } from './neumaticosReposicion';

// Una tarjeta por vehículo con la tabla de sus llantas (clásico: neuRenderTabla de neumaticos-ultimas).
// /neumaticos/ultimas devuelve una fila por llanta; aquí se agrupa por placa.

const dia = (v: unknown) => (v ? String(v).split('T')[0] : '---');
const ver = (v: unknown) => (v === null || v === undefined || v === '' ? '-' : String(v));

export function VehiculosTarjetas({ llantas, onInspeccionar }: { llantas: LlantaUltima[]; onInspeccionar: (placa: string) => void }) {
  const grupos = useMemo(() => {
    const m = new Map<string, LlantaUltima[]>();
    for (const l of llantas) {
      const k = String(l.placa || 'SIN_PLACA').toUpperCase().trim();
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return [...m.entries()];
  }, [llantas]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      {grupos.map(([placa, ls]) => {
        const p = ls[0];
        const sub = p.marca_unidad || p.tipo_unidad ? `${p.marca_unidad ?? ''} (${p.tipo_unidad ?? ''})`.trim() : '';
        return (
          <div key={placa} className="card card--flush">
            <div style={{ padding: 'var(--s-3) var(--s-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-3)', flexWrap: 'wrap', borderBottom: '1px solid var(--separator)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', minWidth: 0 }}>
                <button type="button" className="badge badge--ink" title={`Registrar nueva inspección de ${placa}`} onClick={() => onInspeccionar(placa)}
                  style={{ cursor: 'pointer', border: 0, fontFamily: 'var(--font-mono)', fontSize: '1rem', height: 'auto', minHeight: 32, padding: '4px 12px' }}>{placa}</button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{p.dueno || 'EMPRESA NO REGISTRADA'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>
                    {sub}{sub ? ' • ' : ''}Última inspección: <b>{dia(p.fecha_inspeccion)}</b>
                  </div>
                </div>
              </div>
              <Badge>{ls.length} posición(es)</Badge>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '44rem' }}>
                <thead><tr>
                  <th style={{ textAlign: 'center' }}>POS</th><th>MARCA / MEDIDA / MODELO</th><th style={{ textAlign: 'center' }}>R1 R2 R3 R4 (MM)</th>
                  <th style={{ textAlign: 'center' }}>PRESIÓN PSI</th><th style={{ textAlign: 'center' }}>ESTADO</th><th>OBSERVACIONES</th>
                </tr></thead>
                <tbody>
                  {ls.map((d, k) => {
                    const rem = d.remanente_promedio !== null && d.remanente_promedio !== undefined && d.remanente_promedio !== '' ? parseFloat(String(d.remanente_promedio)) : 10;
                    const critica = Number(d.alerta_cambio) === 1 || rem < MM_CRITICO;
                    const obs = String(d.observaciones ?? '').trim();
                    return (
                      <tr key={String(d.posicion) + k}>
                        <td style={{ textAlign: 'center' }}><Badge tone="ink">{String(d.posicion ?? '-').toUpperCase()}</Badge></td>
                        <td>
                          <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                            {(d.marca || '---').toUpperCase()}{d.modelo ? ` (${d.modelo.toUpperCase()})` : ''}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', whiteSpace: 'nowrap' }}>{(d.medida || '---').toUpperCase()} • {(d.estado || 'NUEVA').toUpperCase()}</div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                          {ver(d.r1)} &nbsp;{ver(d.r2)} &nbsp;{ver(d.r3)} &nbsp;{ver(d.r4)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{d.presion_actual ? `${d.presion_actual} PSI` : '---'}</div>
                          {d.presion_ant ? <div style={{ fontSize: '0.7rem', color: 'var(--label-2)' }}>(Ant: {d.presion_ant})</div> : null}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {critica ? <Badge tone="red">● Crítica (&lt; {MM_CRITICO} mm)</Badge>
                            : rem <= MM_PREVENTIVO ? <Badge tone="amber">● Alerta ({MM_CRITICO}-{MM_PREVENTIVO} mm)</Badge>
                            : <Badge tone="green">● Óptima (&gt; {MM_PREVENTIVO} mm)</Badge>}
                        </td>
                        <td style={{ fontSize: '0.8125rem' }}>
                          {obs ? <span style={{ color: 'var(--red-ink)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={13} />{obs}</span>
                            : <span style={{ color: 'var(--label-2)' }}>Ninguna</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
