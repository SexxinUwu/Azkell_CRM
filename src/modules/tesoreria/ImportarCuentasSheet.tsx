import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import { ImportarValidadoSheet, type FilaRevisada } from '../../core/ui/ImportarValidadoSheet';
import type { CuentaPorCobrar } from './api';
import { descargarPlantillaCuentas, leerCuentasExcel, type FilaCuenta } from './importarCuentas';

interface Resultado { ok?: boolean; error?: string; message?: string; insertados?: number }

// Importación masiva de cuentas por cobrar: revisión previa por fila y envío solo de las válidas
// (POST /api/tesoreria/cuentas/importar-masivo).
export function ImportarCuentasSheet({ open, onClose, existentes }: { open: boolean; onClose: () => void; existentes: CuentaPorCobrar[] }) {
  const qc = useQueryClient();

  async function enviar(validas: FilaCuenta[]) {
    const r = await api<Resultado>('/tesoreria/cuentas/importar-masivo', { method: 'POST', body: { filas: validas } });
    if (r.ok === false || r.error) throw new Error(r.error || 'No se pudo importar');
    return r.message ?? `Se importaron ${r.insertados ?? validas.length} registros`;
  }

  return (
    <ImportarValidadoSheet<FilaCuenta>
      open={open}
      onClose={onClose}
      titulo="Importar cuentas por cobrar"
      plural="registros"
      columnas={['Factura / liquidación', 'Cliente o razón social', 'Placa', 'Total']}
      leer={(archivo: File): Promise<FilaRevisada<FilaCuenta>[]> => leerCuentasExcel(archivo, existentes)}
      enviar={enviar}
      plantilla={descargarPlantillaCuentas}
      alTerminar={() => qc.invalidateQueries({ queryKey: ['tesoreria', 'cuentas'] })}
      ayuda={`Las filas con error no se importan: factura repetida o ya registrada (${existentes.length} registros cargados), fecha o importe no válido, o dato obligatorio vacío. Las de aviso sí se importan.`}
    />
  );
}
