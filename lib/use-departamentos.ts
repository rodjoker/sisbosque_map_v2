"use client";

import { useEffect, useState } from "react";
import { fetchDepartamentos } from "./api";

/** Lista de los 15 departamentos amazónicos, para el select del sidebar. */
export function useDepartamentos() {
  const [departamentos, setDepartamentos] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetchDepartamentos(controller.signal)
      .then(setDepartamentos)
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") console.error(err);
      });
    return () => controller.abort();
  }, []);

  return departamentos;
}
