import { generateUUID } from '../../utils/uuid';
import type { FloorConfig } from '../../types';

/** Merge a partial update into one floor, returning a new floors array. */
export function patchFloor(
  floors: FloorConfig[],
  floorId: string,
  patch: Partial<FloorConfig>,
): FloorConfig[] {
  return floors.map((f) => (f.id === floorId ? { ...f, ...patch } : f));
}

/** A blank floor with a unique id and its own model key. */
export function createEmptyFloor(name: string, order: number): FloorConfig {
  const id = generateUUID();
  return {
    id,
    name,
    modelId: `model_${id}`,
    order,
    lights: [],
    lightGroups: [],
    displays: [],
    covers: [],
    shadowWalls: [],
    tubes: [],
    staircases: [],
  };
}

/** id → display name lookup (for the staircase list / target dropdowns). */
export function floorNameMap(floors: FloorConfig[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of floors) map[f.id] = f.name;
  return map;
}
