/**
 * ChannelDarkness ability: 2s channel, then target DefendPoint loses 1 HP.
 */
import { describe, it, expect } from 'vitest';
import { ChannelDarknessAbility } from './ChannelDarknessAbility';
import { Unit } from '../../../objects/Unit';

describe('ChannelDarknessAbility', () => {
    it('deals 1 damage to target special tile when channel completes (currentTime >= 2)', () => {
        const caster = new Unit({
            id: 'caster',
            x: 100,
            y: 100,
            hp: 12,
            maxHp: 12,
            speed: 100,
            teamId: 'enemy',
            ownerId: 'ai',
            characterId: 'dark_wolf',
            name: 'Wolf',
            abilities: ['channel_darkness'],
            radius: 10,
        });
        const tileId = 'dp_1';
        const targets = [{ type: 'specialTile' as const, specialTileId: tileId }];
        const engine = {
            specialTiles: [{ id: tileId, defId: 'DefendPoint', col: 5, row: 5, hp: 5, maxHp: 5 }],
            damageSpecialTile(id: string, amount: number) {
                const t = this.specialTiles.find((s: { id: string }) => s.id === id);
                if (t) t.hp = Math.max(0, t.hp - amount);
            },
        };

        ChannelDarknessAbility.doCardEffect(engine, caster, targets, 1.99, 2.0);

        const tile = engine.specialTiles.find((s: { id: string }) => s.id === tileId);
        expect(tile!.hp).toBe(4);
    });

    it('does not damage before channel completes', () => {
        const caster = new Unit({
            id: 'caster',
            x: 100,
            y: 100,
            hp: 12,
            maxHp: 12,
            speed: 100,
            teamId: 'enemy',
            ownerId: 'ai',
            characterId: 'dark_wolf',
            name: 'Wolf',
            abilities: ['channel_darkness'],
            radius: 10,
        });
        const tileId = 'dp_1';
        const targets = [{ type: 'specialTile' as const, specialTileId: tileId }];
        const engine = {
            specialTiles: [{ id: tileId, defId: 'DefendPoint', col: 5, row: 5, hp: 5, maxHp: 5 }],
            damageSpecialTile(id: string, amount: number) {
                const t = this.specialTiles.find((s: { id: string }) => s.id === id);
                if (t) t.hp = Math.max(0, t.hp - amount);
            },
        };

        ChannelDarknessAbility.doCardEffect(engine, caster, targets, 0.5, 1.0);

        const tile = engine.specialTiles.find((s: { id: string }) => s.id === tileId);
        expect(tile!.hp).toBe(5);
    });
});
