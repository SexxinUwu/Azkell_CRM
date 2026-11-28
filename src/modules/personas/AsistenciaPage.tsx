import { hoyLima } from '../../core/lib/format';
import '../mantenimiento/mant.css';
import '../flota/documentos.css';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CalendarCheck, CalendarOff, CheckCheck, Clock3, LayoutGrid, ListChecks, QrCode, RefreshCw, ScanLine, Sun } from 'lucide-react';
import { Page } from '../../core/ui/Display';
import { BotonTip } from '../../core/ui/BotonTip';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { spring } from '../../core/lib/motion';
import { HorariosSheet } from './HorariosSheet';
import { useTareoMes, type Persona } from './asistencia/datos';
import { LicenciaSheet, RegistrarHoraSheet } from './asistencia/Hojas';
import { Pestanas, type PestanaDef } from './asistencia/Piezas';
import { VistaArea } from './asistencia/VistaArea';
import { VistaDia } from './asistencia/VistaDia';
import { VistaJustificaciones } from './asistencia/VistaJustificaciones';
import { VistaMarcaciones } from './asistencia/VistaMarcaciones';
import { VistaPeriodo } from './asistencia/VistaPeriodo';
import './asistencia.css';

type IdVista = 'dia' | 'area' | 'periodo' | 'marcaciones' | 'justificaciones';
const VISTAS: PestanaDef<IdVista>[] = [
  { id: 'dia', etiqueta: 'Del día', icono: <Sun size={16} /> },
  { id: 'area', etiqueta: 'Tablero por área', icono: <LayoutGrid size={16} /> },
  { id: 'periodo', etiqueta: 'Por periodo', icono: <ListChecks size={16} /> },
  { id: 'marcaciones', etiqueta: 'Marcaciones', icono: <ScanLine size={16} /> },
  { id: 'justificaciones', etiqueta: 'Justificaciones', icono: <CalendarCheck size={16} /> },
];
const CLAVE_VISTA = 'fleet_asistencia_vista';

function vistaGuardada(): IdVista {
  try { const v = localStorage.getItem(CLAVE_VISTA) as IdVista | null; if (v && VISTAS.some(x => x.id === v)) return v; } catch { /* sin almacenamiento */ }
  return 'dia';
}

