"use client";

import { useMemo, useState } from "react";
import { fetchComparar, type CompararResponse } from "@/lib/api";
import { useDepartamentos } from "@/lib/use-departamentos";

const ANIOS = Array.from({ length: 2024 - 2001 + 1 }, (_, i) => 2001 + i);

function formatHa(v: number) {
  return `${v.toLocaleString("es-PE", { maximumFractionDigits: 1 })} ha`;
}

function BreakdownList({ items, anio }: { items: CompararResponse["cobertura_anio1"]; anio: number }) {
  const total = items.reduce((s, it) => s + it.area_ha, 0);
  const top = [...items].sort((a, b) => b.area_ha - a.area_ha).slice(0, 8);
  return (
    <div className="flex-1">
      <div className="mb-2 font-mono text-[9px] tracking-widest text-white/40 uppercase">Cobertura {anio}</div>
      <ul className="flex flex-col gap-1.5">
        {top.map((it) => (
          <li key={it.categoria} className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-white/85">{it.categoria}</span>
            <span className="shrink-0 font-mono text-white/60">
              {formatHa(it.area_ha)} {total > 0 && <span className="text-white/35">({((it.area_ha / total) * 100).toFixed(1)}%)</span>}
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-white/40">Sin datos para este año.</li>}
      </ul>
    </div>
  );
}

function TransicionSection({ data }: { data: CompararResponse }) {
  const { sinCambio, conCambio, top } = useMemo(() => {
    let sinCambio = 0;
    let conCambio = 0;
    const cambios = [];
    for (const t of data.transicion) {
      if (t.categoria_anio1 === t.categoria_anio2) sinCambio += t.area_ha;
      else {
        conCambio += t.area_ha;
        cambios.push(t);
      }
    }
    cambios.sort((a, b) => b.area_ha - a.area_ha);
    return { sinCambio, conCambio, top: cambios.slice(0, 10) };
  }, [data]);

  const total = sinCambio + conCambio;

  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <div className="mb-2 font-mono text-[9px] tracking-widest text-white/40 uppercase">
        Cambios de cobertura {data.anio1} → {data.anio2}
      </div>
      <div className="mb-3 flex gap-4 text-xs">
        <span className="text-white/70">
          <span className="font-mono text-white">{formatHa(conCambio)}</span> con cambio
          {total > 0 && <span className="text-white/40"> ({((conCambio / total) * 100).toFixed(1)}%)</span>}
        </span>
        <span className="text-white/50">
          <span className="font-mono">{formatHa(sinCambio)}</span> sin cambio
        </span>
      </div>
      {top.length === 0 ? (
        <p className="text-xs text-white/40">No hay transiciones de cobertura registradas para este par de años.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {top.map((t, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-white/85">
                {t.categoria_anio1} <span className="text-[#8cc63f]">→</span> {t.categoria_anio2}
              </span>
              <span className="shrink-0 font-mono text-white/60">
                {formatHa(t.area_ha)} · {t.eventos.toLocaleString("es-PE")} eventos
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ComparadorPanel({ onClose }: { onClose: () => void }) {
  const departamentos = useDepartamentos();
  const [departamento, setDepartamento] = useState("");
  const [anio1, setAnio1] = useState(2010);
  const [anio2, setAnio2] = useState(2024);
  const [data, setData] = useState<CompararResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleComparar() {
    if (!departamento) return;
    if (anio1 === anio2) {
      setError("Elegí dos años distintos.");
      return;
    }
    setLoading(true);
    setError(null);
    fetchComparar(departamento, anio1, anio2)
      .then(setData)
      .catch(() => setError("No se pudo obtener la comparación."))
      .finally(() => setLoading(false));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-y-auto rounded-lg border border-white/15 bg-black/90 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Comparación multitemporal</h2>
          <button type="button" onClick={onClose} className="text-xs text-white/50 hover:text-white">
            ✕ Cerrar
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[9px] tracking-widest text-white/50 uppercase">Departamento</span>
            <select
              value={departamento}
              onChange={(e) => setDepartamento(e.target.value)}
              className="rounded-sm border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white/90"
            >
              <option value="">Elegí uno</option>
              {departamentos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[9px] tracking-widest text-white/50 uppercase">Año 1</span>
            <select
              value={anio1}
              onChange={(e) => setAnio1(Number(e.target.value))}
              className="rounded-sm border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white/90"
            >
              {ANIOS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[9px] tracking-widest text-white/50 uppercase">Año 2</span>
            <select
              value={anio2}
              onChange={(e) => setAnio2(Number(e.target.value))}
              className="rounded-sm border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white/90"
            >
              {ANIOS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleComparar}
            disabled={!departamento || loading}
            className="rounded-sm border border-[#8cc63f]/40 bg-[#8cc63f]/15 px-3 py-1.5 text-xs text-[#8cc63f] transition-colors hover:bg-[#8cc63f]/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Comparando…" : "Comparar"}
          </button>
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        {data && (
          <>
            <div className="mt-5 flex gap-6">
              <BreakdownList items={data.cobertura_anio1} anio={data.anio1} />
              <BreakdownList items={data.cobertura_anio2} anio={data.anio2} />
            </div>
            <TransicionSection data={data} />
          </>
        )}

        {!data && !loading && !error && (
          <p className="mt-5 text-xs text-white/40">
            Elegí un departamento y dos años, y compará cómo cambió la cobertura del suelo entre ambos.
          </p>
        )}
      </div>
    </div>
  );
}
