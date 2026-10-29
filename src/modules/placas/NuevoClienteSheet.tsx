// Nuevo cliente desde la ficha de la placa: consulta el RUC (SUNAT) o el DNI (RENIEC) y devuelve la razón social y el RUC.
// Como en la versión actual, solo se guardan la razón social y el RUC en la placa.
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, TextInput } from '../../core/ui/Field';
import { api } from '../../core/api/client';
import { useToast } from '../../core/ui/Toast';

interface RespuestaDocumento { nombre?: string; razon_social?: string }

export function NuevoClienteSheet({ open, onClose, onAgregar }: {
  open: boolean;
  onClose: () => void;
  onAgregar: (cliente: { nombre: string; ruc: string }) => void;
}) {
  const toast = useToast();
  const [ruc, setRuc] = useState('');
  const [nombre, setNombre] = useState('');
  const [buscando, setBuscando] = useState(false);

  useEffect(() => { if (open) { setRuc(''); setNombre(''); } }, [open]);

  // Consulta SUNAT (RUC de 11 dígitos) o RENIEC (DNI de 8)
  async function buscar() {
    const num = ruc.trim();
    if (!num) return;
    const tipo = num.length === 11 ? 'RUC' : num.length === 8 ? 'DNI' : 'RUC';
    setBuscando(true);
    try {
      const d = await api<RespuestaDocumento>('/proxy/documento', { query: { tipo, numero: num } });
      const razon = d.nombre || d.razon_social;
      if (razon) { setNombre(razon.toUpperCase()); toast('Datos SUNAT/RENIEC obtenidos'); }
    } catch {
      toast('No se encontró RUC/DNI en SUNAT/RENIEC', 'error');
    } finally { setBuscando(false); }
  }

  function agregar() {
    const n = nombre.trim().toUpperCase();
    if (!n) { toast('Ingresa la razón social del cliente.', 'error'); return; }
    onAgregar({ nombre: n, ruc: ruc.trim() });
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nuevo cliente"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={agregar}>Agregar cliente</Button>
        </>
      }>
      <div className="form-grid">
        <Field label="RUC o DNI" wide>
          {props => (
            <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TextInput {...props} value={ruc} inputMode="numeric" maxLength={11} placeholder="Ingrese RUC o DNI"
                  onChange={e => setRuc(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }} />
              </div>
              <Button variant="secondary" icon={<Search size={16} />} loading={buscando} onClick={buscar} title="Buscar en SUNAT / RENIEC">Buscar</Button>
            </div>
          )}
        </Field>
        <Field label="Razón social o nombre" wide>
          {props => <TextInput {...props} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: TRANSPORTES S.A.C." />}
        </Field>
      </div>
    </Sheet>
  );
}
