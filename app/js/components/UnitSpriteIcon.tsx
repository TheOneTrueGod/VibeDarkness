import React from 'react';
import { getUnitSpriteUrl } from '../games/minion_battles/game/units/unit_defs/unitDef';

/** A unit's sprite (from its unit def) in a square box; a blank tile when it has no sprite. */
export default function UnitSpriteIcon({ characterId, size, title }: { characterId: string; size: number; title?: string }) {
    const url = getUnitSpriteUrl(characterId);
    if (!url) {
        return <div title={title} style={{ width: size, height: size }} className="rounded bg-surface-light flex-shrink-0" />;
    }
    return <img src={url} alt={title ?? ''} title={title} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />;
}
