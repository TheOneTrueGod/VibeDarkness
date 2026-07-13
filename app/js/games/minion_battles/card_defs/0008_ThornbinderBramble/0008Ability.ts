/**
 * Thornbinder â€” AoE bramble slam: damage + slowing patch until shortly before next cast.
 */

import type { AbilityRecoveryRule, AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import type { ActiveAbility } from '../../game/types';
import { Projectile } from '../../game/projectiles/Projectile';
import { Effect } from '../../game/effects/Effect';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { HitboxSpec } from '../../hitboxes';
import type { HitboxEngineContext, HitboxPreviewCaster } from '../../hitboxes';
import { type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { isAbilityNote } from '../../game/AbilityNote';
import { getPixelTargetPosition, damageEnemiesInCircle, placeJitteredGroundThorns } from '../../abilities/targetHelpers';
import type { EventBus } from '../../game/EventBus';
import { isLightHateWeakened } from '../../game/lightHate';
import type { TerrainLayerManager } from '../../game/TerrainLayerManager';
import { ROUND_DURATION } from '../../game/gameConstants';

export const THORNBINDER_ABILITY_ID = `${formatGroupId(AbilityGroupId.Enemy)}08`;

const MAX_USES = 2;
// 2 uses banked at once, so the ability can burst-cast twice before needing a fresh round of recovery.
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 2 },
];
const LOCK_TIME = 0.85;
const STRIKE_TIME = 1.85;
// A tiny amount over half a round, so back-to-back banked uses land just past the round midpoint.
const COOLDOWN_END = ROUND_DURATION / 2 + 0.1;
const BASE_RADIUS = 95;
const WEAKENED_RADIUS = 72;
const BASE_DAMAGE = 7;
const WEAKENED_DAMAGE = 5;
const SLOW_MULT_NORMAL = 0.52;
const SLOW_MULT_WEAKENED = 0.72;
const BRAMBLE_CLEAR_BEFORE_NEXT_SEC = 0.15;
const TARGETING_RANGE = 320;
const DURATION_JITTER_IN_SECONDS = 1;

class ThornbinderHitboxSpec extends HitboxSpec {
    get maxRange(): number { return TARGETING_RANGE; }
    renderTargetingPreview(gr: IAbilityPreviewGraphics, caster: HitboxPreviewCaster, _mouseWorld: { x: number; y: number }, _units: Unit[]): Unit[] {
        gr.circle(caster.x, caster.y, TARGETING_RANGE);
        gr.stroke({ width: 1, color: 0xef4444, alpha: 0.35 });
        return [];
    }
    resolveTargets(_caster: Unit, _aimPoint: { x: number; y: number }, _units: Unit[]): Unit[] { return []; }
    resolveHits(_engine: HitboxEngineContext, _caster: Unit, _aimX: number, _aimY: number): Unit[] { return []; }
}
const THORNBINDER_HITBOX = new ThornbinderHitboxSpec();

interface EngineLike {
    units: Unit[];
    gameTime: number;
    eventBus: EventBus;
    terrainLayers: TerrainLayerManager;
    lightLevelEnabled: boolean;
    globalLightLevel: number;
    terrainManager: { grid: import('../../terrain/TerrainGrid').TerrainGrid } | null;
    addProjectile(projectile: Projectile): void;
    addEffect(effect: Effect): void;
    getAllLightSources(): import('../../game/LightGrid').LightSource[];
    generateRandomInteger(min: number, max: number): number;
}

function getStrikePosition(caster: Unit, active: { targets: ResolvedTarget[] }): { x: number; y: number } | null {
    if (isAbilityNote(caster.abilityNote, '0008')) {
        return caster.abilityNote.abilityNote.position;
    }
    return getPixelTargetPosition(active.targets, 0);
}

