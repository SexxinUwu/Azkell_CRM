import { hoyLima } from '../../core/lib/format';
import '../mantenimiento/mant.css';
import '../flota/documentos.css';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarOff, CheckCheck, ChevronLeft, ChevronRight, CircleAlert, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { FileSpreadsheet } from '../../core/ui/IconosArchivo';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice, Page } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { BotonTip } from '../../core/ui/BotonTip';
import { ChoiceChips } from '../../core/ui/Chips';
import { GrupoFiltro, HojaFiltros } from '../../core/ui/FiltrosListado';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import './asistencia.css';

interface Persona { id: number; numero_documento: string; nombres: string; apellidos: string; categoria_rol: string; cargo: string | null }
interface RegistroDia { estado: string; minutos_tardanza?: number; observacion?: string | null }
interface Matriz { ok: boolean; anio: number; mes: number; dias_mes: number; personal: Persona[]; tareo: Record<string, Record<string, RegistroDia>> }

const CICLO = ['A', 'R', 'T', 'F', 'DM', 'V', 'D', 'FER'] as const;
const LEYENDA: Record<string, string> = { A: 'Asistió', R: 'En ruta', T: 'Tardanza', F: 'Falta', DM: 'Descanso médico', V: 'Vacaciones', D: 'Descanso', FER: 'Feriado' };
const ROLES = ['TODOS', 'CONDUCTOR', 'OPERATIVO', 'ADMINISTRATIVO', 'MECANICO', 'SEGURIDAD'];
const DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
type Vista = 'dia' | 'semana' | 'mes';
const isoLocal = (f: Date) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;

const clave = (anio: number, mes: number, dia: number) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

// Personas y seguridad › Asistencia: tareo mensual. Un toque en una celda cambia el estado del día.
export function AsistenciaPage() {
  const hoy = new Date();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [ancla, setAncla] = useState(hoyLima());
  const [vista, setVista] = useState<Vista>('mes');
  const anio = Number(ancla.slice(0, 4));
  const mes = Number(ancla.slice(5, 7));
  const diaAncla = Number(ancla.slice(8, 10));
  const [rol, setRol] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [cambios, setCambios] = useState<Record<string, string>>({});   // "personaId|fecha" → estado (sin esperar al servidor)
  const [confirmarHoy, setConfirmarHoy] = useState(false);
  const [licencia, setLicencia] = useState(false);
  const [filtrando, setFiltrando] = useState(false);
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

  // Anterior / siguiente según el periodo: un día, una semana o un mes
  function mover(dir: 1 | -1) {
    const f = new Date(anio, mes - 1, vista === 'mes' ? 1 : diaAncla);
    if (vista === 'mes') f.setMonth(f.getMonth() + dir);
    else f.setDate(f.getDate() + (vista === 'semana' ? 7 : 1) * dir);
    setAncla(isoLocal(f));
  }

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
    const fecha = hoyLima();
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
      const r = await api<{ message?: string }>('/rrhh/tareo/sincronizar-viajes', { method: 'POST', body: { fecha: hoyLima() } });
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

  // Días que se ven: todo el mes, la semana (lunes a domingo, dentro del mes) o un solo día
  const dias = useMemo(() => {
    if (!m) return [];
    const todos = Array.from({ length: m.dias_mes }, (_, i) => i + 1);
    if (vista === 'mes') return todos;
    if (vista === 'dia') return [Math.min(diaAncla, m.dias_mes)];
    const lunes = diaAncla - ((new Date(anio, mes - 1, diaAncla).getDay() + 6) % 7);
    return todos.filter(d => d >= lunes && d <= lunes + 6);
  }, [m, vista, anio, mes, diaAncla]);
  const hoyClave = clave(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate());

  return (
    <Page wide fill>
      <header className="doc-cab asis-cab">
        <div className="doc-cab__titulo">
          <span className="t-eyebrow">Personas y seguridad{q.isLoading ? '' : ` · ${personal.length} colaboradores`}</span>
          <h1 className="doc-cab__h1">Asistencia</h1>
        </div>
        <SegmentedControl label="Periodo" value={vista} onChange={v => setVista(v as Vista)}
          options={[{ value: 'dia', label: 'Día' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' }]} />
        <div className="asis-nav">
          <BotonTip tip="Anterior" className="btn btn--plain btn--icono" onClick={() => mover(-1)}><ChevronLeft size={18} /></BotonTip>
          <TextInput className="asis-nav__fecha" aria-label="Periodo" type={vista === 'mes' ? 'month' : 'date'}
            value={vista === 'mes' ? ancla.slice(0, 7) : ancla} onChange={e => { const v = e.target.value; if (v) setAncla(v.length === 7 ? `${v}-01` : v); }} />
          <BotonTip tip="Siguiente" className="btn btn--plain btn--icono" onClick={() => mover(1)}><ChevronRight size={18} /></BotonTip>
        </div>
        <div className="doc-cab__buscar"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, documento o cargo…" /></div>
        <Button variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={() => setFiltrando(true)} aria-label={rol !== 'TODOS' ? 'Filtros, 1 activo' : 'Filtros'}>
          <span className="placas-filtros__texto">Filtros</span>
          {rol !== 'TODOS' && <span className="placas-filtros__n t-numeric">1</span>}
        </Button>
        <div className="doc-cab__acciones">
          {puedeEditar && <BotonTip tip="Marcar asistencia de hoy" className="btn btn--plain btn--icono asis-ico--azul" onClick={() => setConfirmarHoy(true)}><CheckCheck size={18} /></BotonTip>}
          {puedeEditar && <BotonTip tip="Sincronizar con viajes" className="btn btn--plain btn--icono btn--icono-acento" disabled={ocupado} onClick={sincronizar}><RefreshCw size={18} /></BotonTip>}
          {puedeEditar && <BotonTip tip="Registrar licencia o vacaciones" className="btn btn--plain btn--icono asis-ico--morado" onClick={() => setLicencia(true)}><CalendarOff size={18} /></BotonTip>}
          <BotonTip tip="Exportar Excel" className="btn btn--plain btn--icono btn--icono-excel" disabled={!m} onClick={exportar}><FileSpreadsheet size={18} /></BotonTip>
        </div>
      </header>

      <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={rol !== 'TODOS' ? 1 : 0} onLimpiar={() => setRol('TODOS')} resultado={personal.length} unidad="colaborador">
        <GrupoFiltro titulo="Rol">
          <ChoiceChips label="Rol" value={rol} onChange={setRol} options={ROLES.map(r => ({ value: r, label: r === 'TODOS' ? 'Todos' : r }))} />
        </GrupoFiltro>
      </HojaFiltros>

      <div className="asis-cuerpo">

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
                  <th className="asis-th-tot" title="Días asistidos">Asist.</th><th className="asis-th-tot" title="Días en ruta">En ruta</th><th className="asis-th-tot" title="Faltas">Faltas</th><th className="asis-th-tot" title="Tardanzas">Tard.</th>
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
    const h = hoyLima();
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
