import type {
  AppConfig,
  LightConfig,
  CoverConfig,
  ShadowWallConfig,
  TubeConfig,
  LightGroup,
} from "../types";
import type { AppSettings } from "../services/settingsStore";

// Light-group ids (shared across floors for readability).
const GROUP_KITCHEN = "40ba9c4b-5b0e-457a-88c5-e36820c53aea";
const GROUP_BATHROOM = "12c4feab-d994-4335-b988-0e0bbb7c9e50";
const GROUP_BEDROOM = "9c45a194-9387-4092-9639-45a603d4f647";
const GROUP_PATIO = "8686bae5-c0e4-4c6a-a277-7d149c37780a";
const GROUP_LIVING = "1a2a8c38-32e6-4f25-b6cb-47a42009b96e";

const SIM_LIGHTS: LightConfig[] = [
  {
    entityId: "light.bedroom_roof",
    label: "Bedroom Roof",
    type: "warmCold",
    shape: "sphere",
    size: { diameter: 0.5 },
    position: { x: -1.913, y: 2.991, z: -2.085 },
    brightness: 1,
    hitbox: {
      shape: "sphere",
      size: { diameter: 0.8 },
      position: { x: -1.913, y: 2.991, z: -2.085 },
    },
    group: GROUP_BEDROOM,
  },
  {
    entityId: "light.bathroom",
    label: "Bathroom",
    type: "toggle",
    shape: "cube",
    size: { width: 1.25, height: 0.2, depth: 0.2 },
    position: { x: -1.86, y: 2.357, z: -6.285 },
    warmth: 4900,
    brightness: 1,
    hitbox: {
      shape: "cube",
      size: { width: 1.75, height: 0.5, depth: 0.6 },
      position: { x: -1.86, y: 2.357, z: -6.106 },
    },
    group: GROUP_BATHROOM,
  },
  {
    entityId: "light.kitchen_sink",
    label: "Kitchen Sink",
    type: "toggle",
    shape: "cube",
    size: { width: 1.25, height: 0.2, depth: 0.2 },
    position: { x: -1.034, y: 2.553, z: -7.791 },
    warmth: 4100,
    brightness: 1,
    hitbox: {
      shape: "cube",
      size: { width: 1.4, height: 0.55, depth: 0.65 },
      position: { x: -1.034, y: 2.553, z: -7.952 },
    },
    group: GROUP_KITCHEN,
  },
  {
    entityId: "light.bedroom_bed",
    label: "Bedroom Bed",
    type: "rgb",
    shape: "cube",
    size: { width: 0.15, height: 0.15, depth: 1.85 },
    position: { x: -3.624, y: 1.303, z: -1.817 },
    brightness: 1,
    hitbox: {
      shape: "cube",
      size: { width: 1.35, height: 0.4, depth: 1.9 },
      position: { x: -2.995, y: 0.884, z: -1.817 },
    },
    group: GROUP_BEDROOM,
  },
  {
    entityId: "light.living_table",
    label: "Living table",
    type: "rgbw",
    shape: "cube",
    size: { width: 2.1, height: 0.1, depth: 2.1 },
    position: { x: -6.025, y: 1.578, z: -7.446 },
    brightness: 1.5,
    hitbox: {
      shape: "cube",
      size: { width: 2.3, height: 0.6, depth: 2.3 },
      position: { x: -6.025, y: 1.809, z: -7.446 },
    },
    group: GROUP_LIVING,
  },
  {
    entityId: "light.patio",
    label: "Patio",
    type: "toggle",
    shape: "sphere",
    size: { diameter: 0.4 },
    position: { x: -4.543, y: 2.85, z: 0.23 },
    warmth: 2500,
    brightness: 1,
    hitbox: {
      shape: "sphere",
      size: { diameter: 0.95 },
      position: { x: -4.559, y: 2.82, z: 0.149 },
    },
    group: GROUP_PATIO,
  },
  {
    entityId: "light.living_roof",
    label: "Living roof",
    type: "warmCold",
    shape: "cube",
    size: { width: 0.5, height: 0.1, depth: 2.1 },
    position: { x: -6.158, y: 3.011, z: -2.458 },
    brightness: 1,
    hitbox: {
      shape: "cube",
      size: { width: 1.1, height: 0.5, depth: 2.75 },
      position: { x: -6.137, y: 2.989, z: -2.438 },
    },
    group: GROUP_LIVING,
  },
  {
    entityId: "light.kitchen_roof",
    label: "Kitchen Roof",
    type: "dimmeable",
    shape: "sphere",
    size: { diameter: 0.25 },
    position: { x: -1.585, y: 2.97, z: -9.5 },
    warmth: 3000,
    brightness: 1,
    hitbox: {
      shape: "sphere",
      size: { diameter: 0.7 },
      position: { x: -1.585, y: 2.97, z: -9.018 },
    },
    group: GROUP_KITCHEN,
  },
];

