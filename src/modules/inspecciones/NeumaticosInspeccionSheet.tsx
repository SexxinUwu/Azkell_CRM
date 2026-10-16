import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { clavePlaca, useInspeccionesNeumaticos } from './api';
import './inspecciones.css';

// Inspección de neumáticos (versión React). Parte de la última inspección de la placa
// (GET /neumaticos/placa-ultima) y guarda con el mismo formato que la versión actual (POST /neumaticos/inspecciones).
// Pendiente frente a la versión actual: rotaciones entre posiciones, diagrama de la configuración y fotos.

interface PosicionUltima {
  marca?: string; medida?: string; modelo?: string;
  r1?: number | string | null; r2?: number | string | null; r3?: number | string | null; r4?: number | string | null;
  presion_actual?: number | string | null;
}
interface PlacaUltima { ok?: boolean; configuracion?: string; datosPosiciones?: Record<string, PosicionUltima> }

interface Llanta { posicion: string; marca: string; medida: string; modelo: string; r1: string; r2: string; r3: string; r4: string; presion: string; observacion: string }

const MS_DIA = 86_400_000;
const texto = (v: unknown) => (v === null || v === undefined || v === 0 || v === '0' ? '' : String(v));
const numero = (v: string) => Number(String(v).replace(',', '.')) || 0;
const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
/** Fecha con formato dd/mm/aaaa, como se muestra en la versión actual */
export const fechaDMY = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

function llantasDesde(datos: Record<string, PosicionUltima>): Llanta[] {
  return Object.entries(datos)
    .sort(([a], [b]) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b))
    .map(([pos, d]) => ({
      posicion: pos, marca: texto(d.marca), medida: texto(d.medida), modelo: texto(d.modelo),
      r1: texto(d.r1), r2: texto(d.r2), r3: texto(d.r3), r4: texto(d.r4), presion: texto(d.presion_actual), observacion: '',
    }));
}

