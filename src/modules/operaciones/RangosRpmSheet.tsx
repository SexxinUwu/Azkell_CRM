import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Sheet } from '../../core/ui/Sheet';
import { BotonTip } from '../../core/ui/BotonTip';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

interface RangosResp {
  ok: boolean; origen: 'tabla' | 'base';
  meta: { bajo: number; verde: number; potencia: number; sobre: number };
  generico: number[];
  data: Array<{ modelo: string; limites: number[]; placas: number }>;
  sin_rangos: Array<{ modelo: string; placas: number }>;
}

const TITULOS = ['Ralentí hasta', 'Bajo torque hasta', 'Zona verde hasta', 'Potencia hasta'];
const aNum = (v: string) => (v.trim() === '' ? NaN : Number(v));
const crecientes = (l: number[]) => l.length === 4 && l.every(v => Number.isInteger(v) && v > 0 && v <= 6000 && v % 10 === 0) && l[0] < l[1] && l[1] < l[2] && l[2] < l[3];

/** Fila editable de un modelo: cuatro límites; se guarda sola al pulsar Guardar cuando hay cambios válidos */
function FilaModelo({ modelo, inicial, placas, puedeEditar, onGuardar, onQuitar, ocupado }: {
  modelo: string; inicial: number[]; placas: number; puedeEditar: boolean; ocupado: boolean;
  onGuardar: (modelo: string, limites: number[]) => void; onQuitar: (modelo: string) => void;
}) {
  const [v, setV] = useState(inicial.map(String));
  useEffect(() => { setV(inicial.map(String)); }, [inicial.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const nums = v.map(aNum);
  const cambio = nums.some((n, i) => n !== inicial[i]);
  const valido = crecientes(nums);
  return (
    <tr>
      <td className="rpm-rangos__modelo">{modelo}{placas > 0 && <small>{placas} {placas === 1 ? 'placa' : 'placas'}</small>}</td>
      {v.map((x, i) => (
        <td key={i}><input className="rpm-rangos__in" type="number" inputMode="numeric" min={10} max={6000} step={10} value={x} disabled={!puedeEditar} aria-label={`${modelo}: ${TITULOS[i]}`}
          onChange={e => setV(prev => prev.map((p, k) => (k === i ? e.target.value : p)))} /></td>
      ))}
      <td className="rpm-rangos__acc">
        {puedeEditar && (
          <>
            <Button size="sm" variant={cambio && valido ? 'primary' : 'secondary'} disabled={!cambio || !valido || ocupado} onClick={() => onGuardar(modelo, nums)}>Guardar</Button>
            <BotonTip tip="Quitar modelo" className="btn btn--plain btn--icono" onClick={() => onQuitar(modelo)} disabled={ocupado}><Trash2 size={16} /></BotonTip>
          </>
        )}
      </td>
    </tr>
  );
}

// Operaciones Marsisa › Conducción por RPM › rangos por modelo de motor y meta (editables, se guardan en la base)
export function RangosRpmSheet({ open, onClose, puedeEditar }: { open: boolean; onClose: () => void; puedeEditar: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['conduccion-rpm', 'rangos'], enabled: open, queryFn: () => api<RangosResp>('/operaciones/conduccion-rpm/rangos') });
  const d = q.data;

  const [meta, setMeta] = useState({ bajo: '20', verde: '60', potencia: '20', sobre: '0' });
  const [generico, setGenerico] = useState(['800', '1150', '1400', '1900']);
  const [nuevo, setNuevo] = useState({ modelo: '', l: ['', '', '', ''] });
  useEffect(() => {
    if (!d) return;
    setMeta({ bajo: String(d.meta.bajo), verde: String(d.meta.verde), potencia: String(d.meta.potencia), sobre: String(d.meta.sobre) });
    setGenerico(d.generico.map(String));
  }, [d?.meta.bajo, d?.meta.verde, d?.meta.potencia, d?.meta.sobre, d?.generico.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const refrescar = () => { void qc.invalidateQueries({ queryKey: ['conduccion-rpm'] }); };
  const guardarModelo = useMutation({
    mutationFn: (x: { modelo: string; limites: number[] }) => api(`/operaciones/conduccion-rpm/rangos/${encodeURIComponent(x.modelo)}`, { method: 'PUT', body: { limites: x.limites } }),
    onSuccess: () => { haptic('success'); toast('Rangos guardados'); refrescar(); },
    onError: e => toast(errorMessage(e), 'error'),
  });
  const quitarModelo = useMutation({
    mutationFn: (modelo: string) => api(`/operaciones/conduccion-rpm/rangos/${encodeURIComponent(modelo)}`, { method: 'DELETE' }),
    onSuccess: () => { toast('Modelo quitado'); refrescar(); },
    onError: e => toast(errorMessage(e), 'error'),
  });
  const guardarConfig = useMutation({
    mutationFn: () => api('/operaciones/conduccion-rpm/config', { method: 'PUT', body: { meta: { bajo: aNum(meta.bajo), verde: aNum(meta.verde), potencia: aNum(meta.potencia), sobre: aNum(meta.sobre) }, generico: generico.map(aNum) } }),
    onSuccess: () => { haptic('success'); toast('Meta y rangos generales guardados'); refrescar(); },
    onError: e => toast(errorMessage(e), 'error'),
  });

  const suma = aNum(meta.bajo) + aNum(meta.verde) + aNum(meta.potencia);
  const metaOk = Math.round(suma) === 100 && [meta.bajo, meta.verde, meta.potencia, meta.sobre].every(x => Number.isFinite(aNum(x)) && aNum(x) >= 0 && aNum(x) <= 100) && crecientes(generico.map(aNum));
  const ocupado = guardarModelo.isPending || quitarModelo.isPending;
  const nuevoNums = nuevo.l.map(aNum);
  const nuevoOk = nuevo.modelo.trim().length > 0 && crecientes(nuevoNums);

  return (
    <Sheet open={open} onClose={onClose} title="Rangos de RPM por motor" ancho>
      <div className="rpm-rangos">
        <p className="rpm-rangos__nota">Lo que se edite aquí es lo que usa el sistema (esta pantalla y el Análisis de combustible). Los límites van de 10 en 10 RPM. Cada modelo se reparte así: ralentí hasta el primer límite, luego bajo torque, zona verde (económico), potencia y, por encima del último, sobrerrevolución.</p>
        {q.isError && <Notice tone="error">{errorMessage(q.error)}</Notice>}
        {d?.origen === 'base' && <Notice tone="accent">Todavía no se aplicó la actualización de la base de datos: se muestran los rangos de respaldo y no se pueden guardar cambios.</Notice>}
        {d && d.sin_rangos.length > 0 && (
          <Notice tone="accent">
            Motores de la flota sin rangos propios (usan los generales):{' '}
            {d.sin_rangos.map(s => (
              <button key={s.modelo} type="button" className="rpm-rangos__chip" disabled={!puedeEditar} onClick={() => setNuevo({ modelo: s.modelo, l: [...generico] })}>{s.modelo} ({s.placas})</button>
            ))}
          </Notice>
        )}

        <h3 className="rpm-rangos__titulo">Meta de reparto y rangos generales</h3>
        <div className="rpm-rangos__meta">
          {([['bajo', 'Bajo torque %'], ['verde', 'Zona verde %'], ['potencia', 'Potencia %'], ['sobre', 'Sobrerrevolución %']] as const).map(([k, t]) => (
            <label key={k}><span>{t}</span><input className="rpm-rangos__in" type="number" min={0} max={100} value={meta[k]} disabled={!puedeEditar} onChange={e => setMeta(m => ({ ...m, [k]: e.target.value }))} /></label>
          ))}
          <small className={Math.round(suma) === 100 ? '' : 'rpm-rangos__mal'}>Bajo torque + zona verde + potencia = {Number.isFinite(suma) ? suma : '—'} % (debe sumar 100)</small>
        </div>
        <div className="rpm-rangos__meta">
          {TITULOS.map((t, i) => (
            <label key={t}><span>Generales: {t.toLowerCase()}</span><input className="rpm-rangos__in" type="number" min={10} max={6000} step={10} value={generico[i]} disabled={!puedeEditar}
              onChange={e => setGenerico(g => g.map((x, k) => (k === i ? e.target.value : x)))} /></label>
          ))}
          <small>Se usan con las placas que no tienen modelo de motor o cuyo modelo no está en la tabla.</small>
        </div>
        {puedeEditar && <Button variant="primary" disabled={!metaOk || guardarConfig.isPending} loading={guardarConfig.isPending} onClick={() => guardarConfig.mutate()}>Guardar meta y rangos generales</Button>}

        <h3 className="rpm-rangos__titulo">Rangos por modelo de motor</h3>
        <div className="rpm-rangos__tabla">
          <table>
            <thead><tr><th>Modelo</th>{TITULOS.map(t => <th key={t}>{t}</th>)}<th /></tr></thead>
            <tbody>
              {(d?.data ?? []).map(r => (
                <FilaModelo key={r.modelo} modelo={r.modelo} inicial={r.limites} placas={r.placas} puedeEditar={puedeEditar && d?.origen === 'tabla'} ocupado={ocupado}
                  onGuardar={(m, l) => guardarModelo.mutate({ modelo: m, limites: l })} onQuitar={m => quitarModelo.mutate(m)} />
              ))}
              {puedeEditar && d?.origen === 'tabla' && (
                <tr className="rpm-rangos__nuevo">
                  <td><input className="rpm-rangos__in rpm-rangos__in--txt" placeholder="Modelo nuevo" value={nuevo.modelo} onChange={e => setNuevo(n => ({ ...n, modelo: e.target.value }))} aria-label="Modelo nuevo" /></td>
                  {nuevo.l.map((x, i) => (
                    <td key={i}><input className="rpm-rangos__in" type="number" min={10} max={6000} step={10} value={x} aria-label={`Modelo nuevo: ${TITULOS[i]}`} onChange={e => setNuevo(n => ({ ...n, l: n.l.map((p, k) => (k === i ? e.target.value : p)) }))} /></td>
                  ))}
                  <td className="rpm-rangos__acc"><Button size="sm" variant="secondary" icon={<Plus size={14} />} disabled={!nuevoOk || ocupado}
                    onClick={() => guardarModelo.mutate({ modelo: nuevo.modelo.trim(), limites: nuevoNums }, { onSuccess: () => setNuevo({ modelo: '', l: ['', '', '', ''] }) })}>Agregar</Button></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Sheet>
  );
}
