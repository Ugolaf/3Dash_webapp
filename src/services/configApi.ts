import JSZip from 'jszip';
import type { AppConfig, CoverConfig, DisplayConfig, LightConfig, LightGroup, ShadowWallConfig, SidePanelConfig, TubeConfig } from '../types';
import { saveModel as dbSaveModel, getModel as dbGetModel, deleteModel as dbDeleteModel, listModelKeys as dbListModelKeys } from './storageApi';
import { getSettings, setAllSettings, type AppSettings } from './settingsStore';
import { isSimulationActive } from '../contexts/SimulationModeContext';

const CONFIG_KEY = 'config';

const DEFAULT_CONFIG: AppConfig = {
  location: { latitude: 43.6077, longitude: 3.8766 },
  lights: [],
  onboarding: { completed: false },
};

/** Returns true if a config has been saved to localStorage. */
export function hasConfig(): boolean {
  return localStorage.getItem(CONFIG_KEY) !== null;
}

/**
 * In-memory config override used by simulation mode.
 */
let simulationConfigOverride: AppConfig | null = null;

/** Set (or clear) the in-memory simulation config. */
export function setSimulationConfigOverride(c: AppConfig | null): void {
  simulationConfigOverride = c ? structuredClone(c) : null;
}

/** Read config from localStorage (or from the simulation override). */
export function getConfig(): AppConfig {
  if (simulationConfigOverride) return structuredClone(simulationConfigOverride);

  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    return JSON.parse(raw) as AppConfig;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Merge partial updates into the stored config and persist. */
export function updateConfig(data: {
  lights?: LightConfig[];
  lightGroups?: LightGroup[];
  displays?: DisplayConfig[];
  covers?: CoverConfig[];
  shadowWalls?: ShadowWallConfig[];
  location?: { latitude: number; longitude: number; northOffset?: number };
  sidePanel?: SidePanelConfig;
  tubes?: TubeConfig[];
  onboarding?: { completed: boolean };
  floors?: import('../types').FloorConfig[];
  activeFloorId?: string;
  alarm?: import('../types').AlarmConfig;
}): void {
  if (isSimulationActive()) {
    // Update in-memory override so the UI reacts, but never persist
    if (simulationConfigOverride) {
      Object.assign(simulationConfigOverride, data);
    }
    return;
  }
  const current = getConfig();
  const merged = { ...current, ...data };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
}

/** Store a GLB model file in IndexedDB under the given model key (default 'model'). */
export async function uploadModel(file: File, modelId: string = 'model'): Promise<void> {
  await dbSaveModel(file, modelId);
}

/** Get a GLB model blob from IndexedDB by model key (default 'model'). */
export async function getModelBlob(modelId: string = 'model'): Promise<Blob | null> {
  return dbGetModel(modelId);
}

/** Delete a single floor's model blob. */
export async function deleteModelBlob(modelId: string): Promise<void> {
  await dbDeleteModel(modelId);
}

/** Remove config from localStorage and every stored model from IndexedDB. */
export async function resetConfig(): Promise<void> {
  localStorage.removeItem(CONFIG_KEY);
  const keys = await dbListModelKeys();
  await Promise.all(keys.map((k) => dbDeleteModel(k)));
}

/** Export config + settings + model as a downloadable ZIP. */
export async function exportBackup(): Promise<void> {
  const zip = new JSZip();

  // Config
  const config = getConfig();
  zip.file('config.json', JSON.stringify(config, null, 2));

  // Settings (includes HA settings, theme, camera controls, etc.)
  const settings = getSettings();
  zip.file('settings.json', JSON.stringify(settings, null, 2));

  // Every stored floor model (keyed by modelId). The default 'model' key is
  // also written as apartment.glb so older single-model importers still work.
  const modelKeys = await dbListModelKeys();
  for (const key of modelKeys) {
    const blob = await dbGetModel(key);
    if (!blob) continue;
    zip.file(`models/${key}.glb`, blob);
    if (key === 'model') zip.file('apartment.glb', blob);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `appart3d-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Import a ZIP backup. Preserves existing HA token. Returns whether a model was included. */
export async function importBackup(file: File): Promise<{ ok: boolean; hasModel: boolean; hasSettings: boolean }> {
  const zip = await JSZip.loadAsync(file);

  // Config
  const configFile = zip.file('config.json');
  if (!configFile) throw new Error('No config.json found in backup');
  const configJson = await configFile.async('string');
  const importedConfig = JSON.parse(configJson) as AppConfig;

  localStorage.setItem(CONFIG_KEY, JSON.stringify(importedConfig));

  // Settings (if present in backup)
  let hasSettings = false;
  const settingsFile = zip.file('settings.json');
  if (settingsFile) {
    hasSettings = true;
    const settingsJson = await settingsFile.async('string');
    const importedSettings = JSON.parse(settingsJson) as AppSettings;
    // Preserve existing HA token (the export strips it for security)
    const currentSettings = getSettings();
    if (!importedSettings.connection?.haSettings?.token && currentSettings.connection.haSettings.token) {
      importedSettings.connection = {
        ...importedSettings.connection,
        haSettings: {
          ...importedSettings.connection.haSettings,
          token: currentSettings.connection.haSettings.token,
        },
      };
    }
    setAllSettings(importedSettings);
  }

  // Models — restore each floor's GLB from the models/ folder, falling back to
  // the legacy single apartment.glb.
  let hasModel = false;
  const modelEntries: Array<{ key: string; file: import('jszip').JSZipObject }> = [];
  zip.forEach((path, entry) => {
    if (path.startsWith('models/') && path.endsWith('.glb')) {
      modelEntries.push({ key: path.slice('models/'.length, -'.glb'.length), file: entry });
    }
  });
  for (const { key, file } of modelEntries) {
    await dbSaveModel(await file.async('blob'), key);
    hasModel = true;
  }
  if (!hasModel) {
    const modelFile = zip.file('apartment.glb');
    if (modelFile) {
      await dbSaveModel(await modelFile.async('blob'), 'model');
      hasModel = true;
    }
  }

  return { ok: true, hasModel, hasSettings };
}
