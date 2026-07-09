import { describe, it, expect } from 'vitest';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { resetGameObjectIdCounter } from '../GameObject';
import {
    isITSPreviewComplete,
    isPreviewCastConditionalCancelPaused,
} from './isITSPreviewComplete';

const DOUBLE_PUNCH_ABILITY_ID = '0116';

function buildPreviewEngine() {
    resetGameObjectIdCounter(1);
    const engine = buildTinyBattleEngine({
        gridW: 8,
        gridH: 8,
        localPlayerId: TINY_BATTLE_PLAYER_ID,
        grass: true,
    });
    const x = 4 * CELL_SIZE + CELL_SIZE / 2;
    const y = 4 * CELL_SIZE + CELL_SIZE / 2;
    const player = spawnTinyPlayerUnit(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        x,
        y,
        abilities: [DOUBLE_PUNCH_ABILITY_ID],
    });
    engine.isSequentialTargetingPreview = true;
    engine.sequentialTargetingPreviewCast = {
        unitId: player.id,
        abilityId: DOUBLE_PUNCH_ABILITY_ID,
        startRound: engine.roundNumber,
    };
    return { engine, player };
}

describe('isITSPreviewComplete', () => {
    it('returns false when not in ITS preview', () => {
        const { engine } = buildPreviewEngine();
        engine.isSequentialTargetingPreview = false;
        engine.sequentialTargetingPreviewCast = null;
        expect(isITSPreviewComplete(engine)).toBe(false);
        engine.destroy();
    });

    it('returns false while waitingForTargetInput is set', () => {
        const { engine } = buildPreviewEngine();
        engine.waitingForTargetInput = {
            label: 'Target 1',
            unitId: engine.sequentialTargetingPreviewCast!.unitId,
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
        };
        expect(isITSPreviewComplete(engine)).toBe(false);
        engine.destroy();
    });

    it('returns false while preview cast is still active', () => {
        const { engine, player } = buildPreviewEngine();
        player.activeAbilities = [{
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
            startTime: engine.gameTime,
            targets: [],
        }];
        expect(isITSPreviewComplete(engine)).toBe(false);
        engine.destroy();
    });

    it('returns true when preview cast leaves activeAbilities', () => {
        const { engine, player } = buildPreviewEngine();
        player.activeAbilities = [{
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
            startTime: engine.gameTime,
            targets: [],
        }];
        player.activeAbilities = [];
        expect(isITSPreviewComplete(engine)).toBe(true);
        engine.destroy();
    });

    it('returns true when preview cast has conditionalCancelPaused', () => {
        const { engine, player } = buildPreviewEngine();
        player.activeAbilities = [{
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
            startTime: engine.gameTime,
            targets: [],
            conditionalCancelPaused: true,
        }];
        expect(isITSPreviewComplete(engine)).toBe(true);
        expect(isPreviewCastConditionalCancelPaused(engine)).toBe(true);
        engine.destroy();
    });
});
