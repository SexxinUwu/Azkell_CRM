import { useEffect, useState } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileSpreadsheet } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';

// Importación de planificación desde Excel (POST /api/importarPlanificacionMasivo).
// Mismos encabezados que el clásico: PLACA, TIPO_MP, FECHA_INICIO, FECHA_FIN, KM_ESTIMADO, KM_MINIMO,
// KM_MAXIMO, TECNICO, PRIORIDAD, OBSERVACIONES. El servidor rechaza las placas que no existen.
interface Registro {
  placa: string; tipo_mp: string; fecha_inicio: string; fecha_fin: string; km_estimado: number;
  km_minimo: number | null; km_maximo: number | null; tecnico: string; prioridad: string; observaciones: string;
}
interface Resultado { ok: number; errores: number; errores_detalle?: string[] }

type Celda = string | number | boolean | Date | null;
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const pad = (n: number) => String(n).padStart(2, '0');
const aYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function fecha(v: Celda): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return aYMD(v);
  if (typeof v === 'number') return aYMD(new Date((v - 25569) * 86400 * 1000));
  return String(v).trim();
}

async function leerPlanificacion(archivo: File): Promise<Registro[]> {
  const { readSheet } = await import('read-excel-file/browser');
  const filas = (await readSheet(archivo)) as Celda[][];
  if (filas.length < 2) throw new Error('El archivo no contiene filas de datos.');
  const claves = filas[0].map(h => String(h ?? '').trim().toUpperCase().replace(/\s+/g, '_'));
  return filas.slice(1).filter(f => f.some(c => c !== null && c !== '')).map(f => {
    const row: Record<string, Celda> = {};
    claves.forEach((k, i) => { if (k && row[k] === undefined) row[k] = f[i] ?? null; });
    const txt = (k: string) => String(row[k] ?? '').trim();
    const int = (k: string) => parseInt(String(row[k] ?? ''), 10) || 0;
    return {
      placa: txt('PLACA').toUpperCase(),
      tipo_mp: txt('TIPO_MP').toUpperCase(),
      fecha_inicio: fecha(row['FECHA_INICIO'] ?? null),
      fecha_fin: fecha(row['FECHA_FIN'] ?? null),
      km_estimado: int('KM_ESTIMADO'),
      km_minimo: int('KM_MINIMO') || null,
      km_maximo: int('KM_MAXIMO') || null,
      tecnico: txt('TECNICO'),
      prioridad: txt('PRIORIDAD') || 'Normal',
      observaciones: txt('OBSERVACIONES'),
    };
  }).filter(r => r.placa && r.tipo_mp);
}

export function ImportarPlanificacionSheet({ open, onClose, mesInicial, anioInicial }: {
  open: boolean; onClose: () => void; mesInicial: number; anioInicial: number;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [mes, setMes] = useState(mesInicial);
  const [anio, setAnio] = useState(anioInicial);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    if (!open) return;
    setMes(mesInicial); setAnio(anioInicial);
    setArchivo(null); setRegistros([]); setError(null); setResultado(null);
  }, [open, mesInicial, anioInicial]);

  async function elegir(f: File | undefined) {
    if (!f) return;
    setArchivo(f); setRegistros([]); setError(null); setResultado(null); setLeyendo(true);
    try {
      const l = await leerPlanificacion(f);
      setRegistros(l);
      if (!l.length) setError('No se encontraron filas válidas (PLACA y TIPO_MP son obligatorios).');
    } catch (err) { setError(errorMessage(err)); }
    finally { setLeyendo(false); }
  }

  async function importar() {
    if (!registros.length) return;
    setEnviando(true); setError(null);
    try {
      const r = await api<Resultado>('/importarPlanificacionMasivo', {
        method: 'POST', body: { registros, mes, anio, createdBy: user?.email ?? 'sistema' },
      });
      setResultado(r);
      haptic(r.errores === 0 ? 'success' : 'warning');
      toast(`${r.ok} planes importados${r.errores ? `, ${r.errores} con error` : ''}`);
      await qc.invalidateQueries({ queryKey: ['mant', 'planificacion'] });
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Importar planificación"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>{resultado ? 'Cerrar' : 'Cancelar'}</Button>
        {!resultado && <Button variant="primary" onClick={importar} loading={enviando} disabled={!registros.length || leyendo}>
          {registros.length ? `Importar ${registros.length} planes` : 'Importar'}</Button>}</>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <Field label="Mes">
          {p => (
            <SelectInput {...p} value={mes} onChange={e => setMes(Number(e.target.value))}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </SelectInput>
          )}
        </Field>
        <Field label="Año">{p => <TextInput {...p} inputMode="numeric" value={anio} onChange={e => setAnio(Number(e.target.value) || anioInicial)} />}</Field>

        <Field label="Archivo Excel (.xlsx)" wide hint={archivo ? `${archivo.name}${registros.length ? ` · ${registros.length} filas válidas` : ''}` : 'PLACA, TIPO_MP, FECHA_INICIO, FECHA_FIN, KM_ESTIMADO…'}>
          {p => <ArchivoInput {...p} accept=".xlsx,.xls" disabled={leyendo || enviando} onChange={a => elegir(a ?? undefined)} />}
        </Field>

        {leyendo && <div className="field field--wide"><Notice><FileSpreadsheet size={16} /> Leyendo el archivo…</Notice></div>}

        {resultado && (
          <div className="field field--wide">
            <Notice tone={resultado.errores === 0 ? 'success' : 'accent'}>
              {resultado.ok} importados{resultado.errores ? ` · ${resultado.errores} con error` : ''}.
            </Notice>
            {(resultado.errores_detalle ?? []).length > 0 && (
              <ul style={{ margin: 'var(--s-2) 0 0', paddingLeft: 18, fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                {(resultado.errores_detalle ?? []).slice(0, 20).map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </div>
        )}

        {!resultado && registros.length > 0 && (
          <div className="field field--wide tarjeta__lista" style={{ padding: 'var(--s-3)', fontSize: '0.8125rem' }}>
            <div style={{ fontWeight: 700, marginBottom: 'var(--s-2)' }}>Vista previa (primeros 5)</div>
            {registros.slice(0, 5).map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', padding: '4px 0', borderTop: i ? '1px solid var(--separator)' : undefined }}>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>{r.placa}</strong>
                <span>{r.tipo_mp}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--label-2)', fontFamily: 'var(--font-mono)' }}>{r.fecha_inicio} → {r.fecha_fin}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
