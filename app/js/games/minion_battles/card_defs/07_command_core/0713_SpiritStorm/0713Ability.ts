/**
 * Spirit Storm — the player and the spirit become the two ends of a storm.
 *
 * 1. Windup: the Command spell circle gathers round the player.
 * 2. Reposition: after the windup, pick a point within range of the spirit (an anchored select step,
 *    `anchorUnit: 'casterPet'`); the spirit darts there, leaving a slash.
 * 3. Storm: the spirit spins in a tight loop while the area pulses {4} times — a circle round the player, a
 *    circle round the spirit, and the band between them. Each pulse hits each enemy once, even one inside
 *    several parts. A field of slow motes fills the area; each pulse lands with a burst.
 *
 * Without a living spirit the storm is just the circle round the player.
 * Built from engine blocks: `SpellCircle`, `PetRelocateBehaviour`, `PetSpinBehaviour`, `LinkedAreaPulseBehaviour`.
 */
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { defineAbility } from '../../../abilities/defineAbility';
import type { AbilityRecoveryRule, AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { LinkedAreaPulseBehaviour } from '../../../abilities/CastBehaviours/LinkedAreaPulseBehaviour';
import { PetRelocateBehaviour, PetSpinBehaviour } from '../../../abilities/CastBehaviours/PetBehaviours';
import { resolveCasterPetAnchor } from '../../../abilities/targeting';
import { SPELL_CIRCLE_STYLE_COMMAND } from '../../../game/spellCircles/spellCircles';
import { themedSlashTrail } from '../../../game/effects/slashTrail';
import { themedLinkedAreaField } from '../../../game/effects/linkedAreaField';
import { nullHitbox } from '../../../hitboxes';
import type { CardDef } from '../../types';
import type { Unit } from '../../../game/units/Unit';
import { getThemeById, themeGlowPair } from '../../../themes/abilityTheme';

export const SPIRIT_STORM_ABILITY_ID = `${formatGroupId(AbilityGroupId.Command)}13`;

export const SPIRIT_STORM_WINDUP = 0.8;
const RELOCATE_SECONDS = 0.15;
export const SPIRIT_STORM_SECONDS = 1.6;
const COOLDOWN_SECONDS = 0.4;
export const SPIRIT_STORM_PULSES = 4;
export const SPIRIT_STORM_DAMAGE = 4;
/** Radius of the circle round the player and round the spirit (px). */
export const SPIRIT_STORM_RADIUS = 56;
/** Full width of the band between them (px). */
export const SPIRIT_STORM_LINE_WIDTH = 30;
/** How far from where it stands the spirit may be sent (px). */
export const SPIRIT_STORM_REPOSITION_RANGE = 140;

export const SPIRIT_STORM_REPOSITION_LABEL = 'Storm point';

const RELOCATE_END = SPIRIT_STORM_WINDUP + RELOCATE_SECONDS;
const STORM_END = RELOCATE_END + SPIRIT_STORM_SECONDS;

const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const glow = themeGlowPair(getThemeById('command'));

export const spiritStormPulse = new LinkedAreaPulseBehaviour()
    .withLink((ctx) => resolveCasterPetAnchor(ctx.caster, ctx.engine))
    .withRadius(SPIRIT_STORM_RADIUS)
    .withLineWidth(SPIRIT_STORM_LINE_WIDTH)
    .withPulses(SPIRIT_STORM_PULSES)
    .withDamage(SPIRIT_STORM_DAMAGE)
    .withField(themedLinkedAreaField('command'));

const ABILITY_TIMINGS: AbilityTimingInterval[] = [
    {
        id: 'windup',
        start: 0,
        end: SPIRIT_STORM_WINDUP,
        abilityPhase: AbilityPhase.Windup,
        castBehaviours: [
            { timingStart: 'start', timingEnd: 'end', behaviour: CastBehaviours.SpellCircle({ style: SPELL_CIRCLE_STYLE_COMMAND }) },
        ],
    },
    {
        id: 'reposition',
        start: SPIRIT_STORM_WINDUP,
        end: RELOCATE_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        targetDef: {
            kind: 'select',
            label: SPIRIT_STORM_REPOSITION_LABEL,
            hitbox: nullHitbox,
            filter: 'any',
            allowMiss: true,
            pickAtEntry: true,
            anchorUnit: 'casterPet',
            maxRangeFromAnchor: SPIRIT_STORM_REPOSITION_RANGE,
        },
        castBehaviours: [
            {
                timingStart: 'start',
                timingEnd: 'end',
                behaviour: new PetRelocateBehaviour().withSlashTrail(themedSlashTrail('command')),
            },
        ],
    },
    {
        id: 'storm',
        start: RELOCATE_END,
        end: STORM_END,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        castBehaviours: [
            { timingStart: 'start', timingEnd: 'end', behaviour: spiritStormPulse },
            { timingStart: 'start', timingEnd: 'end', behaviour: new PetSpinBehaviour() },
        ],
    },
    { id: 'cooldown', start: STORM_END, end: STORM_END + COOLDOWN_SECONDS, abilityPhase: AbilityPhase.Cooldown },
];

const SPIRIT_STORM_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="28" fill="#0f766e"/>
  <circle cx="20" cy="38" r="9" fill="none" stroke="#d9f99d" stroke-width="2.5"/>
  <circle cx="44" cy="26" r="9" fill="none" stroke="#d9f99d" stroke-width="2.5"/>
  <path d="M26 33 L38 31 M27 41 L39 29" stroke="#d9f99d" stroke-width="2" stroke-linecap="round"/>
  <circle cx="44" cy="26" r="3" fill="#ffffff"/>
  <circle cx="20" cy="38" r="2.5" fill="#d9f99d"/>
  <circle cx="31" cy="20" r="1.5" fill="#d9f99d"/>
  <circle cx="36" cy="44" r="1.5" fill="#d9f99d"/>
</svg>`;

export const SpiritStormAbility: AbilityStatic = defineAbility({
    id: SPIRIT_STORM_ABILITY_ID,
    name: 'Spirit Storm',
    image: SPIRIT_STORM_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: 1,
    recoveries: RECOVERIES,
    prefireTime: SPIRIT_STORM_WINDUP,
    targets: [],
    abilityTimings: ABILITY_TIMINGS,

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: SPIRIT_STORM_REPOSITION_RANGE };
    },

    getTooltipText(): string[] {
        return [
            `Gather a storm, then send your spirit up to {${SPIRIT_STORM_REPOSITION_RANGE}}px.`,
            `The area round you, round your spirit, and between you pulses {${SPIRIT_STORM_PULSES}} times for {${SPIRIT_STORM_DAMAGE}} damage. Each pulse hits an enemy once.`,
        ];
    },

    flavorText: 'Two ends of one storm.',

    renderTargetingPreview(gr: IAbilityPreviewGraphics, caster: Unit): void {
        gr.circle(caster.x, caster.y, SPIRIT_STORM_RADIUS);
        gr.stroke({ color: glow.light, width: 1.5, alpha: 0.5 });
    },
});

export const SpiritStormCard: CardDef = {
    abilityId: SPIRIT_STORM_ABILITY_ID,
};
