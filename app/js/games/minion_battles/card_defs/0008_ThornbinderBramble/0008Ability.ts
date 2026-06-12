/**
 * Thornbinder â€” AoE bramble slam: damage + slowing patch until shortly before next cast.
 */

import type { AbilityRecoveryRule, AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import type { ActiveAbility } from '../../game/types';
import { Projectile } from '../../game/projectiles/Projectile';
import { Effect } from '../../game/effects/Effect';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { isAbilityNote } from '../../game/AbilityNote';
import { getPixelTargetPosition, damageEnemiesInCircle } from '../../abilities/targetHelpers';
import type { EventBus } from '../../game/EventBus';
import { isLightHateWeakened } from '../../game/lightHate';
import type { TerrainLayerManager } from '../../game/TerrainLayerManager';

export const THORNBINDER_ABILITY_ID = `${formatGroupId(AbilityGroupId.Enemy)}08`;

const MAX_USES = 1;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const LOCK_TIME = 0.85;
const STRIKE_TIME = 1.85;
const COOLDOWN_END = 5.5;
const BASE_RADIUS = 95;
const WEAKENED_RADIUS = 72;
const BASE_DAMAGE = 7;
const WEAKENED_DAMAGE = 5;
const SLOW_MULT_NORMAL = 0.52;
const SLOW_MULT_WEAKENED = 0.72;
const BRAMBLE_CLEAR_BEFORE_NEXT_SEC = 0.15;

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
    prefireTime: STRIKE_TIME,
    abilityTimings: [
        { id: 'windup', start: 0, end: LOCK_TIME, abilityPhase: AbilityPhase.Windup },
        { id: 'strike', start: LOCK_TIME, end: STRIKE_TIME, abilityPhase: AbilityPhase.Active },
        { id: 'cooldown', start: STRIKE_TIME, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Ground' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: 320 },

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

        const expiresAt = eng.gameTime + (COOLDOWN_END - STRIKE_TIME) - BRAMBLE_CLEAR_BEFORE_NEXT_SEC;
        eng.terrainLayers.add({
            id: `bramble-${caster.id}-${eng.gameTime}`,
            layer: 'ground',
            effectType: 'bramble_slow',
            placedAtGameTime: eng.gameTime,
            expiresAtGameTime: Math.max(eng.gameTime + 0.05, expiresAt),
            ownerUnitId: caster.id,
            ownerAbilityId: THORNBINDER_ABILITY_ID,
            area: { type: 'circle', x: pos.x, y: pos.y, radiusPx: radius },
            params: { slowMult },
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
    renderTargetingPreview(gr: IAbilityPreviewGraphics, caster: Unit): void {
        gr.circle(caster.x, caster.y, 320);
        gr.stroke({ width: 1, color: 0xef4444, alpha: 0.35 });
    },
};

export const ThornbinderBrambleCard: CardDef = {
    abilityId: THORNBINDER_ABILITY_ID,
};
