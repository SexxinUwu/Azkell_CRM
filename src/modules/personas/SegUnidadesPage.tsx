import './garita.css';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Page } from '../../core/ui/Display';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { useEmpresasStats, useRecursos, useRegistros, type Registro, type TipoSalida } from './garitaBase';
import { GaritaEmpresas } from './GaritaEmpresas';
import { GaritaLista } from './GaritaLista';
import { GaritaDestino, GaritaSalida } from './GaritaSalida';
import { GaritaRetorno } from './GaritaRetorno';
import { GaritaPlantilla } from './GaritaPlantilla';

type Vista = 'empresas' | 'lista' | 'destino' | 'salida' | 'retorno' | 'plantilla';

const EMPRESA_KEY = 'sgu_empresa_activa'; // la misma clave que usa el clásico
const leerEmpresa = () => { try { return localStorage.getItem(EMPRESA_KEY) || 'TODAS'; } catch { return 'TODAS'; } };

// Seguridad › Control de Unidades (Garita). Mismo recorrido que el clásico (modulos/seguridad/unidades):
// empresas → lista → destino → salida, o lista → expediente (retorno). PDF y WhatsApp usan el acta de garitaActa.ts.
export function SegUnidadesPage() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [vista, setVista] = useState<Vista>('empresas');
  const [empresa, setEmpresa] = useState(leerEmpresa);
  const [tipo, setTipo] = useState<TipoSalida>('RUTA');
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [porEliminar, setPorEliminar] = useState<Registro | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const lista = useRegistros(empresa);
  const recursos = useRecursos(empresa);
  const puedeCrear = can('seguridad_unidades.crear', 'seguridad_unidades.crear');
  const puedeEliminar = can('seguridad_unidades.eliminar', 'seguridad_unidades.eliminar');
  const refrescar = () => qc.invalidateQueries({ queryKey: ['personas'] });
  const abierto = (lista.data ?? []).find(r => r.id === abiertoId) ?? null;
  // Cifras reales del servidor (la lista solo descarga los registros más recientes)
  const statsQ = useEmpresasStats(empresa);
  const stats = empresa === 'TODAS' ? statsQ.data?.global : statsQ.data?.empresas.find(e => e.empresa === empresa);

  function elegirEmpresa(e: string) {
    setEmpresa(e);
    try { localStorage.setItem(EMPRESA_KEY, e); } catch { /* sin almacenamiento */ }
    setVista('lista');
  }

  async function eliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      await api(`/seguridad/unidades/${encodeURIComponent(porEliminar.id)}`, { method: 'DELETE' });
      haptic('success'); toast('Expediente eliminado');
      setPorEliminar(null);
      if (abiertoId === porEliminar.id) { setAbiertoId(null); setVista('lista'); }
      await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setEliminando(false); }
  }

  return (
    <Page wide>
      {vista === 'empresas' && (
        <GaritaEmpresas usuario={user?.name ?? ''} empresaActiva={empresa} nombreEmpresaSesion={user?.companyName ?? ''} onElegir={elegirEmpresa} />
      )}
      {vista === 'lista' && (
        <GaritaLista empresa={empresa} stats={stats} registros={lista.data ?? []} cargando={lista.isLoading} error={lista.isError ? lista.error : null} recursos={recursos.data}
          puedeCrear={puedeCrear} puedeEliminar={puedeEliminar}
          onEmpresas={() => setVista('empresas')} onRefrescar={refrescar} onSalida={() => setVista('destino')} onPlantilla={() => setVista('plantilla')}
          onAbrir={id => { setAbiertoId(id); setVista('retorno'); }} onEliminar={setPorEliminar} />
      )}
      {vista === 'destino' && <GaritaDestino onVolver={() => setVista('lista')} onElegir={t => { setTipo(t); setVista('salida'); }} />}
      {vista === 'salida' && (
        <GaritaSalida key={tipo} tipo={tipo} empresa={empresa} registros={lista.data ?? []} recursos={recursos.data}
          onVolver={() => setVista('lista')} onCambiarDestino={() => setVista('destino')}
          onGuardado={() => { refrescar(); setVista('lista'); }} />
      )}
      {vista === 'retorno' && abierto && (
        <GaritaRetorno key={abierto.id} rec={abierto} empresa={empresa} recursos={recursos.data} puedeCrear={puedeCrear} puedeEliminar={puedeEliminar}
          onVolver={() => setVista('lista')} onHecho={() => { refrescar(); setVista('lista'); }} onEliminar={setPorEliminar} />
      )}
      {vista === 'plantilla' && <GaritaPlantilla onVolver={() => setVista('lista')} />}

      <ConfirmSheet open={!!porEliminar} onClose={() => !eliminando && setPorEliminar(null)} onConfirm={eliminar} loading={eliminando}
        title="¿Eliminar este expediente?" message="Esta acción no se puede deshacer. Se borrará el registro y todas sus fotos en la nube." confirmLabel="Eliminar" />
    </Page>
  );
}
