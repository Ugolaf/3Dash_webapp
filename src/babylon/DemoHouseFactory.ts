import {
  Scene,
  MeshBuilder,
  Mesh,
  StandardMaterial,
  Color3,
  Vector3,
  VertexData,
  type AbstractMesh,
} from '@babylonjs/core';
import { applyRenderStyle, type ModelLoadResult, type RenderStyleOptions } from './ModelLoader';

/**
 * Procedural exterior used by the simulation overview (no exterior GLB ships
 * with the demo). The footprint matches simulation_model.glb's outer walls so
 * the shutters configured on the demo floors line up with the facade.
 */
const X_MIN = -9;
const X_MAX = 0;
const Z_MIN = -10.24;
const Z_MAX = 1.43;
const LEVEL_H = 3;
const EAVE_Y = LEVEL_H * 2;
const RIDGE_Y = EAVE_Y + 2.4;
const OVERHANG = 0.4;

interface WindowSpec {
  /** Center of the opening on the facade plane. */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  axis: 'x' | 'z';
  /** Outward side of the facade (+1 / −1 along `axis`). */
  sign: 1 | -1;
}

const WINDOWS: WindowSpec[] = [
  // Back facade (garden side, −Z)
  { x: -6.06, y: 1.35, z: Z_MIN, w: 2.95, h: 2.2, axis: 'z', sign: -1 },
  { x: -6.06, y: 4.6, z: Z_MIN, w: 1.6, h: 1.3, axis: 'z', sign: -1 },
  { x: -2.5, y: 4.6, z: Z_MIN, w: 1.2, h: 1.3, axis: 'z', sign: -1 },
  // East facade (+X)
  { x: X_MAX, y: 1.95, z: -9.265, w: 0.65, h: 0.6, axis: 'x', sign: 1 },
  { x: X_MAX, y: 1.5, z: -1.2, w: 1.2, h: 1.4, axis: 'x', sign: 1 },
  { x: X_MAX, y: 4.85, z: -5.15, w: 1.35, h: 1.25, axis: 'x', sign: 1 },
  { x: X_MAX, y: 4.6, z: -1.2, w: 1.2, h: 1.3, axis: 'x', sign: 1 },
  // Street facade (+Z)
  { x: -4.5, y: 1.5, z: Z_MAX, w: 1.4, h: 1.4, axis: 'z', sign: 1 },
  { x: -2.5, y: 4.6, z: Z_MAX, w: 1.2, h: 1.3, axis: 'z', sign: 1 },
  { x: -6.5, y: 4.6, z: Z_MAX, w: 1.2, h: 1.3, axis: 'z', sign: 1 },
  // West facade (−X)
  { x: X_MIN, y: 1.5, z: -5, w: 1.2, h: 1.4, axis: 'x', sign: -1 },
  { x: X_MIN, y: 4.6, z: -5, w: 1.2, h: 1.3, axis: 'x', sign: -1 },
];

const TREES: Array<[number, number, number]> = [
  // x, z, canopy radius
  [-12.5, -15, 1.6],
  [6.5, -17, 1.3],
  [-13, -3, 1.4],
  [7, 0.5, 1.1],
  [-9.5, -20, 1.0],
];

/** Shared-by-name material so repeated floor switches don't leak materials. */
function getMat(scene: Scene, name: string, color: Color3): StandardMaterial {
  const existing = scene.getMaterialByName(name);
  if (existing) return existing as StandardMaterial;
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(0.05, 0.05, 0.05);
  m.backFaceCulling = false;
  m.twoSidedLighting = true;
  m.maxSimultaneousLights = 48;
  return m;
}

function box(
  scene: Scene,
  name: string,
  min: [number, number, number],
  max: [number, number, number],
  mat: StandardMaterial,
): Mesh {
  const m = MeshBuilder.CreateBox(name, {
    width: max[0] - min[0],
    height: max[1] - min[1],
    depth: max[2] - min[2],
  }, scene);
  m.position = new Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  m.material = mat;
  return m;
}

