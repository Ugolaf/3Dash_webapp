import type { CoverConfig } from '../types';

interface Props {
  covers: CoverConfig[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDuplicate: (idx: number) => void;
}

export default function CoverList({ covers, selectedIdx, onSelect, onDelete, onDuplicate }: Props) {
  if (covers.length === 0) {
    return (
      <div className="list-empty">
        No roller shutters configured.<br />
        Click <strong>Add Cover</strong> to place one on a window.
      </div>
    );
  }

  return (
    <>
      {covers.map((c, i) => (
        <div
          key={c.entityId}
          className={`light-item${selectedIdx === i ? ' selected' : ''}`}
          onClick={() => onSelect(i)}
        >
          <div className="light-item-icon">{'\u{1FA9F}'}</div>
          <div className="light-item-info">
            <div className="light-item-name">{c.label || c.entityId}</div>
            <div className="light-item-meta">
              {c.entityId} &middot; {c.width.toFixed(2)} x {c.height.toFixed(2)}
            </div>
          </div>
          <button
            className="light-item-dup"
            title="Duplicate"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(i);
            }}
          >
            &#x29C9;
          </button>
          <button
            className="light-item-del"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(i);
            }}
          >
            &times;
          </button>
        </div>
      ))}
    </>
  );
}
