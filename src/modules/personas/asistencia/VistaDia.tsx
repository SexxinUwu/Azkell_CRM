import { useMemo, useState } from 'react';
import { CalendarOff, Clock3, Percent, SlidersHorizontal, TimerReset, UserX } from 'lucide-react';
import { Button, PageLoader } from '../../../core/ui/Button';
import { BotonTip } from '../../../core/ui/BotonTip';
import { ChoiceChips } from '../../../core/ui/Chips';
import { Notice } from '../../../core/ui/Display';
import { SearchField, SelectInput } from '../../../core/ui/Field';
import { GrupoFiltro, HojaFiltros } from '../../../core/ui/FiltrosListado';
import { errorMessage } from '../../../core/api/client';
import { ROLES, areaDe, diaLargo, estadoEnDia, nombreCorto, pctTexto, resumir, tonoPct, useTareoMes, type Persona } from './datos';
import { ChipEstado, Indicador, NavDia } from './Piezas';

type FiltroEstado = 'todos' | 'sin' | 'tardanza' | 'falta' | 'justificados';

/** Del día: cómo está cada persona hoy (o en la fecha elegida), con su entrada y salida y las acciones para corregir */
export function VistaDia({ fecha, onFecha, hoy, area, onArea, puedeEditar, onRegistrarHora, onJustificar }: {
  fecha: string; onFecha: (f: string) => void; hoy: string; area: string; onArea: (a: string) => void;
  puedeEditar: boolean; onRegistrarHora: (p: Persona) => void; onJustificar: (p: Persona) => void;
}) {
  const anio = Number(fecha.slice(0, 4)); const mes = Number(fecha.slice(5, 7));
  const [rol, setRol] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [estadoF, setEstadoF] = useState<FiltroEstado>('todos');
  const [filtrando, setFiltrando] = useState(false);
  const q = useTareoMes(anio, mes, rol);
  const m = q.data;

  const filas = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return (m?.personal ?? []).map(p => {
      const reg = m?.tareo?.[p.id]?.[fecha];
      return { p, reg, estado: estadoEnDia(m, p, fecha, hoy) };
    }).filter(({ p, estado }) => {
      if (area !== 'TODAS' && areaDe(p) !== area) return false;
      if (t && !`${p.apellidos} ${p.nombres} ${p.numero_documento} ${p.cargo ?? ''}`.toUpperCase().includes(t)) return false;
      if (estadoF === 'sin') return estado === 'SIN';
      if (estadoF === 'tardanza') return estado === 'T';
      if (estadoF === 'falta') return estado === 'F';
      if (estadoF === 'justificados') return ['V', 'DM', 'P'].includes(estado);
      return true;
    }).sort((a, b) => {
      const orden = (e: string) => (e === 'SIN' ? 0 : e === 'F' ? 1 : e === 'T' ? 2 : 3);
      return orden(a.estado) - orden(b.estado) || nombreCorto(a.p).localeCompare(nombreCorto(b.p), 'es');
    });
  }, [m, fecha, hoy, busqueda, area, estadoF]);

  const resumen = useMemo(() => resumir((m?.personal ?? []).filter(p => area === 'TODAS' || areaDe(p) === area).map(p => estadoEnDia(m, p, fecha, hoy))), [m, fecha, hoy, area]);
  const areas = useMemo(() => [...new Set((m?.personal ?? []).map(areaDe))].sort((a, b) => a.localeCompare(b, 'es')), [m]);
  const activos = (rol !== 'TODOS' ? 1 : 0) + (area !== 'TODAS' ? 1 : 0) + (estadoF !== 'todos' ? 1 : 0);

  return (
    <div className="asis-vista">
      <div className="asis-barra">
        <NavDia fecha={fecha} onChange={onFecha} hoy={hoy} />
        <span className="asis-barra__dia t-footnote c-secondary">{diaLargo(fecha)}</span>
        <div className="asis-barra__buscar"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, documento o cargo…" /></div>
        <Button variant="secondary" icon={<SlidersHorizontal size={16} />} onClick={() => setFiltrando(true)} aria-label={activos ? `Filtros, ${activos} activos` : 'Filtros'}>
          <span className="placas-filtros__texto">Filtros</span>{activos > 0 && <span className="placas-filtros__n t-numeric">{activos}</span>}
        </Button>
      </div>

      <div className="asis-inds">
        <Indicador etiqueta="Sin marcar" valor={String(resumen.sinMarcar)} tono={resumen.sinMarcar ? 'bajo' : 'ok'} icono={<UserX size={18} />} nota="Sin hora ni justificación" />
        <Indicador etiqueta="Asistencia" valor={pctTexto(resumen.asistenciaPct)} tono={tonoPct(resumen.asistenciaPct) as 'ok' | 'med' | 'bajo' | ''} icono={<Percent size={18} />} nota={`${resumen.asistieron} de ${resumen.esperados}`} />
        <Indicador etiqueta="Puntualidad" valor={pctTexto(resumen.puntualidadPct)} tono={tonoPct(resumen.puntualidadPct) as 'ok' | 'med' | 'bajo' | ''} icono={<TimerReset size={18} />} nota={`${resumen.tardanzas} tardanza(s)`} />
        <Indicador etiqueta="Justificados" valor={String(resumen.justificados)} tono="info" icono={<CalendarOff size={18} />} nota="Vacaciones, descanso, permiso" />
      </div>

      <HojaFiltros open={filtrando} onClose={() => setFiltrando(false)} activos={activos} onLimpiar={() => { setRol('TODOS'); onArea('TODAS'); setEstadoF('todos'); }} resultado={filas.length} unidad="colaborador">
        <GrupoFiltro titulo="Estado del día">
          <ChoiceChips label="Estado del día" value={estadoF} onChange={v => setEstadoF(v as FiltroEstado)}
            options={[{ value: 'todos', label: 'Todos' }, { value: 'sin', label: 'Sin marcar' }, { value: 'tardanza', label: 'Tardanza' }, { value: 'falta', label: 'Falta' }, { value: 'justificados', label: 'Justificados' }]} />
        </GrupoFiltro>
        <GrupoFiltro titulo="Rol">
          <ChoiceChips label="Rol" value={rol} onChange={setRol} options={ROLES.map(r => ({ value: r, label: r === 'TODOS' ? 'Todos' : r }))} />
        </GrupoFiltro>
        <GrupoFiltro titulo="Área">
          <SelectInput aria-label="Área" value={area} onChange={e => onArea(e.target.value)}>
            <option value="TODAS">Todas las áreas</option>{areas.map(a => <option key={a} value={a}>{a}</option>)}
          </SelectInput>
        </GrupoFiltro>
      </HojaFiltros>

      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : filas.length === 0 ? (
        <Notice tone="neutral">Nadie coincide con los filtros.</Notice>
      ) : (
        <div className="asis-lista" role="table" aria-label="Asistencia del día">
          <div className="asis-lista__cab" role="row">
            <span role="columnheader">Colaborador</span><span role="columnheader">Cargo / Área</span><span role="columnheader">Estado</span><span role="columnheader">Entrada / Salida</span><span role="columnheader" className="asis-lista__acc">Acciones</span>
          </div>
          {filas.map(({ p, reg, estado }) => (
            <div key={p.id} className="asis-lista__fila" role="row">
              <span className="asis-lista__quien" role="cell"><strong>{nombreCorto(p)}</strong><small>{p.numero_documento}</small></span>
              <span className="asis-lista__cargo" role="cell"><span>{p.cargo || p.categoria_rol}</span><small>{areaDe(p)}</small></span>
              <span role="cell"><ChipEstado estado={estado} minutos={reg?.minutos_tardanza} /></span>
              <span className="asis-lista__horas t-numeric" role="cell">
                {reg?.hora_entrada ? <>{reg.hora_entrada}<i>–</i>{reg.hora_salida ?? <em>sin salida</em>}</> : <em>—</em>}
                {Number(reg?.horas_extras) > 0 && <small className="asis-lista__extra">+{Number(reg?.horas_extras)} h extra</small>}
              </span>
              <span className="asis-lista__acc" role="cell">
                {puedeEditar && fecha <= hoy && (
                  <>
                    <BotonTip tip={reg?.hora_entrada && !reg.hora_salida ? 'Completar salida' : reg?.hora_entrada ? 'Corregir marca' : 'Registrar hora'} className="btn btn--plain btn--icono btn--icono-acento" onClick={() => onRegistrarHora(p)}><Clock3 size={17} /></BotonTip>
                    <BotonTip tip="Justificar" className="btn btn--plain btn--icono asis-ico--morado" onClick={() => onJustificar(p)}><CalendarOff size={17} /></BotonTip>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
