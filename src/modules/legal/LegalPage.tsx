import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DOCUMENTO_POR_ID, DOCUMENTOS, type Documento } from './legalContenido';
import './legal.css';

// Un texto con datos pendientes: los [COMPLETAR: …] se marcan para que nadie los publique sin revisar.
function Texto({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\[COMPLETAR[^\]]*\])/g).map((parte, i) =>
        parte.startsWith('[COMPLETAR')
          ? <mark key={i} className="legal__pendiente">{parte}</mark>
          : <span key={i}>{parte}</span>,
      )}
    </>
  );
}

// Políticas, términos, cookies y reembolsos. Públicas: se abren desde el inicio de sesión.
export function LegalPage() {
  const { pagina } = useParams();
  const doc = pagina && pagina in DOCUMENTO_POR_ID ? DOCUMENTO_POR_ID[pagina as Documento['id']] : undefined;
  if (!doc) return <Navigate to="/login" replace />;

  return (
    <div className="legal">
      <header className="legal__cab">
        <Link to="/login" className="legal__volver"><ArrowLeft size={16} aria-hidden /> Volver al inicio de sesión</Link>
      </header>

      <nav aria-label="Documentos legales" className="legal__indice">
        {DOCUMENTOS.map(d => (
          <Link key={d.id} to={`/legal/${d.id}`} className="legal__chip" aria-current={d.id === doc.id ? 'page' : undefined}>
            {d.titulo}
          </Link>
        ))}
      </nav>

      <main className="legal__cuerpo">
        <p className="legal__borrador" role="note">
          <strong>Borrador.</strong> Antes de publicarlo, completa los datos marcados en amarillo y revísalo un abogado.
        </p>
        <h1>{doc.titulo}</h1>
        <p className="legal__resumen">{doc.resumen}</p>

        {doc.secciones.map(s => (
          <section key={s.titulo} className="legal__seccion">
            <h2>{s.titulo}</h2>
            {s.parrafos?.map((p, i) => <p key={i}><Texto texto={p} /></p>)}
            {s.lista && (
              <ul>
                {s.lista.map((l, i) => <li key={i}><Texto texto={l} /></li>)}
              </ul>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
