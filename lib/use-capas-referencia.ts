"use client";

import { useEffect, useState } from "react";
import { fetchCapasReferencia, type CapaReferenciaTipo } from "./api";

/** Catálogo de las 12 capas de referencia (metadata: color/total) -- se pide
 * una sola vez, tanto el Sidebar (para los toggles) como el MapPanel (para
 * saber qué color pintar cada capa) lo consumen. */
export function useCapasReferencia() {
  const [capas, setCapas] = useState<CapaReferenciaTipo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchCapasReferencia(controller.signal)
      .then(setCapas)
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  return { capas, loading };
}
