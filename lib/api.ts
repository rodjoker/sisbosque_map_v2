const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8010";

export type StatsItem = {
  pk: string;
  sk: string;
  anio: number;
  total_ha: number;
  eventos: number;
  bpp_ha: number;
  cultivos_ilicitos_ha: number;
  mineria_ha: number;
  departamento?: string | null;
  por_clase?: Record<string, number> | null;
  por_tenencia?: Record<string, number> | null;
  por_leyenda?: Record<string, number> | null;
};

export async function fetchDepartamentos(signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${API_BASE}/mapa/departamentos`, { signal });
  if (!res.ok) throw new Error(`GET /mapa/departamentos -> ${res.status}`);
  return res.json();
}

/** Serie completa (todos los años) de un departamento — /mapa/stats sin
 * `anio` delega en stats_service.get_departamento_serie (DynamoDB). */
export async function fetchStatsSerie(departamento: string, signal?: AbortSignal): Promise<StatsItem[]> {
  const res = await fetch(`${API_BASE}/mapa/stats?departamento=${encodeURIComponent(departamento)}`, { signal });
  if (!res.ok) throw new Error(`GET /mapa/stats -> ${res.status}`);
  return res.json();
}

export type GeoJSONFeature = {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
};

export async function fetchBoundary(departamento: string, signal?: AbortSignal): Promise<GeoJSONFeature> {
  const res = await fetch(
    `${API_BASE}/mapa/departamentos/${encodeURIComponent(departamento)}/boundary`,
    { signal }
  );
  if (!res.ok) throw new Error(`GET boundary -> ${res.status}`);
  return res.json();
}

export async function fetchProvincias(departamento: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${API_BASE}/mapa/provincias?departamento=${encodeURIComponent(departamento)}`, { signal });
  if (!res.ok) throw new Error(`GET /mapa/provincias -> ${res.status}`);
  return res.json();
}

export async function fetchDistritos(departamento: string, provincia: string, signal?: AbortSignal): Promise<string[]> {
  const params = new URLSearchParams({ departamento, provincia });
  const res = await fetch(`${API_BASE}/mapa/distritos?${params}`, { signal });
  if (!res.ok) throw new Error(`GET /mapa/distritos -> ${res.status}`);
  return res.json();
}

export type PoligonoFiltros = {
  anioMin?: number;
  anioMax?: number;
  clase?: string;
  tenencia?: string;
  leyendaMb?: string;
  provincia?: string;
  distrito?: string;
  bpp?: boolean;
  densilicit?: boolean;
};

export function filtrosToParams(f: PoligonoFiltros): URLSearchParams {
  const p = new URLSearchParams();
  if (f.anioMin !== undefined) p.set("anio_min", String(f.anioMin));
  if (f.anioMax !== undefined) p.set("anio_max", String(f.anioMax));
  if (f.clase) p.set("clase", f.clase);
  if (f.tenencia) p.set("tenencia", f.tenencia);
  if (f.leyendaMb) p.set("leyenda_mb", f.leyendaMb);
  if (f.provincia) p.set("provincia", f.provincia);
  if (f.distrito) p.set("distrito", f.distrito);
  if (f.bpp !== undefined) p.set("bpp", String(f.bpp));
  if (f.densilicit !== undefined) p.set("densilicit", String(f.densilicit));
  return p;
}

export type FiltrosOpciones = {
  clases: string[];
  tenencias: string[];
  leyendas: string[];
  anio_min: number;
  anio_max: number;
};

export async function fetchFiltros(signal?: AbortSignal): Promise<FiltrosOpciones> {
  const res = await fetch(`${API_BASE}/mapa/filtros`, { signal });
  if (!res.ok) throw new Error(`GET /mapa/filtros -> ${res.status}`);
  return res.json();
}

export class PoligonosLimitError extends Error {
  constructor(
    public total: number,
    public limit: number
  ) {
    super(`${total} poligonos superan el limite de ${limit}`);
    this.name = "PoligonosLimitError";
  }
}

export type PoligonoEventoFeature = GeoJSONFeature & {
  properties: {
    id: number;
    anio: number;
    tipo_perdida: string | null;
    clase: string | null;
    tenencia: string | null;
    leyenda_mb: string | null;
    bpp: boolean;
    densilicit: boolean;
    area_ha: number;
  };
};

