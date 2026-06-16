import React from 'react';
import { TerrainType, TERRAIN_PROPERTIES } from '../../../games/minion_battles/terrain/TerrainType';
import { TERRAIN_COLORS } from './terrainEditorColors';

interface TerrainTypePickerProps {
    selectedType: TerrainType;
    onSelect: (type: TerrainType) => void;
}

const TERRAIN_TYPES: TerrainType[] = [
    TerrainType.Dirt,
    TerrainType.Grass,
    TerrainType.ThickGrass,
    TerrainType.Rock,
];

export default function TerrainTypePicker({ selectedType, onSelect }: TerrainTypePickerProps) {
    return (
        <div className="grid grid-cols-2 gap-2">
            {TERRAIN_TYPES.map((type) => {
                const isActive = selectedType === type;
                const props = TERRAIN_PROPERTIES[type];
                const color = TERRAIN_COLORS[type];

                return (
                    <button
                        key={type}
                        onClick={() => onSelect(type)}
                        className={[
                            'flex flex-col items-center gap-1 p-1 rounded transition-colors',
                            isActive
                                ? 'border-2 border-primary bg-surface-light'
                                : 'border border-border-custom bg-surface hover:border-primary',
                        ].join(' ')}
                    >
                        <div
                            className="w-10 h-10 rounded"
                            style={{ backgroundColor: color }}
                        />
                        <span className="text-xs text-muted leading-tight text-center">
                            {props.name}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