// One roller shutter per window opening of the demo model
// (positions measured from the GLB wall geometry).
const SIM_COVERS: CoverConfig[] = [
  {
    entityId: "cover.bathroom_window",
    label: "Bathroom Window",
    position: { x: 0, y: 1.85, z: -5.15 },
    normal: { x: 1, y: 0, z: 0 },
    width: 1.35,
    height: 1.25,
  },
  {
    entityId: "cover.kitchen_window",
    label: "Kitchen Window",
    position: { x: 0, y: 1.95, z: -9.265 },
    normal: { x: 1, y: 0, z: 0 },
    width: 0.65,
    height: 0.6,
  },
  {
    entityId: "cover.living_bay",
    label: "Living Bay",
    position: { x: -6.06, y: 1.35, z: -10.24 },
    normal: { x: 0, y: 0, z: -1 },
    width: 2.95,
    height: 2.2,
  },
];

const SIM_WALLS: ShadowWallConfig[] = [
  {
    id: "5a31101b-e20c-4c78-be48-83d1fe5e0fd7",
    label: "Roof",
    position: { x: -4.488, y: 3.132, z: -5.121 },
    size: { width: 8.91, height: 0.01, depth: 10.11 },
  },
  {
    id: "8677b9d5-f670-4309-9d7d-0ebb4f543705",
    label: "Wall",
    position: { x: -0.036, y: 1.218, z: -7.065 },
    size: { width: 0.01, height: 2.11, depth: 1.16 },
  },
];

const SIM_GROUPS: LightGroup[] = [
  { id: GROUP_KITCHEN, name: "KITCHEN" },
  { id: GROUP_BATHROOM, name: "Bathroom" },
  { id: GROUP_BEDROOM, name: "Bedroom" },
  { id: GROUP_PATIO, name: "patio" },
  { id: GROUP_LIVING, name: "living" },
];

const SIM_TUBES: TubeConfig[] = [
  {
    id: "sim-tube-internet",
    label: "Internet",
    originDirection: "right",
    diameter: 0.2,
    fontSize: 120,
    gap: 0.5,
    endX: -1.5,
    endZ: -5.0,
    labelPosition: 0.9,
    labelHeight: 0.4,
    lines: [
      {
        sensorId: "sensor.download_speed",
        color: "#03f4fc",
        icon: "ArrowDown",
        inputUnit: "mb",
        particles: true,
        particleDirection: "inward",
        particleSpeed: 1.5,
        particleMaxValue: 500,
      },
      {
        sensorId: "sensor.upload_speed",
        color: "#24fc03",
        icon: "ArrowUp",
        inputUnit: "mb",
        particles: true,
        particleDirection: "outward",
        particleSpeed: 1.2,
        particleMaxValue: 200,
      },
    ],
  },
  {
    id: "sim-tube-water",
    label: "Water",
    originDirection: "left",
    diameter: 0.4,
    fontSize: 120,
    gap: 0.14,
    endX: -8.5,
    endZ: -7.0,
    labelPosition: 0.9,
    labelHeight: 0.35,
    lines: [
      {
        sensorId: "sensor.water_flow",
        color: "#034efc",
        icon: "Droplet",
        displayUnit: "L/min",
        precision: 1,
        particles: true,
        particleDirection: "inward",
        particleSpeed: 1,
        particleMaxValue: 20,
      },
    ],
  },
];

// Entity ids that live on the upper floor (everything else is ground floor).
const UPSTAIRS_LIGHT_IDS = new Set(["light.bedroom_roof", "light.bathroom", "light.bedroom_bed"]);
const UPSTAIRS_GROUP_IDS = new Set([GROUP_BEDROOM, GROUP_BATHROOM]);

/**
 * Premade config for simulation mode. Split into two floors that reuse the same
 * demo GLB (modelId "sim") so the multi-floor navigation can be demonstrated:
 * a staircase on each floor links to the other with a smooth fade transition.
 */
