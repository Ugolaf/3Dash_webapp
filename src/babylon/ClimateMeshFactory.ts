import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Vector3,
  TransformNode,
  DynamicTexture,
  Texture,
  type Mesh,
  type Observer,
} from '@babylonjs/core';
import type { ClimateConfig, HAState } from '../types';
import { resolveAirflow, fanSpeedFactor, isSwinging, type Airflow } from '../utils/climate';

/** Split unit body dimensions (meters). The back face sits on the mount point. */
const BODY_WIDTH = 0.9;
const BODY_HEIGHT = 0.28;
const BODY_DEPTH = 0.2;

/** Airflow streams: thin translucent tubes with dashes sliding along them. */
const STREAM_COUNT = 5;
const STREAM_LENGTH = 1.7;
const STREAM_STEPS = 14;
const STREAM_RADIUS = 0.016;
/** Dash scroll speed (texture repeats per second) at fan factor 1. */
const BASE_FLOW_SPEED = 0.9;

type FlowKind = Exclude<Airflow, null>;

const FLOW_COLORS: Record<FlowKind, Color3> = {
  warm: new Color3(1, 0.5, 0.15),
  cold: new Color3(0.3, 0.65, 1),
  neutral: new Color3(0.78, 0.83, 0.88),
};

const LED_COLORS: Record<FlowKind | 'off', Color3> = {
  warm: new Color3(1, 0.45, 0.1),
  cold: new Color3(0.25, 0.6, 1),
  neutral: new Color3(0.3, 0.9, 0.5),
  off: new Color3(0.15, 0.15, 0.17),
};

/**
 * Vertical drift of a stream at t ∈ [0,1] along its length: the unit blows
 * slightly downward, then cold air keeps sinking, warm air curls back up and
 * neutral air just settles.
 */
const FLOW_DRIFT: Record<FlowKind, (t: number) => number> = {
  cold: (t) => -0.15 * t - 0.75 * t * t,
  warm: (t) => -0.4 * t + 0.6 * t * t,
  neutral: (t) => -0.12 * t - 0.3 * t * t,
};

interface Stream {
  mesh: Mesh;
  mat: StandardMaterial;
  tex: DynamicTexture;
}

export interface ClimateMeshEntry {
  root: TransformNode;
  body: Mesh;
  vent: Mesh;
  led: Mesh;
  /** Invisible pickable box for click detection. */
  hitbox: Mesh;
  /** Parent of the airflow streams, pivoting at the outlet (swing rotates it). */
  flowRoot: TransformNode;
  streams: Stream[];
  /** Kind the current streams were built for (their curve depends on it). */
  flowKind: FlowKind | null;
  flowSpeed: number;
  swinging: boolean;
  animObserver: Observer<Scene> | null;
  bodyMat: StandardMaterial;
  ventMat: StandardMaterial;
  ledMat: StandardMaterial;
  config: ClimateConfig;
}

export type ClimateMeshMap = Record<string, ClimateMeshEntry>;

/**
 * Alpha mask of soft dashes along V (the tube's length). Each stream draws its
 * own random layout so the lines don't pulse in lockstep.
 */
function createDashTexture(scene: Scene, name: string): DynamicTexture {
  const w = 8;
  const h = 256;
  const tex = new DynamicTexture(name, { width: w, height: h }, scene, false);
  const ctx = tex.getContext();
  // Faint continuous trail so the stream reads as one current, dashes on top
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, 0, w, h);
  let y = Math.random() * 40;
  while (y < h) {
    const len = 60 + Math.random() * 60;
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, w, len);
    y += len + 15 + Math.random() * 35;
  }
  tex.hasAlpha = true;
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.vScale = 1.2;
  tex.update();
  return tex;
}

