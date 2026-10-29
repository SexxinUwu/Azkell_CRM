// Croquis del Checklist de Entrega: dibujo técnico de la unidad (tracto, camión rígido, semirremolque, remolque)
// La configuración sale de la placa y del sistema; aquí solo se elige cabina y carrocería. Dibujo idéntico al clásico (ver croquisEntrega.ts).
import './ce-croquis.css';
import { useId } from 'react';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { CONFIG_CROQUIS, normalizarConfig, svgCroquis, type ConfigCroquis, type EstiloCabina } from './croquisEntrega';

export type EstiloCarroceria = 'furgon' | 'plataforma';

export interface CroquisValor {
  configuracion: ConfigCroquis;
  estiloCabina: EstiloCabina;
  estiloCarroceria: EstiloCarroceria;
}

const OPCIONES_CABINA: Array<{ value: EstiloCabina; label: string }> = [
  { value: 'chata', label: 'Cabina Europea (Chata)' },
  { value: 'trompa', label: 'Cabina Americana (Trompuda)' },
];
const OPCIONES_CARROCERIA: Array<{ value: EstiloCarroceria; label: string }> = [
  { value: 'furgon', label: 'Furgón Cerrado' },
  { value: 'plataforma', label: 'Plataforma Plana' },
];

// Los ids de los degradados se prefijan por instancia: dos croquis en la misma página (o uno oculto) no se pisan.
function prefijarIds(svg: string, prefijo: string): string {
  return svg.replace(/(id="|url\(#)ev(\w+Grad)/g, (_, pre: string, nombre: string) => `${pre}${prefijo}ev${nombre}`);
}

interface Props {
  configuracion: string;
  estiloCabina: EstiloCabina;
  estiloCarroceria: EstiloCarroceria;
  /** Sin edición solo se muestra el dibujo */
  editable: boolean;
  onChange: (c: CroquisValor) => void;
}

export function CeCroquis({ configuracion, estiloCabina, estiloCarroceria, editable, onChange }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const config = normalizarConfig(configuracion);
  const spec = CONFIG_CROQUIS[config];
  const svg = prefijarIds(svgCroquis(config, estiloCabina, estiloCarroceria === 'furgon'), `ce${uid}`);

  const cambiar = (parte: Partial<CroquisValor>) => {
    if (!editable) return;
    onChange({ configuracion: config, estiloCabina, estiloCarroceria, ...parte });
  };

  return (
    <section className={`ce-croquis${editable ? '' : ' ce-croquis--solo'}`} aria-label="Croquis de la unidad">
      {editable && (
        <div className="ce-croquis__cabecera">
          <div className="ce-croquis__titulo">
            <span className="ce-croquis__etiqueta">Diagrama técnico de la unidad</span>
            <span className="ce-croquis__tag">CONFIGURACIÓN: {config}</span>
          </div>
          <p className="ce-croquis__desc">{spec.desc}</p>

          <div className="ce-croquis__controles">
            {spec.esMotor && (
              <div className="ce-croquis__campo">
                <span className="ce-croquis__lbl">Cabina</span>
                <SegmentedControl label="Estilo de cabina" block value={estiloCabina} onChange={v => cambiar({ estiloCabina: v })} options={OPCIONES_CABINA} />
              </div>
            )}
            {spec.tieneCarroceria && (
              <div className="ce-croquis__campo">
                <span className="ce-croquis__lbl">Carrocería</span>
                <SegmentedControl label="Estilo de carrocería" block value={estiloCarroceria} onChange={v => cambiar({ estiloCarroceria: v })} options={OPCIONES_CARROCERIA} />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="ce-croquis__lienzo" role="img" aria-label={`Croquis: ${spec.nombre}`} dangerouslySetInnerHTML={{ __html: svg }} />

      {editable && (
        <p className="ce-croquis__pie">Diagrama vectorial 2D generado según la configuración técnica de la unidad (MTC).</p>
      )}
    </section>
  );
}

/**
 * SVG independiente del croquis para el PDF del acta (mismo dibujo que el clásico, fondo blanco, 920 × 340).
 * Acepta cualquier texto de configuración (p. ej. "6X4", "Volquete") y lo normaliza igual que el clásico.
 */
export function svgDiagramaEntrega(configuracion: string, estiloCabina: EstiloCabina, estiloCarroceria: EstiloCarroceria): string {
  const svg = svgCroquis(normalizarConfig(configuracion), estiloCabina, estiloCarroceria === 'furgon').trim();
  return svg.replace(/^<svg([^>]*)>/, (_, attrs: string) =>
    `<svg${attrs.replace('width="100%"', 'width="920" height="340"')}><rect width="920" height="340" fill="#ffffff" />`);
}
