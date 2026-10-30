import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Star, type LucideIcon } from 'lucide-react';

// Ctrl+K: busca cualquier pantalla del menú y la abre sin recorrer las secciones.
export interface OpcionPaleta { key: string; label: string; seccion: string; to?: string; clasico?: string; icon?: LucideIcon }

interface Props {
  opciones: OpcionPaleta[];
  favoritos: string[];
  onToggleFavorito: (key: string) => void;
  onElegir: (o: OpcionPaleta) => void;
  onCerrar: () => void;
}

export function PaletaComandos({ opciones, favoritos, onToggleFavorito, onElegir, onCerrar }: Props) {
  const [texto, setTexto] = useState('');
  const [activo, setActivo] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => { entrada.current?.focus(); }, []);

  const filtradas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    const lista = t ? opciones.filter(o => `${o.label} ${o.seccion}`.toLowerCase().includes(t)) : opciones;
    // Los favoritos primero
    return [...lista].sort((a, b) => Number(favoritos.includes(b.key)) - Number(favoritos.includes(a.key)));
  }, [texto, opciones, favoritos]);

  useEffect(() => { setActivo(0); }, [texto]);

  function teclado(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onCerrar(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(i => Math.min(i + 1, filtradas.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtradas[activo]) { onElegir(filtradas[activo]); }
  }

  return (
    <div role="dialog" aria-label="Buscar pantallas" onMouseDown={e => { if (e.target === e.currentTarget) onCerrar(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.28)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '12vh' }}>
      <div style={{ width: 'min(580px, 92vw)', background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 18, boxShadow: '0 24px 60px rgba(15,23,42,0.25)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--separator)' }}>
          <Search size={18} aria-hidden style={{ color: 'var(--label-2)' }} />
          <input ref={entrada} value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={teclado}
            placeholder="Ir a una pantalla… (vales de hoy, matriz, nueva OT)" aria-label="Buscar pantalla"
            style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', fontSize: '1rem', color: 'var(--label)' }} />
          <kbd style={{ fontSize: '0.6875rem', color: 'var(--label-2)', border: '1px solid var(--separator)', borderRadius: 6, padding: '2px 6px' }}>Esc</kbd>
        </div>
        <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: 6 }}>
          {filtradas.length === 0 && <p style={{ padding: 16, color: 'var(--label-2)', margin: 0 }}>Ninguna pantalla coincide.</p>}
          {filtradas.map((o, i) => (
            <div key={o.key} onMouseEnter={() => setActivo(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', background: i === activo ? 'var(--fill-2)' : 'transparent' }}
              onClick={() => onElegir(o)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--label)' }}>{o.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{o.seccion}</div>
              </div>
              <button type="button" aria-label={favoritos.includes(o.key) ? `Quitar ${o.label} de favoritos` : `Agregar ${o.label} a favoritos`}
                onClick={e => { e.stopPropagation(); onToggleFavorito(o.key); }}
                style={{ background: 'none', border: 0, padding: 4, cursor: 'pointer', color: favoritos.includes(o.key) ? 'var(--amber-ink)' : 'var(--label-3)' }}>
                <Star size={16} fill={favoritos.includes(o.key) ? 'currentColor' : 'none'} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
