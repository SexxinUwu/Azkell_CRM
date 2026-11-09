import { useRef, useState } from 'react';
import { CircleAlert, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { importarPapeletas, type EntidadPap } from './pap-api';
import { descargarPlantillaPapeletas, leerExcelPapeletas } from './pap-excel';

/** Importar papeletas desde Excel: se lee el archivo, se muestra cuántas filas hay y los avisos, y recién al confirmar se cargan */
export function PapImportar({ abierto, entidades, onClose, onHecho }: { abierto: boolean; entidades: EntidadPap[]; onClose: () => void; onHecho: () => unknown }) {
  const toast = useToast();
  const entrada = useRef<HTMLInputElement>(null);
  const [filas, setFilas] = useState<Record<string, unknown>[] | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<{ insertadas: number; repetidas: number; errores: Array<{ fila: number; error: string }> } | null>(null);
  const [para, setPara] = useState(false);

  if (abierto && !para) { setPara(true); setFilas(null); setAvisos([]); setNombre(''); setError(null); setResultado(null); }
  if (!abierto && para) setPara(false);

  async function leer(f: File | undefined) {
    if (!f) return;
    setError(null); setResultado(null); setCargando(true);
    try {
      const r = await leerExcelPapeletas(f, entidades);
      if (!r.filas.length) { setError('El Excel no tiene filas con datos. Usa la plantilla.'); setFilas(null); return; }
      setFilas(r.filas); setAvisos(r.avisos); setNombre(f.name);
    } catch (e) { setError(`No se pudo leer el archivo: ${errorMessage(e)}`); setFilas(null); }
    finally { setCargando(false); if (entrada.current) entrada.current.value = ''; }
  }

  async function importar() {
    if (!filas) return;
    setCargando(true); setError(null);
    try {
      const r = await importarPapeletas(filas);
      setResultado(r); setFilas(null);
      haptic(r.errores.length ? 'warning' : 'success');
      toast(`${r.insertadas} papeletas cargadas${r.repetidas ? `, ${r.repetidas} ya existían` : ''}${r.errores.length ? `, ${r.errores.length} con error` : ''}`, r.errores.length ? 'error' : undefined);
      await onHecho();
    } catch (e) { setError(errorMessage(e)); haptic('warning'); }
    finally { setCargando(false); }
  }

  return (
    <Sheet open={abierto} onClose={() => !cargando && onClose()} title="Importar papeletas desde Excel"
      footer={<><Button variant="secondary" onClick={onClose} disabled={cargando}>Cerrar</Button>
        {filas && <Button variant="primary" icon={<Upload size={16} />} loading={cargando} onClick={() => { void importar(); }}>Cargar {filas.length} filas</Button>}</>}>
      <div className="pap-imp">
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
        <div className="pap-imp__paso">
          <span className="pap-sec__num">1</span>
          <div><strong>Descarga la plantilla</strong><span>Trae las entidades con sus códigos y las instrucciones. Solo son obligatorios la entidad, el número, la fecha y la placa: lo demás se completa solo.</span></div>
          <Button variant="secondary" icon={<Download size={16} />} onClick={() => { void descargarPlantillaPapeletas(entidades); }}>Plantilla</Button>
        </div>
        <div className="pap-imp__paso">
          <span className="pap-sec__num">2</span>
          <div><strong>Sube tu Excel</strong><span>{nombre ? `${nombre} · ${filas?.length ?? 0} filas leídas` : 'Se revisa antes de cargar: no se guarda nada hasta que confirmes.'}</span></div>
          <Button variant="secondary" icon={<FileSpreadsheet size={16} />} loading={cargando && !filas} onClick={() => entrada.current?.click()}>Elegir archivo</Button>
          <input ref={entrada} type="file" accept=".xlsx,.xls" hidden onChange={e => { void leer(e.target.files?.[0]); }} />
        </div>
        {avisos.length > 0 && <Notice tone="accent">{avisos.slice(0, 6).map(a => <div key={a}>{a}</div>)}{avisos.length > 6 && <div>y {avisos.length - 6} avisos más</div>}</Notice>}
        {resultado && (
          <div className="pap-imp__resultado">
            <strong>Resultado</strong>
            <ul>
              <li><b>{resultado.insertadas}</b> papeletas cargadas</li>
              <li><b>{resultado.repetidas}</b> ya estaban registradas (mismo número y entidad) y se omitieron</li>
              <li><b>{resultado.errores.length}</b> con error</li>
            </ul>
            {resultado.errores.slice(0, 12).map(e => <div key={e.fila} className="pap-imp__error">Fila {e.fila}: {e.error}</div>)}
            {resultado.errores.length > 12 && <div className="pap-imp__error">y {resultado.errores.length - 12} errores más. Corrígelos en el Excel y vuelve a subirlo: las que ya se cargaron no se duplican.</div>}
          </div>
        )}
      </div>
    </Sheet>
  );
}
