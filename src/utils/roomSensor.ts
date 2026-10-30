import type { HAState } from '../types';

/** Numeric state of a sensor, or null when it is missing / unavailable / not a number. */
export function numericState(state: HAState | null | undefined): number | null {
  if (!state) return null;
  const v = parseFloat(state.state);
  return Number.isFinite(v) ? v : null;
}

/**
 * Comfort scale stops (°C → RGB 0–255): blue when cold, green across the
 * comfort band, orange then red when hot. Colors in between are interpolated.
 */
const TEMP_STOPS: Array<[number, [number, number, number]]> = [
  [15, [96, 165, 250]],
  [18.5, [56, 189, 248]],
  [20, [52, 211, 153]],
  [23, [52, 211, 153]],
  [25.5, [251, 146, 60]],
  [28, [239, 68, 68]],
];

/** Neutral grey for a sensor without a usable value. */
const NO_VALUE_RGB: [number, number, number] = [148, 163, 184];

/** Temperature → RGB (0–255) on the comfort scale; null → neutral grey. */
export function temperatureRgb(temp: number | null): [number, number, number] {
  if (temp === null) return NO_VALUE_RGB;
  if (temp <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i];
    if (temp <= t1) {
      const [t0, c0] = TEMP_STOPS[i - 1];
      const k = (temp - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [number, number, number];
    }
  }
  return TEMP_STOPS[TEMP_STOPS.length - 1][1];
}

export function temperatureColor(temp: number | null): string {
  const [r, g, b] = temperatureRgb(temp);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Short human label for where a temperature sits on the comfort scale. */
export function comfortLabel(temp: number | null): string {
  if (temp === null) return 'No data';
  if (temp < 18) return 'Cold';
  if (temp < 20) return 'Cool';
  if (temp <= 23.5) return 'Comfortable';
  if (temp <= 26) return 'Warm';
  return 'Hot';
}

/** Unit from the sensor's attributes, defaulting to °C. */
export function temperatureUnit(state: HAState | null | undefined): string {
  const u = state?.attributes?.unit_of_measurement;
  return typeof u === 'string' && u ? u : '°C';
}
