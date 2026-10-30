import { describe, it, expect } from 'vitest';
import { getAbility } from '../../abilities/AbilityRegistry';
import { SwingBatCard } from '../../card_defs/0115_SwingBat/0115Ability';
import { buildMoreRockTimings } from '../../card_defs/throwSharedTimings';
import type { CastBehaviour } from '../../abilities/castBehaviourTypes';
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
    nextChainImmediateLabel,
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
    it('returns Target for Swing Mace (windup lunge, select at 0.2s)', () => {
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

    it('returns null for Throw Rock (pixel-aim select picked just before the throw)', () => {
        const { engine, player } = buildCasterWithAbility('throw_rock');
        const ability = getAbility('throw_rock');
        expect(ability).toBeDefined();
        expect(findPreviewDeferredSelectLabel(ability!, player, engine)).toBeNull();
        expect(findFirstSelectTargetLabelAtElapsedZero(ability!, player, engine)).toBeNull();
        engine.destroy();
    });

    it('returns null for More Rock timings (first pixel pick is taken just before the throw)', () => {
        const { engine, player } = buildCasterWithAbility('throw_rock');
        const base = getAbility('throw_rock')!;
        const moreRock = {
            ...base,
            getAbilityTimings: undefined,
            abilityTimings: buildMoreRockTimings({ launchBehaviour: {} as CastBehaviour }),
        };
        expect(findPreviewDeferredSelectLabel(moreRock, player, engine)).toBeNull();
        engine.destroy();
    });
});

describe('nextChainImmediateLabel', () => {
    it('returns the next select only when that select is marked to chain before the cast', () => {
        const chained = [
            { label: 'Place' },
            { label: 'Facing', chainImmediately: true },
        ];
        expect(nextChainImmediateLabel(chained, { Place: { type: 'pixel' } })).toBe('Facing');
        expect(nextChainImmediateLabel(chained, { Place: { type: 'pixel' }, Facing: { type: 'pixel' } })).toBeNull();
        const spaced = [
            { label: 'Place' },
            { label: 'Facing' },
        ];
        expect(nextChainImmediateLabel(spaced, { Place: { type: 'pixel' } })).toBeNull();
    });
});
