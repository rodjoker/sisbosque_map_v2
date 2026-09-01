"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { PoligonoFiltros } from "./api";
import type { ColorMode } from "./color-scale";

export const ANO_MIN = 2001;
export const ANO_MAX = 2025;

type FiltersState = {
  departamento: string;
  provincia: string;
  distrito: string;
  clase: string;
  tenencia: string;
  leyenda: string;
  bpp: boolean | null;
  densilicit: boolean | null;
  anoMin: number;
  anoMax: number;
  /** No es un filtro de datos: controla cómo se colorea el mapa. */
  colorMode: ColorMode;
  /** Tipos de capa de referencia activos (ANP, comunidad_nativa, etc.) --
   * NO se limpia al cambiar de departamento a propósito (mismo criterio que
   * `eventosOn` en MapPanel: el toggle se mantiene, solo se refetch para el
   * depto nuevo). Sí requiere `departamento` para tener sentido (el
   * endpoint lo exige), eso lo maneja MapPanel, no el estado en sí. */
  capasActivas: string[];
};

type FiltersContextValue = FiltersState & {
  /** Cascada: elegir departamento limpia provincia+distrito (ya no aplican). */
  setDepartamento: (v: string) => void;
  /** Cascada: elegir provincia limpia distrito. */
  setProvincia: (v: string) => void;
  setDistrito: (v: string) => void;
  setClase: (v: string) => void;
  setTenencia: (v: string) => void;
  setLeyenda: (v: string) => void;
  setBpp: (v: boolean | null) => void;
  setDensilicit: (v: boolean | null) => void;
  setColorMode: (v: ColorMode) => void;
  /** Fija ambos extremos a la vez (un año puntual: min=max, o un rango). */
  setAnoRange: (min: number, max: number) => void;
  toggleCapa: (tipo: string) => void;
  /** Forma que esperan /mapa/resumen y /mapa/poligonos -- a proposito SIN
   * `departamento`/`provincia`/`distrito`: /mapa/resumen siempre agrega los
   * 15 departamentos (es lo que colorea el choropleth completo); esos 3
   * filtros geograficos se aplican aparte, en el cliente (MapPanel resalta/
   * hace zoom por departamento, Timeline los pasa directo a
   * /mapa/resumen-anual, que sí los soporta). */
  apiFiltros: PoligonoFiltros;
};

const FiltersContext = createContext<FiltersContextValue | null>(null);

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [departamento, setDepartamentoRaw] = useState("");
  const [provincia, setProvinciaRaw] = useState("");
  const [distrito, setDistrito] = useState("");
  const [clase, setClase] = useState("");
  const [tenencia, setTenencia] = useState("");
  const [leyenda, setLeyenda] = useState("");
  const [bpp, setBpp] = useState<boolean | null>(null);
  const [densilicit, setDensilicit] = useState<boolean | null>(null);
  const [anoMin, setAnoMin] = useState(ANO_MIN);
  const [anoMax, setAnoMax] = useState(ANO_MAX);
  const [colorMode, setColorMode] = useState<ColorMode>("total_ha");
  const [capasActivas, setCapasActivas] = useState<string[]>([]);

  function toggleCapa(tipo: string) {
    setCapasActivas((prev) => (prev.includes(tipo) ? prev.filter((t) => t !== tipo) : [...prev, tipo]));
  }

  function setDepartamento(v: string) {
    setDepartamentoRaw(v);
    setProvinciaRaw("");
    setDistrito("");
  }

  function setProvincia(v: string) {
    setProvinciaRaw(v);
    setDistrito("");
  }

  function setAnoRange(min: number, max: number) {
    setAnoMin(Math.max(ANO_MIN, Math.min(min, max)));
    setAnoMax(Math.min(ANO_MAX, Math.max(min, max)));
  }

  const apiFiltros = useMemo<PoligonoFiltros>(
    () => ({
      anioMin: anoMin === ANO_MIN ? undefined : anoMin,
      anioMax: anoMax === ANO_MAX ? undefined : anoMax,
      clase: clase || undefined,
      tenencia: tenencia || undefined,
      leyendaMb: leyenda || undefined,
      bpp: bpp ?? undefined,
      densilicit: densilicit ?? undefined,
    }),
    [anoMin, anoMax, clase, tenencia, leyenda, bpp, densilicit]
  );

  const value: FiltersContextValue = {
    departamento,
    provincia,
    distrito,
    clase,
    tenencia,
    leyenda,
    bpp,
    densilicit,
    anoMin,
    anoMax,
    colorMode,
    capasActivas,
    setDepartamento,
    setProvincia,
    setDistrito,
    setClase,
    setTenencia,
    setLeyenda,
    setBpp,
    setDensilicit,
    setColorMode,
    setAnoRange,
    toggleCapa,
    apiFiltros,
  };

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters debe usarse dentro de <FiltersProvider>");
  return ctx;
}
