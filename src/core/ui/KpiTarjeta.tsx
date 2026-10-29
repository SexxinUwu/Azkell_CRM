import type { KeyboardEvent, ReactNode } from 'react';

interface Props {
  etiqueta: string;
  valor: string;
  sub?: string;
  icono: ReactNode;
  tono?: 'ok' | 'warning' | 'valor';
  className?: string;
  /** Si se pasa, la tarjeta filtra: se comporta como botón y `activo` marca la opción elegida */
  onClick?: () => void;
  activo?: boolean;
}

/** Tarjeta de indicador (estilo Órdenes de compra): los estilos `.inv-kpi` están en almacen.css */
export function KpiTarjeta({ etiqueta, valor, sub, icono, tono, className, onClick, activo }: Props) {
  const clases = ['inv-kpi', className].filter(Boolean).join(' ');
  const contenido = (
    <>
      <div className="inv-kpi__cuerpo">
        <div className="inv-kpi__etiqueta">{etiqueta}</div>
        <div className={`inv-kpi__valor${tono ? ` inv-kpi__valor--${tono}` : ''}`}>{valor}</div>
        {sub && <div className="inv-kpi__sub">{sub}</div>}
      </div>
      <span className={`inv-kpi__icono${tono && tono !== 'valor' ? ` inv-kpi__icono--${tono}` : ''}`}>{icono}</span>
    </>
  );
  if (!onClick) return <div className={clases}>{contenido}</div>;
  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
  };
  return (
    <div className={clases} role="button" tabIndex={0} aria-pressed={!!activo} onClick={onClick} onKeyDown={alTeclear}>
      {contenido}
    </div>
  );
}
