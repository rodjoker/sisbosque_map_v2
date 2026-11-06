"use client";

import { useEffect, useState } from "react";
import { fetchDemoInfo } from "@/lib/api";

/** "PUNO" -> "Puno", "MADRE DE DIOS" -> "Madre De Dios" (solo para mostrar). */
function titulo(nombre: string) {
  return nombre.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/**
 * Franja informativa de la versión demo: lista las regiones con datos
 * cargados. Solo se muestra si el backend responde demo=true; si el endpoint
 * falla o no existe (backend normal/antiguo) no renderiza nada.
 */
export function DemoBanner() {
  const [regiones, setRegiones] = useState<string[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchDemoInfo(controller.signal)
      .then((info) => setRegiones(info.demo ? info.departamentos : null))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!regiones || regiones.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-300/20 bg-amber-300/10 px-5 py-1.5 text-[11px] text-amber-100/90">
      <span className="font-semibold uppercase tracking-wide text-amber-300">Versión demo</span>
      <span className="text-white/70">Regiones activas:</span>
      <span className="flex flex-wrap gap-1.5">
        {regiones.map((r) => (
          <span key={r} className="rounded-full border border-amber-300/40 px-2 py-0.5 font-medium text-amber-200">
            {titulo(r)}
          </span>
        ))}
      </span>
      <span className="text-white/50">· La versión completa incluye los 15 departamentos amazónicos.</span>
    </div>
  );
}
