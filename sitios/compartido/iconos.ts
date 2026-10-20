import { Banknote, Boxes, Code, Gauge, Radar, Route, ShieldCheck, Truck, Users, Wrench, type LucideIcon } from 'lucide-react';

// Iconos que los textos de datos.ts piden por nombre
const MAPA: Record<string, LucideIcon> = { Banknote, Boxes, Code, Gauge, Radar, Route, ShieldCheck, Truck, Users, Wrench };
export const icono = (nombre: string): LucideIcon => MAPA[nombre] ?? Boxes;
