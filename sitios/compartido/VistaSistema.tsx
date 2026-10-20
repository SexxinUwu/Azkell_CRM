import { useEffect, useState, type ReactElement } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Boxes, History, LayoutDashboard, Wrench, type LucideIcon } from 'lucide-react';
import { Contador, resorte, resorteRapido } from './Movimiento';

// Maqueta fiel de pantallas reales del ERP (Torre de control, Status de rampa, Inventario, Auditoría).
// Mismo orden, nombres y estados que la aplicación; los datos son ficticios (ninguna empresa real).
const PANTALLAS: { id: string; etiqueta: string; Icono: LucideIcon }[] = [
  { id: 'torre', etiqueta: 'Torre de control', Icono: LayoutDashboard },
  { id: 'rampas', etiqueta: 'Status de rampa', Icono: Wrench },
  { id: 'almacen', etiqueta: 'Inventario', Icono: Boxes },
  { id: 'auditoria', etiqueta: 'Auditoría', Icono: History },
];

// Cada elemento entra con un desfase de 18 ms: toda la pantalla queda lista en ≈0.3 s
const entra = (i: number) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { ...resorte, delay: i * 0.018 } });

function Torre() {
  const barras = [46, 62, 54, 78, 66, 90, 72, 86, 70, 96, 82, 100];
  return (
    <>
      <div className="sis__cab"><h4>Torre de control</h4><span>Hoy</span></div>
      <div className="sis__kpis">
        {[['Unidades', 128, ''], ['OT abiertas', 17, ''], ['Disponibilidad', 94, ' %'], ['En rampa', 6, '']].map(([t, v, s], i) => (
          <motion.div key={t as string} className="sis__kpi" {...entra(i)}><small>{t}</small><b><Contador hasta={v as number} sufijo={s as string} /></b></motion.div>
        ))}
      </div>
      <motion.div className="sis__caja" {...entra(4)}>
        <div className="sis__cab" style={{ marginBottom: '0.5rem' }}><b>Órdenes cerradas por semana</b><span>Últimas 12</span></div>
        <div className="sis__grafico" aria-hidden>
          {barras.map((h, i) => (
            <motion.span key={i} style={{ height: `${h}%` }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ ...resorte, delay: 0.1 + i * 0.015 }} />
          ))}
        </div>
      </motion.div>
      <motion.div className="sis__caja" {...entra(5)}>
        {[['ABC-123', 'Tracto · Ruta Lima – Arequipa', 'En ruta', 'ok'], ['XYZ-456', 'Tracto · Cambio de frenos', 'En taller', 'alerta'], ['DEF-789', 'Carreta · Disponible en base', 'Disponible', 'info']].map(([p, d, e, t]) => (
          <div className="sis__fila" key={p}><div><b>{p}</b><small>{d}</small></div><span className={`sis__chip sis__chip--${t}`}>{e}</span></div>
        ))}
      </motion.div>
    </>
  );
}

function Rampas() {
  const datos = [
    ['Rampa 1', 'ABC-123', 'Cambio de filtros y aceite', 'En proceso', 'info', 72, 'JR'],
    ['Rampa 2', 'XYZ-456', 'Cambio de pastillas de freno', 'En proceso', 'info', 38, 'LM'],
    ['Rampa 3', 'GHI-012', 'Inspección preventiva', 'Por liberar', 'ok', 96, 'CP'],
    ['Rampa 4', 'JKL-345', 'Diagnóstico de motor', 'En espera', 'alerta', 12, 'RT'],
    ['Rampa 5', '—', 'Libre', 'Disponible', 'ok', 0, ''],
    ['Rampa 6', 'MNO-678', 'Cambio de neumáticos', 'En proceso', 'info', 55, 'AV'],
  ] as const;
  return (
    <>
      <div className="sis__cab"><h4>Status de rampa</h4><span>6 rampas · 4 con unidad</span></div>
      <div className="sis__rampas">
        {datos.map(([n, placa, trabajo, estado, tono, avance, tec], i) => (
          <motion.div key={n} className="sis__caja sis__rampa" {...entra(i)}>
            <header><span>{n}</span><span className={`sis__chip sis__chip--${tono}`}>{estado}</span></header>
            <p><b style={{ color: '#1d1d1f' }}>{placa}</b><br />{trabajo}</p>
            <div className="sis__progreso"><motion.span style={{ width: `${avance}%` }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...resorte, delay: 0.12 + i * 0.02 }} /></div>
            {tec && <div className="sis__tec"><i>{tec}</i>Técnico asignado</div>}
          </motion.div>
        ))}
      </div>
    </>
  );
}

