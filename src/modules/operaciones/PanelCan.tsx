import { useState } from 'react';
import { CheckCircle2, ChevronDown, RefreshCw } from 'lucide-react';
import { CargadorCrow } from '../../core/ui/CargadorCrow';
import type { FilaCan, ItemCan } from './canLote';

interface Props {
  filas: FilaCan[];
  total: number;
  listos: number;
  cargando: number;
  sinDatos: number;
  errores: number;
  reintentar: (i: ItemCan) => void;
  items: ItemCan[];
}

// Ventana en la esquina inferior derecha: avance de la consulta del CAN, qué viajes cargaron y cuáles no (con el motivo)
export function PanelCan({ filas, total, listos, cargando, sinDatos, errores, reintentar, items }: Props) {
  const [oculto, setOculto] = useState(false);
  if (total === 0) return null;

  const terminados = listos + sinDatos + errores;
  const porcentaje = total ? Math.round((terminados / total) * 100) : 0;
  const enCurso = cargando > 0;

  if (oculto) {
    return (
      <button type="button" onClick={() => setOculto(false)} aria-label="Mostrar avance del CAN"
        style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 60, padding: '8px 14px', borderRadius: 999, border: '1px solid var(--separator)', background: 'var(--surface)', color: 'var(--label)', boxShadow: '0 8px 24px rgba(0,0,0,.18)', fontFamily: 'var(--font-mono)', fontWeight: 700, cursor: 'pointer' }}>
        CAN {terminados}/{total}
      </button>
    );
  }

  const filasDe = (estado: FilaCan['estado']) => filas.filter(f => f.estado === estado);
  const itemDe = (f: FilaCan) => items.find(i => i.viaje === f.viaje);

  return (
    <div role="region" aria-label="Avance de la consulta del CAN"
      style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 60, width: 'min(360px, calc(100vw - 32px))', maxHeight: '70vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 18, boxShadow: '0 16px 40px rgba(0,0,0,.22)', padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
        {enCurso ? <CargadorCrow texto="Consultando el CAN" /> : <CheckCircle2 size={34} color="var(--green-ink)" aria-hidden />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: '0.9375rem' }}>{enCurso ? 'Consultando el CAN (GPS)…' : 'CAN (GPS) listo'}</strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{listos} de {total} viajes con datos</span>
        </div>
        <button type="button" onClick={() => setOculto(true)} aria-label="Minimizar" title="Minimizar"
          style={{ border: 0, background: 'transparent', color: 'var(--label-2)', cursor: 'pointer', padding: 4 }}>
          <ChevronDown size={18} />
        </button>
      </div>

      <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={terminados}
        style={{ height: 8, borderRadius: 999, background: 'var(--separator)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${(listos / total) * 100}%`, background: 'var(--green-ink)', transition: 'width .3s' }} />
        <div style={{ width: `${((sinDatos + errores) / total) * 100}%`, background: 'var(--amber-ink)', transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: '0.6875rem', color: 'var(--label-2)', fontFamily: 'var(--font-mono)' }}>
        {terminados}/{total} procesados ({porcentaje}%) · {cargando} en cola
      </span>

      {sinDatos > 0 && (
        <div>
          <strong style={{ fontSize: '0.75rem' }}>Sin datos ({sinDatos})</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: '0.75rem', color: 'var(--label-2)' }}>
            {filasDe('sin_datos').map(f => <li key={f.viaje}><span style={{ fontFamily: 'var(--font-mono)' }}>{f.placa}</span> · viaje {f.viaje}: {f.motivo}</li>)}
          </ul>
        </div>
      )}

      {errores > 0 && (
        <div>
          <strong style={{ fontSize: '0.75rem', color: 'var(--red-ink)' }}>Con error ({errores})</strong>
          <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filasDe('error').map(f => (
              <li key={f.viaje} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.75rem', color: 'var(--label-2)' }}>
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ fontFamily: 'var(--font-mono)' }}>{f.placa}</span> · viaje {f.viaje}: {f.motivo}</span>
                <button type="button" onClick={() => { const i = itemDe(f); if (i) reintentar(i); }} aria-label={`Reintentar ${f.placa}`}
                  style={{ border: '1px solid var(--separator)', background: 'var(--surface)', borderRadius: 8, padding: '2px 8px', cursor: 'pointer', color: 'var(--label)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6875rem', whiteSpace: 'nowrap' }}>
                  <RefreshCw size={12} /> Reintentar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
