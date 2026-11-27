import {
  Combine, Crop, EyeOff, FileCode, FileDown, FileImage, FileInput, FileOutput, FileSpreadsheet, FileText, FormInput, GitCompare, Globe, Images,
  Languages, LayoutGrid, Lock, PenLine, PenTool, Presentation, RotateCw, ScanLine, ScanText, Scissors, Sparkles, Stamp, Trash2, Unlock, Wrench, ListOrdered,
  type LucideIcon,
} from 'lucide-react';

// Catálogo de las herramientas PDF: lo usan el encabezado (menús), la página principal y cada herramienta.
// `listo: false` = todavía no disponible (se ve en el menú con «Pronto»).

export type CategoriaId = 'ordenar' | 'optimizar' | 'a-pdf' | 'desde-pdf' | 'editar' | 'seguridad' | 'inteligencia';

export const CATEGORIAS: Array<{ id: CategoriaId; titulo: string }> = [
  { id: 'ordenar', titulo: 'Ordenar PDF' },
  { id: 'optimizar', titulo: 'Optimizar PDF' },
  { id: 'a-pdf', titulo: 'Convertir a PDF' },
  { id: 'desde-pdf', titulo: 'Convertir desde PDF' },
  { id: 'editar', titulo: 'Editar PDF' },
  { id: 'seguridad', titulo: 'Seguridad de PDF' },
  { id: 'inteligencia', titulo: 'PDF Intelligence' },
];

export interface Herramienta {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: CategoriaId;
  icono: LucideIcon;
  color: string;
  listo: boolean;
  /** Por qué todavía no está (se muestra al abrirla) */
  nota?: string;
}

const NECESITA_SERVIDOR = 'Esta conversión no se puede hacer bien dentro del navegador: necesita un motor en el servidor. Estamos definiendo cómo hacerla sin que tus archivos salgan de la empresa.';
const NECESITA_IA = 'Usa inteligencia artificial, y eso enviaría el contenido del documento a un servicio externo. Está pendiente de decidir si se habilita.';

