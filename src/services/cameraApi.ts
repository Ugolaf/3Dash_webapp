import type { HAState } from '../types';
import { getSetting } from './settingsStore';

/** Home Assistant `supported_features` bit for live streaming. */
const CAMERA_STREAM_FEATURE = 2;

/** Base HTTP(S) origin of the configured Home Assistant instance. */
export function haHttpBase(): string {
  const { url, port } = getSetting('connection').haSettings;
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${url}:${port}`;
}

/** True when the camera entity advertises live-stream support. */
export function cameraSupportsStream(state: HAState | null | undefined): boolean {
  if (!state) return false;
  const feat = Number(state.attributes.supported_features ?? 0);
  return (feat & CAMERA_STREAM_FEATURE) !== 0;
}

/**
 * Authenticated snapshot URL. HA's `entity_picture` already carries a signed
 * `?token=` so it works in a plain <img> without auth headers.
 */
export function cameraSnapshotUrl(state: HAState | null | undefined): string | null {
  const pic = state?.attributes.entity_picture as string | undefined;
  if (!pic) return null;
  return pic.startsWith('http') ? pic : `${haHttpBase()}${pic}`;
}

/**
 * Live MJPEG stream URL (multipart JPEG) usable directly in an <img>. Returns
 * null when the camera has no stream support or no signed access token.
 */
export function cameraStreamUrl(state: HAState | null | undefined): string | null {
  if (!state || !cameraSupportsStream(state)) return null;
  // The access token is embedded in entity_picture (…?token=XXXX) or exposed
  // directly as the access_token attribute.
  const token =
    (state.attributes.access_token as string | undefined) ??
    (state.attributes.entity_picture as string | undefined)?.split('token=')[1];
  if (!token) return null;
  return `${haHttpBase()}/api/camera_proxy_stream/${state.entity_id}?token=${token}`;
}
