import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3,
  TransformNode,
  DynamicTexture,
  type LinesMesh,
  type Observer,
} from '@babylonjs/core';
import type { HAState, RoomSensorConfig } from '../types';
import { numericState, temperatureRgb, temperatureUnit } from '../utils/roomSensor';

/** Height (m) of the label center above the room's floor point. */
const LABEL_HEIGHT = 1.6;
/** Label plane size (m); the texture keeps the same 2:1 ratio. */
const LABEL_WIDTH = 0.8;
const LABEL_HEIGHT_M = 0.4;
const TEX_W = 512;
const TEX_H = 256;
const DEFAULT_TINT_RADIUS = 1.5;
/**
 * Labels grow with camera distance so they stay readable from the far
 * overview framing: real size up to this distance (m), then scaled up…
 */
const SCALE_REF_DISTANCE = 9;
/** …but never beyond this factor. */
const MAX_LABEL_SCALE = 6;

export interface RoomSensorMeshEntry {
  root: TransformNode;
  /** Billboard label; also the click target (metadata.roomSensorId). */
  label: Mesh;
  labelMat: StandardMaterial;
  labelTex: DynamicTexture;
  /** Dotted stem anchoring the floating label to its floor point. */
  stem: LinesMesh;
  /** Soft temperature-colored glow on the floor, null when disabled. */
  tint: Mesh | null;
  tintMat: StandardMaterial | null;
  tintTex: DynamicTexture | null;
  /** Keeps the label's on-screen size roughly constant as the camera zooms. */
  scaleObserver: Observer<Scene> | null;
  /** Last drawn content, so unchanged states skip the canvas redraw. */
  drawnKey: string;
  config: RoomSensorConfig;
}

export type RoomSensorMeshMap = Record<string, RoomSensorMeshEntry>;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawDroplet(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.bezierCurveTo(cx + size * 0.9, cy - size * 0.1, cx + size * 0.7, cy + size * 0.8, cx, cy + size * 0.8);
  ctx.bezierCurveTo(cx - size * 0.7, cy + size * 0.8, cx - size * 0.9, cy - size * 0.1, cx, cy - size);
  ctx.fill();
}

function drawLabel(
  entry: RoomSensorMeshEntry,
  temp: number | null,
  unit: string,
  humidity: number | null,
): void {
  const name = entry.config.label || 'Room';
  const tempText = temp === null ? '--' : temp.toFixed(1);
  const key = `${name}|${tempText}|${unit}|${humidity ?? ''}`;
  if (key === entry.drawnKey) return;
  entry.drawnKey = key;

  const [r, g, b] = temperatureRgb(temp);
  const accent = `rgb(${r}, ${g}, ${b})`;
  const ctx = entry.labelTex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, TEX_W, TEX_H);

  // Pill background with a temperature-colored rim
  const pad = 10;
  roundRect(ctx, pad, pad, TEX_W - pad * 2, TEX_H - pad * 2, 56);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = accent;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
  ctx.font = '600 42px "DM Sans", system-ui, sans-serif';
  ctx.fillText(name.length > 22 ? `${name.slice(0, 21)}…` : name, TEX_W / 2, 62, TEX_W - 80);

  const hasHumidity = humidity !== null;
  const tempY = hasHumidity ? 132 : 150;
  ctx.fillStyle = accent;
  ctx.font = 'bold 92px "DM Mono", monospace';
  const valueW = ctx.measureText(tempText).width;
  ctx.font = '600 44px "DM Mono", monospace';
  const unitW = temp === null ? 0 : ctx.measureText(unit).width + 6;
  const startX = TEX_W / 2 - (valueW + unitW) / 2;
  ctx.textAlign = 'left';
  ctx.font = 'bold 92px "DM Mono", monospace';
  ctx.fillText(tempText, startX, tempY);
  if (temp !== null) {
    ctx.font = '600 44px "DM Mono", monospace';
    ctx.fillText(unit, startX + valueW + 6, tempY - 18);
  }

  if (hasHumidity) {
    ctx.fillStyle = 'rgba(125, 211, 252, 0.95)';
    ctx.font = '600 34px "DM Mono", monospace';
    const text = `${Math.round(humidity)} %`;
    const w = ctx.measureText(text).width;
    const x = TEX_W / 2 - (w + 30) / 2;
    drawDroplet(ctx, x + 10, 200, 14);
    ctx.fillText(text, x + 30, 202);
  }

  entry.labelTex.update();
}

