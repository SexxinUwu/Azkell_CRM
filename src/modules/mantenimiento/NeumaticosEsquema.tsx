import { useMemo, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Disc3 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { api, errorMessage } from '../../core/api/client';
import { CONFIGURACIONES, posicionesDeConfig } from '../inspecciones/components/ChasisEsquemaVisual';

// Diagrama esquemático de chasis y ejes para neumáticos (vista cenital, frente arriba).
// Las posiciones son las del clásico (modal_inspeccion.js): 1..N por configuración, más R/R1/R2 de repuesto.
// La disposición sale de placas.configuracion; si no se reconoce, o las posiciones de la
// inspección no encajan en ella, se muestra un esquema genérico agrupado por eje (sin inventar posiciones).

export interface LlantaDato {
  id?: number; posicion: string; tipo_eje?: string | null; marca?: string | null; modelo?: string | null;
  medida?: string | null; r1?: number | null; r2?: number | null; r3?: number | null; r4?: number | null;
  remanente_promedio?: number | string | null; presion_actual?: number | null; estado?: string | null; alerta_cambio?: number | null;
}

export type Tono = 'green' | 'amber' | 'red' | 'gray';

/** Semáforo único de neumáticos: más de 6 mm verde, de 3 a 6 mm ámbar, menos de 3 mm rojo; sin dato, gris */
export function tonoMm(mm: number | null): Tono {
  if (mm === null || Number.isNaN(mm)) return 'gray';
  return mm > 6 ? 'green' : mm >= 3 ? 'amber' : 'red';
}
export const ETIQUETA_TONO: Record<Tono, string> = {
  green: 'Óptimo', amber: 'Alerta preventiva', red: 'Crítico para cambio', gray: 'Sin dato',
};

/** Remanente de una llanta: el promedio guardado, o el de R1..R3; null si nunca se midió */
export function remanenteDe(l: { r1?: number | null; r2?: number | null; r3?: number | null; remanente_promedio?: number | string | null }): number | null {
  const rp = l.remanente_promedio;
  const medidas = [l.r1, l.r2, l.r3].map(v => Number(v) || 0);
  if (!medidas.some(Boolean) && !(rp !== null && rp !== undefined && Number(rp) > 0)) return null;
  return rp !== null && rp !== undefined && rp !== '' ? Number(rp) : (medidas[0] + medidas[1] + medidas[2]) / 3;
}

export function LeyendaSemaforo() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-3)', fontSize: '0.75rem', color: 'var(--label-2)' }} aria-label="Leyenda del semáforo">
      {(['green', 'amber', 'red', 'gray'] as Tono[]).map(t => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 10, height: 10, borderRadius: 999, background: t === 'gray' ? 'var(--label-3)' : `var(--${t}-ink)` }} />
          {t === 'green' ? 'Más de 6 mm · Óptimo' : t === 'amber' ? '3 a 6 mm · Alerta preventiva' : t === 'red' ? 'Menos de 3 mm · Crítico para cambio' : 'Sin dato'}
        </span>
      ))}
    </div>
  );
}

// Códigos del clásico (ALIAS_MAPPER de modal_inspeccion.js)
const ALIAS: Record<string, string> = {
  C2: '4X2', T2: '4X2', '4X2': '4X2', C3: '6X4', T3: '6X4', '6X4': '6X4', '6X2': '6X2',
  R2: 'R2', S2: 'S2', S3: 'S3', T3S3: 'T3S3', C3S3: 'T3S3',
};
export function configReconocida(...crudos: Array<string | null | undefined>): string | null {
  for (const c of crudos) {
    const k = String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (ALIAS[k]) return ALIAS[k];
  }
  return null;
}

// Geometría
const W = 28, H = 42, SEP = 3, FILA = 66, X0 = 130;
const IZQ_SIMPLE = X0 - 62, DER_SIMPLE = X0 + 62;
// Posición x de cada llanta de un lado: simple al centro del lado; dual, exterior e interior
function xLado(n: number, k: number, lado: 'i' | 'd'): number {
  if (n === 1) return lado === 'i' ? IZQ_SIMPLE : DER_SIMPLE;
  const interior = lado === 'i' ? X0 - 44 : X0 + 44;
  const sentido = lado === 'i' ? -1 : 1;
  // izquierda: [exterior, interior]; derecha: [interior, exterior]
  const idx = lado === 'i' ? n - 1 - k : k;
  return interior + sentido * idx * (W + SEP);
}

