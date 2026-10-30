import { useState, useEffect, useCallback, useMemo } from 'react';
import { generateUUID } from '../utils/uuid';
import type { ClimateConfig, LightPosition, RoomSensorConfig } from '../types';
import EntityPicker, { type HAEntityOption } from './EntityPicker';
import { FormPanel, AccordionSection } from './FormPanel';

interface Props {
  open: boolean;
  editRoom: RoomSensorConfig | null;
  position: LightPosition;
  /** Glow radius is owned by the editor so the live preview follows the slider. */
  tintRadius: number;
  onTintRadiusChange: (radius: number) => void;
  /** Climate units on the same floor, offered as an optional link. */
  climates: ClimateConfig[];
  onPositionChange: (pos: LightPosition) => void;
  onSave: (cfg: RoomSensorConfig) => void;
  onClose: () => void;
  onEnterPlacingMode: () => void;
  onExitPlacingMode: () => void;
  placingMode: boolean;
  haEntities?: HAEntityOption[];
}

/** Sensors first, the ones whose id/name mentions the keyword on top. */
function rankSensors(entities: HAEntityOption[], keyword: RegExp): HAEntityOption[] {
  const sensors = entities.filter((e) => e.entity_id.startsWith('sensor.'));
  const matches = (e: HAEntityOption) => keyword.test(e.entity_id) || keyword.test(e.friendly_name ?? '');
  return [...sensors.filter(matches), ...sensors.filter((e) => !matches(e))];
}

export default function RoomSensorForm({
  open,
  editRoom,
  position,
  tintRadius,
  onTintRadiusChange,
  climates,
  onPositionChange,
  onSave,
  onClose,
  onEnterPlacingMode,
  onExitPlacingMode,
  placingMode,
  haEntities = [],
}: Props) {
  const [label, setLabel] = useState('');
  const [temperatureEntityId, setTemperatureEntityId] = useState('');
  const [humidityEntityId, setHumidityEntityId] = useState('');
  const [climateId, setClimateId] = useState('');

  const tempEntities = useMemo(() => rankSensors(haEntities, /temp/i), [haEntities]);
  const humidityEntities = useMemo(() => rankSensors(haEntities, /humid/i), [haEntities]);

  useEffect(() => {
    if (!open) return;
    setLabel(editRoom?.label ?? '');
    setTemperatureEntityId(editRoom?.temperatureEntityId ?? '');
    setHumidityEntityId(editRoom?.humidityEntityId ?? '');
    setClimateId(editRoom?.climateId ?? '');
  }, [open, editRoom]);

  const handlePosChange = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onPositionChange({ ...position, [axis]: parseFloat(value.toFixed(3)) });
    },
    [position, onPositionChange],
  );

  const handleSave = useCallback(() => {
    const tempId = temperatureEntityId.trim();
    if (!tempId) {
      alert('A temperature sensor is required (e.g. sensor.living_room_temperature)');
      return;
    }
    const humId = humidityEntityId.trim();
    onSave({
      id: editRoom?.id ?? generateUUID(),
      label: label.trim() || 'Room',
      temperatureEntityId: tempId,
      ...(humId ? { humidityEntityId: humId } : {}),
      position,
      tintRadius,
      ...(climateId ? { climateId } : {}),
    });
  }, [editRoom, label, temperatureEntityId, humidityEntityId, position, tintRadius, climateId, onSave]);

  const footer = (
    <>
      <button
        className="btn btn-primary"
        onClick={placingMode ? onExitPlacingMode : onEnterPlacingMode}
      >
        {placingMode ? '✕ Cancel Placement' : '\u{1F4CD} Click Floor to Place'}
      </button>
      <button className="btn btn-success" onClick={handleSave}>
        &#10003; Save Room
      </button>
      <button className="btn btn-ghost" onClick={onClose}>
        Cancel
      </button>
    </>
  );

  return (
    <FormPanel
      open={open}
      title={editRoom ? 'Edit Room Sensor' : 'Add Room Sensor'}
      onClose={onClose}
      footer={footer}
    >
      <AccordionSection title="Room" defaultOpen>
        <div className="field-group">
          <label className="field-label">Room name</label>
          <input
            type="text"
            className="field-input"
            placeholder="e.g. Living room"
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Temperature sensor</label>
          <EntityPicker
            value={temperatureEntityId}
            onChange={setTemperatureEntityId}
            placeholder="sensor.living_room_temperature"
            entities={tempEntities}
            className="field-input"
          />
        </div>
        <div className="field-group">
          <label className="field-label">Humidity sensor (optional)</label>
          <EntityPicker
            value={humidityEntityId}
            onChange={setHumidityEntityId}
            placeholder="sensor.living_room_humidity"
            entities={humidityEntities}
            className="field-input"
          />
        </div>
        {climates.length > 0 && (
          <div className="field-group">
            <label className="field-label">Linked climate unit (optional)</label>
            <select className="field-input" value={climateId} onChange={(e) => setClimateId(e.target.value)}>
              <option value="">None</option>
              {climates.map((c) => (
                <option key={c.id} value={c.id}>{c.label || c.entityId}</option>
              ))}
            </select>
          </div>
        )}
      </AccordionSection>

      <AccordionSection title="Look" defaultOpen>
        <div className={`placement-hint${open ? ' visible' : ''}`}>
          Click the middle of the room's floor — the label floats above it and
          a soft glow tinted by the temperature spreads on the floor.
        </div>
        <div className="pos-grid">
          <span className="pos-axis" style={{ color: 'var(--muted)' }}>Glow</span>
          <input
            type="range"
            className="pos-slider"
            min={0}
            max={5}
            step={0.1}
            value={tintRadius}
            onChange={(e) => onTintRadiusChange(parseFloat(e.target.value))}
          />
          <input
            type="number"
            className="pos-num"
            min={0}
            max={5}
            step={0.1}
            value={tintRadius}
            onChange={(e) => onTintRadiusChange(Math.min(5, Math.max(0, parseFloat(e.target.value) || 0)))}
          />
        </div>
      </AccordionSection>

      <AccordionSection title="Position" defaultOpen>
        {([
          { label: 'X', color: '#f87171', babylonAxis: 'x' as const, range: [-30, 30] as [number, number] },
          { label: 'Z', color: '#4ade80', babylonAxis: 'y' as const, range: [-2, 10] as [number, number] },
          { label: 'Y', color: '#38bdf8', babylonAxis: 'z' as const, range: [-30, 30] as [number, number] },
        ]).map(({ label: lbl, color, babylonAxis, range }) => (
          <div key={babylonAxis} className="pos-grid">
            <span className="pos-axis" style={{ color }}>{lbl}</span>
            <input
              type="range"
              className="pos-slider"
              min={range[0]}
              max={range[1]}
              step={0.05}
              value={position[babylonAxis]}
              onChange={(e) => handlePosChange(babylonAxis, parseFloat(e.target.value))}
            />
            <input
              type="number"
              className="pos-num"
              step={0.05}
              value={position[babylonAxis]}
              onChange={(e) => handlePosChange(babylonAxis, parseFloat(e.target.value) || 0)}
            />
          </div>
        ))}
      </AccordionSection>
    </FormPanel>
  );
}
