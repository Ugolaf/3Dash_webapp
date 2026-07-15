import type { StaircaseConfig } from '../types';

interface Props {
  staircases: StaircaseConfig[];
  floorNames: Record<string, string>;
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDuplicate: (idx: number) => void;
}

export default function StaircaseList({
  staircases,
  floorNames,
  selectedIdx,
  onSelect,
  onDelete,
  onDuplicate,
}: Props) {
  if (staircases.length === 0) {
    return (
      <div className="list-empty">
        No staircases on this floor.<br />
        Click <strong>Add Staircase</strong> to link to another floor.
      </div>
    );
  }

  return (
    <>
      {staircases.map((s, i) => (
        <div
          key={s.id}
          className={`light-item${selectedIdx === i ? ' selected' : ''}`}
          onClick={() => onSelect(i)}
        >
          <div className="light-item-icon">{s.style === 'up' ? '⬆️' : '⬇️'}</div>
          <div className="light-item-info">
            <div className="light-item-name">{s.label || (s.style === 'up' ? 'Go up' : 'Go down')}</div>
            <div className="light-item-meta">
              {s.style} &rarr; {floorNames[s.targetFloorId] || s.targetFloorId || '(no target)'}
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
