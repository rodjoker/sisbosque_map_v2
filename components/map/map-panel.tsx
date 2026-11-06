"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useScene3D } from "@/lib/scene3d-context";
import { useFilters } from "@/lib/filters-context";
import {
  fetchResumen,
  fetchResumenPorCategoria,
  fetchResumenDistritos,
  fetchResumenDistritosPorCategoria,
  fetchBoundary,
  fetchPoligonos,
  fetchPoligonoDetalle,
  fetchCapaReferencia,
  PoligonosLimitError,
  type ResumenCategoriaItem,
  type ResumenDistritoCategoriaItem,
  type PoligonoDetalle,
} from "@/lib/api";
import { useCapasReferencia } from "@/lib/use-capas-referencia";
import { colorForTotal, colorForPct, paletteForCategorias, COLOR_MODES } from "@/lib/color-scale";

const FETCH_DEBOUNCE_MS = 250;

const SOURCE_ID = "departamentos";
const LINE_LAYER = "departamentos-line";
const DEPT_FILL_LAYER = "departamentos-fill";

const DIST_SOURCE_ID = "distritos";
const DIST_FILL_LAYER = "distritos-fill";
const DIST_LINE_LAYER = "distritos-line";

const EVENTOS_SOURCE_ID = "eventos";
const EVENTOS_FILL_LAYER = "eventos-fill";
const EVENTOS_LINE_LAYER = "eventos-line";

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
  const { departamento, provincia, distrito, apiFiltros, colorMode, capasActivas } = useFilters();
  const { capas: capasCatalogo } = useCapasReferencia();
  const capaLayersCreatedRef = useRef<Set<string>>(new Set());
  const is3DActiveRef = useRef(is3DActive);
  const selectRegionRef = useRef(selectRegion);
  const distritosGeoRef = useRef<GeoJSON.FeatureCollection<GeoJSON.Geometry, DistritoFeature["properties"]> | null>(null);
  const departamentosGeoRef = useRef<GeoJSON.FeatureCollection<GeoJSON.Geometry, DepartamentoFeature["properties"]> | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  // Splash de la primera carga (frase + animación) -- se apaga apenas
  // `loading` pasa a false por primera vez y ya no vuelve a mostrarse en
  // cargas posteriores (cambios de filtro, etc.), esas siguen usando el
  // pill chico de siempre.
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  useEffect(() => {
    if (!loading) setFirstLoadDone(true);
  }, [loading]);
  const [legend, setLegend] = useState<LegendState | null>(null);
  // Los distritos (1,161 poligonos + su query nacional agregada, ~8.5s en
  // frio) son el costo real de la carga inicial lenta -- se difieren hasta
  // que el usuario los pide explicitamente (boton "Ver distritos") o elige
  // un departamento puntual (el drill-down a un solo depto ya era rapido,
  // no es lo que se queria arreglar). La vista nacional siempre a nivel
  // distrito fue un pedido explicito del cliente (ver memoria del proyecto)
  // -- este cambio lo relaja por performance; queda pendiente confirmar con
  // el cliente si el compromiso (regiones primero, distritos on-demand) le
  // sirve tal cual o prefiere otra solucion (ej. precalentar cache).
  const [distritosLoaded, setDistritosLoaded] = useState(false);
  const distritosLoadingRef = useRef(false);
  // El debounce de 250ms tiene sentido para no re-pedir en cada tecla de un
  // filtro que cambia rápido -- pero en el primer render no hay nada que
  // debouncear, y ese delay se sumaba directo al tiempo de la carga inicial.
  const deptoColoringFirstRunRef = useRef(true);
  // Geometria real de cada evento de deforestacion (Tarea 1 del plan de
  // "polígono individual" -- ver forma real de la tala, no el agregado por
  // distrito). Toggle manual (no automatico) porque el endpoint exige un
  // departamento elegido y puede superar el limite de seguridad de 20k del
  // backend si hay pocos filtros activos -- se le pide al usuario que lo
  // active a proposito, no se le muestra de entrada un error.
  const [eventosOn, setEventosOn] = useState(false);
  const [eventosLimite, setEventosLimite] = useState<{ total: number; limit: number } | null>(null);
  const [exportando, setExportando] = useState(false);
  // Ficha de detalle al hacer clic en un evento individual (Tarea 2).
  // `coords` es el punto exacto donde se hizo clic (e.lngLat) -- suficiente
  // para verificacion en campo sin tener que calcular el centroide del
  // polígono client-side.
  const [eventoFicha, setEventoFicha] = useState<{ id: number; coords: { lng: number; lat: number } } | null>(null);
  const [eventoDetalle, setEventoDetalle] = useState<PoligonoDetalle | null>(null);
  const [eventoDetalleError, setEventoDetalleError] = useState(false);

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

    // Arranca en paralelo con la carga interna de MapLibre (el "load" de
    // abajo) en vez de esperar a ese evento para recién ahí pedirlo -- son
    // el mismo archivo estático, no hay razón para serializarlos.
    const departamentosGeoPromise = fetch("/geo/departamentos.geojson").then((r) => r.json());

    map.on("load", async () => {
      // Fuente de departamentos: vista por defecto -- tiene su PROPIO
      // relleno (agregado a nivel departamento, 15 filas, rápido) y la
      // línea de contorno regional. Los distritos (1,161 polígonos + query
      // nacional pesada) ya NO se cargan aquí, ver loadDistritos() abajo.
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: "/geo/departamentos.geojson",
        promoteId: "NOMBDEP",
      });
      map.addLayer({
        id: DEPT_FILL_LAYER,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": ["coalesce", ["feature-state", "color"], "#0a1410"],
          "fill-opacity": 0.85,
          "fill-opacity-transition": { duration: 400 },
        },
      });
      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: SOURCE_ID,
        paint: { "line-color": "#48cae4", "line-opacity": 0.65, "line-width": 1.6 },
      });

      // Clic en un departamento (modo 3D, vista por defecto sin distritos
      // cargados todavía) selecciona directo -- el feature clicado YA es el
      // departamento, no hace falta resolverlo como en el caso de distrito.
      map.on("click", DEPT_FILL_LAYER, (e) => {
        if (!is3DActiveRef.current) return;
        const depFeature = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (depFeature) selectRegionRef.current(depFeature);
      });
      map.on("mouseenter", DEPT_FILL_LAYER, () => {
        map.getCanvas().style.cursor = is3DActiveRef.current ? "pointer" : "";
      });
      map.on("mouseleave", DEPT_FILL_LAYER, () => {
        map.getCanvas().style.cursor = "";
      });

      departamentosGeoRef.current = await departamentosGeoPromise;

      setMapLoaded(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Carga diferida de distritos: se llama desde el botón "Ver distritos" o
  // automáticamente al elegir un departamento puntual en el sidebar (ese
  // drill-down ya era rápido antes, seguir usando distrito ahí no perjudica
  // nada). Idempotente -- si ya existe la fuente, no hace nada.
  async function loadDistritos() {
    const map = mapRef.current;
    if (!map || distritosLoadingRef.current || map.getSource(DIST_SOURCE_ID)) return;
    distritosLoadingRef.current = true;

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
    // pertenece -- el holograma 3D sigue siendo a nivel departamento, no se
    // extruye un distrito individual (fuera de alcance de esta ronda).
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
    // El relleno departamental deja de mostrarse una vez hay distrito --
    // evita dos capas de color superpuestas (la línea de depto se conserva).
    map.setLayoutProperty(DEPT_FILL_LAYER, "visibility", "none");

    const distritosRes = await fetch("/geo/distritos.geojson");
    distritosGeoRef.current = await distritosRes.json();
    distritosLoadingRef.current = false;
    setDistritosLoaded(true);
  }

  useEffect(() => {
    if (mapLoaded && departamento && !distritosLoaded) {
      void loadDistritos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, departamento, distritosLoaded]);

  // Crea la fuente/capas de eventos individuales la primera vez que se
  // activa el toggle -- sin "before" a proposito: siempre se agrega AL
  // TOPE del stack de capas (por encima de distritos/departamentos, que ya
  // existen para cuando esto se usa, dado que requiere un departamento
  // elegido y ese caso ya carga distritos automaticamente).
  function ensureEventosLayer() {
    const map = mapRef.current;
    if (!map || map.getSource(EVENTOS_SOURCE_ID)) return;
    map.addSource(EVENTOS_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: EVENTOS_FILL_LAYER,
      type: "fill",
      source: EVENTOS_SOURCE_ID,
      paint: { "fill-color": "#ff6b4a", "fill-opacity": 0.75 },
    });
    map.addLayer({
      id: EVENTOS_LINE_LAYER,
      type: "line",
      source: EVENTOS_SOURCE_ID,
      paint: { "line-color": "#ffd9cc", "line-opacity": 0.9, "line-width": 0.5 },
    });

    // Clic en un evento individual abre su ficha (Tarea 2) -- a diferencia
    // de departamentos/distritos, esto NUNCA depende del modo 3D, siempre
    // esta activo mientras la capa de eventos este visible.
    map.on("click", EVENTOS_FILL_LAYER, (e) => {
      const f = e.features?.[0] as MapGeoJSONFeature | undefined;
      const id = f?.properties?.id as number | undefined;
      if (id === undefined) return;
      setEventoFicha({ id, coords: { lng: e.lngLat.lng, lat: e.lngLat.lat } });
    });
    map.on("mouseenter", EVENTOS_FILL_LAYER, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", EVENTOS_FILL_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });
  }

  // Sin departamento elegido el endpoint no aplica (exige uno) -- si el
  // usuario limpia el filtro con el toggle prendido, se apaga solo.
  useEffect(() => {
    if (!departamento && eventosOn) setEventosOn(false);
  }, [departamento, eventosOn]);

  // Fetch + render de los eventos reales -- mismo patron debounce+abort que
  // el resto del mapa. Un 413 (mas de 20k poligonos con el filtro activo)
  // NO se reintenta: se apaga la capa y se le pide al usuario mas filtros.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!eventosOn || !departamento) {
      setEventosLimite(null);
      if (map.getLayer(EVENTOS_FILL_LAYER)) {
        map.setLayoutProperty(EVENTOS_FILL_LAYER, "visibility", "none");
        map.setLayoutProperty(EVENTOS_LINE_LAYER, "visibility", "none");
      }
      return;
    }

    ensureEventosLayer();
    map.setLayoutProperty(EVENTOS_FILL_LAYER, "visibility", "visible");
    map.setLayoutProperty(EVENTOS_LINE_LAYER, "visibility", "visible");

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      fetchPoligonos(departamento, apiFiltros, controller.signal)
        .then((res) => {
          setEventosLimite(null);
          (map.getSource(EVENTOS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData({
            type: "FeatureCollection",
            features: res.features,
          });
        })
        .catch((err: unknown) => {
          if (err instanceof PoligonosLimitError) {
            setEventosLimite({ total: err.total, limit: err.limit });
            (map.getSource(EVENTOS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)?.setData({
              type: "FeatureCollection",
              features: [],
            });
            return;
          }
          if (err instanceof Error && err.name !== "AbortError") console.error(err);
        })
        .finally(() => setLoading(false));
    }, FETCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [mapLoaded, eventosOn, departamento, apiFiltros]);

  // Exportar a GeoJSON (Tarea 3) -- independiente del toggle "Ver eventos
  // reales", pide directo /mapa/poligonos con el filtro activo (mismo
  // limite de 20k que la visualizacion: exportar 2M+ features de un
  // departamento grande sin filtrar no es razonable ni para el navegador
  // ni para QGIS/ArcGIS del otro lado -- se le pide al usuario acotar el
  // filtro, mismo mensaje que ya usa la capa visual).
  async function exportarGeoJSON() {
    if (!departamento || exportando) return;
    setExportando(true);
    try {
      const res = await fetchPoligonos(departamento, apiFiltros);
      setEventosLimite(null);
      const blob = new Blob([JSON.stringify({ type: "FeatureCollection", features: res.features })], {
        type: "application/geo+json",
      });
      const url = URL.createObjectURL(blob);
      const fecha = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sisbosque-eventos-${departamento.toLowerCase()}-${fecha}.geojson`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof PoligonosLimitError) {
        setEventosLimite({ total: err.total, limit: err.limit });
      } else {
        console.error(err);
      }
    } finally {
      setExportando(false);
    }
  }

  // Se cierra la ficha si se apaga la capa de eventos (ya no tiene sentido
  // mostrar el detalle de un polígono que dejó de estar visible).
  useEffect(() => {
    if (!eventosOn) setEventoFicha(null);
  }, [eventosOn]);

  // Fetch del detalle completo (Tarea 2) -- /mapa/poligonos/{id} en vez de
  // reusar las properties ya cargadas en el feature: trae departamento y
  // codigou (catastro minero) que la lista no incluye, y es la fuente
  // "oficial" de la ficha en vez de inferirla del GeoJSON de la capa.
  useEffect(() => {
    if (!eventoFicha) {
      setEventoDetalle(null);
      setEventoDetalleError(false);
      return;
    }
    const controller = new AbortController();
    setEventoDetalle(null);
    setEventoDetalleError(false);
    fetchPoligonoDetalle(eventoFicha.id, controller.signal)
      .then(setEventoDetalle)
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setEventoDetalleError(true);
      });
    return () => controller.abort();
  }, [eventoFicha]);

  // Capas de referencia (ANP, comunidades, concesiones, etc.) -- a
  // diferencia de eventos/distritos NO dependen de apiFiltros (son limites
  // administrativos, no eventos de deforestacion filtrables por año/clase/
  // tenencia), solo del departamento (el endpoint lo exige) y de que tipos
  // esten activos en el sidebar. Se agregan SIN "before" a proposito -- van
  // siempre al tope del stack, por encima de distritos/eventos, para que se
  // note que son una capa aparte superpuesta (mismo criterio visual que se
  // le mostró al usuario en el mockup).
  function ensureCapaReferenciaLayer(tipo: string, color: string) {
    const map = mapRef.current;
    if (!map || map.getSource(`capa-${tipo}`)) return;
    map.addSource(`capa-${tipo}`, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: `capa-${tipo}-fill`,
      type: "fill",
      source: `capa-${tipo}`,
      paint: { "fill-color": color, "fill-opacity": 0.45 },
    });
    map.addLayer({
      id: `capa-${tipo}-line`,
      type: "line",
      source: `capa-${tipo}`,
      paint: { "line-color": color, "line-opacity": 0.9, "line-width": 1.2 },
    });
    capaLayersCreatedRef.current.add(tipo);
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Oculta las que ya existen pero dejaron de estar activas (o no hay
    // departamento) -- barato, no depende del fetch de abajo.
    for (const tipo of capaLayersCreatedRef.current) {
      const visible = !!departamento && capasActivas.includes(tipo);
      if (map.getLayer(`capa-${tipo}-fill`)) {
        map.setLayoutProperty(`capa-${tipo}-fill`, "visibility", visible ? "visible" : "none");
        map.setLayoutProperty(`capa-${tipo}-line`, "visibility", visible ? "visible" : "none");
      }
    }
    if (!departamento || capasActivas.length === 0) return;

    const colorPorTipo = new Map(capasCatalogo.map((c) => [c.tipo, c.color]));
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      capasActivas.forEach((tipo) => {
        const color = colorPorTipo.get(tipo);
        if (!color) return; // catalogo (colores) todavia no cargo
        ensureCapaReferenciaLayer(tipo, color);
        map.setLayoutProperty(`capa-${tipo}-fill`, "visibility", "visible");
        map.setLayoutProperty(`capa-${tipo}-line`, "visibility", "visible");
        fetchCapaReferencia(tipo, departamento, controller.signal)
          .then((res) => {
            (map.getSource(`capa-${tipo}`) as maplibregl.GeoJSONSource | undefined)?.setData({
              type: "FeatureCollection",
              features: res.features,
            });
          })
          .catch((err: unknown) => {
            if (err instanceof Error && err.name !== "AbortError") console.error(err);
          });
      });
    }, FETCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [mapLoaded, departamento, capasActivas, capasCatalogo]);

  // Color del choropleta a nivel DEPARTAMENTO -- vista por defecto, antes de
  // que se carguen los distritos (ver loadDistritos arriba). Mismos 5 modos
  // de "Colorear mapa por", pero agregados sobre solo 15 filas (rápido,
  // sin la query nacional de distritos que causaba la carga lenta inicial).
  useEffect(() => {
    if (!mapLoaded || distritosLoaded) return;
    const map = mapRef.current;
    if (!map) return;
    const features = departamentosGeoRef.current?.features ?? [];
    if (features.length === 0) return;

    const delay = deptoColoringFirstRunRef.current ? 0 : FETCH_DEBOUNCE_MS;
    deptoColoringFirstRunRef.current = false;

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);

      const coloring: Promise<void> =
        colorMode === "total_ha"
          ? fetchResumen(apiFiltros, controller.signal).then((items) => {
              const porDepto = new Map(items.map((it) => [it.departamento, it.area_ha]));
              const max = Math.max(1, ...items.map((it) => it.area_ha));
              setLegend({ kind: "gradient", label: "Intensidad total", scale: "total", max });
              features.forEach((f) => {
                map.setFeatureState(
                  { source: SOURCE_ID, id: f.properties.NOMBDEP },
                  { color: colorForTotal(porDepto.get(f.properties.NOMBDEP) ?? 0, max) }
                );
              });
            })
          : colorMode === "bpp"
            ? fetchResumenPorCategoria("bpp", apiFiltros, controller.signal).then((items) => {
                setLegend({ kind: "gradient", label: "% del área en BPP", scale: "pct", max: 1 });
                const porDepto = new Map<string, { si: number; total: number }>();
                for (const item of items) {
                  const acc = porDepto.get(item.departamento) ?? { si: 0, total: 0 };
                  acc.total += item.area_ha;
                  if (item.categoria === "Sí") acc.si += item.area_ha;
                  porDepto.set(item.departamento, acc);
                }
                features.forEach((f) => {
                  const acc = porDepto.get(f.properties.NOMBDEP);
                  const pct = acc && acc.total > 0 ? acc.si / acc.total : 0;
                  map.setFeatureState({ source: SOURCE_ID, id: f.properties.NOMBDEP }, { color: colorForPct(pct) });
                });
              })
            : fetchResumenPorCategoria(colorMode, apiFiltros, controller.signal).then((items) => {
                const categorias = [...new Set(items.map((it) => it.categoria))].sort();
                const paleta = paletteForCategorias(categorias);
                setLegend({
                  kind: "categorical",
                  label: COLOR_MODES.find((m) => m.id === colorMode)?.label ?? colorMode,
                  items: categorias.map((categoria) => ({ categoria, color: paleta.get(categoria) ?? "#6b9e80" })),
                });
                const dominante = new Map<string, ResumenCategoriaItem>();
                for (const item of items) {
                  const actual = dominante.get(item.departamento);
                  if (!actual || item.area_ha > actual.area_ha) dominante.set(item.departamento, item);
                }
                features.forEach((f) => {
                  const item = dominante.get(f.properties.NOMBDEP);
                  map.setFeatureState(
                    { source: SOURCE_ID, id: f.properties.NOMBDEP },
                    { color: item ? (paleta.get(item.categoria) ?? "#6b9e80") : "#0a1410" }
                  );
                });
              });

      coloring
        .catch((err: unknown) => {
          if (err instanceof Error && err.name !== "AbortError") console.error(err);
        })
        .finally(() => setLoading(false));
    }, delay);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [mapLoaded, distritosLoaded, colorMode, apiFiltros]);

  // Color del choropleta de distritos -- vista nacional (los 15
  // departamentos a la vez, via /mapa/resumen-distritos(-por-categoria) sin
  // `departamento`), o acotada a uno cuando el usuario elige un departamento
  // en el sidebar. Solo corre una vez cargados los distritos (botón "Ver
  // distritos" o drill-down a un departamento). Cubre los 5 modos de
  // "Colorear mapa por": intensidad total, categoria dominante por area
  // (Clase/Tenencia/Cobertura) y % en BPP -- todos a nivel distrito, mismo
  // patron debounce+abort ya usado en v1 (forntend_sisbosque_etl). El
  // maximo/paleta para la escala de color se calcula sobre el conjunto que
  // se pidio (nacional o de 1 depto).
  useEffect(() => {
    if (!mapLoaded || !distritosLoaded) return;
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
  }, [mapLoaded, distritosLoaded, colorMode, departamento, provincia, distrito, apiFiltros]);

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
      {!firstLoadDone && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-[#050807]">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8cc63f]" />
            <span className="font-mono text-[10px] tracking-[0.3em] text-white/40 uppercase">Sisbosque</span>
          </div>
          <p className="max-w-sm px-6 text-center text-lg font-medium text-white/90">
            {"Explora la deforestación amazónica con datos reales"
              .split(" ")
              .map((word, i) => (
                <span key={i} className="splash-word" style={{ animationDelay: `${i * 90}ms` }}>
                  {word}&nbsp;
                </span>
              ))}
          </p>
          <div className="h-px w-24 overflow-hidden rounded-full bg-white/10">
            <div className="splash-bar h-full w-1/3 rounded-full bg-[#8cc63f]" />
          </div>
        </div>
      )}
      {loading && firstLoadDone && (
        <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs text-white/70 backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8cc63f]" />
          Cargando datos…
        </div>
      )}
      {legend && <LegendBox legend={legend} />}
      {eventoFicha && (
        <div className="absolute top-24 right-3 w-64 rounded-md bg-black/80 p-3 text-[11px] text-white/80 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[9px] tracking-widest text-white/50 uppercase">Evento #{eventoFicha.id}</span>
            <button
              type="button"
              onClick={() => setEventoFicha(null)}
              className="text-white/50 hover:text-white"
              aria-label="Cerrar ficha"
            >
              ✕
            </button>
          </div>
          {eventoDetalleError && <div className="text-red-300">No se pudo cargar el detalle.</div>}
          {!eventoDetalleError && !eventoDetalle && <div className="text-white/50">Cargando…</div>}
          {eventoDetalle && (
            <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
              <dt className="text-white/50">Año</dt>
              <dd>{eventoDetalle.anio}</dd>
              <dt className="text-white/50">Tipo</dt>
              <dd>{eventoDetalle.tipo_perdida ?? "Sin dato"}</dd>
              <dt className="text-white/50">Clase</dt>
              <dd>{eventoDetalle.clase ?? "Sin dato"}</dd>
              <dt className="text-white/50">Tenencia</dt>
              <dd>{eventoDetalle.tenencia ?? "Sin dato"}</dd>
              <dt className="text-white/50">Cobertura</dt>
              <dd>{eventoDetalle.leyenda_mb ?? "Sin dato"}</dd>
              <dt className="text-white/50">BPP</dt>
              <dd>{eventoDetalle.bpp ? "Sí" : "No"}</dd>
              <dt className="text-white/50">Cultivos ilícitos</dt>
              <dd>{eventoDetalle.densilicit ? "Sí" : "No"}</dd>
              <dt className="text-white/50">Área</dt>
              <dd>{formatHa(eventoDetalle.area_ha)}</dd>
              <dt className="col-span-2 mt-1 text-white/50">Coordenadas (punto clicado)</dt>
              <dd className="col-span-2 font-mono">
                {eventoFicha.coords.lat.toFixed(5)}, {eventoFicha.coords.lng.toFixed(5)}
              </dd>
            </dl>
          )}
        </div>
      )}
      {eventosLimite && (
        <div className="pointer-events-none absolute top-12 left-3 max-w-xs rounded-md bg-black/70 px-3 py-2 text-[11px] text-white/80 backdrop-blur">
          {eventosLimite.total.toLocaleString("es-PE")} eventos superan el límite de{" "}
          {eventosLimite.limit.toLocaleString("es-PE")} — aplica más filtros (año, clase, tenencia, provincia,
          distrito) para verlos.
        </div>
      )}
      {mapLoaded && departamento && (
        <button
          type="button"
          onClick={() => void exportarGeoJSON()}
          disabled={exportando}
          className="absolute bottom-20 right-3 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white/80 backdrop-blur transition hover:bg-black/80 hover:text-white disabled:opacity-50"
        >
          {exportando ? "Exportando…" : "Exportar GeoJSON"}
        </button>
      )}
      {mapLoaded && departamento && (
        <button
          type="button"
          onClick={() => setEventosOn((v) => !v)}
          className={`absolute bottom-10 right-3 rounded-full px-3 py-1.5 text-xs backdrop-blur transition ${
            eventosOn
              ? "bg-[#ff6b4a]/90 text-black hover:bg-[#ff6b4a]"
              : "bg-black/70 text-white/80 hover:bg-black/80 hover:text-white"
          }`}
        >
          {eventosOn ? "Ocultar eventos reales" : "Ver eventos reales"}
        </button>
      )}
      {mapLoaded && !distritosLoaded && !departamento && (
        <button
          type="button"
          onClick={() => void loadDistritos()}
          className="absolute bottom-10 right-3 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white/80 backdrop-blur transition hover:bg-black/80 hover:text-white"
        >
          Ver distritos
        </button>
      )}
    </div>
  );
}
