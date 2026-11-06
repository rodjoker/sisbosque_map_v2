"use client";

import { useEffect, useState } from "react";
import { useScene3D, type SelectedRegion, EXIT_DURATION_MS } from "@/lib/scene3d-context";
import { useDepartamentoDetail, type BreakdownEntry } from "@/lib/use-departamento-detail";
import { DataCoreScene3D } from "./data-core-3d";

type Dimension = "clase" | "tenencia" | "leyenda";

const DIMENSIONS: { id: Dimension; label: string; hint: string }[] = [
  // "Clase" categoriza por tamaño del evento (ha), no por tipo de pérdida --
  // mismo campo que usa el widget WordPress ya aprobado, que lo etiqueta
  // "Tamaño del evento". El hint aclara esto sin renombrar la pestaña (en
  // sidebar y "Colorear mapa por" esta dimensión también se llama "Clase").
  { id: "clase", label: "Clase", hint: "Tamaño del evento" },
  { id: "tenencia", label: "Tenencia", hint: "Tenencia legal del área" },
  { id: "leyenda", label: "Cobertura", hint: "Cobertura / uso del suelo" },
];

// mismo orden fijo que data-core-3d.tsx -- el swatch de cada fila del panel
// tiene que matchear el color de su barra.
const SLOT_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];

function formatHa(v: number) {
  return `${v.toLocaleString("es-PE", { maximumFractionDigits: 1 })} ha`;
}

/** % que representa cada categoría sobre la suma de las categorías
 * mostradas (no sobre el total del departamento) -- mismo criterio que la
 * demo aprobada, así las filas visibles siempre suman ~100%. */
function pctOf(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function BreakdownList({
  items,
  interactive = false,
  activeCategoria = null,
  onHover,
  onClick,
}: {
  items: BreakdownEntry[];
  interactive?: boolean;
  activeCategoria?: string | null;
  onHover?: (categoria: string | null) => void;
  onClick?: (categoria: string | null) => void;
}) {
  if (items.length === 0) return <span className="text-white/50">Sin datos</span>;
  const total = items.reduce((s, it) => s + it.area_ha, 0);
  return (
    <ul className="flex flex-col gap-1">
      {items.map((it, i) => (
        <li
          key={it.categoria}
          onMouseEnter={interactive ? () => onHover?.(it.categoria) : undefined}
          onMouseLeave={interactive ? () => onHover?.(null) : undefined}
          onClick={interactive ? () => onClick?.(it.categoria) : undefined}
          className={`flex items-center justify-between gap-3 rounded px-1 py-0.5 transition-colors ${interactive ? "pointer-events-auto cursor-pointer" : ""} ${
            interactive && activeCategoria === it.categoria ? "bg-white/10" : ""
          }`}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {interactive && (
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: SLOT_COLORS[i % SLOT_COLORS.length] }} />
            )}
            <span className="truncate text-white/90">{it.categoria}</span>
          </span>
          <span className="shrink-0 font-mono text-[11px] text-white/70">{pctOf(it.area_ha, total)}%</span>
        </li>
      ))}
    </ul>
  );
}

function PanelShell({
  color,
  label,
  loading,
  error,
  children,
  extraHeader,
  isClosing,
  linked = false,
}: {
  color: string;
  label: string;
  loading: boolean;
  error: string | null;
  children: React.ReactNode;
  extraHeader?: React.ReactNode;
  isClosing: boolean;
  linked?: boolean;
}) {
  return (
    <div
      className={`${isClosing ? "hologram-panel-exit" : "hologram-panel-enter"} pointer-events-auto flex w-full flex-col gap-1.5 rounded-md border bg-black/75 p-3 text-xs shadow-[0_0_16px_rgba(0,0,0,0.4)] backdrop-blur-md transition-[border-color,box-shadow] duration-200 lg:w-52`}
      style={{
        borderColor: linked ? "#48cae4" : `${color}66`,
        boxShadow: linked ? "0 0 0 1px rgba(72,202,228,0.35), 0 0 18px rgba(72,202,228,0.25)" : undefined,
        animationDuration: isClosing ? `${EXIT_DURATION_MS}ms` : undefined,
      }}
    >
      {extraHeader}
      {label && (
        <div className="font-mono text-[9px] font-semibold tracking-widest uppercase" style={{ color }}>
          {label}
        </div>
      )}
      {loading && <span className="text-white/50">Cargando…</span>}
      {error && <span className="text-red-400">{error}</span>}
      {!loading && !error && children}
    </div>
  );
}

