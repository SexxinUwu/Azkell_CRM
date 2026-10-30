import '../mantenimiento/mant.css';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileSpreadsheet, Paperclip, Plus, Printer, Receipt, ShieldCheck } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { formatFechaPe, formatSoles } from '../../core/lib/format';
import { imprimirBoleta } from './nominaBoleta';

interface Fila {
  id: number; nombre_completo: string; documento: string; cargo: string; rol: string;
  dias_trabajados: number; faltas: number; minutos_tardanza: number;
  sueldo_basico: number; asignacion_familiar: number; bono_fijo: number; horas_extras_importe: number; total_ingresos: number;
  descuento_pension: number; regimen_pensionario: string; descuento_faltas: number; descuento_tardanzas: number;
  total_descuentos: number; neto_pagar: number; banco: string; cuenta: string; cci: string;
  [k: string]: unknown;
}
interface Planilla { ok: boolean; periodo?: string; total_neto_planilla: number; total_essalud: number; total_colaboradores: number; data: Fila[] }
interface Sst {
  id: number; apellidos: string; nombres: string; numero_documento: string; cargo: string; tipo_registro: string; descripcion: string;
  fecha_registro: string | null; fecha_vencimiento: string | null; firmado: number | boolean; documento_url: string | null;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const s = (v: unknown) => formatSoles(Number(v) || 0);
const dia = (x: string | null) => formatFechaPe(x);

type Vista = 'planilla' | 'sst';

// Personas y seguridad › Nómina: planilla del mes por colaborador y constancias de SST.
export function NominaPage() {
  const hoy = new Date();
  const [vista, setVista] = useState<Vista>('planilla');
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [busqueda, setBusqueda] = useState('');
  const [boleta, setBoleta] = useState<Fila | null>(null);
  const [nuevaSst, setNuevaSst] = useState(false);
  const toast = useToast();
  const { can } = useAuth();

  const planilla = useQuery<Planilla>({
    queryKey: ['rrhh', 'nomina', anio, mes],
    queryFn: () => api<Planilla>(`/rrhh/nomina/resumen?anio=${anio}&mes=${mes}`),
    enabled: vista === 'planilla',
  });
  const sst = useQuery<Sst[]>({
    queryKey: ['rrhh', 'sst'],
    queryFn: () => api<{ data?: Sst[] }>('/rrhh/sst').then(r => r.data ?? []),
    enabled: vista === 'sst',
  });

  const filas = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return (planilla.data?.data ?? []).filter(f => !t || `${f.nombre_completo} ${f.documento} ${f.cargo}`.toUpperCase().includes(t));
  }, [planilla.data, busqueda]);
  const constancias = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return (sst.data ?? []).filter(x => !t || `${x.apellidos} ${x.nombres} ${x.numero_documento} ${x.tipo_registro} ${x.descripcion}`.toUpperCase().includes(t));
  }, [sst.data, busqueda]);

  async function exportar() {
    try {
      if (vista === 'planilla') {
        await exportarExcel(`Planilla-${anio}-${String(mes).padStart(2, '0')}`, 'Planilla',
          ['Documento', 'Colaborador', 'Cargo', 'Rol', 'Días trabajados', 'Faltas', 'Sueldo básico', 'Asig. familiar', 'Horas extras', 'Total ingresos',
            'Pensión', 'Desc. faltas', 'Desc. tardanzas', 'Total descuentos', 'Neto a pagar', 'Banco', 'Cuenta', 'CCI'],
          filas.map(f => [f.documento, f.nombre_completo, f.cargo, f.rol, f.dias_trabajados, f.faltas, f.sueldo_basico, f.asignacion_familiar, f.horas_extras_importe,
            f.total_ingresos, f.descuento_pension, f.descuento_faltas, f.descuento_tardanzas, f.total_descuentos, f.neto_pagar, f.banco, f.cuenta, f.cci]));
      } else {
        await exportarExcel('Constancias-SST', 'SST',
          ['Colaborador', 'Documento', 'Tipo', 'Descripción', 'Fecha', 'Vence', 'Firmado'],
          constancias.map(x => [`${x.apellidos}, ${x.nombres}`, x.numero_documento, x.tipo_registro, x.descripcion, dia(x.fecha_registro), dia(x.fecha_vencimiento), x.firmado ? 'Sí' : 'No']));
      }
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  function imprimirBoletaActual() {
    if (!boleta) return;
    const periodo = `${String(mes).padStart(2, '0')}/${anio}`;
    if (imprimirBoleta(boleta, periodo)) haptic('success');
    else toast('El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio.', 'error');
  }

  const cargando = vista === 'planilla' ? planilla.isLoading : sst.isLoading;
  const fallo = vista === 'planilla' ? planilla.error : sst.error;

  return (
    <Page>
      <PageHeader
        eyebrow="Personas y seguridad"
        title="Nómina"
        subtitle={cargando ? 'Cargando…' : vista === 'planilla' ? `${MESES[mes - 1]} ${anio} · ${filas.length} colaboradores` : `${constancias.length} constancias`}
        actions={
          <>
            <MenuOtros opciones={[
              { label: 'Exportar Excel', icon: <FileSpreadsheet size={17} />, onSelect: exportar },
            ]} />
            {vista === 'sst' && can('rrhh_nomina.crear', 'rrhh_personal.crear') && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setNuevaSst(true)}>Constancia SST</Button>
            )}
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <SegmentedControl<Vista> label="Vista" value={vista} onChange={setVista}
          options={[{ value: 'planilla', label: 'Planilla del mes' }, { value: 'sst', label: 'Constancias SST' }]} />

        {vista === 'planilla' && (
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            <SelectInput value={mes} onChange={e => setMes(Number(e.target.value))} aria-label="Mes" style={{ width: 'auto' }}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </SelectInput>
            <SelectInput value={anio} onChange={e => setAnio(Number(e.target.value))} aria-label="Año" style={{ width: 'auto' }}>
              {[hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1].map(a => <option key={a} value={a}>{a}</option>)}
            </SelectInput>
          </div>
        )}

        {vista === 'planilla' && planilla.data && (
          <div className="inv-metricas">
            <div className="inv-metrica"><span className="inv-metrica__num" style={{ color: 'var(--green-ink)', fontSize: '1.125rem' }}>{s(planilla.data.total_neto_planilla)}</span><span className="inv-metrica__label">Neto de planilla</span></div>
            <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.125rem' }}>{s(planilla.data.total_essalud)}</span><span className="inv-metrica__label">EsSalud</span></div>
            <div className="inv-metrica"><span className="inv-metrica__num">{planilla.data.total_colaboradores}</span><span className="inv-metrica__label">Colaboradores</span></div>
          </div>
        )}

        <SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, documento o cargo…" />

        {cargando ? <PageLoader /> : fallo ? <Notice tone="error">{errorMessage(fallo)}</Notice> : vista === 'planilla' ? (
          filas.length === 0 ? (
            <EmptyState icon={<Receipt size={22} />} title="Sin colaboradores">No hay personal activo para este periodo.</EmptyState>
          ) : (
            <div className="tarjeta__lista">
              {filas.map(f => (
                <button key={f.id} type="button" className="mov-fila pressable" onClick={() => { haptic('selection'); setBoleta(f); }}>
                  <div className="mov-fila__icon" style={{ background: 'var(--fill)', color: 'var(--label-2)' }}><Receipt size={16} /></div>
                  <div className="mov-fila__cuerpo">
                    <span className="mov-fila__titulo">{f.nombre_completo}</span>
                    <span className="mov-fila__sub">{f.cargo} · {f.dias_trabajados} d trabajados{f.faltas ? ` · ${f.faltas} faltas` : ''}</span>
                  </div>
                  <div className="mov-fila__derecha">
                    <span className="mov-fila__monto" style={{ color: 'var(--green-ink)' }}>{s(f.neto_pagar)}</span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--label-2)' }}>{f.banco || 'Sin banco'}</span>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : constancias.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={22} />} title="Sin constancias de SST">Registra la primera con <strong>Constancia SST</strong>.</EmptyState>
        ) : (
          <div className="tarjeta__lista">
            {constancias.map(x => (
              <div key={x.id} className="mov-fila">
                <div className="mov-fila__icon" style={{ background: x.firmado ? 'var(--green-tint)' : 'var(--amber-tint)', color: x.firmado ? 'var(--green-ink)' : 'var(--amber-ink)' }}><ShieldCheck size={16} /></div>
                <div className="mov-fila__cuerpo">
                  <span className="mov-fila__titulo">{x.apellidos}, {x.nombres}</span>
                  <span className="mov-fila__sub">{x.tipo_registro} · {x.descripcion} · {dia(x.fecha_registro)}{x.fecha_vencimiento ? ` · vence ${dia(x.fecha_vencimiento)}` : ''}</span>
                </div>
                <div className="mov-fila__derecha">
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: x.firmado ? 'var(--green-ink)' : 'var(--amber-ink)' }}>{x.firmado ? 'Firmado' : 'Pendiente de firma'}</span>
                  {x.documento_url && <a className="placas-limpiar" href={x.documento_url} target="_blank" rel="noreferrer"><Paperclip size={13} style={{ verticalAlign: '-2px' }} /> Cargo</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!boleta} onClose={() => setBoleta(null)} title={boleta ? `Boleta · ${boleta.nombre_completo}` : ''} footer={<>
          <Button variant="secondary" onClick={() => setBoleta(null)}>Cerrar</Button>
          <Button variant="primary" icon={<Printer size={16} />} onClick={imprimirBoletaActual}>Imprimir boleta</Button>
        </>}>
        {boleta && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <div className="inv-metricas">
              <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.0625rem' }}>{s(boleta.total_ingresos)}</span><span className="inv-metrica__label">Ingresos</span></div>
              <div className="inv-metrica"><span className="inv-metrica__num inv-metrica__num--critical" style={{ fontSize: '1.0625rem' }}>{s(boleta.total_descuentos)}</span><span className="inv-metrica__label">Descuentos</span></div>
              <div className="inv-metrica"><span className="inv-metrica__num" style={{ fontSize: '1.0625rem', color: 'var(--green-ink)' }}>{s(boleta.neto_pagar)}</span><span className="inv-metrica__label">Neto</span></div>
            </div>
            <div className="tarjeta__lista">
              <div className="dato"><span className="dato__label">Documento · cargo</span><span className="dato__valor">{boleta.documento} · {boleta.cargo}</span></div>
              <div className="dato"><span className="dato__label">Días trabajados</span><span className="dato__valor">{boleta.dias_trabajados} · {boleta.faltas} faltas · {boleta.minutos_tardanza} min de tardanza</span></div>
              <div className="dato"><span className="dato__label">Sueldo básico</span><span className="dato__valor">{s(boleta.sueldo_basico)}</span></div>
              <div className="dato"><span className="dato__label">Asignación familiar</span><span className="dato__valor">{s(boleta.asignacion_familiar)}</span></div>
              <div className="dato"><span className="dato__label">Bono / movilidad</span><span className="dato__valor">{s(boleta.bono_fijo)}</span></div>
              <div className="dato"><span className="dato__label">Horas extras</span><span className="dato__valor">{s(boleta.horas_extras_importe)}</span></div>
              <div className="dato"><span className="dato__label">Pensión ({boleta.regimen_pensionario})</span><span className="dato__valor">- {s(boleta.descuento_pension)}</span></div>
              <div className="dato"><span className="dato__label">Faltas</span><span className="dato__valor">- {s(boleta.descuento_faltas)}</span></div>
              <div className="dato"><span className="dato__label">Tardanzas</span><span className="dato__valor">- {s(boleta.descuento_tardanzas)}</span></div>
              <div className="dato"><span className="dato__label">Depósito</span><span className="dato__valor dato__valor--mono">{boleta.banco} · {boleta.cuenta}{boleta.cci ? ` · CCI ${boleta.cci}` : ''}</span></div>
            </div>
          </div>
        )}
      </Sheet>

      <SstSheet open={nuevaSst} onClose={() => setNuevaSst(false)} />
    </Page>
  );
}

const TIPOS_SST = [
  { value: 'ENTREGA_EPP', label: 'Entrega de EPP' }, { value: 'CAPACITACION', label: 'Capacitación' }, { value: 'INDUCCION', label: 'Inducción' },
  { value: 'EXAMEN_MEDICO', label: 'Examen médico' }, { value: 'CHARLA', label: 'Charla de seguridad' }, { value: 'OTRO', label: 'Otro' },
];

function SstSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const personal = useQuery<{ id: number; nombres: string; apellidos: string; categoria_rol: string }[]>({
    queryKey: ['rrhh', 'personal-lista'], enabled: open,
    queryFn: () => api<{ data?: { id: number; nombres: string; apellidos: string; categoria_rol: string }[] }>('/rrhh/personal').then(r => r.data ?? []),
    staleTime: 5 * 60_000,
  });
  const [pid, setPid] = useState('');
  const [tipo, setTipo] = useState('ENTREGA_EPP');
  const [desc, setDesc] = useState('');
  const [fecha, setFecha] = useState('');
  const [venc, setVenc] = useState('');
  const [firmado, setFirmado] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errCampo, setErrCampo] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (!open) return;
    setPid(''); setTipo('ENTREGA_EPP'); setDesc(''); setFecha(new Date().toISOString().slice(0, 10)); setVenc(''); setFirmado(false); setArchivo(null); setError(null);
  }, [open]);

  async function guardar() {
    setErrCampo({});
    if (!pid) { setErrCampo({ pid: 'Elige al colaborador.' }); haptic('warning'); return; }
    if (!desc.trim()) { setErrCampo({ desc: 'Describe la constancia.' }); haptic('warning'); return; }
    setEnviando(true); setError(null);
    try {
      const f = new FormData();
      f.append('personal_id', pid); f.append('tipo_registro', tipo); f.append('descripcion', desc.trim());
      f.append('fecha_registro', fecha); f.append('fecha_vencimiento', venc); f.append('firmado', firmado ? '1' : '0');
      if (archivo) f.append('documento', archivo);
      const r = await api<{ ok?: boolean; error?: string }>('/rrhh/sst', { method: 'POST', body: f });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success'); toast('Constancia registrada');
      await qc.invalidateQueries({ queryKey: ['rrhh', 'sst'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Constancia de SST"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Colaborador" wide error={errCampo.pid}>
          {p => (
            <SelectInput {...p} value={pid} onChange={e => { setPid(e.target.value); setErrCampo({}); }}>
              <option value="">Elige…</option>
              {(personal.data ?? []).map(x => <option key={x.id} value={x.id}>{x.apellidos}, {x.nombres} ({x.categoria_rol})</option>)}
            </SelectInput>
          )}
        </Field>
        <Field label="Tipo" wide>{p => <SelectInput {...p} value={tipo} onChange={e => setTipo(e.target.value)}>{TIPOS_SST.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</SelectInput>}</Field>
        <Field label="Descripción" wide error={errCampo.desc}>{p => <TextInput {...p} value={desc} onChange={e => { setDesc(e.target.value); setErrCampo({}); }} />}</Field>
        <Field label="Fecha">{p => <TextInput {...p} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />}</Field>
        <Field label="Vencimiento">{p => <TextInput {...p} type="date" value={venc} min={fecha} onChange={e => setVenc(e.target.value)} />}</Field>
        <Field label="Cargo firmado (PDF o foto)" wide hint={archivo?.name}>{p => <ArchivoInput {...p} accept="image/*,application/pdf" onChange={setArchivo} />}</Field>
        <label className="field field--wide" style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
          <input type="checkbox" checked={firmado} onChange={e => setFirmado(e.target.checked)} /> Ya está firmado por el colaborador
        </label>
      </div>
    </Sheet>
  );
}
