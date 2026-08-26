"use client";

import { useEffect, useState } from "react";
import { fetchDistritos } from "./api";

/** Distritos reales del departamento+provincia elegidos (vacio hasta que
 * haya ambos). */
export function useDistritos(departamento: string, provincia: string) {
  const [distritos, setDistritos] = useState<string[]>([]);

  useEffect(() => {
    if (!departamento || !provincia) {
      setDistritos([]);
      return;
    }
    const controller = new AbortController();
    fetchDistritos(departamento, provincia, controller.signal)
      .then(setDistritos)
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") console.error(err);
      });
    return () => controller.abort();
  }, [departamento, provincia]);

  return distritos;
}
