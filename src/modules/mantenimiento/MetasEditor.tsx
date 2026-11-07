import { useState } from 'react';
import { Target } from 'lucide-react';

/** Meta de «vigentes» en %. Se guarda en este navegador. */
export function useMeta(clave: string, porDefecto: number) {
  const leer = () => {
    try {
      const v = Number(JSON.parse(localStorage.getItem(clave) ?? 'null'));
      if (Number.isFinite(v) && v >= 1 && v <= 100) return Math.round(v);
    } catch { /* sin almacenamiento */ }
    return porDefecto;
  };
  const [meta, setMeta] = useState<number>(leer);
  const guardar = (n: number) => {
    setMeta(n);
    try { localStorage.setItem(clave, JSON.stringify(n)); } catch { /* sin almacenamiento */ }
  };
  return [meta, guardar] as const;
}

export function MetaEditor({ meta, onGuardar, titulo }: { meta: number; onGuardar: (n: number) => void; titulo: string }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const n = Number(texto);
  const valido = texto !== '' && Number.isFinite(n) && n >= 1 && n <= 100;
  return (
    <>
      <button type="button" aria-label={`Editar la meta de ${titulo}`} title="Editar meta"
        onClick={() => { setTexto(String(meta)); setAbierto(o => !o); }}
        style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, border: 0, background: 'var(--fill)', color: 'var(--label-2)', borderRadius: 999, padding: '3px 10px', fontSize: '0.6875rem', fontWeight: 700, cursor: 'pointer' }}>
        <Target size={12} /> Meta {meta}%
      </button>
      {abierto && (
        <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 'var(--s-2)', padding: 'var(--s-3)', marginTop: 'var(--s-2)', borderRadius: 12, background: 'var(--fill)', fontSize: '0.8125rem' }}>
          <span style={{ flex: 1 }}>Meta de vigentes</span>
          <input type="number" inputMode="numeric" min={1} max={100} value={texto} onChange={e => setTexto(e.target.value)}
            style={{ width: 64, textAlign: 'right', fontFamily: 'var(--font-mono)' }} />
          <span>%</span>
          <button type="button" onClick={() => setAbierto(false)} style={{ border: 0, background: 'transparent', color: 'var(--label-2)', cursor: 'pointer' }}>Cancelar</button>
          <button type="button" disabled={!valido} onClick={() => { onGuardar(Math.round(n)); setAbierto(false); }}
            style={{ border: 0, borderRadius: 999, padding: '4px 12px', fontWeight: 700, background: 'var(--accent, #0a84ff)', color: '#fff', opacity: valido ? 1 : 0.4, cursor: valido ? 'pointer' : 'default' }}>Guardar</button>
        </div>
      )}
    </>
  );
}
