import type { AbilityRecoveryRule, AbilityStatic, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityEventType } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { type CardDef } from '../types';
import { HitboxSpec } from '../../hitboxes/HitboxSpec';
import type { HitboxEngineContext, HitboxPreviewCaster } from '../../hitboxes';
import type { Unit } from '../../game/units/Unit';
import { Effect } from '../../game/effects/Effect';
import { getDirectionFromTo, pointInCone } from '../../abilities/targetHelpers';
import { STANDARD_SHIELD_HALF_ARC_RAD } from '../../abilities/shieldHelpers';
import { areEnemies } from '../../game/teams';
import { drawConeSlice } from '../../abilities/previewHelpers';

const CARD_ID = '0121';
const MAX_USES = 2;
const STARTING_USES = 0;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'energyCharge', chargesPerRecovery: 3, usesRecovered: 1 },
];
const CONE_RANGE = 220;
const CONE_HALF_ANGLE_RAD = STANDARD_SHIELD_HALF_ARC_RAD / 2;
const DAMAGE = 18;
const MAX_TARGETS = 6;
const STUN_DURATION = 2;
const CONE_FLASH_DURATION = 0.3;
const PREVIEW_FILL_COLOR = 0xa0a0a0;
const PREVIEW_STROKE_COLOR = 0x505050;

class ConeOfLightHitboxSpec extends HitboxSpec {
    get maxRange(): number { return CONE_RANGE; }
    override get numTargets(): number { return MAX_TARGETS; }

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return [];
        const centerAngle = Math.atan2(dy, dx);
        const dirX = dx / dist;
        const dirY = dy / dist;
        gr.clear();
        drawConeSlice(gr, caster.x, caster.y, centerAngle, CONE_HALF_ANGLE_RAD, 0, CONE_RANGE, {
            fillColor: PREVIEW_FILL_COLOR,
            fillAlpha: 0.2,
            strokeColor: PREVIEW_STROKE_COLOR,
            strokeAlpha: 0.7,
        });
        return units.filter(
            (u) => u.isAlive() &&
                pointInCone(caster.x, caster.y, u.x, u.y, dirX, dirY, 0, CONE_RANGE, CONE_HALF_ANGLE_RAD),
        );
    }

    resolveTargets(caster: Unit, aimPoint: { x: number; y: number }, units: Unit[]): Unit[] {
        const dx = aimPoint.x - caster.x;
        const dy = aimPoint.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return [];
        const dirX = dx / dist;
        const dirY = dy / dist;
        return units.filter(
            (u) => u.id !== caster.id && u.isAlive() &&
                pointInCone(caster.x, caster.y, u.x, u.y, dirX, dirY, 0, CONE_RANGE, CONE_HALF_ANGLE_RAD),
        );
    }

    resolveHits(engine: HitboxEngineContext, caster: Unit, aimX: number, aimY: number): Unit[] {
        const dx = aimX - caster.x;
        const dy = aimY - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return [];
        const dirX = dx / dist;
        const dirY = dy / dist;
        const hits: Unit[] = [];
        for (const u of engine.units) {
            if (u.id === caster.id || !u.isAlive()) continue;
            if (!areEnemies(caster.teamId, u.teamId)) continue;
            if (pointInCone(caster.x, caster.y, u.x, u.y, dirX, dirY, 0, CONE_RANGE, CONE_HALF_ANGLE_RAD)) {
                hits.push(u);
            }
        }
        hits.sort((a, b) =>
            Math.hypot(a.x - caster.x, a.y - caster.y) - Math.hypot(b.x - caster.x, b.y - caster.y),
        );
        return hits;
    }
}

const CONE_OF_LIGHT_HITBOX = new ConeOfLightHitboxSpec();

const CONE_OF_LIGHT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="col_glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fffde7"/>
      <stop offset="0.5" stop-color="#ffe066"/>
      <stop offset="1" stop-color="#ffd700" stop-opacity="0.3"/>
    </radialGradient>
  </defs>
  <polygon points="32,8 8,56 56,56" fill="url(#col_glow)" stroke="#ffd700" stroke-width="2"/>
  <circle cx="32" cy="14" r="5" fill="#fff9c4"/>
</svg>`;

export const ConeOfLightAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Cone of Light',
    image: CONE_OF_LIGHT_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    startingUses: STARTING_USES,
    recoveries: RECOVERIES,
    prefireTime: 0.2,
    abilityTimings: [
        { id: 'windup',   start: 0,    end: 0.2,  abilityPhase: AbilityPhase.Windup },
        {
            id: 'active',
            start: 0.2,
            end: 0.3,
            abilityPhase: AbilityPhase.Active,
            targetDef: {
                kind: 'select',
                label: 'Direction',
                hitbox: CONE_OF_LIGHT_HITBOX,
                filter: 'enemy',
                allowMiss: true,
            },
            behaviour: CastBehaviours.MeleeAttack()
                .withHitbox(CONE_OF_LIGHT_HITBOX)
                .withDamage(DAMAGE)
                .withImpactVFX((ctx, _hitUnits, aimX, aimY) => {
                    const { dirX, dirY } = getDirectionFromTo(ctx.caster.x, ctx.caster.y, aimX, aimY);
                    const centerAngle = Math.atan2(dirY, dirX);
                    ctx.engine.addEffect(new Effect({
                        x: ctx.caster.x,
                        y: ctx.caster.y,
                        duration: CONE_FLASH_DURATION,
                        effectType: 'ConeFlash',
                        effectData: {
                            centerAngle,
                            halfArcRad: CONE_HALF_ANGLE_RAD,
                            innerR: 0,
                            outerR: CONE_RANGE,
                        },
                    }));
                }),
        },
        { id: 'cooldown', start: 0.3, end: 0.95, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [],
    aiSettings: { minRange: 0, maxRange: CONE_RANGE },

    abilityEvents: {
        [AbilityEventType.ON_ATTACK_HIT]: [
            {
                conditions: [{ type: 'hitResultIs', result: 'hit' }],
                effects: [
                    { type: 'applyStunnedToPrimaryTarget', duration: STUN_DURATION, ccCharges: 2 },
                    { type: 'interruptPrimaryTargetAbilities' },
                ],
            },
        ],
    },

    getTooltipText(): string[] {
        return [
            'Release a blinding cone of light',
            `Deals {${DAMAGE}} damage to up to {${MAX_TARGETS}} enemies in a {60}° arc`,
            `Stuns hit enemies for {${STUN_DURATION}} seconds`,
        ];
    },

    getAbilityStates(): [] {
        return [];
    },
};

export const ConeOfLightCard: CardDef = {
    abilityId: CARD_ID,
};
