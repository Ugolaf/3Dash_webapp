import { useState, useEffect, useRef, useCallback } from 'react';
import { Power, Flame, Snowflake, RefreshCw, Droplets, Fan, Minus, Plus, type LucideIcon } from 'lucide-react';
import type { ClimateConfig, HAState } from '../types';
import { resolveAirflow } from '../utils/climate';
import './LightModal.css';
import './ClimateModal.css';

interface Props {
  visible: boolean;
  climate: ClimateConfig | null;
  state: HAState | null;
  onClose: () => void;
  onSetHvacMode: (entityId: string, mode: string) => void;
  onSetTemperature: (entityId: string, temperature: number) => void;
  onSetFanMode: (entityId: string, mode: string) => void;
  onSetSwingMode: (entityId: string, mode: string) => void;
}

const HVAC_META: Record<string, { label: string; icon: LucideIcon }> = {
  off: { label: 'Off', icon: Power },
  heat: { label: 'Heat', icon: Flame },
  cool: { label: 'Cool', icon: Snowflake },
  heat_cool: { label: 'Heat/Cool', icon: RefreshCw },
  auto: { label: 'Auto', icon: RefreshCw },
  dry: { label: 'Dry', icon: Droplets },
  fan_only: { label: 'Fan', icon: Fan },
};

const ACTION_LABEL: Record<string, string> = {
  heating: 'Heating',
  preheating: 'Preheating',
  cooling: 'Cooling',
  drying: 'Drying',
  fan: 'Fan',
  idle: 'Idle',
  off: 'Off',
};

const FLOW_COLOR = { warm: '#f97316', cold: '#38bdf8', neutral: '#94a3b8' } as const;

/** Debounce for the target temperature so repeated +/- taps send one call. */
const COMMIT_DELAY_MS = 500;

function humanize(mode: string): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1).replace(/_/g, ' ');
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export default function ClimateModal({
  visible,
  climate,
  state,
  onClose,
  onSetHvacMode,
  onSetTemperature,
  onSetFanMode,
  onSetSwingMode,
}: Props) {
  const attrs = state?.attributes ?? {};
  const entityId = climate?.entityId ?? '';
  const mode = state?.state ?? 'off';
  const flow = resolveAirflow(state);

  const minTemp = typeof attrs.min_temp === 'number' ? attrs.min_temp : 7;
  const maxTemp = typeof attrs.max_temp === 'number' ? attrs.max_temp : 35;
  const step = typeof attrs.target_temp_step === 'number' ? attrs.target_temp_step : 0.5;
  const serverTarget = typeof attrs.temperature === 'number' ? attrs.temperature : null;
  const roomTemp = typeof attrs.current_temperature === 'number' ? attrs.current_temperature : null;

  // Local target so +/- feels instant; resynced whenever HA reports a new value
  const [target, setTarget] = useState<number | null>(serverTarget);
  // Read by nudgeTarget so taps faster than a re-render still accumulate
  const targetRef = useRef<number | null>(serverTarget);
  const commitTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    setTarget(serverTarget);
    targetRef.current = serverTarget;
  }, [serverTarget]);
  useEffect(() => () => clearTimeout(commitTimer.current), []);

  const nudgeTarget = useCallback((delta: number) => {
    const base = targetRef.current ?? 20;
    const next = Math.round(Math.min(maxTemp, Math.max(minTemp, base + delta)) / step) * step;
    targetRef.current = next;
    setTarget(next);
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => onSetTemperature(entityId, next), COMMIT_DELAY_MS);
  }, [minTemp, maxTemp, step, entityId, onSetTemperature]);

  const hvacModes = stringList(attrs.hvac_modes);
  const modes = hvacModes.length ? hvacModes : ['off', 'heat', 'cool', 'auto'];
  const fanModes = stringList(attrs.fan_modes);
  const swingModes = stringList(attrs.swing_modes);

  const action = attrs.hvac_action as string | undefined;
  const status = mode === 'off'
    ? 'Off'
    : (action && ACTION_LABEL[action]) || HVAC_META[mode]?.label || humanize(mode);
  const accent = flow ? FLOW_COLOR[flow] : '#334155';
  const showTarget = mode !== 'off' && mode !== 'fan_only' && target !== null;
  const ModeIcon = HVAC_META[mode]?.icon ?? Fan;

  return (
    <div
      className={`modal-backdrop${visible ? ' visible' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="light-modal climate-modal">
        <div className="modal-header">
          <div className="modal-title">
            <div className="modal-bulb-icon" style={{ borderColor: accent, color: accent }}>
              <ModeIcon size={18} strokeWidth={1.8} />
            </div>
            <div>
              <div className="modal-entity-name">{climate?.label || 'Climate'}</div>
              <div className="modal-entity-id">{entityId}</div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>&#10005;</button>
        </div>

        <div className="modal-body">
          <div className="climate-status">
            <span className="climate-status-dot" style={{ background: accent }} />
            <span>{status}</span>
            {roomTemp !== null && <span className="climate-room">Room {roomTemp.toFixed(1)} °C</span>}
          </div>

          {showTarget && (
            <div className="climate-target">
              <button className="climate-step" onClick={() => nudgeTarget(-step)} aria-label="Lower target">
                <Minus size={18} />
              </button>
              <div className="climate-target-value" style={{ color: accent }}>
                {target!.toFixed(step < 1 ? 1 : 0)}<span>°C</span>
              </div>
              <button className="climate-step" onClick={() => nudgeTarget(step)} aria-label="Raise target">
                <Plus size={18} />
              </button>
            </div>
          )}

          <div className="modal-label">Mode</div>
          <div className="climate-chips">
            {modes.map((m) => {
              const meta = HVAC_META[m];
              const Icon = meta?.icon ?? Fan;
              return (
                <button
                  key={m}
                  className={`climate-chip${m === mode ? ' active' : ''}`}
                  onClick={() => onSetHvacMode(entityId, m)}
                >
                  <Icon size={15} strokeWidth={1.8} />
                  {meta?.label ?? humanize(m)}
                </button>
              );
            })}
          </div>

          {fanModes.length > 0 && (
            <>
              <div className="modal-label">Fan</div>
              <div className="climate-chips">
                {fanModes.map((m) => (
                  <button
                    key={m}
                    className={`climate-chip${m === attrs.fan_mode ? ' active' : ''}`}
                    onClick={() => onSetFanMode(entityId, m)}
                  >
                    {humanize(m)}
                  </button>
                ))}
              </div>
            </>
          )}

          {swingModes.length > 0 && (
            <>
              <div className="modal-label">Swing</div>
              <div className="climate-chips">
                {swingModes.map((m) => (
                  <button
                    key={m}
                    className={`climate-chip${m === attrs.swing_mode ? ' active' : ''}`}
                    onClick={() => onSetSwingMode(entityId, m)}
                  >
                    {humanize(m)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
