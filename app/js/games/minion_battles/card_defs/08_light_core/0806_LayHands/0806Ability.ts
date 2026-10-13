/**
 * Lay Hands — a Punch with a tripled lunge that also detonates the nearest light emitter.
 *
 * The emitter is locked when the cast begins (nearest reachable emitter in the 5×5 around the
 * caster, the same definition Devour Light uses) and stored in the caster's ability note. At the
 * punch's impact the emitter explodes for area damage and is consumed, even if the punch missed.
 * If the emitter is gone by then, the blast still lands at the frozen position.
 *
 * Timings mirror Punch: 0.0–0.2 windup (lunge), 0.2–0.4 strike, 0.4–1.2 cooldown.
 */

import type { AbilityRecoveryRule, AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { defineMeleeStrike } from '../../../abilities/archetypes/defineMeleeStrike';
import type { AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import { damageEnemiesInCircle } from '../../../abilities/targetHelpers';
import { REACH_5X5_HALF_EXTENT, type Deployable } from '../../../game/deployables/Deployable';
import { isAbilityNote } from '../../../game/AbilityNote';
import type { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { type CardDef } from '../../types';
import {
    LAY_HANDS_ABILITY_ID,
    LAY_HANDS_ACTIVE,
    LAY_HANDS_COLOR,
    LAY_HANDS_COOLDOWN,
    LAY_HANDS_EXPLOSION_DAMAGE,
    LAY_HANDS_EXPLOSION_RADIUS,
    LAY_HANDS_IMPACT_AT,
    LAY_HANDS_LUNGE_DISTANCE,
    LAY_HANDS_MAX_USES,
    LAY_HANDS_PUNCH_DAMAGE,
    LAY_HANDS_RANGE,
    LAY_HANDS_THICKNESS,
    LAY_HANDS_WINDUP,
} from './0806Constants';
import { spawnLayHandsBlast, spawnLayHandsMotes, type LayHandsVfxEngine } from './0806Vfx';

const CARD_ID = LAY_HANDS_ABILITY_ID;
/** Literal form of the id for the typed ability-note map (asserted equal in the test). */
const NOTE_ID = '0806' as const;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const LAY_HANDS_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="layHandsGlow" cx="0.5" cy="0.5" r="0.6">
      <stop offset="0%" stop-color="#fffbe6"/>
      <stop offset="55%" stop-color="#ffe066"/>
      <stop offset="100%" stop-color="#7a5a10" stop-opacity="0.9"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="22" fill="url(#layHandsGlow)" stroke="#facc15" stroke-width="3"/>
  <rect x="23" y="26" width="18" height="12" rx="3" ry="3" fill="#fff8d0" stroke="#7a5a10" stroke-width="1.8"/>
  <path d="M32 8 L32 16 M14 20 L20 24 M50 20 L44 24" stroke="#fffbe6" stroke-width="2" stroke-linecap="round"/>
</svg>`;

type DeployableEngine = Pick<EngineContext, 'findDeployables' | 'consumeDeployable'>;

/**
 * The single emitter query shared by lock, detonate and preview (they must agree): own-team light
 * emitters in the caster's 5x5, nearest-first. Returns the nearest, or null.
 */
function findNearestEmitter(engine: unknown, caster: Unit): Deployable | null {
    const eng = engine as Partial<DeployableEngine> | undefined;
    if (!eng?.findDeployables) return null;
    return (
        eng.findDeployables({
            castingTeam: caster.teamId,
            near: { x: caster.x, y: caster.y },
            halfExtent: REACH_5X5_HALF_EXTENT,
            tags: ['lightEmitter'],
        })[0] ?? null
    );
}

/** Windup start: lock the nearest reachable emitter into the cast note and draw motes toward the fist. */
function lockEmitter(ctx: CastBehaviourTickContext): void {
    const emitter = findNearestEmitter(ctx.engine, ctx.caster);
    ctx.caster.setAbilityNote({
        abilityId: NOTE_ID,
        abilityNote: { emitterId: emitter?.id ?? null, x: emitter?.x ?? 0, y: emitter?.y ?? 0 },
    });
    if (emitter) {
        spawnLayHandsMotes(ctx.engine as unknown as LayHandsVfxEngine, ctx.caster, emitter);
    }
}

/** Strike impact: explode the locked emitter (live position if still active, else the frozen one). */
function detonateEmitter(ctx: CastBehaviourTickContext): void {
    const note = ctx.caster.abilityNote;
    if (!isAbilityNote(note, NOTE_ID) || note.abilityNote.emitterId == null) return;
    const { emitterId, x, y } = note.abilityNote;
    const eng = ctx.engine as unknown as Partial<DeployableEngine>;
    // Re-resolve the locked emitter by id (same team + tag filter as the lock; no reach limit, since the
    // lunge may have carried the caster away). Gone/inactive -> blast at the frozen position.
    const emitter = eng.findDeployables?.({
        castingTeam: ctx.caster.teamId,
        near: { x, y },
        tags: ['lightEmitter'],
    }).find((d) => d.id === emitterId);
    const center = emitter ? { x: emitter.x, y: emitter.y } : { x, y };
    if (emitter) eng.consumeDeployable?.(emitter);

    spawnLayHandsBlast(ctx.engine as unknown as LayHandsVfxEngine, center);
    damageEnemiesInCircle({
        engine: ctx.engine as unknown as EngineContext,
        caster: ctx.caster,
        center,
        radius: LAY_HANDS_EXPLOSION_RADIUS,
        damage: LAY_HANDS_EXPLOSION_DAMAGE,
        abilityId: CARD_ID,
        attackType: 'melee',
    });
}

/** Preview: the emitter that would lock (ring + tether) and the blast radius around it. */
function drawLayHandsPreviewExtras(gr: IAbilityPreviewGraphics, caster: Unit, gameState?: unknown): void {
    const half = REACH_5X5_HALF_EXTENT;
    // Faint 5×5 reach square around the caster.
    gr.moveTo(caster.x - half, caster.y - half);
    gr.lineTo(caster.x + half, caster.y - half);
    gr.lineTo(caster.x + half, caster.y + half);
    gr.lineTo(caster.x - half, caster.y + half);
    gr.lineTo(caster.x - half, caster.y - half);
    gr.stroke({ color: LAY_HANDS_COLOR, width: 1, alpha: 0.2 });

    const emitter = findNearestEmitter(gameState, caster);
    if (!emitter) return;
    gr.moveTo(caster.x, caster.y);
    gr.lineTo(emitter.x, emitter.y);
    gr.stroke({ color: LAY_HANDS_COLOR, width: 2, alpha: 0.55 });
    gr.circle(emitter.x, emitter.y, LAY_HANDS_EXPLOSION_RADIUS);
    gr.fill({ color: LAY_HANDS_COLOR, alpha: 0.12 });
    gr.circle(emitter.x, emitter.y, LAY_HANDS_EXPLOSION_RADIUS);
    gr.stroke({ color: LAY_HANDS_COLOR, width: 2, alpha: 0.8 });
    // Locked marker on the emitter itself.
    gr.circle(emitter.x, emitter.y, 8);
    gr.stroke({ color: 0xffffff, width: 2, alpha: 0.95 });
}

const base = defineMeleeStrike({
    melee: false,
    id: CARD_ID,
    name: 'Lay Hands',
    image: LAY_HANDS_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: LAY_HANDS_MAX_USES,
    recoveries: RECOVERIES,
    damage: LAY_HANDS_PUNCH_DAMAGE,
    range: LAY_HANDS_RANGE,
    thickness: LAY_HANDS_THICKNESS,
    impactType: 'punch',
    impactAt: LAY_HANDS_IMPACT_AT,
    forwardDistance: 12,
    backwardDistance: 0,
    windupDuration: LAY_HANDS_WINDUP,
    activeDuration: LAY_HANDS_ACTIVE,
    cooldownDuration: LAY_HANDS_COOLDOWN,
    movementLockUntil: LAY_HANDS_WINDUP + LAY_HANDS_ACTIVE,
    lunge: { distance: LAY_HANDS_LUNGE_DISTANCE },
    aiMaxRange: LAY_HANDS_RANGE + LAY_HANDS_LUNGE_DISTANCE,

    getTooltipText(): string[] {
        return [
            'Hit {1} enemy for {{DAMAGE}} damage',
            `Detonate the nearest light emitter for {${LAY_HANDS_EXPLOSION_DAMAGE}} damage in an area`,
        ];
    },
});

export const LayHandsAbility: AbilityStatic = {
    ...base,
    abilityTimings: (base.abilityTimings ?? []).map((entry) => {
        const timing = entry as AbilityTimingInterval;
        if (timing.id === 'windup') {
            return {
                ...timing,
                castBehaviours: [{ timingStart: 'start' as const, behaviour: CastBehaviours.Instant(lockEmitter) }],
            };
        }
        if (timing.id === 'strike' && timing.behaviour) {
            return {
                ...timing,
                castBehaviours: [
                    { timingStart: 'start' as const, timingEnd: 'end' as const, behaviour: timing.behaviour },
                    {
                        timingStart: `${LAY_HANDS_IMPACT_AT * 100}%` as const,
                        behaviour: CastBehaviours.Instant(detonateEmitter),
                    },
                ],
            };
        }
        return entry;
    }),
    renderSelectTargetPreviewExtras: drawLayHandsPreviewExtras,
};

export const LayHandsCard: CardDef = {
    abilityId: CARD_ID,
};
