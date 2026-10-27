import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Marca o familia: decide el endpoint y el catálogo que se refresca */
  tipo: 'marca' | 'familia';
  onCreado: (nombre: string) => void;
}

const CONFIG = {
  marca: { titulo: 'Nueva marca', ruta: '/almacen/marcas', ejemplo: 'Ej: SHELL, MOBIL…', clave: 'marcas' },
  familia: { titulo: 'Nueva familia', ruta: '/almacen/familias', ejemplo: 'Ej: LUBRICANTES, FILTROS…', clave: 'familias' },
} as const;

/** Alta rápida de una marca o familia desde el formulario de artículos (el servidor la guarda en mayúsculas) */
export function NuevaOpcionSheet({ open, onClose, tipo, onCreado }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const cfg = CONFIG[tipo];
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { if (open) setNombre(''); }, [open]);

  async function guardar() {
    const limpio = nombre.trim();
    if (!limpio) { toast('Escribe el nombre', 'error'); return; }
    setGuardando(true);
    try {
      await api(cfg.ruta, { method: 'POST', body: { nombre: limpio } });
      await qc.invalidateQueries({ queryKey: ['almacen', 'catalogo', cfg.clave] });
      onCreado(limpio.toUpperCase());
      toast('Creada y seleccionada');
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={cfg.titulo}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={guardando} onClick={guardar}>Guardar</Button>
      </>}>
      <Field label="Nombre">
        {p => <TextInput {...p} value={nombre} placeholder={cfg.ejemplo} autoFocus
          onChange={e => setNombre(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') guardar(); }} />}
      </Field>
    </Sheet>
  );
}
