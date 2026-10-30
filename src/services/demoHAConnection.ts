import type { CoverConfig, HAState, LightConfig, LightType } from "../types";
import type { HACallbacks } from "./haWebSocket";
import { isSimulationActive } from "../contexts/SimulationModeContext";

const STORAGE_KEY = "demoLightStates";

/** Starting point for demo split ACs (any climate.* not listed falls back to "cool"). */
const DEMO_CLIMATES: Record<string, { mode: string; current: number; target: number }> = {
  "climate.living_room": { mode: "cool", current: 24.5, target: 22 },
  "climate.bedroom": { mode: "heat", current: 18.5, target: 21 },
};

/** Which way an auto/heat_cool unit is running, like a real thermostat would report. */
function demoHvacAction(mode: string, current: number, target: number): string {
  switch (mode) {
    case "off": return "off";
    case "heat": return "heating";
    case "cool": return "cooling";
    case "dry": return "drying";
    case "fan_only": return "fan";
    default: return current < target ? "heating" : "cooling";
  }
}

function demoClimateAttributes(mode: string, current: number, target: number): Record<string, unknown> {
  return {
    hvac_modes: ["off", "heat", "cool", "heat_cool", "dry", "fan_only"],
    fan_modes: ["auto", "low", "medium", "high"],
    swing_modes: ["off", "vertical"],
    fan_mode: "auto",
    swing_mode: "off",
    current_temperature: current,
    temperature: target,
    min_temp: 16,
    max_temp: 30,
    target_temp_step: 0.5,
    hvac_action: demoHvacAction(mode, current, target),
  };
}

function loadPersistedStates(): Record<string, HAState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistStates(states: Map<string, HAState>): void {
  const obj: Record<string, HAState> = {};
  for (const [id, s] of states) {
    // Only persist light/switch/cover entities, not sensors
    if (
      id.startsWith("light.") ||
      id.startsWith("switch.") ||
      id.startsWith("cover.")
    ) {
      obj[id] = s;
    }
  }
  if (!isSimulationActive()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }
}