function createTintTexture(scene: Scene, id: string): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture(`room_tint_tex_${id}`, { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.hasAlpha = true;
  tex.update();
  return tex;
}

export function createRoomSensorMesh(scene: Scene, cfg: RoomSensorConfig): RoomSensorMeshEntry {
  const root = new TransformNode(`room_sensor_${cfg.id}`, scene);
  root.position = new Vector3(cfg.position.x, cfg.position.y, cfg.position.z);

  const labelTex = new DynamicTexture(`room_label_tex_${cfg.id}`, { width: TEX_W, height: TEX_H }, scene, true);
  labelTex.hasAlpha = true;
  const labelMat = new StandardMaterial(`room_label_mat_${cfg.id}`, scene);
  labelMat.diffuseTexture = labelTex;
  labelMat.emissiveTexture = labelTex;
  labelMat.useAlphaFromDiffuseTexture = true;
  labelMat.disableLighting = true;
  labelMat.backFaceCulling = false;
  labelMat.specularColor = Color3.Black();

  const label = MeshBuilder.CreatePlane(`room_label_${cfg.id}`, { width: LABEL_WIDTH, height: LABEL_HEIGHT_M }, scene);
  label.parent = root;
  label.position.y = LABEL_HEIGHT;
  label.billboardMode = Mesh.BILLBOARDMODE_ALL;
  label.material = labelMat;
  label.isPickable = true;
  label.metadata = { roomSensorId: cfg.id };

  const stem = MeshBuilder.CreateDashedLines(`room_stem_${cfg.id}`, {
    points: [new Vector3(0, 0.02, 0), new Vector3(0, LABEL_HEIGHT - LABEL_HEIGHT_M / 2, 0)],
    dashNb: 12,
    dashSize: 2,
    gapSize: 2,
  }, scene);
  stem.parent = root;
  stem.isPickable = false;
  stem.alpha = 0.45;

  const radius = cfg.tintRadius ?? DEFAULT_TINT_RADIUS;
  let tint: Mesh | null = null;
  let tintMat: StandardMaterial | null = null;
  let tintTex: DynamicTexture | null = null;
  if (radius > 0) {
    tintTex = createTintTexture(scene, cfg.id);
    tintMat = new StandardMaterial(`room_tint_mat_${cfg.id}`, scene);
    tintMat.disableLighting = true;
    tintMat.opacityTexture = tintTex;
    tintMat.backFaceCulling = false;
    tintMat.specularColor = Color3.Black();
    tint = MeshBuilder.CreateDisc(`room_tint_${cfg.id}`, { radius, tessellation: 48 }, scene);
    tint.parent = root;
    tint.rotation.x = Math.PI / 2;
    // Slightly above the floor to avoid z-fighting with the model's slab
    tint.position.y = 0.015;
    tint.material = tintMat;
    tint.isPickable = false;
  }

  const scaleObserver = scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera;
    if (!cam) return;
    const dist = Vector3.Distance(cam.globalPosition, label.getAbsolutePivotPoint());
    const k = Math.min(MAX_LABEL_SCALE, Math.max(1, dist / SCALE_REF_DISTANCE));
    if (Math.abs(label.scaling.x - k) < 0.01) return;
    label.scaling.setAll(k);
    // Grow upward from the stem's tip so a big label never sinks into the floor
    label.position.y = LABEL_HEIGHT - LABEL_HEIGHT_M / 2 + (LABEL_HEIGHT_M * k) / 2;
  });

  const entry: RoomSensorMeshEntry = {
    root, label, labelMat, labelTex, stem, tint, tintMat, tintTex, scaleObserver, drawnKey: '', config: cfg,
  };
  applyRoomSensorState(entry, undefined, undefined);
  return entry;
}

/** Redraw the label and recolor the floor glow from the latest sensor states. */
export function applyRoomSensorState(
  entry: RoomSensorMeshEntry,
  tempState: HAState | undefined,
  humidityState: HAState | undefined,
): void {
  const temp = numericState(tempState);
  const humidity = entry.config.humidityEntityId ? numericState(humidityState) : null;
  drawLabel(entry, temp, temperatureUnit(tempState), humidity);

  const [r, g, b] = temperatureRgb(temp);
  const color = new Color3(r / 255, g / 255, b / 255);
  entry.stem.color = color;
  if (entry.tintMat) {
    entry.tintMat.emissiveColor = color;
    entry.tintMat.diffuseColor = color;
  }
}

export function removeRoomSensorMesh(map: RoomSensorMeshMap, id: string): void {
  const entry = map[id];
  if (!entry) return;
  entry.scaleObserver?.remove();
  entry.label.dispose();
  entry.stem.dispose();
  entry.tint?.dispose();
  entry.root.dispose();
  entry.labelMat.dispose();
  entry.labelTex.dispose();
  entry.tintMat?.dispose();
  entry.tintTex?.dispose();
  delete map[id];
}

/** Dispose and recreate all room sensor meshes (editor use). */
export function rebuildAllRoomSensorMeshes(scene: Scene, map: RoomSensorMeshMap, list: RoomSensorConfig[]): void {
  Object.keys(map).forEach((id) => removeRoomSensorMesh(map, id));
  for (const cfg of list) {
    map[cfg.id] = createRoomSensorMesh(scene, cfg);
  }
}
