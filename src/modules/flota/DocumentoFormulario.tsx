import { useEffect, useMemo, useState } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox, type ComboboxOption } from '../../core/ui/Combobox';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { usePlacas } from '../placas/api';
import {
  CAMPOS_DOC, guardarDocumentoPersonalizado, guardarDocumentoVehiculo, subirArchivoDocumento, useVehiculosFlota, type VehiculoFlota,
} from './api';
import { personalizadosDe, type DocPersonalizado } from './docsEstado';

const dia = (v: unknown) => (v ? String(v).split('T')[0] : '');
const TIVE = 'custom:TIVE';
const PREFIJO_CUSTOM = 'custom:';
const esPersonalizado = (sel: string) => sel.startsWith('custom:');

interface Personalizado { constancia: string; emision: string; vencimiento: string; costo: string }
const VACIO: Personalizado = { constancia: '', emision: '', vencimiento: '', costo: '' };

// Cargar o renovar un documento de una unidad: estándar, TIVE u otro tipo (fechas, entidad y archivo).
export function DocumentoFormulario({ placa: placaInicial, prefijo: prefijoInicial, personalizado, usuario, open, onClose }: {
  placa: string | null; prefijo: string | null; personalizado: DocPersonalizado | null; usuario: string; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const vehiculos = useVehiculosFlota();
  const placas = usePlacas();

  const [placa, setPlaca] = useState('');
  const [seleccion, setSeleccion] = useState('soat');
  const [valores, setValores] = useState<Record<string, string>>({});
  const [costo, setCosto] = useState('');
  const [perso, setPerso] = useState<Personalizado>(VACIO);
  const [archivo, setArchivo] = useState<File | null>(null);
  // Cambia al quitar el archivo elegido: el campo de archivo se vacía de verdad
  const [claveArchivo, setClaveArchivo] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errCampo, setErrCampo] = useState<Record<string, string | undefined>>({});

  const fijo = !!(placaInicial && (prefijoInicial || personalizado));
  const esCustom = esPersonalizado(seleccion);
  const vehiculo: VehiculoFlota | undefined = (vehiculos.data ?? []).find(v => v.placa === placa);
  const cfg = esCustom ? undefined : CAMPOS_DOC[seleccion];
  const tieneCostoEnCampos = !!cfg && cfg.campos.some(c => c.campo === `${seleccion}_pago`);

  useEffect(() => {
    if (!open) return;
    setError(null); setArchivo(null); setCosto('');
    setPlaca(placaInicial ?? '');
    if (personalizado) {
      setSeleccion(/TIVE/i.test(personalizado.tipo) ? TIVE : PREFIJO_CUSTOM + personalizado.tipo);
      setPerso({ constancia: personalizado.constancia ?? '', emision: dia(personalizado.emision), vencimiento: dia(personalizado.vencimiento), costo: personalizado.pago ?? '' });
    } else {
      setSeleccion(prefijoInicial ?? 'soat');
      setPerso(VACIO);
    }
  }, [open, placaInicial, prefijoInicial, personalizado]);

  // Al elegir unidad/documento estándar: precarga lo que ya tiene
  useEffect(() => {
    if (!open || !cfg) return;
    const v = (vehiculos.data ?? []).find(x => x.placa === placa);
    const ini: Record<string, string> = {};
    for (const c of cfg.campos) {
      const raw = v ? (v as Record<string, unknown>)[c.campo] : '';
      ini[c.campo] = c.tipo === 'date' ? dia(raw) : raw == null ? '' : String(raw);
    }
    setValores(ini);
  }, [open, placa, seleccion, cfg, vehiculos.data]);

  const opcionesPlaca = useMemo(() => {
    const s = new Set<string>();
    (placas.data ?? []).forEach(p => s.add(p.placa));
    (vehiculos.data ?? []).forEach(v => s.add(v.placa));
    return [...s].sort();
  }, [placas.data, vehiculos.data]);

  const nombreTipo = seleccion === TIVE ? 'TIVE' : seleccion.slice(PREFIJO_CUSTOM.length).trim();

  // Lista de tipos: los estándar, TIVE y todos los que ya se registraron en alguna unidad (más el que se acaba de escribir)
  const opcionesDoc = useMemo(() => {
    const o: ComboboxOption[] = Object.entries(CAMPOS_DOC).map(([k, c]) => ({ value: k, label: c.label }));
    o.push({ value: TIVE, label: 'Tarjeta de propiedad (TIVe / SUNARP)', description: 'No vence', keywords: 'tive sunarp propiedad' });
    const vistos = new Set<string>(['TIVE']);
    const agregar = (t: string) => {
      const n = t.trim(); const k = n.toUpperCase();
      if (!n || vistos.has(k) || /TIVE/i.test(n)) return;
      vistos.add(k); o.push({ value: PREFIJO_CUSTOM + n, label: n });
    };
    (vehiculos.data ?? []).forEach(v => personalizadosDe(v).forEach(d => agregar(d.tipo)));
    if (esCustom) agregar(nombreTipo);
    return o;
  }, [vehiculos.data, esCustom, nombreTipo]);

  async function guardar() {
    setErrCampo({});
    if (!placa) { setErrCampo({ placa: 'Elige la unidad.' }); haptic('warning'); return; }
    setEnviando(true); setError(null);
    try {
      if (esCustom) {
        if (!nombreTipo) { setError('Escribe el nombre del documento.'); haptic('warning'); return; }
        const { emision, vencimiento } = perso;
        if (emision && vencimiento && vencimiento < emision) { setErrCampo({ vencimiento: 'El vencimiento es anterior a la emisión.' }); haptic('warning'); return; }
        const url = archivo ? await subirArchivoDocumento(archivo) : (personalizado?.url ?? null);
        await guardarDocumentoPersonalizado({
          placa, tipo: nombreTipo, constancia: perso.constancia, emision, vencimiento, costo: perso.costo, archivoUrl: url, usuario,
        });
        toast(`${nombreTipo} de ${placa} guardado`);
      } else {
        const venc = valores[`${seleccion}_vencimiento`];
        if (!venc) { setErrCampo({ [`${seleccion}_vencimiento`]: 'Indica la fecha de vencimiento.' }); haptic('warning'); return; }
        const ems = valores[`${seleccion}_emision`];
        if (ems && venc < ems) { setErrCampo({ [`${seleccion}_vencimiento`]: 'El vencimiento es anterior a la emisión.' }); haptic('warning'); return; }
        const url = archivo ? await subirArchivoDocumento(archivo) : null;
        await guardarDocumentoVehiculo({ vehiculo: vehiculo ?? { placa }, prefijo: seleccion, valores, archivoUrl: url, costo, usuario });
        toast(`${cfg?.label ?? 'Documento'} de ${placa} actualizado`);
      }
      haptic('success');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['flota', 'vehiculos'] }),
        qc.invalidateQueries({ queryKey: ['flota', 'historial-docs'] }),
      ]);
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const titulo = personalizado ? 'Actualizar documento' : fijo ? `Renovar ${cfg?.label ?? 'documento'}` : 'Cargar documento';

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={titulo}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Unidad" error={errCampo.placa}>
          {p => (
            <PlacaPicker {...p} value={placa} onChange={setPlaca} disabled={fijo} opciones={opcionesPlaca.map(x => ({ placa: x }))} />
          )}
        </Field>
        <Field label="Documento">
          {p => (
            <Combobox {...p} options={opcionesDoc} value={seleccion} disabled={fijo} placeholder="Busca o escribe un tipo de documento"
              tituloHoja="Tipo de documento" createLabel="Agregar tipo"
              onChange={v => { if (v) setSeleccion(v); }}
              onCreate={t => { const n = t.trim(); if (n) setSeleccion(PREFIJO_CUSTOM + n); }} />
          )}
        </Field>

        {esCustom && (
          <>
            <Field label="N° de constancia">
              {p => <TextInput {...p} value={perso.constancia} onChange={e => setPerso(x => ({ ...x, constancia: e.target.value }))} />}
            </Field>
            <Field label="Emisión">
              {p => <TextInput {...p} type="date" value={perso.emision} onChange={e => setPerso(x => ({ ...x, emision: e.target.value }))} />}
            </Field>
            <Field label="Vencimiento" error={errCampo.vencimiento} hint="Opcional: sin fecha, el documento queda permanente">
              {p => <TextInput {...p} type="date" value={perso.vencimiento} onChange={e => setPerso(x => ({ ...x, vencimiento: e.target.value }))} />}
            </Field>
            <Field label="Costo / Pago (S/)">
              {p => <TextInput {...p} inputMode="decimal" value={perso.costo} onChange={e => setPerso(x => ({ ...x, costo: e.target.value }))} />}
            </Field>
          </>
        )}

        {cfg?.campos.map(c => (
          <Field key={c.campo} label={c.label} wide={c.tipo === 'text' && c.campo.endsWith('entidad')} error={errCampo[c.campo]}>
            {p => (
              <TextInput {...p}
                type={c.tipo === 'date' ? 'date' : c.tipo === 'number' ? 'number' : 'text'}
                value={valores[c.campo] ?? ''} onChange={e => setValores(v => ({ ...v, [c.campo]: e.target.value }))} />
            )}
          </Field>
        ))}
        {cfg && !tieneCostoEnCampos && (
          <Field label="Costo / Pago (S/)">
            {p => <TextInput {...p} inputMode="decimal" value={costo} onChange={e => setCosto(e.target.value)} />}
          </Field>
        )}

        <Field label="Archivo (PDF o foto)" wide hint={archivo ? archivo.name : fijo ? 'Opcional: si no eliges uno, se conserva el actual' : 'Opcional'}>
          {p => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <ArchivoInput {...p} key={claveArchivo} accept="image/*,application/pdf" onChange={setArchivo} />
              </div>
              {archivo && (
                <Button variant="plain" iconOnly icon={<X size={18} />} aria-label="Quitar el archivo elegido"
                  onClick={() => { setArchivo(null); setClaveArchivo(c => c + 1); }} />
              )}
            </div>
          )}
        </Field>
      </div>
    </Sheet>
  );
}
