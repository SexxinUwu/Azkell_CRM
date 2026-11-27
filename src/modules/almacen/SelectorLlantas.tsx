import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { CircleAlert, Search, X } from 'lucide-react';
import { api } from '../../core/api/client';
import './selectorLlantas.css';

/** Una llanta que almacén puede entregar: ya tiene código de fuego, está en un almacén de uso y no está asignada a otra solicitud */
export interface LlantaDisponible {
  id_neumatico: string;
  codigo: string;
  serie: string | null;
  vida: string;
  remanente_actual: number | string | null;
  almacen_id: number | null;
  marca: string | null;
  modelo: string | null;
  medida: string | null;
}
export interface LlantasDisponibles {
  ok?: boolean;
  /** El artículo es una llanta (familia NEUMATICOS con medida): se entrega por código de fuego */
  es_llanta: boolean;
  llantas: LlantaDisponible[];
  /** Llantas de ese artículo que todavía no tienen código de fuego (no se pueden despachar) */
  sin_codigo: number;
}

const NOMBRE_ALMACEN: Record<number, string> = { 100: 'Nuevas', 1142: 'Reencauche', 1144: 'Reparadas', 1146: 'Retén' };

const consulta = (id: string, habilitado: boolean) => ({
  queryKey: ['almacen', 'llantas-disp', id],
  enabled: habilitado,
  staleTime: 10_000,
  queryFn: () => api<LlantasDisponibles>(`/almacen/llantas-disponibles/${encodeURIComponent(id)}`),
});

/** Candidatas de varios artículos a la vez (las líneas de una salida) */
export function useLlantasDeArticulos(ids: string[], habilitado: boolean): Map<string, LlantasDisponibles> {
  const res = useQueries({ queries: ids.map(id => consulta(id, habilitado)) });
  return useMemo(() => {
    const m = new Map<string, LlantasDisponibles>();
    ids.forEach((id, i) => { const d = res[i]?.data; if (d) m.set(id, d); });
    return m;
  }, [ids, res]);
}

export function useLlantasDeArticulo(id: string, habilitado: boolean) {
  return useQuery(consulta(id, habilitado));
}

/**
 * Elegir los códigos de fuego de las llantas que se entregan en una línea: se escribe o escanea el código (Enter)
 * o se toca de la lista. Solo ofrece llantas con código de fuego, de ese artículo y sin asignar.
 */
export function SelectorLlantas({ datos, cantidad, valor, onChange }: {
  datos: LlantasDisponibles;
  cantidad: number;
  valor: string[];
  onChange: (codigos: string[]) => void;
}) {
  const [buscar, setBuscar] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const elegidas = new Set(valor.map(c => c.toUpperCase()));
  const libres = datos.llantas.filter(l => !elegidas.has(l.codigo.toUpperCase()));
  const q = buscar.trim().toUpperCase();
  const lista = q ? libres.filter(l => [l.codigo, l.serie ?? '', l.modelo ?? ''].some(x => x.toUpperCase().includes(q))) : libres;
  const completo = valor.length >= cantidad;

  function agregar(codigo: string) {
    if (valor.length >= cantidad) { setAviso(`Ya elegiste los ${cantidad} códigos que pide la línea.`); return; }
    setAviso(null); setBuscar(''); onChange([...valor, codigo]);
  }
  function entrada() {
    if (!q) return;
    const exacta = libres.find(l => l.codigo.toUpperCase() === q);
    if (exacta) return agregar(exacta.codigo);
    if (elegidas.has(q)) { setAviso(`${q} ya está elegida.`); return; }
    setAviso(datos.llantas.some(l => l.codigo.toUpperCase() === q) ? `${q} ya está elegida.` : `${q} no está disponible para este artículo (no existe, no tiene código de fuego o está asignada a otra solicitud).`);
  }

  return (
    <div className="sll">
      <p className="sll__cab"><b>Códigos de fuego</b> <span className={completo ? 'sll__ok' : ''}>{valor.length} de {cantidad}</span></p>
      {valor.length > 0 && (
        <ul className="sll__elegidas">
          {valor.map(c => (
            <li key={c}><span className="mono">{c}</span>
              <button type="button" aria-label={`Quitar ${c}`} onClick={() => onChange(valor.filter(x => x !== c))}><X size={12} /></button>
            </li>
          ))}
        </ul>
      )}
      {!datos.llantas.length ? (
        <p className="sll__falta" role="alert"><CircleAlert size={14} /> No hay llantas con código de fuego para este artículo.
          {datos.sin_codigo > 0 ? ` Hay ${datos.sin_codigo} sin código: asígnales el código en Neumáticos para poder despacharlas.` : ' Revisa que estén recepcionadas y con su código.'}</p>
      ) : !completo && (
        <>
          <form className="sll__buscar" onSubmit={e => { e.preventDefault(); entrada(); }}>
            <Search size={14} aria-hidden />
            <input className="input" value={buscar} onChange={e => { setBuscar(e.target.value); setAviso(null); }} placeholder="Escribe o escanea el código de fuego" autoCapitalize="characters" autoCorrect="off" />
          </form>
          <ul className="sll__lista">
            {lista.slice(0, 40).map(l => (
              <li key={l.codigo}>
                <button type="button" onClick={() => agregar(l.codigo)}>
                  <span className="mono sll__codigo">{l.codigo}</span>
                  <span className="sll__dato">{l.vida}{l.remanente_actual != null && Number(l.remanente_actual) > 0 ? ` · ${Number(l.remanente_actual).toFixed(1)} mm` : ''}{l.almacen_id ? ` · ${NOMBRE_ALMACEN[l.almacen_id] ?? l.almacen_id}` : ''}</span>
                </button>
              </li>
            ))}
            {lista.length === 0 && <li className="sll__vacio">Ninguna coincide.</li>}
            {lista.length > 40 && <li className="sll__vacio">Mostrando 40 de {lista.length}: escribe para filtrar.</li>}
          </ul>
          {datos.sin_codigo > 0 && <p className="sll__nota">Hay {datos.sin_codigo} llanta{datos.sin_codigo === 1 ? '' : 's'} más de este artículo sin código de fuego: no se pueden despachar hasta asignarles el código en Neumáticos.</p>}
        </>
      )}
      {aviso && <p className="sll__aviso" role="status"><CircleAlert size={13} /> {aviso}</p>}
    </div>
  );
}
