import type { ClimateConfig } from '../types';

interface Props {
  climates: ClimateConfig[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDuplicate: (idx: number) => void;
}

export default function ClimateList({ climates, selectedIdx, onSelect, onDelete, onDuplicate }: Props) {
  if (climates.length === 0) {
    return (
      <div className="list-empty">
        No climate units on this floor.<br />
        Click <strong>Add Climate</strong> to mount a split AC on a wall.
      </div>
    );
  }

  return (
    <>
      {climates.map((c, i) => (
        <div
          key={c.id}
          className={`light-item${selectedIdx === i ? ' selected' : ''}`}
          onClick={() => onSelect(i)}
        >
          <div className="light-item-icon">{'❄️'}</div>
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