export const ThornbinderBrambleAbility: AbilityStatic = {
    id: THORNBINDER_ABILITY_ID,
    name: 'Thornbinder Bramble',
    image: '',
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    durationJitterInSeconds: DURATION_JITTER_IN_SECONDS,
    prefireTime: STRIKE_TIME,
    abilityTimings: [
        { id: 'windup', start: 0, end: LOCK_TIME, abilityPhase: AbilityPhase.Windup },
        { id: 'strike', start: LOCK_TIME, end: STRIKE_TIME, abilityPhase: AbilityPhase.Active, targetDef: { kind: 'select', label: 'Ground', hitbox: THORNBINDER_HITBOX, filter: 'any', allowMiss: true } },
        { id: 'cooldown', start: STRIKE_TIME, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [],
    aiSettings: {
        minRange: 0,
        maxRange: 320,
        // This is a ground-target cast (targets: []); without this the AI would treat it as
        // always valid regardless of distance to the locked pursuit target.
        enforceRangeWhenUntargeted: true,
    },

    getTooltipText(): string[] {
        return [
            'Slam the ground, dealing damage and leaving bramble that slows movement',
            'Weakened by bright light (Light Hate)',
        ];
    },
    getAbilityStates(): AbilityStateEntry[] {
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const eng = engine as EngineLike;
        if (prevTime < LOCK_TIME && currentTime >= LOCK_TIME) {
            const pos = getPixelTargetPosition(targets, 0);
            if (pos) {
                caster.setAbilityNote({
                    abilityId: '0008',
                    abilityNote: { position: { ...pos } },
                });
                const dx = pos.x - caster.x;
                const dy = pos.y - caster.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 1) {
                    const speed = dist / (STRIKE_TIME - LOCK_TIME);
                    eng.addProjectile(new Projectile({
                        x: caster.x,
                        y: caster.y,
                        velocityX: (dx / dist) * speed,
                        velocityY: (dy / dist) * speed,
                        damage: 0,
                        sourceTeamId: caster.teamId,
                        sourceUnitId: caster.id,
                        sourceAbilityId: THORNBINDER_ABILITY_ID,
                        maxDistance: dist,
                        projectileType: 'bramble_spike',
                        passThroughEnemies: true,
                    }));
                }
            }
        }
        if (prevTime >= STRIKE_TIME || currentTime < STRIKE_TIME) return;

        const pos = getStrikePosition(caster, { targets });
        caster.clearAbilityNote();
        if (!pos) return;

        const weakened = isLightHateWeakened(caster, eng);
        const radius = weakened ? WEAKENED_RADIUS : BASE_RADIUS;
        const damage = weakened ? WEAKENED_DAMAGE : BASE_DAMAGE;
        const slowMult = weakened ? SLOW_MULT_WEAKENED : SLOW_MULT_NORMAL;

        eng.terrainLayers.removeByOwner(caster.id, 'ground');

        damageEnemiesInCircle({
            engine: eng,
            caster,
            center: pos,
            radius,
            damage,
            abilityId: THORNBINDER_ABILITY_ID,
            attackType: 'melee',
        });

        // Thorns last roughly a full round, so the patch is still (mostly) up right until the next slam.
        const baseExpiresAt = eng.gameTime + ROUND_DURATION - BRAMBLE_CLEAR_BEFORE_NEXT_SEC;
        placeJitteredGroundThorns({
            engine: eng,
            caster,
            center: pos,
            radius,
            effectType: 'dark_thorn',
            placedAtGameTime: eng.gameTime,
            baseExpiresAtGameTime: baseExpiresAt,
            durationJitterInSeconds: DURATION_JITTER_IN_SECONDS,
            ownerAbilityId: THORNBINDER_ABILITY_ID,
            params: { slowMult },
            idPrefix: `bramble-${caster.id}-${eng.gameTime}`,
        });

        eng.addEffect(new Effect({
            x: pos.x,
            y: pos.y,
            duration: 0.6,
            effectType: 'BrambleExplosion',
            effectRadius: radius,
        }));
    },
    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {},

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        if (elapsed >= STRIKE_TIME) return;

        const target = getStrikePosition(caster, activeAbility);
        if (!target) return;

        // Arcing trajectory line: visible during windup, fades out as the projectile launches
        if (elapsed < LOCK_TIME) {
            const lineFadeT = elapsed / LOCK_TIME;
            const dx = target.x - caster.x;
            const dy = target.y - caster.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const arcH = Math.min(dist * 0.4, 100);
            const ctrlX = (caster.x + target.x) / 2;
            const ctrlY = (caster.y + target.y) / 2 - arcH;
            const SEGS = 16;
            for (let i = 0; i <= SEGS; i++) {
                const t = i / SEGS;
                const mt = 1 - t;
                const bx = mt * mt * caster.x + 2 * mt * t * ctrlX + t * t * target.x;
                const by = mt * mt * caster.y + 2 * mt * t * ctrlY + t * t * target.y;
                if (i === 0) gr.moveTo(bx, by);
                else gr.lineTo(bx, by);
            }
            gr.stroke({ color: 0xef4444, width: 2, alpha: 0.25 + 0.45 * lineFadeT });
        }

        // Outer boundary circle: shows full impact radius, brightens as impact nears
        const borderAlpha = 0.25 + 0.55 * Math.min(1, elapsed / STRIKE_TIME);
        gr.circle(target.x, target.y, BASE_RADIUS);
        gr.stroke({ color: 0xef4444, width: 2, alpha: borderAlpha });

        // Expanding inner ring: grows from 0 to BASE_RADIUS over the full cast (0 â†’ STRIKE_TIME)
        const ringT = elapsed / STRIKE_TIME;
        const ringRadius = ringT * BASE_RADIUS;
        if (ringRadius > 2) {
            gr.circle(target.x, target.y, ringRadius);
            gr.stroke({ color: 0xfca5a5, width: 3, alpha: 0.45 + 0.45 * ringT });
        }
    },
};

export const ThornbinderBrambleCard: CardDef = {
    abilityId: THORNBINDER_ABILITY_ID,
};
