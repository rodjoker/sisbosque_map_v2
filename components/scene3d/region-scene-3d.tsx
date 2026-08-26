"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Geometry } from "geojson";
import { buildRegionShapes } from "@/lib/geo-to-local";
import { EXIT_DURATION_MS } from "@/lib/scene3d-context";

const TARGET_SIZE = 260;
const SLAB_DEPTH = 12;
const LIFT_HEIGHT = 150;
const LIFT_DURATION_MS = 900;
const ROTATION_SPEED = 0.0016;
const FACE_OPACITY = 0.16;
const EDGE_OPACITY = 0.9;
const FOOTPRINT_OPACITY = 0.08;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number) {
  return t * t * t;
}

export type ScreenPoint = { x: number; y: number };
export type FrameInfo = { center: ScreenPoint };

function toScreen(v: THREE.Vector3, camera: THREE.PerspectiveCamera, w: number, h: number): ScreenPoint {
  const ndc = v.clone().project(camera);
  return { x: (ndc.x * 0.5 + 0.5) * w, y: (-ndc.y * 0.5 + 0.5) * h };
}

/**
 * Escena Three.js autocontenida: extruye la geometría de una región y anima
 * su "despegue" (sube desde el plano del mapa con easing + rotación lenta).
 * Reporta cada frame, vía `onFrame`, la posición en pantalla del punto más
 * alto del bloque — el overlay HTML lo usa como origen de las líneas
 * conectoras hacia los paneles (que ahora viven fijos en las 4 esquinas,
 * no orbitando, para evitar que se superpongan con el título/otros
 * paneles según el ángulo de giro).
 */
export function RegionScene3D({
  geometry,
  onFrame,
  closing = false,
}: {
  geometry: Geometry;
  onFrame?: (info: FrameInfo) => void;
  closing?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);
  const closingRef = useRef(closing);
  useEffect(() => {
    closingRef.current = closing;
  }, [closing]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { shapes } = buildRegionShapes(geometry, TARGET_SIZE);
    if (shapes.length === 0) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.position.set(0, 230, 400);
    camera.lookAt(0, 90, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Huella en el suelo: marca dónde "estaba" la región antes de despegar.
    const footprintGeom = new THREE.ExtrudeGeometry(shapes, { depth: 0.5, bevelEnabled: false });
    footprintGeom.rotateX(-Math.PI / 2);
    const footprintMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#52b788"),
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(footprintGeom, footprintMaterial));

    // Bloque que despega: caras translúcidas + bordes brillantes (look holograma).
    const blockGeom = new THREE.ExtrudeGeometry(shapes, {
      depth: SLAB_DEPTH,
      bevelEnabled: false,
      curveSegments: 2,
    });
    blockGeom.rotateX(-Math.PI / 2);
    blockGeom.computeBoundingBox();
    const bbox = blockGeom.boundingBox ?? new THREE.Box3();

    const faceMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#52b788"),
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const block = new THREE.Mesh(blockGeom, faceMaterial);

    const edgesGeom = new THREE.EdgesGeometry(blockGeom, 1);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color("#48cae4"),
      transparent: true,
      opacity: 0.9,
    });
    block.add(new THREE.LineSegments(edgesGeom, edgeMaterial));

    const group = new THREE.Group();
    group.add(block);
    scene.add(group);

    // Punto de referencia (centro, arriba del todo del bloque) para
    // centrar la cámara y como origen de las líneas conectoras.
    const topLocal = new THREE.Vector3(
      (bbox.min.x + bbox.max.x) / 2,
      bbox.max.y,
      (bbox.min.z + bbox.max.z) / 2
    );

    let raf = 0;
    let disposed = false;
    let width = 0;
    let height = 0;
    const start = performance.now();

    let phase: "lifting" | "holding" | "closing" = "lifting";
    let closeStart = 0;
    let closeFromY = 0;

    function resize() {
      if (!container) return;
      const { clientWidth: w, clientHeight: h } = container;
      if (w === 0 || h === 0) return;
      width = w;
      height = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    function tick(now: number) {
      if (disposed) return;

      if (closingRef.current && phase !== "closing") {
        phase = "closing";
        closeStart = now;
        closeFromY = group.position.y;
      }

      if (phase === "closing") {
        const t = Math.min(1, (now - closeStart) / EXIT_DURATION_MS);
        const eased = easeInCubic(t);
        group.position.y = closeFromY * (1 - eased);
        faceMaterial.opacity = FACE_OPACITY * (1 - eased);
        edgeMaterial.opacity = EDGE_OPACITY * (1 - eased);
        footprintMaterial.opacity = FOOTPRINT_OPACITY * (1 - eased);
      } else {
        const t = Math.min(1, (now - start) / LIFT_DURATION_MS);
        group.position.y = easeOutCubic(t) * LIFT_HEIGHT;
        if (t >= 1) phase = "holding";
      }

      group.rotation.y += ROTATION_SPEED;

      const topWorld = new THREE.Vector3(topLocal.x, topLocal.y + group.position.y, topLocal.z);

      // Recentra la cámara cada frame a mitad de camino entre el piso (la
      // huella, y=0) y la punta del bloque, así la composición queda
      // centrada en todo momento en vez de apuntar a un punto fijo.
      camera.lookAt(0, topWorld.y * 0.5, 0);

      renderer.render(scene, camera);

      if (onFrameRef.current && width > 0 && height > 0) {
        onFrameRef.current({ center: toScreen(topWorld, camera, width, height) });
      }

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      footprintGeom.dispose();
      footprintMaterial.dispose();
      blockGeom.dispose();
      edgesGeom.dispose();
      faceMaterial.dispose();
      edgeMaterial.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [geometry]);

  return <div ref={containerRef} className="h-full w-full" />;
}
