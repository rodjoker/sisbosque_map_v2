"use client";

import { useCallback, useRef } from "react";
import { useScene3D, type SelectedRegion, EXIT_DURATION_MS } from "@/lib/scene3d-context";
import { useDepartamentoDetail, type BreakdownEntry } from "@/lib/use-departamento-detail";
import { RegionScene3D, type FrameInfo } from "./region-scene-3d";

const PANELS = [
  { id: "intensidad", label: "Intensidad total", color: "#8cc63f" },
  { id: "clase", label: "Clase", color: "#e34f37" },
  { id: "tenencia", label: "Tenencia", color: "#1251a0" },
  { id: "leyenda", label: "Cobertura", color: "#d9a441" },
] as const;

function formatHa(v: number) {
  return `${v.toLocaleString("es-PE", { maximumFractionDigits: 1 })} ha`;
}

function BreakdownList({ items }: { items: BreakdownEntry[] }) {
  if (items.length === 0) return <span className="text-white/50">Sin datos</span>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((it) => (
        <li key={it.categoria} className="flex items-center justify-between gap-3">
          <span className="truncate text-white/90">{it.categoria}</span>
          <span className="shrink-0 font-mono text-[11px] text-white/70">{formatHa(it.area_ha)}</span>
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
}: {
  color: string;
  label: string;
  loading: boolean;
  error: string | null;
  children: React.ReactNode;
  extraHeader?: React.ReactNode;
  isClosing: boolean;
}) {
  return (
    <div
      className={`${isClosing ? "hologram-panel-exit" : "hologram-panel-enter"} pointer-events-auto flex w-52 flex-col gap-1.5 rounded-md border bg-black/75 p-3 text-xs shadow-[0_0_16px_rgba(0,0,0,0.4)] backdrop-blur-md`}
      style={{ borderColor: `${color}66`, animationDuration: isClosing ? `${EXIT_DURATION_MS}ms` : undefined }}
    >
      {extraHeader}
      <div className="font-mono text-[9px] font-semibold tracking-widest uppercase" style={{ color }}>
        {label}
      </div>
      {loading && <span className="text-white/50">Cargando…</span>}
      {error && <span className="text-red-400">{error}</span>}
      {!loading && !error && children}
    </div>
  );
}

/**
 * Escena 3D (RegionScene3D) + 4 paneles holograma, uno fijo en cada esquina
 * del área del mapa — mismo patrón ya validado en la demo v1
 * (forntend_sisbosque_etl): posiciones fijas en vez de orbitando la región,
 * para que nunca se superpongan entre sí ni con el título según el ángulo de
 * giro del bloque. Datos reales via /mapa/stats (DynamoDB), agregados por
 * useDepartamentoDetail.
 */
export function HologramOverlay() {
  const { selectedRegion, isClosing, clearSelection } = useScene3D();
  const { data, loading, error } = useDepartamentoDetail(selectedRegion);

  const containerRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lineRefs = useRef<(SVGLineElement | null)[]>([]);

  const handleFrame = useCallback((info: FrameInfo) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    panelRefs.current.forEach((panel, i) => {
      const line = lineRefs.current[i];
      if (!panel || !line) return;
      const r = panel.getBoundingClientRect();
      line.setAttribute("x1", String(info.center.x));
      line.setAttribute("y1", String(info.center.y));
      line.setAttribute("x2", String(r.left + r.width / 2 - containerRect.left));
      line.setAttribute("y2", String(r.top + r.height / 2 - containerRect.top));
    });
  }, []);

  if (!selectedRegion) return null;

  return (
    <div ref={containerRef} className="absolute inset-0 z-40">
      <div className="pointer-events-none absolute inset-0">
        <RegionScene3D geometry={selectedRegion.geometry} onFrame={handleFrame} closing={isClosing} />
      </div>

      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        {PANELS.map((panel, i) => (
          <line
            key={panel.id}
            ref={(el) => {
              lineRefs.current[i] = el;
            }}
            stroke={panel.color}
            strokeOpacity={0.3}
            strokeWidth={1}
          />
        ))}
      </svg>

      {/* Arriba-izquierda: nombre del departamento + Intensidad total */}
      <div
        ref={(el) => {
          panelRefs.current[0] = el;
        }}
        className="absolute top-4 left-4"
      >
        <PanelShell
          color={PANELS[0].color}
          label={PANELS[0].label}
          loading={loading}
          error={error}
          isClosing={isClosing}
          extraHeader={<RegionHeader region={selectedRegion} />}
        >
          {data && (
            <div>
              <div className="font-mono text-lg text-white">{formatHa(data.total_ha)}</div>
              <div className="text-[10px] text-white/60">{data.eventos.toLocaleString("es-PE")} eventos</div>
            </div>
          )}
        </PanelShell>
      </div>

      {/* Arriba-derecha: botón cerrar + Clase */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={clearSelection}
          aria-label="Cerrar vista 3D"
          className="pointer-events-auto rounded-sm border border-white/20 bg-black/70 px-2 py-1 font-mono text-[10px] tracking-wide text-white/60 backdrop-blur-md hover:border-cyan-300 hover:text-cyan-300"
        >
          ✕ Cerrar
        </button>
        <div
          ref={(el) => {
            panelRefs.current[1] = el;
          }}
        >
          <PanelShell color={PANELS[1].color} label={PANELS[1].label} loading={loading} error={error} isClosing={isClosing}>
            {data && <BreakdownList items={data.clase} />}
          </PanelShell>
        </div>
      </div>

      {/* Abajo-izquierda: Tenencia */}
      <div
        ref={(el) => {
          panelRefs.current[2] = el;
        }}
        className="absolute bottom-4 left-4"
      >
        <PanelShell color={PANELS[2].color} label={PANELS[2].label} loading={loading} error={error} isClosing={isClosing}>
          {data && <BreakdownList items={data.tenencia} />}
        </PanelShell>
      </div>

      {/* Abajo-derecha: Cobertura (LeyendaMB) */}
      <div
        ref={(el) => {
          panelRefs.current[3] = el;
        }}
        className="absolute right-4 bottom-4"
      >
        <PanelShell color={PANELS[3].color} label={PANELS[3].label} loading={loading} error={error} isClosing={isClosing}>
          {data && <BreakdownList items={data.leyenda} />}
        </PanelShell>
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
