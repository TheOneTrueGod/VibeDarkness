import { describe, expect, it } from 'vitest';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { getModifiedAbilityDamage } from '../abilities/damageModifiers';
import { getDefaultHp, PLAYER_CHARACTER_ID } from '../game/units/unit_defs/unitDef';
import {
    TRAINING_NODE_HEALTHY,
    TRAINING_NODE_MIGHTY,
    TRAINING_TREE_ID,
} from '../../../researchTrees/trees/training';
import { PunchNEWAbility } from '../card_defs/0120_PunchNEW/0120Ability';

describe('passive research at mission spawn', () => {
    it('Healthy adds 10 max HP per level (5 levels = +50)', () => {
        const trees = {
            [TINY_BATTLE_PLAYER_ID]: {
                [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY],
            },
        };
        const levels = {
            [TINY_BATTLE_PLAYER_ID]: {
                [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: 5 },
            },
        };
        const engine = buildTinyBattleEngine({
            gridW: 8,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            playerResearchTreesByPlayer: trees,
        });
        const unit = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: 100,
            y: 100,
            abilities: ['0120'],
            playerResearchTreesByPlayer: trees,
            playerResearchNodeLevelsByPlayer: levels,
        });
        expect(unit.maxHp).toBe(getDefaultHp(PLAYER_CHARACTER_ID) + 50);
        expect(unit.passiveBonuses?.maxHealth?.add).toBe(50);
    });

    it('Mighty doubles ability damage at 5 levels via damageModifier', () => {
        const trees = {
            [TINY_BATTLE_PLAYER_ID]: {
                [TRAINING_TREE_ID]: [TRAINING_NODE_MIGHTY],
            },
        };
        const levels = {
            [TINY_BATTLE_PLAYER_ID]: {
                [TRAINING_TREE_ID]: { [TRAINING_NODE_MIGHTY]: 5 },
            },
        };
        const engine = buildTinyBattleEngine({
            gridW: 8,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
        });
        const unit = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: 100,
            y: 100,
            abilities: ['0120'],
            playerResearchTreesByPlayer: trees,
            playerResearchNodeLevelsByPlayer: levels,
        });
        expect(unit.getDamageModifier().multiplier).toBe(2);
        expect(getModifiedAbilityDamage(unit, 8)).toBe(16);
        expect(PunchNEWAbility.getDamage?.()).toBe(8);
        expect(PunchNEWAbility.getDamage?.(unit)).toBe(16);
    });
});
