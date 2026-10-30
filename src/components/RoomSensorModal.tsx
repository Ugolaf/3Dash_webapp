import { Thermometer, Droplets, Snowflake } from 'lucide-react';
import type { HAState, RoomSensorConfig } from '../types';
import { numericState, temperatureColor, comfortLabel, temperatureUnit } from '../utils/roomSensor';
import { SensorGraph } from './DisplayModal';
import './LightModal.css';
import './SidePanel/cards/IndicatorModal.css';
import './RoomSensorModal.css';

interface Props {
  visible: boolean;
  room: RoomSensorConfig | null;
  temperatureState: HAState | null;
  humidityState: HAState | null;
  /** Label of the linked climate unit, when one is configured and exists. */
  climateLabel?: string;
  onOpenClimate?: (climateId: string) => void;
  onClose: () => void;
}

export default function RoomSensorModal({
  visible,
  room,
  temperatureState,
  humidityState,
  climateLabel,
  onOpenClimate,
  onClose,
}: Props) {
  const temp = numericState(temperatureState);
  const humidity = numericState(humidityState);
  const unit = temperatureUnit(temperatureState);
  const accent = temperatureColor(temp);
  const climateId = room?.climateId;

  return (
    <div
      className={`modal-backdrop${visible ? ' visible' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="light-modal room-sensor-modal">
        <div className="modal-header">
          <div className="modal-title">
            <div className="modal-bulb-icon" style={{ borderColor: accent, color: accent }}>
              <Thermometer size={18} strokeWidth={1.8} />
            </div>
            <div>
              <div className="modal-entity-name">{room?.label || 'Room'}</div>
              <div className="modal-entity-id">{room?.temperatureEntityId}</div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>&#10005;</button>
        </div>

        <div className="modal-body">
          <div className="room-sensor-readout">
            <div className="room-sensor-temp" style={{ color: accent }}>
              {temp === null ? '--' : temp.toFixed(1)}<span>{unit}</span>
            </div>
            <div className="room-sensor-meta">
              <span className="room-sensor-comfort" style={{ color: accent }}>{comfortLabel(temp)}</span>
              {room?.humidityEntityId && (
                <span className="room-sensor-humidity">
                  <Droplets size={14} strokeWidth={1.8} />
                  {humidity === null ? '--' : `${Math.round(humidity)} %`}
                </span>
              )}
            </div>
          </div>

          {room && visible && (
            <SensorGraph entityId={room.temperatureEntityId} label="Temperature" unit={unit} precision={1} />
          )}
          {room?.humidityEntityId && visible && (
            <SensorGraph entityId={room.humidityEntityId} label="Humidity" unit="%" precision={0} />
          )}

          {climateId && climateLabel && onOpenClimate && (
            <button className="room-sensor-climate-btn" onClick={() => onOpenClimate(climateId)}>
              <Snowflake size={15} strokeWidth={1.8} />
              {climateLabel} controls
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
