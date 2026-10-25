import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Contrast, Globe, Hand, Layers, RotateCcw, Type, Vibrate } from 'lucide-react';
import { Page, PageHeader } from '../../core/ui/Display';
import { Button } from '../../core/ui/Button';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Switch } from '../../core/ui/Switch';
import { useToast } from '../../core/ui/Toast';
import { haptic } from '../../core/lib/haptics';
import { spring } from '../../core/lib/motion';
import {
  ESCALAS_TEXTO, NOMBRES_TAMANO, PERFILES, PREFERENCIAS_POR_DEFECTO, guardarPreferencias, leerPreferencias,
  perfilActivo, type ClavePerfil, type Preferencias,
} from '../../core/lib/preferencias';

const OPCIONES_PERFIL = (Object.keys(PERFILES) as ClavePerfil[]).map(value => ({ value, label: PERFILES[value].titulo }));

// Fila con texto visible; el interruptor ya vibra al tocar (haptics en Switch)
function Opcion({ id, titulo, detalle, checked, onChange }: {
  id: string; titulo: string; detalle?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="acc-fila">
      <span className="acc-fila__texto">
        <span className="acc-fila__titulo">{titulo}</span>
        {detalle && <span className="acc-fila__detalle">{detalle}</span>}
      </span>
      <Switch id={id} label={titulo} checked={checked} onChange={onChange} />
    </div>
  );
}

function Tarjeta({ titulo, icono, children }: { titulo: string; icono: ReactNode; children: ReactNode }) {
  return (
    <section className="card acc-tarjeta">
      <h2 className="acc-tarjeta__titulo">{icono}{titulo}</h2>
      {children}
    </section>
  );
}

