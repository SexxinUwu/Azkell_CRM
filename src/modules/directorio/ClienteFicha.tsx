import '../../core/ui/acciones-iconos.css';
import './clientes.css';
import { useQuery } from '@tanstack/react-query';
import { Copy, Mail, MessageCircle, Pencil, Phone, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { TooltipFijo } from '../../core/ui/TooltipFijo';
import { useToast } from '../../core/ui/Toast';
import { api } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { useUbigeos } from '../operaciones/ubigeos';
import { tipoDocumento, type Cliente } from './api';

const iniciales = (n: string) => n.replace(/[^A-Za-zÁÉÍÓÚÑ ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
const soloDigitos = (s: string) => s.replace(/\D/g, '');

interface ServicioReciente { id: number; codigo_orden: string; origen: string | null; destino: string | null; estado_servicio: string | null; fecha_fmt: string | null }
const ETIQUETA: Record<string, string> = { PENDIENTE: 'Pendiente', PROGRAMADO: 'Programado', EN_EJECUCION: 'En ejecución', ENTREGADO: 'Entregado', ANULADO: 'Anulado' };

function Dato({ label, valor, mono }: { label: string; valor?: string | null; mono?: boolean }) {
  if (!valor) return null;
  return <div className="dato"><span className="dato__label">{label}</span><span className={`dato__valor${mono ? ' dato__valor--mono' : ''}`}>{valor}</span></div>;
}

function Accion({ texto, tono, icono, onClick, href }: { texto: string; tono: string; icono: React.ReactNode; onClick?: () => void; href?: string }) {
  const clase = `acciones-iconos__boton acciones-iconos__boton--libre acciones-iconos__boton--${tono}`;
  return (
    <TooltipFijo texto={texto}>
      {href
        ? <a className={clase} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" aria-label={texto} onClick={() => haptic('selection')}>{icono}</a>
        : <button type="button" className={clase} aria-label={texto} onClick={onClick}>{icono}</button>}
    </TooltipFijo>
  );
}

/** Ficha del cliente: quién es, cómo contactarlo, su domicilio, sus unidades y sus últimos servicios. */
export function ClienteFicha({ cliente, onClose, onEditar, onEliminar }: {
  cliente: Cliente | null; onClose: () => void; onEditar?: (c: Cliente) => void; onEliminar?: (c: Cliente) => void;
}) {
  const toast = useToast();
  const ubigeos = useUbigeos();
  const nombre = String(cliente?.razon_social ?? cliente?.nombre ?? '');
  const doc = String(cliente?.ruc_dni ?? '').trim();
  const activo = String(cliente?.estado ?? 'Activo').toLowerCase() === 'activo';
  const distrito = (() => { const u = (ubigeos.data ?? []).find(x => x.codigo === cliente?.ubigeo); return u ? `${u.distrito}, ${u.provincia}, ${u.departamento}` : ''; })();
  // «ESTADO SUNAT: ACTIVO | CONDICIÓN: HABIDO» queda guardado en las notas al consultar el RUC
  const sunat = /ESTADO SUNAT:\s*([^|]+)\|?\s*(?:CONDICI[ÓO]N:\s*(.+))?/i.exec(String(cliente?.notas ?? ''));
  const tel = soloDigitos(String(cliente?.telefono ?? ''));
  const wa = tel.length === 9 ? `https://wa.me/51${tel}` : tel.length === 11 && tel.startsWith('51') ? `https://wa.me/${tel}` : '';

  const flota = useQuery<{ placa: string }[]>({
    queryKey: ['directorio', 'cliente-flota', cliente?.id], enabled: !!cliente, staleTime: 60_000, retry: false,
    queryFn: () => api<unknown>(`/clientes/${cliente!.id}/flota`).then(r => (Array.isArray(r) ? r : []) as { placa: string }[]),
  });
  const servicios = useQuery<ServicioReciente[]>({
    queryKey: ['directorio', 'cliente-servicios', nombre], enabled: !!cliente && !!nombre, staleTime: 60_000, retry: false,
    queryFn: () => api<{ data?: ServicioReciente[] }>('/operaciones/ordenes-servicio', { query: { cliente: nombre } }).then(r => (r.data ?? []).slice(0, 5)),
  });

  async function copiar(texto: string, aviso: string) {
    haptic('selection');
    try { await navigator.clipboard.writeText(texto); toast(aviso); } catch { toast(texto); }
  }

  return (
    <Sheet open={!!cliente} onClose={onClose} title="Cliente"
      footer={cliente ? (
        <>
          {onEliminar && <Button variant="secondary" icon={<Trash2 size={16} />} onClick={() => onEliminar(cliente)}>Eliminar</Button>}
          {onEditar && <Button variant="primary" icon={<Pencil size={16} />} onClick={() => onEditar(cliente)}>Editar</Button>}
        </>
      ) : undefined}>
      {cliente && (
        <div className="cl-ficha">
          <header className="cl-ficha__cab">
            <span className="cl-avatar" aria-hidden>{iniciales(nombre)}</span>
            <div className="cl-ficha__quien">
              <h3 className="cl-ficha__nombre">{nombre || 'Sin razón social'}</h3>
              <div className="cl-ficha__chips">
                {doc && <span className="cl-chip cl-chip--gris">{tipoDocumento(doc)} {doc}</span>}
                <span className={`cl-chip ${activo ? 'cl-chip--verde' : 'cl-chip--gris'}`}>{activo ? 'Activo' : 'Inactivo'}</span>
                {sunat?.[1] && <span className={`cl-chip ${/ACTIVO/i.test(sunat[1]) ? 'cl-chip--verde' : 'cl-chip--ambar'}`}>SUNAT {sunat[1].trim()}</span>}
                {sunat?.[2] && <span className={`cl-chip ${/HABIDO/i.test(sunat[2]) && !/NO/i.test(sunat[2]) ? 'cl-chip--verde' : 'cl-chip--ambar'}`}>{sunat[2].trim()}</span>}
              </div>
            </div>
          </header>

          <div className="cl-acciones">
            {tel && <Accion texto="Llamar" tono="azul" icono={<Phone size={18} />} href={`tel:${tel}`} />}
            {wa && <Accion texto="WhatsApp" tono="whatsapp" icono={<MessageCircle size={18} />} href={wa} />}
            {cliente.email && <Accion texto="Enviar correo" tono="violeta" icono={<Mail size={18} />} href={`mailto:${cliente.email}`} />}
            {doc && <Accion texto={`Copiar ${tipoDocumento(doc)}`} tono="ambar" icono={<Copy size={17} />} onClick={() => void copiar(doc, `${tipoDocumento(doc)} copiado`)} />}
          </div>

          <div className="tarjeta__lista">
            <Dato label="Teléfono" valor={cliente.telefono} mono />
            <Dato label="Correo" valor={cliente.email} />
            <Dato label="Distrito" valor={distrito} />
            <Dato label="Dirección" valor={cliente.direccion} />
            <Dato label="Notas" valor={String(cliente.notas ?? '').replace(/ESTADO SUNAT:[^|]*\|?\s*(CONDICI[ÓO]N:[^|]*)?/i, '').trim()} />
            {!cliente.telefono && !cliente.email && !cliente.direccion && <p className="cl-vacio">Aún no hay datos de contacto. Toca «Editar» para completarlos.</p>}
          </div>

          <div>
            <p className="tarjeta__grupo-titulo">Unidades ({flota.data?.length ?? 0})</p>
            {(flota.data ?? []).length === 0
              ? <p className="cl-vacio">Sin unidades asignadas.</p>
              : <div className="cl-placas">{(flota.data ?? []).map(p => <LicensePlate key={p.placa} plate={p.placa} size="sm" />)}</div>}
          </div>

          {(servicios.data ?? []).length > 0 && (
            <div>
              <p className="tarjeta__grupo-titulo">Últimos servicios</p>
              <div className="tarjeta__lista">
                {servicios.data!.map(s => (
                  <div key={s.id} className="dato">
                    <span className="dato__label">{s.codigo_orden}</span>
                    <span className="dato__valor">{[s.origen, s.destino].filter(Boolean).join(' → ')} · {ETIQUETA[String(s.estado_servicio ?? '').toUpperCase()] ?? s.estado_servicio}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
