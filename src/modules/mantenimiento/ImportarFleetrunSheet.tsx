import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { exportarExcel } from '../../core/lib/excel';
import { usePlacas } from '../placas/api';
import { importarFleetrunMasivo, type RegistroImportar } from './fleetrunApi';

// Importación masiva de Fleetrun desde Excel (POST /api/importarFleetrunMasivo, inserta o actualiza por código).
// Mismas columnas y reglas que el clásico: FECHA INGRESO, PLACA, TIPO MP, KM ACTUAL, FRECUENCIA, TECNICO, OBSERVACION
// (y opcional ID para actualizar un registro). Km próximo = km actual + frecuencia. Marca, cliente, UTS, combustible
// y modelo salen del catálogo de placas; el km GPS, del GPS en vivo. Antes de importar se muestra qué se va a cargar.

type Celda = string | number | boolean | Date | null;

const ENCABEZADOS = ['FECHA INGRESO', 'PLACA', 'TIPO MP', 'KM ACTUAL', 'FRECUENCIA', 'TECNICO', 'OBSERVACION'];
const EJEMPLO: (string | number)[][] = [['2024-05-20', 'ABC-123', 'MP1', 150000, 15000, 'JUAN PEREZ', 'Mantenimiento preventivo general']];

export async function descargarPlantillaFleetrun() {
  await exportarExcel('Plantilla_Importacion_Fleetrun', 'Plantilla_Fleetrun', ENCABEZADOS, EJEMPLO);
}

// Encabezados sin caracteres invisibles, tildes ni mayúsculas
const limpiar = (h: unknown) => String(h ?? '').replace(/[\u0000-\u001F\u007F- ﻿]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const pad = (n: number) => String(n).padStart(2, '0');

function fechaIso(v: Celda): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number' && v > 20000) { const d = new Date((v - 25569) * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
  const s = String(v ?? '').trim();
  if (s.includes('/')) {
    const p = s.split('/');
    const p0 = p[0].trim().padStart(2, '0'), p1 = (p[1] ?? '').trim().padStart(2, '0');
    let p2 = (p[2] ?? '').trim();
    if (p2.length === 2) p2 = `20${p2}`;
    if (p2.length === 4) return parseInt(p1, 10) > 12 ? `${p2}-${p0}-${p1}` : `${p2}-${p1}-${p0}`;
    return s;
  }
  if (s.includes('-')) {
    const p = s.split('-');
    if (p.length === 3 && p[0].trim().length === 2 && p[2].trim().length === 4) return `${p[2].trim()}-${p[1].trim().padStart(2, '0')}-${p[0].trim().padStart(2, '0')}`;
  }
  return s;
}
const numero = (v: Celda) => parseFloat(String(v ?? '0').replace(/,/g, '')) || 0;

interface Fila extends RegistroImportar { fila: number; avisos: string[]; descartada: boolean }

