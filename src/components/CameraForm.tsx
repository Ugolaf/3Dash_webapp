import { useState, useEffect, useCallback, useMemo } from 'react';
import { generateUUID } from '../utils/uuid';
import type { CameraConfig, LightPosition } from '../types';
import EntityPicker, { type HAEntityOption } from './EntityPicker';
import { FormPanel, AccordionSection } from './FormPanel';

export interface CameraOrientation {
  rotationY: number;
  tilt: number;
}

interface Props {
  open: boolean;
  editCamera: CameraConfig | null;
  position: LightPosition;
  /** Orientation is owned by the editor so click-to-place can auto-aim it. */
  orientation: CameraOrientation;
  onPositionChange: (pos: LightPosition) => void;
  onOrientationChange: (o: CameraOrientation) => void;
  onSave: (cfg: CameraConfig) => void;
  onClose: () => void;
  onEnterPlacingMode: () => void;
  onExitPlacingMode: () => void;
  placingMode: boolean;
  haEntities?: HAEntityOption[];
}

const DEG = 180 / Math.PI;

export default function CameraForm({
  open,
  editCamera,
  position,
  orientation,
  onPositionChange,
  onOrientationChange,
  onSave,
  onClose,
  onEnterPlacingMode,
  onExitPlacingMode,
  placingMode,
  haEntities = [],
}: Props) {
  const [entityId, setEntityId] = useState('');
  const [label, setLabel] = useState('');

  const cameraEntities = useMemo(
    () => haEntities.filter((e) => e.entity_id.startsWith('camera.')),
    [haEntities],
  );

  useEffect(() => {
    if (!open) return;
    if (editCamera) {
      setEntityId(editCamera.entityId);
      setLabel(editCamera.label);
    } else {
      setEntityId('');
      setLabel('');
    }
  }, [open, editCamera]);

  const handlePosChange = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onPositionChange({ ...position, [axis]: parseFloat(value.toFixed(3)) });
    },
    [position, onPositionChange],
  );

  const handleSave = useCallback(() => {
    if (!entityId.trim()) {
      alert('Entity ID is required (e.g. camera.front_door)');
      return;
    }
    onSave({
      id: editCamera?.id ?? generateUUID(),
      entityId: entityId.trim(),
      label: label || entityId.trim().split('.')[1]?.replace(/_/g, ' ') || 'Camera',
      position,
      rotationY: orientation.rotationY,
      tilt: orientation.tilt,
    });
  }, [editCamera, entityId, label, position, orientation, onSave]);

  const tiltDeg = Math.round(orientation.tilt * DEG);
  const rotDeg = Math.round(orientation.rotationY * DEG);
  const mount = tiltDeg < 30 ? 'Ceiling' : tiltDeg > 60 ? 'Wall' : 'Angled';

  const footer = (
    <>
      <button
        className="btn btn-primary"
        onClick={placingMode ? onExitPlacingMode : onEnterPlacingMode}
      >
        {placingMode ? '✕ Cancel Placement' : '\u{1F4CD} Click Surface to Place'}
      </button>
      <button className="btn btn-success" onClick={handleSave}>
        &#10003; Save Camera
      </button>
      <button className="btn btn-ghost" onClick={onClose}>
        Cancel
      </button>
    </>
  );

  return (
    <FormPanel
      open={open}
      title={editCamera ? 'Edit Camera' : 'Add Camera'}
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
            placeholder="camera.front_door"
            entities={cameraEntities}
            className="field-input"
          />
        </div>
        <div className="field-group">
          <label className="field-label">Label</label>
          <input
            type="text"
            className="field-input"
            placeholder="e.g. Front Door"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </AccordionSection>

      <AccordionSection title="Mount & Aim" defaultOpen>
        <div className={`placement-hint${open ? ' visible' : ''}`}>
          Click a ceiling <em>or a wall</em> — the camera auto-orients ({mount}).
          Fine-tune the angle below.
        </div>

        <div className="pos-grid">
          <span className="pos-axis" style={{ color: 'var(--muted)' }}>Tilt</span>
          <input
            type="range"
            className="pos-slider"
            min={0}
            max={90}
            step={5}
            value={tiltDeg}
            onChange={(e) => onOrientationChange({ ...orientation, tilt: parseInt(e.target.value) / DEG })}
          />
          <input
            type="number"
            className="pos-num"
            step={5}
            value={tiltDeg}
            onChange={(e) => onOrientationChange({ ...orientation, tilt: (parseInt(e.target.value) || 0) / DEG })}
          />
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
            onChange={(e) => onOrientationChange({ ...orientation, rotationY: parseInt(e.target.value) / DEG })}
          />
          <input
            type="number"
            className="pos-num"
            step={5}
            value={rotDeg}
            onChange={(e) => onOrientationChange({ ...orientation, rotationY: (parseInt(e.target.value) || 0) / DEG })}
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
