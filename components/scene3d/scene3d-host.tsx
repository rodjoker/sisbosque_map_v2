"use client";

import dynamic from "next/dynamic";
import { useScene3D } from "@/lib/scene3d-context";

// ssr:false solo es válido si el dynamic() vive dentro de un Client
// Component (este archivo) — HologramOverlay va a usar Three.js/WebGL en
// fases siguientes, que no existen en el servidor.
const HologramOverlay = dynamic(
  () => import("./hologram-overlay").then((m) => m.HologramOverlay),
  { ssr: false }
);

export function Scene3DHost() {
  const { selectedRegion } = useScene3D();
  if (!selectedRegion) return null;
  return <HologramOverlay />;
}
