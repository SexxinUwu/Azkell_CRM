import { ETIQUETA_ESTADO_GUIA, TONO_ESTADO_GUIA, type EstadoGuia } from './guiasApi';

/** Estado de la guía como una pastilla de color */
export function PastillaGuia({ estado }: { estado: EstadoGuia }) {
  const t = TONO_ESTADO_GUIA[estado] ?? 'gray';
  return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: `var(--${t}-tint)`, color: `var(--${t}-ink)`, fontSize: '0.6875rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{ETIQUETA_ESTADO_GUIA[estado] ?? estado}</span>;
}
