import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Page } from '../../core/ui/Display';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { ADMIN } from '../../core/auth/permisos';
import { haptic } from '../../core/lib/haptics';
import { descargarArchivo } from '../../core/lib/pdf';
import { CePortal, type StatsEntrega } from './ce-Portal';
import { CeLista, type AccionFila, type CifrasLista } from './ce-Lista';
import { CeFormulario } from './ce-Formulario';
import { CePlantilla } from './ce-PlantillaEditor';
import { generarPdfEntrega, compartirEntregaWhatsApp, nombrePdfEntrega } from './ce-pdf';
import { exportarEntregasExcel } from './ce-excel';
import { cargarPlantilla } from './ce-plantilla';
import type { EntregaVehiculo } from './ce-tipos';

type Vista = 'portal' | 'lista' | 'formulario';
type ModoForm = 'nuevo' | 'editar' | 'ver';

// La misma clave que usa el clásico y Garita: la empresa elegida se recuerda en el navegador
const EMPRESA_KEY = 'sgu_empresa_activa';
const leerEmpresa = () => { try { return localStorage.getItem(EMPRESA_KEY) || 'TODAS'; } catch { return 'TODAS'; } };
const guardarEmpresa = (e: string) => { try { localStorage.setItem(EMPRESA_KEY, e); } catch { /* sin almacenamiento */ } };

