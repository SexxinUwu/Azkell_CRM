import '../mantenimiento/mant.css';
import './centros-costos.css';
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Boxes } from 'lucide-react';
import { CrudLista } from '../../core/ui/CrudLista';
import { useAuth } from '../../core/auth/AuthProvider';
import { CcMotivosGasto } from './cc-MotivosGasto';
import {
  eliminarCentroCosto, guardarCentroCosto, useCentrosCostos, type CentroCosto,
} from './api';

type Vista = 'centros' | 'motivos';

// Niveles y valores del clásico (modulos/tesoreria/centros-costos/vista.html)
const NIVELES = [
  { value: 'Principal', label: 'Principal (categoría mayor)' },
  { value: 'Subcentro', label: 'Subcentro (línea operativa)' },
  { value: 'Auxiliar', label: 'Auxiliar / proyecto específico' },
];
const ESTADOS = [{ value: 'ACTIVO', label: 'Activo' }, { value: 'INACTIVO', label: 'Inactivo' }];
const conPlaca = (c: CentroCosto) => c.requiere_placa === true || Number(c.requiere_placa) === 1;

// Tarjetas de resumen del clásico (modulos/tesoreria/centros-costos/vista.html): textos fijos, mismos colores e iconos
const TARJETAS_AREA = [
  { etiqueta: 'Administración (CC-100)', valor: 'Cuenta 941', icono: 'bi-buildings', fondo: '#e0e7ff', color: '#4338ca' },
  { etiqueta: 'Ventas & Comercial (CC-200)', valor: 'Cuenta 951', icono: 'bi-megaphone', fondo: '#fef3c7', color: '#b45309' },
  { etiqueta: 'Operaciones de Ruta (CC-300)', valor: 'Cuenta 911 (Costo Directo)', icono: 'bi-truck', fondo: '#dcfce7', color: '#15803d' },
  { etiqueta: 'Taller & Mantenimiento (CC-400)', valor: 'Cuenta 912 (Indirecto)', icono: 'bi-tools', fondo: '#f3e8ff', color: '#7e22ce' },
];

// Tesorería › Centros de costos y motivos de gasto
export function CentrosCostosPage() {
  const [vista, setVista] = useState<Vista>('centros');
  // Pestañas del clásico (nav-pills), mismos textos e iconos
  const toggle = (
    <div className="cc-bs">
      <ul className="nav nav-pills mb-3 border-bottom pb-2 gap-2" role="tablist">
        <li className="nav-item" role="presentation">
          <button type="button" role="tab" aria-selected={vista === 'centros'}
            className={`nav-link${vista === 'centros' ? ' active' : ''} fw-bold px-3 py-2 rounded-3 d-flex align-items-center gap-2`}
            onClick={() => setVista('centros')}>
            <i className="bi bi-diagram-3-fill"></i> 1. Centros de Costos (Destino / NIIF)
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button type="button" role="tab" aria-selected={vista === 'motivos'}
            className={`nav-link${vista === 'motivos' ? ' active' : ''} fw-bold px-3 py-2 rounded-3 d-flex align-items-center gap-2`}
            onClick={() => setVista('motivos')}>
            <i className="bi bi-tags-fill"></i> 2. Motivos y Sub Motivos de Gasto (Naturaleza)
          </button>
        </li>
      </ul>
    </div>
  );
  return vista === 'centros' ? <Centros arriba={toggle} /> : <CcMotivosGasto arriba={toggle} />;
}

