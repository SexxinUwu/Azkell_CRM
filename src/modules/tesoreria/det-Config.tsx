import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power } from 'lucide-react';
import { Badge, Notice } from '../../core/ui/Display';
import { Button, PageLoader } from '../../core/ui/Button';
import { Field, TextInput } from '../../core/ui/Field';
import { SwitchRow, decimalInput, digitsInput, parseDecimal } from '../../core/ui/forms';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { formatSoles } from '../../core/lib/format';
import { useConfigDetracciones, useTiposDetraccion, type TipoDetraccion } from './det-api';

const COLUMNAS: ColumnaTabla[] = [
  { id: 'codigo', titulo: 'Código', ancho: 90 },
  { id: 'descripcion', titulo: 'Descripción', ancho: 360 },
  { id: 'pct', titulo: 'Porcentaje', ancho: 110, alinear: 'right' },
  { id: 'min', titulo: 'Monto mínimo', ancho: 140, alinear: 'right' },
  { id: 'estado', titulo: 'Estado', ancho: 110 },
  { id: 'usos', titulo: 'Órdenes', ancho: 90, alinear: 'right' },
  { id: 'edit', titulo: 'Última edición', ancho: 230 },
  { id: 'acc', titulo: '', ancho: 110, alinear: 'right' },
];

interface Borrador { id: number | null; codigo: string; descripcion: string; porcentaje: string; monto_minimo: string }
const NUEVO: Borrador = { id: null, codigo: '', descripcion: '', porcentaje: '', monto_minimo: '700' };

