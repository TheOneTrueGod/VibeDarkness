import { describe, it, expect } from 'vitest';
import { getAbility } from '../../abilities/AbilityRegistry';
import { SwingBatCard } from '../../card_defs/0115_SwingBat/0115Ability';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { resetGameObjectIdCounter } from '../GameObject';
import {
    findFirstSelectTargetLabelAtElapsedZero,
    findPreviewDeferredSelectLabel,
} from './selectTargetLookahead';

/** Matches `0116Ability` id. */
const DOUBLE_PUNCH_ABILITY_ID = '0116';
/** Matches `0801Ability` id. */
const LIGHT_BLAST_ID = '0801';

function buildCasterWithAbility(abilityId: string) {
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
        abilities: [abilityId],
    });
    return { engine, player };
}

describe('findPreviewDeferredSelectLabel', () => {
    it('returns Target for Swing Bat (windup lunge, select at 0.2s)', () => {
        const { engine, player } = buildCasterWithAbility(SwingBatCard.abilityId);
        const ability = getAbility(SwingBatCard.abilityId);
        expect(ability).toBeDefined();
        expect(findPreviewDeferredSelectLabel(ability!, player, engine)).toBe('Target');
        expect(findFirstSelectTargetLabelAtElapsedZero(ability!, player, engine)).toBeNull();
        engine.destroy();
    });

    it('returns null for Double Punch (no windup lunge)', () => {
        const { engine, player } = buildCasterWithAbility(DOUBLE_PUNCH_ABILITY_ID);
        const ability = getAbility(DOUBLE_PUNCH_ABILITY_ID);
        expect(findPreviewDeferredSelectLabel(ability!, player, engine)).toBeNull();
        engine.destroy();
    });

    it('returns null for Light Blast (no windup lunge)', () => {
        const { engine, player } = buildCasterWithAbility(LIGHT_BLAST_ID);
        const ability = getAbility(LIGHT_BLAST_ID);
        expect(findPreviewDeferredSelectLabel(ability!, player, engine)).toBeNull();
        engine.destroy();
    });
});
