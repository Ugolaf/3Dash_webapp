import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Vector3,
  Quaternion,
  TransformNode,
  type Mesh,
} from '@babylonjs/core';
import type { CameraConfig } from '../types';

/** Diameter of the ceiling mount plate. */
const HOUSING_DIAMETER = 0.34;
const HOUSING_HEIGHT = 0.06;
/** Diameter of the smoked dome bubble. */
const DOME_DIAMETER = 0.27;

export interface CameraMeshEntry {
  root: TransformNode;
  /** Light mounting plate against the ceiling. */
  housing: Mesh;
  /** Smoked glossy dome bubble. */
  dome: Mesh;
  /** Invisible pickable box for click detection. */
  hitbox: Mesh;
  housingMat: StandardMaterial;
  domeMat: StandardMaterial;
  config: CameraConfig;
}

export type CameraMeshMap = Record<string, CameraMeshEntry>;

/**
 * Build a ceiling-mounted dome (CCTV) camera: a light mount plate with a dark
 * smoked bubble hanging below it. The whole volume is covered by an invisible
 * hitbox stamped with `metadata.cameraId` so pointer handlers can open the feed.
 */
export function createCameraMesh(scene: Scene, cfg: CameraConfig): CameraMeshEntry {
  const root = new TransformNode(`cam_${cfg.id}`, scene);
  root.position = new Vector3(cfg.position.x, cfg.position.y, cfg.position.z);
  // Orientation: the dome/lens (local −Y) is pitched by `tilt` (0 = down for a
  // ceiling, π/2 = horizontal for a wall) then yawed to aim it.
  root.rotationQuaternion = Quaternion.RotationYawPitchRoll(cfg.rotationY ?? 0, cfg.tilt ?? 0, 0);

  // Mounting plate (against the ceiling)
  const housingMat = new StandardMaterial(`cammat_housing_${cfg.id}`, scene);
  housingMat.diffuseColor = new Color3(0.82, 0.83, 0.85);
  housingMat.specularColor = new Color3(0.1, 0.1, 0.1);
  housingMat.maxSimultaneousLights = 48;

  const housing = MeshBuilder.CreateCylinder(`cam_${cfg.id}_housing`, {
    diameter: HOUSING_DIAMETER,
    height: HOUSING_HEIGHT,
    tessellation: 24,
  }, scene);
  housing.position.y = -HOUSING_HEIGHT / 2;
  housing.material = housingMat;
  housing.parent = root;
  housing.isPickable = false;
  housing.applyFog = false;
  housing.receiveShadows = true;
  housing.enableEdgesRendering();
  housing.edgesWidth = 2;
  housing.edgesColor = new Color4(0, 0, 0, 1);

  // Smoked dome bubble (glossy dark), hanging below the plate
  const domeMat = new StandardMaterial(`cammat_dome_${cfg.id}`, scene);
  domeMat.diffuseColor = new Color3(0.06, 0.07, 0.09);
  domeMat.specularColor = new Color3(0.6, 0.6, 0.7);
  domeMat.specularPower = 64;
  domeMat.alpha = 0.9;
  domeMat.maxSimultaneousLights = 48;

  const dome = MeshBuilder.CreateSphere(`cam_${cfg.id}_dome`, {
    diameter: DOME_DIAMETER,
    segments: 20,
  }, scene);
  // Only the lower half bulges below the housing; the top tucks inside it.
  dome.position.y = -HOUSING_HEIGHT - DOME_DIAMETER * 0.28;
  dome.material = domeMat;
  dome.parent = root;
  dome.isPickable = false;
  dome.applyFog = false;

  // Invisible hitbox spanning the whole camera
  const hitbox = MeshBuilder.CreateBox(`cam_hitbox_${cfg.id}`, {
    width: HOUSING_DIAMETER + 0.06,
    depth: HOUSING_DIAMETER + 0.06,
    height: HOUSING_HEIGHT + DOME_DIAMETER + 0.06,
  }, scene);
  hitbox.position.y = -(HOUSING_HEIGHT + DOME_DIAMETER) / 2;
  hitbox.parent = root;
  hitbox.visibility = 0;
  hitbox.isPickable = true;
  hitbox.metadata = { cameraId: cfg.id };

  return { root, housing, dome, hitbox, housingMat, domeMat, config: cfg };
}

export function removeCameraMesh(scene: Scene, map: CameraMeshMap, id: string): void {
  const entry = map[id];
  if (!entry) return;
  entry.hitbox.dispose();
  entry.dome.dispose();
  entry.housing.dispose();
  entry.root.dispose();
  entry.housingMat.dispose();
  entry.domeMat.dispose();
  delete map[id];
}

/** Dispose and recreate all camera meshes (editor use). */
export function rebuildAllCameraMeshes(
  scene: Scene,
  map: CameraMeshMap,
  list: CameraConfig[],
): void {
  Object.keys(map).forEach((id) => removeCameraMesh(scene, map, id));
  for (const cfg of list) {
    map[cfg.id] = createCameraMesh(scene, cfg);
  }
}
