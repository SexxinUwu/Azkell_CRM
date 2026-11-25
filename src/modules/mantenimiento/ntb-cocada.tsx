import { RemanenteChip } from './ntb-llanta';
import { useFicha } from './NeumaticoHojaVida';

/** Cocada de la llanta seleccionada: con cuánto ingresó y con cuánto se montó (para el panel «Detalles de neumático») */
export function CocadaPanel({ codigo }: { codigo: string }) {
  const q = useFicha(codigo);
  const c = q.data?.cocada;
  if (!c) return null;
  const ultimo = c.montajes.length ? c.montajes[c.montajes.length - 1] : null;
  const alMontar = ultimo?.alMontar ?? null;
  const dia = (f: string | null | undefined) => (f ? f.slice(0, 10).split('-').reverse().join('/') : '');
  return (
    <>
      <div><dt>Cocada al ingresar</dt><dd><RemanenteChip mm={c.inicial} /></dd></div>
      <div><dt>Cocada al montar</dt><dd><RemanenteChip mm={alMontar?.minimo ?? null} />{alMontar ? <small className="ntb-det__nota"> {dia(alMontar.fecha)}</small> : null}</dd></div>
    </>
  );
}
