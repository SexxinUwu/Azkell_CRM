import { Children, isValidElement, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, ChevronLeft, Contact, IdCard, Mail, MessageCircle, Pencil, Phone, Printer, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { spring } from '../../core/lib/motion';
import { alertasDe, antiguedad, ASIGNACION_FAMILIAR, edad, etiqueta, nombreCompleto, OPCIONES, whatsapp, type Persona } from './api';
import { descargarVCard, imprimirFicha, imprimirFotocheck } from './documentos';
import { FotoPersona } from './FotoPersona';
import { formatFechaPe, formatSoles } from '../../core/lib/format';
import { estadoDeFecha } from '../flota/docsEstado';

const fechaPe = (iso: string) => (iso ? formatFechaPe(iso) : '');
const soles = (v: string | number) => formatSoles(Number(v || 0));

/** Fecha de vencimiento con su estado: verde vigente, ámbar por vencer, rojo vencido */
const vigencia = (iso: string) => {
  const e = estadoDeFecha(iso);
  return <span style={{ color: e.color, fontWeight: 600 }}>{fechaPe(iso)} · {e.texto}</span>;
};

/** Fila al estilo Contactos: etiqueta pequeña arriba, valor debajo (enlace si se puede tocar) */
const vacio = (v: ReactNode) => v == null || v === '' || v === false;

function Dato({ label, children, href, mono }: { label: string; children: ReactNode; href?: string; mono?: boolean }) {
  if (vacio(children)) return null;
  const valor = <span className={`dato__valor${mono ? ' dato__valor--mono' : ''}${href ? ' dato__valor--enlace' : ''}`}>{children}</span>;
  return (
    <div className="dato">
      <span className="dato__label">{label}</span>
      {href ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{valor}</a> : valor}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo?: string; children: ReactNode }) {
  // Si ningún dato tiene valor, el grupo no se muestra
  const conValor = Children.toArray(children).some(c => !(isValidElement<{ children?: ReactNode }>(c) && c.type === Dato && vacio(c.props.children)));
  if (!conValor) return null;
  return (
    <section className="tarjeta__grupo">
      {titulo && <h3 className="tarjeta__grupo-titulo">{titulo}</h3>}
      <div className="tarjeta__lista">{children}</div>
    </section>
  );
}

// Tarjeta de contacto de una persona: foto, acciones rápidas y datos agrupados (estilo Contactos de Apple).
export function PersonaTarjeta({ persona: p, onEditar, onEliminar, onVolver, verPagos }: {
  persona: Persona;
  onEditar?: () => void;
  onEliminar?: () => void;
  /** Solo en el celular: vuelve a la lista */
  onVolver?: () => void;
  /** Sueldo, cuentas y pensión: solo para quien puede editar al personal */
  verPagos: boolean;
}) {
  const reduce = useReducedMotion();
  const toast = useToast();
  const [pagosAbiertos, setPagosAbiertos] = useState(false);
  const wa = whatsapp(p.telefono);
  const alertas = alertasDe(p);
  const e = edad(p.fecha_nacimiento);
  const tel = p.telefono.replace(/\s/g, '');

  const acciones = [
    { key: 'msj', label: 'mensaje', icon: <MessageCircle size={20} />, href: wa ? `https://wa.me/${wa}` : undefined },
    { key: 'tel', label: 'llamar', icon: <Phone size={20} />, href: tel ? `tel:${tel}` : undefined },
    { key: 'mail', label: 'correo', icon: <Mail size={20} />, href: p.email ? `mailto:${p.email}` : undefined },
  ];

  const seguro = (f: () => unknown) => async () => { try { await f(); } catch (err) { toast(errorMessage(err), 'error'); } };

  return (
    <motion.article
      key={p.id}
      className="tarjeta"
      initial={{ opacity: 0, x: reduce ? 0 : onVolver ? 28 : 0, y: reduce || onVolver ? 0 : 8 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={spring}
      aria-label={nombreCompleto(p)}
    >
      <div className="tarjeta__barra">
        {onVolver ? (
          <button type="button" className="tarjeta__volver pressable" onClick={onVolver}><ChevronLeft size={22} /> Personal</button>
        ) : <span />}
        <div className="tarjeta__barra-acciones">
          <MenuOtros soloIcono opciones={[
            { label: 'Imprimir fotocheck', icon: <IdCard size={17} />, onSelect: seguro(() => imprimirFotocheck(p)) },
            { label: 'Imprimir ficha', icon: <Printer size={17} />, onSelect: seguro(() => imprimirFicha(p)) },
            { label: 'Compartir contacto', detalle: 'Tarjeta .vcf para el celular', icon: <Contact size={17} />, onSelect: () => descargarVCard(p) },
            onEliminar && { label: 'Eliminar', icon: <Trash2 size={17} />, destructiva: true, separado: true, onSelect: onEliminar },
          ]} />
          {onEditar && <Button variant="plain" onClick={onEditar} icon={<Pencil size={15} />}>Editar</Button>}
        </div>
      </div>

      <header className="tarjeta__hero">
        <motion.div initial={{ scale: reduce ? 1 : 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring, delay: reduce ? 0 : 0.04 }}>
          <FotoPersona persona={p} size={112} />
        </motion.div>
        <h2 className="tarjeta__nombre">{nombreCompleto(p)}</h2>
        <p className="tarjeta__puesto">{[p.cargo, etiqueta(OPCIONES.area, p.area)].filter(Boolean).join(' · ')}</p>
        {p.estado !== 'ACTIVO' && <span className={`tarjeta__estado tarjeta__estado--${p.estado.toLowerCase()}`}>{etiqueta(OPCIONES.estado, p.estado)}</span>}

        <div className="tarjeta__acciones">
          {acciones.map((a, i) => {
            const contenido = <><span className="tarjeta__accion-icono">{a.icon}</span><span>{a.label}</span></>;
            return (
              <motion.div key={a.key} initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: reduce ? 0 : 0.06 + i * 0.03 }}>
                {a.href ? (
                  <a className="tarjeta__accion pressable" href={a.href} target={a.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{contenido}</a>
                ) : (
                  <span className="tarjeta__accion tarjeta__accion--off" aria-disabled title={`Sin ${a.key === 'mail' ? 'correo' : 'celular'}`}>{contenido}</span>
                )}
              </motion.div>
            );
          })}
        </div>
      </header>

      {alertas.length > 0 && (
        <div className="tarjeta__alertas" role="status">
          {alertas.map(a => (
            <div key={a.clave} className={`tarjeta__alerta tarjeta__alerta--${a.tono}`}><TriangleAlert size={15} />{a.texto}</div>
          ))}
        </div>
      )}

      <div className="tarjeta__cuerpo">
        <Grupo>
          <Dato label="celular" href={tel ? `tel:${tel}` : undefined}>{p.telefono}</Dato>
          <Dato label="correo" href={p.email ? `mailto:${p.email}` : undefined}>{p.email}</Dato>
          <Dato label="dirección" href={p.direccion ? `https://maps.google.com/?q=${encodeURIComponent([p.direccion, p.distrito, p.provincia, 'Perú'].filter(Boolean).join(', '))}` : undefined}>
            {[p.direccion, p.distrito, p.provincia].filter(Boolean).join(', ')}
          </Dato>
          <Dato label="cumpleaños">{p.fecha_nacimiento && `${fechaPe(p.fecha_nacimiento)}${e != null ? ` · ${e} años` : ''}`}</Dato>
        </Grupo>

        <Grupo titulo="En caso de emergencia">
          <Dato label={p.contacto_emergencia_parentesco || 'contacto'} href={p.contacto_emergencia_telefono ? `tel:${p.contacto_emergencia_telefono.replace(/\s/g, '')}` : undefined}>
            {[p.contacto_emergencia_nombre, p.contacto_emergencia_telefono].filter(Boolean).join(' · ')}
          </Dato>
        </Grupo>

        <Grupo titulo="Trabajo">
          <Dato label="rol">{etiqueta(OPCIONES.rol, p.categoria_rol)}</Dato>
          <Dato label="centro de costos">{etiqueta(OPCIONES.centroCosto, p.centro_costo_codigo)}</Dato>
          <Dato label="sede">{p.sede}</Dato>
          <Dato label="jefe inmediato">{p.jefe_inmediato}</Dato>
          <Dato label="ingreso">{p.fecha_ingreso && `${fechaPe(p.fecha_ingreso)} · ${antiguedad(p.fecha_ingreso)}`}</Dato>
          {p.estado === 'CESADO' && <Dato label="cese">{[fechaPe(p.fecha_cese), p.motivo_cese].filter(Boolean).join(' · ')}</Dato>}
        </Grupo>

        <Grupo titulo="Contrato">
          <Dato label="tipo">{etiqueta(OPCIONES.tipoContrato, p.tipo_contrato)}</Dato>
          <Dato label="vigencia">{p.fecha_inicio_contrato && `${fechaPe(p.fecha_inicio_contrato)} → ${p.fecha_fin_contrato ? fechaPe(p.fecha_fin_contrato) : 'sin fecha de fin'}`}</Dato>
        </Grupo>

        {verPagos && (
          <section className="tarjeta__grupo">
            <button type="button" className="tarjeta__desplegar pressable" aria-expanded={pagosAbiertos} onClick={() => setPagosAbiertos(v => !v)}>
              <span>Remuneración y pagos</span>
              <motion.span animate={{ rotate: pagosAbiertos ? 180 : 0 }} transition={spring}><ChevronDown size={16} /></motion.span>
            </button>
            <AnimatePresence initial={false}>
              {pagosAbiertos && (
                <motion.div className="tarjeta__lista" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} style={{ overflow: 'hidden' }}>
                  <Dato label="sueldo básico" mono>{soles(p.sueldo_basico)}</Dato>
                  {Number(p.bono_fijo) > 0 && <Dato label="bono fijo" mono>{soles(p.bono_fijo)}</Dato>}
                  {p.tiene_asignacion_familiar && <Dato label="asignación familiar" mono>{soles(ASIGNACION_FAMILIAR)}</Dato>}
                  <Dato label="pensión">{[etiqueta(OPCIONES.regimen, p.regimen_pensionario), p.regimen_pensionario.startsWith('AFP') && etiqueta(OPCIONES.comisionAfp, p.tipo_comision_afp), p.cuspp && `CUSPP ${p.cuspp}`].filter(Boolean).join(' · ')}</Dato>
                  <Dato label={`cuenta sueldo${p.banco_haberes ? ` · ${p.banco_haberes}` : ''}`} mono>{p.cuenta_haberes}</Dato>
                  <Dato label="CCI" mono>{p.cci_haberes}</Dato>
                  <Dato label={`cuenta CTS${p.banco_cts ? ` · ${p.banco_cts}` : ''}`} mono>{p.cuenta_cts}</Dato>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        <Grupo titulo="Salud y seguridad">
          <Dato label="grupo sanguíneo">{p.grupo_sanguineo && etiqueta(OPCIONES.grupoSanguineo, p.grupo_sanguineo)}</Dato>
          <Dato label="examen médico">{etiqueta(OPCIONES.emo, p.emo_condicion) || p.emo_fecha_vencimiento ? <>{etiqueta(OPCIONES.emo, p.emo_condicion)}{etiqueta(OPCIONES.emo, p.emo_condicion) && p.emo_fecha_vencimiento ? ' · ' : ''}{p.emo_fecha_vencimiento ? <>vence {vigencia(p.emo_fecha_vencimiento)}</> : null}</> : null}</Dato>
          <Dato label="SCTR">{`Salud ${p.sctr_salud_vigente ? 'cubierto' : 'sin cobertura'} · Pensión ${p.sctr_pension_vigente ? 'cubierto' : 'sin cobertura'}`}</Dato>
          <Dato label="brevete" mono>{[p.licencia_conducir, p.licencia_categoria].filter(Boolean).join(' · ') || p.licencia_vencimiento ? <>{[p.licencia_conducir, p.licencia_categoria].filter(Boolean).join(' · ')}{[p.licencia_conducir, p.licencia_categoria].some(Boolean) && p.licencia_vencimiento ? ' · ' : ''}{p.licencia_vencimiento ? <>vence {vigencia(p.licencia_vencimiento)}</> : null}</> : null}</Dato>
          <Dato label="tallas de EPP">{[p.talla_polo && `Polo ${p.talla_polo}`, p.talla_pantalon && `Pantalón ${p.talla_pantalon}`, p.talla_calzado && `Calzado ${p.talla_calzado}`, p.talla_chaleco && `Chaleco ${etiqueta(OPCIONES.tallaChaleco, p.talla_chaleco)}`].filter(Boolean).join(' · ')}</Dato>
        </Grupo>

        <Grupo titulo="Identidad">
          <Dato label={etiqueta(OPCIONES.tipoDocumento, p.tipo_documento) || 'documento'} mono>{p.numero_documento}</Dato>
          <Dato label="sexo">{etiqueta(OPCIONES.sexo, p.sexo)}</Dato>
          <Dato label="estado civil">{etiqueta(OPCIONES.estadoCivil, p.estado_civil)}</Dato>
          <Dato label="nacionalidad">{p.nacionalidad && p.nacionalidad.charAt(0) + p.nacionalidad.slice(1).toLowerCase()}</Dato>
        </Grupo>
      </div>
    </motion.article>
  );
}
