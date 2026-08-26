"use client";

import { useEffect, useState } from "react";
import { fetchResumenDistritos, fetchResumenDistritosPorCategoria, type PoligonoFiltros } from "./api";

export type BreakdownEntry = { categoria: string; area_ha: number };

export type RegionResumen = {
  totalHa: number;
  eventos: number;
  clase: BreakdownEntry[];
  tenencia: BreakdownEntry[];
  cobertura: BreakdownEntry[];
  bppPct: number;
};

/** Datos reales (no solo colores) de la región elegida en el sidebar --
 * respeta los mismos filtros de datos que el mapa (clase/tenencia/cobertura/
 * bpp/año) y se acota a provincia/distrito si están elegidos, filtrando
 * client-side las mismas respuestas que ya usa el choropleta (misma cache
 * del backend, no pega de nuevo si ya se pidieron). Top 5 categorías por
 * dimensión, ordenadas por área. */
export function useRegionResumen(
  departamento: string,
  provincia: string,
  distrito: string,
  apiFiltros: PoligonoFiltros
) {
  const [data, setData] = useState<RegionResumen | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!departamento) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);

    function topCategorias(items: { provincia: string; distrito: string; categoria: string; area_ha: number }[]) {
      const matches = (it: { provincia: string; distrito: string }) =>
        (!provincia || it.provincia === provincia) && (!distrito || it.distrito === distrito);
      const porCategoria = new Map<string, number>();
      items.filter(matches).forEach((it) => porCategoria.set(it.categoria, (porCategoria.get(it.categoria) ?? 0) + it.area_ha));
      return [...porCategoria.entries()]
        .map(([categoria, area_ha]) => ({ categoria, area_ha }))
        .sort((a, b) => b.area_ha - a.area_ha)
        .slice(0, 5);
    }

    Promise.all([
      fetchResumenDistritos(departamento, apiFiltros, controller.signal),
      fetchResumenDistritosPorCategoria("clase", departamento, apiFiltros, controller.signal),
      fetchResumenDistritosPorCategoria("tenencia", departamento, apiFiltros, controller.signal),
      fetchResumenDistritosPorCategoria("leyenda_mb", departamento, apiFiltros, controller.signal),
      fetchResumenDistritosPorCategoria("bpp", departamento, apiFiltros, controller.signal),
    ])
      .then(([totales, clase, tenencia, cobertura, bpp]) => {
        const matches = (it: { provincia: string; distrito: string }) =>
          (!provincia || it.provincia === provincia) && (!distrito || it.distrito === distrito);
        const enScope = totales.filter(matches);
        const bppEnScope = bpp.filter(matches);
        const bppSi = bppEnScope.filter((it) => it.categoria === "Sí").reduce((s, it) => s + it.area_ha, 0);
        const bppTotal = bppEnScope.reduce((s, it) => s + it.area_ha, 0);

        setData({
          totalHa: enScope.reduce((s, it) => s + it.area_ha, 0),
          eventos: enScope.reduce((s, it) => s + it.eventos, 0),
          clase: topCategorias(clase),
          tenencia: topCategorias(tenencia),
          cobertura: topCategorias(cobertura),
          bppPct: bppTotal > 0 ? bppSi / bppTotal : 0,
        });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [departamento, provincia, distrito, apiFiltros]);

  return { data, loading };
}
