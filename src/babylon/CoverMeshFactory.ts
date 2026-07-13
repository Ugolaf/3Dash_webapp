import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Color3,
  Color4,
  Vector3,
  type Mesh,
  type Observer,
} from '@babylonjs/core';
import type { CoverConfig } from '../types';

/** Extra width of the curtain vs the window opening (slight overlap on each side). */
const PANEL_OVERLAP_X = 0.06;
/** Extra height so the closed curtain overlaps the window sill. */
const PANEL_OVERLAP_Y = 0.04;
/** Curtain thickness. */
const PANEL_THICKNESS = 0.045;
/** Housing (coffre) dimensions. */
const HOUSING_HEIGHT = 0.15;
const HOUSING_DEPTH = 0.12;
/** Gap between wall face and meshes to avoid z-fighting. */
const WALL_GAP = 0.015;
/** Approximate slat height in world units (drives the stripe texture density). */
const SLAT_HEIGHT = 0.09;
/** Seconds for a full open→closed travel of the animated curtain. */
const TRAVEL_SECONDS = 2.2;
/** Minimum visible curtain fraction — keeps a lip poking out of the housing when open. */
const MIN_FRACTION = 0.045;

export interface CoverMeshEntry {
  /** Roller housing box above the window. */
  housing: Mesh;
  /** Animated slatted curtain. */
  panel: Mesh;
  /** Invisible hitbox covering the whole window for easy picking. */
  hitbox: Mesh;
  panelMat: StandardMaterial;
  housingMat: StandardMaterial;
  slatTexture: DynamicTexture;
  config: CoverConfig;
  /** 0 = fully open (retracted), 1 = fully closed. */
  currentFraction: number;
  targetFraction: number;
  animObserver: Observer<Scene> | null;
}

export type CoverMeshMap = Record<string, CoverMeshEntry>;

/** Draw a single roller-shutter slat (repeated vertically via vScale). */
function createSlatTexture(scene: Scene, id: string): DynamicTexture {
  const tex = new DynamicTexture(`cover_slats_${id}`, { width: 64, height: 64 }, scene, true);
  const dtx = tex.getContext();
  // Slat body with a subtle vertical gradient
  const grad = dtx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#f2f2f2');
  grad.addColorStop(0.75, '#dcdcdc');
  grad.addColorStop(1, '#c4c4c4');
  dtx.fillStyle = grad;
  dtx.fillRect(0, 0, 64, 64);
  // Groove between slats
  dtx.fillStyle = '#8a8a8a';
  dtx.fillRect(0, 58, 64, 6);
  tex.update();
  tex.wrapV = DynamicTexture.WRAP_ADDRESSMODE;
  return tex;
}

/** Yaw so the mesh's local +Z axis points along the (horizontal) wall normal. */
function normalToYaw(cfg: CoverConfig): number {
  return Math.atan2(cfg.normal.x, cfg.normal.z);
}

/** Reposition/scale the curtain for the given closed fraction, keeping its top fixed. */
function applyFraction(entry: CoverMeshEntry): void {
  const { config: cfg, panel } = entry;
  const f = Math.max(entry.currentFraction, MIN_FRACTION);
  const panelHeight = cfg.height + PANEL_OVERLAP_Y;
  const topY = cfg.position.y + cfg.height / 2;
  const n = cfg.normal;

  panel.scaling.y = f;
  panel.position.y = topY - (panelHeight * f) / 2;
  panel.position.x = cfg.position.x + n.x * (WALL_GAP + PANEL_THICKNESS / 2);
  panel.position.z = cfg.position.z + n.z * (WALL_GAP + PANEL_THICKNESS / 2);

  // Keep the slat pitch constant while the curtain grows
  const slats = Math.max((panelHeight * f) / SLAT_HEIGHT, 1);
  entry.slatTexture.vScale = slats;
}

/**
 * Create the meshes for a roller shutter: housing box, animated slatted
 * curtain and an invisible full-window hitbox for click detection.
 * The curtain should be registered as a sun-shadow caster by the caller so
 * that closing the shutter actually blocks sunlight entering the room.
 */
