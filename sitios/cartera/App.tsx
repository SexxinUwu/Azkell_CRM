import { ArrowRight, ArrowUpRight, Briefcase, Code, Mail } from 'lucide-react';
import { Boton, Cabecera, Fondo, Pie } from '../compartido/Estructura';
import { Contador, Inclinar, Marquesina, Palabras, Revelar, Rotar } from '../compartido/Movimiento';
import { VistaSistema } from '../compartido/VistaSistema';
import { icono } from '../compartido/iconos';
import {
  CAPACIDADES, CIFRAS, CONTACTO, HITOS, MODULOS, PALABRAS_HEROE, PRINCIPIOS, PRODUCTO_URL, TECNOLOGIAS,
} from './datos';

const NAV = [
  { id: 'sobre-mi', etiqueta: 'Sobre mí' },
  { id: 'proyecto', etiqueta: 'Proyecto' },
  { id: 'capacidades', etiqueta: 'Capacidades' },
  { id: 'forma-de-trabajo', etiqueta: 'Cómo trabajo' },
  { id: 'contacto', etiqueta: 'Contacto' },
];

export function App() {
  const contactos = [
    CONTACTO.correo && { href: `mailto:${CONTACTO.correo}`, texto: 'Escríbeme', Icono: Mail },
    CONTACTO.linkedin && { href: CONTACTO.linkedin, texto: 'LinkedIn', Icono: Briefcase },
    CONTACTO.github && { href: CONTACTO.github, texto: 'GitHub', Icono: Code },
  ].filter(Boolean) as { href: string; texto: string; Icono: typeof Mail }[];

  return (
    <>
      <Fondo />
      <Cabecera marca="Sthefano Avila" logo="/favicon.png" enlaces={NAV} cta={{ texto: 'Azkell Fleet', href: PRODUCTO_URL }} />

      <main>
        {/* ── Inicio ── */}
        <section id="inicio" className="heroe" style={{ position: 'relative' }}>
          <div className="contenedor heroe__cuadricula">
            <div>
              <Revelar y={14}>
                <span className="aviso"><span className="punto-vivo" />Creador de Azkell Fleet · ERP en producción</span>
              </Revelar>
              <h1>
                <Palabras alCargar retraso={0.15} texto="Construyo el software que mi propia operación necesitaba." />
              </h1>
              <Revelar retraso={0.5}>
                <p className="lead">
                  Experto en <Rotar palabras={PALABRAS_HEROE} /> de flota. Diseño y desarrollo Azkell Fleet, un ERP multiempresa en React, TypeScript, Node.js y MySQL.
                </p>
              </Revelar>
              <Revelar retraso={0.65} className="heroe__acciones">
                <Boton href={PRODUCTO_URL} variante="acento">Conocer Azkell Fleet <ArrowRight size={18} /></Boton>
                <Boton href="#proyecto" variante="vidrio">Ver el proyecto</Boton>
              </Revelar>
            </div>
            <Revelar y={24} retraso={0.2}><VistaSistema compacta /><p className="sis-nota">Vista del sistema con datos de demostración</p></Revelar>
          </div>
          <div className="desplazar" aria-hidden>Desliza<i /></div>
        </section>

        <div className="banda"><Marquesina items={TECNOLOGIAS} /></div>

        {/* ── Sobre mí ── */}
        <section id="sobre-mi" className="seccion">
          <div className="contenedor dos-col">
            <div>
              <Revelar><span className="etiqueta">Sobre mí</span></Revelar>
              <h2 className="titulo"><Palabras texto="Del taller y la operación al código." /></h2>
            </div>
            <Revelar retraso={0.1}>
              <p className="lead" style={{ marginTop: 0 }}>
                Soy Sthefano Avila Li. Conozco la operación de una flota desde adentro: programar viajes, mantener unidades, controlar un almacén y cerrar costos.
              </p>
              <p className="lead">
                Cuando las herramientas disponibles no alcanzaron, construí la mía. Hoy Azkell Fleet reúne esa operación en un solo sistema que usan varias empresas, y lo sigo desarrollando de punta a punta.
              </p>
            </Revelar>
          </div>
          <div className="contenedor">
            <div className="cifras">
              {CIFRAS.map((c, i) => (
                <Revelar key={c.texto} retraso={i * 0.08}>
                  <div className="cifra"><b className="degradado"><Contador hasta={c.valor} sufijo={c.sufijo} /></b><span>{c.texto}</span></div>
                </Revelar>
              ))}
            </div>
          </div>
        </section>

        {/* ── Proyecto ── */}
        <section id="proyecto" className="seccion">
          <div className="contenedor">
            <Revelar><span className="etiqueta">Proyecto destacado</span></Revelar>
            <h2 className="titulo"><Palabras texto="Azkell Fleet: un ERP hecho para flotas." /></h2>
            <Revelar retraso={0.1}>
              <p className="lead">
                Una plataforma multiempresa: cada empresa entra por su propio subdominio y trabaja sobre su propia base de datos. Cubre desde el GPS de la unidad hasta el pago al proveedor.
              </p>
            </Revelar>
            <div className="rejilla-tarjetas">
              {MODULOS.map((m, i) => {
                const Icono = icono(m.icono);
                return (
                  <Revelar key={m.titulo} retraso={i * 0.06}>
                    <Inclinar><div className="icono"><Icono size={22} /></div><h3>{m.titulo}</h3></Inclinar>
                  </Revelar>
                );
              })}
            </div>
            <Revelar retraso={0.1} className="heroe__acciones">
              <Boton href={PRODUCTO_URL} variante="primario">Ver el producto <ArrowUpRight size={18} /></Boton>
            </Revelar>
          </div>
        </section>

        {/* ── Capacidades ── */}
        <section id="capacidades" className="seccion">
          <div className="contenedor">
            <Revelar><span className="etiqueta">Capacidades</span></Revelar>
            <h2 className="titulo"><Palabras texto="Operación y software, en la misma persona." /></h2>
            <div className="rejilla-tarjetas">
              {CAPACIDADES.map((c, i) => {
                const Icono = icono(c.icono);
                return (
                  <Revelar key={c.titulo} retraso={(i % 3) * 0.08}>
                    <Inclinar><div className="icono"><Icono size={22} /></div><h3>{c.titulo}</h3><p>{c.texto}</p></Inclinar>
                  </Revelar>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Cómo trabajo ── */}
        <section id="forma-de-trabajo" className="seccion">
          <div className="contenedor dos-col">
            <div>
              <Revelar><span className="etiqueta">Cómo trabajo</span></Revelar>
              <h2 className="titulo"><Palabras texto="Un sistema que se puede confiar en producción." /></h2>
              <div className="linea">
                {HITOS.map((h, i) => (
                  <Revelar key={h.titulo} retraso={i * 0.08} className="linea__item">
                    <small>{h.fecha}</small><h3>{h.titulo}</h3><p>{h.texto}</p>
                  </Revelar>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {PRINCIPIOS.map((p, i) => (
                <Revelar key={p.titulo} retraso={i * 0.08}>
                  <Inclinar><h3>{p.titulo}</h3><p>{p.texto}</p></Inclinar>
                </Revelar>
              ))}
            </div>
          </div>
        </section>

        {/* ── Contacto ── */}
        <section id="contacto" className="seccion">
          <div className="contenedor">
            <Revelar>
              <div className="cta-final">
                <span className="etiqueta">Contacto</span>
                <h2 className="titulo">¿Hablamos de tu flota?</h2>
                <p className="lead" style={{ marginInline: 'auto' }}>
                  Si quieres ver Azkell Fleet funcionando o sumar a tu empresa, conversemos.
                </p>
                <div className="heroe__acciones">
                  <Boton href={PRODUCTO_URL} variante="acento">Ir a Azkell Fleet <ArrowUpRight size={18} /></Boton>
                  {contactos.map(c => (
                    <Boton key={c.texto} href={c.href} variante="vidrio" externo={!c.href.startsWith('mailto:')}><c.Icono size={18} />{c.texto}</Boton>
                  ))}
                </div>
              </div>
            </Revelar>
          </div>
        </section>
      </main>

      <Pie>
        <span>© {new Date().getFullYear()} Sthefano Avila Li</span>
        <span>Operaciones · Logística · Mantenimiento · Software</span>
      </Pie>
    </>
  );
}
