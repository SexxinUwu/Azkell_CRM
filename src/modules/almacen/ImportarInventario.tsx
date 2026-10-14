import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileSpreadsheet, Upload } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import type { ArticuloInv } from './api';
import { ArchivoInvalido, descargarPlantilla, importar, leerExcel, repetidos, type FilaImport } from './excelInventario';

type Paso =
  | { paso: 'elegir'; error?: string }
  | { paso: 'revisar'; archivo: string; filas: FilaImport[]; sinNombre: number; repetidos: string[]; ignoradas: string[] }
  | { paso: 'listo'; insertados: number; errores: string[] };

// Importar inventario desde Excel: elegir → revisar → listo.
export function ImportarInventario({ open, onClose, existentes }: { open: boolean; onClose: () => void; existentes: ArticuloInv[] }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Paso>({ paso: 'elegir' });
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { if (open) setEstado({ paso: 'elegir' }); }, [open]);

  async function leer(archivo: File | undefined) {
    if (!archivo) return;
    setOcupado(true);
    try {
      const { filas, ignoradas } = await leerExcel(archivo);
      if (!filas.length) throw new ArchivoInvalido('El archivo no tiene filas con datos debajo de los encabezados.');
      setEstado({
        paso: 'revisar', archivo: archivo.name, ignoradas,
        filas: filas.filter(f => f.articulo), sinNombre: filas.filter(f => !f.articulo).length,
        repetidos: repetidos(filas, existentes),
      });
      haptic('selection');
    } catch (err) {
      setEstado({ paso: 'elegir', error: errorMessage(err) });
      haptic('warning');
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = '';
    }
  }

  async function confirmar() {
    if (estado.paso !== 'revisar') return;
    setOcupado(true);
    try {
      const r = await importar(estado.filas);
      await qc.invalidateQueries({ queryKey: ['almacen', 'inventario'] });
      setEstado({ paso: 'listo', ...r });
      haptic('success');
    } catch (err) {
      setEstado({ paso: 'elegir', error: errorMessage(err) });
      haptic('warning');
    } finally {
      setOcupado(false);
    }
  }

  const footer = estado.paso === 'elegir' ? (
    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
  ) : estado.paso === 'revisar' ? (
    <>
      <Button variant="secondary" onClick={() => setEstado({ paso: 'elegir' })} disabled={ocupado}>Elegir otro archivo</Button>
      <Button variant="primary" onClick={confirmar} loading={ocupado} disabled={!estado.filas.length}>
        Importar {estado.filas.length} artículos
      </Button>
    </>
  ) : (
    <Button variant="primary" onClick={onClose}>Listo</Button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Importar inventario desde Excel" footer={footer}>
      {estado.paso === 'elegir' && (
        <div className="importar">
          <button type="button" className="importar__zona pressable" onClick={() => input.current?.click()} disabled={ocupado}>
            <span className="importar__icono">{ocupado ? <FileSpreadsheet size={30} /> : <Upload size={30} />}</span>
            <span className="importar__titulo">{ocupado ? 'Leyendo el archivo…' : 'Elige tu Excel'}</span>
            <span className="t-footnote c-secondary">toca para buscarlo · solo archivos .xlsx</span>
          </button>
          <input ref={input} type="file" accept=".xlsx" hidden onChange={e => leer(e.target.files?.[0])} />
          {estado.error && <Notice tone="error" icon={<CircleAlert size={16} />}>{estado.error}</Notice>}
          <p className="t-footnote c-secondary importar__ayuda">
            ¿No tienes el formato? <button type="button" className="placas-limpiar" onClick={() => descargarPlantilla()}>Descargar plantilla</button>.
            Importar siempre crea artículos nuevos: no actualiza los existentes.
          </p>
        </div>
      )}

      {estado.paso === 'revisar' && (
        <div className="importar">
          <p className="t-footnote c-secondary">
            <FileSpreadsheet size={14} style={{ verticalAlign: '-2px' }} /> {estado.archivo} · {estado.filas.length + estado.sinNombre} filas
          </p>
          <div className="importar__resumen">
            <div className="importar__cifra importar__cifra--nuevas"><span className="t-numeric">{estado.filas.length}</span><span>se crean</span></div>
            <div className="importar__cifra"><span className="t-numeric">{estado.sinNombre}</span><span>se omiten</span></div>
          </div>
          {estado.repetidos.length > 0 && (
            <Notice tone="error" icon={<CircleAlert size={16} />}>
              {estado.repetidos.length} artículos ya existen (mismo nombre y código) y quedarían duplicados: {estado.repetidos.slice(0, 5).join(', ')}
              {estado.repetidos.length > 5 ? '…' : ''}. Quítalos del Excel si no quieres duplicarlos.
            </Notice>
          )}
          {estado.sinNombre > 0 && <p className="t-footnote c-secondary">Se omiten {estado.sinNombre} filas sin nombre de artículo.</p>}
          {estado.ignoradas.length > 0 && <p className="t-footnote c-secondary">Columnas que no se usan: {estado.ignoradas.join(', ')}.</p>}
          <ul className="importar__vista">
            {estado.filas.slice(0, 10).map((f, i) => (
              <li key={i}>
                <span>{f.articulo}</span>
                <span className="t-footnote c-secondary">{[f.familia, f.unidad].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {estado.paso === 'listo' && (
        <div className="importar importar--listo">
          <div className="importar__titulo"><span className="t-numeric">{estado.insertados}</span> artículos importados</div>
          {estado.errores.length > 0 && (
            <Notice tone="error">{estado.errores.length} filas con error: {estado.errores.slice(0, 4).join(' · ')}</Notice>
          )}
        </div>
      )}
    </Sheet>
  );
}