/** Gable roof: a triangular prism with its ridge along Z. */
function createRoof(scene: Scene, mat: StandardMaterial): Mesh {
  const x0 = X_MIN - OVERHANG, x1 = X_MAX + OVERHANG;
  const z0 = Z_MIN - OVERHANG, z1 = Z_MAX + OVERHANG;
  const xm = (x0 + x1) / 2;
  const positions = [
    x0, EAVE_Y, z0, // 0 A
    x1, EAVE_Y, z0, // 1 B
    xm, RIDGE_Y, z0, // 2 C
    x0, EAVE_Y, z1, // 3 D
    x1, EAVE_Y, z1, // 4 E
    xm, RIDGE_Y, z1, // 5 F
  ];
  const indices = [
    0, 1, 2, // front gable
    3, 5, 4, // back gable
    0, 2, 5, 0, 5, 3, // west slope
    1, 4, 5, 1, 5, 2, // east slope
    0, 3, 4, 0, 4, 1, // soffit
  ];
  const roof = new Mesh('demo_house_roof', scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.applyToMesh(roof);
  roof.convertToFlatShadedMesh();
  roof.material = mat;
  return roof;
}

export function createDemoHouse(scene: Scene, style: RenderStyleOptions): ModelLoadResult {
  const wallMat = getMat(scene, 'demo_house_wall', new Color3(0.93, 0.9, 0.84));
  const roofMat = getMat(scene, 'demo_house_roof', new Color3(0.62, 0.3, 0.22));
  const glassMat = getMat(scene, 'demo_house_glass', new Color3(0.16, 0.22, 0.3));
  const woodMat = getMat(scene, 'demo_house_wood', new Color3(0.4, 0.27, 0.18));
  const stoneMat = getMat(scene, 'demo_house_stone', new Color3(0.72, 0.7, 0.66));
  const lawnMat = getMat(scene, 'demo_house_lawn', new Color3(0.45, 0.62, 0.33));
  const leafMat = getMat(scene, 'demo_house_leaf', new Color3(0.3, 0.5, 0.25));
  const metalMat = getMat(scene, 'demo_house_metal', new Color3(0.2, 0.2, 0.22));

  const meshes: Mesh[] = [];
  const add = (m: Mesh) => { meshes.push(m); return m; };

  // Garden ground, slightly below the house so the floor slab doesn't z-fight
  add(box(scene, 'demo_lawn', [-20.5, -0.12, -24], [11.5, -0.02, 7], lawnMat));

  // Building shell + band between the two levels + roof + chimney
  add(box(scene, 'demo_walls', [X_MIN, 0, Z_MIN], [X_MAX, EAVE_Y, Z_MAX], wallMat));
  add(box(scene, 'demo_band', [X_MIN - 0.06, LEVEL_H - 0.08, Z_MIN - 0.06], [X_MAX + 0.06, LEVEL_H + 0.08, Z_MAX + 0.06], stoneMat));
  add(createRoof(scene, roofMat));
  add(box(scene, 'demo_chimney', [-6.9, 7.0, -3.5], [-6.2, 8.8, -2.8], stoneMat));

  WINDOWS.forEach((w, i) => {
    const t = 0.04;
    const off = w.sign * 0.01;
    const min: [number, number, number] = w.axis === 'z'
      ? [w.x - w.w / 2, w.y - w.h / 2, w.z + off - t / 2]
      : [w.x + off - t / 2, w.y - w.h / 2, w.z - w.w / 2];
    const max: [number, number, number] = w.axis === 'z'
      ? [w.x + w.w / 2, w.y + w.h / 2, w.z + off + t / 2]
      : [w.x + off + t / 2, w.y + w.h / 2, w.z + w.w / 2];
    add(box(scene, `demo_window_${i}`, min, max, glassMat));
  });

  // Garden door + canopy on the back facade
  add(box(scene, 'demo_door', [-3.0, 0, Z_MIN - 0.04], [-2.0, 2.2, Z_MIN + 0.01], woodMat));
  add(box(scene, 'demo_door_canopy', [-3.3, 2.35, Z_MIN - 0.9], [-1.7, 2.45, Z_MIN], stoneMat));

  // Terrace (east), garden path and hedges
  add(box(scene, 'demo_terrace', [0, -0.02, -9.6], [3.6, 0.12, -2.6], stoneMat));
  add(box(scene, 'demo_path', [-3.1, -0.02, -22.5], [-1.9, 0.03, Z_MIN], stoneMat));
  add(box(scene, 'demo_hedge_w', [-20, -0.02, -23.6], [-3.6, 0.9, -23], leafMat));
  add(box(scene, 'demo_hedge_e', [-1.4, -0.02, -23.6], [11, 0.9, -23], leafMat));

  // Lamp posts along the path (light.garden_path bulbs sit on top)
  for (const z of [-15, -19.5]) {
    const post = MeshBuilder.CreateCylinder(`demo_lamp_post_${z}`, { diameter: 0.08, height: 0.9 }, scene);
    post.position = new Vector3(-3.4, 0.45, z);
    post.material = metalMat;
    add(post);
  }

  TREES.forEach(([x, z, r], i) => {
    const trunk = MeshBuilder.CreateCylinder(`demo_tree_trunk_${i}`, { diameter: 0.25, height: 1.8 }, scene);
    trunk.position = new Vector3(x, 0.9, z);
    trunk.material = woodMat;
    add(trunk);
    const canopy = MeshBuilder.CreateIcoSphere(`demo_tree_canopy_${i}`, { radius: r, subdivisions: 2 }, scene);
    canopy.position = new Vector3(x, 1.6 + r * 0.8, z);
    canopy.material = leafMat;
    add(canopy);
  });

  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const m of meshes) {
    m.receiveShadows = true;
    m.computeWorldMatrix(true);
    const b = m.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, b.minimumWorld);
    max = Vector3.Maximize(max, b.maximumWorld);
  }

  applyRenderStyle(scene, meshes, style);

  const solids: AbstractMesh[] = meshes;
  const size = max.subtract(min);
  return {
    meshes: solids,
    // The lawn only receives shadows; everything else casts
    shadowCasters: solids.filter((m) => m.name !== 'demo_lawn'),
    center: Vector3.Lerp(min, max, 0.5),
    diagonal: size.length(),
    size,
  };
}
