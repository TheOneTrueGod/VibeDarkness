import { describe, expect, it } from 'vitest';
import { buildTinyBattleEngine, spawnTinyPlayerUnit, TINY_BATTLE_PLAYER_ID } from '../../testing/harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../abilities/abilityUses';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { PassiveStatKey, type PassiveBonuses } from '../../../../researchTrees/types';
import type { GameEngine } from '../../game/GameEngine';
import type { IAbilityPreviewGraphics } from '../../abilities/Ability';
import { SlimeShotAbility } from './0001Ability';
import { getSlimeWedgePreviewLength } from './slimeWedge';

const P = TINY_BATTLE_PLAYER_ID;
const cell = (c: number) => c * CELL_SIZE + CELL_SIZE / 2;
const BAG: PassiveBonuses = { [PassiveStatKey.EnemyUnitSlimeExtraProjectiles]: { add: 2, mult: 1 } };

function setup(bag: PassiveBonuses) {
    const engine = buildTinyBattleEngine({ gridW: 24, gridH: 16, localPlayerId: P, grass: true });
    spawnTinyPlayerUnit(engine, { playerId: P, x: cell(0), y: cell(0), abilities: [] });
    engine.darknessUpgradeBonuses = bag;
    const slime = createUnitFromSpawnConfig(
        { id: 'slime1', characterId: 'slime', name: 'Slime', hp: 50, x: cell(10), y: cell(8), teamId: 'enemy', ownerId: 'ai', unitAITreeId: 'static_test_no_ai' },
        engine.eventBus,
        engine,
    );
    initializeAbilityRuntimeForUnit(slime);
    engine.addUnit(slime, 'initialGameSpawn');
    return { engine, slime };
}

function fire(engine: GameEngine, slimeId: string): number {
    engine.state.orderMgr.applyOrder({
        unitId: slimeId,
        abilityId: SlimeShotAbility.id,
        targets: [{ type: 'pixel', position: { x: cell(18), y: cell(8) } }],
    });
    for (let i = 0; i < 90; i++) {
        const batch = engine.waitingForOrders;
        if (batch) {
            for (const w of batch.waiters) engine.state.orderMgr.applyOrder({ unitId: w.unitId, abilityId: 'wait', targets: [], endTurn: true });
            engine.tryResumeParallel();
        }
        engine.stepSimulationFixedTicks(1);
    }
    return engine.projectiles.filter((p) => p.sourceUnitId === slimeId && p.sourceAbilityId === SlimeShotAbility.id).length;
}

describe('SlimeShot wedge (Empowered Spirits)', () => {
    it('fires one projectile without the bonus', () => {
        const { engine, slime } = setup({});
        expect(fire(engine, slime.id)).toBe(1);
        engine.destroy();
    });

    it('fires 3 projectiles (main + 2 wedge) with the bonus', () => {
        const { engine, slime } = setup(BAG);
        expect(fire(engine, slime.id)).toBe(3);
        engine.destroy();
    });

    it('preview draws short wedge lines only when the bonus is active', () => {
        const { engine, slime } = setup(BAG);
        slime.activeAbilities.length = 0;
        const lines: number[] = [];
        let last: [number, number] = [0, 0];
        const gr = {
            clear() {}, circle() {}, fill() {}, stroke() {},
            moveTo: (x: number, y: number) => { last = [x, y]; },
            lineTo: (x: number, y: number) => { lines.push(Math.hypot(x - last[0], y - last[1])); },
        } as IAbilityPreviewGraphics;
        const active = { startTime: 0, targets: [{ type: 'pixel', position: { x: slime.x + 150, y: slime.y } }] } as never;
        SlimeShotAbility.renderActivePreview!(gr, slime, active, 0.1, engine);
        const wedge = lines.filter((l) => Math.abs(l - getSlimeWedgePreviewLength(slime.radius)) < 1e-6);
        expect(wedge).toHaveLength(2);
        lines.length = 0;
        SlimeShotAbility.renderActivePreview!(gr, slime, active, 0.1, { darknessUpgradeBonuses: {} });
        expect(lines).toHaveLength(3);
        engine.destroy();
    });
});
