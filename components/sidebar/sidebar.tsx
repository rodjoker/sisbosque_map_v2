"use client";

import { useState } from "react";
import { useFilters } from "@/lib/filters-context";
import { useFiltrosOpciones } from "@/lib/use-filtros-opciones";
import { useDepartamentos } from "@/lib/use-departamentos";
import { useProvincias } from "@/lib/use-provincias";
import { useDistritos } from "@/lib/use-distritos";
import { useScene3D } from "@/lib/scene3d-context";
import { COLOR_MODES } from "@/lib/color-scale";
import { useRegionResumen, type BreakdownEntry } from "@/lib/use-region-resumen";

function FilterSelect({
  label,
  placeholder,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[9px] tracking-widest text-white/50 uppercase">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white/90 disabled:opacity-40"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function TriToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] tracking-widest text-white/50 uppercase">{label}</span>
      <div className="flex overflow-hidden rounded-sm border border-white/15 font-mono text-[10px] uppercase">
        {([
          ["Todos", null],
          ["Sí", true],
          ["No", false],
        ] as const).map(([txt, v]) => (
          <button
            key={txt}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 px-2 py-1.5 transition-colors ${
              value === v ? "bg-[#8cc63f]/25 text-[#8cc63f]" : "text-white/50 hover:bg-white/5"
            }`}
          >
            {txt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActiveFiltersSummary() {
  const { departamento, provincia, distrito, clase, tenencia, leyenda, bpp, densilicit, anoMin, anoMax } = useFilters();
  const ubicacion = [departamento, provincia, distrito].filter(Boolean).join(" › ") || "Todo el Perú amazónico";
  const extras = [
    clase && `Clase: ${clase}`,
    tenencia && `Tenencia: ${tenencia}`,
    leyenda && `Cobertura: ${leyenda}`,
    bpp !== null && `BPP: ${bpp ? "Sí" : "No"}`,
    densilicit !== null && `Cultivos ilícitos: ${densilicit ? "Sí" : "No"}`,
  ].filter(Boolean) as string[];
  const periodo = anoMin === anoMax ? `Año ${anoMin}` : `${anoMin}–${anoMax}`;

  return (
    <div>
      <div className="mb-1 text-sm font-semibold text-white">{ubicacion}</div>
      <div className="text-[11px] leading-relaxed text-white/50">
        {extras.length > 0 ? extras.join(" · ") + " · " : ""}
        {periodo}
      </div>
    </div>
  );
}

function FiltersPanel() {
  const {
    departamento,
    provincia,
    distrito,
    clase,
    tenencia,
    leyenda,
    bpp,
    densilicit,
    setDepartamento,
    setProvincia,
    setDistrito,
    setClase,
    setTenencia,
    setLeyenda,
    setBpp,
    setDensilicit,
  } = useFilters();
  const { options, loading, error } = useFiltrosOpciones();
  const departamentos = useDepartamentos();
  const provincias = useProvincias(departamento);
  const distritos = useDistritos(departamento, provincia);

  if (error) {
    return <p className="text-xs text-red-400">No se pudo conectar con la API.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <FilterSelect
        label="Departamento (región)"
        placeholder="Todos"
        value={departamento}
        options={departamentos}
        onChange={setDepartamento}
      />
      <FilterSelect
        label="Provincia"
        placeholder="Todas"
        value={provincia}
        options={provincias}
        disabled={!departamento}
        onChange={setProvincia}
      />
      <FilterSelect
        label="Distrito"
        placeholder="Todos"
        value={distrito}
        options={distritos}
        disabled={!provincia}
        onChange={setDistrito}
      />
      <FilterSelect label="Clase" placeholder="Todas" value={clase} options={options.clases} disabled={loading} onChange={setClase} />
      <FilterSelect
        label="Tenencia / cobertura legal"
        placeholder="Todas"
        value={tenencia}
        options={options.tenencias}
        disabled={loading}
        onChange={setTenencia}
      />
      <FilterSelect
        label="Cobertura (ej. Minería, Bosque)"
        placeholder="Todas"
        value={leyenda}
        options={options.leyendas}
        disabled={loading}
        onChange={setLeyenda}
      />
      <TriToggle label="BPP" value={bpp} onChange={setBpp} />
      <TriToggle label="Cultivos ilícitos" value={densilicit} onChange={setDensilicit} />
    </div>
  );
}

function ColorModeSwitcher() {
  const { colorMode, setColorMode } = useFilters();
  return (
    <div className="flex flex-col gap-1.5">
      {COLOR_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => setColorMode(mode.id)}
          className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 text-left text-xs transition-colors ${
            colorMode === mode.id
              ? "border-white/25 bg-white/10 text-white"
              : "border-white/10 text-white/60 hover:bg-white/5"
          }`}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: mode.dot }} />
          {mode.label}
        </button>
      ))}
    </div>
  );
}

