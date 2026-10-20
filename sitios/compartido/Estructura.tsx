import { useEffect, useState, type ReactNode } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { Iman, ProgresoScroll, suave } from './Movimiento';

/** Fondo vivo: manchas de luz con parallax, rejilla, grano y un foco que sigue al puntero */
export function Fondo() {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 2400], [0, -240]);
  const y2 = useTransform(scrollY, [0, 2400], [0, 200]);
  useEffect(() => {
    let raf = 0;
    const alMover = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--mx', `${e.clientX}px`);
        document.documentElement.style.setProperty('--my', `${e.clientY}px`);
      });
    };
    window.addEventListener('pointermove', alMover, { passive: true });
    return () => { window.removeEventListener('pointermove', alMover); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="fondo" aria-hidden>
      <motion.div style={{ y: y1, position: 'absolute', inset: 0 }}><div className="fondo__mancha fondo__mancha--1" /></motion.div>
      <motion.div style={{ y: y2, position: 'absolute', inset: 0 }}><div className="fondo__mancha fondo__mancha--2" /></motion.div>
      <div className="fondo__mancha fondo__mancha--3" />
      <div className="fondo__rejilla" />
      <div className="fondo__foco" />
      <div className="fondo__grano" />
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
      <motion.header className="cabecera" initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.9, ease: suave, delay: 0.2 }}>
        <nav className="cabecera__barra" aria-label="Principal">
          <a className="cabecera__marca" href="#inicio"><img src={logo} alt="" />{marca}</a>
          {enlaces.map(l => (
            <a key={l.id} className="cabecera__enlace" href={`#${l.id}`} data-activo={activo === l.id}>
              {activo === l.id && <motion.span layoutId="pastilla-nav" className="cabecera__pastilla" transition={{ type: 'spring', bounce: 0, duration: 0.4 }} />}
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
