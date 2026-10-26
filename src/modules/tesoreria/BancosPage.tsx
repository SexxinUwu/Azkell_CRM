import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, FileSpreadsheet, Landmark, Plus, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { BancNuevaCuenta, TIPOS_CUENTA } from './banc-NuevaCuenta';
import { escribirTesoreria, fmtMonto, useBancos, type Banco } from './api';

type Moneda = 'TODAS' | 'SOLES' | 'DOLARES';

const etiquetaTipo = (t: string | null | undefined) =>
  TIPOS_CUENTA.find(x => x.value === String(t ?? '').toUpperCase())?.label ?? (t || '—');
const simboloMoneda = (m: string | null | undefined) => (String(m ?? '').toUpperCase() === 'DOLARES' ? 'US$' : 'S/');
const etiquetaMoneda = (m: string | null | undefined) => (String(m ?? '').toUpperCase() === 'DOLARES' ? 'Dólares' : 'Soles');

export function BancosPage() {
  const { data, isLoading, isError, error } = useBancos();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('TODAS');
  const [nuevo, setNuevo] = useState(false);
  const [porEliminar, setPorEliminar] = useState<Banco | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const bancos: Banco[] = data ?? [];
  const puedeCrear = can('tesoreria_bancos.crear', 'tesoreria_caja.crear');
  const puedeEliminar = can('tesoreria_bancos.eliminar', 'tesoreria_caja.eliminar');
  const activas = bancos.filter(b => String(b.estado).toUpperCase() === 'ACTIVO').length;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    return bancos.filter(b => {
      if (moneda !== 'TODAS' && String(b.moneda ?? '').toUpperCase() !== moneda) return false;
      if (!q) return true;
      return [b.banco, b.titular, b.numero_cuenta, b.cci].some(v => String(v ?? '').toUpperCase().includes(q));
    });
  }, [bancos, busqueda, moneda]);

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await escribirTesoreria(`/tesoreria/bancos/${porEliminar.id}`, 'DELETE');
      haptic('success'); toast('Cuenta eliminada'); setPorEliminar(null);
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'bancos'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEliminando(false); }
  }

  async function exportar() {
    try {
      await exportarExcel('Cuentas-bancarias', 'Bancos',
        ['Banco', 'Titular', 'Moneda', 'Tipo de cuenta', 'N° de cuenta', 'CCI', 'Saldo inicial', 'Estado'],
        visibles.map(b => [b.banco, b.titular, etiquetaMoneda(b.moneda), etiquetaTipo(b.tipo_cuenta), b.numero_cuenta, b.cci, Number(b.saldo_inicial ?? 0), b.estado]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Bancos"
        subtitle={isLoading ? 'Cargando…' : `${bancos.length} cuentas · ${activas} activas`}
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
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Banco, titular, número o CCI…" />
          <SegmentedControl<Moneda> label="Moneda" value={moneda} onChange={setMoneda}
            options={[{ value: 'TODAS', label: 'Todas' }, { value: 'SOLES', label: 'Soles' }, { value: 'DOLARES', label: 'Dólares' }]} />

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
              <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setMoneda('TODAS'); }}>Quitar filtros</button>
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              {visibles.map((b, i) => {
                const activo = String(b.estado).toUpperCase() === 'ACTIVO';
                const saldo = Number(b.saldo_inicial ?? 0);
                return (
                  <div key={String(b.id ?? i)} className="mov-fila" style={{ cursor: 'default' }}>
                    <div className="mov-fila__icon" style={{ background: 'var(--fill)', color: 'var(--label-2)' }}>
                      <Landmark size={17} />
                    </div>
                    <div className="mov-fila__cuerpo">
                      <span className="mov-fila__titulo">{b.banco || '—'}</span>
                      <span className="mov-fila__sub">
                        {[b.titular, etiquetaTipo(b.tipo_cuenta), etiquetaMoneda(b.moneda)].filter(Boolean).join(' · ') || '—'}
                      </span>
                      <span className="mov-fila__sub" style={{ fontFamily: 'var(--font-mono)', color: 'var(--label)' }}>
                        {b.numero_cuenta || '—'}{b.cci ? ` · CCI ${b.cci}` : ''}
                      </span>
                    </div>
                    <div className="mov-fila__derecha">
                      <Badge tone={activo ? 'green' : 'gray'}>{activo ? 'Activa' : 'Inactiva'}</Badge>
                      {saldo !== 0 && (
                        <span className="t-numeric" style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>
                          {simboloMoneda(b.moneda)} {fmtMonto(saldo)}
                        </span>
                      )}
                    </div>
                    {puedeEliminar && (
                      <button type="button" className="placas-limpiar" aria-label={`Eliminar cuenta ${b.numero_cuenta ?? ''}`}
                        style={{ color: 'var(--red-ink)', marginLeft: 'var(--s-2)' }} onClick={() => setPorEliminar(b)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <BancNuevaCuenta open={nuevo} onClose={() => setNuevo(false)} />

      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => !eliminando && setPorEliminar(null)}
        onConfirm={eliminar}
        loading={eliminando}
        title="¿Eliminar esta cuenta?"
        message={porEliminar ? `${porEliminar.banco ?? ''} · ${porEliminar.numero_cuenta ?? ''}. Los movimientos de caja ya registrados no se borran.` : ''}
        confirmLabel="Eliminar"
      />
    </Page>
  );
}
