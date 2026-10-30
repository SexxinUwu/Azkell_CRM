import { useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { History, Pencil, Printer, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../core/auth/AuthProvider';
import { useToast } from '../../core/ui/Toast';
import { apiFetch } from '../../core/api/client';
import { useHistorial, type Placa } from './api';
import { formatRelative } from '../../core/lib/format';
import { NeumaticosPlacaTab } from '../mantenimiento/NeumaticosPlacaTab';
import { NeumaticosHistorialPlaca } from '../mantenimiento/NeumaticosHistorialPlaca';
import { PERMISO_VER_NEUMATICOS } from '../mantenimiento/neumaticos-tablero-tipos';
import { PlfTabs, type TabFicha } from './PlfTabs';
import { PlfInspecciones } from './PlfInspecciones';
import './plf.css';

// Ficha de una unidad: placa grande, pestañas y datos agrupados. Solo consulta.
// Pestañas: Visión general (datos de la unidad), Neumáticos (tablero de llantas) e Inspecciones.
// La pestaña activa va en la URL (?tab=) para enlazarla y recargarla.
export function PlacaFicha({ placa, onClose, onEditar, onEliminar }: { placa: Placa | null; onClose: () => void; onEditar?: (p: Placa) => void; onEliminar?: (p: Placa) => void }) {
  // Se conserva la última placa mientras la hoja se cierra (anima con su contenido)
  const ultima = useRef<Placa | null>(null);
  if (placa) ultima.current = placa;
  const p = placa ?? ultima.current;
  const reduce = useReducedMotion();
  const { can } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);

  // Neumáticos e inspecciones de neumáticos solo con permiso de ver neumáticos
  const puedeVerNeumaticos = can(PERMISO_VER_NEUMATICOS);
  const tabs: Array<{ id: TabFicha; label: string }> = puedeVerNeumaticos
    ? [{ id: 'general', label: 'Visión general' }, { id: 'neumaticos', label: 'Neumáticos' }, { id: 'inspecciones', label: 'Inspecciones' }]
    : [{ id: 'general', label: 'Visión general' }];
  const pedida = params.get('tab');
  const tab: TabFicha = tabs.some(t => t.id === pedida) ? (pedida as TabFicha) : 'general';

  function cambiarTab(id: TabFicha) {
    const siguiente = new URLSearchParams(params);
    siguiente.set('tab', id);
    setParams(siguiente, { replace: true });
  }

  // Abre el mapa de llantas (PDF generado en el servidor) en una pestaña nueva
  async function imprimirMapa(placaNombre: string) {
    if (imprimiendo) return;
    // La pestaña se abre dentro del gesto del usuario, antes del fetch, para que el navegador no la bloquee
    const ventana = window.open('', '_blank');
    if (!ventana) {
      toast('Permite las ventanas emergentes para ver el mapa.', 'error');
      return;
    }
    setImprimiendo(true);
    try {
      let res: Response;
      try {
        res = await apiFetch(`/neumaticos/mapa-pdf/${encodeURIComponent(placaNombre)}`);
      } catch {
        throw new Error('No hay conexión con el servidor.');
      }
      if (!res.ok) {
        const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(cuerpo?.error || `No se pudo generar el mapa (HTTP ${res.status}).`);
      }
      const url = URL.createObjectURL(await res.blob());
      ventana.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
      haptic('success');
    } catch (err) {
      ventana.close();
      toast(err instanceof Error ? err.message : 'No se pudo abrir el mapa.', 'error');
    } finally {
      setImprimiendo(false);
    }
  }

  const seccion = (i: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 10 },
    animate: { opacity: 1, y: 0 },
    transition: { ...spring, delay: reduce ? 0 : 0.06 + 0.04 * i },
  });

  return (
    <Sheet
      open={!!placa}
      onClose={onClose}
      title={p ? `Unidad ${p.placa}` : 'Unidad'}
      footer={
        <>
          {onEliminar && p ? (
            <Button variant="plain" className="ficha__eliminar" icon={<Trash2 size={16} />} onClick={() => onEliminar(p)}>Eliminar</Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          )}
          {onEditar && p && (
            <Button variant="primary" icon={<Pencil size={16} />} onClick={() => onEditar(p)}>Editar</Button>
          )}
        </>
      }
    >
      {p && (
        <div className="ficha">
          <motion.div className="ficha__hero" initial={{ opacity: 0, scale: reduce ? 1 : 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
            <LicensePlate plate={p.placa} size="xl" />
            <div className="ficha__titulo">{[p.marca, p.modelo].filter(Boolean).join(' ') || 'Sin marca'}</div>
            <div className="ficha__chips">
              <span className={`placa-estado placa-estado--${p.estado.toLowerCase() === 'activa' ? 'on' : 'off'}`}>{p.estado}</span>
              <span className="chip chip--static">{p.motora ? 'Motora' : 'No motora'}</span>
              {p.tipo && <span className="chip chip--static">{p.tipo}</span>}
              {p.configuracion && <span className="chip chip--static">{p.configuracion}</span>}
            </div>
          </motion.div>

          {puedeVerNeumaticos && <PlfTabs tabs={tabs} value={tab} onChange={cambiarTab} />}

          <div className="plf-panel" role="tabpanel" id={`plf-panel-${tab}`} aria-labelledby={`plf-tab-${tab}`}>
            {tab === 'general' && (
              <>
                <motion.div {...seccion(0)}>
                  <Grupo titulo="General">
                    <Dato label="Cliente" value={p.cliente} />
                    <Dato label="RUC / DNI" value={p.ruc} mono />
                    <Dato label="Año" value={p.anio} />
                    <Dato label="Color" value={p.color} />
                    <Dato label="Sub tipo" value={p.subTipo} />
                  </Grupo>
                </motion.div>

                <motion.div {...seccion(1)}>
                  <Grupo titulo="Técnico">
                    <Dato label="Modelo de motor" value={p.modeloMotor} />
                    <Dato label="N.º de motor" value={p.nroMotor} mono />
                    <Dato label="N.º de caja" value={p.nroCaja} mono />
                    <Dato label="N.º de corona" value={p.nroCorona} mono />
                    <Dato label="VIN" value={p.vin} mono />
                    <Dato label="Llantas" value={p.llantas} />
                  </Grupo>
                </motion.div>

                <motion.div {...seccion(2)}>
                  <Grupo titulo="Capacidad">
                    <Dato label="Combustible" value={p.combustible} />
                    <Dato label="Tanques" value={[p.tanque1, p.tanque2, p.tanque3].filter(Boolean).join(' · ')} />
                    <Dato label="Capacidad total" value={p.capacidadTanque} />
                    <Dato label="Carga útil" value={p.cargaUtil} />
                    <Dato label="Peso neto" value={p.pesoNeto} />
                    <Dato label="Peso bruto" value={p.pesoBruto} />
                    <Dato label="Tara" value={p.tara} />
                  </Grupo>
                </motion.div>

                <motion.div {...seccion(3)}>
                  <Grupo titulo="Operación">
                    <Dato label="En uso" value={p.enUso ? 'Sí' : 'No'} />
                    <Dato label="UTS" value={p.uts} />
                    <Dato label="Unidad en Wialon (GPS)" value={p.wialon} />
                  </Grupo>
                </motion.div>

                <motion.div {...seccion(4)}>
                  <Historial placa={placa ? p.placa : null} />
                </motion.div>
              </>
            )}

            {tab === 'neumaticos' && puedeVerNeumaticos && (
              <>
                <div className="plf-barra">
                  <Button variant="secondary" size="sm" icon={<Printer size={16} />} loading={imprimiendo} onClick={() => imprimirMapa(p.placa)}>
                    Imprimir mapa
                  </Button>
                </div>
                <NeumaticosPlacaTab placa={p.placa} />
              </>
            )}

            {tab === 'inspecciones' && puedeVerNeumaticos && (
              <PlfInspecciones placa={p.placa} onVerHistorial={() => setHistorialAbierto(true)} />
            )}
          </div>

          {puedeVerNeumaticos && (
            <NeumaticosHistorialPlaca placa={p.placa} open={historialAbierto} onClose={() => setHistorialAbierto(false)} />
          )}
        </div>
      )}
    </Sheet>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="ficha__grupo">
      <div className="list__header">{titulo}</div>
      <div className="list">{children}</div>
    </section>
  );
}

function Dato({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="row ficha__dato">
      <span className="row__main ficha__label">{label}</span>
      <span className={`ficha__valor${mono ? ' ficha__valor--mono' : ''}${value ? '' : ' ficha__valor--vacio'}`}>{value || '—'}</span>
    </div>
  );
}

const NOMBRES: Record<string, string> = {
  cliente: 'Cliente', ruc_dni: 'RUC / DNI', marca: 'Marca', modelo_uts: 'Modelo', tipo: 'Tipo', sub_tipo: 'Sub tipo', color: 'Color',
  nro_motor: 'N.º de motor', modelo_motor: 'Modelo de motor', nro_caja: 'N.º de caja', nro_corona: 'N.º de corona', nro_vin: 'VIN',
  configuracion: 'Configuración', tanque_1: 'Tanque 1', tanque_2: 'Tanque 2', tanque_3: 'Tanque 3', capacidad_tanque: 'Capacidad total',
  anio: 'Año', combustible: 'Combustible', tara: 'Tara', carga_util: 'Carga útil', peso_neto: 'Peso neto', peso_bruto: 'Peso bruto',
  estado: 'Estado', uts: 'UTS', motora: 'Clase', llantas: 'Llantas', en_uso: 'En uso', metrica: 'Métrica', wialon_name: 'Wialon',
};

// Historial de cambios (placa_auditoria): quién cambió qué y cuándo
function Historial({ placa }: { placa: string | null }) {
  const { data, isLoading } = useHistorial(placa);
  const reduce = useReducedMotion();
  const cambios = data ?? [];
  return (
    <section className="ficha__grupo">
      <div className="list__header">Historial de cambios</div>
      {isLoading ? (
        <p className="t-footnote c-secondary historial__vacio">Cargando…</p>
      ) : cambios.length === 0 ? (
        <p className="t-footnote c-secondary historial__vacio"><History size={14} /> Sin cambios registrados.</p>
      ) : (
        <ol className="historial">
          {cambios.slice(0, 30).map((c, i) => (
            <motion.li key={c.id} className="historial__item"
              initial={{ opacity: 0, x: reduce ? 0 : -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring, delay: reduce ? 0 : Math.min(i, 10) * 0.03 }}>
              <span className="historial__punto" aria-hidden />
              <div className="historial__cuerpo">
                <div className="historial__titulo"><strong>{NOMBRES[c.campo] ?? c.campo}</strong></div>
                <div className="historial__valores">
                  <span className="historial__antes">{c.valor_ant || 'vacío'}</span>
                  <span aria-hidden>→</span>
                  <span className="historial__despues">{c.valor_nuevo || 'vacío'}</span>
                </div>
                <div className="t-caption c-tertiary">{[c.usuario, formatRelative(c.fecha)].filter(Boolean).join(' · ')}</div>
              </div>
            </motion.li>
          ))}
        </ol>
      )}
    </section>
  );
}
