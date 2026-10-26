import { Home, Layers } from 'lucide-react';
import type { FloorConfig } from '../types';
import { getNavFloors, isOverviewFloor } from '../utils/floors';
import './FloorSwitcher.css';

interface Props {
  floors: FloorConfig[];
  activeFloorId: string;
  onSelect: (floorId: string) => void;
}

/** Top-centered segmented control: exterior overview first, then each floor. */
export default function FloorSwitcher({ floors, activeFloorId, onSelect }: Props) {
  return (
    <nav className="floor-switcher" aria-label="Floors">
      {getNavFloors(floors).map((f) => {
        const active = f.id === activeFloorId;
        const Icon = isOverviewFloor(f) ? Home : Layers;
        return (
          <button
            key={f.id}
            type="button"
            className={`floor-switcher-btn${active ? ' active' : ''}`}
            aria-pressed={active}
            onClick={() => onSelect(f.id)}
          >
            <Icon size={14} strokeWidth={2.2} />
            <span>{f.name}</span>
          </button>
        );
      })}
    </nav>
  );
}
