// Pestaña Neumáticos de la ficha de placa: diagrama de la unidad con su llanta en cada posición,
// lista de montadas, conteos y acceso al tablero de movimientos. Tocar una llanta abre su línea de tiempo.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '../../core/auth/AuthProvider';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { Sheet } from '../../core/ui/Sheet';
import { errorMessage } from '../../core/api/client';
import { LeyendaSemaforo, configReconocida } from './NeumaticosEsquema';
import { NeumaticosCenital } from './nv3-cenital';
import { CONFIGURACIONES } from '../inspecciones/components/ChasisEsquemaVisual';
import { PERMISO_MOVER_NEUMATICOS, PERMISO_VER_NEUMATICOS } from './neumaticos-tablero-tipos';
import { useTablero, usePlacasLista } from './ntb-api';
import { LlantaItem, aLlantaDato } from './ntb-llanta';
import { LineaTiempo } from './ntb-linea-tiempo';
import './ntb.css';

function Cifra({ etiqueta, valor, tono }: { etiqueta: string; valor: number; tono?: 'green' | 'amber' | 'red' | 'accent' }) {
  return (
    <div className={`ntb-cifra${tono ? ` ntb-cifra--${tono}` : ''}`}>
      <span className="ntb-cifra__valor">{valor}</span>
      <span className="ntb-cifra__etiqueta">{etiqueta}</span>
    </div>
  );
}

export function NeumaticosPlacaTab({ placa }: { placa: string }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const puedeVer = can(PERMISO_VER_NEUMATICOS);
  const puedeMover = can(PERMISO_MOVER_NEUMATICOS);
  const tablero = useTablero(puedeVer ? placa : '');
  const placas = usePlacasLista();
  const marcaUnidad = placas.data?.find(p => p.placa === placa)?.marca ?? null;
  const [codigoLinea, setCodigoLinea] = useState<string | null>(null);

  if (!puedeVer) {
    return <EmptyState icon={<Lock size={22} />} title="Sin acceso">No tienes permiso para ver los neumáticos de esta unidad.</EmptyState>;
  }
  if (tablero.isLoading) return <PageLoader />;
  if (tablero.isError) return <Notice tone="error">{errorMessage(tablero.error)}</Notice>;
  const datos = tablero.data;
  if (!datos) return null;

  const montadas = datos.posiciones.flatMap(p => (p.llanta ? [{ posicion: p.posicion, llanta: p.llanta }] : []));
  const libres = datos.posiciones.length - montadas.length;
  const configCodigo = configReconocida(datos.configuracion);
  const cfg = configCodigo ? CONFIGURACIONES[configCodigo] : null;
  const llantasDato = montadas.map(m => aLlantaDato(m.llanta, m.posicion));

  const abrirLinea = (codigo: string) => setCodigoLinea(codigo);

  const irAlTablero = () => navigate(`/mantenimiento/neumaticos-tablero/${encodeURIComponent(placa)}`);

  return (
    <div className="ntb-placa">
      <div className="ntb-cifras" role="list" aria-label="Resumen de neumáticos">
        <Cifra etiqueta="Montadas" valor={montadas.length} tono="accent" />
        <Cifra etiqueta="Posiciones libres" valor={libres} />
        <Cifra etiqueta="Disponibles" valor={datos.disponibles.length} tono="green" />
        <Cifra etiqueta="En reforma" valor={datos.reforma.length} tono="amber" />
        <Cifra etiqueta="Descarte" valor={datos.descarte.length} tono="red" />
      </div>

      <div className="ntb-placa__cuerpo">
        <section className="card ntb-col" aria-label="Diagrama de la unidad">
          <div className="ntb-col__cab">
            <span className="ntb-col__titulo">
              {cfg && configCodigo ? `${configCodigo} · ${cfg.nombre}` : 'Ejes de la unidad'}
            </span>
          </div>
          {!cfg && <p className="t-footnote c-secondary">La unidad no tiene una configuración de ejes reconocida; las llantas se muestran agrupadas.</p>}
          <NeumaticosCenital
            llantas={llantasDato}
            configuracion={configCodigo}
            marca={marcaUnidad}
            activa=""
            onSelect={l => {
              const m = montadas.find(x => x.posicion === l.posicion);
              if (m) abrirLinea(m.llanta.codigo);
            }}
          />
          <LeyendaSemaforo />
        </section>

        <section className="card ntb-col" aria-label="Llantas montadas">
          <div className="ntb-col__cab">
            <span className="ntb-col__titulo">Llantas montadas ({montadas.length})</span>
          </div>
          {montadas.length > 0 ? (
            <div className="ntb-lista">
              {montadas.map(m => (
                <LlantaItem key={m.llanta.codigo} llanta={m.llanta} posicion={m.posicion} onActivar={() => abrirLinea(m.llanta.codigo)} />
              ))}
            </div>
          ) : (
            <p className="ntb-vacio">Esta unidad no tiene llantas montadas.</p>
          )}
          {puedeMover ? (
            <Button variant="accent" block onClick={irAlTablero}>Mover neumáticos</Button>
          ) : (
            <Button variant="secondary" block onClick={irAlTablero}>Ver tablero de neumáticos</Button>
          )}
        </section>
      </div>

      <Sheet
        open={!!codigoLinea}
        onClose={() => setCodigoLinea(null)}
        title={codigoLinea ? `Línea de tiempo · ${codigoLinea}` : 'Línea de tiempo'}
      >
        {codigoLinea && <LineaTiempo codigo={codigoLinea} />}
      </Sheet>
    </div>
  );
}

