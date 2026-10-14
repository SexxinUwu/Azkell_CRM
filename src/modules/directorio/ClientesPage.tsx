import '../mantenimiento/mant.css';
import { Building2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { CrudLista } from '../../core/ui/CrudLista';
import { api } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { useClientes, type Cliente } from './api';

async function guardar(id: number | string | null, v: Record<string, unknown>) {
  const r = await api<{ ok?: boolean; error?: string }>(id ? `/clientes/${id}` : '/clientes', { method: id ? 'PUT' : 'POST', body: v });
  if (r && r.ok === false) throw new Error(r.error || 'No se pudo guardar el cliente');
}

// Directorio › Clientes. Al guardar, el servidor actualiza el nombre del cliente en todas sus placas.
export function ClientesPage() {
  const { data, isLoading, isError, error } = useClientes();
  const { can } = useAuth();
  const qc = useQueryClient();
  const refrescar = () => qc.invalidateQueries({ queryKey: ['directorio', 'clientes'] });
  const lista: Cliente[] = data ?? [];

  return (
    <CrudLista<Cliente>
      eyebrow="Directorio" titulo="Clientes" singular="Cliente" icono={<Building2 size={16} />}
      datos={lista} cargando={isLoading} error={isError ? error : undefined} idDe={c => c.id}
      principal={c => c.razon_social || c.nombre || 'Sin razón social'}
      secundaria={c => [c.ruc_dni ? `RUC/DNI ${c.ruc_dni}` : 'Sin RUC', c.telefono, c.email].filter(Boolean).join(' · ')}
      derecha={c => ({
        texto: `${Number(c.total_flota) || 0} unid.${String(c.estado ?? 'Activo').toLowerCase() === 'activo' ? '' : ' · Inactivo'}`,
        tono: String(c.estado ?? 'Activo').toLowerCase() === 'activo' ? 'neutral' : 'amber',
      })}
      buscarEn={c => `${c.razon_social ?? ''} ${c.nombre ?? ''} ${c.ruc_dni ?? ''} ${c.email ?? ''} ${c.telefono ?? ''}`}
      campos={[
        { clave: 'razon_social', label: 'Razón social', requerido: true, wide: true, normalizar: v => v.toUpperCase() },
        { clave: 'ruc_dni', label: 'RUC / DNI' },
        { clave: 'telefono', label: 'Teléfono' },
        { clave: 'email', label: 'Correo' },
        { clave: 'estado', label: 'Estado', tipo: 'select', opciones: ['Activo', 'Inactivo'], requerido: true, inicial: 'Activo' },
        { clave: 'direccion', label: 'Dirección', wide: true },
        { clave: 'notas', label: 'Notas', wide: true },
      ]}
      crear={can('clientes.crear') ? async v => { await guardar(null, v); await refrescar(); } : undefined}
      editar={can('clientes.editar', 'clientes.crear') ? async (c, v) => { await guardar(c.id, v); await refrescar(); await qc.invalidateQueries({ queryKey: ['placas'] }); } : undefined}
      eliminar={can('clientes.eliminar') ? async c => {
        const r = await api<{ ok?: boolean; error?: string }>(`/clientes/${c.id}`, { method: 'DELETE' });
        if (r && r.ok === false) throw new Error(r.error || 'No se pudo eliminar');
        await refrescar();
      } : undefined}
      exportar={{
        nombre: 'Clientes',
        encabezados: ['Razón social', 'RUC / DNI', 'Teléfono', 'Correo', 'Dirección', 'Estado', 'Unidades'],
        fila: c => [c.razon_social, c.ruc_dni, c.telefono, c.email, c.direccion, c.estado, Number(c.total_flota) || 0],
      }}
      clasico="directorio/clientes"
    />
  );
}