const hoyIso = () => {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Flota › Checklist de entrega de vehículos. Portal de empresas → listado → formulario (vistas internas, sin recargar). */
export function ChecklistEntregaPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user, can } = useAuth();
  // Igual que el clásico: eliminar actas solo lo hace el administrador
  const puedeEliminar = can(ADMIN);

  const [vista, setVista] = useState<Vista>('portal');
  const [empresa, setEmpresa] = useState<string>(leerEmpresa);
  const [formulario, setFormulario] = useState<{ registro: EntregaVehiculo | null; modo: ModoForm } | null>(null);
  const [plantillaAbierta, setPlantillaAbierta] = useState(false);
  const [porEliminar, setPorEliminar] = useState<EntregaVehiculo | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const statsQ = useQuery<StatsEntrega>({
    queryKey: ['flota', 'ce-stats'],
    queryFn: () => api<StatsEntrega>('/seguridad/entrega-vehiculos/stats'),
    staleTime: 30_000,
  });

  const registrosQ = useQuery<EntregaVehiculo[]>({
    queryKey: ['flota', 'ce-registros', empresa],
    queryFn: () => api<{ ok?: boolean; data?: EntregaVehiculo[] }>('/seguridad/entrega-vehiculos', {
      query: empresa !== 'TODAS' ? { empresa } : undefined,
    }).then(r => (Array.isArray(r?.data) ? r.data : [])),
    enabled: vista !== 'portal',
    staleTime: 15_000,
  });

  const registros = registrosQ.data ?? [];

  // Cifras del servidor (la lista solo trae los 300 registros más recientes); si no llegan, se cuentan de la lista
  const cifras: CifrasLista = (() => {
    const s = statsQ.data;
    const porEmpresa = empresa === 'TODAS' ? s?.global : s?.empresas.find(e => e.empresa.toUpperCase() === empresa.toUpperCase());
    if (porEmpresa) {
      const vehiculos = empresa === 'TODAS' ? (s?.empresas ?? []).reduce((acc, e) => acc + (e.vehiculos ?? 0), 0) : (porEmpresa.vehiculos ?? 0);
      return { total: porEmpresa.total_actas, hoy: porEmpresa.hoy, vehiculos };
    }
    const hoy = hoyIso();
    return {
      total: registros.length,
      hoy: registros.filter(r => String(r.fecha ?? '').slice(0, 10) === hoy).length,
      vehiculos: new Set(registros.map(r => r.placa)).size,
    };
  })();

  function elegirEmpresa(e: string) {
    setEmpresa(e);
    guardarEmpresa(e);
    setVista('lista');
  }

  function nuevaEntrega() {
    setFormulario({ registro: null, modo: 'nuevo' });
    setVista('formulario');
  }

  function refrescarListado() {
    return Promise.all([
      qc.invalidateQueries({ queryKey: ['flota', 'ce-registros'] }),
      qc.invalidateQueries({ queryKey: ['flota', 'ce-stats'] }),
    ]);
  }

  /** Trae el acta completa (la lista puede venir sin todos los campos) */
  async function detalle(id: string | number): Promise<EntregaVehiculo> {
    const res = await api<{ ok?: boolean; data?: EntregaVehiculo }>(`/seguridad/entrega-vehiculos/${encodeURIComponent(String(id))}`);
    if (!res?.data) throw new Error('No se pudo obtener el registro');
    return res.data;
  }

  async function accion(a: AccionFila, r: EntregaVehiculo) {
    haptic('selection');
    if (a === 'eliminar') { setPorEliminar(r); return; }
    setOcupadoId(String(r.id));
    try {
      const d = await detalle(r.id);
      if (a === 'ver' || a === 'editar') {
        setFormulario({ registro: d, modo: a === 'ver' ? 'ver' : 'editar' });
        setVista('formulario');
      } else if (a === 'pdf') {
        const blob = await generarPdfEntrega(d);
        descargarArchivo(blob, nombrePdfEntrega(d));
        haptic('success');
      } else {
        await compartirEntregaWhatsApp(d);
      }
    } catch (err) {
      // Cancelar la hoja de compartir del sistema no es un error
      if (err instanceof Error && err.name === 'AbortError') return;
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setOcupadoId(null);
    }
  }

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await api(`/seguridad/entrega-vehiculos/${encodeURIComponent(String(porEliminar.id))}`, { method: 'DELETE' });
      haptic('success');
      toast('Acta eliminada');
      setPorEliminar(null);
      await refrescarListado();
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setEliminando(false);
    }
  }

  async function exportar(filas: EntregaVehiculo[]) {
    if (filas.length === 0) { toast('No hay actas para exportar', 'error'); return; }
    try {
      const plantilla = await cargarPlantilla().catch(() => null);
      await exportarEntregasExcel(filas, plantilla ?? null);
      haptic('success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  const usuario = user?.name ?? '';
  const statsError = statsQ.isError ? statsQ.error : null;

  return (
    <Page wide>
      {vista === 'portal' && (
        <CePortal
          usuario={usuario}
          stats={statsQ.data}
          cargando={statsQ.isLoading}
          error={statsError}
          actualizando={statsQ.isFetching && !statsQ.isLoading}
          onElegir={elegirEmpresa}
          onActualizar={() => { void statsQ.refetch(); }}
        />
      )}

      {vista === 'lista' && (
        <CeLista
          empresa={empresa}
          registros={registros}
          cargando={registrosQ.isLoading}
          error={registrosQ.isError ? registrosQ.error : null}
          cifras={cifras}
          actualizando={registrosQ.isFetching && !registrosQ.isLoading}
          ocupadoId={ocupadoId}
          puedeEliminar={puedeEliminar}
          onEmpresas={() => setVista('portal')}
          onPlantilla={() => setPlantillaAbierta(true)}
          onActualizar={() => { void refrescarListado(); }}
          onRegistrar={nuevaEntrega}
          onAccion={(a, r) => { void accion(a, r); }}
          onExcel={exportar}
        />
      )}

      {vista === 'formulario' && formulario && (
        <CeFormulario
          registro={formulario.registro}
          empresa={empresa}
          modo={formulario.modo}
          onCerrar={() => { setFormulario(null); setVista('lista'); }}
          onGuardado={() => {
            haptic('success');
            toast('Acta guardada');
            setFormulario(null);
            setVista('lista');
            void refrescarListado();
          }}
        />
      )}

      <CePlantilla abierta={plantillaAbierta} onCerrar={() => setPlantillaAbierta(false)} />

      <ConfirmSheet
        open={!!porEliminar}
        onClose={() => { if (!eliminando) setPorEliminar(null); }}
        onConfirm={() => { void eliminar(); }}
        title="Eliminar acta"
        message={porEliminar
          ? `Se eliminará el acta ${porEliminar.numero_inventario || porEliminar.id} de ${porEliminar.placa || 'la unidad'}. Esta acción no se puede deshacer.`
          : ''}
        confirmLabel="Eliminar acta"
        loading={eliminando}
      />
    </Page>
  );
}
