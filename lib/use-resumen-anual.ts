"use client";

import { useEffect, useState } from "react";
import { fetchResumenAnual, type ResumenAnualItem } from "./api";

/** Serie 2001-2025 para el histograma del Timeline -- respeta clase/tenencia/
 * bpp/densilicit (a proposito NO recibe anioMin/anioMax: el chart siempre
 * muestra el rango completo como referencia de donde mover el selector). */
export function useResumenAnual(filtros: {
  departamento?: string;
  provincia?: string;
  distrito?: string;
  clase?: string;
  tenencia?: string;
  leyendaMb?: string;
  bpp?: boolean;
  densilicit?: boolean;
}) {
  const [data, setData] = useState<ResumenAnualItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetchResumenAnual(filtros, controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") console.error(err);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filtros.departamento,
    filtros.provincia,
    filtros.distrito,
    filtros.clase,
    filtros.tenencia,
    filtros.leyendaMb,
    filtros.bpp,
    filtros.densilicit,
  ]);

  return data;
}