function Rueda({ x, y, pos, l, activa, onSelect }: {
  x: number; y: number; pos: string; l?: LlantaDato; activa: boolean; onSelect: (l: LlantaDato) => void;
}) {
  const mm = l ? remanenteDe(l) : null;
  const tono = tonoMm(mm);
  const fondo = tono === 'gray' ? 'var(--gray-tint)' : `var(--${tono}-ink)`;
  const texto = tono === 'gray' ? 'var(--label-2)' : '#fff';
  const cx = x, cy = y + H / 2;
  const clicable = !!l;
  return (
    <g role={clicable ? 'button' : 'img'} tabIndex={clicable ? 0 : undefined}
      aria-label={`Llanta ${pos}: ${mm === null ? 'sin dato' : `${mm.toFixed(1)} mm`}, ${ETIQUETA_TONO[tono]}`}
      onClick={l ? () => onSelect(l) : undefined}
      onKeyDown={l ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(l); } } : undefined}
      style={{ cursor: clicable ? 'pointer' : 'default', opacity: clicable ? 1 : 0.45 }}>
      <rect x={x - W / 2} y={y} width={W} height={H} rx={6} fill={fondo}
        stroke={activa ? 'var(--label)' : 'none'} strokeWidth={activa ? 2.5 : 0} />
      <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={700} fill={texto}>{pos}</text>
      <text x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill={texto}>{mm === null ? '—' : mm.toFixed(1)}</text>
    </g>
  );
}

function Chasis({ codigo, mapa, activa, onSelect }: {
  codigo: string; mapa: Map<string, LlantaDato>; activa: string; onSelect: (l: LlantaDato) => void;
}) {
  const c = CONFIGURACIONES[codigo];
  const trazo = 'var(--separator, #d1d1d6)';
  const combinacion = codigo === 'T3S3';
  // En la combinación los 3 primeros ejes son del tracto y el resto de la carreta
  const ejesTracto = combinacion ? 3 : c.ejes.length;
  let y = 6;
  const piezas: ReactElement[] = [];

  const bloque = (ejes: typeof c.ejes, etiqueta: string, cabina: boolean) => {
    const y0 = y;
    if (cabina) {
      piezas.push(<rect key={`cab${y0}`} x={X0 - 46} y={y0} width={92} height={46} rx={16} fill="var(--fill)" stroke={trazo} strokeWidth={1.5} />);
      piezas.push(<text key={`tcab${y0}`} x={X0} y={y0 + 27} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--label-2)">{etiqueta}</text>);
      y += 56;
    } else {
      piezas.push(<rect key={`kp${y0}`} x={X0 - 18} y={y0} width={36} height={18} rx={7} fill="none" stroke={trazo} strokeWidth={1.5} />);
      piezas.push(<text key={`tkp${y0}`} x={X0} y={y0 + 13} textAnchor="middle" fontSize={9} fontWeight={600} fill="var(--label-2)">{etiqueta}</text>);
      y += 26;
    }
    piezas.push(<rect key={`riel${y0}`} x={X0 - 16} y={y - 4} width={32} height={ejes.length * FILA + 4} rx={6} fill="none" stroke={trazo} strokeWidth={1.5} />);
    ejes.forEach((eje, i) => {
      const ye = y + i * FILA;
      const yTrav = ye + H / 2 + 2;
      piezas.push(<line key={`tr${ye}`} x1={X0 - 86} x2={X0 + 86} y1={yTrav} y2={yTrav} stroke={trazo} strokeWidth={2} strokeLinecap="round" />);
      eje.izquierda.forEach((pos, k) => piezas.push(
        <Rueda key={pos} x={xLado(eje.izquierda.length, k, 'i')} y={ye} pos={pos} l={mapa.get(pos)} activa={activa === pos} onSelect={onSelect} />));
      eje.derecha.forEach((pos, k) => piezas.push(
        <Rueda key={pos} x={xLado(eje.derecha.length, k, 'd')} y={ye} pos={pos} l={mapa.get(pos)} activa={activa === pos} onSelect={onSelect} />));
    });
    y += ejes.length * FILA + 4;
  };

  if (c.cabina) {
    bloque(c.ejes.slice(0, ejesTracto), combinacion ? 'Tracto' : 'Cabina', true);
    if (combinacion) {
      piezas.push(<circle key="quinta" cx={X0} cy={y + 8} r={7} fill="none" stroke={trazo} strokeWidth={2} />);
      y += 22;
      bloque(c.ejes.slice(ejesTracto), 'Carreta', false);
    }
  } else {
    bloque(c.ejes, 'Carreta', false);
  }

  // Repuestos que existan en los datos, debajo del chasis
  const repuestos = c.repuestos.filter(r => mapa.has(r));
  if (repuestos.length) {
    y += 6;
    piezas.push(<text key="trep" x={X0} y={y + 4} textAnchor="middle" fontSize={9} fontWeight={600} fill="var(--label-2)">Repuesto</text>);
    y += 12;
    repuestos.forEach((pos, i) => piezas.push(
      <Rueda key={pos} x={repuestos.length === 1 ? X0 : X0 - 20 + i * 40} y={y} pos={pos} l={mapa.get(pos)} activa={activa === pos} onSelect={onSelect} />));
    y += H + 4;
  }

  return (
    <svg viewBox={`0 0 260 ${y + 6}`} role="group" aria-label={`Esquema de ejes ${codigo}`}
      style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto' }}>
      {piezas}
    </svg>
  );
}

