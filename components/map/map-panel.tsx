"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useScene3D } from "@/lib/scene3d-context";
import { useFilters } from "@/lib/filters-context";
import {
  fetchResumenDistritos,
  fetchResumenDistritosPorCategoria,
  fetchBoundary,
  type ResumenDistritoCategoriaItem,
} from "@/lib/api";
import { colorForTotal, colorForPct, paletteForCategorias, COLOR_MODES } from "@/lib/color-scale";

const FETCH_DEBOUNCE_MS = 250;

const SOURCE_ID = "departamentos";
const LINE_LAYER = "departamentos-line";

const DIST_SOURCE_ID = "distritos";
const DIST_FILL_LAYER = "distritos-fill";
const DIST_LINE_LAYER = "distritos-line";

const PERU_CENTER: [number, number] = [-74.0, -8.0];
const PERU_ZOOM = 5.3;

type DistritoFeature = GeoJSON.Feature<GeoJSON.Geometry, { IDDIST: string; NOMBDEP: string; NOMBPROV: string; NOMBDIST: string }>;
type DepartamentoFeature = GeoJSON.Feature<GeoJSON.Geometry, { NOMBDEP: string }>;

type LegendState =
  | { kind: "gradient"; label: string; scale: "total" | "pct"; max: number }
  | { kind: "categorical"; label: string; items: { categoria: string; color: string }[] };

function formatHa(v: number) {
  return `${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })} ha`;
}

/** Opacidad de un distrito segun el filtro geografico activo -- sin
 * departamento elegido, se pinta todo el país (vista nacional por defecto);
 * con departamento elegido, solo ese departamento queda pintado y el resto
 * del país se apaga (no se "despinta" del todo para que el contorno siga
 * siendo reconocible). Provincia/distrito puntual, si estan elegidos,
 * resaltan mas todavia dentro del departamento ya seleccionado. */
function distritoOpacity(f: DistritoFeature, departamento: string, provincia: string, distrito: string): number {
  if (!departamento) return 0.85;
  if (f.properties.NOMBDEP !== departamento) return 0.06;
  if (distrito) return f.properties.NOMBDIST === distrito ? 0.95 : 0.3;
  if (provincia) return f.properties.NOMBPROV === provincia ? 0.9 : 0.5;
  return 0.85;
}

/** Bbox [[west,south],[east,north]] de una geometria Polygon/MultiPolygon --
 * suficiente para los limites departamentales (nunca GeometryCollection). */
