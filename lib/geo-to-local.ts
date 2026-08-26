import * as THREE from "three";
import type { Geometry, Position } from "geojson";

const DEG2RAD = Math.PI / 180;

function toPolygonRings(geometry: Geometry): Position[][][] {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

export type RegionShapes = {
  shapes: THREE.Shape[];
};

/**
 * Proyecta una geometría GeoJSON (lon/lat) a un plano local en unidades de
 * Three.js, centrada en su propio bbox y normalizada a `targetSize` (el lado
 * mayor del bbox queda en targetSize unidades) — así cualquier distrito,
 * chico o grande, ocupa el mismo espacio en la escena 3D.
 */
export function buildRegionShapes(geometry: Geometry, targetSize = 260): RegionShapes {
  const polygons = toPolygonRings(geometry);
  if (polygons.length === 0) return { shapes: [] };

  const outerPoints = polygons.flatMap((rings) => rings[0] ?? []);
  if (outerPoints.length === 0) return { shapes: [] };

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of outerPoints) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const latCos = Math.cos(centerLat * DEG2RAD);

  const widthDeg = (maxLon - minLon) * latCos;
  const heightDeg = maxLat - minLat;
  const maxDeg = Math.max(widthDeg, heightDeg, 1e-6);
  const scale = targetSize / maxDeg;

  function project([lon, lat]: Position): THREE.Vector2 {
    return new THREE.Vector2((lon - centerLon) * latCos * scale, (lat - centerLat) * scale);
  }

  const shapes = polygons.map((rings) => {
    const [outerRing, ...holeRings] = rings;
    const shape = new THREE.Shape(outerRing.map(project));
    for (const hole of holeRings) {
      shape.holes.push(new THREE.Path(hole.map(project)));
    }
    return shape;
  });

  return { shapes };
}
