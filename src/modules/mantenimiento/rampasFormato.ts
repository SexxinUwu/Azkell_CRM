// Formato de los datos de rampa que se ven igual en la tabla, las tarjetas y el PDF

/** Motivo de ingreso sin marcas del sistema (•, [Reporte …], "Falla Manual :") y con cada punto numerado en su línea */
export function motivoIngreso(texto: string | null | undefined): string {
  const limpio = String(texto ?? '')
    .replace(/\[[^\]]*\]\s*/g, '')
    .replace(/•\s*/g, '')
    .replace(/(falla manual|manual)\s*:\s*/gi, '')
    .trim();
  return limpio.split(/\s+(?=\d{1,2}\.\s)/).join('\n');
}

/** Nombre de persona: primera letra en mayúscula y el resto en minúscula, palabra por palabra */
export function nombrePersona(nombre: string): string {
  return nombre
    .toLocaleLowerCase('es-PE')
    .replace(/(^|[\s-])(\p{L})/gu, (_, separador: string, letra: string) => separador + letra.toLocaleUpperCase('es-PE'));
}
