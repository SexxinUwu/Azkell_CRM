import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { Iman, ProgresoScroll, resorte, resorteRapido } from './Movimiento';

/** Fondo fijo y estático (sin animaciones ni desenfoques): una luz de acento y una rejilla tenue */
export function Fondo() {
  return (
    <div className="fondo" aria-hidden>
      <div className="fondo__luz" />
      <div className="fondo__rejilla" />
    </div>
  );
}

export interface EnlaceNav { id: string; etiqueta: string }

/** Cabecera flotante de vidrio; resalta la sección que se está viendo */
export function Cabecera({ marca, logo, enlaces, cta }: {
  marca: string; logo: string; enlaces: EnlaceNav[]; cta: { texto: string; href: string };
}) {
  const [activo, setActivo] = useState('');
  useEffect(() => {
    const obs = new IntersectionObserver(
      entradas => entradas.forEach(e => { if (e.isIntersecting) setActivo(e.target.id); }),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    enlaces.forEach(l => { const el = document.getElementById(l.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [enlaces]);
  return (
    <>
      <ProgresoScroll />
      <motion.header className="cabecera" initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={resorte}>
        <nav className="cabecera__barra" aria-label="Principal">
          <a className="cabecera__marca" href="#inicio"><img src={logo} alt="" />{marca}</a>
          {enlaces.map(l => (
            <a key={l.id} className="cabecera__enlace" href={`#${l.id}`} data-activo={activo === l.id}>
              {activo === l.id && <motion.span layoutId="pastilla-nav" className="cabecera__pastilla" transition={resorteRapido} />}
              {l.etiqueta}
            </a>
          ))}
          <a className="btn btn--primario cabecera__enlace cabecera__cta" href={cta.href} style={{ color: '#0a0b10', padding: '0.5rem 1rem' }}>
            {cta.texto}<ArrowUpRight size={15} />
          </a>
        </nav>
      </motion.header>
    </>
  );
}

export function Boton({ href, children, variante = 'primario', externo = false }: {
  href: string; children: ReactNode; variante?: 'primario' | 'acento' | 'vidrio'; externo?: boolean;
}) {
  return (
    <Iman>
      <a className={`btn btn--${variante}`} href={href} {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
    </Iman>
  );
}

export function Pie({ children }: { children: ReactNode }) {
  return <footer className="pie"><div className="contenedor pie__fila">{children}</div></footer>;
}
