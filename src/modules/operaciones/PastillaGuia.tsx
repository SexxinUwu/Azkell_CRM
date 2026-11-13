import { ESTADO_SUNAT, ETIQUETA_ESTADO_GUIA, TONO_ESTADO_GUIA, type EstadoGuia, type Guia } from './guiasApi';

/** Estado de la guía como una pastilla de color. Las guías emitidas por nosotros muestran el estado que dice APISUNAT. */
export function PastillaGuia({ estado, guia }: { estado: EstadoGuia; guia?: Pick<Guia, 'origen' | 'apisunat_status'> }) {
  const sunat = guia && guia.origen === 'EMITIDA' ? (ESTADO_SUNAT[guia.apisunat_status ?? ''] ?? ESTADO_SUNAT.ERROR_APISUNAT) : null;
  const t = sunat ? sunat.tono : (TONO_ESTADO_GUIA[estado] ?? 'gray');
  return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: `var(--${t}-tint)`, color: `var(--${t}-ink)`, fontSize: '0.6875rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{sunat ? sunat.texto : (ETIQUETA_ESTADO_GUIA[estado] ?? estado)}</span>;
}
