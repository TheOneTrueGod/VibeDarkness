import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const PLAYER_POS = { x: 4 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };
// Attacker is 30 px to the right â€” within punch range (BASE_MAX_RANGE=30 + attacker radius)
const ATTACKER_POS = { x: PLAYER_POS.x + 30, y: PLAYER_POS.y };

function buildAbsorptionShieldEngine() {
    const engine = buildTinyBattleEngine({
        gridW: 10,
        gridH: 8,
        localPlayerId: P,
        grass: true,
    });

    const player = spawnTinyPlayerUnit(engine, {
        playerId: P,
        x: PLAYER_POS.x,
        y: PLAYER_POS.y,
        abilities: ['0113', '0114'],
    });

    // Simulate 2 prior blocks so one more block completes the 3-charge threshold.
    const energyBlastRt = player.abilityRuntime['0114'];
    if (energyBlastRt) {
        energyBlastRt.recoveryChargesByType['energyCharge'] = 2;
    }

    const attacker = createUnitFromSpawnConfig(
        {
            id: 'attacker',
            characterId: 'alpha_wolf',
            name: 'Attacker',
            x: ATTACKER_POS.x,
            y: ATTACKER_POS.y,
            teamId: 'enemy',
            ownerId: 'ai',
            abilities: ['0120'],
        },
        engine.eventBus,
    );
    initializeAbilityRuntimeForUnit(attacker);
    engine.addUnit(attacker, 'initialGameSpawn');


    return engine;
}

export const absorptionShieldEnergyChargeScenario: ScenarioDefinition = {
    id: 'absorption_shield_energy_charge_on_block',
    title: 'Absorption Shield: blocking grants energy charge (3 charges â†’ 1 Energy Blast use)',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine: () => buildAbsorptionShieldEngine(),
    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const attacker = engine.getUnit('attacker')!;
        return [
            // Player raises shield facing the attacker (to the right)
            {
                unitId: player.id,
                abilityId: '0113',
                targets: [{ type: 'pixel' as const, position: ATTACKER_POS }],
            },
            // Attacker punches â€” blocked by the shield, triggering the 3rd energy charge
            {
                unitId: attacker.id,
                abilityId: '0120',
                targets: [{ type: 'pixel' as const, position: PLAYER_POS }],
            },
        ];
    },
    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player) return false;
        const rt = player.abilityRuntime['0114'];
        return Boolean(rt && rt.currentUses >= 1);
    },
    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const rt = player?.abilityRuntime['0114'];
        const charges = rt?.recoveryChargesByType['energyCharge'] ?? 0;
        return `energy_blast uses=${rt?.currentUses ?? 0} energyCharges=${charges} (expected â‰¥1 use after 3 blocks)`;
    },
};
