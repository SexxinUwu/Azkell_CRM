// Combustible de toda la flota: nivel de cada unidad (Wialon), rendimiento real (vales) y la vigilancia de reserva, cargas y caídas.
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../core/api/client';
import { factorCombustible } from './unidadCombustible';
import { RESERVA_COMBUSTIBLE_PCT } from './mapaConfig';
import type { Alerta } from './motor';
import type { UnidadMapa } from '../api';

export interface NivelFlota { placa: string; id: number; nivel: number; unidad: string; nombre: string }

/** Nivel de combustible de todas las unidades con sensor (el servidor lo guarda 60 s) */
export function useCombustibleFlota() {
  return useQuery({
    queryKey: ['flota', 'combustible-flota'],
    refetchInterval: 60_000,
    staleTime: 45_000,
    queryFn: async (): Promise<NivelFlota[]> => {
      const r = await api<{ data?: NivelFlota[] }>('/script/obtenerCombustibleWialonFlota', { method: 'POST', body: { args: [{}] } });
      return Array.isArray(r?.data) ? r.data : [];
    },
  });
}

/** Kilómetros por galón reales de cada unidad (de sus vales de los últimos 120 días), por placa sin guiones */
export function useRendimientoFlota() {
  return useQuery({
    queryKey: ['flota', 'rendimiento-flota'],
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const r = await api<Array<{ placa: string; rendimiento: number }>>('/combustible/rendimiento-flota');
      return new Map((Array.isArray(r) ? r : []).map(x => [String(x.placa).replace(/[^A-Z0-9]/gi, '').toUpperCase(), Number(x.rendimiento)]));
    },
  });
}

export interface EstadoCombustible {
  pct: number;
  galones: number;
  reserva: number;
  utilizable: number;
  enReserva: boolean;
}

/** Porcentaje y galones de una lectura, con la capacidad de tanque de Placas; null si falta la capacidad o la lectura no es creíble */
export function estadoCombustible(n: NivelFlota | undefined, capacidad: number | null | undefined): EstadoCombustible | null {
  if (!n || !capacidad || capacidad <= 0) return null;
  const f = factorCombustible(n.unidad, capacidad);
  const enPct = n.unidad.trim() === '%' || n.unidad.trim() === '';
  const pct = enPct ? n.nivel : n.nivel * f.factor;
  if (!(pct >= 0) || pct > 105) return null;
  const p = Math.min(100, pct);
  const galones = capacidad * p / 100;
  const reserva = capacidad * RESERVA_COMBUSTIBLE_PCT / 100;
  return { pct: p, galones, reserva, utilizable: Math.max(0, galones - reserva), enReserva: p <= RESERVA_COMBUSTIBLE_PCT };
}

/** Placas con el nivel en reserva (para el filtro y el contador) */
export function useEnReserva(niveles: NivelFlota[] | undefined, capacidades: Map<string, number>) {
  return useMemo(() => {
    const s = new Set<string>();
    for (const n of niveles ?? []) {
      const e = estadoCombustible(n, capacidades.get(n.placa));
      if (e?.enReserva) s.add(n.placa);
    }
    return s;
  }, [niveles, capacidades]);
}

// Reglas de la vigilancia (puntos de porcentaje entre dos lecturas, una por minuto)
const SUBIDA_CARGA_PCT = 8;
const CAIDA_BRUSCA_PCT = 6;

/**
 * Avisos en el mapa a partir de la lectura de toda la flota: entrar en reserva, carga de combustible y caída brusca con la unidad
 * detenida y el motor apagado (posible robo). La primera lectura solo fija la base: nunca avisa por lo que ya estaba.
 */
export function useVigilanciaCombustible(
  niveles: NivelFlota[] | undefined,
  capacidades: Map<string, number>,
  unidades: UnidadMapa[],
  alAvisar: (a: Alerta) => void,
) {
  const previo = useRef<Map<string, number>>(new Map());
  const avisadaReserva = useRef<Set<string>>(new Set());
  const aviso = useRef(alAvisar);
  aviso.current = alAvisar;
  const unidadesRef = useRef(unidades);
  unidadesRef.current = unidades;

  useEffect(() => {
    if (!niveles?.length) return;
    const hora = () => new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const emitir = (placa: string, icono: string, color: string, msg: string) =>
      aviso.current({ id: Date.now() + Math.floor(Math.random() * 1000), placa, icono, color, msg, hora: hora() });
    const gal = (n: number) => `${Math.round(n * 10) / 10} gal`;
    for (const n of niveles) {
      const cap = capacidades.get(n.placa);
      const e = estadoCombustible(n, cap);
      if (!e || !cap) continue;
      const antes = previo.current.get(n.placa);
      previo.current.set(n.placa, e.pct);
      if (antes == null) { if (e.enReserva) avisadaReserva.current.add(n.placa); continue; }
      const dif = e.pct - antes;
      const u = unidadesRef.current.find(x => x.placa === n.placa);
      if (e.enReserva && !avisadaReserva.current.has(n.placa)) {
        avisadaReserva.current.add(n.placa);
        emitir(n.placa, '⛽', '#ff5470', `Entró en reserva: quedan ${gal(e.galones)} (${Math.round(e.pct)} %)`);
      } else if (e.pct > RESERVA_COMBUSTIBLE_PCT + 5) {
        avisadaReserva.current.delete(n.placa);
      }
      if (dif >= SUBIDA_CARGA_PCT) {
        emitir(n.placa, '⛽', '#22e3a0', `Carga de combustible: +${gal(cap * dif / 100)} (${Math.round(e.pct)} %)`);
      } else if (dif <= -CAIDA_BRUSCA_PCT && u && u.velocidad <= 2 && !u.ignicion) {
        emitir(n.placa, '⚠', '#ff5470', `Caída brusca de combustible sin movimiento: −${gal(cap * -dif / 100)} · posible robo`);
      }
    }
  }, [niveles, capacidades]);
}
