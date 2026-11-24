import { estadoDoc, TIPOS_DOC, type DocumentoPersona, type Persona } from './api';

// Estado de los documentos de cada persona, igual que el de cada unidad en Documentos de flota:
//   vencido → algún documento ya venció · alerta → alguno por vencer o falta uno que se le exige
//   vigente → todo cargado y al día · sin → no tiene ningún documento cargado
export type GrupoPersona = 'vigente' | 'alerta' | 'vencido' | 'sin';

export const COLOR_GRUPO: Record<GrupoPersona, string> = {
  vigente: 'var(--green-ink)', alerta: 'var(--amber-ink)', vencido: 'var(--red-ink)', sin: 'var(--label-3)',
};
export const TEXTO_GRUPO: Record<GrupoPersona, string> = {
  vigente: 'Documentos al día', alerta: 'Por vencer o faltan documentos', vencido: 'Tiene documentos vencidos', sin: 'Sin documentos',
};

export const esConductorPersona = (p: Pick<Persona, 'categoria_rol' | 'cargo'>) => p.categoria_rol === 'CONDUCTOR' || /conductor|chofer/i.test(p.cargo ?? '');

/** El documento vigente de cada tipo es el más nuevo (el de mayor id); los «Otros» cuentan todos */
function vigentesPorTipo(docs: DocumentoPersona[]): DocumentoPersona[] {
  const porTipo = new Map<string, DocumentoPersona>();
  const otros: DocumentoPersona[] = [];
  for (const d of docs) {
    if (d.tipo === 'OTRO') { otros.push(d); continue; }
    const previo = porTipo.get(d.tipo);
    if (!previo || d.id > previo.id) porTipo.set(d.tipo, d);
  }
  return [...porTipo.values(), ...otros];
}

/** Documentos que se le exigen a la persona (la licencia, solo a los conductores) */
export const exigidosDe = (p: Pick<Persona, 'categoria_rol' | 'cargo'>) => TIPOS_DOC.filter(t => t.obligatorio && (!t.soloConductor || esConductorPersona(p)));

export function grupoDePersona(p: Persona, docsDeLaPersona: DocumentoPersona[]): GrupoPersona {
  if (docsDeLaPersona.length === 0) return 'sin';
  const actuales = vigentesPorTipo(docsDeLaPersona);
  const estados = actuales.map(d => estadoDoc(d).estado);
  if (estados.includes('vencido')) return 'vencido';
  const faltan = exigidosDe(p).some(t => !actuales.some(d => d.tipo === t.tipo));
  if (estados.includes('por_vencer') || faltan) return 'alerta';
  return 'vigente';
}
