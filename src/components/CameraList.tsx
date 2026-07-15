import type { CameraConfig } from '../types';

interface Props {
  cameras: CameraConfig[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDuplicate: (idx: number) => void;
}

export default function CameraList({ cameras, selectedIdx, onSelect, onDelete, onDuplicate }: Props) {
  if (cameras.length === 0) {
    return (
      <div className="list-empty">
        No cameras on this floor.<br />
        Click <strong>Add Camera</strong> to place a dome camera.
      </div>
    );
  }

  return (
    <>
      {cameras.map((c, i) => (
        <div
          key={c.id}
          className={`light-item${selectedIdx === i ? ' selected' : ''}`}
          onClick={() => onSelect(i)}
        >
          <div className="light-item-icon">{'\u{1F4F7}'}</div>
          <div className="light-item-info">
            <div className="light-item-name">{c.label || c.entityId}</div>
            <div className="light-item-meta">{c.entityId}</div>
          </div>
          <button
            className="light-item-dup"
            title="Duplicate"
            onClick={(e) => { e.stopPropagation(); onDuplicate(i); }}
          >
            &#x29C9;
          </button>
          <button
            className="light-item-del"
            onClick={(e) => { e.stopPropagation(); onDelete(i); }}
          >
            &times;
          </button>
        </div>
      ))}
    </>
  );
}
