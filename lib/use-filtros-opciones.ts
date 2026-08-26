"use client";

import { useEffect, useState } from "react";
import { fetchFiltros, type FiltrosOpciones } from "./api";

const EMPTY: FiltrosOpciones = { clases: [], tenencias: [], leyendas: [], anio_min: 2001, anio_max: 2025 };

/** Opciones reales para los selects del sidebar -- se cargan una sola vez
 * (no dependen de ningun filtro activo, a diferencia de la cascada
 * departamento->provincia->distrito de v1, que no existe en este proyecto). */
export function useFiltrosOpciones() {
  const [options, setOptions] = useState<FiltrosOpciones>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchFiltros(controller.signal)
      .then(setOptions)
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  return { options, loading, error };
}
