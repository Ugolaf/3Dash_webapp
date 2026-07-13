import { useState, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, Square } from 'lucide-react';
import type { HAState } from '../types';
import './LightModal.css';
import './CoverModal.css';

interface Props {
  visible: boolean;
  entityId: string | null;
  label: string;
  state: HAState | null;
  onClose: () => void;
  onOpenCover: (entityId: string) => void;
  onCloseCover: (entityId: string) => void;
  onStopCover: (entityId: string) => void;
  onSetPosition: (entityId: string, position: number) => void;
}

export default function CoverModal({
  visible,
  entityId,
  label,
  state,
  onClose,
  onOpenCover,
  onCloseCover,
  onStopCover,
  onSetPosition,
}: Props) {
  const [position, setPosition] = useState(100);
  const [dragging, setDragging] = useState(false);

  // Sync position from HA state unless the user is dragging the slider
  useEffect(() => {
    if (!state || dragging) return;
    const pos = state.attributes.current_position;
    if (pos !== undefined) setPosition(Math.round(pos));
    else if (state.state === 'closed') setPosition(0);
    else if (state.state === 'open') setPosition(100);
  }, [state, entityId, dragging]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPosition(parseInt(e.target.value));
  }, []);

  const commitPosition = useCallback(() => {
    setDragging(false);
    if (entityId) onSetPosition(entityId, position);
  }, [entityId, position, onSetPosition]);

  const moving = state?.state === 'opening' || state?.state === 'closing';
  const stateLabel = state?.state === 'opening' ? 'Opening…'
    : state?.state === 'closing' ? 'Closing…'
    : position === 0 ? 'Closed'
    : position === 100 ? 'Open'
    : `Open at ${position}%`;

  return (
    <div
      className={`modal-backdrop${visible ? ' visible' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="light-modal">
        <div className="modal-header">
          <div className="modal-title">
            <div
              className="modal-bulb-icon"
              style={{
                background: position > 0 ? 'rgba(96,165,250,0.15)' : 'transparent',
                borderColor: position > 0 ? '#60a5fa' : '#334155',
              }}
            >
              &#129003;
            </div>
            <div>
              <div className="modal-entity-name">{label}</div>
              <div className="modal-entity-id">{entityId}</div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            &#10005;
          </button>
        </div>

        <div className="modal-body">
          {/* Open / Stop / Close */}
          <div className="cover-buttons">
            <button
              className="cover-btn"
              disabled={state?.state === 'opening'}
              onClick={() => entityId && onOpenCover(entityId)}
              title="Open"
            >
              <ChevronUp size={22} />
            </button>
            <button
              className="cover-btn"
              disabled={!moving}
              onClick={() => entityId && onStopCover(entityId)}
              title="Stop"
            >
              <Square size={16} />
            </button>
            <button
              className="cover-btn"
              disabled={state?.state === 'closing'}
              onClick={() => entityId && onCloseCover(entityId)}
              title="Close"
            >
              <ChevronDown size={22} />
            </button>
          </div>

          {/* Position slider */}
          <div className="modal-slider-wrap">
            <div className="slider-header">
              <span className="modal-label">Position</span>
              <span className="slider-value">{stateLabel}</span>
            </div>
            <input
              type="range"
              className="modal-slider cover-position"
              min={0}
              max={100}
              value={position}
              onChange={handleSliderChange}
              onPointerDown={() => setDragging(true)}
              onPointerUp={commitPosition}
              onKeyUp={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') commitPosition();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
