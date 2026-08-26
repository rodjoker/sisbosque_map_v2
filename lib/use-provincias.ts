"use client";

import { useEffect, useState } from "react";
import { fetchProvincias } from "./api";

/** Provincias reales del departamento elegido (vacio hasta que haya uno). */
export function useProvincias(departamento: string) {
  const [provincias, setProvincias] = useState<string[]>([]);

  useEffect(() => {
    if (!departamento) {
      setProvincias([]);
      return;
    }
    const controller = new AbortController();
    fetchProvincias(departamento, controller.signal)
      .then(setProvincias)
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") console.error(err);
      });
    return () => controller.abort();
  }, [departamento]);

  return provincias;
}
