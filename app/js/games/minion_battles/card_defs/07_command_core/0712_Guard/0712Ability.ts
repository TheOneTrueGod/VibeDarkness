/**
 * Guard - player command card. Pick an ally (or yourself) within range: the nearest free spirit is exiled
 * (`game/units/exile.ts`, reason `'guard'`) and the target gets a Guard Shield (`buffs/guardShield.ts`) that
 * refills to `GUARD_SHIELD_FLOOR` after every hit, so each hit is reduced by that much. When the shield ends
 * the spirit re-emerges from the target (`guardReturn.ts`). With no free spirit, or no valid target, it fizzles.
 * A clone (Displacement Strike) may guard; it returns no later than its despawn time.
 */
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { resolveAbilitySourceUnits, playCommandCues } from '../../../abilities/petCommands';
import { asCastPriorityEngine } from '../../../abilities/abilitySourceUnits';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityRecoveryRule, PetAbilitySource } from '../../../abilities/Ability';
import { drawNoPetSourceFizzle, drawRangeRings } from '../../../abilities/previewHelpers';
import { createGuardShield } from '../../../buffs/guardShield';
import type { EngineContext } from '../../../game/EngineContext';
import { areAllies } from '../../../game/teams';
import type { Unit } from '../../../game/units/Unit';
import { unitRangeHitbox } from '../../../hitboxes';
import { type CardDef } from '../../types';
import { ResourceId } from '../../../resources/resourceIds';
import {
    GUARD_ABILITY_ID,
    GUARD_KINSHIP_RECOVERY,
    GUARD_EXILE_REASON,
    GUARD_RANGE,
    GUARD_SECONDS,
    GUARD_SHIELD_FLOOR,
} from './guardConstants';
import { guardPulse } from './guardReturn';

export { GUARD_ABILITY_ID, GUARD_RANGE, GUARD_SECONDS, GUARD_SHIELD_FLOOR };
export const GUARD_TARGET_LABEL = 'Guard target';

const MAX_USES = 1;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const CAST_DURATION = 0.1;
const COOLDOWN_DURATION = 0.4;
/** Command Core lime, for the range ring. */
const PREVIEW_COLOR = 0xd9f99d;

export const GUARD_PET_SOURCE: PetAbilitySource = { type: 'pet', selector: 'nearest', requireFree: true };

const GUARD_HITBOX = unitRangeHitbox(GUARD_RANGE, 0, true);

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'active',
        start: 0,
        end: CAST_DURATION,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: {
            kind: 'select',
            label: GUARD_TARGET_LABEL,
            hitbox: GUARD_HITBOX,
            filter: 'ally',
            allowMiss: false,
            includeSelf: true,
        },
        castBehaviours: [
            {
                timingStart: 'start',
                behaviour: CastBehaviours.Instant((ctx) => {
                    const eng = ctx.engine as unknown as EngineContext;
                    const t = ctx.target;
                    const target = t.type === 'unit' && t.unitId ? eng.getUnit(t.unitId) : undefined;
                    if (!target?.isAlive()) return;
                    // The guarded unit never guards itself (a spirit or clone can be the ally).
                    const [spirit] = resolveAbilitySourceUnits(
                        GuardAbility, ctx.caster, eng.units.filter((u) => u !== target), { x: target.x, y: target.y }, eng,
                    );
                    if (!spirit) return;

                    // A clone must be back by its despawn time (it then expires as usual).
                    const despawnAt = spirit.ephemeralDespawnAtGameTime;
                    const seconds = despawnAt == null
                        ? GUARD_SECONDS
                        : Math.max(0, Math.min(GUARD_SECONDS, despawnAt - eng.gameTime));
                    const exiled = eng.exileUnit(spirit, {
                        reason: GUARD_EXILE_REASON,
                        anchorUnitId: target.id,
                        returnAtGameTime: despawnAt,
                    });
                    if (!exiled) return;

                    playCommandCues(ctx.caster, [spirit], eng);
                    eng.addEffect(guardPulse(spirit.x, spirit.y, 0.45));
                    target.addBuff(
                        createGuardShield({
                            floor: GUARD_SHIELD_FLOOR,
                            seconds,
                            guardianUnitId: spirit.id,
                            gameTime: eng.gameTime,
                            // The caster's bond deepens while the spirit guards.
                            resourceTrickle: {
                                unitId: ctx.caster.id,
                                resourceId: ResourceId.Kinship,
                                amount: GUARD_KINSHIP_RECOVERY,
                            },
                        }),
                        eng.gameTime,
                        eng.roundNumber,
                        eng.eventBus,
                    );
                }),
            },
        ],
    },
    { id: 'cooldown', start: CAST_DURATION, end: CAST_DURATION + COOLDOWN_DURATION, abilityPhase: AbilityPhase.Cooldown },
];

/** A lime shield over a white spirit mote on a teal disc (Command Core palette). */
const GUARD_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="28" fill="#0f766e"/>
  <path d="M32 14 L47 20 L47 33 C47 42 40 48 32 51 C24 48 17 42 17 33 L17 20 Z" fill="#042f2e" stroke="#d9f99d" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M32 24 L38 32 L32 40 L26 32 Z" fill="#ffffff"/>
</svg>`;

export const GuardAbility = defineAbility({
    id: GUARD_ABILITY_ID,
    name: 'Guard',
    flavorText: 'It steps into you and does not step out until the danger passes.',
    image: GUARD_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    prefireTime: 0,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,
    abilitySource: GUARD_PET_SOURCE,

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: GUARD_RANGE };
    },

    getTooltipText(): string[] {
        return [
            `Your spirit shields an ally for {${GUARD_SECONDS}}s`,
            '{Guard Shield}',
            `Recover {${GUARD_KINSHIP_RECOVERY}} Kinship over the duration`,
        ];
    },

    // Range ring round the caster and a line from the spirit to the ally under the cursor; the fizzle X with no free spirit.
    renderTargetingPreviewSelectedTargets(gr, caster, _currentTargets, mouseWorld, units, gameState) {
        gr.clear();
        const spirit = resolveAbilitySourceUnits(GuardAbility, caster, units, mouseWorld, asCastPriorityEngine(gameState))[0];
        if (!spirit) {
            drawNoPetSourceFizzle(gr, caster);
            return;
        }
        drawRangeRings(gr, caster.x, caster.y, 0, GUARD_RANGE, { strokeColor: PREVIEW_COLOR, fillAlpha: 0.08 });
        const ally = units.find((u) => (
            u.isAlive()
            && areAllies(caster.teamId, u.teamId)
            && Math.hypot(mouseWorld.x - u.x, mouseWorld.y - u.y) <= u.radius + 8
            && Math.hypot(caster.x - u.x, caster.y - u.y) <= GUARD_RANGE
        ));
        if (!ally) return;
        gr.moveTo(spirit.x, spirit.y);
        gr.lineTo(ally.x, ally.y);
        gr.stroke({ color: PREVIEW_COLOR, width: 3, alpha: 0.7 });
        gr.circle(ally.x, ally.y, ally.radius + 4);
        gr.stroke({ color: PREVIEW_COLOR, width: 2, alpha: 0.9 });
    },
});

export const GuardCard: CardDef = {
    abilityId: GUARD_ABILITY_ID,
};
