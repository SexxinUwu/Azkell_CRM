import '../mantenimiento/mant.css';
import { useState } from 'react';
import { Building2, Download, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import '../../core/ui/acciones-iconos.css';
import { CrudLista } from '../../core/ui/CrudLista';
import { api } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { consultarRucSunat, useClientes, type Cliente } from './api';
import { ImportarClientesSheet, descargarPlantillaClientes } from './ImportarClientesSheet';

async function guardar(id: number | string | null, v: Record<string, unknown>) {
  const r = await api<{ ok?: boolean; error?: string }>(id ? `/clientes/${id}` : '/clientes', { method: id ? 'PUT' : 'POST', body: v });
  if (r && r.ok === false) throw new Error(r.error || 'No se pudo guardar el cliente');
}

// Directorio › Clientes. Al guardar, el servidor actualiza el nombre del cliente en todas sus placas.
export function ClientesPage() {
  const { data, isLoading, isError, error } = useClientes();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [importando, setImportando] = useState(false);
  const refrescar = () => qc.invalidateQueries({ queryKey: ['directorio', 'clientes'] });
  const lista: Cliente[] = data ?? [];

  return (
    <>
    <CrudLista<Cliente>
      eyebrow="Flota" titulo="Clientes" singular="Cliente" icono={<Building2 size={16} />}
      datos={lista} cargando={isLoading} error={isError ? error : undefined} idDe={c => c.id}
      principal={c => c.razon_social || c.nombre || 'Sin razón social'}
      secundaria={c => [c.ruc_dni ? `RUC/DNI ${c.ruc_dni}` : 'Sin RUC', c.telefono, c.email].filter(Boolean).join(' · ')}
      derecha={c => ({
        texto: `${Number(c.total_flota) || 0} unid.${String(c.estado ?? 'Activo').toLowerCase() === 'activo' ? '' : ' · Inactivo'}`,
        tono: String(c.estado ?? 'Activo').toLowerCase() === 'activo' ? 'green' : 'neutral',
      })}
      buscarEn={c => `${c.razon_social ?? ''} ${c.nombre ?? ''} ${c.ruc_dni ?? ''} ${c.email ?? ''} ${c.telefono ?? ''}`}
      tabla={{
        id: 'clientes-v2',
        columnas: [
          { id: 'razon', titulo: 'Razón social', ancho: 300, minimo: 180 },
          { id: 'ruc', titulo: 'RUC / DNI', ancho: 130 },
          { id: 'tel', titulo: 'Teléfono', ancho: 130 },
          { id: 'correo', titulo: 'Correo', ancho: 220 },
          { id: 'dir', titulo: 'Dirección', ancho: 280, minimo: 140 },
          { id: 'unid', titulo: 'Unidades', ancho: 100, alinear: 'right' },
          { id: 'estado', titulo: 'Estado', ancho: 110 },
          { id: 'acc', titulo: '', ancho: 56, minimo: 56 },
        ],
        celdas: c => {
          const activo = String(c.estado ?? 'Activo').toLowerCase() === 'activo';
          return [
            <strong key="r">{c.razon_social || c.nombre || 'Sin razón social'}</strong>,
            c.ruc_dni || '—', c.telefono || '—', c.email || '—', c.direccion || '—',
            <span key="u" style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(c.total_flota) || 0}</span>,
            <span key="e" style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: '0.6875rem', fontWeight: 700,
              background: activo ? 'var(--green-tint)' : 'var(--gray-tint)', color: activo ? 'var(--green-ink)' : 'var(--gray-ink)' }}>{activo ? 'Activo' : 'Inactivo'}</span>,
          ];
        },
      }}
      campos={[
        { clave: 'razon_social', label: 'Razón social', requerido: true, wide: true, normalizar: v => v.toUpperCase() },
        {
          clave: 'ruc_dni', label: 'RUC / DNI', validar: v => (/^(\d{8}|\d{11})$/.test(v) ? undefined : 'El RUC tiene 11 dígitos y el DNI 8.'),
          // Al escribir un RUC de 11 dígitos se consulta SUNAT sola: razón social, dirección y estado (no pisa lo que ya escribiste)
          consultaAlEscribir: {
            valido: v => /^\d{11}$/.test(v),
            consultar: async ruc => {
              const d = await consultarRucSunat(ruc);
              const condiciones = [d.estado, d.condicion].filter(Boolean);
              return {
                campos: {
                  razon_social: d.razon_social.toUpperCase(),
                  direccion: d.direccion.toUpperCase(),
                  notas: [d.estado && `ESTADO SUNAT: ${d.estado.toUpperCase()}`, d.condicion && `CONDICIÓN: ${d.condicion.toUpperCase()}`].filter(Boolean).join(' | '),
                },
                resumen: condiciones.length ? `SUNAT: ${condiciones.join(' · ')}` : 'Datos consultados en SUNAT',
              };
            },
          },
        },
        { clave: 'telefono', label: 'Teléfono', validar: v => (/^\+?[\d\s-]{7,15}$/.test(v) ? undefined : 'Escribe un teléfono válido, solo números.') },
        { clave: 'email', label: 'Correo', validar: v => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Revisa el correo: debe tener la forma usuario@empresa.com.') },
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
      extras={can('clientes.crear') ? [
        { label: 'Importar Excel', icon: <Upload size={17} />, onSelect: () => setImportando(true) },
        { label: 'Descargar plantilla', icon: <Download size={17} />, onSelect: () => { descargarPlantillaClientes().catch(() => undefined); } },
      ] : undefined}
    />
    <ImportarClientesSheet open={importando} onClose={() => setImportando(false)} existentes={lista} />
    </>
  );
}