/**
 * Núcleo de datos (DataCoreScene3D) + 2 paneles holograma fijos en las
 * esquinas del mapa. El panel de arriba-derecha alterna entre Clase,
 * Tenencia y Cobertura (pestañas) -- esa es la dimensión que alimenta las
 * barras del núcleo. Las tarjetas fijas de Tenencia y Cobertura se sacaron:
 * quedarían duplicando el mismo dato que ya se ve ahí arriba con solo tocar
 * la pestaña. Sin líneas conectoras al núcleo (existían cuando había un solo
 * bloque geométrico que "representaba" a los 4 paneles a la vez; ahora el
 * vínculo real es 1 a 1 -- barra <-> fila -- y se muestra resaltando ambas).
 */
export function HologramOverlay() {
  const { selectedRegion, isClosing, clearSelection } = useScene3D();
  const { data, loading, error } = useDepartamentoDetail(selectedRegion);

  const [dimension, setDimension] = useState<Dimension>("clase");
  const [hoveredCategoria, setHoveredCategoria] = useState<string | null>(null);
  const [pinnedCategoria, setPinnedCategoria] = useState<string | null>(null);
  const [tooltipPoint, setTooltipPoint] = useState<{ x: number; y: number } | null>(null);
  const activeCategoria = hoveredCategoria ?? pinnedCategoria;

  // al cambiar de dimensión o de región, el resaltado anterior ya no aplica
  useEffect(() => {
    setHoveredCategoria(null);
    setPinnedCategoria(null);
    setTooltipPoint(null);
  }, [dimension, selectedRegion?.departamento]);

  if (!selectedRegion) return null;

  const breakdown = data ? data[dimension] : [];
  const breakdownTotal = breakdown.reduce((s, it) => s + it.area_ha, 0);
  const tooltipEntry = tooltipPoint && hoveredCategoria ? breakdown.find((b) => b.categoria === hoveredCategoria) : null;

  function handleClickCategoria(categoria: string | null) {
    setPinnedCategoria((prev) => (categoria && prev === categoria ? null : categoria));
  }

  // hover que viene del núcleo 3D (trae la posición del cursor, para el tooltip)
  function handleCoreHover(categoria: string | null, point?: { x: number; y: number }) {
    setHoveredCategoria(categoria);
    setTooltipPoint(point ?? null);
  }

  // hover que viene de una fila del panel -- ya muestra el valor ahí mismo,
  // no hace falta el tooltip flotante
  function handleListHover(categoria: string | null) {
    setHoveredCategoria(categoria);
    setTooltipPoint(null);
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col lg:block">
      {/* Escenario del núcleo -- pointer-events-auto SOLO acá (no en toda la
          pantalla) para que el raycasting del hover/clic funcione sin dejar
          de poder tocar otro departamento del mapa fuera de esta zona. Se
          queda en el layout apilado (mobile) hasta lg (1024px) a propósito:
          el sidebar ya consume ~288px desde sm (640px), y dos tarjetas de
          208px lado a lado no entran en el área de mapa que queda en ese
          rango -- se pisaban en pantallas "tablet". En mobile ocupa una
          franja fija arriba; en lg+ es una caja central con margen hacia
          los bordes (donde viven los paneles). */}
      <div className="pointer-events-auto relative h-[38vh] w-full shrink-0 lg:absolute lg:inset-x-[16%] lg:inset-y-[12%] lg:h-auto lg:w-auto">
        <DataCoreScene3D
          geometry={selectedRegion.geometry}
          breakdown={breakdown}
          activeCategoria={activeCategoria}
          onHoverCategoria={handleCoreHover}
          onClickCategoria={handleClickCategoria}
          closing={isClosing}
        />
      </div>

      {tooltipEntry && tooltipPoint && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[120%] rounded-md border border-cyan-300 bg-black/95 px-3 py-2 text-xs whitespace-nowrap text-white shadow-[0_6px_20px_rgba(0,0,0,0.4)]"
          style={{ left: tooltipPoint.x, top: tooltipPoint.y }}
        >
          <span className="mb-0.5 block font-mono text-[10px] tracking-wide text-white/60 uppercase">{tooltipEntry.categoria}</span>
          <b className="font-mono">
            {pctOf(tooltipEntry.area_ha, breakdownTotal)}%<span className="mx-1.5 text-white/40">·</span>
            {formatHa(tooltipEntry.area_ha)}
          </b>
        </div>
      )}

      {/* Paneles: columna con scroll debajo del núcleo en mobile/tablet;
          esquinas fijas (comportamiento original) recién en lg+ --
          `lg:contents` saca este div del layout ahí, cada hijo se posiciona
          con su propio lg:absolute. */}
      <div className="pointer-events-none flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 lg:contents">
        {/* Intensidad total */}
        <div className="pointer-events-auto lg:absolute lg:top-4 lg:left-4">
          <PanelShell
            color="#8cc63f"
            label="Intensidad total"
            loading={loading}
            error={error}
            isClosing={isClosing}
            extraHeader={<RegionHeader region={selectedRegion} />}
          >
            {data && (
              <div className="flex flex-col gap-1.5">
                <div>
                  <div className="font-mono text-lg text-white">{formatHa(data.total_ha)}</div>
                  <div className="text-[10px] text-white/60">hectáreas</div>
                </div>
                <div>
                  <div className="font-mono text-lg text-white">{data.eventos.toLocaleString("es-PE")}</div>
                  <div className="text-[10px] text-white/60">eventos</div>
                </div>
              </div>
            )}
          </PanelShell>
        </div>

        {/* Botón cerrar + selector Clase/Tenencia (alimenta el núcleo) */}
        <div className="pointer-events-auto flex flex-col items-end gap-2 lg:absolute lg:top-4 lg:right-4">
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Cerrar vista 3D"
            className="rounded-sm border border-white/20 bg-black/70 px-2 py-1 font-mono text-[10px] tracking-wide text-white/60 backdrop-blur-md hover:border-cyan-300 hover:text-cyan-300"
          >
            ✕ Cerrar
          </button>
          <PanelShell
            color="#e34f37"
            label=""
            loading={loading}
            error={error}
            isClosing={isClosing}
            linked={activeCategoria !== null}
            extraHeader={
              <div className="mb-0.5 border-b border-white/15 pb-1.5">
                <div className="flex flex-wrap gap-1">
                  {DIMENSIONS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDimension(d.id)}
                      className={`rounded px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase transition-colors ${
                        dimension === d.id ? "bg-cyan-300 text-black" : "border border-white/15 text-white/50 hover:text-white/80"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-[9px] text-white/40 italic">{DIMENSIONS.find((d) => d.id === dimension)?.hint}</div>
              </div>
            }
          >
            {data && (
              <BreakdownList
                items={breakdown}
                interactive
                activeCategoria={activeCategoria}
                onHover={handleListHover}
                onClick={handleClickCategoria}
              />
            )}
          </PanelShell>
        </div>
      </div>
    </div>
  );
}

function RegionHeader({ region }: { region: SelectedRegion }) {
  return (
    <div className="mb-0.5 border-b border-white/15 pb-1.5">
      <div className="font-mono text-[9px] tracking-widest text-cyan-300 uppercase">Modo 3D</div>
      <div className="text-sm font-semibold text-white">{region.departamento}</div>
    </div>
  );
}
