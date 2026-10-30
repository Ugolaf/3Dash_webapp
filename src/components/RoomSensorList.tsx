import type { RoomSensorConfig } from '../types';

interface Props {
  rooms: RoomSensorConfig[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDuplicate: (idx: number) => void;
}

export default function RoomSensorList({ rooms, selectedIdx, onSelect, onDelete, onDuplicate }: Props) {
  if (rooms.length === 0) {
    return (
      <div className="list-empty">
        No room sensors on this floor.<br />
        Click <strong>Add Room</strong> to float a temperature label over a room.
      </div>
    );
  }

  return (
    <>
      {rooms.map((r, i) => (
        <div
          key={r.id}
          className={`light-item${selectedIdx === i ? ' selected' : ''}`}
          onClick={() => onSelect(i)}
        >
          <div className="light-item-icon">{'🌡️'}</div>
          <div className="light-item-info">
            <div className="light-item-name">{r.label || r.temperatureEntityId}</div>
            <div className="light-item-meta">
              {r.temperatureEntityId}{r.humidityEntityId ? ' · humidity' : ''}
            </div>
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