function Centros({ arriba }: { arriba: ReactNode }) {
  const q = useCentrosCostos();
  const qc = useQueryClient();
  const { can } = useAuth();
  const refrescar = () => qc.invalidateQueries({ queryKey: ['tesoreria', 'centros-costos'] });
  const w = can('tesoreria_centros_costos.crear', 'tesoreria_caja.crear');
  const d = can('tesoreria_centros_costos.eliminar', 'tesoreria_caja.eliminar');
  const lista: CentroCosto[] = q.data ?? [];
  const activos = lista.filter(c => c.estado === 'ACTIVO').length;
  const exigenPlaca = lista.filter(conPlaca).length;

  return (
    <CrudLista<CentroCosto>
      eyebrow="Tesorería" titulo="Centros de costos" singular="Centro de costos" icono={<Boxes size={16} />}
      datos={lista} cargando={q.isLoading} error={q.isError ? q.error : undefined} idDe={c => c.id}
      arriba={<>
        {arriba}
        <div className="cc-bs" style={{ margin: '0 var(--s-2)' }}>
          <div className="cc-kpis-grid">
            {TARJETAS_AREA.map(t => (
              <div key={t.etiqueta} className="cc-kpi-card">
                <div className="cc-kpi-icon" style={{ background: t.fondo, color: t.color }}><i className={`bi ${t.icono}`}></i></div>
                <div>
                  <span className="text-muted small fw-semibold d-block">{t.etiqueta}</span>
                  <span className="fw-bolder text-dark fs-6">{t.valor}</span>
                </div>
              </div>
            ))}
          </div>
          {/* Insignia del total: la rellena ccActualizarKPIs en el clásico */}
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-2.5 py-1.5 fw-bold" id="cc-badge-total">
              {`${lista.length} Centros Registrados`}
            </span>
          </div>
        </div>
        {lista.length > 0 && (
          <p className="t-callout c-secondary" style={{ margin: '0 var(--s-2)' }}>
            {activos} activos · {exigenPlaca} exigen placa
          </p>
        )}
      </>}
      principal={c => `${c.codigo} · ${c.nombre}`}
      secundaria={c => [c.nivel, c.cuenta_contable && `Cuenta ${c.cuenta_contable}`, conPlaca(c) ? 'Exige placa' : ''].filter(Boolean).join(' · ')}
      derecha={c => ({ texto: c.estado === 'ACTIVO' ? 'Activo' : 'Inactivo', tono: c.estado === 'ACTIVO' ? 'green' : 'neutral' })}
      buscarEn={c => `${c.codigo} ${c.nombre} ${c.descripcion ?? ''} ${c.cuenta_contable ?? ''}`}
      campos={[
        { clave: 'codigo', label: 'Código', requerido: true, normalizar: v => v.toUpperCase(), soloCrear: true,
          ayuda: 'Ej.: CC-300. Se guarda en mayúsculas y no se cambia después: los gastos lo usan como referencia.' },
        { clave: 'nombre', label: 'Nombre', requerido: true },
        { clave: 'nivel', label: 'Nivel jerárquico', tipo: 'select', opciones: NIVELES, requerido: true, inicial: 'Principal' },
        { clave: 'cuenta_contable', label: 'Cuenta contable (PCGE / SUNAT)', ayuda: 'Ej.: 911 - Costo de transporte directo' },
        { clave: 'requiere_placa', label: 'Exige placa en los gastos', tipo: 'bool',
          ayuda: 'La caja pedirá la placa del vehículo al registrar un gasto con este centro.' },
        { clave: 'estado', label: 'Estado', tipo: 'select', opciones: ESTADOS, requerido: true, inicial: 'ACTIVO' },
        { clave: 'descripcion', label: 'Descripción', wide: true, ayuda: 'Qué tipo de gastos o compras se imputan a este centro.' },
      ]}
      crear={w ? async v => { await guardarCentroCosto(null, v); await refrescar(); } : undefined}
      editar={w ? async (c, v) => { await guardarCentroCosto(c.id, v); await refrescar(); } : undefined}
      eliminar={d ? async c => { await eliminarCentroCosto(c.id); await refrescar(); } : undefined}
      exportar={{
        nombre: 'Centros-de-costos',
        encabezados: ['Código', 'Nombre', 'Nivel', 'Cuenta contable', 'Exige placa', 'Estado', 'Descripción'],
        fila: c => [c.codigo, c.nombre, c.nivel, c.cuenta_contable, conPlaca(c) ? 'Sí' : 'No', c.estado, c.descripcion],
      }}
    />
  );
}
