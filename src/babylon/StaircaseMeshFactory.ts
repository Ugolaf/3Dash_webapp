import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Vector3,
  TransformNode,
  Mesh,
} from "@babylonjs/core";
import type { StaircaseConfig } from "../types";

/** Number of steps in the procedural staircase. */
const STEP_COUNT = 6;
/** Depth of each step tread (world units). */
const STEP_RUN = 0.3;
/** Height gained per step (world units). */
const STEP_RISE = 0.2;
/** Staircase width (world units). */
const WIDTH = 1.2;

export interface StaircaseMeshEntry {
  root: TransformNode;
  /** Merged solid step geometry. */
  steps: Mesh;
  /** Invisible pickable box spanning the whole staircase. */
  hitbox: Mesh;
  stepMat: StandardMaterial;
  config: StaircaseConfig;
}

export type StaircaseMeshMap = Record<string, StaircaseMeshEntry>;

/**
 * Build a clickable staircase. The block profile encodes the direction
 * (ascending vs descending steps); the fill is black to match the other
 * clickable elements. The whole volume is covered by an invisible hitbox
 * stamped with `metadata.staircaseId` so the pointer handlers route clicks
 * to a floor switch.
 */
export function createStaircaseMesh(
  scene: Scene,
  cfg: StaircaseConfig,
): StaircaseMeshEntry {
  const isUp = cfg.style === "up";
  const totalRun = STEP_COUNT * STEP_RUN;
  const totalRise = STEP_COUNT * STEP_RISE;

  const root = new TransformNode(`stair_${cfg.id}`, scene);
  root.position = new Vector3(cfg.position.x, cfg.position.y, cfg.position.z);
  root.rotation.y = cfg.rotationY ?? 0;

  // Black fill with black edges — same look as the other clickable elements.
  // Kept lit (very dark, not pure 0) so the sun still shades the treads and the
  // ascending/descending step profile reads instead of a flat black blob.
  const stepMat = new StandardMaterial(`stairmat_${cfg.id}`, scene);
  stepMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
  stepMat.specularColor = new Color3(0, 0, 0);
  stepMat.maxSimultaneousLights = 48;

  // Solid right-triangle block profile, always resting on the floor (so it is
  // never occluded by the floor slab in a top-down view). 'up' ascends
  // front→back; 'down' descends front→back (the near end is tall).
  const stepMeshes: Mesh[] = [];
  for (let i = 0; i < STEP_COUNT; i++) {
    const treadHeight = (isUp ? i + 1 : STEP_COUNT - i) * STEP_RISE;
    const z = -totalRun / 2 + i * STEP_RUN + STEP_RUN / 2;
    const box = MeshBuilder.CreateBox(
      `stair_${cfg.id}_step_${i}`,
      {
        width: WIDTH,
        height: treadHeight,
        depth: STEP_RUN,
      },
      scene,
    );
    box.position.z = z;
    box.position.y = treadHeight / 2;
    stepMeshes.push(box);
  }
  const steps = Mesh.MergeMeshes(
    stepMeshes,
    true,
    true,
    undefined,
    false,
    false,
  ) as Mesh;
  steps.name = `stair_${cfg.id}_steps`;
  steps.material = stepMat;
  steps.parent = root;
  steps.isPickable = false;
  steps.applyFog = false;
  steps.receiveShadows = true;
  steps.enableEdgesRendering();
  steps.edgesWidth = 3;
  steps.edgesColor = new Color4(0, 0, 0, 1);

  // Invisible hitbox spanning the whole staircase footprint.
  const hitH = totalRise + 0.2;
  const hitbox = MeshBuilder.CreateBox(
    `stair_hitbox_${cfg.id}`,
    {
      width: WIDTH + 0.1,
      height: hitH,
      depth: totalRun + 0.1,
    },
    scene,
  );
  hitbox.parent = root;
  hitbox.position.y = totalRise / 2;
  hitbox.visibility = 0;
  hitbox.isPickable = true;
  hitbox.metadata = { staircaseId: cfg.id };

  return { root, steps, hitbox, stepMat, config: cfg };
}

export function removeStaircaseMesh(
  scene: Scene,
  map: StaircaseMeshMap,
  id: string,
): void {
  const entry = map[id];
  if (!entry) return;
  entry.hitbox.dispose();
  entry.steps.dispose();
  entry.root.dispose();
  entry.stepMat.dispose();
  delete map[id];
}

/** Dispose and recreate all staircase meshes (editor use). */
export function rebuildAllStaircaseMeshes(
  scene: Scene,
  map: StaircaseMeshMap,
  list: StaircaseConfig[],
): void {
  Object.keys(map).forEach((id) => removeStaircaseMesh(scene, map, id));
  for (const cfg of list) {
    map[cfg.id] = createStaircaseMesh(scene, cfg);
  }
}
