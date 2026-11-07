import { useState } from 'react';
import { Target } from 'lucide-react';

/** Metas por estado, en %. Se guardan en este navegador. */
export function useMetas(clave: string, porDefecto: number[]) {
  const leer = () => {
    try {
      const v = JSON.parse(localStorage.getItem(clave) ?? 'null');
      if (Array.isArray(v) && v.length === porDefecto.length && v.every(n => typeof n === 'number') && v.reduce((a, b) => a + b, 0) === 100) return v as number[];
    } catch { /* sin almacenamiento */ }
    return porDefecto;
  };
  const [metas, setMetas] = useState<number[]>(leer);
  const guardar = (nuevas: number[]) => {
    setMetas(nuevas);
    try { localStorage.setItem(clave, JSON.stringify(nuevas)); } catch { /* sin almacenamiento */ }
  };
  return [metas, guardar] as const;
}

export function MetasEditor({ nombres, metas, onGuardar, titulo }: { nombres: string[]; metas: number[]; onGuardar: (m: number[]) => void; titulo: string }) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<string[]>([]);
  const suma = borrador.reduce((s, v) => s + (Number(v) || 0), 0);
  const valido = suma === 100 && borrador.every(v => v !== '' && Number(v) >= 0);
  return (
    <>
      <button type="button" aria-label={`Editar metas de ${titulo}`} title="Editar metas"
        onClick={() => { setBorrador(metas.map(String)); setAbierto(o => !o); }}
        style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, border: 0, background: 'var(--fill)', color: 'var(--label-2)', borderRadius: 999, padding: '3px 10px', fontSize: '0.6875rem', fontWeight: 700, cursor: 'pointer' }}>
        <Target size={12} /> Metas
      </button>
      {abierto && (
        <div style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', padding: 'var(--s-3)', marginTop: 'var(--s-2)', borderRadius: 12, background: 'var(--fill)' }}>
          {nombres.map((n, i) => (
            <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: '0.8125rem' }}>
              <span style={{ flex: 1 }}>{n}</span>
              <input type="number" inputMode="numeric" min={0} max={100} value={borrador[i]}
                onChange={e => setBorrador(b => b.map((v, j) => (j === i ? e.target.value : v)))}
                style={{ width: 64, textAlign: 'right', fontFamily: 'var(--font-mono)' }} />
              <span>%</span>
            </label>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: '0.75rem', fontWeight: 700, color: valido ? 'var(--green-ink)' : 'var(--red-ink)' }}>
            <span style={{ flex: 1 }}>Suma {suma}% {valido ? '' : '(debe ser 100%)'}</span>
            <button type="button" onClick={() => setAbierto(false)} style={{ border: 0, background: 'transparent', color: 'var(--label-2)', cursor: 'pointer' }}>Cancelar</button>
            <button type="button" disabled={!valido} onClick={() => { onGuardar(borrador.map(Number)); setAbierto(false); }}
              style={{ border: 0, borderRadius: 999, padding: '4px 12px', fontWeight: 700, background: 'var(--accent, #0a84ff)', color: '#fff', opacity: valido ? 1 : 0.4, cursor: valido ? 'pointer' : 'default' }}>Guardar</button>
          </div>
        </div>
      )}
    </>
  );
}