export const SIMULATION_CONFIG: AppConfig = {
  location: {
    latitude: 43.6077,
    longitude: 3.8766,
  },
  onboarding: { completed: true },
  // Top-level entity arrays are unused when `floors` is present (getFloors
  // treats floors as authoritative); kept empty to satisfy AppConfig.
  lights: [],
  activeFloorId: "ground",
  floors: [
    {
      id: "ground",
      name: "Ground Floor",
      modelId: "sim",
      order: 0,
      lights: SIM_LIGHTS.filter((l) => !UPSTAIRS_LIGHT_IDS.has(l.entityId)),
      lightGroups: SIM_GROUPS.filter((g) => !UPSTAIRS_GROUP_IDS.has(g.id)),
      covers: SIM_COVERS.filter((c) => c.entityId !== "cover.bathroom_window"),
      shadowWalls: SIM_WALLS,
      tubes: SIM_TUBES,
      staircases: [
        {
          id: "sim-stair-up",
          style: "up",
          targetFloorId: "upstairs",
          position: { x: -3.4, y: 0, z: -4.2 },
          rotationY: 0,
          label: "Upstairs",
        },
      ],
      cameras: [
        {
          id: "sim-cam-living",
          entityId: "camera.living_room",
          label: "Living Room",
          position: { x: -6.0, y: 2.95, z: -6.0 },
          rotationY: 0,
        },
        {
          // Wall-mounted high on the living-room west wall, angled down into
          // the room (like a real CCTV) so it reads clearly from above.
          id: "sim-cam-entrance",
          entityId: "camera.living_wall",
          label: "Living (wall)",
          position: { x: -8.65, y: 2.55, z: -2.6 },
          rotationY: -Math.PI / 2,
          tilt: Math.PI / 3,
        },
      ],
    },
    {
      id: "upstairs",
      name: "Upstairs",
      modelId: "sim",
      order: 1,
      lights: SIM_LIGHTS.filter((l) => UPSTAIRS_LIGHT_IDS.has(l.entityId)),
      lightGroups: SIM_GROUPS.filter((g) => UPSTAIRS_GROUP_IDS.has(g.id)),
      covers: SIM_COVERS.filter((c) => c.entityId === "cover.bathroom_window"),
      shadowWalls: SIM_WALLS.filter((w) => w.label === "Roof"),
      tubes: [],
      staircases: [
        {
          id: "sim-stair-down",
          style: "down",
          targetFloorId: "ground",
          position: { x: -3.4, y: 0, z: -4.2 },
          rotationY: 0,
          label: "Ground Floor",
        },
      ],
      cameras: [
        {
          id: "sim-cam-bedroom",
          entityId: "camera.bedroom",
          label: "Bedroom",
          position: { x: -2.6, y: 2.85, z: -2.6 },
          rotationY: 0,
        },
      ],
    },
  ],
  sidePanel: {
    columns: 4,
    rowHeight: 56,
    cards: [
      // ── Indicator cards ──
      {
        id: "sim-indicator-temp",
        type: "indicator" as const,
        title: "Temperature",
        showTitle: true,
        entityId: "sensor.indoor_temperature",
        unit: "°C",
        precision: 1,
        icon: "Thermometer",
        layout: { x: 0, y: 2, w: 4, h: 2 },
      },
      {
        id: "sim-indicator-humidity",
        type: "indicator" as const,
        title: "Humidity",
        showTitle: true,
        entityId: "sensor.indoor_humidity",
        unit: "%",
        precision: 0,
        icon: "Droplets",
        layout: { x: 2, y: 1, w: 2, h: 2 },
      },
      {
        id: "sim-indicator-power",
        type: "indicator" as const,
        title: "Power",
        showTitle: true,
        entityId: "sensor.home_power",
        unit: "W",
        precision: 0,
        icon: "Zap",
        layout: { x: 0, y: 0, w: 1, h: 2 },
      },
      {
        id: "sim-indicator-co2",
        type: "indicator" as const,
        title: "CO₂",
        showTitle: true,
        entityId: "sensor.indoor_co2",
        unit: "ppm",
        precision: 0,
        icon: "Wind",
        layout: { x: 1, y: 0, w: 1, h: 2 },
      },
      // ── Graph card ──
      {
        id: "sim-graph-temp",
        type: "graph" as const,
        title: "Temperature (24h)",
        showTitle: true,
        entityId: "sensor.indoor_temperature",
        period: "24h",
        layout: { x: 0, y: 2, w: 4, h: 3 },
      },
      // ── Script / action cards ──
      {
        id: "sim-script-goodnight",
        type: "script" as const,
        title: "Good Night",
        showTitle: true,
        entityId: "script.goodnight",
        icon: "Moon",
        layout: { x: 0, y: 5, w: 2, h: 1 },
      },
      {
        id: "sim-script-movie",
        type: "script" as const,
        title: "Movie Mode",
        showTitle: true,
        entityId: "script.movie_mode",
        icon: "Clapperboard",
        layout: { x: 2, y: 5, w: 2, h: 1 },
      },
    ],
  },
};

/**
 * Premade settings for simulation mode.
 */
export const SIMULATION_SETTINGS: AppSettings = {
  connection: {
    mode: "demo",
    haSettings: { url: "", port: 8123, token: "" },
  },
  appearance: {
    theme: "dark",
    bgColor: "#0d0d0d",
    primaryAccent: "",
    statusAccent: "",
    panelOpacity: 20,
    panelDots: true,
    panelBgColor: "#0d0d0d",
    backdropObscure: true,
    backdropBlur: true,
    hudVisible: true,
    borderStyle: "subtle",
    cornerRadius: "round",
  },
  render: {
    edgeMode: "enhanced",
    edgeWidth: 3,
    groundGrid: true,
    perspective: true,
    sunShadowRes: 512,
    pointShadowRes: 512,
    showTextures: false,
    sketchColor: "#ffffff",
    sketchSpecular: 0.1,
  },
  environment: {
    sunLiveMode: true,
    weatherEnabled: true,
  },
  controls: {
    cameraControls: {
      desktop: { zoom: true, rotate: true, pan: true },
      mobile: { zoom: true, rotate: true, pan: true },
    },
    homeView: null,
  },
  misc: {
    panelRatio: null,
  },
};

/**
 * URL to the bundled simulation GLB model.
 * Place the model file at public/simulation_model.glb
 */
export const SIMULATION_MODEL_URL = `${import.meta.env.BASE_URL}simulation_model.glb`;