/** Random RGB in the blue-to-red range, with even visual distribution. */
function randomBlueToRed(): [number, number, number] {
  // Equal-probability zones so blue and red aren't drowned out by pink/purple
  const zone = Math.random();
  let hue: number;
  if (zone < 0.33)
    hue = 240 + Math.random() * 30; // 240-270: blues
  else if (zone < 0.66)
    hue = 280 + Math.random() * 40; // 280-320: purples
  else hue = 330 + Math.random() * 30; // 330-360: reds

  const s = 0.8 + Math.random() * 0.2; // 80-100% saturation
  // HSL to RGB (lightness fixed at 50%)
  const c = s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 0.5 - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (hue < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/** Fluctuation config: base value ± range, with optional decimal places. */
const SENSOR_FLUCTUATION: Record<
  string,
  { base: number; range: number; decimals?: number }
> = {
  "sensor.temp_hum_sensor_temperature": { base: 21.3, range: 0.4, decimals: 1 },
  "sensor.temp_hum_sensor_humidity": { base: 54, range: 3 },
  "sensor.indoor_temperature": { base: 21.3, range: 0.4, decimals: 1 },
  "sensor.indoor_humidity": { base: 54, range: 3 },
  "sensor.home_power": { base: 1842, range: 200 },
  "sensor.indoor_co2": { base: 623, range: 40 },
  "sensor.download_speed": { base: 45, range: 30, decimals: 1 },
  "sensor.upload_speed": { base: 13, range: 8, decimals: 1 },
  "sensor.water_flow": { base: 3.4, range: 2, decimals: 1 },
  "sensor.living_room_temperature": { base: 24.4, range: 0.2, decimals: 1 },
  "sensor.living_room_humidity": { base: 47, range: 1 },
  "sensor.bedroom_temperature": { base: 18.6, range: 0.2, decimals: 1 },
  "sensor.bedroom_humidity": { base: 56, range: 1 },
  "sensor.garden_temperature": { base: 13.6, range: 0.3, decimals: 1 },
};

/**
 * Fake HA connection for demo mode.
 * Maintains light states in localStorage so they survive page reloads.
 */
export class DemoHAConnection {
  private callbacks: HACallbacks;
  private states = new Map<string, HAState>();
  private lightTypes = new Map<string, LightType>();
  private disposed = false;
  private sensorInterval: number | null = null;
  private coverTimers = new Map<string, number>();

  constructor(callbacks: HACallbacks) {
    this.callbacks = callbacks;
  }

  /** Bootstrap demo states from the loaded config entity IDs. */
  start(
    lightConfigs: LightConfig[],
    sensorEntityIds: string[],
    coverConfigs: CoverConfig[] = [],
    alarmEntityId?: string,
  ): void {
    if (this.disposed) return;

    // Alarm panel starts disarmed; the sidebar button toggles it.
    if (alarmEntityId) {
      this.states.set(alarmEntityId, {
        entity_id: alarmEntityId,
        state: 'disarmed',
        attributes: {},
      });
    }

    const persisted = loadPersistedStates();

    // Store light types and restore persisted states or default to "off"
    for (const lc of lightConfigs) {
      this.lightTypes.set(lc.entityId, lc.type);
      this.states.set(
        lc.entityId,
        persisted[lc.entityId] ?? {
          entity_id: lc.entityId,
          state: "off",
          attributes: { brightness: 0 },
        },
      );
    }

    // Covers default to fully open
    for (const cc of coverConfigs) {
      const saved = persisted[cc.entityId];
      // Never restore a transient moving state
      const state =
        saved && (saved.state === "open" || saved.state === "closed")
          ? saved
          : null;
      this.states.set(
        cc.entityId,
        state ?? {
          entity_id: cc.entityId,
          state: "open",
          attributes: { current_position: 100 },
        },
      );
    }

    // Demo sensor values — realistic defaults for common entity IDs
    const sensorDefaults: Record<
      string,
      { state: string; attributes: Record<string, unknown> }
    > = {
      "sensor.temp_hum_sensor_temperature": { state: "21.3", attributes: {} },
      "sensor.temp_hum_sensor_humidity": { state: "54", attributes: {} },
      "sensor.indoor_temperature": { state: "21.3", attributes: {} },
      "sensor.indoor_humidity": { state: "54", attributes: {} },
      "sensor.home_power": { state: "1842", attributes: {} },
      "sensor.indoor_co2": { state: "623", attributes: {} },
      "sensor.download_speed": { state: "45.2", attributes: {} },
      "sensor.upload_speed": { state: "12.8", attributes: {} },
      "sensor.water_flow": { state: "3.4", attributes: {} },
      "sensor.living_room_temperature": { state: "24.4", attributes: { unit_of_measurement: "°C", device_class: "temperature" } },
      "sensor.living_room_humidity": { state: "47", attributes: { unit_of_measurement: "%", device_class: "humidity" } },
      "sensor.bedroom_temperature": { state: "18.6", attributes: { unit_of_measurement: "°C", device_class: "temperature" } },
      "sensor.bedroom_humidity": { state: "56", attributes: { unit_of_measurement: "%", device_class: "humidity" } },
      "sensor.garden_temperature": { state: "13.6", attributes: { unit_of_measurement: "°C", device_class: "temperature" } },
      "climate.thermostat": {
        state: "heat",
        attributes: {
          temperature: 20,
          current_temperature: 21.3,
          hvac_mode: "heat",
          min_temp: 7,
          max_temp: 30,
        },
      },
    };
    for (const id of sensorEntityIds) {
      if (id.startsWith("climate.") && !sensorDefaults[id]) {
        const c = DEMO_CLIMATES[id] ?? { mode: "cool", current: 24, target: 22 };
        this.states.set(id, {
          entity_id: id,
          state: c.mode,
          attributes: demoClimateAttributes(c.mode, c.current, c.target),
        });
        continue;
      }
      const defaults = sensorDefaults[id];
      this.states.set(id, {
        entity_id: id,
        state: defaults?.state ?? "0",
        attributes: defaults?.attributes ?? {},
      });
    }

    // Periodically fluctuate sensor values so the demo feels alive
    this.sensorInterval = window.setInterval(() => {
      if (this.disposed) return;
      for (const id of sensorEntityIds) {
        const current = this.states.get(id);
        if (!current || id.startsWith("climate.")) continue;
        const cfg = SENSOR_FLUCTUATION[id];
        if (!cfg) continue;
        const base = cfg.base;
        const jitter = (Math.random() - 0.5) * 2 * cfg.range;
        const value = Math.max(0, base + jitter);
        const formatted =
          cfg.decimals != null
            ? value.toFixed(cfg.decimals)
            : String(Math.round(value));
        this.updateState(id, formatted, current.attributes);
      }
    }, 3000);

    this.callbacks.onStatusChanged?.("connected");
    this.callbacks.onInitialStates?.([...this.states.values()]);
  }

  async callService(
    domain: string,
    service: string,
    entityId: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    if (this.disposed) return;

    // Script calls: simulate 1.5s delay
    if (domain === "script") {
      await new Promise((r) => setTimeout(r, 1500));
      return;
    }

    // Alarm panel: any button press toggles disarmed ↔ triggered (demo).
    if (domain === "alarm_control_panel") {
      const current = this.states.get(entityId);
      const next = current?.state === "triggered" ? "disarmed" : "triggered";
      this.updateState(entityId, next, {});
      return;
    }

    // Climate service calls
    if (domain === "climate") {
      const current = this.states.get(entityId);
      const attrs = { ...(current?.attributes ?? {}) };
      let mode = current?.state ?? "heat";
      if (service === "set_temperature" && data?.temperature !== undefined) {
        attrs.temperature = data.temperature;
      } else if (service === "set_hvac_mode" && data?.hvac_mode !== undefined) {
        attrs.hvac_mode = data.hvac_mode;
        mode = data.hvac_mode as string;
      } else if (service === "set_fan_mode" && data?.fan_mode !== undefined) {
        attrs.fan_mode = data.fan_mode;
      } else if (service === "set_swing_mode" && data?.swing_mode !== undefined) {
        attrs.swing_mode = data.swing_mode;
      } else if (service === "turn_off") {
        mode = "off";
      } else if (service === "turn_on" && mode === "off") {
        mode = "cool";
      } else {
        return;
      }
      // Only units created with an action (split ACs) report hvac_action
      if ("hvac_action" in attrs) {
        attrs.hvac_action = demoHvacAction(
          mode,
          Number(attrs.current_temperature ?? 21),
          Number(attrs.temperature ?? 21),
        );
      }
      this.updateState(entityId, mode, attrs);
      return;
    }

    // Cover service calls — simulate gradual movement
    if (domain === "cover") {
      const current = this.states.get(entityId);
      const pos =
        (current?.attributes.current_position as number | undefined) ??
        (current?.state === "closed" ? 0 : 100);
      if (service === "open_cover") {
        this.moveCover(entityId, 100);
      } else if (service === "close_cover") {
        this.moveCover(entityId, 0);
      } else if (
        service === "set_cover_position" &&
        data?.position !== undefined
      ) {
        this.moveCover(
          entityId,
          Math.min(Math.max(data.position as number, 0), 100),
        );
      } else if (service === "stop_cover") {
        this.stopCover(entityId, pos);
      } else if (service === "toggle") {
        // HA semantics: anything but fully closed toggles to closed
        this.moveCover(entityId, pos > 0 ? 0 : 100);
      }
      return;
    }

    const current = this.states.get(entityId);
    const attrs = { ...(current?.attributes ?? {}) };

    if (service === "toggle") {
      const wasOn = current?.state === "on";
      if (wasOn) {
        this.updateState(entityId, "off", { ...attrs, brightness: 0 });
      } else {
        const onAttrs = { ...attrs, brightness: attrs.brightness || 255 };
        const lt = this.lightTypes.get(entityId);
        if (lt === "rgb" || lt === "rgbw") {
          onAttrs.rgb_color = randomBlueToRed();
        }
        this.updateState(entityId, "on", onAttrs);
      }
      return;
    }

    if (service === "turn_on") {
      if (data?.brightness !== undefined)
        attrs.brightness = data.brightness as number;
      if (!attrs.brightness) attrs.brightness = 255;
      if (data?.rgb_color !== undefined)
        attrs.rgb_color = data.rgb_color as [number, number, number];
      if (data?.color_temp !== undefined)
        attrs.color_temp = data.color_temp as number;
      if (data?.white_value !== undefined)
        attrs.white_value = data.white_value as number;
      this.updateState(entityId, "on", attrs);
      return;
    }

    if (service === "turn_off") {
      this.updateState(entityId, "off", { ...attrs, brightness: 0 });
      return;
    }
  }

  /** Animate a cover toward a target position, emitting opening/closing updates. */
  private moveCover(entityId: string, target: number): void {
    this.stopTimer(entityId);
    const current = this.states.get(entityId);
    let pos =
      (current?.attributes.current_position as number | undefined) ??
      (current?.state === "closed" ? 0 : 100);
    if (pos === target) return;

    const TICK_MS = 120;
    const STEP = 100 / (2200 / TICK_MS); // full travel ≈ 2.2s, matches the 3D animation
    const movingState = target > pos ? "opening" : "closing";
    this.updateState(entityId, movingState, {
      current_position: Math.round(pos),
    });

    const timer = window.setInterval(() => {
      if (this.disposed) return;
      const delta = target - pos;
      if (Math.abs(delta) <= STEP) {
        pos = target;
        this.stopTimer(entityId);
        this.updateState(entityId, pos === 0 ? "closed" : "open", {
          current_position: Math.round(pos),
        });
        return;
      }
      pos += Math.sign(delta) * STEP;
      this.updateState(entityId, movingState, {
        current_position: Math.round(pos),
      });
    }, TICK_MS);
    this.coverTimers.set(entityId, timer);
  }

  /** Halt a moving cover at its current position. */
  private stopCover(entityId: string, pos: number): void {
    this.stopTimer(entityId);
    this.updateState(entityId, pos === 0 ? "closed" : "open", {
      current_position: Math.round(pos),
    });
  }

  private stopTimer(entityId: string): void {
    const timer = this.coverTimers.get(entityId);
    if (timer !== undefined) {
      clearInterval(timer);
      this.coverTimers.delete(entityId);
    }
  }

  private updateState(
    entityId: string,
    state: string,
    attributes: Record<string, unknown>,
  ): void {
    const newState: HAState = { entity_id: entityId, state, attributes };
    this.states.set(entityId, newState);
    persistStates(this.states);
    this.callbacks.onStateChanged?.(entityId, newState);
  }

  async request(msg: Record<string, unknown>): Promise<unknown> {
    if (msg.type === "history/history_during_period") return this.demoHistory(msg);
    // Other arbitrary WS requests aren't simulated
    return {};
  }

  /**
   * Synthetic minimal_response history: a daily sine around each entity's
   * current value (wider swing for humidity) so graphs line up with the label.
   */
  private demoHistory(msg: Record<string, unknown>): Record<string, Array<{ s: string; lu: number }>> {
    const ids = Array.isArray(msg.entity_ids) ? msg.entity_ids.filter((i): i is string => typeof i === "string") : [];
    const end = Date.parse(String(msg.end_time)) || Date.now();
    const start = Date.parse(String(msg.start_time)) || end - 24 * 3600_000;
    const count = 144;
    const result: Record<string, Array<{ s: string; lu: number }>> = {};
    for (const id of ids) {
      const current = parseFloat(this.states.get(id)?.state ?? "");
      const center = Number.isFinite(current) ? current : 21;
      const humid = id.includes("humid");
      const amp = humid ? 4 : 1.5;
      const points: Array<{ s: string; lu: number }> = [];
      for (let i = 0; i <= count; i++) {
        const t = start + ((end - start) * i) / count;
        const hours = t / 3600_000;
        // Peak mid-afternoon for temperature, early morning for humidity
        const phase = humid ? 4 : 15;
        const wave = Math.cos((2 * Math.PI * (hours - phase)) / 24);
        // Anchor the last sample on the live value
        const value = center + amp * (wave - Math.cos((2 * Math.PI * (end / 3600_000 - phase)) / 24));
        points.push({ s: value.toFixed(1), lu: t / 1000 });
      }
      result[id] = points;
    }
    return result;
  }

  get isConnected(): boolean {
    return !this.disposed;
  }

  /** No-op: the demo adapter has no real socket to reconnect. */
  forceReconnect(): void {}

  dispose(): void {
    this.disposed = true;
    if (this.sensorInterval != null) {
      clearInterval(this.sensorInterval);
      this.sensorInterval = null;
    }
    for (const timer of this.coverTimers.values()) clearInterval(timer);
    this.coverTimers.clear();
    this.states.clear();
  }
}
