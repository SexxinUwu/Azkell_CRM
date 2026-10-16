import '../mantenimiento/mant.css';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CircleAlert, FileSpreadsheet, Landmark, Plus, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { useBancos, type Banco } from './api';

const ENTIDADES = [
  'BCP (BANCO DE CRÉDITO DEL PERÚ)', 'BBVA PERÚ', 'INTERBANK', 'SCOTIABANK PERÚ', 'BANCO DE LA NACIÓN', 'BANBIF',
  'BANCO PICHINCHA', 'MIBANCO', 'BANCO GNB PERÚ', 'BANCO SANTANDER PERÚ', 'BANCO DE COMERCIO', 'BANCO FALABELLA',
  'BANCO RIPLEY', 'BANCO ALFIN', 'ICBC PERÚ BANK', 'BANK OF CHINA PERÚ',
  'CAJA AREQUIPA', 'CAJA HUANCAYO', 'CAJA PIURA', 'CAJA CUSCO', 'CAJA TRUJILLO', 'CAJA ICA', 'CAJA TACNA', 'CAJA MAYNAS',
  'CAJA DEL SANTA', 'CAJA PAITA', 'FINANCIERA CREDISCOTIA', 'FINANCIERA COMPARTAMOS', 'FINANCIERA CONFIANZA',
  'FINANCIERA EFECTIVA', 'FINANCIERA PROEMPRESA', 'FINANCIERA OH!', 'FINANCIERA QAPAQ', 'CAJA RURAL LOS ANDES',
  'CAJA RURAL DEL CENTRO', 'CAJA RURAL PRYMERA', 'YAPE', 'PLIN',
];
const OTRO = '__otro__';

