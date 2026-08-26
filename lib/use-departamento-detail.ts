"use client";

import { useEffect, useState } from "react";
import type { SelectedRegion } from "./scene3d-context";
import { fetchStatsSerie, type StatsItem } from "./api";

export type BreakdownEntry = { categoria: string; area_ha: number };

export type DepartamentoDetail = {
  total_ha: number;
  eventos: number;
  clase: BreakdownEntry[];
  tenencia: BreakdownEntry[];
  leyenda: BreakdownEntry[];
};

function mergeBreakdown(
  items: StatsItem[],
  key: "por_clase" | "por_tenencia" | "por_leyenda"
): BreakdownEntry[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const dict = item[key];
    if (!dict) continue;
    for (const [categoria, area] of Object.entries(dict)) {
      totals.set(categoria, (totals.get(categoria) ?? 0) + area);
    }
  }
  return [...totals.entries()]
    .map(([categoria, area_ha]) => ({ categoria, area_ha }))
    .sort((a, b) => b.area_ha - a.area_ha)
    .slice(0, 6);
}

/** Agrega la serie 2001-2025 de un departamento (dado por /mapa/stats, que
 * delega en DynamoDB) en un solo total + top-6 por categoría, para los 4
 * paneles del holograma. Un solo fetch por selección (no debounce — no
 * dispara en cada tecleo, solo al hacer clic en una región). */
export function useDepartamentoDetail(region: SelectedRegion | null) {
  const [data, setData] = useState<DepartamentoDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!region) {
      setData(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchStatsSerie(region.departamento, controller.signal)
      .then((items) => {
        const total_ha = items.reduce((s, it) => s + it.total_ha, 0);
        const eventos = items.reduce((s, it) => s + it.eventos, 0);
        setData({
          total_ha,
          eventos,
          clase: mergeBreakdown(items, "por_clase"),
          tenencia: mergeBreakdown(items, "por_tenencia"),
          leyenda: mergeBreakdown(items, "por_leyenda"),
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Error desconocido");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [region?.departamento]);

  return { data, loading, error };
}
