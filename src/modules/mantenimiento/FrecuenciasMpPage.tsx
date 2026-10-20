import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Pencil, Plus, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';

// Mantenimiento › Frecuencias MP: cada tipo de mantenimiento preventivo con su frecuencia por marca y modelo
interface TipoMp {
  id: number; marca: string; modelo: string | null; tipo_mp: string; tipo: string | null; sistema: string | null;
  uts: string | null; combustible: string | null; frecuencia_km: number | null; frecuencia_horas: number | null; frecuencia_dias: number | null;
  descripcion: string | null;
}
type Borrador = Partial<Omit<TipoMp, 'id' | 'frecuencia_km' | 'frecuencia_horas' | 'frecuencia_dias'>> & { id?: number; frecuencia_km?: string; frecuencia_horas?: string; frecuencia_dias?: string };

const aNumero = (v?: string) => (v && v.trim() ? parseInt(v, 10) || null : null);
const frec = (r: TipoMp) => [r.frecuencia_km ? `${r.frecuencia_km.toLocaleString('es-PE')} km` : null, r.frecuencia_horas ? `${r.frecuencia_horas} h` : null, r.frecuencia_dias ? `${r.frecuencia_dias} días` : null].filter(Boolean).join(' · ') || '—';

const COLUMNAS: ColumnaTabla[] = [
  { id: 'marca', titulo: 'Marca', ancho: 150 },
  { id: 'modelo', titulo: 'Modelo', ancho: 170 },
  { id: 'tipo_mp', titulo: 'Tipo de MP', ancho: 220 },
  { id: 'frec', titulo: 'Frecuencia', ancho: 260 },
  { id: 'sistema', titulo: 'Sistema', ancho: 170 },
  { id: 'acciones', titulo: 'Acciones', ancho: 130, minimo: 110 },
];