function boundsOfGeometry(geom: GeoJSON.Geometry): [[number, number], [number, number]] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  function visit(coords: unknown): void {
    if (Array.isArray(coords) && typeof coords[0] === "number") {
      const [x, y] = coords as [number, number];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else if (Array.isArray(coords)) {
      coords.forEach(visit);
    }
  }
  visit("coordinates" in geom ? geom.coordinates : []);
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

function LegendBox({ legend }: { legend: LegendState }) {
  if (legend.kind === "gradient") {
    const stops = [0, 0.25, 0.5, 0.75, 1].map((t) =>
      legend.scale === "total" ? colorForTotal(t * legend.max, legend.max) : colorForPct(t)
    );
    return (
      <div className="pointer-events-none absolute bottom-3 left-3 w-48 rounded-md bg-black/70 p-2.5 text-[10px] text-white/80 backdrop-blur">
        <div className="mb-1.5 font-mono text-[9px] tracking-widest text-white/50 uppercase">{legend.label}</div>
        <div className="h-2 w-full rounded-full" style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }} />
        <div className="mt-1 flex justify-between font-mono text-white/60">
          <span>0</span>
          <span>{legend.scale === "total" ? formatHa(legend.max) : "100%"}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 w-52 rounded-md bg-black/70 p-2.5 text-[10px] text-white/80 backdrop-blur">
      <div className="mb-1.5 font-mono text-[9px] tracking-widest text-white/50 uppercase">{legend.label}</div>
      <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {legend.items.map((it) => (
          <li key={it.categoria} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: it.color }} />
            <span className="truncate">{it.categoria}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MapPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const { is3DActive, selectRegion, selectedRegion, isClosing } = useScene3D();
  const { departamento, provincia, distrito, apiFiltros, colorMode } = useFilters();
  const is3DActiveRef = useRef(is3DActive);
  const selectRegionRef = useRef(selectRegion);
  const distritosGeoRef = useRef<GeoJSON.FeatureCollection<GeoJSON.Geometry, DistritoFeature["properties"]> | null>(null);
  const departamentosGeoRef = useRef<GeoJSON.FeatureCollection<GeoJSON.Geometry, DepartamentoFeature["properties"]> | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [legend, setLegend] = useState<LegendState | null>(null);

  useEffect(() => {
    is3DActiveRef.current = is3DActive;
  }, [is3DActive]);
  useEffect(() => {
    selectRegionRef.current = selectRegion;
  }, [selectRegion]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Sin tiles raster de terceros a propósito: CARTO empezó a exigir API key
    // incluso en su tier "gratis" (watermark "API KEY REQUIRED" confirmado en
    // vivo), y este mapa no necesita contexto de calles/ciudades -- los
    // polígonos ya son el contenido geográfico real. Fondo plano oscuro en
    // vez de raster, evita cualquier dependencia externa.
    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#0a120e" },
          },
        ],
      },
      center: [-74.0, -8.0],
      zoom: 5.3,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", async () => {
      // Fuente de departamentos: ya no tiene relleno propio (el color de los
      // 5 modos de "Colorear mapa por" ahora es SIEMPRE a nivel distrito),
      // solo se usa para la línea de contorno regional -- en un color/grosor
      // bien distinto al de las líneas de distrito, para que se lea la
      // jerarquía (región gruesa y clara / distrito fino y oscuro) de un
      // vistazo, pedido explícito del cliente.
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: "/geo/departamentos.geojson",
        promoteId: "NOMBDEP",
      });
      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: SOURCE_ID,
        paint: { "line-color": "#48cae4", "line-opacity": 0.65, "line-width": 1.6 },
      });

      // Distritos: visibles desde el arranque, SIN filtro (los 15
      // departamentos a la vez) -- es la vista por defecto. Agregada
      // DESPUES de departamentos a propósito (MapLibre dibuja en orden de
      // agregado, así el relleno de distrito queda arriba del fondo, pero
      // la LINEA de departamento -- agregada despues todavia, ver abajo --
      // queda por encima de ambos).
      map.addSource(DIST_SOURCE_ID, {
        type: "geojson",
        data: "/geo/distritos.geojson",
        promoteId: "IDDIST",
      });
      map.addLayer(
        {
          id: DIST_FILL_LAYER,
          type: "fill",
          source: DIST_SOURCE_ID,
          paint: {
            "fill-color": ["coalesce", ["feature-state", "color"], "#0a1410"],
            "fill-opacity": ["coalesce", ["feature-state", "opacity"], 0.85],
            "fill-opacity-transition": { duration: 400 },
          },
        },
        LINE_LAYER
      );
      map.addLayer(
        {
          id: DIST_LINE_LAYER,
          type: "line",
          source: DIST_SOURCE_ID,
          paint: { "line-color": "#0a120e", "line-opacity": 0.6, "line-width": 0.6 },
        },
        LINE_LAYER
      );

      // Clic en un distrito (modo 3D activo) resuelve al DEPARTAMENTO al que
      // pertenece -- el holograma 3D sigue siendo a nivel departamento, no
      // se extruye un distrito individual (fuera de alcance de esta ronda).
      map.on("click", DIST_FILL_LAYER, (e) => {
        if (!is3DActiveRef.current) return;
        const distFeature = e.features?.[0] as MapGeoJSONFeature | undefined;
        const nombdep = distFeature?.properties?.NOMBDEP as string | undefined;
        if (!nombdep) return;
        const depFeature = departamentosGeoRef.current?.features.find((f) => f.properties.NOMBDEP === nombdep);
        if (depFeature) selectRegionRef.current(depFeature as unknown as MapGeoJSONFeature);
      });
      map.on("mouseenter", DIST_FILL_LAYER, () => {
        map.getCanvas().style.cursor = is3DActiveRef.current ? "pointer" : "";
      });
      map.on("mouseleave", DIST_FILL_LAYER, () => {
        map.getCanvas().style.cursor = "";
      });

      const geojsonRes = await fetch("/geo/departamentos.geojson");
      departamentosGeoRef.current = await geojsonRes.json();

      const distritosRes = await fetch("/geo/distritos.geojson");
      distritosGeoRef.current = await distritosRes.json();

      setMapLoaded(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Color del choropleta de distritos -- vista nacional por defecto (los 15
  // departamentos a la vez, via /mapa/resumen-distritos(-por-categoria) sin
  // `departamento`), o acotada a uno cuando el usuario elige un departamento
  // en el sidebar. Cubre los 5 modos de "Colorear mapa por": intensidad
  // total, categoria dominante por area (Clase/Tenencia/Cobertura) y % en
  // BPP -- todos a nivel distrito, mismo patron debounce+abort ya usado en
  // v1 (forntend_sisbosque_etl). El maximo/paleta para la escala de color se
  // calcula sobre el conjunto que se pidio (nacional o de 1 depto).
  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapRef.current;
    if (!map) return;
    const features = distritosGeoRef.current?.features ?? [];
    if (features.length === 0) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      const depto = departamento || undefined;

      const coloring: Promise<void> =
        colorMode === "total_ha"
          ? fetchResumenDistritos(depto, apiFiltros, controller.signal).then((items) => {
              const porDistrito = new Map(items.map((it) => [`${it.departamento}|${it.provincia}|${it.distrito}`, it.area_ha]));
              const max = Math.max(1, ...items.map((it) => it.area_ha));
              setLegend({ kind: "gradient", label: "Intensidad total", scale: "total", max });
              features.forEach((f) => {
                const key = `${f.properties.NOMBDEP}|${f.properties.NOMBPROV}|${f.properties.NOMBDIST}`;
                map.setFeatureState(
                  { source: DIST_SOURCE_ID, id: f.properties.IDDIST },
                  {
                    color: colorForTotal(porDistrito.get(key) ?? 0, max),
                    opacity: distritoOpacity(f, departamento, provincia, distrito),
                  }
                );
              });
            })
          : colorMode === "bpp"
            ? fetchResumenDistritosPorCategoria("bpp", depto, apiFiltros, controller.signal).then((items) => {
                setLegend({ kind: "gradient", label: "% del área en BPP", scale: "pct", max: 1 });
                const porDistrito = new Map<string, { si: number; total: number }>();
                for (const item of items) {
                  const key = `${item.departamento}|${item.provincia}|${item.distrito}`;
                  const acc = porDistrito.get(key) ?? { si: 0, total: 0 };
                  acc.total += item.area_ha;
                  if (item.categoria === "Sí") acc.si += item.area_ha;
                  porDistrito.set(key, acc);
                }
                features.forEach((f) => {
                  const key = `${f.properties.NOMBDEP}|${f.properties.NOMBPROV}|${f.properties.NOMBDIST}`;
                  const acc = porDistrito.get(key);
                  const pct = acc && acc.total > 0 ? acc.si / acc.total : 0;
                  map.setFeatureState(
                    { source: DIST_SOURCE_ID, id: f.properties.IDDIST },
                    { color: colorForPct(pct), opacity: distritoOpacity(f, departamento, provincia, distrito) }
                  );
                });
              })
            : fetchResumenDistritosPorCategoria(colorMode, depto, apiFiltros, controller.signal).then((items) => {
                const categorias = [...new Set(items.map((it) => it.categoria))].sort();
                const paleta = paletteForCategorias(categorias);
                setLegend({
                  kind: "categorical",
                  label: COLOR_MODES.find((m) => m.id === colorMode)?.label ?? colorMode,
                  items: categorias.map((categoria) => ({ categoria, color: paleta.get(categoria) ?? "#6b9e80" })),
                });
                const dominante = new Map<string, ResumenDistritoCategoriaItem>();
                for (const item of items) {
                  const key = `${item.departamento}|${item.provincia}|${item.distrito}`;
                  const actual = dominante.get(key);
                  if (!actual || item.area_ha > actual.area_ha) dominante.set(key, item);
                }
                features.forEach((f) => {
                  const key = `${f.properties.NOMBDEP}|${f.properties.NOMBPROV}|${f.properties.NOMBDIST}`;
                  const item = dominante.get(key);
                  map.setFeatureState(
                    { source: DIST_SOURCE_ID, id: f.properties.IDDIST },
                    {
                      color: item ? (paleta.get(item.categoria) ?? "#6b9e80") : "#0a1410",
                      opacity: distritoOpacity(f, departamento, provincia, distrito),
                    }
                  );
                });
              });

      coloring
        .catch((err: unknown) => {
          if (err instanceof Error && err.name !== "AbortError") console.error(err);
        })
        .finally(() => setLoading(false));
    }, FETCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [mapLoaded, colorMode, departamento, provincia, distrito, apiFiltros]);

  // Zoom de la camara segun departamento/provincia/distrito elegidos -- al
  // distrito puntual si esta elegido, si no a la provincia, si no al
  // departamento completo (via boundary del backend, unico caso que
  // necesita ese fetch -- provincia/distrito ya tienen su geometria en el
  // geojson de distritos cargado una sola vez al inicio). Sin nada elegido,
  // vuelve a la vista completa del país.
  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapRef.current;
    if (!map) return;

    if (!departamento) {
      map.flyTo({ center: PERU_CENTER, zoom: PERU_ZOOM, duration: 600 });
      return;
    }

    const features = distritosGeoRef.current?.features ?? [];
    if (distrito) {
      const feature = features.find((f) => f.properties.NOMBDEP === departamento && f.properties.NOMBDIST === distrito);
      if (feature) {
        map.fitBounds(boundsOfGeometry(feature.geometry), { padding: 80, duration: 600 });
        return;
      }
    }
    if (provincia) {
      const enProvincia = features.filter((f) => f.properties.NOMBDEP === departamento && f.properties.NOMBPROV === provincia);
      if (enProvincia.length > 0) {
        const bboxes = enProvincia.map((f) => boundsOfGeometry(f.geometry));
        const west = Math.min(...bboxes.map((b) => b[0][0]));
        const south = Math.min(...bboxes.map((b) => b[0][1]));
        const east = Math.max(...bboxes.map((b) => b[1][0]));
        const north = Math.max(...bboxes.map((b) => b[1][1]));
        map.fitBounds([[west, south], [east, north]], { padding: 60, duration: 600 });
        return;
      }
    }

    const controller = new AbortController();
    fetchBoundary(departamento, controller.signal)
      .then((feature) => {
        map.fitBounds(boundsOfGeometry(feature.geometry), { padding: 48, duration: 600 });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") console.error(err);
      });

    return () => controller.abort();
  }, [mapLoaded, departamento, provincia, distrito]);

  // Mientras el holograma 3D está activo, el mapa de fondo se atenúa/desenfoca
  // -- si no, el bloque translúcido (mismo tono verde que el choropleth) se
  // pierde visualmente contra el mapa nítido debajo. Mismo efecto ya validado
  // en la demo v1 (forntend_sisbosque_etl).
  const dimmed = selectedRegion !== null && !isClosing;
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={containerRef}
        className={`h-full w-full transition-all duration-700 ${
          dimmed ? "pointer-events-none scale-105 opacity-25 blur-sm" : ""
        }`}
      />
      {loading && (
        <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs text-white/70 backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8cc63f]" />
          Cargando datos…
        </div>
      )}
      {legend && <LegendBox legend={legend} />}
    </div>
  );
}