function buildStreams(scene: Scene, entry: ClimateMeshEntry, kind: FlowKind): void {
  disposeStreams(entry);
  const drift = FLOW_DRIFT[kind];
  const id = entry.config.id;
  for (let i = 0; i < STREAM_COUNT; i++) {
    const x0 = (i / (STREAM_COUNT - 1) - 0.5) * BODY_WIDTH * 0.7;
    // Alternate heights a little so the streams don't read as a flat sheet
    const y0 = i % 2 === 0 ? 0 : -0.03;
    const path: Vector3[] = [];
    for (let s = 0; s <= STREAM_STEPS; s++) {
      const t = s / STREAM_STEPS;
      path.push(new Vector3(x0 * (1 + 0.35 * t), y0 + drift(t), t * STREAM_LENGTH));
    }
    const tex = createDashTexture(scene, `climate_${id}_dash_${i}`);
    const mat = new StandardMaterial(`climatemat_stream_${id}_${i}`, scene);
    mat.disableLighting = true;
    mat.emissiveColor = FLOW_COLORS[kind];
    mat.opacityTexture = tex;
    mat.alpha = 0.85;
    mat.backFaceCulling = false;

    // Tapers as the air disperses
    const mesh = MeshBuilder.CreateTube(`climate_${id}_stream_${i}`, {
      path,
      tessellation: 6,
      radiusFunction: (s) => STREAM_RADIUS * (1 - 0.6 * (s / STREAM_STEPS)),
      cap: 0,
    }, scene);
    mesh.material = mat;
    mesh.parent = entry.flowRoot;
    mesh.isPickable = false;
    mesh.applyFog = false;
    entry.streams.push({ mesh, mat, tex });
  }
  entry.flowKind = kind;
}

function disposeStreams(entry: ClimateMeshEntry): void {
  for (const s of entry.streams) {
    s.mesh.dispose();
    s.mat.dispose();
    s.tex.dispose();
  }
  entry.streams = [];
  entry.flowKind = null;
}

/** One per-frame observer while flowing: scroll the dashes and sweep on swing. */
function startAnimation(scene: Scene, entry: ClimateMeshEntry): void {
  if (entry.animObserver) return;
  let last = performance.now();
  entry.animObserver = scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    // Negative offset moves the dashes away from the unit, along the stream
    for (const s of entry.streams) s.tex.vOffset -= entry.flowSpeed * dt;
    entry.flowRoot.rotation.x = entry.swinging ? 0.22 * Math.sin(now / 900) : 0;
  });
}

function stopAnimation(scene: Scene, entry: ClimateMeshEntry): void {
  if (!entry.animObserver) return;
  scene.onBeforeRenderObservable.remove(entry.animObserver);
  entry.animObserver = null;
  entry.flowRoot.rotation.x = 0;
}

/**
 * Build a wall-mounted split AC unit: a white body, a dark air outlet along the
 * bottom front and a status LED. Airflow streams are created on demand by
 * `applyClimateState`. The hitbox carries `metadata.climateId` so pointer
 * handlers can open the climate modal.
 */
