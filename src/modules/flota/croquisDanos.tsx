// Marcas de daños sobre el croquis de la unidad (acta de entrega).
// Se guardan en seg_entrega_vehiculos.croquis_danos_json como una lista [{ n, x, y, tipo, obs }].
// x e y están en el sistema de coordenadas del dibujo (viewBox 920 × 340), así que no dependen del tamaño en pantalla.
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { ChoiceChips } from '../../core/ui/Chips';
import { Field, TextInput } from '../../core/ui/Field';
import { Button } from '../../core/ui/Button';
import { svgCroquis, type ConfigCroquis, type EstiloCabina } from './croquisEntrega';

export type TipoDano = 'abolladura' | 'raspon' | 'rotura' | 'faltante';
export interface Dano { n: number; x: number; y: number; tipo: TipoDano; obs: string }

export const ANCHO = 920;
export const ALTO = 340;

export const TIPOS_DANO: Array<{ value: TipoDano; label: string; color: string }> = [
  { value: 'abolladura', label: 'Abolladura', color: '#f59e0b' },
  { value: 'raspon', label: 'Raspón', color: '#0ea5e9' },
  { value: 'rotura', label: 'Rotura', color: '#dc2626' },
  { value: 'faltante', label: 'Faltante', color: '#7c3aed' },
];
const colorDe = (t: TipoDano) => TIPOS_DANO.find(x => x.value === t)?.color ?? '#dc2626';
export const nombreTipoDano = (t: TipoDano) => TIPOS_DANO.find(x => x.value === t)?.label ?? t;

/** Lee croquis_danos_json (texto JSON o ya una lista) y descarta lo que no tenga la forma esperada */
export function leerDanos(raw: unknown): Dano[] {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return []; } }
  if (!Array.isArray(v)) return [];
  return v.map((d, i) => {
    const o = (d ?? {}) as Record<string, unknown>;
    const tipo = TIPOS_DANO.some(t => t.value === o.tipo) ? (o.tipo as TipoDano) : 'abolladura';
    return {
      n: i + 1, x: Math.min(ANCHO, Math.max(0, Number(o.x) || 0)), y: Math.min(ALTO, Math.max(0, Number(o.y) || 0)),
      tipo, obs: String(o.obs ?? ''),
    };
  });
}

/** Pines como SVG de texto (para el PDF) */
export function svgPinesDanos(danos: Dano[]): string {
  return danos.map(d => `<g><circle cx="${d.x}" cy="${d.y}" r="14" fill="${colorDe(d.tipo)}" stroke="#ffffff" stroke-width="3" />`
    + `<text x="${d.x}" y="${d.y + 5}" font-size="14" font-weight="800" fill="#ffffff" text-anchor="middle" font-family="Arial, sans-serif">${d.n}</text></g>`).join('');
}

/** Croquis con las marcas ya dibujadas (se inserta antes del cierre del SVG) */
export function svgCroquisConDanos(config: ConfigCroquis, cabina: EstiloCabina, furgon: boolean, danos: Dano[], fondo = false): string {
  return svgCroquis(config, cabina, furgon, { fondo }).replace(/<\/svg>\s*$/, `${svgPinesDanos(danos)}</svg>`);
}

interface Props {
  config: ConfigCroquis; cabina: EstiloCabina; furgon: boolean;
  danos: Dano[];
  /** Sin esta función el croquis es de solo lectura */
  onChange?: (danos: Dano[]) => void;
}

