import { useEffect, useState } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { exportarExcel } from '../../core/lib/excel';

// Frecuencias MP desde Excel (POST /api/tipos-mantenimiento/importar, upsert por marca + tipo MP + UTS + combustible + modelo).
// Mismos encabezados que el clásico (configuracion-mp): MARCA, TIPO MP, UTS, COMBUSTIBLE, MODELO, FREC. KM,
// FREC. HORAS, FREC. DÍAS, TIPO, SISTEMA, DESCRIPCIÓN. Los encabezados se comparan sin tildes ni mayúsculas.
export interface RegistroMp {
  marca: string; tipo_mp: string; uts: string; combustible: string; modelo: string;
  frecuencia_km: number | null; frecuencia_horas: number | null; frecuencia_dias: number | null;
  tipo: string; sistema: string; descripcion: string;
}
interface Resultado { ok?: boolean; insertados: number; actualizados: number; error?: string }

type Celda = string | number | boolean | Date | null;

const ENCABEZADOS = ['MARCA', 'TIPO MP', 'UTS', 'COMBUSTIBLE', 'MODELO', 'FREC. KM', 'FREC. HORAS', 'FREC. DÍAS', 'TIPO', 'SISTEMA', 'DESCRIPCIÓN'];
const EJEMPLOS: (string | number)[][] = [
  ['ISUZU', 'MP1', 'NACIONAL', 'DIESEL', 'MODELO 1', 10000, '', 35, 'Cambio', 'Motor', 'Cambio de aceite de motor'],
  ['ISUZU', 'MP1', 'LOCAL', 'DIESEL', 'MODELO 2', 6000, '', '', 'Cambio', 'Motor', 'Cambio de aceite de motor LOCAL'],
  ['VOLVO', 'MP2', 'NACIONAL', 'DIESEL', 'MODELO 3', 20000, 500, 180, 'Cambio', 'Transmisión', 'Cambio de aceite de caja'],
];

// Alias aceptados por columna, ya normalizados (sin tildes, en mayúsculas)
const COLUMNAS = {
  marca: ['MARCA'],
  tipo_mp: ['TIPO MP', 'TIPO_MP'],
  uts: ['UTS', 'CATEGORIA'],
  combustible: ['COMBUSTIBLE'],
  modelo: ['MODELO'],
  frecuencia_km: ['FREC. KM', 'FREC KM', 'FRECUENCIA KM', 'FRECUENCIA_KM'],
  frecuencia_horas: ['FREC. HORAS', 'FREC HORAS', 'FRECUENCIA HORAS'],
  frecuencia_dias: ['FREC. DIAS', 'FREC DIAS', 'FRECUENCIA DIAS'],
  tipo: ['TIPO'],
  sistema: ['SISTEMA'],
  descripcion: ['DESCRIPCION'],
} as const;

const normalizar = (h: unknown) => String(h ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const texto = (v: Celda) => String(v ?? '').trim();
const numero = (v: Celda): number | null => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, '').trim());
  return Number.isNaN(n) || !n ? null : Math.round(n);
};

export async function descargarPlantillaFrecuencias() {
  await exportarExcel('Plantilla_Frecuencias_MP', 'Plantilla', ENCABEZADOS, EJEMPLOS);
}

async function leerFrecuencias(archivo: File): Promise<RegistroMp[]> {
  const { readSheet } = await import('read-excel-file/browser');
  const filas = (await readSheet(archivo)) as Celda[][];
  if (filas.length < 2) throw new Error('El archivo no contiene filas de datos.');
  const hdr = filas[0].map(normalizar);
  const pos = Object.fromEntries(Object.entries(COLUMNAS).map(([k, alias]) => [k, hdr.findIndex(h => (alias as readonly string[]).includes(h))])) as Record<keyof typeof COLUMNAS, number>;
  if (pos.marca < 0 || pos.tipo_mp < 0) throw new Error('El archivo no tiene las columnas MARCA y TIPO MP.');
  const celda = (f: Celda[], k: keyof typeof COLUMNAS): Celda => (pos[k] >= 0 ? f[pos[k]] ?? null : null);
  return filas.slice(1)
    .map(f => ({
      marca: texto(celda(f, 'marca')).toUpperCase(),
      tipo_mp: texto(celda(f, 'tipo_mp')).toUpperCase(),
      uts: texto(celda(f, 'uts')).toUpperCase() || 'LOCAL',
      combustible: texto(celda(f, 'combustible')).toUpperCase(),
      modelo: texto(celda(f, 'modelo')).toUpperCase(),
      frecuencia_km: numero(celda(f, 'frecuencia_km')),
      frecuencia_horas: numero(celda(f, 'frecuencia_horas')),
      frecuencia_dias: numero(celda(f, 'frecuencia_dias')),
      tipo: texto(celda(f, 'tipo')),
      sistema: texto(celda(f, 'sistema')),
      descripcion: texto(celda(f, 'descripcion')),
    }))
    .filter(r => r.marca && r.tipo_mp);
}

export function ImportarFrecuenciasSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [registros, setRegistros] = useState<RegistroMp[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    if (!open) return;
    setRegistros([]); setError(null); setResultado(null);
  }, [open]);

  async function elegir(f: File | undefined) {
    if (!f) return;
    setRegistros([]); setError(null); setResultado(null); setLeyendo(true);
    try {
      const l = await leerFrecuencias(f);
      setRegistros(l);
      if (!l.length) setError('No se encontraron filas válidas (MARCA y TIPO MP son obligatorios).');
    } catch (err) { setError(errorMessage(err)); }
    finally { setLeyendo(false); }
  }

  async function importar() {
    if (!registros.length) return;
    setEnviando(true); setError(null);
    try {
      const r = await api<Resultado>('/tipos-mantenimiento/importar', { method: 'POST', body: { registros } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo importar');
      setResultado(r);
      haptic('success');
      toast(`${r.insertados} nuevas, ${r.actualizados} actualizadas`);
      await qc.invalidateQueries({ queryKey: ['mant', 'tipos-mantenimiento'] });
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const marcas = new Set(registros.map(r => r.marca)).size;

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Importar frecuencias desde Excel"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>{resultado ? 'Cerrar' : 'Cancelar'}</Button>
        {!resultado && <Button variant="primary" onClick={importar} loading={enviando} disabled={!registros.length || leyendo}>
          {registros.length ? `Importar ${registros.length} frecuencias` : 'Importar'}</Button>}</>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Archivo Excel (.xlsx)" wide>
          {p => <ArchivoInput {...p} accept=".xlsx,.xls" disabled={leyendo || enviando} onChange={a => elegir(a ?? undefined)} />}
        </Field>
        {registros.length > 0 && !resultado && (
          <div className="field field--wide">
            <p className="t-footnote c-secondary">{registros.length} filas leídas · {marcas} marcas. Las que ya existen (marca, tipo MP, UTS, combustible y modelo) se actualizan; las demás se crean.</p>
          </div>
        )}
        {resultado && (
          <div className="field field--wide">
            <Notice tone="success">Importación completada: {resultado.insertados} nuevas y {resultado.actualizados} actualizadas.</Notice>
          </div>
        )}
      </div>
    </Sheet>
  );
}