export function NeumaticosInspeccionSheet({ placa, usuario, onClose }: { placa: string | null; usuario: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const neu = useInspeccionesNeumaticos();
  const ultima = useQuery<PlacaUltima>({
    queryKey: ['inspecciones', 'neumaticos-placa', placa],
    enabled: !!placa,
    queryFn: () => api<PlacaUltima>(`/neumaticos/placa-ultima/${encodeURIComponent(placa ?? '')}`),
    staleTime: 0,
  });

  const [fecha, setFecha] = useState(hoyISO());
  const [km, setKm] = useState('');
  const [dias, setDias] = useState('30');
  const [obs, setObs] = useState('');
  const [llantas, setLlantas] = useState<Llanta[]>([]);
  const [nuevaPos, setNuevaPos] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrir una placa: se precargan sus posiciones con la última inspección
  useEffect(() => {
    if (!placa) return;
    setFecha(hoyISO()); setKm(''); setDias('30'); setObs(''); setError(null); setNuevaPos('');
  }, [placa]);
  useEffect(() => {
    if (ultima.data) setLlantas(llantasDesde(ultima.data.datosPosiciones ?? {}));
  }, [ultima.data]);

  // Última inspección de neumáticos de la placa (la más reciente)
  const ultimaFecha = useMemo(() => {
    const fechas = (neu.data ?? [])
      .filter(i => placa && clavePlaca(i.placa) === clavePlaca(placa))
      .map(i => i.fecha).filter((f): f is Date => !!f);
    return fechas.length ? new Date(Math.max(...fechas.map(f => f.getTime()))) : null;
  }, [neu.data, placa]);

  const hace = useMemo(() => {
    if (!ultimaFecha) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const f = new Date(ultimaFecha); f.setHours(0, 0, 0, 0);
    return Math.round((hoy.getTime() - f.getTime()) / MS_DIA);
  }, [ultimaFecha]);

  const set = (i: number, k: keyof Llanta, v: string) => setLlantas(ls => ls.map((l, n) => (n === i ? { ...l, [k]: v } : l)));
  const quitar = (i: number) => setLlantas(ls => ls.filter((_, n) => n !== i));
  const agregar = () => {
    const pos = nuevaPos.trim().toUpperCase();
    if (!pos) return;
    if (llantas.some(l => l.posicion.toUpperCase() === pos)) { setError(`La posición ${pos} ya está en la lista.`); return; }
    setLlantas(ls => [...ls, { posicion: pos, marca: '', medida: '', modelo: '', r1: '', r2: '', r3: '', r4: '', presion: '', observacion: '' }]);
    setNuevaPos(''); setError(null);
  };

  const medidas = (l: Llanta) => [l.r1, l.r2, l.r3, l.r4].some(v => numero(v) > 0);

  async function guardar() {
    if (!placa) return;
    const items = llantas.filter(medidas).map(l => ({
      posicion: l.posicion.toUpperCase(), marca: l.marca.trim(), medida: l.medida.trim(), modelo: l.modelo.trim(),
      r1: numero(l.r1), r2: numero(l.r2), r3: numero(l.r3), r4: numero(l.r4),
      presion_actual: numero(l.presion), observaciones: l.observacion.trim(),
    }));
    if (!fecha) { setError('Indica la fecha de la inspección.'); return; }
    if (items.length === 0) { setError('Mide al menos una llanta (R1 a R3 o R4) antes de guardar.'); return; }
    setEnviando(true); setError(null);
    try {
      const body = {
        id_ot: null, vehiculo_placa: placa, placa, configuracion: ultima.data?.configuracion ?? '',
        dias_propuestos: String(numero(dias) || 30), odometro_km: String(numero(km)), observaciones_generales: obs.trim(),
        fecha_inspeccion: fecha, inspector: usuario, items, llantas_inspeccionadas: items,
      };
      const r = await api<{ ok?: boolean; error?: string }>('/neumaticos/inspecciones', { method: 'POST', body });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar la inspección');
      haptic('success');
      toast(`Inspección de neumáticos guardada · ${placa}`);
      await qc.invalidateQueries({ queryKey: ['inspecciones'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const cargando = ultima.isLoading || neu.isLoading;

  return (
    <Sheet open={!!placa} onClose={() => !enviando && onClose()} anclaAbajo title={`Neumáticos · ${placa ?? ''}`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar inspección</Button>
      </>}>
      {cargando ? <PageLoader /> : (
        <div className="insp-neu">
          {/* Alerta de la última inspección: si fue hace una semana o menos, se avisa con la fecha */}
          {ultimaFecha && hace !== null && hace <= 7 ? (
            <Notice tone="error" icon={<CircleAlert size={16} />}>
              Esta unidad fue inspeccionada el <strong>{fechaDMY(ultimaFecha)}</strong>
              {hace === 0 ? ' (hoy)' : hace === 1 ? ' (hace 1 día)' : ` (hace ${hace} días)`}. Revisa antes de registrar otra.
            </Notice>
          ) : ultimaFecha && hace !== null ? (
            <Notice tone="neutral">Última inspección de neumáticos: <strong>{fechaDMY(ultimaFecha)}</strong> (hace {hace} días).</Notice>
          ) : (
            <Notice tone="neutral">Esta unidad no tiene inspecciones de neumáticos registradas.</Notice>
          )}

          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

          <div className="form-grid">
            <Field label="Fecha de inspección">{p => <TextInput {...p} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />}</Field>
            <Field label="Kilometraje">{p => <TextInput {...p} inputMode="numeric" value={km} onChange={e => setKm(e.target.value.replace(/\D/g, ''))} />}</Field>
            <Field label="Días propuestos">{p => <TextInput {...p} inputMode="numeric" value={dias} onChange={e => setDias(e.target.value.replace(/\D/g, ''))} />}</Field>
            <Field label="Configuración">{p => <TextInput {...p} value={ultima.data?.configuracion ?? ''} disabled />}</Field>
          </div>

          <div>
            <p className="tarjeta__grupo-titulo">Llantas ({llantas.length})</p>
            <div className="insp-neu__llantas">
              {llantas.length === 0 && <p className="t-footnote c-secondary">Sin posiciones. Agrega una llanta abajo.</p>}
              {llantas.map((l, i) => (
                <div key={`${l.posicion}-${i}`} className="insp-neu__llanta">
                  <div className="insp-neu__llanta-cab">
                    <span className="insp-neu__pos">Pos. {l.posicion}</span>
                    <button type="button" className="insp-neu__quitar pressable" onClick={() => quitar(i)} aria-label={`Quitar posición ${l.posicion}`}><Trash2 size={15} /></button>
                  </div>
                  <div className="insp-neu__medidas">
                    <Field label="Marca">{p => <TextInput {...p} value={l.marca} onChange={e => set(i, 'marca', e.target.value)} />}</Field>
                    <Field label="Medida">{p => <TextInput {...p} value={l.medida} onChange={e => set(i, 'medida', e.target.value)} />}</Field>
                    <Field label="R1 (mm)">{p => <TextInput {...p} inputMode="decimal" value={l.r1} onChange={e => set(i, 'r1', e.target.value)} />}</Field>
                    <Field label="R2 (mm)">{p => <TextInput {...p} inputMode="decimal" value={l.r2} onChange={e => set(i, 'r2', e.target.value)} />}</Field>
                    <Field label="R3 (mm)">{p => <TextInput {...p} inputMode="decimal" value={l.r3} onChange={e => set(i, 'r3', e.target.value)} />}</Field>
                    <Field label="R4 (mm)">{p => <TextInput {...p} inputMode="decimal" value={l.r4} onChange={e => set(i, 'r4', e.target.value)} />}</Field>
                    <Field label="Presión (PSI)">{p => <TextInput {...p} inputMode="numeric" value={l.presion} onChange={e => set(i, 'presion', e.target.value)} />}</Field>
                  </div>
                </div>
              ))}
            </div>
            <div className="insp-neu__agregar">
              <TextInput value={nuevaPos} onChange={e => setNuevaPos(e.target.value)} placeholder="Posición (ej. 1, 2, 3…)" aria-label="Posición nueva" />
              <Button variant="secondary" icon={<Plus size={15} />} onClick={agregar} disabled={!nuevaPos.trim()}>Agregar llanta</Button>
            </div>
          </div>

          <Field label="Observaciones generales" wide>{p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} />}</Field>
        </div>
      )}
    </Sheet>
  );
}
