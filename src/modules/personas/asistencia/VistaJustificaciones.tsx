import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../../core/ui/Button';
import { BotonTip } from '../../../core/ui/BotonTip';
import { ChoiceChips } from '../../../core/ui/Chips';
import { Notice } from '../../../core/ui/Display';
import { SearchField } from '../../../core/ui/Field';
import { ConfirmSheet } from '../../../core/ui/Sheet';
import { useToast } from '../../../core/ui/Toast';
import { api, errorMessage } from '../../../core/api/client';
import { haptic } from '../../../core/lib/haptics';
import { MESES, dmy } from './datos';
import { TIPOS_LICENCIA } from './Hojas';

interface Licencia {
  id: number; personal_id: number; tipo: string; fecha_inicio: string; fecha_fin: string; dias_totales: number; motivo: string | null;
  estado: string | null; aprobado_por: string | null; nombres: string; apellidos: string; cargo: string | null;
}
const tipoTexto = (t: string) => TIPOS_LICENCIA.find(x => x.value === t)?.label.replace(/ \(.*\)$/, '') ?? t.replace(/_/g, ' ').toLowerCase();
const tonoTipo = (t: string) => (t === 'VACACIONES' ? 'V' : t === 'DESCANSO_MEDICO' ? 'DM' : 'P');

/** Justificaciones: vacaciones, descansos médicos y permisos del mes, con quién los aprobó. Al registrar una se aplica sola al tareo */
export function VistaJustificaciones({ puedeEditar, puedeEliminar, onNueva }: { puedeEditar: boolean; puedeEliminar: boolean; onNueva: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [tipo, setTipo] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [borrar, setBorrar] = useState<Licencia | null>(null);
  const [borrando, setBorrando] = useState(false);
  const q = useQuery<Licencia[]>({
    queryKey: ['rrhh', 'licencias'],
    queryFn: async () => ((await api<{ data: Licencia[] }>('/rrhh/licencias')).data ?? []),
  });

  const ini = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const fin = `${anio}-${String(mes).padStart(2, '0')}-${String(new Date(anio, mes, 0).getDate()).padStart(2, '0')}`;
  const filas = useMemo(() => {
    const t = busqueda.trim().toUpperCase();
    return (q.data ?? []).filter(l => String(l.fecha_inicio).slice(0, 10) <= fin && String(l.fecha_fin).slice(0, 10) >= ini)
      .filter(l => tipo === 'TODOS' || l.tipo === tipo)
      .filter(l => !t || `${l.apellidos} ${l.nombres} ${l.cargo ?? ''} ${l.motivo ?? ''}`.toUpperCase().includes(t));
  }, [q.data, ini, fin, tipo, busqueda]);

  function mover(d: 1 | -1) { const f = new Date(anio, mes - 1 + d, 1); setAnio(f.getFullYear()); setMes(f.getMonth() + 1); }

  async function eliminar() {
    if (!borrar) return;
    setBorrando(true);
    try {
      await api(`/rrhh/licencias/${borrar.id}`, { method: 'DELETE' });
      haptic('success'); toast('Justificación eliminada');
      setBorrar(null);
      await qc.invalidateQueries({ queryKey: ['rrhh', 'licencias'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setBorrando(false); }
  }

  return (
    <div className="asis-vista">
      <div className="asis-barra">
        <div className="asis-nav">
          <BotonTip tip="Mes anterior" className="btn btn--plain btn--icono" onClick={() => mover(-1)}><ChevronLeft size={18} /></BotonTip>
          <span className="asis-nav__mes">{MESES[mes - 1]} {anio}</span>
          <BotonTip tip="Mes siguiente" className="btn btn--plain btn--icono" onClick={() => mover(1)}><ChevronRight size={18} /></BotonTip>
        </div>
        <div className="asis-barra__buscar"><SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, cargo o motivo…" /></div>
        {puedeEditar && <Button variant="primary" icon={<Plus size={16} />} onClick={onNueva}>Justificar</Button>}
      </div>
      <div className="asis-barra asis-barra--chips">
        <ChoiceChips label="Tipo" value={tipo} onChange={setTipo} options={[{ value: 'TODOS', label: 'Todas' }, ...TIPOS_LICENCIA.map(t => ({ value: t.value, label: t.label.replace(/ \(.*\)$/, '') }))]} />
      </div>

      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : filas.length === 0 ? (
        <Notice tone="neutral">No hay justificaciones en {MESES[mes - 1].toLowerCase()} {anio}.</Notice>
      ) : (
        <div className="asis-lista asis-lista--just" role="table" aria-label="Justificaciones">
          <div className="asis-lista__cab" role="row">
            <span role="columnheader">Colaborador</span><span role="columnheader">Tipo</span><span role="columnheader">Periodo</span><span role="columnheader">Días</span><span role="columnheader">Motivo</span><span role="columnheader" className="asis-lista__acc" />
          </div>
          {filas.map(l => (
            <div key={l.id} className="asis-lista__fila" role="row">
              <span className="asis-lista__quien" role="cell"><strong>{l.apellidos}, {l.nombres}</strong><small>{l.cargo ?? ''}</small></span>
              <span role="cell"><span className={`asis-chip asis-chip--${tonoTipo(l.tipo)}`}>{tipoTexto(l.tipo)}</span></span>
              <span className="t-numeric" role="cell">{dmy(String(l.fecha_inicio))} – {dmy(String(l.fecha_fin))}</span>
              <span className="t-numeric" role="cell">{l.dias_totales}</span>
              <span className="asis-lista__detalle" role="cell">{l.motivo || '—'}{l.aprobado_por ? <small> · {l.aprobado_por}</small> : null}</span>
              <span className="asis-lista__acc" role="cell">
                {puedeEliminar && <BotonTip tip="Eliminar" className="btn btn--plain btn--icono" onClick={() => setBorrar(l)}><Trash2 size={17} /></BotonTip>}
              </span>
            </div>
          ))}
        </div>
      )}

      <ConfirmSheet open={!!borrar} onClose={() => !borrando && setBorrar(null)} onConfirm={eliminar} loading={borrando}
        title="¿Eliminar esta justificación?" message="Se quita el registro. Los días ya marcados en el tareo no cambian: corrígelos en Por periodo si hace falta." confirmLabel="Eliminar" />
    </div>
  );
}
