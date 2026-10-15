import { motion } from 'motion/react';
import { Eye, FileText, Truck } from 'lucide-react';
import { EmptyState } from '../../core/ui/Display';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Button } from '../../core/ui/Button';
import { spring } from '../../core/lib/motion';
import type { VehiculoFlota } from './api';
import { colorDoc, textoDias, type DocVehiculo, type MetaVehiculo } from './docsEstado';

/** AAAA-MM-DD → DD/MM/AAAA; cualquier otro texto se muestra igual */
const fechaLegible = (t: string) => (/^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10).split('-').reverse().join('/') : t);

export interface FilaExpediente { v: VehiculoFlota; m: MetaVehiculo }

// Expediente de la unidad: la lista a la izquierda y las tarjetas de sus documentos a la derecha
export function DocExpediente({ filas, placa, onElegir, puedeEditar, onCargar, onVerArchivo }: {
  filas: FilaExpediente[];
  placa: string | null;
  onElegir: (placa: string) => void;
  puedeEditar: boolean;
  onCargar: (placa: string, prefijo: string | null) => void;
  onVerArchivo: (url: string) => void;
}) {
  const seleccion = filas.find(f => f.v.placa === placa) ?? filas[0] ?? null;

  if (!seleccion) {
    return <EmptyState icon={<Truck size={22} />} title="Sin unidades">No hay unidades para los filtros actuales.</EmptyState>;
  }

  return (
    <div className="doc-expediente">
      <ul className="doc-lista" aria-label="Unidades">
        {filas.map(({ v, m }) => {
          const activa = seleccion.v.placa === v.placa;
          return (
            <li key={v.placa}>
              <button type="button" className={`doc-unidad${activa ? ' doc-unidad--activa' : ''}`} onClick={() => onElegir(v.placa)} aria-current={activa}>
                <span className="doc-unidad__icono" style={{ background: `${m.peor.color}1f`, color: m.peor.color }} aria-hidden><FileText size={17} strokeWidth={1.9} /></span>
                <LicensePlate plate={v.placa} size="sm" />
                <span className="doc-punto" style={{ background: m.peor.color }} title={m.peor.texto} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      <motion.section className="doc-ficha" key={seleccion.v.placa}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} aria-label={`Documentos de ${seleccion.v.placa}`}>
        <header className="doc-ficha__cab">
          <span className="doc-ficha__icono"><Truck size={22} strokeWidth={1.8} /></span>
          <div className="doc-ficha__titulo">
            <div className="doc-ficha__linea">
              <strong className="doc-ficha__placa">{seleccion.v.placa}</strong>
              {seleccion.v.tipo && <span className="doc-etiqueta">{seleccion.v.tipo.toUpperCase()}</span>}
            </div>
            <span className="doc-ficha__sub">
              {[seleccion.v.marca, seleccion.v.modelo].filter(Boolean).join(' ') || 'Sin marca'}
              {seleccion.v.anio ? ` · Año: ${seleccion.v.anio}` : ''}
              {seleccion.v.chasis ? ` · Chasis: ${seleccion.v.chasis}` : ''}
            </span>
          </div>
          <div className="doc-salud" aria-label={`Salud de documentos ${seleccion.m.salud}%`}>
            <span className="doc-salud__texto">Salud</span>
            <span className="doc-salud__barra"><span style={{ width: `${seleccion.m.salud}%`, background: seleccion.m.peor.color }} /></span>
            <strong>{seleccion.m.salud}%</strong>
          </div>
        </header>

        <div className="doc-tarjetas">
          {seleccion.m.docs.map(d => (
            <TarjetaDoc key={d.config.clave} d={d} v={seleccion.v} puedeEditar={puedeEditar}
              onCargar={() => onCargar(seleccion.v.placa, d.config.prefijo)} onVerArchivo={onVerArchivo} />
          ))}
        </div>
      </motion.section>
    </div>
  );
}

function TarjetaDoc({ d, v, puedeEditar, onCargar, onVerArchivo }: {
  d: DocVehiculo; v: VehiculoFlota; puedeEditar: boolean; onCargar: () => void; onVerArchivo: (url: string) => void;
}) {
  const cfg = d.config;
  const color = colorDoc(cfg.num);
  const url = String(v[`${cfg.prefijo}_url`] ?? '').trim();
  const datos = cfg.datos
    .map(x => ({ etiqueta: x.etiqueta, valor: fechaLegible(String(v[x.campo] ?? '').trim()) }))
    .filter(x => x.valor && x.valor !== '---');
  const venc = v[cfg.vencimiento] ? String(v[cfg.vencimiento]).slice(0, 10) : '';
  const [anio, mes, dia] = venc ? venc.split('-') : [];

  if (!d.registrado) {
    return (
      <article className="doc-card doc-card--vacia" style={{ '--doc-color': color } as React.CSSProperties}>
        <header className="doc-card__cab">
          <span className="doc-card__num">{cfg.num}</span>
          <span className="doc-card__titulo">{cfg.titulo}</span>
        </header>
        <p className="doc-card__vacio">Sin registrar</p>
        {puedeEditar && <Button variant="secondary" size="sm" onClick={onCargar}>Cargar</Button>}
      </article>
    );
  }

  return (
    <article className="doc-card" style={{ '--doc-color': color, '--estado-color': d.estado.color } as React.CSSProperties}>
      <header className="doc-card__cab">
        <span className="doc-card__num">{cfg.num}</span>
        <span className="doc-card__titulo">{cfg.titulo}</span>
      </header>
      <dl className="doc-card__filas">
        {datos.map(x => (
          <div key={x.etiqueta}><dt>{x.etiqueta}</dt><dd>{x.valor}</dd></div>
        ))}
        <div><dt>Vencimiento</dt><dd>{venc ? `${dia}/${mes}/${anio}` : '—'}</dd></div>
      </dl>
      <footer className="doc-card__pie">
        <span className="doc-card__estado-etiqueta">Estado</span>
        <span className="doc-card__estado" style={{ color: d.estado.color }}>{textoDias(d.estado)}</span>
      </footer>
      <div className="doc-card__acciones">
        {url && <Button variant="secondary" size="sm" icon={<Eye size={14} />} onClick={() => onVerArchivo(url)}>Ver archivo</Button>}
        {puedeEditar && <Button variant="secondary" size="sm" icon={<FileText size={14} />} onClick={onCargar}>Actualizar</Button>}
      </div>
    </article>
  );
}

