export type ColorMode = "total_ha" | "clase" | "tenencia" | "leyenda_mb" | "bpp";

export const COLOR_MODES: { id: ColorMode; label: string; dot: string }[] = [
  { id: "total_ha", label: "Intensidad total", dot: "#8cc63f" },
  { id: "clase", label: "Clase", dot: "#e34f37" },
  { id: "tenencia", label: "Tenencia", dot: "#1251a0" },
  { id: "leyenda_mb", label: "Cobertura", dot: "#d9a441" },
  { id: "bpp", label: "BPP", dot: "#b185db" },
];

// Paleta para modos categóricos (Clase, Tenencia, Cobertura) — se asigna en
// orden a `categorias` tal como llegan del backend, mismo patrón que v1
// (forntend_sisbosque_etl/lib/color-scale.ts).
const CATEGORY_PALETTE = ["#52b788", "#e63946", "#f4a261", "#48cae4", "#f8c537", "#b185db", "#ff8fab", "#6c757d"];

export function paletteForCategorias(categorias: string[]): Map<string, string> {
  return new Map(categorias.map((cat, i) => [cat, CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]]));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpColor(hexA: string, hexB: string, t: number): string {
  const a = [1, 3, 5].map((i) => parseInt(hexA.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(hexB.slice(i, i + 2), 16));
  const rgb = a.map((v, i) => Math.round(lerp(v, b[i], t)));
  return `rgb(${rgb.join(",")})`;
}

/** Verde casi negro -> verde completo (sqrt, piso en t=0.1), para "Intensidad total". */
export function colorForTotal(value: number, max: number): string {
  if (max <= 0) return "#0a1410";
  const t = Math.max(0.1, Math.sqrt(value / max));
  return lerpColor("#0a1410", "#8cc63f", Math.min(1, t));
}

/** Verde tenue -> morado intenso, para el modo "BPP" (% del área en BPP). */
export function colorForPct(pct: number): string {
  if (pct <= 0) return "#0a1410";
  return lerpColor("#0a1410", "#b185db", Math.min(1, pct));
}
