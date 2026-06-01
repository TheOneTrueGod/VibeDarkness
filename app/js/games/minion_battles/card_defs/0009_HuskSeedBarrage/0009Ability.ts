/**
 * Husk Artillery — telegraphed channel; seed pod arcs to target, spawns ephemeral husks at landing (no direct damage).
 */

import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { Projectile } from '../../game/projectiles/Projectile';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { isAbilityNote } from '../../game/AbilityNote';
import { getPixelTargetPosition, getDirectionFromTo } from '../../abilities/targetHelpers';
import { isLightHateWeakened } from '../../game/lightHate';
import { createUnitFromSpawnConfig } from '../../game/units/index';

export const HUSK_SEED_BARRAGE_ID = `${formatGroupId(AbilityGroupId.Enemy)}09`;

const CHANNEL_END = 1.95;
const FIRE_TIME = 2.95;
const COOLDOWN_END = 8.5;
const PROJECTILE_SPEED = 380;
const MAX_DISTANCE = 520;
const HUSK_LIFETIME_SEC = 22;

interface EngineLike {
    gameTime: number;
    roundNumber: number;
    eventBus: import('../../game/EventBus').EventBus;
    addProjectile(projectile: Projectile): void;
    addUnit(unit: Unit, spawnSource?: import('../../game/types').SpawnSource): void;
    getUnit(id: string): Unit | undefined;
    allocateObjectId?(prefix?: string): string;
    lightLevelEnabled: boolean;
    globalLightLevel: number;
    terrainManager: { grid: import('../../terrain/TerrainGrid').TerrainGrid } | null;
    getAllLightSources(): import('../../game/LightGrid').LightSource[];
}

export const HuskSeedBarrageAbility: AbilityStatic = {
    id: HUSK_SEED_BARRAGE_ID,
    name: 'Seed Pod Barrage',
    image: '',
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: FIRE_TIME,
    abilityTimings: [
        { id: 'channel', start: 0, end: CHANNEL_END, abilityPhase: AbilityPhase.Windup },
        { id: 'aim', start: CHANNEL_END, end: FIRE_TIME, abilityPhase: AbilityPhase.Active },
        { id: 'cooldown', start: FIRE_TIME, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Landing zone' }] as TargetDef[],
    aiSettings: { minRange: 120, maxRange: MAX_DISTANCE - 40 },

    getTooltipText(): string[] {
        return [
            'Channel a seed pod; it lands without direct damage and hatches short-lived husks',
            'Spawns fewer husks under bright light (Light Hate)',
        ];
    },
    getAbilityStates(): AbilityStateEntry[] {
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const eng = engine as EngineLike;
        if (prevTime < CHANNEL_END && currentTime >= CHANNEL_END) {
            const pos = getPixelTargetPosition(targets, 0);
            if (pos) {
                caster.setAbilityNote({ abilityId: '0009', abilityNote: { position: { ...pos } } });
            }
        }

        if (prevTime < FIRE_TIME || currentTime < FIRE_TIME) return;
        if (!isAbilityNote(caster.abilityNote, '0009')) return;
        const pos = caster.abilityNote.abilityNote.position;
        caster.clearAbilityNote();

        const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, pos.x, pos.y);
        if (dist === 0) return;

        const projectile = new Projectile({
            x: caster.x,
            y: caster.y,
            velocityX: dirX * PROJECTILE_SPEED,
            velocityY: dirY * PROJECTILE_SPEED,
            damage: 0,
            sourceTeamId: caster.teamId,
            sourceUnitId: caster.id,
            sourceAbilityId: HUSK_SEED_BARRAGE_ID,
            maxDistance: Math.min(MAX_DISTANCE, dist + 20),
            passThroughEnemies: true,
        });
        projectile.radius = 9;

        projectile.summonSeedWeak = isLightHateWeakened(caster, eng);

        eng.addProjectile(projectile);
    },
    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {},

    onProjectileExpired(engine: unknown, caster: Unit, projectile: Projectile): void {
        const eng = engine as EngineLike;
        if (projectile.sourceAbilityId !== HUSK_SEED_BARRAGE_ID) return;
        const weak = Boolean(projectile.summonSeedWeak);

        let spawnCount = weak ? 1 : 2;
        if (spawnCount < 1) spawnCount = 1;

        for (let i = 0; i < spawnCount; i++) {
            const ox = i === 0 ? 0 : (i === 1 ? 16 : -16);
            const oy = i === 0 ? 0 : 12;
            const husk = createUnitFromSpawnConfig(
                {
                    characterId: 'huskling',
                    name: 'Huskling',
                    x: projectile.x + ox,
                    y: projectile.y + oy,
                    teamId: 'enemy',
                    ownerId: 'ai',
                    abilities: ['0002'],
                    aiSettings: { minRange: 0, maxRange: 70 },
                    combatSettings: { damageModifier: { flatAmt: -3, multiplier: 1 } },
                    ephemeralDespawnAtGameTime: eng.gameTime + HUSK_LIFETIME_SEC,
                },
                eng.eventBus,
                eng,
            );
            eng.addUnit(husk, 'abilitySpawn');
        }
    },

    renderTargetingPreview(gr: IAbilityPreviewGraphics, caster: Unit): void {
        gr.circle(caster.x, caster.y, MAX_DISTANCE);
        gr.stroke({ width: 1, color: 0xd6b38a, alpha: 0.4 });
    },
};

export const HuskSeedBarrageCard: CardDef = {
    id: asCardDefId(HUSK_SEED_BARRAGE_ID),
    name: 'Seed Pod Barrage',
    abilityId: HUSK_SEED_BARRAGE_ID,
    discardDuration: { duration: 2, unit: 'rounds' },
};