// Personas y seguridad › Asistencia: cinco vistas (del día, por área, por periodo, marcaciones y justificaciones) y las acciones del módulo.
export function AsistenciaPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = useAuth();
  const reducir = useReducedMotion();
  const hoy = hoyLima();
  const [vista, setVista] = useState<IdVista>(vistaGuardada);
  const [fecha, setFecha] = useState(hoy);          // día que comparten Del día, Tablero por área y Marcaciones
  const [area, setArea] = useState('TODAS');
  const [confirmarHoy, setConfirmarHoy] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [horarios, setHorarios] = useState(false);
  const [licencia, setLicencia] = useState<{ personaId: number; fecha: string } | 'nueva' | null>(null);
  const [registrando, setRegistrando] = useState<Persona | null>(null);
  // Editar: tareo (estados, marcar hoy, sincronizar). Crear: marcar a mano, justificar, horarios y marcación QR
  const puedeEditar = can('rrhh_asistencia.editar');
  const puedeCrear = can('rrhh_asistencia.crear');
  const puedeEliminar = can('rrhh_asistencia.eliminar');

  const mes = useTareoMes(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)));
  const personalTodo = useMemo(() => mes.data?.personal ?? [], [mes.data]);

  const cambiarVista = useCallback((v: IdVista) => {
    setVista(v);
    try { localStorage.setItem(CLAVE_VISTA, v); } catch { /* sin almacenamiento */ }
  }, []);

  async function autocompletarHoy() {
    setOcupado(true);
    try {
      await api('/rrhh/tareo/guardar', {
        method: 'POST',
        body: { items: personalTodo.map(p => ({ personal_id: p.id, fecha: hoy, estado: p.categoria_rol === 'CONDUCTOR' ? 'R' : 'A', minutos_tardanza: 0 })) },
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
      const r = await api<{ message?: string }>('/rrhh/tareo/sincronizar-viajes', { method: 'POST', body: { fecha: hoy } });
      haptic('success'); toast(r.message || 'Sincronización completada');
      await qc.invalidateQueries({ queryKey: ['rrhh', 'tareo'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  const tieneIngreso = !!(registrando && mes.data && fecha.slice(0, 7) === hoy.slice(0, 7) && mes.data.tareo?.[registrando.id]?.[fecha]?.hora_entrada);

  return (
    <Page wide fill>
      <header className="doc-cab asis-cab asis-cab--shell">
        <div className="doc-cab__titulo">
          <span className="t-eyebrow">Personas y seguridad</span>
          <h1 className="doc-cab__h1">Asistencia</h1>
        </div>
        <Pestanas pestanas={VISTAS} activa={vista} onChange={cambiarVista} etiqueta="Vistas de asistencia" />
        <div className="doc-cab__acciones">
          {puedeCrear && <BotonTip tip="Marcación por QR" className="btn btn--plain btn--icono btn--icono-acento" onClick={() => navigate('/personas/marcacion')}><QrCode size={18} /></BotonTip>}
          {puedeCrear && <BotonTip tip="Horarios de trabajo" className="btn btn--plain btn--icono asis-ico--ambar" onClick={() => setHorarios(true)}><Clock3 size={18} /></BotonTip>}
          {puedeEditar && <BotonTip tip="Marcar asistencia de hoy" className="btn btn--plain btn--icono asis-ico--azul" onClick={() => setConfirmarHoy(true)}><CheckCheck size={18} /></BotonTip>}
          {puedeEditar && <BotonTip tip="Sincronizar con viajes" className="btn btn--plain btn--icono btn--icono-acento" disabled={ocupado} onClick={sincronizar}><RefreshCw size={18} /></BotonTip>}
          {puedeCrear && <BotonTip tip="Justificar: licencia o vacaciones" className="btn btn--plain btn--icono asis-ico--morado" onClick={() => setLicencia('nueva')}><CalendarOff size={18} /></BotonTip>}
        </div>
      </header>

      <div className="asis-cuerpo">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={vista} className="asis-cambio" initial={{ opacity: 0, y: reducir ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={reducir ? { duration: 0.12 } : spring}>
            {vista === 'dia' && (
              <VistaDia fecha={fecha} onFecha={setFecha} hoy={hoy} area={area} onArea={setArea} puedeEditar={puedeCrear}
                onRegistrarHora={setRegistrando} onJustificar={p => setLicencia({ personaId: p.id, fecha })} />
            )}
            {vista === 'area' && (
              <VistaArea fecha={fecha} onFecha={setFecha} hoy={hoy} onAbrirArea={a => { setArea(a); cambiarVista('dia'); }} />
            )}
            {vista === 'periodo' && <VistaPeriodo hoy={hoy} puedeEditar={puedeEditar} />}
            {vista === 'marcaciones' && <VistaMarcaciones fecha={fecha} onFecha={setFecha} hoy={hoy} puedeMarcar={puedeCrear} />}
            {vista === 'justificaciones' && <VistaJustificaciones puedeEditar={puedeCrear} puedeEliminar={puedeEliminar} onNueva={() => setLicencia('nueva')} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <ConfirmSheet open={confirmarHoy} onClose={() => !ocupado && setConfirmarHoy(false)} onConfirm={autocompletarHoy} loading={ocupado}
        title="¿Marcar la asistencia de hoy?" message={`Se marcará "Asistió" (y "En ruta" a los conductores) para ${personalTodo.length} colaboradores. Reemplaza lo que ya esté marcado hoy.`} confirmLabel="Marcar" />
      <HorariosSheet open={horarios} personal={personalTodo} onClose={() => setHorarios(false)} />
      <LicenciaSheet open={!!licencia} personal={personalTodo} inicial={licencia && licencia !== 'nueva' ? licencia : null} onClose={() => setLicencia(null)} />
      <RegistrarHoraSheet open={!!registrando} persona={registrando} fecha={fecha} tieneIngreso={tieneIngreso} onClose={() => setRegistrando(null)} />
    </Page>
  );
}
