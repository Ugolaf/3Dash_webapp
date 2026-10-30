import type {
  AppConfig,
  FloorConfig,
  LightConfig,
  CoverConfig,
  DisplayConfig,
  TubeConfig,
  CameraConfig,
  ClimateConfig,
  RoomSensorConfig,
} from '../types';

/**
 * Returns the floors of a config. When `floors` is absent (legacy single-model
 * configs), synthesizes one floor from the top-level flat arrays so every
 * existing config keeps working unchanged.
 */
export function getFloors(config: AppConfig): FloorConfig[] {
  if (config.floors && config.floors.length > 0) return config.floors;
  return [
    {
      id: 'default',
      name: 'Home',
      modelId: 'model',
      order: 0,
      lights: config.lights ?? [],
      lightGroups: config.lightGroups,
      displays: config.displays,
      covers: config.covers,
      shadowWalls: config.shadowWalls,
      tubes: config.tubes,
      staircases: [],
      cameras: [],
      climates: [],
      roomSensors: [],
    },
  ];
}

export function isOverviewFloor(floor: FloorConfig): boolean {
  return floor.kind === 'overview';
}

/** Floors in navigation order: the exterior overview first, then by `order`. */
export function getNavFloors(floors: FloorConfig[]): FloorConfig[] {
  return [...floors].sort((a, b) => {
    const ov = Number(isOverviewFloor(b)) - Number(isOverviewFloor(a));
    return ov !== 0 ? ov : (a.order ?? 0) - (b.order ?? 0);
  });
}

/** The floor currently shown (matches activeFloorId, else the first floor). */
export function getActiveFloor(config: AppConfig): FloorConfig {
  const floors = getFloors(config);
  return floors.find((f) => f.id === config.activeFloorId) ?? floors[0];
}

/** Look up a floor by id, falling back to the active floor. */
export function getFloorById(config: AppConfig, floorId: string | undefined): FloorConfig {
  const floors = getFloors(config);
  return floors.find((f) => f.id === floorId) ?? getActiveFloor(config);
}

/** Find a light config by entity id across all floors. */
export function findLightConfig(config: AppConfig, entityId: string): LightConfig | undefined {
  for (const floor of getFloors(config)) {
    const hit = floor.lights?.find((l) => l.entityId === entityId);
    if (hit) return hit;
  }
  return undefined;
}

/** Find a cover config by entity id across all floors. */
export function findCoverConfig(config: AppConfig, entityId: string): CoverConfig | undefined {
  for (const floor of getFloors(config)) {
    const hit = floor.covers?.find((c) => c.entityId === entityId);
    if (hit) return hit;
  }
  return undefined;
}

/** Find a display config by id across all floors. */
export function findDisplayConfig(config: AppConfig, id: string): DisplayConfig | undefined {
  for (const floor of getFloors(config)) {
    const hit = floor.displays?.find((d) => d.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** Find a tube config by id across all floors. */
export function findTubeConfig(config: AppConfig, id: string): TubeConfig | undefined {
  for (const floor of getFloors(config)) {
    const hit = floor.tubes?.find((t) => t.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** Find a camera config by its config id across all floors. */
export function findCameraConfig(config: AppConfig, id: string): CameraConfig | undefined {
  for (const floor of getFloors(config)) {
    const hit = floor.cameras?.find((c) => c.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** Find a climate unit config by its config id across all floors. */
export function findClimateConfig(config: AppConfig, id: string): ClimateConfig | undefined {
  for (const floor of getFloors(config)) {
    const hit = floor.climates?.find((c) => c.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** Find a room sensor config by its config id across all floors. */
export function findRoomSensorConfig(config: AppConfig, id: string): RoomSensorConfig | undefined {
  for (const floor of getFloors(config)) {
    const hit = floor.roomSensors?.find((r) => r.id === id);
    if (hit) return hit;
  }
  return undefined;
}

export interface CollectedEntities {
  lights: LightConfig[];
  covers: CoverConfig[];
  displays: DisplayConfig[];
  tubes: TubeConfig[];
  cameras: CameraConfig[];
  climates: ClimateConfig[];
  roomSensors: RoomSensorConfig[];
}

/**
 * Union of every floor's HA-facing entities. The HA/demo connection subscribes
 * to this union (not just the active floor) so entity state survives floor
 * switches while only the active floor has meshes.
 */
export function collectAllEntityIds(config: AppConfig): CollectedEntities {
  const floors = getFloors(config);
  const lights: LightConfig[] = [];
  const covers: CoverConfig[] = [];
  const displays: DisplayConfig[] = [];
  const tubes: TubeConfig[] = [];
  const cameras: CameraConfig[] = [];
  const climates: ClimateConfig[] = [];
  const roomSensors: RoomSensorConfig[] = [];
  const seenLights = new Set<string>();
  const seenCovers = new Set<string>();
  const seenDisplays = new Set<string>();
  const seenTubes = new Set<string>();
  const seenCameras = new Set<string>();
  const seenClimates = new Set<string>();

  for (const floor of floors) {
    for (const l of floor.lights ?? []) {
      if (!seenLights.has(l.entityId)) { seenLights.add(l.entityId); lights.push(l); }
    }
    for (const c of floor.covers ?? []) {
      if (!seenCovers.has(c.entityId)) { seenCovers.add(c.entityId); covers.push(c); }
    }
    for (const d of floor.displays ?? []) {
      if (!seenDisplays.has(d.id)) { seenDisplays.add(d.id); displays.push(d); }
    }
    for (const t of floor.tubes ?? []) {
      if (!seenTubes.has(t.id)) { seenTubes.add(t.id); tubes.push(t); }
    }
    for (const cam of floor.cameras ?? []) {
      if (!seenCameras.has(cam.entityId)) { seenCameras.add(cam.entityId); cameras.push(cam); }
    }
    for (const cl of floor.climates ?? []) {
      if (!seenClimates.has(cl.entityId)) { seenClimates.add(cl.entityId); climates.push(cl); }
    }
    // Keyed by config id: each label has its own sensors, and ids never collide across floors
    roomSensors.push(...(floor.roomSensors ?? []));
  }

  return { lights, covers, displays, tubes, cameras, climates, roomSensors };
}
