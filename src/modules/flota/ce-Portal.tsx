import './ce-portal-lista.css';
import { Building2, Eye, Globe2, MapPin, PackageOpen, RefreshCw, Truck, ClipboardCheck } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Badge, Notice } from '../../core/ui/Display';
import { errorMessage } from '../../core/api/client';
import { formatQuantity, initials } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';

/** Cifras de una empresa tal como las devuelve GET /seguridad/entrega-vehiculos/stats */
export interface EmpresaEntrega {
  empresa: string;
  total_flota: number;
  total_actas: number;
  hoy: number;
  vehiculos?: number;
}

/** Respuesta completa de GET /seguridad/entrega-vehiculos/stats (global + una tarjeta por empresa) */
export interface StatsEntrega {
  ok?: boolean;
  global: EmpresaEntrega;
  empresas: EmpresaEntrega[];
}

// Paletas por posición, igual que el clásico (azul, verde, ámbar, rosa)
const PALETAS = [
  { bg: 'var(--blue-tint)', color: 'var(--blue-ink)', Icono: Building2 },
  { bg: 'var(--green-tint)', color: 'var(--green-ink)', Icono: Truck },
  { bg: 'var(--amber-tint)', color: 'var(--amber-ink)', Icono: MapPin },
  { bg: 'rgba(219, 39, 119, 0.12)', color: '#db2777', Icono: PackageOpen },
];

interface PropsPortal {
  usuario: string;
  stats: StatsEntrega | undefined;
  cargando: boolean;
  error: unknown;
  actualizando: boolean;
  onElegir: (empresa: string) => void;
  onActualizar: () => void;
}

/** Portal: elegir la empresa cuyas actas de entrega se gestionan (o TODAS las empresas) */
export function CePortal({ usuario, stats, cargando, error, actualizando, onElegir, onActualizar }: PropsPortal) {
  const empresas = stats?.empresas ?? [];
  const global = stats?.global;
  const nombre = usuario.trim() || 'Supervisor de Flota';

  return (
    <div className="cep-vista">
      <header className="cep-hero">
        <div className="cep-hero__izq">
          <span className="cep-hero__avatar" aria-hidden>{initials(nombre)}</span>
          <div>
            <span className="cep-eyebrow">Módulo flota</span>
            <h2 className="cep-hero__titulo">¡Hola, {nombre}! 👋</h2>
            <p className="cep-hero__texto">¿A qué empresa deseas gestionar o consultar el CheckList de Entrega de Vehículos hoy?</p>
          </div>
        </div>
        <Button variant="secondary" icon={<RefreshCw size={16} />} loading={actualizando}
          onClick={() => { haptic('selection'); onActualizar(); }}>
          Actualizar flota
        </Button>
      </header>

      {error ? <Notice tone="error">{errorMessage(error)}</Notice> : null}

      {cargando ? (
        <div className="cep-vacio">Actualizando empresas de flota…</div>
      ) : empresas.length === 0 ? (
        !error && <div className="cep-vacio">No se encontraron empresas registradas.</div>
      ) : (
        <div className="cep-portal-grid">
          {empresas.map((e, i) => {
            const pal = PALETAS[i % PALETAS.length];
            return (
              <button key={e.empresa} type="button" className="cep-emp pressable" onClick={() => { haptic('selection'); onElegir(e.empresa); }}>
                <div className="cep-emp__top">
                  <span className="cep-emp__icono" style={{ background: pal.bg, color: pal.color }}><pal.Icono size={20} /></span>
                  <Badge>{formatQuantity(e.total_flota || 0)} motoras</Badge>
                </div>
                <div>
                  <h3 className="cep-emp__nombre">{e.empresa}</h3>
                  <p className="cep-emp__sub">Gestión de entrega de unidades {e.empresa}</p>
                </div>
                <CifrasEmpresa actas={e.total_actas} hoy={e.hoy} flota={e.total_flota} />
                <span className="cep-emp__accion"><ClipboardCheck size={17} /> Gestionar CheckList →</span>
              </button>
            );
          })}

          {global && (
            <button type="button" className="cep-emp cep-emp--global pressable" onClick={() => { haptic('selection'); onElegir('TODAS'); }}>
              <div className="cep-emp__top">
                <span className="cep-emp__icono" style={{ background: '#334155', color: '#fff' }}><Globe2 size={20} /></span>
                <Badge tone="ink">Consolidado</Badge>
              </div>
              <div>
                <h3 className="cep-emp__nombre">Todas las empresas</h3>
                <p className="cep-emp__sub">Vista general combinada de todas las empresas de la flota</p>
              </div>
              <CifrasEmpresa actas={global.total_actas} hoy={global.hoy} flota={global.total_flota} etiquetaFlota="Total motoras" />
              <span className="cep-emp__accion"><Eye size={17} /> Ver flota global →</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CifrasEmpresa({ actas, hoy, flota, etiquetaFlota = 'Motoras' }: { actas: number; hoy: number; flota: number; etiquetaFlota?: string }) {
  return (
    <div className="cep-emp__cifras">
      <div className="cep-emp__cifra"><b>{formatQuantity(actas || 0)}</b><span>Actas</span></div>
      <div className="cep-emp__cifra"><b>{formatQuantity(hoy || 0)}</b><span>Hoy</span></div>
      <div className="cep-emp__cifra"><b>{formatQuantity(flota || 0)}</b><span>{etiquetaFlota}</span></div>
    </div>
  );
}
