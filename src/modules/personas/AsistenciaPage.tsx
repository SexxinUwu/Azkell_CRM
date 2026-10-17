import '../mantenimiento/mant.css';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CalendarCheck, CalendarOff, CheckCheck, CircleAlert, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import './asistencia.css';

interface Persona { id: number; numero_documento: string; nombres: string; apellidos: string; categoria_rol: string; cargo: string | null }
interface RegistroDia { estado: string; minutos_tardanza?: number; observacion?: string | null }
interface Matriz { ok: boolean; anio: number; mes: number; dias_mes: number; personal: Persona[]; tareo: Record<string, Record<string, RegistroDia>> }

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CICLO = ['A', 'R', 'T', 'F', 'DM', 'V', 'D', 'FER'] as const;
const LEYENDA: Record<string, string> = { A: 'Asistió', R: 'En ruta', T: 'Tardanza', F: 'Falta', DM: 'Descanso médico', V: 'Vacaciones', D: 'Descanso', FER: 'Feriado' };
const ROLES = ['TODOS', 'CONDUCTOR', 'OPERATIVO', 'ADMINISTRATIVO', 'MECANICO', 'SEGURIDAD'];
const DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const clave = (anio: number, mes: number, dia: number) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

// Personas y seguridad › Asistencia: tareo mensual. Un toque en una celda cambia el estado del día.
export function AsistenciaPage() {
  const hoy = new Date();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [rol, setRol] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [cambios, setCambios] = useState<Record<string, string>>({});   // "personaId|fecha" → estado (sin esperar al servidor)
  const [confirmarHoy, setConfirmarHoy] = useState(false);
  const [licencia, setLicencia] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const puedeEditar = can('rrhh_asistencia.editar', 'rrhh_asistencia.crear');

  const q = useQuery<Matriz>({
    queryKey: ['rrhh', 'tareo', anio, mes, rol],
    queryFn: () => api<Matriz>(`/rrhh/tareo?anio=${anio}&mes=${mes}&rol=${rol}`),
    staleTime: 20_000,
  });
  const m = q.data;

  useEffect(() => { setCambios({}); }, [anio, mes, rol]);

  const personal = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return (m?.personal ?? []).filter(p => !t || `${p.apellidos} ${p.nombres} ${p.numero_documento} ${p.cargo ?? ''}`.toUpperCase().includes(t));
  }, [m, busqueda]);

  const estadoDe = (pid: number, fecha: string) => cambios[`${pid}|${fecha}`] ?? m?.tareo?.[pid]?.[fecha]?.estado ?? '';

  async function rotar(p: Persona, dia: number) {
    if (!puedeEditar) return;
    const fecha = clave(anio, mes, dia);
    const actual = estadoDe(p.id, fecha);
    const i = CICLO.indexOf(actual as typeof CICLO[number]);
    const sig = i === -1 || i === CICLO.length - 1 ? CICLO[0] : CICLO[i + 1];
    setCambios(c => ({ ...c, [`${p.id}|${fecha}`]: sig }));
    haptic('selection');
    try {
      await api('/rrhh/tareo/guardar', { method: 'POST', body: { personal_id: p.id, fecha, estado: sig, minutos_tardanza: sig === 'T' ? 15 : 0 } });
    } catch (err) {
      setCambios(c => { const n = { ...c }; delete n[`${p.id}|${fecha}`]; return n; });
      toast(errorMessage(err), 'error'); haptic('warning');
    }
  }

  async function autocompletarHoy() {
    if (!m) return;
    const fecha = new Date().toISOString().slice(0, 10);
    setOcupado(true);
    try {
      await api('/rrhh/tareo/guardar', {
        method: 'POST',
        body: { items: personal.map(p => ({ personal_id: p.id, fecha, estado: p.categoria_rol === 'CONDUCTOR' ? 'R' : 'A', minutos_tardanza: 0 })) },
      });
      haptic('success'); toast('Asistencia de hoy completada');
      setConfirmarHoy(false);
      await qc.invalidateQueries({ queryKey: ['rrhh', 'tareo'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function sincronizar() {
    setOcupado(true);
    try {
      const r = await api<{ message?: string }>('/rrhh/tareo/sincronizar-viajes', { method: 'POST', body: { fecha: new Date().toISOString().slice(0, 10) } });
      haptic('success'); toast(r.message || 'Sincronización completada');
      await qc.invalidateQueries({ queryKey: ['rrhh', 'tareo'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function exportar() {
    if (!m) return;
    const dias = Array.from({ length: m.dias_mes }, (_, i) => i + 1);
    try {
      await exportarExcel(`Asistencia-${anio}-${String(mes).padStart(2, '0')}`, 'Asistencia',
        ['Colaborador', 'Documento', 'Rol', ...dias.map(String), 'Asistió', 'En ruta', 'Faltas', 'Tardanzas'],
        personal.map(p => {
          const est = dias.map(d => estadoDe(p.id, clave(anio, mes, d)));
          const c = (e: string) => est.filter(x => x === e).length;
          return [`${p.apellidos}, ${p.nombres}`, p.numero_documento, p.categoria_rol, ...est, c('A'), c('R'), c('F'), c('T')];
        }));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const dias = m ? Array.from({ length: m.dias_mes }, (_, i) => i + 1) : [];
  const hoyClave = clave(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate());

  return (
    <Page>
      <PageHeader
        eyebrow="Personas y seguridad"
        title="Asistencia"
        subtitle={q.isLoading ? 'Cargando…' : `${MESES[mes - 1]} ${anio} · ${personal.length} colaboradores`}
        actions={
          <MenuOtros opciones={[
            puedeEditar ? { label: 'Marcar asistencia de hoy', detalle: 'A para el personal y R para conductores', icon: <CheckCheck size={17} />, onSelect: () => setConfirmarHoy(true) } : null,
            puedeEditar ? { label: 'Sincronizar con viajes', detalle: 'Conductores en ruta hoy', icon: <RefreshCw size={17} />, onSelect: sincronizar } : null,
            puedeEditar ? { label: 'Registrar licencia o vacaciones', icon: <CalendarOff size={17} />, onSelect: () => setLicencia(true) } : null,
            { label: 'Exportar Excel', detalle: `${MESES[mes - 1]} ${anio}`, icon: <FileSpreadsheet size={17} />, separado: true, onSelect: exportar },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('rrhh/asistencia') },
          ]} />
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <SelectInput value={mes} onChange={e => setMes(Number(e.target.value))} aria-label="Mes" style={{ width: 'auto' }}>
            {MESES.map((x, i) => <option key={x} value={i + 1}>{x}</option>)}
          </SelectInput>
          <SelectInput value={anio} onChange={e => setAnio(Number(e.target.value))} aria-label="Año" style={{ width: 'auto' }}>
            {[hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1].map(a => <option key={a} value={a}>{a}</option>)}
          </SelectInput>
          <SelectInput value={rol} onChange={e => setRol(e.target.value)} aria-label="Rol" style={{ width: 'auto' }}>
            {ROLES.map(r => <option key={r} value={r}>{r === 'TODOS' ? 'Todos los roles' : r}</option>)}
          </SelectInput>
        </div>
        <SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, documento o cargo…" />

        <div className="asis-leyenda">
          {CICLO.map(e => <span key={e} className={`asis-celda pressable asis-celda--${e}`} title={LEYENDA[e]}>{e}<small>{LEYENDA[e]}</small></span>)}
        </div>

        {q.isLoading ? <PageLoader /> : q.isError ? (
          <Notice tone="error">{errorMessage(q.error)}</Notice>
        ) : personal.length === 0 ? (
          <Notice tone="neutral">No hay personal para este rol o búsqueda.</Notice>
        ) : (
          <div className="asis-tabla-wrap">
            <table className="asis-tabla">
              <thead>
                <tr>
                  <th className="asis-col-nombre">Colaborador</th>
                  {dias.map(d => {
                    const f = new Date(anio, mes - 1, d);
                    const finde = f.getDay() === 0 || f.getDay() === 6;
                    return <th key={d} className={finde ? 'asis-finde' : ''}><span>{DIAS[f.getDay()]}</span>{d}</th>;
                  })}
                  <th title="Asistió">A</th><th title="En ruta">R</th><th title="Faltas">F</th><th title="Tardanzas">T</th>
                </tr>
              </thead>
              <tbody>
                {personal.map(p => {
                  const est = dias.map(d => estadoDe(p.id, clave(anio, mes, d)));
                  const c = (e: string) => est.filter(x => x === e).length;
                  return (
                    <tr key={p.id}>
                      <td className="asis-col-nombre">
                        <strong>{p.apellidos}, {p.nombres}</strong>
                        <small>{p.numero_documento} · {p.categoria_rol}</small>
                      </td>
                      {dias.map((d, i) => {
                        const fecha = clave(anio, mes, d);
                        return (
                          <td key={d} className={fecha === hoyClave ? 'asis-hoy' : ''}>
                            <button type="button" disabled={!puedeEditar} className={`asis-celda pressable asis-celda--${est[i] || 'VACIO'}`}
                              title={`${fecha}: ${LEYENDA[est[i]] ?? 'Sin marcar'}`} onClick={() => rotar(p, d)}>
                              {est[i] || '·'}
                            </button>
                          </td>
                        );
                      })}
                      <td className="asis-tot asis-tot--A">{c('A')}</td>
                      <td className="asis-tot asis-tot--R">{c('R')}</td>
                      <td className="asis-tot asis-tot--F">{c('F')}</td>
                      <td className="asis-tot asis-tot--T">{c('T')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {puedeEditar && <p className="t-footnote c-secondary">Toca una celda para cambiar el estado: A → R → T → F → DM → V → D → FER.</p>}
      </div>

      <ConfirmSheet open={confirmarHoy} onClose={() => !ocupado && setConfirmarHoy(false)} onConfirm={autocompletarHoy} loading={ocupado}
        title="¿Marcar la asistencia de hoy?" message={`Se marcará "Asistió" (y "En ruta" a los conductores) para ${personal.length} colaboradores. Reemplaza lo que ya esté marcado hoy.`} confirmLabel="Marcar" />
      <LicenciaSheet open={licencia} personal={m?.personal ?? []} onClose={() => setLicencia(false)} />
    </Page>
  );
}

const TIPOS_LICENCIA = [
  { value: 'VACACIONES', label: 'Vacaciones' }, { value: 'DESCANSO_MEDICO', label: 'Descanso médico (EsSalud / clínica)' },
  { value: 'PERMISO_CON_GOCE', label: 'Permiso con goce de haber' }, { value: 'PERMISO_SIN_GOCE', label: 'Permiso sin goce de haber' },
  { value: 'LICENCIA_PATERNIDAD', label: 'Licencia por paternidad' },
];

function LicenciaSheet({ open, personal, onClose }: { open: boolean; personal: Persona[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [pid, setPid] = useState('');
  const [tipo, setTipo] = useState('VACACIONES');
  const [ini, setIni] = useState('');
  const [fin, setFin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errCampo, setErrCampo] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (!open) return;
    const h = new Date().toISOString().slice(0, 10);
    setPid(''); setTipo('VACACIONES'); setIni(h); setFin(h); setMotivo(''); setError(null);
  }, [open]);

  async function guardar() {
    setErrCampo({});
    if (!pid) { setErrCampo({ pid: 'Elige al colaborador.' }); haptic('warning'); return; }
    if (fin < ini) { setErrCampo({ fin: 'La fecha fin es anterior al inicio.' }); haptic('warning'); return; }
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string }>('/rrhh/licencias', { method: 'POST', body: { personal_id: pid, tipo, fecha_inicio: ini, fecha_fin: fin, motivo } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo registrar');
      haptic('success'); toast('Licencia registrada y aplicada al tareo');
      await qc.invalidateQueries({ queryKey: ['rrhh', 'tareo'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Licencia o vacaciones"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={<CalendarCheck size={16} />} onClick={guardar} loading={enviando}>Guardar y aplicar al tareo</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Colaborador" wide error={errCampo.pid}>
          {p => (
            <SelectInput {...p} value={pid} onChange={e => setPid(e.target.value)}>
              <option value="">Elige…</option>
              {personal.map(x => <option key={x.id} value={x.id}>{x.apellidos}, {x.nombres} ({x.categoria_rol})</option>)}
            </SelectInput>
          )}
        </Field>
        <Field label="Tipo" wide>
          {p => <SelectInput {...p} value={tipo} onChange={e => setTipo(e.target.value)}>{TIPOS_LICENCIA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</SelectInput>}
        </Field>
        <Field label="Desde">{p => <TextInput {...p} type="date" value={ini} onChange={e => setIni(e.target.value)} />}</Field>
        <Field label="Hasta" error={errCampo.fin}>{p => <TextInput {...p} type="date" value={fin} min={ini} onChange={e => { setFin(e.target.value); setErrCampo({}); }} />}</Field>
        <Field label="Motivo" wide>{p => <TextInput {...p} value={motivo} onChange={e => setMotivo(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}