export function CroquisDanos({ config, cabina, furgon, danos, onChange }: Props) {
  const capa = useRef<SVGSVGElement>(null);
  const arrastre = useRef<number | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const editable = !!onChange;
  const actual = sel !== null ? danos[sel] : undefined;

  const punto = (clientX: number, clientY: number) => {
    const r = capa.current!.getBoundingClientRect();
    return {
      x: Math.round(Math.min(ANCHO, Math.max(0, ((clientX - r.left) / r.width) * ANCHO))),
      y: Math.round(Math.min(ALTO, Math.max(0, ((clientY - r.top) / r.height) * ALTO))),
    };
  };
  const renumerar = (l: Dano[]) => l.map((d, i) => ({ ...d, n: i + 1 }));
  const cambiar = (i: number, parte: Partial<Dano>) => onChange?.(danos.map((d, j) => (j === i ? { ...d, ...parte } : d)));

  function colocar(e: React.MouseEvent) {
    if (!onChange) return;
    const p = punto(e.clientX, e.clientY);
    onChange(renumerar([...danos, { n: 0, ...p, tipo: actual?.tipo ?? 'abolladura', obs: '' }]));
    setSel(danos.length);
  }
  function iniciar(e: RPointerEvent, i: number) {
    e.stopPropagation();
    setSel(i);
    if (!editable) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    arrastre.current = i;
  }
  function mover(e: RPointerEvent) {
    if (arrastre.current === null) return;
    cambiar(arrastre.current, punto(e.clientX, e.clientY));
  }
  function soltar() { arrastre.current = null; }
  function quitar() {
    if (sel === null) return;
    onChange?.(renumerar(danos.filter((_, j) => j !== sel)));
    setSel(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div style={{ position: 'relative', maxWidth: 820, width: '100%', margin: '0 auto', padding: 'var(--s-3)', boxSizing: 'content-box',
        borderRadius: 'var(--r-lg)', background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--separator)' }}>
        <div dangerouslySetInnerHTML={{ __html: svgCroquis(config, cabina, furgon) }} />
        <svg ref={capa} viewBox={`0 0 ${ANCHO} ${ALTO}`} onClick={colocar} aria-label="Marcas de daños"
          style={{ position: 'absolute', left: 'var(--s-3)', top: 'var(--s-3)', width: 'calc(100% - 2 * var(--s-3))', height: 'calc(100% - 2 * var(--s-3))',
            cursor: editable ? 'crosshair' : 'default', touchAction: 'manipulation' }}>
          {danos.map((d, i) => (
            <g key={i} onPointerDown={e => iniciar(e, i)} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
              onClick={e => e.stopPropagation()} style={{ cursor: editable ? 'grab' : 'pointer', touchAction: 'none' }}>
              <circle cx={d.x} cy={d.y} r={i === sel ? 19 : 15} fill={colorDe(d.tipo)} stroke="#ffffff" strokeWidth={i === sel ? 4 : 3} />
              <text x={d.x} y={d.y + 5} fontSize="15" fontWeight="800" fill="#ffffff" textAnchor="middle" fontFamily="Arial, sans-serif" pointerEvents="none">{d.n}</text>
            </g>
          ))}
        </svg>
      </div>

      {editable && <p className="t-footnote c-secondary" style={{ margin: 0 }}>Toca el dibujo para marcar un daño; arrastra el número para moverlo.</p>}

      {actual && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          {editable ? (
            <>
              <ChoiceChips label={`Tipo de daño de la marca ${actual.n}`} value={actual.tipo} onChange={t => cambiar(sel!, { tipo: t })}
                options={TIPOS_DANO.map(t => ({ value: t.value, label: t.label }))} />
              <Field label={`Observación de la marca ${actual.n}`}>
                {p => <TextInput {...p} value={actual.obs} onChange={e => cambiar(sel!, { obs: e.target.value })} placeholder="Ej. puerta izquierda, 10 cm" />}
              </Field>
              <div><Button variant="secondary" icon={<Trash2 size={16} />} onClick={quitar}>Quitar marca {actual.n}</Button></div>
            </>
          ) : (
            <p className="t-footnote" style={{ margin: 0 }}><strong>{actual.n} · {nombreTipoDano(actual.tipo)}</strong>{actual.obs ? ` — ${actual.obs}` : ''}</p>
          )}
        </div>
      )}

      {danos.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8125rem' }}>
          {danos.map((d, i) => (
            <li key={i} style={{ cursor: 'pointer', fontWeight: i === sel ? 700 : 400 }} onClick={() => setSel(i)}>
              {nombreTipoDano(d.tipo)}{d.obs ? ` — ${d.obs}` : ''}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
