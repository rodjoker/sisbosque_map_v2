"use client";

import { useState } from "react";
import { useScene3D } from "@/lib/scene3d-context";
import { ComparadorPanel } from "@/components/comparar/comparar-panel";

export function TopBar() {
  const { is3DActive, toggle3D } = useScene3D();
  const [showComparador, setShowComparador] = useState(false);

  return (
    <header className="flex items-center justify-between border-b border-white/10 bg-black/40 px-5 py-3">
      <div>
        <div className="text-sm font-semibold tracking-wide text-white">SISBOSQUE — Mapa interactivo</div>
        <div className="text-[11px] text-white/50">Deforestación amazónica 2001–2025 · datos reales</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowComparador(true)}
          className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/40"
        >
          Comparar años
        </button>
        <button
          type="button"
          onClick={toggle3D}
          className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
            is3DActive
              ? "border-cyan-300 bg-cyan-300/10 text-cyan-300"
              : "border-white/20 text-white/70 hover:border-white/40"
          }`}
        >
          {is3DActive ? "● 3D activo · clic en un departamento" : "Activar 3D"}
        </button>
      </div>
      {showComparador && <ComparadorPanel onClose={() => setShowComparador(false)} />}
    </header>
  );
}