/** Esquema genérico: ruedas agrupadas por eje (columna tipo_eje) cuando no se sabe la disposición */
function Generico({ llantas, activa, onSelect }: { llantas: LlantaDato[]; activa: string; onSelect: (l: LlantaDato) => void }) {
  const grupos = useMemo(() => {
    const m = new Map<string, LlantaDato[]>();
    for (const l of llantas) {
      const k = (l.tipo_eje ?? '').trim().toUpperCase();
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return [...m.entries()];
  }, [llantas]);
  const COLS = 6;
  let y = 4;
  const piezas: ReactElement[] = [];
  grupos.forEach(([eje, ls]) => {
    piezas.push(<text key={`g${eje}${y}`} x={4} y={y + 10} fontSize={10} fontWeight={600} fill="var(--label-2)">{eje || 'Llantas'}</text>);
    y += 16;
    ls.forEach((l, i) => {
      const col = i % COLS, fila = Math.floor(i / COLS);
      piezas.push(<Rueda key={`${l.posicion}-${i}`} x={22 + col * 40} y={y + fila * (H + 6)} pos={l.posicion} l={l} activa={activa === l.posicion} onSelect={onSelect} />);
    });
    y += Math.ceil(ls.length / COLS) * (H + 6) + 6;
  });
  return (
    <svg viewBox={`0 0 260 ${y + 4}`} role="group" aria-label="Esquema de llantas por eje"
      style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto' }}>
      {piezas}
    </svg>
  );
}

export function EsquemaNeumaticos({ llantas, configuracion, activa, onSelect }: {
  llantas: LlantaDato[]; configuracion: string | null; activa: string; onSelect: (l: LlantaDato) => void;
}) {
  const mapa = useMemo(() => new Map(llantas.map(l => [String(l.posicion).trim().toUpperCase(), l])), [llantas]);
  const encaja = !!configuracion && !!CONFIGURACIONES[configuracion]
    && llantas.every(l => posicionesDeConfig(configuracion).includes(String(l.posicion).trim().toUpperCase()));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
      {encaja && configuracion ? (
        <>
          <p className="t-footnote c-secondary">{configuracion} · {CONFIGURACIONES[configuracion].nombre} · {CONFIGURACIONES[configuracion].llantas} llantas</p>
          <Chasis codigo={configuracion} mapa={mapa} activa={activa} onSelect={onSelect} />
        </>
      ) : (
        <>
          <p className="t-footnote c-secondary">
            {configuracion ? 'Las posiciones de la inspección no coinciden con la configuración registrada; se muestran agrupadas por eje.'
              : 'La unidad no tiene una configuración reconocida; se muestran las llantas agrupadas por eje.'}
          </p>
          <Generico llantas={llantas} activa={activa} onSelect={onSelect} />
        </>
      )}
      <LeyendaSemaforo />
    </div>
  );
}

// ─── Historial de una llanta ─────────────────────────────────────────────────

interface FilaInsp {
  id_inspeccion: string; fecha_inspeccion: string; km_vehiculo: number | null; marca: string | null; modelo: string | null; medida: string | null;
  r1: number | null; r2: number | null; r3: number | null; r4: number | null; remanente_promedio: number | null;
  presion_ant: number | null; presion_actual: number | null; estado: string | null; accion: string | null; rot: string | null; observaciones: string | null;
}
interface FilaRot { id: number; fecha: string; km_actual: number | null; posicion_origen: string; posicion_destino: string; motivo: string | null; tecnico: string | null }
interface RespHistorial { ok?: boolean; error?: string; inspecciones: FilaInsp[]; rotaciones: FilaRot[] }

const celda = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

