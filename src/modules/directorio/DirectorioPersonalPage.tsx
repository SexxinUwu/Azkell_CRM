import { useMemo, useState } from 'react';
import { Mail, MessageCircle, Phone, SearchX, Users } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { Letras, letraDe } from '../../core/ui/Agenda';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { initials } from '../../core/lib/format';
import { whatsapp } from '../conductores/api';
import { Avatar, Contactar, FilaDirectorio, tono } from '../almacen/ProveedoresPage';
import { etiqueta, nombreCompleto, OPCIONES, usePersonal, type Persona } from '../personal/api';
import '../almacen/proveedores.css';
import { SelectorDirectorio } from './SelectorDirectorio';

const COLUMNAS: ColumnaTabla[] = [
  { id: 'persona', titulo: 'Persona', ancho: 320, minimo: 180 },
  { id: 'cargo', titulo: 'Cargo', ancho: 240, minimo: 140 },
  { id: 'area', titulo: 'Área', ancho: 180 },
  { id: 'celular', titulo: 'Celular', ancho: 140 },
  { id: 'correo', titulo: 'Correo', ancho: 240 },
  { id: 'acciones', titulo: '', ancho: 120, alinear: 'center' },
];

type Grupo = 'todos' | 'conductores' | 'administrativos' | 'otros';
const grupoDe = (p: Persona): Exclude<Grupo, 'todos'> => (p.categoria_rol === 'CONDUCTOR' ? 'conductores' : p.categoria_rol === 'ADMINISTRATIVO' ? 'administrativos' : 'otros');

// Directorio › Personal: la libreta para llamar o escribir a alguien. Solo consulta y todo en la misma pantalla:
// no abre otra página al tocar a una persona (la ficha completa es de RRHH).
export function DirectorioPersonalPage() {
  const { data, isLoading, isError, error } = usePersonal();
  const ancha = useMediaQuery('(min-width: 900px)');
  const [busqueda, setBusqueda] = useState('');
  const [grupo, setGrupo] = useState<Grupo>('todos');
  const [abierta, setAbierta] = useState<Persona | null>(null);

  // En planilla: quien ya cesó no es un contacto de la empresa
  const personal = useMemo(() => (data ?? []).filter(p => p.estado !== 'CESADO'), [data]);
  const q = busqueda.trim().toUpperCase();
  const visibles = useMemo(() => personal
    .filter(p => grupo === 'todos' || grupoDe(p) === grupo)
    .filter(p => !q || [nombreCompleto(p), p.cargo, p.area, p.telefono, p.email, p.numero_documento].some(t => (t ?? '').toUpperCase().includes(q)))
    .sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es') || a.nombres.localeCompare(b.nombres, 'es')),
  [personal, grupo, q]);

  const abrir = (p: Persona) => { haptic('selection'); setAbierta(p); };
  const subtitulo = (p: Persona) => [p.cargo, etiqueta(OPCIONES.area, p.area)].filter(Boolean).join(' · ');

  return (
    <Page>
      <PageHeader
        eyebrow="Directorio"
        title="Personal"
        subtitle={isLoading ? 'Cargando…' : `${personal.length} contactos del personal`}
        actions={<SelectorDirectorio actual="personal" />}
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : personal.length === 0 ? (
        <EmptyState icon={<Users size={22} />} title="Sin personal registrado">Cuando RRHH registre personal, aparecerá aquí.</EmptyState>
      ) : (
        <>
          <div className="pv-barra">
            <SegmentedControl<Grupo> label="Grupo del personal" value={grupo} onChange={setGrupo}
              options={[{ value: 'todos', label: 'Todos' }, { value: 'conductores', label: 'Conductores' }, { value: 'administrativos', label: 'Administrativos' }, { value: 'otros', label: 'Otros' }]} />
            <SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, cargo o celular" />
          </div>

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Nada coincide">
              <button type="button" className="placas-limpiar" onClick={() => { setBusqueda(''); setGrupo('todos'); }}>Quitar filtros</button>
            </EmptyState>
          ) : ancha ? (
            <TablaRedimensionable id="directorio-personal" columnas={COLUMNAS} ariaLabel="Personal de la empresa" altoMax="68vh">
              {visibles.map(p => (
                <tr key={p.id} className="pv-tr" onClick={() => abrir(p)}>
                  <Celda><span className="pv-celda-nombre"><Avatar nombre={nombreCompleto(p)} empresa={false} /><button type="button" className="oc-codigo">{p.apellidos}, {p.nombres}</button></span></Celda>
                  <Celda>{p.cargo || '—'}</Celda>
                  <Celda>{etiqueta(OPCIONES.area, p.area) || '—'}</Celda>
                  <Celda mono>{p.telefono || '—'}</Celda>
                  <Celda>{p.email || '—'}</Celda>
                  <Celda alinear="center"><Contactar nombre={nombreCompleto(p)} telefono={p.telefono} correo={p.email} /></Celda>
                </tr>
              ))}
            </TablaRedimensionable>
          ) : (
            <Letras items={visibles} letra={p => letraDe(p.apellidos || p.nombres)} fila={p => (
              <FilaDirectorio key={p.id} nombre={nombreCompleto(p)} sub={subtitulo(p)} semilla={nombreCompleto(p)} empresa={false}
                telefono={p.telefono} correo={p.email} onAbrir={() => abrir(p)} />
            )} />
          )}
        </>
      )}

      <FichaContacto persona={abierta} onClose={() => setAbierta(null)} />
    </Page>
  );
}

/** Tarjeta de contacto en una ventana: llamar, WhatsApp y correo con un toque */
function FichaContacto({ persona: p, onClose }: { persona: Persona | null; onClose: () => void }) {
  const nombre = p ? nombreCompleto(p) : '';
  const tel = (p?.telefono ?? '').trim();
  const wa = whatsapp(tel);
  return (
    <Sheet open={!!p} onClose={onClose} title="Contacto">
      {p && (
        <div className="pv-ficha">
          <div className="pv-hero">
            <span className="pv-avatar pv-avatar--grande" aria-hidden style={{ background: `linear-gradient(145deg, ${tono(nombre)}, color-mix(in srgb, ${tono(nombre)} 70%, #000))` }}>{initials(nombre)}</span>
            <h3>{nombre}</h3>
            <span className="pv-hero__sub">{[p.cargo, etiqueta(OPCIONES.area, p.area)].filter(Boolean).join(' · ')}</span>
          </div>
          <section className="pv-seccion">
            <ul className="pv-tarjeta">
              <li>
                <span className="pv-fila__texto" style={{ flex: 1 }}>
                  <span className="pv-fila__nombre">{tel || 'Sin celular'}</span>
                  <span className="pv-fila__sub">{p.email || 'Sin correo'}</span>
                </span>
                <div className="pv-fila__acciones">
                  {tel && <a className="pv-accion" href={`tel:${tel.replace(/\s/g, '')}`} aria-label={`Llamar a ${nombre}`}><Phone size={16} /></a>}
                  {wa && <a className="pv-accion pv-accion--wa" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${nombre}`}><MessageCircle size={16} /></a>}
                  {p.email && <a className="pv-accion pv-accion--mail" href={`mailto:${p.email}`} aria-label={`Escribir a ${nombre}`}><Mail size={16} /></a>}
                </div>
              </li>
              <li><div className="pv-dato" style={{ width: '100%' }}><span>Sede</span><span>{p.sede || '—'}</span></div></li>
            </ul>
          </section>
        </div>
      )}
    </Sheet>
  );
}