export type PoligonosResponse = { type: "FeatureCollection"; total: number; features: PoligonoEventoFeature[] };

/** Geometria real de cada evento de deforestacion (no el agregado por
 * distrito) -- siempre acotado a UN departamento (requerido por el backend)
 * y sujeto al limite de seguridad de 20k features: si el filtro activo trae
 * mas que eso, el backend responde 413 y hay que pedirle al usuario que
 * agregue mas filtros en vez de reintentar. */
export async function fetchPoligonos(
  departamento: string,
  filtros: PoligonoFiltros,
  signal?: AbortSignal
): Promise<PoligonosResponse> {
  const params = filtrosToParams(filtros);
  const res = await fetch(`${API_BASE}/mapa/poligonos?departamento=${encodeURIComponent(departamento)}&${params}`, { signal });
  if (res.status === 413) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    const match = body?.detail?.match(/^(\d+) poligonos.*limite (\d+)/);
    throw new PoligonosLimitError(match ? Number(match[1]) : 0, match ? Number(match[2]) : 20000);
  }
  if (!res.ok) throw new Error(`GET /mapa/poligonos -> ${res.status}`);
  return res.json();
}

export type PoligonoDetalle = {
  id: number;
  departamento: string;
  anio: number;
  tipo_perdida: string | null;
  clase: string | null;
  tenencia: string | null;
  leyenda_mb: string | null;
  bpp: boolean;
  densilicit: boolean;
  codigou: string | null;
  area_ha: number;
  trayectoria_id: number | null;
  geometry: GeoJSON.Geometry;
};

export async function fetchPoligonoDetalle(id: number, signal?: AbortSignal): Promise<PoligonoDetalle> {
  const res = await fetch(`${API_BASE}/mapa/poligonos/${id}`, { signal });
  if (!res.ok) throw new Error(`GET /mapa/poligonos/${id} -> ${res.status}`);
  return res.json();
}

export type CapaReferenciaTipo = { tipo: string; nombre: string; color: string; total: number };

/** Catálogo de las 12 capas de referencia (ANP, comunidades, concesiones,
 * etc.) -- solo metadata (color/total), sin geometría. */
export async function fetchCapasReferencia(signal?: AbortSignal): Promise<CapaReferenciaTipo[]> {
  const res = await fetch(`${API_BASE}/mapa/capas`, { signal });
  if (!res.ok) throw new Error(`GET /mapa/capas -> ${res.status}`);
  return res.json();
}

export type CapaReferenciaFeature = GeoJSONFeature & {
  properties: { id: number; tipo: string; nombre: string | null; atributos: Record<string, unknown>; area_ha: number | null };
};

export type CapaReferenciaResponse = { type: "FeatureCollection"; total: number; features: CapaReferenciaFeature[] };

/** Geometría real de una capa de referencia, acotada al departamento --
 * sin límite de seguridad (a diferencia de fetchPoligonos): la tabla
 * completa son ~75k filas, acotado a un depto el peor caso queda en unos
 * pocos miles. */
export async function fetchCapaReferencia(
  tipo: string,
  departamento: string,
  signal?: AbortSignal
): Promise<CapaReferenciaResponse> {
  const res = await fetch(`${API_BASE}/mapa/capas/${tipo}?departamento=${encodeURIComponent(departamento)}`, { signal });
  if (!res.ok) throw new Error(`GET /mapa/capas/${tipo} -> ${res.status}`);
  return res.json();
}

export type ResumenDepartamentoItem = { departamento: string; eventos: number; area_ha: number };

/** Total filtrado por departamento -- reemplaza al fetch por-departamento de
 * /mapa/stats (DynamoDB, sin clase/tenencia/bpp/densilicit): esto agrega
 * directo sobre PostGIS, respetando el filtro activo del sidebar. */
export async function fetchResumen(filtros: PoligonoFiltros, signal?: AbortSignal): Promise<ResumenDepartamentoItem[]> {
  const res = await fetch(`${API_BASE}/mapa/resumen?${filtrosToParams(filtros)}`, { signal });
  if (!res.ok) throw new Error(`GET /mapa/resumen -> ${res.status}`);
  return res.json();
}

export type ResumenDistritoItem = { departamento: string; provincia: string; distrito: string; eventos: number; area_ha: number };

/** Total filtrado por (departamento, provincia, distrito) -- sin `departamento`
 * devuelve los distritos de los 15 departamentos (vista nacional, la que se
 * ve por defecto); con `departamento` acota a uno solo. */
