import { useState, useEffect, useCallback } from 'react';
import { generateUUID } from '../utils/uuid';
import type { StaircaseConfig, LightPosition } from '../types';
import { FormPanel, AccordionSection } from './FormPanel';

export interface StaircasePreviewInfo {
  style: 'up' | 'down';
  rotationY: number;
}

export interface FloorOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  editStaircase: StaircaseConfig | null;
  position: LightPosition;
  onPositionChange: (pos: LightPosition) => void;
  onSave: (cfg: StaircaseConfig) => void;
  onClose: () => void;
  onEnterPlacingMode: () => void;
  onExitPlacingMode: () => void;
  onPreviewChange: (info: StaircasePreviewInfo) => void;
  placingMode: boolean;
  /** Floors that can be targeted (excludes the current floor). */
  floors: FloorOption[];
}

const DEG = 180 / Math.PI;

export default function StaircaseForm({
  open,
  editStaircase,
  position,
  onPositionChange,
  onSave,
  onClose,
  onEnterPlacingMode,
  onExitPlacingMode,
  onPreviewChange,
  placingMode,
  floors,
}: Props) {
  const [label, setLabel] = useState('');
  const [style, setStyle] = useState<'up' | 'down'>('up');
  const [targetFloorId, setTargetFloorId] = useState('');
  const [rotationDeg, setRotationDeg] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (editStaircase) {
      setLabel(editStaircase.label ?? '');
      setStyle(editStaircase.style);
      setTargetFloorId(editStaircase.targetFloorId);
      setRotationDeg(Math.round((editStaircase.rotationY ?? 0) * DEG));
    } else {
      setLabel('');
      setStyle('up');
      setTargetFloorId(floors[0]?.id ?? '');
      setRotationDeg(0);
    }
  }, [open, editStaircase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    onPreviewChange({ style, rotationY: rotationDeg / DEG });
  }, [open, style, rotationDeg]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePosChange = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onPositionChange({ ...position, [axis]: parseFloat(value.toFixed(3)) });
    },
    [position, onPositionChange],
  );

  const handleSave = useCallback(() => {
    if (!targetFloorId) {
      alert('Choose a destination floor for this staircase.');
      return;
    }
    onSave({
      id: editStaircase?.id ?? generateUUID(),
      style,
      targetFloorId,
      position,
      rotationY: rotationDeg / DEG,
      label: label.trim() || undefined,
    });
  }, [editStaircase, style, targetFloorId, position, rotationDeg, label, onSave]);

  const footer = (
    <>
      <button
        className="btn btn-primary"
        onClick={placingMode ? onExitPlacingMode : onEnterPlacingMode}
      >
        {placingMode ? '✕ Cancel Placement' : '\u{1F4CD} Click Floor to Place'}
      </button>
      <button className="btn btn-success" onClick={handleSave}>
        &#10003; Save Staircase
      </button>
      <button className="btn btn-ghost" onClick={onClose}>
        Cancel
      </button>
    </>
  );

  return (
    <FormPanel
      open={open}
      title={editStaircase ? 'Edit Staircase' : 'Add Staircase'}
      onClose={onClose}
      footer={footer}
    >
      <AccordionSection title="Destination" defaultOpen>
        <div className="field-group">
          <label className="field-label">Direction</label>
          <div className="segmented">
            <button
              className={`segmented-btn${style === 'up' ? ' active' : ''}`}
              onClick={() => setStyle('up')}
            >
              ⬆ Up
            </button>
            <button
              className={`segmented-btn${style === 'down' ? ' active' : ''}`}
              onClick={() => setStyle('down')}
            >
              ⬇ Down
            </button>
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Goes to floor</label>
          <select
            className="field-input"
            value={targetFloorId}
            onChange={(e) => setTargetFloorId(e.target.value)}
          >
            <option value="">— select floor —</option>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Label</label>
          <input
            type="text"
            className="field-input"
            placeholder="e.g. Upstairs"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </AccordionSection>

      <AccordionSection title="Placement" defaultOpen>
        <div className={`placement-hint${open ? ' visible' : ''}`}>
          Click an open spot on the floor, then fine-tune below.
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
            max={360}
            step={5}
            value={rotationDeg}
            onChange={(e) => setRotationDeg(parseInt(e.target.value))}
          />
          <input
            type="number"
            className="pos-num"
            step={5}
            value={rotationDeg}
            onChange={(e) => setRotationDeg(parseInt(e.target.value) || 0)}
          />
        </div>
      </AccordionSection>
    </FormPanel>
  );
}
