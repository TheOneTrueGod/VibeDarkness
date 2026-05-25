/**
 * LanterniteRespawnManager — tracks pending Lanternite respawn jobs (Spore rebirth)
 * and spawns replacement units when the delay expires.
 */

import type { EngineContext } from '../EngineContext';
import { LANTERNITE_CHARACTER_ID, LANTERNITE_RESPAWN_DELAY_SEC } from './lanternitePulse';
import { createGenericEnemy } from '../units/GenericEnemy';
import { getDefaultHp, getDefaultSpeed } from '../units/unit_defs/unitDef';
import type { EventBus } from '../EventBus';

interface RespawnJob {
    atGameTime: number;
    x: number;
    y: number;
}

export class LanterniteRespawnManager {
    private queue: RespawnJob[] = [];

    onLanterniteUnitDied(x: number, y: number, gameTime: number): void {
        this.queue.push({ atGameTime: gameTime + LANTERNITE_RESPAWN_DELAY_SEC, x, y });
    }

    gameTick(gameTime: number, engine: EngineContext, eventBus: EventBus): void {
        const keep: RespawnJob[] = [];
        for (const job of this.queue) {
            if (gameTime < job.atGameTime) {
                keep.push(job);
                continue;
            }
            const replacement = createGenericEnemy(
                {
                    id: engine.allocateObjectId?.('unit') ?? `unit_${Date.now()}`,
                    x: job.x,
                    y: job.y,
                    hp: getDefaultHp(LANTERNITE_CHARACTER_ID),
                    speed: getDefaultSpeed(LANTERNITE_CHARACTER_ID),
                    teamId: 'allied',
                    characterId: LANTERNITE_CHARACTER_ID,
                    name: 'Lanternite',
                    abilities: [],
                },
                eventBus,
            );
            engine.addUnit(replacement);
        }
        this.queue = keep;
    }
}