export function HistorialLlantaSheet({ placa, llanta, onClose }: { placa: string; llanta: LlantaDato | null; onClose: () => void }) {
  const { data, isLoading, error } = useQuery<RespHistorial>({
    queryKey: ['mant', 'neumaticos-historial', placa, llanta?.posicion],
    enabled: !!llanta && !!placa,
    queryFn: async () => {
      const r = await api<RespHistorial>(`/neumaticos/historial-posicion/${encodeURIComponent(placa)}/${encodeURIComponent(llanta?.posicion ?? '')}`);
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo obtener el historial');
      return r;
    },
  });
  const mm = llanta ? remanenteDe(llanta) : null;
  const tono = tonoMm(mm);
  const marcadasRotadas = (data?.inspecciones ?? []).filter(i => String(i.rot ?? '').toUpperCase() === 'SI');

  return (
    <Sheet open={!!llanta} onClose={onClose} title={llanta ? `${placa} · Llanta ${llanta.posicion}` : 'Llanta'}
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
      <div className="form-grid">
        {llanta && (
          <div className="field field--wide" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-3)', alignItems: 'center', fontSize: '0.8125rem' }}>
            <span style={{ fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: tono === 'gray' ? 'var(--gray-tint)' : `var(--${tono}-tint)`,
              color: tono === 'gray' ? 'var(--label-2)' : `var(--${tono}-ink)` }}>
              {mm === null ? 'Sin dato' : `${mm.toFixed(1)} mm`} · {ETIQUETA_TONO[tono]}
            </span>
            <span>{[llanta.marca, llanta.modelo, llanta.medida].filter(Boolean).join(' · ') || '—'}</span>
            <span style={{ color: 'var(--label-2)' }}>{llanta.presion_actual ?? 0} PSI{llanta.tipo_eje ? ` · ${llanta.tipo_eje}` : ''}</span>
          </div>
        )}
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{errorMessage(error)}</Notice></div>}
        {isLoading && <div className="field field--wide"><PageLoader /></div>}
        {data && (
          <>
            <div className="field field--wide">
              <p className="tarjeta__grupo-titulo">Rotaciones</p>
              {data.rotaciones.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="inv-kardex" style={{ minWidth: '28rem', fontSize: '0.8rem' }}>
                    <thead><tr><th>Fecha</th><th>De</th><th>A</th><th>Km</th><th>Motivo</th><th>Técnico</th></tr></thead>
                    <tbody>{data.rotaciones.map(r => (
                      <tr key={r.id}><td>{r.fecha}</td><td>{r.posicion_origen}</td><td>{r.posicion_destino}</td>
                        <td>{celda(r.km_actual)}</td><td>{celda(r.motivo)}</td><td>{celda(r.tecnico)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : (
                <p className="t-footnote c-secondary">No hay rotaciones registradas que involucren esta posición.</p>
              )}
              {marcadasRotadas.length > 0 && (
                <p className="t-footnote c-secondary" style={{ marginTop: 6 }}>
                  Inspecciones con la marca ROT = SI en esta posición: {marcadasRotadas.map(i => `${i.fecha_inspeccion}${i.observaciones ? ` (${i.observaciones})` : ''}`).join(' · ')}
                </p>
              )}
            </div>
            <div className="field field--wide">
              <p className="tarjeta__grupo-titulo">Inspecciones y presión (PSI)</p>
              {data.inspecciones.length === 0 ? (
                <EmptyState icon={<Disc3 size={22} />} title="Sin inspecciones">No hay inspecciones guardadas en la posición {llanta?.posicion}.</EmptyState>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="inv-kardex" style={{ minWidth: '44rem', fontSize: '0.8rem' }}>
                    <thead><tr><th>Fecha</th><th>Km</th><th>Llanta</th><th>R1</th><th>R2</th><th>R3</th><th>R4</th><th>Prom.</th><th>PSI ant.</th><th>PSI</th><th>Estado</th><th>Acción</th></tr></thead>
                    <tbody>{data.inspecciones.map(i => {
                      const m = remanenteDe(i);
                      const t = tonoMm(m);
                      return (
                        <tr key={i.id_inspeccion}>
                          <td>{i.fecha_inspeccion}</td><td>{celda(i.km_vehiculo)}</td>
                          <td>{[i.marca, i.medida].filter(Boolean).join(' ') || '—'}</td>
                          <td>{celda(i.r1)}</td><td>{celda(i.r2)}</td><td>{celda(i.r3)}</td><td>{celda(i.r4)}</td>
                          <td style={{ fontWeight: 700, color: t === 'gray' ? undefined : `var(--${t}-ink)` }}>{m === null ? '—' : m.toFixed(1)}</td>
                          <td>{celda(i.presion_ant)}</td><td>{celda(i.presion_actual)}</td>
                          <td>{celda(i.estado)}</td><td>{celda(i.accion)}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