export function createClimateMesh(scene: Scene, cfg: ClimateConfig): ClimateMeshEntry {
  const root = new TransformNode(`climate_${cfg.id}`, scene);
  root.position = new Vector3(cfg.position.x, cfg.position.y, cfg.position.z);
  root.rotation.y = cfg.rotationY ?? 0;

  const bodyMat = new StandardMaterial(`climatemat_body_${cfg.id}`, scene);
  bodyMat.diffuseColor = new Color3(0.94, 0.95, 0.96);
  bodyMat.specularColor = new Color3(0.15, 0.15, 0.15);
  bodyMat.maxSimultaneousLights = 48;

  const body = MeshBuilder.CreateBox(`climate_${cfg.id}_body`, {
    width: BODY_WIDTH,
    height: BODY_HEIGHT,
    depth: BODY_DEPTH,
  }, scene);
  body.position.z = BODY_DEPTH / 2;
  body.material = bodyMat;
  body.parent = root;
  body.isPickable = false;
  body.applyFog = false;
  body.receiveShadows = true;
  body.enableEdgesRendering();
  body.edgesWidth = 2;
  body.edgesColor = new Color4(0, 0, 0, 1);

  // Air outlet: dark slot along the bottom front edge
  const ventMat = new StandardMaterial(`climatemat_vent_${cfg.id}`, scene);
  ventMat.diffuseColor = new Color3(0.12, 0.13, 0.15);
  ventMat.specularColor = new Color3(0, 0, 0);
  ventMat.maxSimultaneousLights = 48;

  const vent = MeshBuilder.CreateBox(`climate_${cfg.id}_vent`, {
    width: BODY_WIDTH * 0.85,
    height: 0.045,
    depth: 0.03,
  }, scene);
  vent.position = new Vector3(0, -BODY_HEIGHT / 2 + 0.04, BODY_DEPTH);
  vent.material = ventMat;
  vent.parent = root;
  vent.isPickable = false;
  vent.applyFog = false;

  // Status LED (front right): colored by the current airflow
  const ledMat = new StandardMaterial(`climatemat_led_${cfg.id}`, scene);
  ledMat.disableLighting = true;
  ledMat.emissiveColor = LED_COLORS.off;

  const led = MeshBuilder.CreateSphere(`climate_${cfg.id}_led`, { diameter: 0.025, segments: 8 }, scene);
  led.position = new Vector3(BODY_WIDTH / 2 - 0.08, BODY_HEIGHT / 2 - 0.07, BODY_DEPTH + 0.005);
  led.material = ledMat;
  led.parent = root;
  led.isPickable = false;

  const hitbox = MeshBuilder.CreateBox(`climate_hitbox_${cfg.id}`, {
    width: BODY_WIDTH + 0.1,
    height: BODY_HEIGHT + 0.1,
    depth: BODY_DEPTH + 0.1,
  }, scene);
  hitbox.position.z = BODY_DEPTH / 2;
  hitbox.parent = root;
  hitbox.visibility = 0;
  hitbox.isPickable = true;
  hitbox.metadata = { climateId: cfg.id };

  // Streams start just under the outlet, local +Z pointing into the room
  const flowRoot = new TransformNode(`climate_${cfg.id}_flow`, scene);
  flowRoot.position = new Vector3(0, -BODY_HEIGHT / 2 + 0.02, BODY_DEPTH + 0.02);
  flowRoot.parent = root;
  flowRoot.setEnabled(false);

  return {
    root, body, vent, led, hitbox, flowRoot,
    streams: [],
    flowKind: null,
    flowSpeed: BASE_FLOW_SPEED,
    swinging: false,
    animObserver: null,
    bodyMat, ventMat, ledMat,
    config: cfg,
  };
}

/** Drive LED + airflow (curve, color, speed, swing) from the HA climate state. */
export function applyClimateState(scene: Scene, entry: ClimateMeshEntry, state: HAState | null | undefined): void {
  const flow = resolveAirflow(state);
  entry.ledMat.emissiveColor = LED_COLORS[flow ?? 'off'];

  if (!flow) {
    entry.flowRoot.setEnabled(false);
    stopAnimation(scene, entry);
    return;
  }

  // The curve depends on the kind, so a kind change rebuilds the streams
  if (entry.flowKind !== flow) buildStreams(scene, entry, flow);
  const speed = fanSpeedFactor(state?.attributes.fan_mode);
  entry.flowSpeed = BASE_FLOW_SPEED * speed;
  for (const s of entry.streams) s.mat.alpha = Math.min(1, 0.6 + 0.25 * speed);
  entry.swinging = isSwinging(state?.attributes.swing_mode);
  entry.flowRoot.setEnabled(true);
  startAnimation(scene, entry);
}

export function removeClimateMesh(scene: Scene, map: ClimateMeshMap, id: string): void {
  const entry = map[id];
  if (!entry) return;
  stopAnimation(scene, entry);
  disposeStreams(entry);
  entry.flowRoot.dispose();
  entry.hitbox.dispose();
  entry.led.dispose();
  entry.vent.dispose();
  entry.body.dispose();
  entry.root.dispose();
  entry.bodyMat.dispose();
  entry.ventMat.dispose();
  entry.ledMat.dispose();
  delete map[id];
}

/** Dispose and recreate all climate meshes (editor use). */
export function rebuildAllClimateMeshes(
  scene: Scene,
  map: ClimateMeshMap,
  list: ClimateConfig[],
): void {
  Object.keys(map).forEach((id) => removeClimateMesh(scene, map, id));
  for (const cfg of list) {
    map[cfg.id] = createClimateMesh(scene, cfg);
  }
}
