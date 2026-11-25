import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { FileSpreadsheet } from '../../../core/ui/IconosArchivo';
import { Button, PageLoader } from '../../../core/ui/Button';
import { BotonTip } from '../../../core/ui/BotonTip';
import { ChoiceChips } from '../../../core/ui/Chips';
import { Notice } from '../../../core/ui/Display';
import { SearchField, TextInput } from '../../../core/ui/Field';
import { GrupoFiltro, HojaFiltros } from '../../../core/ui/FiltrosListado';
import { SegmentedControl } from '../../../core/ui/SegmentedControl';
import { useToast } from '../../../core/ui/Toast';
import { api, errorMessage } from '../../../core/api/client';
import { exportarExcel } from '../../../core/lib/excel';
import { haptic } from '../../../core/lib/haptics';
import { DIAS_SEM, ESTADOS, NO_ESPERADOS, ROLES, clave, isoLocal, useTareoMes, type Persona } from './datos';

const CICLO = ['A', 'R', 'T', 'F', 'DM', 'V', 'D', 'FER'] as const;
type Vista = 'dia' | 'semana' | 'mes';

/** Por periodo: matriz de tareo del día, la semana o el mes. Un toque en una casilla cambia el estado del día. */
export function VistaPeriodo({ hoy, puedeEditar }: { hoy: string; puedeEditar: boolean }) {
  const toast = useToast();
  const [ancla, setAncla] = useState(hoy);
  const [vista, setVista] = useState<Vista>('mes');
  const [rol, setRol] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [filtrando, setFiltrando] = useState(false);
  const [cambios, setCambios] = useState<Record<string, string>>({});   // "personaId|fecha" → estado (sin esperar al servidor)
  const anio = Number(ancla.slice(0, 4)); const mes = Number(ancla.slice(5, 7)); const diaAncla = Number(ancla.slice(8, 10));
  const q = useTareoMes(anio, mes, rol);
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

  async function exportar() {
    if (!m) return;
    const todos = Array.from({ length: m.dias_mes }, (_, i) => i + 1);
    try {
      await exportarExcel(`Asistencia-${anio}-${String(mes).padStart(2, '0')}`, 'Asistencia',
        ['Colaborador', 'Documento', 'Rol', ...todos.map(String), 'Asistió', 'En ruta', 'Faltas', 'Tardanzas'],
        personal.map(p => {
          const est = todos.map(d => estadoDe(p.id, clave(anio, mes, d)));
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

  return (
    <div className="asis-vista">
      <div className="asis-barra">
        <SegmentedControl label="Periodo" value={vista} onChange={v => setVista(v as Vista)}
          options={[{ value: 'dia', label: 'Día' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' }]} />
        <div className="asis-nav">
          <BotonTip tip="Anterior" className="btn btn--plain btn--icono" onClick={() => mover(-1)}><ChevronLeft size={18} /></BotonTip>
          <TextInput className="asis-nav__fecha" aria-label="Periodo" type={vista === 'mes' ? 'month' : 'date'}
            value={vista === 'mes' ? ancla.slice(0, 7) : ancla} onChange={e => { const v = e.target.value; if (v) setAncla(v.length === 7 ? `${v}-01` : v); }} />
          <BotonTip tip="Siguiente" className="btn btn--plain btn--icono" onClick={() => mover(1)}><ChevronRight size={18} /></BotonTip>
        </div>
        <div className="asis-barra__buscar"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, documento o cargo…" /></div>
        <Button variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={() => setFiltrando(true)} aria-label={rol !== 'TODOS' ? 'Filtros, 1 activo' : 'Filtros'}>
          <span className="placas-filtros__texto">Filtros</span>{rol !== 'TODOS' && <span className="placas-filtros__n t-numeric">1</span>}
        </Button>
        <BotonTip tip="Exportar Excel" className="btn btn--plain btn--icono btn--icono-excel" disabled={!m} onClick={exportar}><FileSpreadsheet size={18} /></BotonTip>
      </div>

      <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={rol !== 'TODOS' ? 1 : 0} onLimpiar={() => setRol('TODOS')} resultado={personal.length} unidad="colaborador">
        <GrupoFiltro titulo="Rol">
          <ChoiceChips label="Rol" value={rol} onChange={setRol} options={ROLES.map(r => ({ value: r, label: r === 'TODOS' ? 'Todos' : r }))} />
        </GrupoFiltro>
      </HojaFiltros>

      <div className="asis-leyenda">
        {CICLO.map(e => <span key={e} className={`asis-celda pressable asis-celda--${e}`} title={ESTADOS[e]}>{e}<small>{ESTADOS[e]}</small></span>)}
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
                <th className="asis-col-nombre">Colaborador · {personal.length}</th>
                {dias.map(d => {
                  const f = new Date(anio, mes - 1, d);
                  const finde = f.getDay() === 0 || f.getDay() === 6;
                  return <th key={d} className={finde ? 'asis-finde' : ''}><span>{DIAS_SEM[f.getDay()]}</span>{d}</th>;
                })}
                <th className="asis-th-tot" title="Días asistidos">Asist.</th><th className="asis-th-tot" title="Días en ruta">En ruta</th><th className="asis-th-tot" title="Faltas">Faltas</th><th className="asis-th-tot" title="Tardanzas">Tard.</th>
                <th className="asis-th-tot" title="Asistencia sobre los días esperados (sin descansos, feriados, vacaciones ni descansos médicos)">%</th>
              </tr>
            </thead>
            <tbody>
              {personal.map(p => {
                const est = dias.map(d => estadoDe(p.id, clave(anio, mes, d)));
                const c = (e: string) => est.filter(x => x === e).length;
                // % de asistencia: asistió, tardó o en ruta sobre los días esperados que ya pasaron
                const esperados = dias.filter((d, i) => clave(anio, mes, d) <= hoy && !NO_ESPERADOS.includes(est[i])).length;
                const pct = esperados ? ((c('A') + c('T') + c('R')) / esperados) * 100 : null;
                return (
                  <tr key={p.id}>
                    <td className="asis-col-nombre">
                      <strong>{p.apellidos}, {p.nombres}</strong>
                      <small>{p.numero_documento} · {p.categoria_rol}</small>
                    </td>
                    {dias.map((d, i) => {
                      const fecha = clave(anio, mes, d);
                      const reg = m?.tareo?.[p.id]?.[fecha];
                      const horas = reg?.hora_entrada ? ` · ${reg.hora_entrada}${reg.hora_salida ? ` a ${reg.hora_salida}` : ' (sin salida)'}` : '';
                      return (
                        <td key={d} className={fecha === hoy ? 'asis-hoy' : ''}>
                          <button type="button" disabled={!puedeEditar} className={`asis-celda pressable asis-celda--${est[i] || 'VACIO'}`}
                            title={`${fecha}: ${ESTADOS[est[i]] ?? 'Sin marcar'}${horas}`} onClick={() => rotar(p, d)}>
                            {est[i] || '·'}
                          </button>
                        </td>
                      );
                    })}
                    <td className="asis-tot asis-tot--A">{c('A')}</td>
                    <td className="asis-tot asis-tot--R">{c('R')}</td>
                    <td className="asis-tot asis-tot--F">{c('F')}</td>
                    <td className="asis-tot asis-tot--T">{c('T')}</td>
                    <td className={`asis-pct${pct === null ? '' : pct >= 90 ? ' asis-pct--ok' : pct >= 75 ? ' asis-pct--med' : ' asis-pct--bajo'}`}>{pct === null ? '—' : `${pct.toFixed(1)} %`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {puedeEditar && <p className="t-footnote c-secondary asis-pie">Toca una casilla para cambiar el estado: A → R → T → F → DM → V → D → FER.</p>}
    </div>
  );
}
