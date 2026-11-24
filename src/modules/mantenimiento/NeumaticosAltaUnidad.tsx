import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../../core/api/client';
import { Button } from '../../core/ui/Button';
import { Combobox } from '../../core/ui/Combobox';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';

// Alta de llantas que llegan montadas en una unidad nueva (sin orden de compra).
// POST /api/neumaticos/alta-unidad-nueva: crea cada llanta ya instalada en su posición, con código de fuego.

interface Grupo { uso: string; posiciones: string; marca: string; modelo: string; medida: string; remanente: string }

const GRUPO_VACIO = (uso: string, posiciones: string): Grupo => ({ uso, posiciones, marca: '', modelo: '', medida: '', remanente: '' });

const separar = (t: string) => t.split(/[\s,;]+/).map(p => p.trim().toUpperCase()).filter(Boolean);

export function AltaUnidadNuevaSheet({ open, onClose, onHecho }: { open: boolean; onClose: () => void; onHecho: (resumen: string) => void }) {
  const [placa, setPlaca] = useState<string | null>(null);
  const [km, setKm] = useState('0');
  const [grupos, setGrupos] = useState<Grupo[]>([GRUPO_VACIO('Delanteras', '1, 2'), GRUPO_VACIO('Tracción', '3, 4, 5, 6')]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hechas, setHechas] = useState<string[]>([]);

  const placas = useQuery({
    queryKey: ['mant', 'neumaticos', 'placas-alta'],
    enabled: open,
    queryFn: async () => (await api<{ data: { placa: string; cliente: string | null; marca: string | null }[] }>('/neumaticos/placas')).data,
  });

  const cambiar = (i: number, campo: keyof Grupo, v: string) => setGrupos(g => g.map((x, k) => (k === i ? { ...x, [campo]: v } : x)));

  const llantas = grupos.flatMap(g => separar(g.posiciones).map(p => ({
    posicion: p, marca: g.marca.trim(), modelo: g.modelo.trim(), medida: g.medida.trim(), remanente: Number(g.remanente.replace(',', '.')),
  })));
  const repetidas = new Set(llantas.map(l => l.posicion)).size !== llantas.length;
  const completo = !!placa && llantas.length > 0 && !repetidas
    && llantas.every(l => l.marca && l.medida && Number.isFinite(l.remanente) && l.remanente > 0);

  async function guardar() {
    if (!placa) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string; data: { llantas: { posicion: string; codigo: string | null }[] } }>(
        '/neumaticos/alta-unidad-nueva', { method: 'POST', body: { placa, km: Number(km) || 0, generar_codigo: true, llantas } });
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo dar de alta');
      setHechas(h => [...h, `${placa} (${r.data.llantas.length})`]);
      onHecho(`${placa}: ${r.data.llantas.length} llantas dadas de alta e instaladas`);
      setPlaca(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => { if (!guardando) onClose(); }} title="Alta de llantas de unidad nueva"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cerrar</Button>
          <Button variant="primary" loading={guardando} disabled={!completo} onClick={guardar}>
            Dar de alta {llantas.length} {llantas.length === 1 ? 'llanta' : 'llantas'}
          </Button>
        </>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <p className="nl-conteo">Las llantas se crean ya montadas en la unidad, con su código de fuego y sin costo de compra. Al terminar una unidad, elige la siguiente: los datos se conservan.</p>
        {hechas.length > 0 && <Notice tone="success">Listas: {hechas.join(' · ')}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {repetidas && <Notice tone="error">Hay posiciones repetidas entre los grupos.</Notice>}
        <Field label="Unidad (placa)">
          {p => (
            <Combobox {...p} value={placa} onChange={setPlaca} loading={placas.isLoading} placeholder="Busca la placa"
              options={(placas.data ?? []).map(x => ({ value: x.placa, label: [x.placa, x.marca].filter(Boolean).join(' · ') }))} />
          )}
        </Field>
        <Field label="Kilometraje de la unidad" hint="Normalmente 0 en una unidad nueva">
          {p => <TextInput {...p} inputMode="numeric" value={km} onChange={e => setKm(e.target.value.replace(/\D/g, ''))} />}
        </Field>
        {grupos.map((g, i) => (
          <fieldset key={g.uso} style={{ border: '1px solid var(--separator)', borderRadius: 12, padding: 'var(--s-3)', display: 'grid', gap: 'var(--s-2)' }}>
            <legend className="t-footnote c-secondary" style={{ padding: '0 6px' }}>{g.uso} · {separar(g.posiciones).length} llantas</legend>
            <Field label="Posiciones" hint="Separadas por coma">
              {p => <TextInput {...p} value={g.posiciones} onChange={e => cambiar(i, 'posiciones', e.target.value)} />}
            </Field>
            <Field label="Marca">{p => <TextInput {...p} value={g.marca} onChange={e => cambiar(i, 'marca', e.target.value)} placeholder="MICHELIN" />}</Field>
            <Field label="Modelo">{p => <TextInput {...p} value={g.modelo} onChange={e => cambiar(i, 'modelo', e.target.value)} placeholder="X WORKS Z" />}</Field>
            <Field label="Medida">{p => <TextInput {...p} value={g.medida} onChange={e => cambiar(i, 'medida', e.target.value)} placeholder="295/80R22.5" />}</Field>
            <Field label="Remanente (mm)">{p => <TextInput {...p} inputMode="decimal" value={g.remanente} onChange={e => cambiar(i, 'remanente', e.target.value)} />}</Field>
          </fieldset>
        ))}
      </div>
    </Sheet>
  );
}
