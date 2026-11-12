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
import { GameEngine } from '../game/GameEngine';
import { resetGameObjectIdCounter } from '../game/GameObject';
import { DARK_AWAKENING } from '../storylines/WorldOfDarkness/missions/001_dark_awakening';
import { TRAINING_NODE_DARKVISION, TRAINING_NODE_TREMORSENSE } from '../../../researchTrees/trees/training';
import {
    DARKVISION_GRANT,
    getDarknessPenetration,
    getUnitSenses,
    PLAYER_SENSES,
    TREMORSENSE_GRANT,
} from '../game/visibility/senses';

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

    it('Mighty adds +50% ability damage at 5 levels via damageModifier', () => {
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
        expect(unit.getDamageModifier().multiplier).toBe(1.5);
        expect(getModifiedAbilityDamage(unit, 8)).toBe(12);
        expect(PunchNEWAbility.getDamage?.()).toBe(8);
        expect(PunchNEWAbility.getDamage?.(unit)).toBe(12);
    });

    it('grantSense research becomes instance sense grants on the player unit at mission start', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [
                { playerId: 'p1', name: 'P1', portraitId: 'warrior' },
                { playerId: 'p2', name: 'P2', portraitId: 'ranger' },
            ],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            playerResearchTreesByPlayer: {
                p1: { [TRAINING_TREE_ID]: [TRAINING_NODE_DARKVISION, TRAINING_NODE_TREMORSENSE] },
            },
        });
        const p1 = engine.units.find((u) => u.ownerId === 'p1' && u.characterId === PLAYER_CHARACTER_ID);
        const p2 = engine.units.find((u) => u.ownerId === 'p2' && u.characterId === PLAYER_CHARACTER_ID);
        expect(p1?.senseGrants).toEqual([DARKVISION_GRANT, TREMORSENSE_GRANT]);
        expect(p2?.senseGrants).toEqual([]);
        const senses = getUnitSenses(p1!);
        expect(senses.tremorsense?.range).toBe(TREMORSENSE_GRANT.range);
        expect(getDarknessPenetration(senses)).toBe(
            PLAYER_SENSES.vision!.darknessPenetration + DARKVISION_GRANT.amount,
        );
        engine.destroy();
    });
});
