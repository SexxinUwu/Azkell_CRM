import '../mantenimiento/mant.css';
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Boxes, Tags } from 'lucide-react';
import { CrudLista } from '../../core/ui/CrudLista';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useAuth } from '../../core/auth/AuthProvider';
import {
  eliminarCentroCosto, eliminarMotivoGasto, guardarCentroCosto, guardarMotivoGasto,
  useCentrosCostos, useMotivosGastos, type CentroCosto, type MotivoGasto,
} from './api';

type Vista = 'centros' | 'motivos';
const ESTADOS = ['ACTIVO', 'INACTIVO'];

// Tesorería › Centros de costos y motivos de gasto
export function CentrosCostosPage() {
  const [vista, setVista] = useState<Vista>('centros');
  const toggle = (
    <SegmentedControl<Vista> label="Vista" value={vista} onChange={setVista}
      options={[{ value: 'centros', label: 'Centros de costos' }, { value: 'motivos', label: 'Motivos de gasto' }]} />
  );
  return vista === 'centros' ? <Centros arriba={toggle} /> : <Motivos arriba={toggle} />;
}

function Centros({ arriba }: { arriba: ReactNode }) {
  const q = useCentrosCostos();
  const qc = useQueryClient();
  const { can } = useAuth();
  const refrescar = () => qc.invalidateQueries({ queryKey: ['tesoreria', 'centros-costos'] });
  const w = can('tesoreria_centros_costos.crear', 'tesoreria_caja.crear');
  const d = can('tesoreria_centros_costos.eliminar', 'tesoreria_caja.eliminar');
  const lista: CentroCosto[] = q.data ?? [];

  return (
    <CrudLista<CentroCosto>
      eyebrow="Tesorería" titulo="Centros de costos" singular="Centro de costos" icono={<Boxes size={16} />}
      datos={lista} cargando={q.isLoading} error={q.isError ? q.error : undefined} idDe={c => c.id} arriba={arriba}
      principal={c => `${c.codigo} · ${c.nombre}`}
      secundaria={c => [c.nivel, c.cuenta_contable && `Cuenta ${c.cuenta_contable}`, c.requiere_placa ? 'Requiere placa' : ''].filter(Boolean).join(' · ')}
      derecha={c => ({ texto: c.estado, tono: c.estado === 'ACTIVO' ? 'green' : 'neutral' })}
      buscarEn={c => `${c.codigo} ${c.nombre} ${c.descripcion ?? ''} ${c.cuenta_contable ?? ''}`}
      campos={[
        { clave: 'codigo', label: 'Código', requerido: true, normalizar: v => v.toUpperCase() },
        { clave: 'nombre', label: 'Nombre', requerido: true },
        { clave: 'nivel', label: 'Nivel', tipo: 'select', opciones: ['Principal', 'Secundario', 'Auxiliar'], requerido: true, inicial: 'Principal' },
        { clave: 'estado', label: 'Estado', tipo: 'select', opciones: ESTADOS, requerido: true, inicial: 'ACTIVO' },
        { clave: 'cuenta_contable', label: 'Cuenta contable' },
        { clave: 'requiere_placa', label: 'Exige placa en los gastos', tipo: 'bool' },
        { clave: 'descripcion', label: 'Descripción', wide: true },
      ]}
      crear={w ? async v => { await guardarCentroCosto(null, v); await refrescar(); } : undefined}
      editar={w ? async (c, v) => { await guardarCentroCosto(c.id, v); await refrescar(); } : undefined}
      eliminar={d ? async c => { await eliminarCentroCosto(c.id); await refrescar(); } : undefined}
      exportar={{
        nombre: 'Centros-de-costos',
        encabezados: ['Código', 'Nombre', 'Nivel', 'Cuenta contable', 'Requiere placa', 'Estado', 'Descripción'],
        fila: c => [c.codigo, c.nombre, c.nivel, c.cuenta_contable, c.requiere_placa ? 'Sí' : 'No', c.estado, c.descripcion],
      }}
      clasico="tesoreria/centros-costos"
    />
  );
}

function Motivos({ arriba }: { arriba: ReactNode }) {
  const q = useMotivosGastos();
  const cc = useCentrosCostos();
  const qc = useQueryClient();
  const { can } = useAuth();
  const refrescar = () => qc.invalidateQueries({ queryKey: ['tesoreria', 'motivos-gastos'] });
  const w = can('tesoreria_centros_costos.crear', 'tesoreria_caja.crear');
  const d = can('tesoreria_centros_costos.eliminar', 'tesoreria_caja.eliminar');
  const lista: MotivoGasto[] = q.data ?? [];

  return (
    <CrudLista<MotivoGasto>
      eyebrow="Tesorería" titulo="Motivos de gasto" singular="Motivo" icono={<Tags size={16} />}
      datos={lista} cargando={q.isLoading} error={q.isError ? q.error : undefined} idDe={m => m.id} arriba={arriba}
      principal={m => `${m.motivo} › ${m.sub_motivo}`}
      secundaria={m => (m.centro_costo_codigo ? `Centro de costos ${m.centro_costo_codigo}` : 'Sin centro de costos')}
      derecha={m => ({ texto: m.estado, tono: m.estado === 'ACTIVO' ? 'green' : 'neutral' })}
      buscarEn={m => `${m.motivo} ${m.sub_motivo} ${m.centro_costo_codigo ?? ''}`}
      campos={[
        { clave: 'motivo', label: 'Motivo', requerido: true },
        { clave: 'sub_motivo', label: 'Sub motivo', requerido: true },
        {
          clave: 'centro_costo_codigo', label: 'Centro de costos', tipo: 'select',
          opciones: (cc.data ?? []).map(c => ({ value: c.codigo, label: `${c.codigo} · ${c.nombre}` })),
        },
        { clave: 'estado', label: 'Estado', tipo: 'select', opciones: ESTADOS, requerido: true, inicial: 'ACTIVO' },
      ]}
      crear={w ? async v => { await guardarMotivoGasto(null, v); await refrescar(); } : undefined}
      editar={w ? async (m, v) => { await guardarMotivoGasto(m.id, v); await refrescar(); } : undefined}
      eliminar={d ? async m => { await eliminarMotivoGasto(m.id); await refrescar(); } : undefined}
      exportar={{
        nombre: 'Motivos-de-gasto',
        encabezados: ['Motivo', 'Sub motivo', 'Centro de costos', 'Estado'],
        fila: m => [m.motivo, m.sub_motivo, m.centro_costo_codigo, m.estado],
      }}
      clasico="tesoreria/centros-costos"
    />
  );
}