export const HERRAMIENTAS: Herramienta[] = [
  // Ordenar
  { id: 'unir', titulo: 'Unir PDF', descripcion: 'Junta varios PDF en uno solo, en el orden que quieras.', categoria: 'ordenar', icono: Combine, color: '#e5322d', listo: true },
  { id: 'dividir', titulo: 'Dividir PDF', descripcion: 'Separa un PDF por rangos o cada N páginas.', categoria: 'ordenar', icono: Scissors, color: '#e5322d', listo: true },
  { id: 'eliminar-paginas', titulo: 'Eliminar páginas', descripcion: 'Marca las páginas que sobran y quítalas.', categoria: 'ordenar', icono: Trash2, color: '#e5322d', listo: true },
  { id: 'extraer-paginas', titulo: 'Extraer páginas', descripcion: 'Saca solo las páginas que necesitas en un PDF nuevo.', categoria: 'ordenar', icono: FileOutput, color: '#f0613f', listo: true },
  { id: 'ordenar', titulo: 'Ordenar PDF', descripcion: 'Mira las páginas, cámbialas de lugar, gíralas o bórralas.', categoria: 'ordenar', icono: LayoutGrid, color: '#e5322d', listo: true },
  { id: 'escanear', titulo: 'Escanea a PDF', descripcion: 'Fotografía documentos con la cámara y conviértelos en PDF.', categoria: 'ordenar', icono: ScanLine, color: '#f0613f', listo: true },
  // Optimizar
  { id: 'comprimir', titulo: 'Comprimir PDF', descripcion: 'Reduce el peso para enviarlo por correo o WhatsApp.', categoria: 'optimizar', icono: FileDown, color: '#4caf50', listo: true },
  { id: 'reparar', titulo: 'Reparar PDF', descripcion: 'Recupera las páginas de un PDF dañado.', categoria: 'optimizar', icono: Wrench, color: '#4caf50', listo: true },
  { id: 'ocr', titulo: 'OCR PDF', descripcion: 'Convierte un escaneo en un PDF con texto seleccionable.', categoria: 'optimizar', icono: ScanText, color: '#4caf50', listo: true },
  // Convertir a PDF
  { id: 'jpg-a-pdf', titulo: 'JPG a PDF', descripcion: 'Convierte fotos y capturas en un PDF. Corrige las fotos del celular.', categoria: 'a-pdf', icono: FileImage, color: '#f5b400', listo: true },
  { id: 'word-a-pdf', titulo: 'WORD a PDF', descripcion: 'Convierte un documento de Word a PDF.', categoria: 'a-pdf', icono: FileText, color: '#2b6cb0', listo: false, nota: NECESITA_SERVIDOR },
  { id: 'powerpoint-a-pdf', titulo: 'POWERPOINT a PDF', descripcion: 'Convierte una presentación a PDF.', categoria: 'a-pdf', icono: Presentation, color: '#e8593c', listo: false, nota: NECESITA_SERVIDOR },
  { id: 'excel-a-pdf', titulo: 'EXCEL a PDF', descripcion: 'Convierte una hoja de cálculo a PDF.', categoria: 'a-pdf', icono: FileSpreadsheet, color: '#2e8b57', listo: false, nota: NECESITA_SERVIDOR },
  { id: 'html-a-pdf', titulo: 'HTML a PDF', descripcion: 'Convierte una página web guardada en PDF.', categoria: 'a-pdf', icono: Globe, color: '#f5b400', listo: false, nota: NECESITA_SERVIDOR },
  // Convertir desde PDF
  { id: 'pdf-a-jpg', titulo: 'PDF a JPG', descripcion: 'Saca cada página como imagen JPG o PNG.', categoria: 'desde-pdf', icono: Images, color: '#f5b400', listo: true },
  { id: 'pdf-a-word', titulo: 'PDF a WORD', descripcion: 'Convierte un PDF en un documento de Word editable.', categoria: 'desde-pdf', icono: FileInput, color: '#2b6cb0', listo: false, nota: NECESITA_SERVIDOR },
  { id: 'pdf-a-powerpoint', titulo: 'PDF a POWERPOINT', descripcion: 'Convierte un PDF en una presentación.', categoria: 'desde-pdf', icono: Presentation, color: '#e8593c', listo: false, nota: NECESITA_SERVIDOR },
  { id: 'pdf-a-excel', titulo: 'PDF a EXCEL', descripcion: 'Convierte las tablas de un PDF a Excel.', categoria: 'desde-pdf', icono: FileSpreadsheet, color: '#2e8b57', listo: false, nota: NECESITA_SERVIDOR },
  { id: 'pdf-a-pdfa', titulo: 'PDF a PDF/A', descripcion: 'Convierte un PDF al formato de archivo a largo plazo.', categoria: 'desde-pdf', icono: FileCode, color: '#3b5b9a', listo: false, nota: NECESITA_SERVIDOR },
  { id: 'pdf-a-markdown', titulo: 'PDF a Markdown', descripcion: 'Saca el texto del PDF como Markdown, con títulos y viñetas.', categoria: 'inteligencia', icono: FileCode, color: '#7c4dff', listo: true },
  // Editar
  { id: 'rotar', titulo: 'Rotar PDF', descripcion: 'Gira todas las páginas o solo algunas.', categoria: 'editar', icono: RotateCw, color: '#8e5bd6', listo: true },
  { id: 'numerar', titulo: 'Insertar números de página', descripcion: 'Agrega el número a cada página: «Página 1 de 10».', categoria: 'editar', icono: ListOrdered, color: '#8e5bd6', listo: true },
  { id: 'marca-de-agua', titulo: 'Insertar marca de agua', descripcion: 'Escribe un texto como CONFIDENCIAL sobre todas las páginas.', categoria: 'editar', icono: Stamp, color: '#8e5bd6', listo: true },
  { id: 'recortar', titulo: 'Recortar PDF', descripcion: 'Quita los márgenes de las páginas.', categoria: 'editar', icono: Crop, color: '#8e5bd6', listo: true },
  { id: 'editar', titulo: 'Editar PDF', descripcion: 'Agrega texto, imágenes y formas sobre el PDF.', categoria: 'editar', icono: PenLine, color: '#8e5bd6', listo: false, nota: 'El editor visual está en preparación.' },
  { id: 'formularios', titulo: 'Formularios PDF', descripcion: 'Llena los campos de un formulario PDF.', categoria: 'editar', icono: FormInput, color: '#8e5bd6', listo: true },
  // Seguridad
  { id: 'desbloquear', titulo: 'Desbloquear PDF', descripcion: 'Quita la contraseña de un PDF.', categoria: 'seguridad', icono: Unlock, color: '#3b6fd6', listo: true },
  { id: 'proteger', titulo: 'Proteger PDF', descripcion: 'Ponle contraseña a un PDF.', categoria: 'seguridad', icono: Lock, color: '#3b6fd6', listo: true },
  { id: 'firmar', titulo: 'Firmar PDF', descripcion: 'Dibuja tu firma y ponla en el documento.', categoria: 'seguridad', icono: PenTool, color: '#3b6fd6', listo: true },
  { id: 'censurar', titulo: 'Censurar PDF', descripcion: 'Tapa datos sensibles de forma definitiva.', categoria: 'seguridad', icono: EyeOff, color: '#3b6fd6', listo: false, nota: 'El editor visual está en preparación.' },
  { id: 'comparar', titulo: 'Comparar PDF', descripcion: 'Mira qué texto cambió entre dos versiones.', categoria: 'seguridad', icono: GitCompare, color: '#3b6fd6', listo: true },
  // Inteligencia
  { id: 'resumir', titulo: 'Resumir con IA', descripcion: 'Resume un PDF con inteligencia artificial.', categoria: 'inteligencia', icono: Sparkles, color: '#7c4dff', listo: false, nota: NECESITA_IA },
  { id: 'traducir', titulo: 'Traducir PDF', descripcion: 'Traduce el texto de un PDF con inteligencia artificial.', categoria: 'inteligencia', icono: Languages, color: '#7c4dff', listo: false, nota: NECESITA_IA },
];

export const porId = (id: string | undefined) => HERRAMIENTAS.find(h => h.id === id);
export const deCategoria = (c: CategoriaId) => HERRAMIENTAS.filter(h => h.categoria === c);
