import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, RefreshCw, X } from 'lucide-react';
import { CargadorCrow } from '../../core/ui/CargadorCrow';
import type { FilaCan, ItemCan } from './canLote';
import '../../core/ui/cargador-crow.css';

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

// Cuántos motivos mostrar por lista; el resto se resume para no alargar el panel
const MAX_LISTA = 3;

// Avance de la consulta del CAN, flotando sobre la tabla en la esquina inferior derecha.
// - Se monta en <body> para que la posición fija no se mueva al hacer scroll.
// - El cuervo se para sobre el borde del panel, fuera del vidrio, y nada lo recorta.
// - Si todos los viajes cargaron, se desvanece solo. Si hay viajes sin datos o con error, se queda hasta cerrarlo.
export function PanelCan({ filas, total, listos, cargando, sinDatos, errores, reintentar, items }: Props) {
  const [cerrado, setCerrado] = useState(false);
  const [desvanecido, setDesvanecido] = useState(false);
  const enCurso = cargando > 0;
  const todoBien = total > 0 && !enCurso && sinDatos === 0 && errores === 0;

  // Una consulta nueva vuelve a mostrar el panel
  useEffect(() => {
    if (enCurso) { setCerrado(false); setDesvanecido(false); }
  }, [enCurso]);

  useEffect(() => {
    if (!todoBien) return;
    const t = window.setTimeout(() => setDesvanecido(true), 4000);
    return () => window.clearTimeout(t);
  }, [todoBien]);

  if (total === 0 || cerrado || desvanecido) return null;

  const terminados = listos + sinDatos + errores;
  const filasDe = (estado: FilaCan['estado']) => filas.filter(f => f.estado === estado);
  const itemDe = (f: FilaCan) => items.find(i => i.viaje === f.viaje && i.placa === f.placa);
  const sinDatosFilas = filasDe('sin_datos');
  const erroresFilas = filasDe('error');

  return createPortal(
    <div className="can-panel" role="region" aria-label="Avance de la consulta del CAN" aria-live="polite">
      {enCurso && (
        <div className="can-panel__cuervo" aria-hidden={false}>
          <CargadorCrow texto="Consultando el CAN" />
        </div>
      )}

      <div className="can-panel__vidrio">
        <div className="can-panel__cabecera">
          {!enCurso && <CheckCircle2 size={30} color="var(--green-ink)" aria-hidden />}
          <div className="can-panel__titulo">
            <strong>{enCurso ? 'Consultando el CAN (GPS)…' : 'CAN (GPS) listo'}</strong>
            <span>{listos} de {total} viajes con datos</span>
          </div>
          <button type="button" className="can-panel__cerrar" onClick={() => setCerrado(true)} aria-label="Cerrar avance del CAN" title="Cerrar">
            <X size={15} />
          </button>
        </div>

        <div className="can-panel__barra" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={terminados}>
          <div style={{ width: `${(listos / total) * 100}%`, background: 'var(--green-ink)' }} />
          <div style={{ width: `${((sinDatos + errores) / total) * 100}%`, background: 'var(--amber-ink)' }} />
        </div>
        <span className="can-panel__cifra">{terminados}/{total} procesados · {cargando} en cola</span>

        {sinDatosFilas.length > 0 && (
          <div className="can-panel__lista">
            <strong>Sin datos ({sinDatosFilas.length})</strong>
            <ul>
              {sinDatosFilas.slice(0, MAX_LISTA).map(f => <li key={`${f.viaje}|${f.placa}`}><code>{f.placa}</code> · viaje {f.viaje}: {f.motivo}</li>)}
            </ul>
            {sinDatosFilas.length > MAX_LISTA && <span className="can-panel__mas">y {sinDatosFilas.length - MAX_LISTA} más</span>}
          </div>
        )}

        {erroresFilas.length > 0 && (
          <div className="can-panel__lista">
            <strong style={{ color: 'var(--red-ink)' }}>Con error ({erroresFilas.length})</strong>
            <ul>
              {erroresFilas.slice(0, MAX_LISTA).map(f => (
                <li key={`${f.viaje}|${f.placa}`}>
                  <span><code>{f.placa}</code> · viaje {f.viaje}: {f.motivo}</span>
                  <button type="button" onClick={() => { const i = itemDe(f); if (i) reintentar(i); }} aria-label={`Reintentar ${f.placa}`}>
                    <RefreshCw size={12} /> Reintentar
                  </button>
                </li>
              ))}
            </ul>
            {erroresFilas.length > MAX_LISTA && <span className="can-panel__mas">y {erroresFilas.length - MAX_LISTA} más</span>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
