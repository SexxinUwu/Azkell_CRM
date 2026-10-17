import { useState } from 'react';
import { motion } from 'motion/react';
import { Eye, FileText, History, MessageCircle, Trash2, Truck } from 'lucide-react';
import { EmptyState } from '../../core/ui/Display';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Button } from '../../core/ui/Button';
import { spring } from '../../core/lib/motion';
import { useHistorialDocumentos, type RegistroHistorial, type VehiculoFlota } from './api';
import {
  COLOR_PERSONALIZADO, colorDoc, textoDias, type DocPersonalizado, type EstadoDoc, type MetaVehiculo,
} from './docsEstado';
import { formatFechaPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';

/** AAAA-MM-DD → DD/MM/AAAA; cualquier otro texto se muestra igual */
const fechaLegible = (t: string) => (/^\d{4}-\d{2}-\d{2}/.test(t) ? formatFechaPe(t) : t);
const esUrl = (t: string | null | undefined): t is string => !!t && /^https?:\/\//.test(t);
/** Texto para comparar tipos: sin acentos, espacios ni signos */
const norma = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');

/** Filas del historial que son de este tipo de documento (misma clave que usa el clásico) */
function delTipo(h: RegistroHistorial, tipoKey: string, titulo: string) {
  const t = norma(h.tipo_documento ?? '');
  return t === norma(tipoKey) || t.includes(norma(tipoKey)) || t === norma(titulo);
}

export interface FilaExpediente { v: VehiculoFlota; m: MetaVehiculo }

export interface EliminarDocumento { placa: string; tipoKey: string; titulo: string; url: string | null }

interface Props {
  filas: FilaExpediente[];
  placa: string | null;
  onElegir: (placa: string) => void;
  puedeEditar: boolean;
  onCargar: (placa: string, prefijo: string) => void;
  onEditarPersonalizado: (placa: string, doc: DocPersonalizado) => void;
  onVerArchivo: (url: string) => void;
  onCompartir: (url: string, titulo: string, placa: string) => void;
  onEliminar: (doc: EliminarDocumento) => void;
}

// Expediente de la unidad: la lista a la izquierda y las tarjetas de sus documentos a la derecha
export function DocExpediente({ filas, placa, onElegir, puedeEditar, onCargar, onEditarPersonalizado, onVerArchivo, onCompartir, onEliminar }: Props) {
  const seleccion = filas.find(f => f.v.placa === placa) ?? filas[0] ?? null;

  if (!seleccion) {
    return <EmptyState icon={<Truck size={22} />} title="Sin unidades">No hay unidades para los filtros actuales.</EmptyState>;
  }

  const { v } = seleccion;
  const acciones = { puedeEditar, onVerArchivo, onCompartir };

  return (
    <div className="doc-expediente">
      <ul className="doc-lista" aria-label="Unidades">
        {filas.map(({ v: u, m }) => {
          const activa = seleccion.v.placa === u.placa;
          return (
            <li key={u.placa}>
              <button type="button" className={`doc-unidad pressable${activa ? ' doc-unidad--activa' : ''}`} onClick={() => { haptic('selection'); onElegir(u.placa); }} aria-current={activa}>
                <span className="doc-unidad__icono" style={{ background: `color-mix(in srgb, ${m.peor.color} 12%, transparent)`, color: m.peor.color }} aria-hidden><FileText size={17} strokeWidth={1.9} /></span>
                <LicensePlate plate={u.placa} size="sm" />
                <span className="doc-punto" style={{ background: m.peor.color }} title={m.peor.texto} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      <motion.section className="doc-ficha" key={v.placa}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} aria-label={`Documentos de ${v.placa}`}>
        <header className="doc-ficha__cab">
          <span className="doc-ficha__icono"><Truck size={22} strokeWidth={1.8} /></span>
          <div className="doc-ficha__titulo">
            <div className="doc-ficha__linea">
              <strong className="doc-ficha__placa">{v.placa}</strong>
              {v.tipo && <span className="doc-etiqueta">{v.tipo.toUpperCase()}</span>}
            </div>
            <span className="doc-ficha__sub">
              {[v.marca, v.modelo].filter(Boolean).join(' ') || 'Sin marca'}
              {v.anio ? ` · Año: ${v.anio}` : ''}
              {v.chasis ? ` · Chasis: ${v.chasis}` : ''}
            </span>
          </div>
          <div className="doc-salud" aria-label={`Salud de documentos ${seleccion.m.salud}%`}>
            <span className="doc-salud__texto">Salud</span>
            <span className="doc-salud__barra"><span style={{ width: `${seleccion.m.salud}%`, background: seleccion.m.peor.color }} /></span>
            <strong>{seleccion.m.salud}%</strong>
          </div>
        </header>

        <div className="doc-tarjetas">
          {seleccion.m.docs.map(d => {
            const url = String(v[`${d.config.prefijo}_url`] ?? '').trim();
            return (
              <TarjetaDocumento key={d.config.clave} {...acciones}
                placa={v.placa} num={d.config.num} titulo={d.config.titulo} tipoKey={d.config.tipoKey} color={colorDoc(d.config.num)}
                registrado={d.registrado} estado={d.estado} url={url}
                datos={d.config.datos
                  .map(x => ({ etiqueta: x.etiqueta, valor: fechaLegible(String(v[x.campo] ?? '').trim()) }))
                  .filter(x => x.valor && x.valor !== '---')}
                vencimiento={v[d.config.vencimiento] ? String(v[d.config.vencimiento]).slice(0, 10) : ''}
                onActualizar={() => onCargar(v.placa, d.config.prefijo)}
                onEliminar={() => onEliminar({ placa: v.placa, tipoKey: d.config.tipoKey, titulo: d.config.titulo, url: url || null })} />
            );
          })}
          {seleccion.m.personalizados.map(({ doc, estado }) => (
            <TarjetaDocumento key={doc.id} {...acciones}
              placa={v.placa} num={null} titulo={doc.tipo} tipoKey={doc.tipo} color={COLOR_PERSONALIZADO}
              registrado estado={estado} url={doc.url ?? ''}
              datos={[
                ...(doc.constancia ? [{ etiqueta: 'N°', valor: doc.constancia }] : []),
                ...(doc.emision ? [{ etiqueta: 'Emisión', valor: fechaLegible(doc.emision) }] : []),
              ]}
              vencimiento={doc.vencimiento ? String(doc.vencimiento).slice(0, 10) : ''}
              onActualizar={() => onEditarPersonalizado(v.placa, doc)}
              onEliminar={() => onEliminar({ placa: v.placa, tipoKey: doc.tipo, titulo: doc.tipo, url: doc.url || null })} />
          ))}
        </div>
      </motion.section>
    </div>
  );
}

interface TarjetaProps {
  placa: string;
  num: number | null;
  titulo: string;
  /** Clave con la que el historial guarda este tipo */
  tipoKey: string;
  color: string;
  registrado: boolean;
  estado: EstadoDoc;
  datos: Array<{ etiqueta: string; valor: string }>;
  /** AAAA-MM-DD o cadena vacía (no vence) */
  vencimiento: string;
  url: string;
  puedeEditar: boolean;
  onActualizar: () => void;
  onEliminar: () => void;
  onVerArchivo: (url: string) => void;
  onCompartir: (url: string, titulo: string, placa: string) => void;
}

// Tarjeta de un documento (estándar o personalizado): datos, estado, archivo, WhatsApp, historial y eliminar
function TarjetaDocumento(p: TarjetaProps) {
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const historial = useHistorialDocumentos(p.placa, historialAbierto);
  const venc = p.vencimiento ? p.vencimiento.split('-').reverse().join('/') : '—';

  if (!p.registrado) {
    return (
      <article className="doc-card doc-card--vacia" style={{ '--doc-color': p.color } as React.CSSProperties}>
        <header className="doc-card__cab">
          <span className="doc-card__num">{p.num}</span>
          <span className="doc-card__titulo">{p.titulo}</span>
        </header>
        <p className="doc-card__vacio">Sin registrar</p>
        {p.puedeEditar && <Button variant="secondary" size="sm" onClick={p.onActualizar}>Cargar</Button>}
      </article>
    );
  }

  const filas = (historial.data ?? []).filter(h => delTipo(h, p.tipoKey, p.titulo));

  return (
    <article className="doc-card" style={{ '--doc-color': p.color, '--estado-color': p.estado.color } as React.CSSProperties}>
      <header className="doc-card__cab">
        <span className="doc-card__num">{p.num ?? <FileText size={12} aria-hidden />}</span>
        <span className="doc-card__titulo">{p.titulo}</span>
      </header>
      <dl className="doc-card__filas">
        {p.datos.map(x => (
          <div key={x.etiqueta}><dt>{x.etiqueta}</dt><dd>{x.valor}</dd></div>
        ))}
        <div><dt>Vencimiento</dt><dd>{venc}</dd></div>
      </dl>
      <footer className="doc-card__pie">
        <span className="doc-card__estado-etiqueta">Estado</span>
        <span className="doc-card__estado" style={{ color: p.estado.color }}>{textoDias(p.estado)}</span>
      </footer>
      <div className="doc-card__acciones">
        {p.url && <Button variant="secondary" size="sm" icon={<Eye size={14} />} onClick={() => p.onVerArchivo(p.url)}>Ver archivo</Button>}
        {p.url && <Button variant="secondary" size="sm" icon={<MessageCircle size={14} />} onClick={() => p.onCompartir(p.url, p.titulo, p.placa)}>WhatsApp</Button>}
        {p.puedeEditar && <Button variant="secondary" size="sm" icon={<FileText size={14} />} onClick={p.onActualizar}>Actualizar</Button>}
        <Button variant="secondary" size="sm" icon={<History size={14} />} aria-expanded={historialAbierto}
          onClick={() => setHistorialAbierto(a => !a)}>Historial</Button>
        {p.puedeEditar && <Button variant="plain" size="sm" icon={<Trash2 size={14} />} className="doc-card__eliminar" onClick={p.onEliminar}>Eliminar</Button>}
      </div>

      {historialAbierto && (
        <section className="doc-hist" aria-label={`Historial de ${p.titulo}`}>
          {historial.isLoading ? <p className="doc-hist__vacio">Cargando…</p>
            : historial.isError ? <p className="doc-hist__vacio">No se pudo cargar el historial.</p>
              : filas.length === 0 ? <p className="doc-hist__vacio">Sin registros anteriores.</p>
                : (
                  <ul className="doc-hist__lista">
                    {filas.map(h => <FilaHistorial key={h.id} h={h} onVerArchivo={p.onVerArchivo} />)}
                  </ul>
                )}
        </section>
      )}
    </article>
  );
}

function FilaHistorial({ h, onVerArchivo }: { h: RegistroHistorial; onVerArchivo: (url: string) => void }) {
  const detalle = [
    h.nro_constancia && `N° ${h.nro_constancia}`,
    h.entidad,
    h.fecha_emision && `Emisión ${fechaLegible(h.fecha_emision)}`,
    h.pago && `S/ ${h.pago}`,
    h.usuario && `por ${h.usuario}`,
  ].filter(Boolean).join(' · ');
  return (
    <li className="doc-hist__fila">
      <span className="doc-hist__venc">{h.fecha_vencimiento ? `Vence ${fechaLegible(h.fecha_vencimiento)}` : 'Sin vencimiento'}</span>
      {detalle && <span className="doc-hist__detalle">{detalle}</span>}
      {esUrl(h.observaciones) && (
        <Button variant="plain" size="sm" icon={<Eye size={14} />} onClick={() => onVerArchivo(h.observaciones!)}>Ver</Button>
      )}
    </li>
  );
}
