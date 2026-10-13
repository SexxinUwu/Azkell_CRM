// Íconos que los módulos piden por nombre en su rutas.ts. Se importan uno por uno
// (importar todo lucide-react pesaría cientos de KB). Si falta uno, se usa el genérico.
import { Circle, type LucideIcon } from 'lucide-react';

const ICONOS: Record<string, LucideIcon> = {};

export const iconoDe = (nombre: string): LucideIcon => ICONOS[nombre] ?? Circle;