export function FrecuenciasMpPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [marca, setMarca] = useState('');
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [porEliminar, setPorEliminar] = useState<TipoMp | null>(null);
  const puedeEditar = can('cfg_mant.editar', 'cfg_mant.crear');

  const lista = useQuery<TipoMp[]>({
    queryKey: ['mant', 'tipos-mantenimiento'],
    queryFn: () => api<unknown>('/tipos-mantenimiento').then(r => (Array.isArray(r) ? r : ((r as { data?: TipoMp[] }).data ?? [])) as TipoMp[]),
    staleTime: 60_000,
  });
  const marcas = useMemo(() => [...new Set((lista.data ?? []).map(r => (r.marca ?? '').trim()).filter(Boolean))].sort(), [lista.data]);
  const datos = useMemo(() => {
    const t = q.trim().toUpperCase();
    return (lista.data ?? []).filter(r =>
      (!marca || r.marca === marca) &&
      (!t || r.tipo_mp.toUpperCase().includes(t) || (r.modelo ?? '').toUpperCase().includes(t) || (r.sistema ?? '').toUpperCase().includes(t)));
  }, [lista.data, q, marca]);

  const refrescar = () => qc.invalidateQueries({ queryKey: ['mant', 'tipos-mantenimiento'] });

  function abrirNuevo() { setBorrador({ marca: '', tipo_mp: '', modelo: '', tipo: '', sistema: '', combustible: '', uts: '', descripcion: '', frecuencia_km: '', frecuencia_horas: '', frecuencia_dias: '' }); }
  function abrirEditar(r: TipoMp) {
    setBorrador({ ...r, frecuencia_km: r.frecuencia_km ? String(r.frecuencia_km) : '', frecuencia_horas: r.frecuencia_horas ? String(r.frecuencia_horas) : '', frecuencia_dias: r.frecuencia_dias ? String(r.frecuencia_dias) : '' });
  }

  async function guardar() {
    if (!borrador) return;
    if (!(borrador.marca ?? '').trim() || !(borrador.tipo_mp ?? '').trim()) { toast('La marca y el tipo de MP son obligatorios', 'error'); haptic('warning'); return; }
    const cuerpo = {
      marca: (borrador.marca ?? '').trim().toUpperCase(), tipo_mp: (borrador.tipo_mp ?? '').trim().toUpperCase(),
      modelo: (borrador.modelo ?? '').trim().toUpperCase() || null, uts: (borrador.uts ?? '').trim().toUpperCase() || null,
      combustible: (borrador.combustible ?? '').trim().toUpperCase() || null, tipo: (borrador.tipo ?? '').trim() || null,
      sistema: (borrador.sistema ?? '').trim() || null, descripcion: (borrador.descripcion ?? '').trim() || null,
      frecuencia_km: aNumero(borrador.frecuencia_km), frecuencia_horas: aNumero(borrador.frecuencia_horas), frecuencia_dias: aNumero(borrador.frecuencia_dias),
    };
    setGuardando(true);
    try {
      const r = borrador.id
        ? await api<{ ok?: boolean; error?: string }>(`/tipos-mantenimiento/${borrador.id}`, { method: 'PUT', body: cuerpo })
        : await api<{ ok?: boolean; error?: string }>('/tipos-mantenimiento', { method: 'POST', body: cuerpo });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success'); toast('Frecuencia guardada');
      setBorrador(null);
      await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setGuardando(false); }
  }

  async function eliminar() {
    if (!porEliminar) return;
    setGuardando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/tipos-mantenimiento/${porEliminar.id}`, { method: 'DELETE' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo eliminar');
      haptic('success'); toast('Frecuencia eliminada');
      setPorEliminar(null);
      await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setGuardando(false); }
  }

  const txt = (k: keyof Borrador, label: string, wide = false, placeholder?: string) => (
    <Field label={label} wide={wide}>
      {p => <TextInput {...p} placeholder={placeholder} value={String(borrador?.[k] ?? '')} onChange={e => setBorrador(b => (b ? { ...b, [k]: e.target.value } : b))} />}
    </Field>
  );

  return (
    <Page>
      <PageHeader eyebrow="Mantenimiento" title="Frecuencias de mantenimiento preventivo"
        subtitle={lista.isLoading ? 'Cargando…' : `${(lista.data ?? []).length} frecuencias por marca y modelo`}
        actions={puedeEditar ? <Button variant="primary" icon={<Plus size={16} />} onClick={abrirNuevo}>Nueva frecuencia</Button> : undefined} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchField value={q} onChange={setQ} placeholder="Tipo de MP, modelo o sistema…" />
          <SelectInput value={marca} onChange={e => setMarca(e.target.value)} aria-label="Marca" style={{ width: 'auto' }}>
            <option value="">Todas las marcas</option>
            {marcas.map(m => <option key={m} value={m}>{m}</option>)}
          </SelectInput>
        </div>

        {lista.isLoading ? <PageLoader /> : lista.isError ? <Notice tone="error">{errorMessage(lista.error)}</Notice> : datos.length === 0 ? (
          <EmptyState icon={q || marca ? <SearchX size={22} /> : <CalendarClock size={22} />} title={q || marca ? 'Sin coincidencias' : 'Sin frecuencias'}>Agrega el primer tipo de mantenimiento preventivo.</EmptyState>
        ) : (
          <TablaRedimensionable id="frecuencias-mp" columnas={COLUMNAS} ariaLabel="Frecuencias de mantenimiento preventivo" altoMax="70vh">
            {datos.map(r => (
              <tr key={r.id}>
                <Celda>{r.marca}</Celda>
                <Celda>{r.modelo || '—'}</Celda>
                <Celda>{r.tipo_mp}</Celda>
                <Celda mono>{frec(r)}</Celda>
                <Celda>{r.sistema || '—'}</Celda>
                <Celda>
                  {puedeEditar && (
                    <span style={{ display: 'inline-flex', gap: 'var(--s-1)' }}>
                      <Button variant="secondary" icon={<Pencil size={15} />} aria-label={`Editar ${r.tipo_mp}`} onClick={() => abrirEditar(r)}>{''}</Button>
                      <Button variant="secondary" icon={<Trash2 size={15} />} aria-label={`Eliminar ${r.tipo_mp}`} onClick={() => setPorEliminar(r)}>{''}</Button>
                    </span>
                  )}
                </Celda>
              </tr>
            ))}
          </TablaRedimensionable>
        )}
      </div>

      <Sheet open={!!borrador} onClose={() => !guardando && setBorrador(null)} title={borrador?.id ? 'Editar frecuencia' : 'Nueva frecuencia'}
        footer={<><Button variant="secondary" onClick={() => setBorrador(null)} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando}>Guardar</Button></>}>
        {borrador && (
          <div className="form-grid">
            {txt('marca', 'Marca')}{txt('modelo', 'Modelo')}
            {txt('tipo_mp', 'Tipo de mantenimiento', true, 'Ej. CAMBIO DE ACEITE Y FILTROS')}
            {txt('frecuencia_km', 'Cada (km)')}{txt('frecuencia_horas', 'Cada (horas de motor)')}{txt('frecuencia_dias', 'Cada (días)')}
            {txt('tipo', 'Tipo')}{txt('sistema', 'Sistema')}{txt('combustible', 'Combustible')}{txt('uts', 'UTS')}
            {txt('descripcion', 'Descripción', true)}
          </div>
        )}
      </Sheet>

      <ConfirmSheet open={!!porEliminar} onClose={() => !guardando && setPorEliminar(null)} loading={guardando} onConfirm={eliminar}
        title={`¿Eliminar "${porEliminar?.tipo_mp ?? ''}"?`} message={`Se quita la frecuencia de ${porEliminar?.marca ?? ''} ${porEliminar?.modelo ?? ''}. Los mantenimientos ya hechos no cambian.`} confirmLabel="Eliminar" />
    </Page>
  );
}
