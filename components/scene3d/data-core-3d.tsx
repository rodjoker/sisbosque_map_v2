"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Geometry } from "geojson";
import { buildRegionShapes } from "@/lib/geo-to-local";
import { EXIT_DURATION_MS } from "@/lib/scene3d-context";
import type { BreakdownEntry } from "@/lib/use-departamento-detail";

const TARGET_SIZE = 260;
const RING_RADIUS = 88;
const BAR_SIZE = 30;
const MAX_BAR_HEIGHT = 170;
const MAX_SLOTS = 6;
const FOOTPRINT_OPACITY = 0.08;
const ROTATION_SPEED = 0.0022;
const DAMP = 0.14;
const COLOR_DAMP = 0.16;

/** Orden categórico fijo, validado CVD-safe hasta 6 slots (script
 * scripts/validate_palette.js de la skill dataviz, superficie #070a08). Se
 * asigna por RANKING (posición en el breakdown ya ordenado desc por área),
 * no por identidad de categoría -- así el color "más alto" es siempre el
 * mismo tono sin importar si estamos viendo Clase o Tenencia. */
const SLOT_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];

function easeInCubic(t: number) {
  return t * t * t;
}

type BarSlot = {
  mesh: THREE.Mesh;
  material: THREE.MeshPhongMaterial;
  edgeMaterial: THREE.LineBasicMaterial;
  categoria: string | null;
  baseH: number;
  curH: number;
  targetColor: THREE.Color;
};

/**
 * Núcleo de datos: reemplaza el bloque holograma (geometría real del
 * distrito extruida) por un anillo de barras -- una por categoría del
 * breakdown activo (Clase o Tenencia) -- cuya altura y color codifican el
 * valor real. La huella de la región en el piso se conserva como ancla
 * geográfica (mismo patrón que antes), pero ya no hay bloque que "despega".
 */