export function createCoverMesh(scene: Scene, cfg: CoverConfig, id: string): CoverMeshEntry {
  const yaw = normalToYaw(cfg);
  const n = cfg.normal;
  const topY = cfg.position.y + cfg.height / 2;

  // Housing (coffre) above the opening
  const housingMat = new StandardMaterial(`cover_housing_mat_${id}`, scene);
  housingMat.diffuseColor = new Color3(0.82, 0.82, 0.82);
  housingMat.specularColor = new Color3(0.08, 0.08, 0.08);
  housingMat.maxSimultaneousLights = 48;

  const housing = MeshBuilder.CreateBox(`cover_housing_${id}`, {
    width: cfg.width + PANEL_OVERLAP_X * 2 + 0.06,
    height: HOUSING_HEIGHT,
    depth: HOUSING_DEPTH,
  }, scene);
  housing.position = new Vector3(
    cfg.position.x + n.x * (WALL_GAP + HOUSING_DEPTH / 2),
    topY + HOUSING_HEIGHT / 2,
    cfg.position.z + n.z * (WALL_GAP + HOUSING_DEPTH / 2),
  );
  housing.rotation.y = yaw;
  housing.material = housingMat;
  housing.receiveShadows = true;
  housing.applyFog = false;
  housing.metadata = { entityId: cfg.entityId };
  housing.enableEdgesRendering();
  housing.edgesWidth = 2;
  housing.edgesColor = new Color4(0, 0, 0, 1);

  // Slatted curtain — full-height box scaled in Y from the top
  const slatTexture = createSlatTexture(scene, id);
  const panelMat = new StandardMaterial(`cover_panel_mat_${id}`, scene);
  panelMat.diffuseTexture = slatTexture;
  panelMat.specularColor = new Color3(0.05, 0.05, 0.05);
  panelMat.maxSimultaneousLights = 48;

  const panel = MeshBuilder.CreateBox(`cover_panel_${id}`, {
    width: cfg.width + PANEL_OVERLAP_X * 2,
    height: cfg.height + PANEL_OVERLAP_Y,
    depth: PANEL_THICKNESS,
  }, scene);
  panel.rotation.y = yaw;
  panel.material = panelMat;
  panel.receiveShadows = true;
  panel.applyFog = false;
  panel.metadata = { entityId: cfg.entityId };

  // Invisible hitbox covering the whole window (curtain may be retracted)
  const hitbox = MeshBuilder.CreateBox(`cover_hitbox_${id}`, {
    width: cfg.width + PANEL_OVERLAP_X * 2,
    height: cfg.height + HOUSING_HEIGHT,
    depth: HOUSING_DEPTH + 0.04,
  }, scene);
  hitbox.position = new Vector3(
    cfg.position.x + n.x * (WALL_GAP + HOUSING_DEPTH / 2),
    cfg.position.y + HOUSING_HEIGHT / 2,
    cfg.position.z + n.z * (WALL_GAP + HOUSING_DEPTH / 2),
  );
  hitbox.rotation.y = yaw;
  hitbox.visibility = 0;
  hitbox.isPickable = true;
  hitbox.metadata = { entityId: cfg.entityId };

  const entry: CoverMeshEntry = {
    housing,
    panel,
    hitbox,
    panelMat,
    housingMat,
    slatTexture,
    config: cfg,
    currentFraction: MIN_FRACTION,
    targetFraction: MIN_FRACTION,
    animObserver: null,
  };
  applyFraction(entry);
  return entry;
}

/**
 * Move the curtain to a HA cover position (100 = open, 0 = closed).
 * Animates at a constant travel speed unless `animate` is false.
 */
export function setCoverPosition(
  scene: Scene,
  entry: CoverMeshEntry,
  position: number,
  animate = true,
): void {
  const target = Math.min(Math.max(1 - position / 100, 0), 1);
  entry.targetFraction = target;

  if (!animate) {
    stopCoverAnimation(scene, entry);
    entry.currentFraction = target;
    applyFraction(entry);
    return;
  }

  if (entry.animObserver) return; // already animating toward targetFraction

  entry.animObserver = scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const step = dt / TRAVEL_SECONDS;
    const delta = entry.targetFraction - entry.currentFraction;
    if (Math.abs(delta) <= step) {
      entry.currentFraction = entry.targetFraction;
      applyFraction(entry);
      stopCoverAnimation(scene, entry);
      return;
    }
    entry.currentFraction += Math.sign(delta) * step;
    applyFraction(entry);
  });
}

/** Halt the curtain where it currently is (HA stop_cover). */
export function stopCoverAnimation(scene: Scene, entry: CoverMeshEntry): void {
  if (entry.animObserver) {
    scene.onBeforeRenderObservable.remove(entry.animObserver);
    entry.animObserver = null;
  }
  entry.targetFraction = entry.currentFraction;
}

/**
 * Dispose and recreate all cover meshes (editor use).
 * `previewPosition` sets the initial curtain position (100 = open) so the
 * editor can show shutters partially closed for visibility.
 */
export function rebuildAllCoverMeshes(
  scene: Scene,
  map: CoverMeshMap,
  covers: CoverConfig[],
  previewPosition = 100,
): void {
  Object.keys(map).forEach((id) => removeCoverMesh(scene, map, id));
  for (const cfg of covers) {
    const entry = createCoverMesh(scene, cfg, cfg.entityId);
    setCoverPosition(scene, entry, previewPosition, false);
    map[cfg.entityId] = entry;
  }
}

export function removeCoverMesh(scene: Scene, map: CoverMeshMap, entityId: string): void {
  const entry = map[entityId];
  if (!entry) return;
  stopCoverAnimation(scene, entry);
  entry.hitbox.dispose();
  entry.panel.dispose();
  entry.housing.dispose();
  entry.slatTexture.dispose();
  entry.panelMat.dispose();
  entry.housingMat.dispose();
  delete map[entityId];
}