/** Configuración de detracciones (solo administradores): catálogo de tipos y bandera de la retención del 3 % */
export function DetConfig() {
  const toast = useToast();
  const qc = useQueryClient();
  const config = useConfigDetracciones();
  const tipos = useTiposDetraccion(true);
  const [form, setForm] = useState<Borrador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const refrescar = () => qc.invalidateQueries({ queryKey: ['tesoreria', 'detracciones'] });

  async function cambiarRetencion(activa: boolean) {
    try {
      await api('/tesoreria/detracciones/config', { method: 'PUT', body: { retencion_3_activa: activa } });
      haptic('success');
      toast(activa ? 'Retención del 3 % marcada como activa.' : 'Retención del 3 % desactivada.', 'success');
      refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  async function alternar(t: TipoDetraccion) {
    try {
      await api(`/almacen/detraccion-tipos/${t.id}`, { method: 'PUT', body: { activo: !t.activo } });
      haptic('success');
      toast(t.activo ? `Tipo ${t.codigo} desactivado: ya no se ofrece en las órdenes nuevas.` : `Tipo ${t.codigo} activado.`, 'success');
      refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  async function guardar() {
    if (!form) return;
    const pct = parseDecimal(form.porcentaje);
    const min = parseDecimal(form.monto_minimo);
    if (form.id === null && !/^\d{3}$/.test(form.codigo)) return setError('El código SUNAT debe tener 3 dígitos (por ejemplo 020).');
    if (form.descripcion.trim().length < 3) return setError('Escribe la descripción del servicio.');
    if (pct === null || Number.isNaN(pct) || pct <= 0 || pct > 100) return setError('El porcentaje debe ser mayor que 0 y no pasar de 100.');
    if (min === null || Number.isNaN(min)) return setError('Escribe el monto mínimo en soles (0 si no tiene).');
    setError(null); setGuardando(true);
    try {
      const cuerpo = { descripcion: form.descripcion.trim(), porcentaje: pct, monto_minimo: min };
      if (form.id === null) await api('/almacen/detraccion-tipos', { method: 'POST', body: { codigo: form.codigo, ...cuerpo } });
      else await api(`/almacen/detraccion-tipos/${form.id}`, { method: 'PUT', body: cuerpo });
      haptic('success');
      toast('Tipo de detracción guardado.', 'success');
      setForm(null);
      refrescar();
    } catch (err) { setError(errorMessage(err)); } finally { setGuardando(false); }
  }

  const c = config.data;
  return (
    <div className="det-cuerpo">
      <section className="det-tarjeta">
        <h2 className="det-tarjeta__titulo">Retención del IGV (3 %)</h2>
        {config.isLoading ? <PageLoader variante="circulo" /> : config.isError ? <Notice tone="error">{errorMessage(config.error)}</Notice> : c && (
          <>
            <SwitchRow title="La empresa es agente de retención" subtitle={c.nota} checked={c.retencion_3_activa} onChange={cambiarRetencion} disabled={!c.puede_editar} />
            <p className="det-nota">Hoy esta opción solo deja la marca guardada; no cambia ninguna orden ni pago.</p>
          </>
        )}
      </section>

      <section className="det-tarjeta">
        <div className="det-tarjeta__cabecera">
          <h2 className="det-tarjeta__titulo">Tipos de detracción</h2>
          <Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => { setError(null); setForm(NUEVO); }}>Agregar tipo</Button>
        </div>
        <p className="det-nota">Cambiar el porcentaje o el mínimo solo afecta a las órdenes nuevas: cada orden conserva el porcentaje con el que se registró. Los valores deben validarse con el contador.</p>
        {tipos.isLoading ? <PageLoader variante="circulo" /> : tipos.isError ? <Notice tone="error">{errorMessage(tipos.error)}</Notice> : (
          <TablaRedimensionable id="det-tipos" columnas={COLUMNAS} ariaLabel="Tipos de detracción" altoMax="55vh" fijas={1}>
            {(tipos.data ?? []).map(t => (
              <tr key={t.id}>
                <Celda mono>{t.codigo}</Celda>
                <Celda>{t.descripcion}</Celda>
                <Celda alinear="right" mono>{t.porcentaje}%</Celda>
                <Celda alinear="right" mono>{formatSoles(t.monto_minimo)}</Celda>
                <Celda><Badge tone={t.activo ? 'green' : 'gray'}>{t.activo ? 'Activo' : 'Inactivo'}</Badge></Celda>
                <Celda alinear="right" mono>{t.usos}</Celda>
                <Celda>{t.actualizado_por ? `${t.actualizado_por} · ${t.actualizado_en ?? ''}` : '—'}</Celda>
                <Celda alinear="right">
                  <span className="det-acciones">
                    <Button size="sm" variant="plain" iconOnly aria-label={`Editar ${t.codigo}`} icon={<Pencil size={16} />}
                      onClick={() => { setError(null); setForm({ id: t.id, codigo: t.codigo, descripcion: t.descripcion, porcentaje: String(t.porcentaje), monto_minimo: String(t.monto_minimo) }); }} />
                    <Button size="sm" variant="plain" iconOnly aria-label={t.activo ? `Desactivar ${t.codigo}` : `Activar ${t.codigo}`} icon={<Power size={16} />} onClick={() => alternar(t)} />
                  </span>
                </Celda>
              </tr>
            ))}
          </TablaRedimensionable>
        )}
      </section>

      <Sheet open={form !== null} onClose={() => setForm(null)} title={form?.id === null ? 'Nuevo tipo de detracción' : `Editar tipo ${form?.codigo ?? ''}`}
        footer={<><Button onClick={() => setForm(null)}>Cancelar</Button><Button variant="primary" loading={guardando} onClick={guardar}>Guardar</Button></>}>
        {form && (
          <div className="form-grid">
            <Field label="Código SUNAT" hint={form.id === null ? 'Tres dígitos, como figura en el anexo de SUNAT.' : 'El código no se puede cambiar.'}>{p => (
              <TextInput {...p} inputMode="numeric" value={form.codigo} disabled={form.id !== null} onChange={e => setForm({ ...form, codigo: digitsInput(e.target.value, 3) })} />
            )}</Field>
            <Field label="Porcentaje (%)">{p => <TextInput {...p} inputMode="decimal" value={form.porcentaje} onChange={e => setForm({ ...form, porcentaje: decimalInput(e.target.value) })} />}</Field>
            <Field label="Descripción" wide>{p => <TextInput {...p} maxLength={150} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />}</Field>
            <Field label="Monto mínimo (S/)" hint="La detracción solo aplica si el total supera este monto.">{p => (
              <TextInput {...p} inputMode="decimal" value={form.monto_minimo} onChange={e => setForm({ ...form, monto_minimo: decimalInput(e.target.value) })} />
            )}</Field>
            {error && <div className="field--wide"><Notice tone="error">{error}</Notice></div>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