function formatHa(v: number) {
  return `${v.toLocaleString("es-PE", { maximumFractionDigits: 1 })} ha`;
}

function BreakdownList({ items, total }: { items: BreakdownEntry[]; total: number }) {
  if (items.length === 0) return <span className="text-[11px] text-white/40">Sin datos.</span>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((it) => (
        <li key={it.categoria} className="flex items-center justify-between gap-2 text-[11px]">
          <span className="truncate text-white/80">{it.categoria}</span>
          <span className="shrink-0 font-mono text-white/50">
            {formatHa(it.area_ha)} {total > 0 && <span className="text-white/30">({((it.area_ha / total) * 100).toFixed(0)}%)</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Datos reales (no solo colores) de la región elegida -- respeta los mismos
 * filtros del sidebar, solo aparece cuando hay un departamento elegido
 * (mismo criterio que el resaltado del mapa). */
function RegionResumenPanel() {
  const { departamento, provincia, distrito, apiFiltros } = useFilters();
  const { data, loading } = useRegionResumen(departamento, provincia, distrito, apiFiltros);

  if (!departamento) return null;

  return (
    <PanelSection label={`Datos de ${[departamento, provincia, distrito].filter(Boolean).join(" › ")}`}>
      {loading && !data && <p className="text-[11px] text-white/40">Cargando…</p>}
      {data && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-sm border border-white/10 bg-white/5 px-2 py-1.5">
              <div className="font-mono text-[9px] tracking-widest text-white/40 uppercase">Área total</div>
              <div className="font-mono text-sm text-white">{formatHa(data.totalHa)}</div>
            </div>
            <div className="rounded-sm border border-white/10 bg-white/5 px-2 py-1.5">
              <div className="font-mono text-[9px] tracking-widest text-white/40 uppercase">Eventos</div>
              <div className="font-mono text-sm text-white">{data.eventos.toLocaleString("es-PE")}</div>
            </div>
            <div className="col-span-2 rounded-sm border border-white/10 bg-white/5 px-2 py-1.5">
              <div className="font-mono text-[9px] tracking-widest text-white/40 uppercase">% en BPP</div>
              <div className="font-mono text-sm text-white">{(data.bppPct * 100).toFixed(1)}%</div>
            </div>
          </div>
          <div>
            <div className="mb-1 font-mono text-[9px] tracking-widest text-white/40 uppercase">Clase</div>
            <BreakdownList items={data.clase} total={data.totalHa} />
          </div>
          <div>
            <div className="mb-1 font-mono text-[9px] tracking-widest text-white/40 uppercase">Tenencia</div>
            <BreakdownList items={data.tenencia} total={data.totalHa} />
          </div>
          <div>
            <div className="mb-1 font-mono text-[9px] tracking-widest text-white/40 uppercase">Cobertura</div>
            <BreakdownList items={data.cobertura} total={data.totalHa} />
          </div>
        </div>
      )}
    </PanelSection>
  );
}

function PanelSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/10 px-4 py-3.5">
      <div className="mb-2 font-mono text-[9px] tracking-widest text-white/40 uppercase">{label}</div>
      {children}
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const { selectedRegion, clearSelection } = useScene3D();

  function handleSidebarInteraction() {
    if (selectedRegion) clearSelection();
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20 bg-black/60 sm:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <aside
        onClick={handleSidebarInteraction}
        className={`fixed inset-x-0 bottom-0 z-30 flex max-h-[80vh] w-full min-w-0 flex-col rounded-t-xl border-t border-white/10 bg-black/90 backdrop-blur-md transition-transform duration-300 ease-out sm:static sm:z-10 sm:max-h-none sm:w-72 sm:min-w-72 sm:translate-y-0 sm:rounded-none sm:border-t-0 sm:border-r sm:bg-black/60 sm:transition-none ${
          open ? "translate-y-0" : "translate-y-[calc(100%-44px)]"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex shrink-0 flex-col items-center gap-1.5 border-b border-white/10 py-2.5 sm:hidden"
        >
          <span className="h-1 w-9 rounded-full bg-white/20" />
          <span className="font-mono text-[9px] tracking-wider text-white/50 uppercase">
            {open ? "Ocultar filtros" : "Ver filtros"}
          </span>
        </button>

        <div className="flex-1 overflow-y-auto">
          <PanelSection label="Filtro activo">
            <ActiveFiltersSummary />
          </PanelSection>
          <PanelSection label="Filtros">
            <FiltersPanel />
          </PanelSection>
          <PanelSection label="Colorear mapa por">
            <ColorModeSwitcher />
          </PanelSection>
          <RegionResumenPanel />
        </div>
      </aside>
    </>
  );
}
