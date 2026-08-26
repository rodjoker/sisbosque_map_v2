"use client";

import { useEffect, useMemo, useState } from "react";
import { useFilters, ANO_MIN, ANO_MAX } from "@/lib/filters-context";
import { useResumenAnual } from "@/lib/use-resumen-anual";

const ANOS = Array.from({ length: ANO_MAX - ANO_MIN + 1 }, (_, i) => ANO_MIN + i);
const RANGO_INICIAL_ANCHO = 4;
const BAR_MIN_PX = 2;
const BAR_MAX_PX = 34;
const PLAY_INTERVAL_MS = 900;

export function Timeline() {
  const { anoMin, anoMax, setAnoRange, departamento, provincia, distrito, clase, tenencia, leyenda, bpp, densilicit } =
    useFilters();
  const [playing, setPlaying] = useState(false);
  const [modoRango, setModoRango] = useState(false);

  const chartFiltros = useMemo(
    () => ({
      departamento: departamento || undefined,
      provincia: provincia || undefined,
      distrito: distrito || undefined,
      clase: clase || undefined,
      tenencia: tenencia || undefined,
      leyendaMb: leyenda || undefined,
      bpp: bpp ?? undefined,
      densilicit: densilicit ?? undefined,
    }),
    [departamento, provincia, distrito, clase, tenencia, leyenda, bpp, densilicit]
  );
  const serie = useResumenAnual(chartFiltros);

  const alturas = useMemo(() => {
    const porAno = new Map(serie.map((r) => [r.anio, r.area_ha]));
    const maxHa = Math.max(1, ...[...porAno.values()]);
    return new Map(ANOS.map((y) => [y, BAR_MIN_PX + ((porAno.get(y) ?? 0) / maxHa) * (BAR_MAX_PX - BAR_MIN_PX)]));
  }, [serie]);

  useEffect(() => {
    if (!playing) return;
    const width = anoMax - anoMin;
    const interval = setInterval(() => {
      const nextMax = anoMax + 1;
      if (nextMax > ANO_MAX) {
        setAnoRange(ANO_MIN, ANO_MIN + width);
      } else {
        setAnoRange(anoMin + 1, nextMax);
      }
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, anoMin, anoMax]);

  function activarModoAno() {
    setModoRango(false);
    setAnoRange(anoMax, anoMax);
  }

  function activarModoRango() {
    setModoRango(true);
    if (anoMin === anoMax) {
      setAnoRange(Math.max(ANO_MIN, anoMax - RANGO_INICIAL_ANCHO), anoMax);
    }
  }

  const label = anoMin === anoMax ? `${anoMin}` : `${anoMin}–${anoMax}`;

  return (
    <div className="shrink-0 border-t border-white/10 bg-black/60 px-4 py-3 backdrop-blur-md sm:px-5">
      <div className="mb-2 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-white/15 bg-[#8cc63f]/10 text-xs text-[#8cc63f] transition-colors hover:bg-[#8cc63f]/25"
          aria-label={playing ? "Pausar" : "Reproducir"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <span className="min-w-[70px] font-mono text-lg font-bold text-white">{label}</span>

        <div className="flex shrink-0 overflow-hidden rounded-sm border border-white/15 font-mono text-[9px] tracking-wide uppercase">
          <button
            type="button"
            onClick={activarModoAno}
            className={`px-2 py-1 transition-colors ${!modoRango ? "bg-[#8cc63f]/25 text-[#8cc63f]" : "text-white/50 hover:bg-white/5"}`}
          >
            Año
          </button>
          <button
            type="button"
            onClick={activarModoRango}
            className={`px-2 py-1 transition-colors ${modoRango ? "bg-[#8cc63f]/25 text-[#8cc63f]" : "text-white/50 hover:bg-white/5"}`}
          >
            Rango
          </button>
        </div>

        <input
          type="range"
          min={ANO_MIN}
          max={ANO_MAX}
          value={anoMax}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (modoRango) setAnoRange(Math.min(anoMin, v), v);
            else setAnoRange(v, v);
          }}
          className="flex-1 accent-[#8cc63f]"
        />
      </div>
      <div className="flex h-9 items-end gap-[2px]">
        {ANOS.map((y) => {
          const active = y >= anoMin && y <= anoMax;
          return (
            <button
              key={y}
              type="button"
              onClick={() => setAnoRange(y, y)}
              title={String(y)}
              className={`min-h-[2px] flex-1 rounded-t-[1px] transition-colors ${
                active ? "bg-[#8cc63f]" : "bg-[#8cc63f]/25 hover:bg-[#8cc63f]/60"
              }`}
              style={{ height: `${alturas.get(y) ?? BAR_MIN_PX}px` }}
            />
          );
        })}
      </div>
    </div>
  );
}
