"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import type { Feature, Geometry } from "geojson";

export type SelectedRegion = {
  departamento: string;
  geometry: Geometry;
};

/** Duración de la animación de salida (paneles + bloque 3D + mapa). Se
 * comparte vía import con data-core-3d.tsx y hologram-overlay.tsx para
 * que el desmontaje real (este timeout) y las animaciones CSS/Three.js
 * terminen sincronizadas. Mismo patrón que la demo v1 (forntend_sisbosque_etl). */
export const EXIT_DURATION_MS = 500;

type Scene3DContextValue = {
  is3DActive: boolean;
  toggle3D: () => void;
  selectedRegion: SelectedRegion | null;
  /** true mientras corre la animación de cierre — selectedRegion se
   * mantiene durante ese lapso a propósito, para no desmontar de golpe. */
  isClosing: boolean;
  selectRegion: (feature: Feature) => void;
  clearSelection: () => void;
};

const Scene3DContext = createContext<Scene3DContextValue | null>(null);

export function Scene3DProvider({ children }: { children: React.ReactNode }) {
  const [is3DActive, setIs3DActive] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<SelectedRegion | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelPendingClose() {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }

  function toggle3D() {
    setIs3DActive((v) => !v);
    cancelPendingClose();
    setIsClosing(false);
    setSelectedRegion(null);
  }

  function selectRegion(feature: Feature) {
    const props = feature.properties ?? {};
    if (!feature.geometry) return;
    cancelPendingClose();
    setIsClosing(false);
    setSelectedRegion({
      departamento: String(props.NOMBDEP ?? ""),
      geometry: feature.geometry,
    });
  }

  function clearSelection() {
    if (!selectedRegion || isClosing) return;
    setIsClosing(true);
    cancelPendingClose();
    closeTimeoutRef.current = setTimeout(() => {
      setSelectedRegion(null);
      setIsClosing(false);
      closeTimeoutRef.current = null;
    }, EXIT_DURATION_MS);
  }

  const value = useMemo<Scene3DContextValue>(
    () => ({ is3DActive, toggle3D, selectedRegion, isClosing, selectRegion, clearSelection }),
    [is3DActive, selectedRegion, isClosing]
  );

  return <Scene3DContext.Provider value={value}>{children}</Scene3DContext.Provider>;
}

export function useScene3D() {
  const ctx = useContext(Scene3DContext);
  if (!ctx) throw new Error("useScene3D debe usarse dentro de <Scene3DProvider>");
  return ctx;
}