export async function fetchResumenDistritos(
  departamento: string | undefined,
  filtros: PoligonoFiltros,
  signal?: AbortSignal
): Promise<ResumenDistritoItem[]> {
  const params = filtrosToParams(filtros);
  if (departamento) params.set("departamento", departamento);
  const res = await fetch(`${API_BASE}/mapa/resumen-distritos?${params}`, { signal });
  if (!res.ok) throw new Error(`GET /mapa/resumen-distritos -> ${res.status}`);
  return res.json();
}

export type ResumenAnualItem = { anio: number; eventos: number; area_ha: number };

export async function fetchResumenAnual(
  filtros: Omit<PoligonoFiltros, "anioMin" | "anioMax"> & { departamento?: string },
  signal?: AbortSignal
): Promise<ResumenAnualItem[]> {
  const params = filtrosToParams(filtros);
  if (filtros.departamento) params.set("departamento", filtros.departamento);
  const res = await fetch(`${API_BASE}/mapa/resumen-anual?${params}`, { signal });
  if (!res.ok) throw new Error(`GET /mapa/resumen-anual -> ${res.status}`);
  return res.json();
}

export type ResumenCategoriaItem = { departamento: string; categoria: string; area_ha: number };

/** Total filtrado por (departamento, categoria) de una dimension -- para
 * colorear el mapa por Clase/Tenencia/Cobertura/BPP en vez de intensidad. */
export async function fetchResumenPorCategoria(
  dimension: "clase" | "tenencia" | "leyenda_mb" | "bpp",
  filtros: PoligonoFiltros,
  signal?: AbortSignal
): Promise<ResumenCategoriaItem[]> {
  const params = filtrosToParams(filtros);
  params.set("dimension", dimension);
  const res = await fetch(`${API_BASE}/mapa/resumen-por-categoria?${params}`, { signal });
  if (!res.ok) throw new Error(`GET /mapa/resumen-por-categoria -> ${res.status}`);
  return res.json();
}

export type ResumenDistritoCategoriaItem = {
  departamento: string;
  provincia: string;
  distrito: string;
  categoria: string;
  area_ha: number;
};

/** Igual que fetchResumenPorCategoria pero a nivel distrito -- sin
 * `departamento` devuelve los distritos de los 15 departamentos. */
export async function fetchResumenDistritosPorCategoria(
  dimension: "clase" | "tenencia" | "leyenda_mb" | "bpp",
  departamento: string | undefined,
  filtros: PoligonoFiltros,
  signal?: AbortSignal
): Promise<ResumenDistritoCategoriaItem[]> {
  const params = filtrosToParams(filtros);
  params.set("dimension", dimension);
  if (departamento) params.set("departamento", departamento);
  const res = await fetch(`${API_BASE}/mapa/resumen-distritos-por-categoria?${params}`, { signal });
  if (!res.ok) throw new Error(`GET /mapa/resumen-distritos-por-categoria -> ${res.status}`);
  return res.json();
}

export type CompararCoberturaItem = { cobertura_codigo: number | null; categoria: string; eventos: number; area_ha: number };
export type TransicionCoberturaItem = {
  cobertura_codigo_anio1: number | null;
  categoria_anio1: string;
  cobertura_codigo_anio2: number | null;
  categoria_anio2: string;
  eventos: number;
  area_ha: number;
};
export type CompararResponse = {
  departamento: string;
  anio1: number;
  anio2: number;
  cobertura_anio1: CompararCoberturaItem[];
  cobertura_anio2: CompararCoberturaItem[];
  transicion: TransicionCoberturaItem[];
};

/** Comparador multitemporal: cobertura de un departamento en 2 años puntuales
 * + la transición real (de qué categoría a qué categoría cambió cada área),
 * vía mapa.trayectoria_mbpe (2001-2024, no llega a 2025 todavía). */
export async function fetchComparar(
  departamento: string,
  anio1: number,
  anio2: number,
  signal?: AbortSignal
): Promise<CompararResponse> {
  const params = new URLSearchParams({ departamento, anio1: String(anio1), anio2: String(anio2) });
  const res = await fetch(`${API_BASE}/mapa/comparar?${params}`, { signal });
  if (!res.ok) throw new Error(`GET /mapa/comparar -> ${res.status}`);
  return res.json();
}
