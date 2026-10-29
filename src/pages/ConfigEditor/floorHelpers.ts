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

/** A blank floor (or exterior overview) with a unique id and its own model key. */
export function createEmptyFloor(
  name: string,
  order: number,
  kind: FloorConfig['kind'] = 'floor',
): FloorConfig {
  const id = generateUUID();
  return {
    id,
    name,
    kind,
    modelId: `model_${id}`,
    order,
    lights: [],
    lightGroups: [],
    displays: [],
    covers: [],
    shadowWalls: [],
    tubes: [],
    staircases: [],
    climates: [],
  };
}

/** id → display name lookup (for the staircase list / target dropdowns). */
export function floorNameMap(floors: FloorConfig[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of floors) map[f.id] = f.name;
  return map;
}
