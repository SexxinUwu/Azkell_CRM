import '../mantenimiento/mant.css';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { useAuth } from '../../core/auth/AuthProvider';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

// Almacén › Configuración: tipo de cambio (GET/PUT /api/almacen/configuracion), marcas de las unidades
// (GET /api/almacen/marcas-placas, salen de las placas) y cuentas de la empresa (GET /api/almacen/empresa-cuentas,
// salen de Tesorería › Bancos). El servidor solo permite editar la configuración; las otras dos son de consulta.
interface Cuenta { id: number; banco?: string | null; titular?: string | null; moneda?: string | null; tipo_cuenta?: string | null; numero_cuenta?: string | null; cci?: string | null }

const COLUMNAS: ColumnaTabla[] = [
  { id: 'banco', titulo: 'Banco', ancho: 180 },
  { id: 'titular', titulo: 'Titular', ancho: 220 },
  { id: 'moneda', titulo: 'Moneda', ancho: 110 },
  { id: 'tipo', titulo: 'Tipo', ancho: 130 },
  { id: 'numero', titulo: 'N.° de cuenta', ancho: 200 },
  { id: 'cci', titulo: 'CCI', ancho: 220 },
];

const tarjeta = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 14, padding: 'var(--s-4)', minWidth: 0 } as const;
const titulo = { margin: '0 0 var(--s-3)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--label)' } as const;
const nota = { margin: 'var(--s-2) 0 0', fontSize: '0.75rem', color: 'var(--label-2)' } as const;

export function AlmacenConfiguracionPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const puedeEditar = can('cfg_almacen', 'inv');
  const [tc, setTc] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = useQuery<Record<string, string>>({ queryKey: ['almacen', 'configuracion'], queryFn: () => api<Record<string, string>>('/almacen/configuracion'), staleTime: 30_000 });
  const marcas = useQuery<string[]>({ queryKey: ['almacen', 'marcas-placas'], queryFn: () => api<string[]>('/almacen/marcas-placas'), staleTime: 60_000 });
  const cuentas = useQuery<Cuenta[]>({ queryKey: ['almacen', 'empresa-cuentas'], queryFn: () => api<Cuenta[]>('/almacen/empresa-cuentas'), staleTime: 60_000 });

  const valorTc = tc ?? config.data?.tipo_cambio ?? '';

  async function guardar() {
    const n = Number(valorTc.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) { setError('El tipo de cambio debe ser un número mayor que cero.'); haptic('warning'); return; }
    setGuardando(true); setError(null);
    try {
      await api('/almacen/configuracion', { method: 'PUT', body: { tipo_cambio: n } });
      await qc.invalidateQueries({ queryKey: ['almacen', 'configuracion'] });
      setTc(null);
      toast('Tipo de cambio guardado');
      haptic('success');
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  if (config.isLoading) return <Page><PageHeader eyebrow="Almacén" title="Configuración" /><PageLoader /></Page>;

  return (
    <Page>
      <PageHeader eyebrow="Almacén" title="Configuración" subtitle="Tipo de cambio, marcas de las unidades y cuentas de la empresa" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <section style={tarjeta}>
          <h3 style={titulo}>Tipo de cambio (USD a PEN)</h3>
          {config.isError && <Notice tone="error">{errorMessage(config.error)}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Tipo de cambio">
              {p => <TextInput {...p} inputMode="decimal" value={valorTc} disabled={!puedeEditar || guardando} onChange={e => setTc(e.target.value)} />}
            </Field>
            {puedeEditar && <Button variant="primary" onClick={guardar} loading={guardando} disabled={tc === null}>Guardar</Button>}
          </div>
          <p style={nota}>Convierte los costos en dólares a soles en el inventario.</p>
        </section>

        <section style={tarjeta}>
          <h3 style={titulo}>Marcas de las unidades</h3>
          {marcas.isLoading ? <PageLoader /> : marcas.isError ? <Notice tone="error">{errorMessage(marcas.error)}</Notice> : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(marcas.data ?? []).map(m => (
                <span key={m} style={{ padding: '4px 10px', borderRadius: 20, background: 'var(--fill-1)', fontSize: '0.8rem' }}>{m}</span>
              ))}
              {(marcas.data ?? []).length === 0 && <span style={nota}>Sin marcas registradas.</span>}
            </div>
          )}
          <p style={nota}>Se toman de las placas; para cambiarlas edita la placa en Flota.</p>
        </section>

        <section style={tarjeta}>
          <h3 style={titulo}>Cuentas de la empresa</h3>
          {cuentas.isLoading ? <PageLoader /> : cuentas.isError ? <Notice tone="error">{errorMessage(cuentas.error)}</Notice> : (
            <TablaRedimensionable id="almacen-empresa-cuentas" columnas={COLUMNAS} ariaLabel="Cuentas de la empresa" altoMax="40vh">
              {(cuentas.data ?? []).map((c, i) => (
                <tr key={c.id ?? i}>
                  <Celda>{c.banco || '—'}</Celda>
                  <Celda>{c.titular || '—'}</Celda>
                  <Celda>{c.moneda || '—'}</Celda>
                  <Celda>{c.tipo_cuenta || '—'}</Celda>
                  <Celda mono>{c.numero_cuenta || '—'}</Celda>
                  <Celda mono>{c.cci || '—'}</Celda>
                </tr>
              ))}
            </TablaRedimensionable>
          )}
          <p style={nota}>Son las cuentas de Tesorería › Bancos; se crean y editan allí.</p>
        </section>
      </div>
    </Page>
  );
}
