import type { HAState } from '../types';

/** Kind of air the unit is blowing, or null when it isn't blowing at all. */
export type Airflow = 'warm' | 'cold' | 'neutral' | null;

/**
 * Airflow follows the HVAC mode: heat → warm, cool → cold, dry / fan → neutral.
 * Auto modes defer to `hvac_action` since only HA knows which way it is going.
 * An `idle`/`off` action means the unit is on but not running → no airflow.
 */
export function resolveAirflow(state: HAState | null | undefined): Airflow {
  if (!state) return null;
  const mode = state.state;
  if (!mode || mode === 'off' || mode === 'unavailable' || mode === 'unknown') return null;
  const action = state.attributes.hvac_action as string | undefined;
  if (action === 'idle' || action === 'off') return null;

  if (mode === 'heat') return 'warm';
  if (mode === 'cool') return 'cold';
  if (mode === 'heat_cool' || mode === 'auto') {
    if (action === 'heating' || action === 'preheating') return 'warm';
    if (action === 'cooling') return 'cold';
  }
  return 'neutral';
}

/** Relative airflow strength for a fan mode (unknown modes → 1). */
export function fanSpeedFactor(fanMode: unknown): number {
  switch (fanMode) {
    case 'quiet':
    case 'low':
      return 0.6;
    case 'medium':
    case 'middle':
      return 1;
    case 'high':
      return 1.4;
    case 'turbo':
    case 'max':
      return 1.8;
    default:
      return 1;
  }
}

/** True when the swing mode means the louvers are moving. */
export function isSwinging(swingMode: unknown): boolean {
  return typeof swingMode === 'string' && swingMode !== 'off';
}