// Accesibilidad e idioma: cada cambio se aplica al instante y se recuerda en este dispositivo.
export function AccesibilidadPage() {
  const toast = useToast();
  const reducir = useReducedMotion();
  const [p, setP] = useState<Preferencias>(() => leerPreferencias());
  const [guardadoEn, setGuardadoEn] = useState<number | null>(null);

  function cambiar(cambio: Partial<Preferencias>) {
    const siguiente = { ...p, ...cambio };
    setP(siguiente);
    guardarPreferencias(siguiente);
    setGuardadoEn(Date.now());
  }

  function aplicarPerfil(clave: ClavePerfil) {
    const siguiente = { ...PERFILES[clave].valores, vibracion: p.vibracion };
    setP(siguiente);
    guardarPreferencias(siguiente);
    setGuardadoEn(Date.now());
    haptic('selection');
    toast(`Perfil ${PERFILES[clave].titulo} aplicado`);
  }

  function restablecer() {
    setP({ ...PREFERENCIAS_POR_DEFECTO });
    guardarPreferencias({ ...PREFERENCIAS_POR_DEFECTO });
    setGuardadoEn(Date.now());
    haptic('success');
    toast('Valores restablecidos');
  }

  const porcentaje = Math.round(ESCALAS_TEXTO[p.tamano] * 100);
  const perfil = perfilActivo(p);

  return (
    <Page narrow>
      <PageHeader
        eyebrow="Sistema"
        title="Accesibilidad e idioma"
        subtitle="Ajusta cómo se ve y se siente Azkell Fleet en este dispositivo"
        actions={
          <AnimatePresence>
            {guardadoEn && (
              <motion.span key={guardadoEn} className="acc-guardado"
                initial={{ opacity: 0, scale: reducir ? 1 : 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring}>
                <Check size={16} strokeWidth={3} /> Guardado
              </motion.span>
            )}
          </AnimatePresence>
        }
      />

      {/* Perfiles de un toque: al cambiar uno, las opciones de abajo se actualizan solas */}
      <section className="acc-perfiles">
        <SegmentedControl<ClavePerfil | 'personal'> label="Perfiles rápidos" block
          value={perfil ?? 'personal'} onChange={v => v !== 'personal' && aplicarPerfil(v)} options={OPCIONES_PERFIL} />
        <p className="acc-perfiles__nota">
          {perfil ? PERFILES[perfil].detalle : 'Personalizado: ajustado a mano abajo'}
        </p>
      </section>

      {/* Vista previa: hereda el tamaño, la negrita y el contraste en vivo */}
      <section className="acc-vista" aria-label="Vista previa">
        <span className="t-eyebrow">Vista previa</span>
        <motion.div key={p.tamano} className="acc-vista__fila"
          initial={{ scale: reducir ? 1 : 0.96, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
          <span className="acc-vista__icono"><Type size={18} /></span>
          <span className="acc-fila__texto">
            <strong className="acc-vista__titulo">Placa ABC-123</strong>
            <span className="acc-vista__cuerpo">Cambio de aceite · texto al {porcentaje}%</span>
          </span>
        </motion.div>
        <p className="acc-vista__cuerpo">Así se leerán las órdenes de trabajo, las placas y los reportes.</p>
      </section>

      <Tarjeta titulo="Texto" icono={<Type size={16} />}>
        <div className="acc-tamano">
          <span className="acc-fila__titulo">Tamaño · {NOMBRES_TAMANO[p.tamano]}</span>
          <input type="range" min={0} max={ESCALAS_TEXTO.length - 1} step={1} value={p.tamano}
            aria-label="Tamaño del texto" onChange={e => cambiar({ tamano: Number(e.target.value) })} />
          <div className="acc-tamano__escala" aria-hidden><span>A</span><span style={{ fontSize: '1.2em' }}>A</span><span style={{ fontSize: '1.5em' }}>A</span></div>
        </div>
        <Opcion id="acc-negrita" titulo="Texto en negrita" detalle="Letras más gruesas en toda la app"
          checked={p.negrita} onChange={v => cambiar({ negrita: v })} />
      </Tarjeta>

      <Tarjeta titulo="Pantalla" icono={<Contrast size={16} />}>
        <Opcion id="acc-contraste" titulo="Alto contraste" detalle="Bordes y textos secundarios más marcados"
          checked={p.altoContraste} onChange={v => cambiar({ altoContraste: v })} />
        <Opcion id="acc-movimiento" titulo="Reducir movimiento" detalle="Sin deslizamientos ni rebotes"
          checked={p.reducirMovimiento} onChange={v => cambiar({ reducirMovimiento: v })} />
        <Opcion id="acc-transparencia" titulo="Reducir transparencias" detalle="Superficies sólidas, sin desenfoque"
          checked={p.reducirTransparencia} onChange={v => cambiar({ reducirTransparencia: v })} />
      </Tarjeta>

      <Tarjeta titulo="Uso táctil" icono={<Hand size={16} />}>
        <Opcion id="acc-botones" titulo="Botones y filas más grandes" detalle="Más fáciles de tocar con el dedo o con guantes"
          checked={p.botonesGrandes} onChange={v => cambiar({ botonesGrandes: v })} />
        <Opcion id="acc-vibracion" titulo="Vibración al tocar" detalle="Respuesta háptica en Android"
          checked={p.vibracion} onChange={v => cambiar({ vibracion: v })} />
        <div>
          <Button variant="secondary" icon={<Vibrate size={16} />} disabled={!p.vibracion} onClick={() => haptic('success')}>
            Probar vibración
          </Button>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Idioma y región" icono={<Globe size={16} />}>
        <div className="acc-vista__fila">
          <span className="acc-vista__icono"><Layers size={18} /></span>
          <span className="acc-fila__texto">
            <strong>Español (Perú)</strong>
            <span className="acc-fila__detalle">Fechas dd/mm/aaaa, moneda sol (S/) y hora de Lima. La app está en español por ahora.</span>
          </span>
          <Check size={18} className="acc-marca" aria-label="Seleccionado" />
        </div>
      </Tarjeta>

      <div className="acc-pie">
        <Button variant="plain" icon={<RotateCcw size={16} />} onClick={restablecer}>Restablecer valores</Button>
      </div>
    </Page>
  );
}
