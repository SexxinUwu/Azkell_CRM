import { useRef, useState, type FormEvent } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react';
import { Boton, Cabecera, Fondo, Pie } from '../compartido/Estructura';
import { Inclinar, Marquesina, Palabras, Revelar, Rotar, suave } from '../compartido/Movimiento';
import { VistaSistema } from '../compartido/VistaSistema';
import { icono } from '../compartido/iconos';
import { CARTERA_URL, INTEGRACIONES, MODULOS, PASOS, SEGURIDAD } from './datos';

const NAV = [
  { id: 'modulos', etiqueta: 'Módulos' },
  { id: 'como-funciona', etiqueta: 'Cómo funciona' },
  { id: 'seguridad', etiqueta: 'Seguridad' },
  { id: 'empresa', etiqueta: 'Mi empresa' },
];

/** Campo "¿Cuál es tu empresa?": lleva a su subdominio (cada empresa tiene su propio espacio) */
function IngresoEmpresa() {
  const [slug, setSlug] = useState('');
  const [aviso, setAviso] = useState('');
  const enProduccion = window.location.hostname.endsWith('azkell.com');

  const entrar = (e: FormEvent) => {
    e.preventDefault();
    const limpio = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!limpio) { setAviso('Escribe el nombre de tu empresa.'); return; }
    if (['www', 'app', 'fleet', 'azkell', 'admin', 'master'].includes(limpio)) { setAviso('Ese nombre no corresponde a una empresa.'); return; }
    if (!enProduccion) { setAviso(`En producción te llevará a https://${limpio}.azkell.com`); return; }
    window.location.assign(`https://${limpio}.azkell.com`);
  };

  return (
    <form onSubmit={entrar} noValidate>
      <div className="empresa">
        <label className="empresa__campo">
          <span aria-hidden>https://</span>
          <input value={slug} onChange={e => { setSlug(e.target.value); setAviso(''); }} placeholder="tu-empresa" aria-label="Nombre de tu empresa"
            autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <span aria-hidden>.azkell.com</span>
        </label>
        <button type="submit" className="btn btn--acento">Ingresar <ArrowRight size={18} /></button>
      </div>
      <motion.p className="nota-demo" role="status" initial={false} animate={{ opacity: aviso ? 1 : 0, y: aviso ? 0 : -4 }} transition={{ duration: 0.3, ease: suave }}>
        {aviso || ' '}
      </motion.p>
    </form>
  );
}

/** La ventana del sistema se endereza mientras se baja la página: sigue al dedo 1:1 (solo transform) */
function Escena() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 95%', 'start 35%'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [16, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.93, 1]);
  return (
    <div ref={ref} className="escena">
      <motion.div style={{ rotateX, scale, transformOrigin: '50% 0%' }}><VistaSistema /></motion.div>
      <p className="sis-nota">Vista del sistema con datos de demostración. Toca una opción del menú.</p>
    </div>
  );
}

export function App() {
  return (
    <>
      <Fondo />
      <Cabecera marca="Azkell Fleet" logo="/favicon.png" enlaces={NAV} cta={{ texto: 'Ingresar', href: '#empresa' }} />

      <main>
        <section id="inicio" className="heroe heroe--centrado" style={{ position: 'relative' }}>
          <div className="contenedor">
            <Revelar y={10}><span className="aviso"><span className="punto-vivo" />Multiempresa · en producción</span></Revelar>
            <h1><Palabras alCargar texto="Toda tu flota, en un solo sistema." /></h1>
            <Revelar retraso={0.5}>
              <p className="lead">
                Azkell Fleet reúne <Rotar palabras={['operación', 'mantenimiento', 'almacén', 'tesorería']} /> en un mismo lugar. Cada empresa con su propio espacio y sus propios datos.
              </p>
            </Revelar>
            <Revelar retraso={0.6} className="heroe__acciones">
              <Boton href="#empresa" variante="acento">Ingresar a mi empresa <ArrowRight size={18} /></Boton>
              <Boton href="#modulos" variante="vidrio">Ver los módulos</Boton>
            </Revelar>
            <Escena />
          </div>
        </section>

        <div className="banda"><Marquesina items={INTEGRACIONES} /></div>

        <section id="modulos" className="seccion">
          <div className="contenedor">
            <Revelar><span className="etiqueta">Módulos</span></Revelar>
            <h2 className="titulo"><Palabras texto="Cubre la operación completa, del GPS al pago." /></h2>
            <div className="rejilla-tarjetas">
              {MODULOS.map((m, i) => {
                const Icono = icono(m.icono);
                return (
                  <Revelar key={m.titulo} retraso={(i % 3) * 0.08}>
                    <Inclinar>
                      <div className="icono"><Icono size={22} /></div>
                      <h3>{m.titulo}</h3><p>{m.texto}</p>
                      <ul className="lista-puntos">{m.puntos.map(p => <li key={p}><Check size={15} />{p}</li>)}</ul>
                    </Inclinar>
                  </Revelar>
                );
              })}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="seccion">
          <div className="contenedor">
            <Revelar><span className="etiqueta">Cómo funciona</span></Revelar>
            <h2 className="titulo"><Palabras texto="Tu empresa, con su propio espacio." /></h2>
            <div className="rejilla-tarjetas">
              {PASOS.map((p, i) => (
                <Revelar key={p.n} retraso={i * 0.1}>
                  <Inclinar><div className="paso">{p.n}</div><h3>{p.titulo}</h3><p>{p.texto}</p></Inclinar>
                </Revelar>
              ))}
            </div>
          </div>
        </section>

        <section id="seguridad" className="seccion">
          <div className="contenedor">
            <Revelar><span className="etiqueta">Seguridad</span></Revelar>
            <h2 className="titulo"><Palabras texto="Hecho para que se pueda confiar en él." /></h2>
            <div className="rejilla-tarjetas">
              {SEGURIDAD.map((s, i) => (
                <Revelar key={s.titulo} retraso={(i % 4) * 0.07}>
                  <Inclinar><h3>{s.titulo}</h3><p>{s.texto}</p></Inclinar>
                </Revelar>
              ))}
            </div>
          </div>
        </section>

        <section id="empresa" className="seccion">
          <div className="contenedor">
            <Revelar>
              <div className="cta-final">
                <span className="etiqueta">Mi empresa</span>
                <h2 className="titulo">Entra a tu espacio.</h2>
                <p className="lead" style={{ marginInline: 'auto' }}>Escribe el nombre de tu empresa y te llevamos a su dirección.</p>
                <div style={{ width: 'min(34rem, 100%)', margin: '2rem auto 0' }}><IngresoEmpresa /></div>
                <p className="nota-demo">¿Tu empresa aún no está? <a href={`${CARTERA_URL}/#contacto`} style={{ color: 'var(--acento-2)' }}>Conversemos <ArrowUpRight size={13} style={{ verticalAlign: '-2px' }} /></a></p>
              </div>
            </Revelar>
          </div>
        </section>
      </main>

      <Pie>
        <span>© {new Date().getFullYear()} Azkell Fleet</span>
        <a href={CARTERA_URL}>Creado por Sthefano Avila Li ↗</a>
      </Pie>
    </>
  );
}
