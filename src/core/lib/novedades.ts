/**
 * Novedades que ve el usuario después de actualizar. Texto escrito a mano, en lenguaje de todos los días.
 * Al publicar algo que el usuario note, se agrega una entrada ARRIBA (la más nueva primero) con un `id` nuevo.
 * Los cambios internos (correcciones, velocidad) no se anotan.
 */
export interface Novedad {
  /** Identificador único; la fecha de publicación sirve (si hay dos el mismo día, agrega -2) */
  id: string;
  fecha: string;
  titulo: string;
  puntos: string[];
}

export const NOVEDADES: Novedad[] = [
  {
    id: '2026-11-11',
    fecha: '11 de noviembre de 2026',
    titulo: 'Proveedores con varios contactos',
    puntos: [
      'Cada proveedor ahora tiene su lista de asesores, con teléfono, WhatsApp y correo. El RUC se registra una sola vez y ya no se repite.',
      'Nuevo directorio con dos vistas: «Contactos», como la agenda del teléfono, y «Proveedores», una fila por empresa. Al tocar una fila se abre su ficha.',
      'Un aviso te muestra los proveedores a los que les falta el RUC o DNI para que los completes.',
      'Notas de crédito de proveedores: registra la devolución, la nota que te da el proveedor y aplica su saldo al pagar otra orden. Cada proveedor tiene su estado de cuenta.',
      'Inspecciones: medidor de combustible, kilometraje tomado del GPS y un informe en PDF nuevo, con fotos, para abrir o enviar por WhatsApp.',
    ],
  },
];
