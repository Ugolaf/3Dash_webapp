import { useState, useEffect, useCallback, useMemo } from 'react';
import { generateUUID } from '../utils/uuid';
import type { ClimateConfig, LightPosition } from '../types';
import EntityPicker, { type HAEntityOption } from './EntityPicker';
import { FormPanel, AccordionSection } from './FormPanel';

interface Props {
  open: boolean;
  editClimate: ClimateConfig | null;
  position: LightPosition;
  /** Yaw is owned by the editor so click-to-place can face the unit into the room. */
  rotationY: number;
  onPositionChange: (pos: LightPosition) => void;
  onRotationChange: (rotationY: number) => void;
  onSave: (cfg: ClimateConfig) => void;
  onClose: () => void;
  onEnterPlacingMode: () => void;
  onExitPlacingMode: () => void;
  placingMode: boolean;
  haEntities?: HAEntityOption[];
}

const DEG = 180 / Math.PI;

export default function ClimateForm({
  open,
  editClimate,
  position,
  rotationY,
  onPositionChange,
  onRotationChange,
  onSave,
  onClose,
  onEnterPlacingMode,
  onExitPlacingMode,
  placingMode,
  haEntities = [],
}: Props) {
  const [entityId, setEntityId] = useState('');
  const [label, setLabel] = useState('');

  const climateEntities = useMemo(
    () => haEntities.filter((e) => e.entity_id.startsWith('climate.')),
    [haEntities],
  );

  useEffect(() => {
    if (!open) return;
    setEntityId(editClimate?.entityId ?? '');
    setLabel(editClimate?.label ?? '');
  }, [open, editClimate]);

  const handlePosChange = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onPositionChange({ ...position, [axis]: parseFloat(value.toFixed(3)) });
    },
    [position, onPositionChange],
  );

  const handleSave = useCallback(() => {
    if (!entityId.trim()) {
      alert('Entity ID is required (e.g. climate.living_room)');
      return;
    }
    onSave({
      id: editClimate?.id ?? generateUUID(),
      entityId: entityId.trim(),
      label: label || entityId.trim().split('.')[1]?.replace(/_/g, ' ') || 'Climate',
      position,
      rotationY,
    });
  }, [editClimate, entityId, label, position, rotationY, onSave]);

  // Normalized to 0–360 so a negative yaw from auto-placement still fits the slider
  const rotDeg = ((Math.round(rotationY * DEG) % 360) + 360) % 360;

  const footer = (
    <>
      <button
        className="btn btn-primary"
        onClick={placingMode ? onExitPlacingMode : onEnterPlacingMode}
      >
        {placingMode ? '✕ Cancel Placement' : '\u{1F4CD} Click Wall to Place'}
      </button>
      <button className="btn btn-success" onClick={handleSave}>
        &#10003; Save Climate
      </button>
      <button className="btn btn-ghost" onClick={onClose}>
        Cancel
      </button>
    </>
  );

  return (
    <FormPanel
      open={open}
      title={editClimate ? 'Edit Climate' : 'Add Climate'}
      onClose={onClose}
      footer={footer}
    >
      <AccordionSection title="Entity" defaultOpen>
        <div className="field-group">
          <label className="field-label">Entity ID</label>
          <EntityPicker
            value={entityId}
            onChange={setEntityId}
            onSelect={(e) => { if (!label.trim() && e.friendly_name) setLabel(e.friendly_name); }}
            placeholder="climate.living_room"
            entities={climateEntities}
            className="field-input"
          />
        </div>
        <div className="field-group">
          <label className="field-label">Label</label>
          <input
            type="text"
            className="field-input"
            placeholder="e.g. Living Room AC"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </AccordionSection>

      <AccordionSection title="Mount" defaultOpen>
        <div className={`placement-hint${open ? ' visible' : ''}`}>
          Click a wall — the unit is mounted on it and faces into the room.
          Adjust the facing direction below if needed.
        </div>

        <div className="pos-grid">
          <span className="pos-axis" style={{ color: 'var(--muted)' }}>Rot</span>
          <input
            type="range"
            className="pos-slider"
            min={0}
            max={360}
            step={5}
            value={rotDeg}
            onChange={(e) => onRotationChange(parseInt(e.target.value) / DEG)}
          />
          <input
            type="number"
            className="pos-num"
            step={5}
            value={rotDeg}
            onChange={(e) => onRotationChange((parseInt(e.target.value) || 0) / DEG)}
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
