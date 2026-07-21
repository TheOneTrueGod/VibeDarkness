import { describe, expect, it } from 'vitest';
import { AbilityState } from '../../../abilities/Ability';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { EventBus } from '../../../game/EventBus';
import { TerrainLayerManager } from '../../../game/TerrainLayerManager';
import { Unit } from '../../../game/units/Unit';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import type { TeamId } from '../../../game/teams';
import {
    BRAMBLE_PATCH_STRIKE_ID,
    BRAMBLE_PATCH_THORN_EFFECT_TYPE,
    BRAMBLE_PATCH_WINDUP,
    applyBramblePatchStrike,
} from './0706Ability';

function makePet(): Unit {
    return new Unit({
        id: 'pet',
        x: 200,
        y: 200,
        hp: 40,
        maxHp: 40,
        speed: 100,
        teamId: 'player' as TeamId,
        ownerId: 'p1',
        characterId: 'dog',
        name: 'Dog',
        radius: DEFAULT_UNIT_RADIUS,
        abilities: [BRAMBLE_PATCH_STRIKE_ID],
    });
}

describe('Bramble Patch strike 0706', () => {
    it('places bramble_slow thorns (lanternite nest style), not dark_thorn', () => {
        const pet = makePet();
        const terrainLayers = new TerrainLayerManager();
        const engine = {
            units: [pet],
            gameTime: 0,
            eventBus: new EventBus(),
            terrainLayers,
            lightLevelEnabled: false,
            globalLightLevel: 0,
            terrainManager: null,
            addEffect: () => {},
            getAllLightSources: () => [],
            generateRandomInteger: () => 0,
        };

        applyBramblePatchStrike(engine, pet);

        const effects = Array.from(terrainLayers.allEffects.values());
        expect(effects.length).toBeGreaterThan(0);
        expect(effects.every((e) => e.effectType === BRAMBLE_PATCH_THORN_EFFECT_TYPE)).toBe(true);
        expect(BRAMBLE_PATCH_THORN_EFFECT_TYPE).toBe('bramble_slow');
    });

    it('applies a full movement lock for the entire windup', () => {
        const ability = getAbility(BRAMBLE_PATCH_STRIKE_ID);
        expect(ability).toBeDefined();
        const duringWindup = ability!.getAbilityStates(BRAMBLE_PATCH_WINDUP - 0.01);
        expect(duringWindup).toEqual([
            { state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } },
        ]);
        expect(ability!.getAbilityStates(BRAMBLE_PATCH_WINDUP)).toEqual([]);
        expect(ability!.prefireTime).toBe(BRAMBLE_PATCH_WINDUP);
    });
});
