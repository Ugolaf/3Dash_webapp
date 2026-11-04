import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CoverConfig, LightPosition } from '../types';
import EntityPicker, { type HAEntityOption } from './EntityPicker';
import { FormPanel, AccordionSection } from './FormPanel';

const DEG = 180 / Math.PI;

export interface CoverPreviewInfo {
  width: number;
  height: number;
}

interface Props {
  open: boolean;
  editCover: CoverConfig | null;
  position: LightPosition;
  normal: LightPosition;
  onPositionChange: (pos: LightPosition) => void;
  /** Manual facing override for windows whose wall click picks a wrong/odd normal. */
  onNormalChange: (normal: LightPosition) => void;
  onSave: (cfg: CoverConfig) => void;
  onClose: () => void;
  onEnterPlacingMode: () => void;
  onExitPlacingMode: () => void;
  onPreviewChange: (info: CoverPreviewInfo) => void;
  placingMode: boolean;
  haEntities?: HAEntityOption[];
}

export default function CoverForm({
  open,
  editCover,
  position,
  normal,
  onPositionChange,
  onNormalChange,
  onSave,
  onClose,
  onEnterPlacingMode,
  onExitPlacingMode,
  onPreviewChange,
  placingMode,
  haEntities = [],
}: Props) {
  const [entityId, setEntityId] = useState('');
  const [label, setLabel] = useState('');
  const [width, setWidth] = useState(0.8);
  const [height, setHeight] = useState(1.2);

  // Only offer cover entities in the picker
  const coverEntities = useMemo(
    () => haEntities.filter((e) => e.entity_id.startsWith('cover.')),
    [haEntities],
  );

  // Init form from editCover
  useEffect(() => {
    if (!open) return;
    if (editCover) {
      setEntityId(editCover.entityId);
      setLabel(editCover.label);
      setWidth(editCover.width);
      setHeight(editCover.height);
    } else {
      setEntityId('');
      setLabel('');
      setWidth(0.8);
      setHeight(1.2);
    }
  }, [open, editCover]);

  // Notify parent of preview changes
  useEffect(() => {
    if (!open) return;
    onPreviewChange({ width, height });
  }, [open, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePosChange = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onPositionChange({ ...position, [axis]: parseFloat(value.toFixed(3)) });
    },
    [position, onPositionChange],
  );

  // Facing as a horizontal yaw (0–360°) so the shutter can be turned without a wall hit
  const yawDeg = ((Math.round(Math.atan2(normal.x, normal.z) * DEG) % 360) + 360) % 360;
  const setYawDeg = useCallback(
    (deg: number) => {
      const rad = deg / DEG;
      onNormalChange({
        x: parseFloat(Math.sin(rad).toFixed(4)),
        y: 0,
        z: parseFloat(Math.cos(rad).toFixed(4)),
      });
    },
    [onNormalChange],
  );

  const handleSave = useCallback(() => {
    if (!entityId.trim()) {
      alert('Entity ID is required (e.g. cover.living_room)');
      return;
    }
    const cfg: CoverConfig = {
      entityId: entityId.trim(),
      label: label || entityId.trim().split('.')[1]?.replace(/_/g, ' ') || 'Cover',
      position,
      normal,
      width,
      height,
    };
    onSave(cfg);
  }, [entityId, label, position, normal, width, height, onSave]);

  const footer = (
    <>
      <button
        className="btn btn-primary"
        onClick={placingMode ? onExitPlacingMode : onEnterPlacingMode}
      >
        {placingMode ? '✕ Cancel Placement' : '\u{1F4CD} Click Window to Place'}
      </button>
      <button className="btn btn-success" onClick={handleSave}>
        &#10003; Save Cover
      </button>
      <button className="btn btn-ghost" onClick={onClose}>
        Cancel
      </button>
    </>
  );

  return (
    <FormPanel
      open={open}
      title={editCover ? 'Edit Roller Shutter' : 'Add Roller Shutter'}
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
            placeholder="cover.living_room"
            entities={coverEntities}
            className="field-input"
          />
        </div>
        <div className="field-group">
          <label className="field-label">Label</label>
          <input
            type="text"
            className="field-input"
            placeholder="e.g. Living Bay"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </AccordionSection>

      <AccordionSection title="Window Size" defaultOpen>
        {([
          { label: 'Width', key: 'width' as const, value: width, set: setWidth },
          { label: 'Height', key: 'height' as const, value: height, set: setHeight },
        ]).map(({ label: lbl, key, value, set }) => (
          <div key={key} className="pos-grid">
            <span className="pos-axis" style={{ color: 'var(--muted)' }}>{lbl}</span>
            <input
              type="range"
              className="pos-slider"
              min={0.2}
              max={5}
              step={0.05}
              value={value}
              onChange={(e) => set(parseFloat(e.target.value))}
            />
            <input
              type="number"
              className="pos-num"
              step={0.05}
              min={0.2}
              value={value}
              onChange={(e) => set(parseFloat(e.target.value) || 0.2)}
            />
          </div>
        ))}
      </AccordionSection>

      <AccordionSection title="Position" defaultOpen>
        <div className={`placement-hint${open ? ' visible' : ''}`}>
          Click the center of a window on an exterior wall, then fine-tune below.
          If the shutter faces the wrong way, use Rot or Flip side.
        </div>

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

        <div className="pos-grid">
          <span className="pos-axis" style={{ color: 'var(--muted)' }}>Rot</span>
          <input
            type="range"
            className="pos-slider"
            min={0}
            max={359}
            step={1}
            value={yawDeg}
            onChange={(e) => setYawDeg(parseInt(e.target.value))}
          />
          <input
            type="number"
            className="pos-num"
            step={1}
            value={yawDeg}
            onChange={(e) => setYawDeg(parseInt(e.target.value) || 0)}
          />
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setYawDeg(yawDeg + 180)}>
          &#8634; Flip side
        </button>
      </AccordionSection>
    </FormPanel>
  );
}
