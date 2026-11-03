import { describe, expect, it } from 'vitest';
import { EventBus } from '../EventBus';
import { TerrainLayerManager } from '../TerrainLayerManager';
import { Unit } from '../units/Unit';
import type { TeamId } from '../teams';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { MIASMA_DAMAGE, MIASMA_EFFECT_TYPE, MIASMA_INTERVAL_SEC } from './terrainEffectDefs';
import { tickStandingTerrainDamage } from './standingDamage';

function unitAt(id: string, characterId: string, teamId: TeamId): Unit {
    return new Unit({
        id,
        x: CELL_SIZE * 2.5,
        y: CELL_SIZE * 2.5,
        hp: 50,
        maxHp: 50,
        speed: 90,
        teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai',
        characterId,
        name: id,
        radius: 16,
    });
}

function engineWithMiasma() {
    const terrainLayers = new TerrainLayerManager();
    terrainLayers.add({
        id: 'm',
        layer: 'air',
        effectType: MIASMA_EFFECT_TYPE,
        placedAtGameTime: 0,
        expiresAtGameTime: 100,
        ownerUnitId: 'husk1',
        area: { type: 'cell', col: 2, row: 2 },
        params: {},
    });
    return { terrainLayers, eventBus: new EventBus(), gameTime: 0 };
}

describe('tickStandingTerrainDamage (miasma)', () => {
    it('hurts players but not darkness creatures standing in it', () => {
        const engine = engineWithMiasma();
        const player = unitAt('p', 'player', 'player');
        const wolf = unitAt('w', 'dark_wolf', 'enemy');
        engine.gameTime = MIASMA_INTERVAL_SEC;
        tickStandingTerrainDamage(player, 0.05, engine);
        tickStandingTerrainDamage(wolf, 0.05, engine);
        expect(player.hp).toBe(50 - MIASMA_DAMAGE);
        expect(wolf.hp).toBe(50);
    });

    it('pulses once per interval boundary, not every tick', () => {
        const engine = engineWithMiasma();
        const player = unitAt('p', 'player', 'player');
        const dt = 0.05;
        const ticks = Math.round((MIASMA_INTERVAL_SEC * 3) / dt);
        for (let i = 1; i <= ticks; i++) {
            engine.gameTime = i * dt;
            tickStandingTerrainDamage(player, dt, engine);
        }
        expect(player.hp).toBe(50 - MIASMA_DAMAGE * 3);
    });

    it('does nothing outside the cloud', () => {
        const engine = engineWithMiasma();
        const player = unitAt('p', 'player', 'player');
        player.x += CELL_SIZE;
        engine.gameTime = MIASMA_INTERVAL_SEC;
        tickStandingTerrainDamage(player, 0.05, engine);
        expect(player.hp).toBe(50);
    });
});
