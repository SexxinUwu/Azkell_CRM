import { Building2, Globe2, MapPin, PackageOpen, RefreshCw, ShieldCheck, Truck, Eye } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { initials } from '../../core/lib/format';
import { useEmpresasStats, type EmpresaStats } from './garitaBase';

// Paletas por posición, igual que el clásico (azul, verde, ámbar, rosa)
const PALETAS = [
  { bg: 'var(--blue-tint)', color: 'var(--blue-ink)', Icono: Building2 },
  { bg: 'var(--green-tint)', color: 'var(--green-ink)', Icono: Truck },
  { bg: 'var(--amber-tint)', color: 'var(--amber-ink)', Icono: MapPin },
  { bg: 'rgba(219, 39, 119, 0.12)', color: '#db2777', Icono: PackageOpen },
];

/** Pantalla inicial: elegir la empresa cuyos checklist se gestionan o consultan */
export function GaritaEmpresas({ usuario, empresaActiva, nombreEmpresaSesion, onElegir }: {
  usuario: string; empresaActiva: string; nombreEmpresaSesion: string; onElegir: (empresa: string) => void;
}) {
  const stats = useEmpresasStats(empresaActiva);
  let empresas: EmpresaStats[] = stats.data?.empresas ?? [];
  // Sin empresas en los datos, el clásico muestra la de la sesión (salvo Azkell Fleet)
  const nomSesion = nombreEmpresaSesion.trim().toUpperCase();
  if (!stats.isLoading && !empresas.length && nomSesion && nomSesion !== 'AZKELL FLEET') {
    empresas = [{ empresa: nomSesion, total_flota: 0, en_ruta: 0, completados: 0, alertas: 0 }];
  }
  const global = stats.data?.global ?? { empresa: 'TODAS', total_flota: 0, en_ruta: 0, completados: 0, alertas: 0 };
  const nombre = usuario.trim() || 'Oficial de Seguridad';

  return (
    <div className="gar">
      <div className="gar-hero">
        <div className="gar-hero__izq">
          <div className="gar-avatar" aria-hidden>{initials(nombre)}</div>
          <div>
            <span className="gar-modulo">MÓDULO SEGURIDAD</span>
            <h2>¡Hola, {nombre}! 👋</h2>
            <p>¿A qué empresa deseas gestionar / consultar CheckList hoy?</p>
          </div>
        </div>
        <Button variant="secondary" icon={<RefreshCw size={16} />} loading={stats.isFetching && !stats.isLoading} onClick={() => stats.refetch()}>Actualizar Flota</Button>
      </div>

      {stats.isError && (
        <Notice tone="error">No se pudieron cargar las empresas. <Button size="sm" variant="plain" onClick={() => stats.refetch()}>Cargar empresas</Button></Notice>
      )}
      {stats.isLoading && <div className="gar-vacio">Cargando empresas disponibles…</div>}

      {!stats.isLoading && (
        <div className="gar-grid">
          {empresas.map((e, i) => {
            const pal = PALETAS[i % PALETAS.length];
            return (
              <button key={e.empresa} type="button" className="gar-op" onClick={() => onElegir(e.empresa)}>
                <div>
                  <div className="gar-op__fila">
                    <span className="gar-op__icono" style={{ background: pal.bg, color: pal.color }}><pal.Icono size={22} /></span>
                    <span className="gar-badge">{e.total_flota || 0} Unidades</span>
                  </div>
                  <h3>{e.empresa}</h3>
                  <p>Gestión de salidas y retornos de flota {e.empresa}</p>
                </div>
                <div className="gar-mini">
                  <div><b className="c-azul">{e.en_ruta}</b><span>En ruta</span></div>
                  <div><b className="c-verde">{e.completados}</b><span>Completados</span></div>
                  <div><b className={e.alertas > 0 ? 'c-rojo' : 'c-gris'}>{e.alertas}</b><span>Alertas</span></div>
                </div>
                <span className="gar-op__btn"><ShieldCheck size={17} /> Gestionar CheckList →</span>
              </button>
            );
          })}

          <button type="button" className="gar-op gar-op--global" onClick={() => onElegir('TODAS')}>
            <div>
              <div className="gar-op__fila">
                <span className="gar-op__icono" style={{ background: '#334155', color: '#fff' }}><Globe2 size={22} /></span>
                <span className="gar-badge gar-badge--oscuro">Consolidado</span>
              </div>
              <h3>TODAS LAS EMPRESAS</h3>
              <p>Vista general combinada de todas las empresas de la flota</p>
            </div>
            <div className="gar-mini">
              <div><b className="c-azul">{global.en_ruta}</b><span>En ruta</span></div>
              <div><b className="c-verde">{global.completados}</b><span>Completados</span></div>
              <div><b className="c-gris">{global.total_flota}</b><span>Total flota</span></div>
            </div>
            <span className="gar-op__btn gar-op__btn--plano"><Eye size={17} /> Ver Flota Global →</span>
          </button>
        </div>
      )}
    </div>
  );
}
