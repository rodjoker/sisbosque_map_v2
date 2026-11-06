"use client";

import { useEffect, useState } from "react";
import { fetchCapasReferencia, type CapaReferenciaTipo } from "./api";

/** El comentario original decía "se pide una sola vez", pero cada hook
 * instanciaba su propio fetch -- Sidebar y MapPanel montan a la vez y
 * disparaban 2 requests reales a /mapa/capas en cada carga (confirmado, no
 * es solo doble-invocación de StrictMode). Promise cacheada a nivel de
 * módulo: el segundo consumidor reusa el mismo fetch en vuelo en vez de
 * disparar uno nuevo. No se aborta al desmontar un consumidor -- otro puede
 * seguir esperando el mismo resultado compartido. */
let cachedPromise: Promise<CapaReferenciaTipo[]> | null = null;

function getCapasReferencia(): Promise<CapaReferenciaTipo[]> {
  if (!cachedPromise) {
    cachedPromise = fetchCapasReferencia().catch((err: unknown) => {
      cachedPromise = null; // permite reintentar en el próximo consumidor si falló
      throw err;
    });
  }
  return cachedPromise;
}

export function useCapasReferencia() {
  const [capas, setCapas] = useState<CapaReferenciaTipo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCapasReferencia()
      .then((data) => {
        if (!cancelled) setCapas(data);
      })
      .catch((err: unknown) => {
        if (!cancelled && err instanceof Error) console.error(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { capas, loading };
}