export function DataCoreScene3D({
  geometry,
  breakdown,
  activeCategoria,
  onHoverCategoria,
  onClickCategoria,
  closing = false,
}: {
  geometry: Geometry;
  breakdown: BreakdownEntry[];
  activeCategoria: string | null;
  onHoverCategoria: (categoria: string | null, point?: { x: number; y: number }) => void;
  onClickCategoria: (categoria: string | null) => void;
  closing?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const applyBreakdownRef = useRef<((b: BreakdownEntry[]) => void) | null>(null);
  const activeRef = useRef(activeCategoria);
  const onHoverRef = useRef(onHoverCategoria);
  const onClickRef = useRef(onClickCategoria);
  const closingRef = useRef(closing);

  useEffect(() => {
    applyBreakdownRef.current?.(breakdown);
  }, [breakdown]);
  useEffect(() => {
    activeRef.current = activeCategoria;
  }, [activeCategoria]);
  useEffect(() => {
    onHoverRef.current = onHoverCategoria;
  }, [onHoverCategoria]);
  useEffect(() => {
    onClickRef.current = onClickCategoria;
  }, [onClickCategoria]);
  useEffect(() => {
    closingRef.current = closing;
  }, [closing]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { shapes } = buildRegionShapes(geometry, TARGET_SIZE);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.position.set(0, 230, 400);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x9fd8c0, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 0.6);
    key.position.set(120, 220, 160);
    scene.add(key);

    // Huella en el suelo -- misma proyección de la geometría real que el
    // bloque de antes usaba, ahora solo como ancla geográfica.
    let footprintMaterial: THREE.MeshBasicMaterial | null = null;
    if (shapes.length > 0) {
      const footprintGeom = new THREE.ExtrudeGeometry(shapes, { depth: 0.5, bevelEnabled: false });
      footprintGeom.rotateX(-Math.PI / 2);
      footprintMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color("#52b788"),
        transparent: true,
        opacity: FOOTPRINT_OPACITY,
        side: THREE.DoubleSide,
      });
      scene.add(new THREE.Mesh(footprintGeom, footprintMaterial));
    }

    const ringGeom = new THREE.RingGeometry(RING_RADIUS + 10, RING_RADIUS + 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x48cae4,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.6;
    scene.add(ring);

    const group = new THREE.Group();
    scene.add(group);

    const slots: BarSlot[] = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
      const angle = (i / MAX_SLOTS) * Math.PI * 2;
      const geo = new THREE.BoxGeometry(BAR_SIZE, 1, BAR_SIZE);
      const material = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.78,
        shininess: 50,
        emissive: 0xffffff,
        emissiveIntensity: 0.18,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(Math.sin(angle) * RING_RADIUS, 0, Math.cos(angle) * RING_RADIUS);
      mesh.scale.set(1, 0.001, 1);
      mesh.visible = false;
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMaterial));
      group.add(mesh);
      slots.push({ mesh, material, edgeMaterial, categoria: null, baseH: 0, curH: 0, targetColor: new THREE.Color(0xffffff) });
    }

    function applyBreakdown(items: BreakdownEntry[]) {
      const maxArea = items[0]?.area_ha || 1;
      slots.forEach((slot, i) => {
        const item = items[i];
        if (!item) {
          slot.categoria = null;
          slot.mesh.visible = false;
          return;
        }
        slot.categoria = item.categoria;
        slot.baseH = Math.max(4, (item.area_ha / maxArea) * MAX_BAR_HEIGHT);
        slot.targetColor = new THREE.Color(SLOT_COLORS[i % SLOT_COLORS.length]);
        slot.mesh.visible = true;
      });
    }
    applyBreakdownRef.current = applyBreakdown;
    applyBreakdown(breakdown);

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let hoveredSlot: BarSlot | null = null;

    function ndcFromEvent(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function pickSlot(): BarSlot | null {
      raycaster.setFromCamera(pointerNdc, camera);
      const meshes = slots.filter((s) => s.mesh.visible).map((s) => s.mesh);
      // recursive=false a propósito: cada barra tiene un LineSegments (el
      // borde) como hijo, y por default intersectObjects SÍ desciende a los
      // hijos -- el rayo puede "pegarle" al borde antes que a la caja, y ese
      // hit nunca matchea ningún slot.mesh (queda como no-hit silencioso).
      const hits = raycaster.intersectObjects(meshes, false);
      if (!hits.length) return null;
      return slots.find((s) => s.mesh === hits[0].object) ?? null;
    }

    function handlePointerMove(e: PointerEvent) {
      ndcFromEvent(e);
      const slot = pickSlot();
      hoveredSlot = slot;
      // se llama en cada movimiento (no solo al cambiar de barra) para que el
      // tooltip siga al cursor mientras se queda sobre la misma barra.
      onHoverRef.current(slot ? slot.categoria : null, slot ? { x: e.clientX, y: e.clientY } : undefined);
      renderer.domElement.style.cursor = slot ? "pointer" : "default";
    }
    function handlePointerLeave() {
      if (hoveredSlot) {
        hoveredSlot = null;
        onHoverRef.current(null);
      }
    }
    function handleClick(e: PointerEvent) {
      ndcFromEvent(e);
      const slot = pickSlot();
      onClickRef.current(slot ? slot.categoria : null);
    }

    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("click", handleClick);

    let raf = 0;
    let disposed = false;
    let phase: "active" | "closing" = "active";
    let closeStart = 0;

    function resize() {
      if (!container) return;
      const { clientWidth: w, clientHeight: h } = container;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    camera.lookAt(0, MAX_BAR_HEIGHT * 0.4, 0);

    function tick(now: number) {
      if (disposed) return;

      if (closingRef.current && phase !== "closing") {
        phase = "closing";
        closeStart = now;
      }

      let globalFade = 1;
      if (phase === "closing") {
        const t = Math.min(1, (now - closeStart) / EXIT_DURATION_MS);
        globalFade = 1 - easeInCubic(t);
      }

      const active = activeRef.current;
      slots.forEach((slot) => {
        const boosted = slot.categoria !== null && slot.categoria === active;
        if (phase === "closing") {
          slot.curH = slot.baseH * globalFade;
        } else {
          const goal = boosted ? slot.baseH * 1.08 : slot.baseH;
          slot.curH += (goal - slot.curH) * DAMP;
        }
        const h = Math.max(0.6, slot.curH);
        slot.mesh.scale.y = h;
        slot.mesh.position.y = h / 2;
        slot.material.color.lerp(slot.targetColor, COLOR_DAMP);
        slot.material.emissive.copy(slot.material.color);
        slot.material.emissiveIntensity = boosted ? 0.55 : 0.18;
        slot.material.opacity = (boosted ? 0.95 : 0.78) * globalFade;
        slot.edgeMaterial.color.lerp(slot.targetColor, COLOR_DAMP);
        slot.edgeMaterial.opacity = 0.9 * globalFade;
      });

      ringMat.opacity = 0.35 * globalFade;
      if (footprintMaterial) footprintMaterial.opacity = FOOTPRINT_OPACITY * globalFade;

      group.rotation.y += ROTATION_SPEED;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("click", handleClick);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [geometry]);

  return <div ref={containerRef} className="h-full w-full" />;
}