function Almacen() {
  const filas = [
    ['ART-0101', 'Filtro de aire de cabina', '12', 'S/ 84.20', 'Stock OK', 'ok'],
    ['ART-0102', 'Filtro de combustible', '8', 'S/ 126.50', 'Stock OK', 'ok'],
    ['ART-0230', 'Neumático 295/80R22.5', '2', 'S/ 910.00', 'Stock bajo', 'alerta'],
    ['ART-0045', 'Refrigerante 50/50 (galón)', '40', 'S/ 38.90', 'Stock OK', 'ok'],
    ['ART-0317', 'Kit de embrague', '0', 'S/ 1,240.00', 'Sin stock', 'mal'],
  ] as const;
  return (
    <>
      <div className="sis__cab"><h4>Inventario</h4><span>Costo promedio en soles</span></div>
      <motion.div className="sis__caja" {...entra(0)} style={{ marginTop: 0 }}>
        <table className="sis__tabla">
          <thead><tr><th>Código</th><th>Artículo</th><th>Stock</th><th>Costo</th><th /></tr></thead>
          <tbody>
            {filas.map(([c, a, s, k, e, t], i) => (
              <motion.tr key={c} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...resorte, delay: 0.04 + i * 0.02 }}>
                <td className="sis__mono">{c}</td><td>{a}</td><td>{s}</td><td>{k}</td><td><span className={`sis__chip sis__chip--${t}`}>{e}</span></td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </>
  );
}

function Auditoria() {
  const eventos = [
    ['AV', 'Editó la regla de notificación', 'Regla de aprobación de O/C', '', '', '#e2edff', '#1f5fd1', 'hace 2 min'],
    ['LM', 'Ajustó el costo de un artículo', 'ART-0102 · costo en soles', 'S/ 131.40', 'S/ 126.50', '#fff1d6', '#a15c00', 'hace 14 min'],
    ['JR', 'Cerró la orden de trabajo OT-0727', 'Rampa 1 liberada', '', '', '#e3f6ea', '#17803d', 'hace 31 min'],
    ['CP', 'Inició sesión', 'Chrome (PC)', '', '', '#ececf0', '#555', 'hace 1 h'],
  ] as const;
  return (
    <>
      <div className="sis__cab"><h4>Auditoría</h4><span>Registro firmado</span></div>
      <motion.div className="sis__caja" {...entra(0)} style={{ marginTop: 0 }}>
        {eventos.map(([ini, t, d, de, a, bg, fg, h], i) => (
          <motion.div key={t + i} className="sis__aud" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...resorte, delay: 0.03 + i * 0.03 }}>
            <i style={{ background: bg, color: fg }}>{ini}</i>
            <div><b>{t}</b><br /><small>{d}</small>{de && <div><span className="sis__dif"><del>{de}</del> → <ins>{a}</ins></span></div>}</div>
            <small>{h}</small>
          </motion.div>
        ))}
      </motion.div>
    </>
  );
}

const CONTENIDO: Record<string, () => ReactElement> = { torre: Torre, rampas: Rampas, almacen: Almacen, auditoria: Auditoria };

/** Ventana interactiva del ERP: tocar una opción cambia de pantalla al instante; sola avanza hasta que la tocas */
export function VistaSistema({ compacta = false, logo = '/favicon.png' }: { compacta?: boolean; logo?: string }) {
  const [activa, setActiva] = useState('torre');
  const [manual, setManual] = useState(false);
  const reducir = useReducedMotion();

  useEffect(() => {
    if (manual || reducir) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      setActiva(a => PANTALLAS[(PANTALLAS.findIndex(p => p.id === a) + 1) % PANTALLAS.length].id);
    }, 5200);
    return () => clearInterval(t);
  }, [manual, reducir]);

  const Pantalla = CONTENIDO[activa];
  return (
    <div className={`sis${compacta ? ' sis--compacta' : ''}`}>
      <div className="sis__barra"><i /><i /><i /><span className="sis__url">tu-empresa.azkell.com</span></div>
      <div className="sis__cuerpo">
        <div className="sis__lado" role="tablist" aria-label="Pantallas del sistema">
          <div className="sis__marca"><img src={logo} alt="" /><span>Azkell</span></div>
          {PANTALLAS.map(({ id, etiqueta, Icono }) => (
            <button key={id} type="button" role="tab" className="sis__item" aria-selected={activa === id} title={etiqueta}
              onPointerDown={() => { setManual(true); setActiva(id); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setManual(true); setActiva(id); } }}>
              {activa === id && <motion.span layoutId={`pastilla-sis${compacta ? '-c' : ''}`} className="sis__pastilla" transition={resorteRapido} />}
              <Icono size={16} strokeWidth={1.9} /><span>{etiqueta}</span>
            </button>
          ))}
        </div>
        <div className="sis__pantalla">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={activa} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
              <Pantalla />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
