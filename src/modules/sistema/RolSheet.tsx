import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Trash2 } from 'lucide-react';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { COLORES_ROL, MODULOS_PERMISO } from './permisosCatalogo';

export interface RolEditable {
  id: number;
  nombre: string;
  color?: string | null;
  es_admin?: number | boolean;
  orden?: number | null;
  permisos_json?: string | null;
}

type Accion = 'l' | 'c' | 'e' | 'd';
const ACCIONES: Array<[Accion, string]> = [['l', 'Ver'], ['c', 'Crear'], ['e', 'Editar'], ['d', 'Eliminar']];
type Marcas = Partial<Record<Accion, boolean>>;

function leerPermisos(json: string | null | undefined): Record<string, Marcas> {
  try {
    const p = JSON.parse(json || '{}');
    return p && typeof p === 'object' ? p : {};
  } catch { return {}; }
}

// Crear o editar un rol con sus permisos por módulo. Mismos endpoints y formato que la versión actual
// (POST/PUT /api/roles, permisos_json con {modulo: {l, c, e, d}}). Si el rol es administrador, no lleva casillas.
export function RolSheet({ open, onClose, rol }: { open: boolean; onClose: () => void; rol: RolEditable | null }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState<string>(COLORES_ROL[0]);
  const [esAdmin, setEsAdmin] = useState(false);
  const [orden, setOrden] = useState('0');
  const [marcas, setMarcas] = useState<Record<string, Marcas>>({});
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [confirmBorrar, setConfirmBorrar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNombre(rol?.nombre ?? '');
    setColor(rol?.color || COLORES_ROL[0]);
    setEsAdmin(!!rol?.es_admin);
    setOrden(String(rol?.orden ?? 0));
    setMarcas(leerPermisos(rol?.permisos_json));
    setError(null);
  }, [open, rol]);

  const grupos = useMemo(() => {
    const m = new Map<string, typeof MODULOS_PERMISO>();
    MODULOS_PERMISO.forEach(mod => m.set(mod.grupo, [...(m.get(mod.grupo) ?? []), mod]));
    return [...m];
  }, []);

  const marcado = (key: string, accion: Accion) => !!marcas[key]?.[accion];
  const alternar = (key: string, accion: Accion) =>
    setMarcas(prev => ({ ...prev, [key]: { ...prev[key], [accion]: !prev[key]?.[accion] } }));

  // Solo lleva los módulos del catálogo; los que no tienen "crear/editar/eliminar" guardan solo "l"
  function armarPermisos(): string {
    if (esAdmin) return '{}';
    const salida: Record<string, Record<string, number>> = {};
    MODULOS_PERMISO.forEach(mod => {
      const m = marcas[mod.key] ?? {};
      salida[mod.key] = mod.lcad
        ? { l: m.l ? 1 : 0, c: m.c ? 1 : 0, e: m.e ? 1 : 0, d: m.d ? 1 : 0 }
        : { l: m.l ? 1 : 0 };
    });
    return JSON.stringify(salida);
  }

  async function guardar() {
    if (!nombre.trim()) { setError('El nombre del rol es obligatorio.'); return; }
    setGuardando(true); setError(null);
    const cuerpo = {
      nombre: nombre.trim(), color, permisos_json: armarPermisos(),
      es_admin: esAdmin ? 1 : 0, orden: Number(orden) || 0,
    };
    try {
      if (rol) await api(`/roles/${rol.id}`, { method: 'PUT', body: cuerpo });
      else await api('/roles', { method: 'POST', body: cuerpo });
      haptic('success');
      toast(rol ? 'Rol actualizado.' : 'Rol creado.');
      await qc.invalidateQueries({ queryKey: ['sistema'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  async function borrar() {
    if (!rol) return;
    setBorrando(true); setError(null);
    try {
      await api(`/roles/${rol.id}`, { method: 'DELETE' });
      haptic('success');
      toast('Rol eliminado.');
      setConfirmBorrar(false);
      await qc.invalidateQueries({ queryKey: ['sistema'] });
      onClose();
    } catch (err) {
      setConfirmBorrar(false);
      setError(errorMessage(err)); haptic('warning');
    } finally { setBorrando(false); }
  }

  return (
    <>
      <Sheet open={open} onClose={() => !guardando && onClose()} title={rol ? 'Editar rol' : 'Nuevo rol'}
        footer={<>
          {rol && <Button variant="destructive" onClick={() => setConfirmBorrar(true)} disabled={guardando}>
            <Trash2 size={16} /> Eliminar
          </Button>}
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando}>Guardar</Button>
        </>}>
        {error && <div style={{ marginBottom: 'var(--s-4)' }}><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <div className="form-grid">
          <Field label="Nombre del rol" wide>
            {p => <TextInput {...p} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Supervisor de Flota" />}
          </Field>
          <Field label="Color" wide>
            {() => (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {COLORES_ROL.map(c => (
                  <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
                    style={{
                      width: 30, height: 30, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: color === c ? '3px solid var(--label)' : '2px solid transparent',
                    }} />
                ))}
              </div>
            )}
          </Field>
          <Field label="Orden en la lista" wide hint="Los roles con número menor aparecen primero.">
            {p => <TextInput {...p} inputMode="numeric" value={orden} onChange={e => setOrden(e.target.value)} />}
          </Field>
          <div className="field field--wide">
            <label style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={esAdmin} onChange={e => setEsAdmin(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
              <span>
                <strong>Acceso de administrador</strong><br />
                <span className="c-secondary">Ve y edita todo el sistema. No necesita casillas.</span>
              </span>
            </label>
          </div>
        </div>

        <div className="list__header" style={{ marginTop: 'var(--s-6)' }}>Permisos de módulos</div>
        {esAdmin && <p className="c-secondary">Como es administrador, el rol tiene acceso a todo. Desmarca la opción para elegir módulos.</p>}
        {!esAdmin && grupos.map(([grupo, mods]) => (
          <div key={grupo}>
            <div className="list__header" style={{ marginTop: 'var(--s-4)' }}>{grupo}</div>
            <div className="list">
              {mods.map(mod => (
                <div className="row" key={mod.key} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="row__main">
                    <div className="row__title">{mod.nombre}</div>
                    <div className="row__subtitle">{mod.desc}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {(mod.lcad ? ACCIONES : ACCIONES.slice(0, 1)).map(([accion, texto]) => (
                      <label key={accion} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: '0.72rem', cursor: 'pointer' }}>
                        <span>{texto}</span>
                        <input type="checkbox" checked={marcado(mod.key, accion)} onChange={() => alternar(mod.key, accion)}
                          style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Sheet>

      <ConfirmSheet open={confirmBorrar} onClose={() => setConfirmBorrar(false)} onConfirm={borrar} loading={borrando}
        title="Eliminar rol" confirmLabel="Eliminar"
        message={`¿Eliminar el rol "${rol?.nombre ?? ''}"? Solo se puede si no tiene usuarios asignados.`} />
    </>
  );
}