export function BancosPage() {
  const { data, isLoading, isError, error } = useBancos();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [porEliminar, setPorEliminar] = useState<Banco | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const bancos: Banco[] = data ?? [];
  const puedeCrear = can('tesoreria_bancos.crear', 'tesoreria_caja.crear');
  const puedeEliminar = can('tesoreria_bancos.eliminar', 'tesoreria_caja.eliminar');

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    return q ? bancos.filter(b => [b.banco, b.titular, b.numero_cuenta, b.cci].some(v => String(v ?? '').toUpperCase().includes(q))) : bancos;
  }, [bancos, busqueda]);

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/tesoreria/bancos/${porEliminar.id}`, { method: 'DELETE' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo eliminar');
      haptic('success'); toast('Cuenta eliminada'); setPorEliminar(null);
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'bancos'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEliminando(false); }
  }

  async function exportar() {
    try {
      await exportarExcel('Cuentas-bancarias', 'Bancos',
        ['Banco', 'Titular', 'Moneda', 'Tipo de cuenta', 'N° de cuenta', 'CCI', 'Estado'],
        visibles.map(b => [b.banco, b.titular, b.moneda, b.tipo_cuenta, b.numero_cuenta, b.cci, b.estado]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Bancos"
        subtitle={isLoading ? 'Cargando…' : `${bancos.length} cuentas`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} cuentas`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('tesoreria/bancos') },
            ]} />
            {puedeCrear && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setNuevo(true)}>Nueva cuenta</Button>}
          </>
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : bancos.length === 0 ? (
        <EmptyState icon={<Landmark size={22} />} title="Sin cuentas bancarias">
          {puedeCrear ? <>Registra la primera con <strong>Nueva cuenta</strong>.</> : 'Las cuentas registradas aparecerán aquí.'}
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Banco, titular o número de cuenta…" />
          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
              <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              {visibles.map((b, i) => (
                <div key={String(b.id ?? i)} className="dato" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-3)' }}>
                  <Landmark size={20} style={{ color: 'var(--ink)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{b.banco ?? '—'}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)', marginTop: 2 }}>
                      {[b.titular, b.tipo_cuenta, b.moneda].filter(Boolean).join(' · ') || '—'}
                    </div>
                    <div style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      {b.numero_cuenta || '—'}{b.cci ? ` · CCI ${b.cci}` : ''}
                    </div>
                  </div>
                  <span className={`ot-estado ot-estado--${String(b.estado).toUpperCase() === 'ACTIVO' ? 'green' : 'neutral'}`}>{b.estado ?? '—'}</span>
                  {puedeEliminar && (
                    <button type="button" className="placas-limpiar" aria-label={`Eliminar cuenta ${b.numero_cuenta ?? ''}`}
                      style={{ color: 'var(--red-ink)' }} onClick={() => setPorEliminar(b)}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <NuevaCuenta open={nuevo} onClose={() => setNuevo(false)} />

      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !eliminando && setPorEliminar(null)}
        onConfirm={eliminar}
        loading={eliminando}
        title="¿Eliminar esta cuenta?"
        message={porEliminar ? `${porEliminar.banco ?? ''} · ${porEliminar.numero_cuenta ?? ''}. Los movimientos ya registrados no se borran.` : ''}
        confirmLabel="Eliminar"
      />
    </Page>
  );
}

function NuevaCuenta({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [entidad, setEntidad] = useState('');
  const [otra, setOtra] = useState('');
  const [titular, setTitular] = useState('');
  const [moneda, setMoneda] = useState('SOLES');
  const [tipo, setTipo] = useState('CORRIENTE');
  const [numero, setNumero] = useState('');
  const [cci, setCci] = useState('');
  const [estado, setEstado] = useState('ACTIVO');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (!open) return;
    setErrs({});
    setEntidad(''); setOtra(''); setTitular(''); setMoneda('SOLES'); setTipo('CORRIENTE'); setNumero(''); setCci(''); setEstado('ACTIVO'); setError(null);
  }, [open]);

  async function guardar() {
    const banco = entidad === OTRO ? otra.trim().toUpperCase() : entidad;
    const e: Record<string, string> = {};
    if (!banco) e.entidad = 'Elige la entidad bancaria.';
    if (!numero.trim()) e.numero = 'Escribe el número de cuenta.';
    if (cci.trim() && !/^\d{20}$/.test(cci.trim())) e.cci = 'El CCI debe tener 20 dígitos.';
    setErrs(e);
    if (Object.keys(e).length) { haptic('warning'); return; }
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string }>('/tesoreria/bancos', {
        method: 'POST',
        body: { banco, titular: titular.trim(), moneda, tipo_cuenta: tipo, numero_cuenta: numero.trim(), cci: cci.trim(), estado },
      });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success'); toast('Cuenta registrada');
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'bancos'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Nueva cuenta bancaria"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar cuenta</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Entidad" wide error={errs.entidad}>
          {p => (
            <SelectInput {...p} value={entidad} onChange={e => setEntidad(e.target.value)}>
              <option value="">Elige un banco…</option>
              {ENTIDADES.map(x => <option key={x} value={x}>{x}</option>)}
              <option value={OTRO}>Otra entidad (especificar)…</option>
            </SelectInput>
          )}
        </Field>
        {entidad === OTRO && (
          <Field label="Nombre de la entidad" wide>{p => <TextInput {...p} value={otra} onChange={e => setOtra(e.target.value)} autoFocus />}</Field>
        )}
        <Field label="Titular" wide>{p => <TextInput {...p} value={titular} onChange={e => setTitular(e.target.value)} />}</Field>
        <Field label="Moneda">
          {p => <SelectInput {...p} value={moneda} onChange={e => setMoneda(e.target.value)}><option value="SOLES">Soles</option><option value="DOLARES">Dólares</option></SelectInput>}
        </Field>
        <Field label="Tipo de cuenta">
          {p => <SelectInput {...p} value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="CORRIENTE">Corriente</option><option value="AHORROS">Ahorros</option><option value="DETRACCIONES">Detracciones</option><option value="BILLETERA">Billetera digital</option>
          </SelectInput>}
        </Field>
        <Field label="N° de cuenta" wide error={errs.numero}>{p => <TextInput {...p} inputMode="numeric" value={numero} onChange={e => { setNumero(e.target.value); setErrs(x => ({ ...x, numero: undefined })); }} />}</Field>
        <Field label="CCI (20 dígitos)" wide error={errs.cci}>{p => <TextInput {...p} inputMode="numeric" maxLength={20} value={cci} onChange={e => { setCci(e.target.value.replace(/\D/g, '')); setErrs(x => ({ ...x, cci: undefined })); }} />}</Field>
        <Field label="Estado">
          {p => <SelectInput {...p} value={estado} onChange={e => setEstado(e.target.value)}><option value="ACTIVO">Activo</option><option value="INACTIVO">Inactivo</option></SelectInput>}
        </Field>
      </div>
    </Sheet>
  );
}