export function ImportarFleetrunSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const placas = usePlacas();
  const [crudas, setCrudas] = useState<Array<Record<string, Celda>>>([]);
  const [gps, setGps] = useState<Map<string, number>>(new Map());
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ ok: number; errores: number; detalle?: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setCrudas([]); setError(null); setResultado(null);
  }, [open]);

  async function elegir(f: File | undefined) {
    if (!f) return;
    setCrudas([]); setError(null); setResultado(null); setLeyendo(true);
    try {
      const { readSheet } = await import('read-excel-file/browser');
      const filas = (await readSheet(f)) as Celda[][];
      if (filas.length < 2) throw new Error('Archivo vacío o inválido.');
      const hdr = filas[0].map(limpiar);
      const datos = filas.slice(1)
        .filter(r => r.some(c => c !== null && String(c).trim() !== ''))
        .map(r => Object.fromEntries(hdr.map((h, i) => [h, r[i] ?? null])) as Record<string, Celda>);
      if (!datos.length) throw new Error('Archivo vacío o inválido.');
      setCrudas(datos);
      // Km del GPS en vivo (como el clásico con Wialon); si no responde, queda vacío
      try {
        const r = await api<{ gps?: { unidades?: Array<{ placa?: string; km?: number }> } }>('/tv/gps-feed');
        setGps(new Map((r.gps?.unidades ?? []).map(u => [String(u.placa ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(), Number(u.km) || 0])));
      } catch { setGps(new Map()); }
    } catch (err) { setError(errorMessage(err)); }
    finally { setLeyendo(false); }
  }

  const filas: Fila[] = useMemo(() => {
    const catalogo = new Map((placas.data ?? []).map(p => [p.placa.toLowerCase(), p]));
    const sello = Date.now();
    return crudas.map((r, idx) => {
      const alguna = (...claves: string[]) => claves.map(k => r[k]).find(v => v !== undefined && v !== null && String(v).trim() !== '') ?? '';
      const placa = String(alguna('PLACA', 'PLACA Y MARCA', 'PLACA / MARCA', 'UNIDAD', 'VEHICULO')).trim();
      const fecha = fechaIso(alguna('FECHA INGRESO', 'FECHA', 'FECHA REGISTRO') as Celda);
      const kmact = numero(alguna('KM ACTUAL') as Celda), frec = numero(alguna('FRECUENCIA') as Celda);
      const tipomp = String(alguna('TIPO MP')).trim();
      const p = catalogo.get(placa.toLowerCase());
      const km = gps.get(placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
      const avisos: string[] = [];
      if (!placa) avisos.push('Sin placa: se omite');
      else if (placas.data && !p) avisos.push('Placa fuera del catálogo');
      if (!tipomp) avisos.push('Sin tipo de MP');
      if (!fecha) avisos.push('Sin fecha (queda como plan inicial)');
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) avisos.push('Fecha no reconocida: se guarda sin fecha');
      if (!kmact) avisos.push('Sin km actual');
      return {
        fila: idx + 2, avisos, descartada: !placa,
        id: String(alguna('ID') || `FLT-${sello}-${idx}`), fecha, placa, tipomp, kmact: String(kmact), freckm: String(frec), kmprox: String(kmact + frec),
        tec: String(alguna('TECNICO')), obs: String(alguna('OBSERVACION')),
        mes: fecha ? fecha.split('-')[1] ?? '' : '', anio: fecha ? fecha.split('-')[0] ?? '' : '',
        marca: p?.marca ?? '', dueno: p?.cliente ?? '', uts: p?.uts ?? '', combustible: p?.combustible ?? '', modelo: p?.modelo ?? '',
        km_gps: km ? String(Math.round(km)) : '',
      };
    });
  }, [crudas, placas.data, gps]);

  const validas = filas.filter(f => !f.descartada);
  const conAviso = validas.filter(f => f.avisos.length > 0);

  async function importar() {
    if (!validas.length) return;
    setEnviando(true); setError(null);
    try {
      const r = await importarFleetrunMasivo(validas.map(({ fila: _f, avisos: _a, descartada: _d, ...reg }) => reg));
      if (r.error) throw new Error(r.error);
      setResultado(r);
      haptic(r.errores ? 'warning' : 'success');
      toast(`${r.ok} registros importados${r.errores ? `, ${r.errores} con error` : ''}`);
      await qc.invalidateQueries({ queryKey: ['mant', 'fleetrun'] });
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Importar Fleetrun desde Excel"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>{resultado ? 'Cerrar' : 'Cancelar'}</Button>
        {!resultado && <Button variant="primary" onClick={importar} loading={enviando} disabled={!validas.length || leyendo}>
          {validas.length ? `Importar ${validas.length} registros` : 'Importar'}</Button>}</>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Archivo Excel (.xlsx)" wide hint={<>Columnas: {ENCABEZADOS.join(', ')}. <button type="button" className="placas-limpiar" onClick={() => void descargarPlantillaFleetrun()}>Descargar plantilla</button></>}>
          {p => <TextInput {...p} type="file" accept=".xlsx,.xls" disabled={leyendo || enviando} onChange={e => elegir(e.target.files?.[0])} />}
        </Field>

        {filas.length > 0 && !resultado && (
          <div className="field field--wide" style={{ gap: 'var(--s-2)' }}>
            <p className="t-footnote c-secondary">
              {filas.length} filas leídas · {validas.length} se importarán{filas.length - validas.length ? ` · ${filas.length - validas.length} sin placa se omiten` : ''}.
              Si el código (ID) ya existe se actualiza; si no, se crea uno nuevo.
            </p>
            {validas.length === 0 && (
              <Notice tone="error" icon={<CircleAlert size={16} />}>No se encontró placa en ninguna fila. Columnas leídas: {Object.keys(crudas[0] ?? {}).join(', ')}.</Notice>
            )}
            {conAviso.length > 0 && (
              <Notice tone="neutral" icon={<CircleAlert size={16} />}>
                {conAviso.length} filas con avisos (se importan igual):{' '}
                {conAviso.slice(0, 6).map(f => `fila ${f.fila}: ${f.avisos.join(', ')}`).join(' · ')}{conAviso.length > 6 ? ` · y ${conAviso.length - 6} más` : ''}
              </Notice>
            )}
            <div className="tarjeta__lista" style={{ overflowX: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '34rem' }}>
                <thead><tr><th>Fila</th><th>Placa</th><th>Tipo MP</th><th>Fecha</th><th style={{ textAlign: 'right' }}>Km actual</th><th style={{ textAlign: 'right' }}>Próximo</th></tr></thead>
                <tbody>
                  {filas.slice(0, 10).map(f => (
                    <tr key={f.fila} style={f.descartada ? { opacity: 0.45 } : undefined}>
                      <td>{f.fila}</td><td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{f.placa || '—'}</td><td>{f.tipomp || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{f.fecha || 'Plan inicial'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(f.kmact).toLocaleString('es-PE')}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(f.kmprox).toLocaleString('es-PE')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filas.length > 10 && <span className="field__hint">Vista previa de las primeras 10 filas.</span>}
          </div>
        )}

        {resultado && (
          <div className="field field--wide">
            <Notice tone={resultado.errores ? 'error' : 'success'}>
              Importación completada: {resultado.ok} procesados, {resultado.errores} con error{resultado.detalle ? ` — ${resultado.detalle}` : ''}.
            </Notice>
          </div>
        )}
      </div>
    </Sheet>
  );
}
