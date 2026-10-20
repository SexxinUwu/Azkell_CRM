import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { haptic } from '../../core/lib/haptics';

// Qué placas se ven en Documentos de flota. Por defecto todas; con un configurador se elige solo un sector.
// La elección se guarda en este dispositivo (no cambia lo que ven otras personas).
const CLAVE = 'fleet_docs_placas_visibles';

/** null = todas las placas */
export function leerSeleccion(): Set<string> | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
    return Array.isArray(v) ? new Set(v.map(String)) : null;
  } catch { return null; }
}
export function guardarSeleccion(s: Set<string> | null) {
  try { if (s === null) localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, JSON.stringify([...s])); } catch { /* sin almacenamiento */ }
}

interface Opcion { placa: string; detalle: string }

export function ConfigurarPlacasSheet({ open, onClose, opciones, seleccion, onAplicar }: {
  open: boolean; onClose: () => void; opciones: Opcion[]; seleccion: Set<string> | null; onAplicar: (s: Set<string> | null) => void;
}) {
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');

  useEffect(() => {
    if (open) { setMarcadas(seleccion ? new Set(seleccion) : new Set(opciones.map(o => o.placa))); setQ(''); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(() => {
    const t = q.trim().toUpperCase();
    return t ? opciones.filter(o => o.placa.includes(t) || o.detalle.toUpperCase().includes(t)) : opciones;
  }, [opciones, q]);

  const cambiar = (placas: string[], marcar: boolean) => setMarcadas(prev => {
    const s = new Set(prev);
    placas.forEach(p => (marcar ? s.add(p) : s.delete(p)));
    return s;
  });
  const todas = marcadas.size === opciones.length;

  return (
    <Sheet open={open} onClose={onClose} title="Placas a mostrar"
      footer={<>
        <Button variant="secondary" onClick={() => { haptic('selection'); onAplicar(null); onClose(); }}>Ver todas</Button>
        <Button variant="primary" disabled={!marcadas.size}
          onClick={() => { haptic('success'); onAplicar(todas ? null : marcadas); onClose(); }}>
          {todas ? 'Aplicar (todas)' : `Aplicar (${marcadas.size})`}
        </Button>
      </>}>
      <div className="doc-conf">
        <input className="doc-conf__buscar" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar placa, tipo o empresa…" aria-label="Buscar placa" />
        <div className="doc-conf__acciones">
          <button type="button" onClick={() => cambiar(visibles.map(o => o.placa), true)}>Marcar {q ? 'las visibles' : 'todas'}</button>
          <button type="button" onClick={() => cambiar(visibles.map(o => o.placa), false)}>Quitar {q ? 'las visibles' : 'todas'}</button>
          <span>{marcadas.size} de {opciones.length}</span>
        </div>
        <div className="doc-conf__lista" role="group" aria-label="Placas">
          {visibles.map(o => (
            <label key={o.placa} className="doc-conf__fila">
              <input type="checkbox" checked={marcadas.has(o.placa)} onChange={e => cambiar([o.placa], e.target.checked)} />
              <b>{o.placa}</b><span>{o.detalle}</span>
            </label>
          ))}
          {!visibles.length && <p className="c-secondary" style={{ padding: 'var(--s-3)' }}>No hay placas con ese texto.</p>}
        </div>
        <p className="c-secondary" style={{ fontSize: '0.8125rem', margin: 0 }}>
          La elección vale para Expediente, Matriz y Calendario, y queda guardada en este dispositivo. Las placas nuevas aparecen solo si eliges «Ver todas».
        </p>
      </div>
    </Sheet>
  );
}
