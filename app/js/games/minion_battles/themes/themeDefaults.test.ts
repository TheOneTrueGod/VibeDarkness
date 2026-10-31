import { describe, expect, it } from 'vitest';
import type { AbilityStatic, IAbilityPreviewGraphics } from '../abilities/Ability';
// Load the registry first: the archetype modules sit in an import cycle with the card defs.
import '../abilities/AbilityRegistry';
import { isAbilityTimingInterval } from '../abilities/abilityTimings';
import { isSelectTargetDef } from '../abilities/timingTargetDef';
import {
    defineDirectionalShield,
    resolveDirectionalShieldColors,
} from '../abilities/archetypes/defineDirectionalShield';
import {
    ConeStrikeHitboxSpec,
    resolveConeStrikeColors,
} from '../abilities/archetypes/defineConeStrike';
import { TELEGRAPH_STYLES, themedTelegraphStyle } from '../abilities/telegraphStyles';
import { CHARGE_RESOURCE_COLOR } from '../resources/Charge';
import { CreateShieldAbility_1008 } from '../card_defs/10_armory_core/1008_CreateShield/1008Ability';
import { ReleaseChargeAbility_1009 } from '../card_defs/10_armory_core/1009_ReleaseCharge/1009Ability';
import { ConeOfLightAbility } from '../card_defs/0121_ConeOfLight/0121Ability';
import { getAbilityTheme, getTwoToneAbilityTheme } from './abilityTheme';

// Colours each ability drew before Step 4 (Quench primary / secondary, Cone of Light greys).
const QUENCH_PRIMARY = 0x4f6d8c;
const QUENCH_SECONDARY = 0xe7e5e4;
const CONE_OF_LIGHT_PREVIEW_FILL = 0xa0a0a0;
const CONE_OF_LIGHT_PREVIEW_STROKE = 0x505050;
// `createArcTargetPreview` defaults: what a shield with no colour and no two-tone theme draws.
const ARC_PREVIEW_DEFAULT_FILL = 0x6b8e6b;
const ARC_PREVIEW_DEFAULT_STROKE = 0x4a6b4a;

interface RecordedColours {
    fills: number[];
    strokes: number[];
}

function recordingGraphics(): IAbilityPreviewGraphics & RecordedColours {
    const fills: number[] = [];
    const strokes: number[] = [];
    return {
        fills,
        strokes,
        clear(): void {},
        moveTo(): void {},
        lineTo(): void {},
        circle(): void {},
        fill(o): void { fills.push(o.color); },
        stroke(o): void { strokes.push(o.color); },
    };
}

const CASTER = { x: 0, y: 0, radius: 12 };
const MOUSE = { x: 100, y: 0 };

function shieldPreviewColours(ability: AbilityStatic): RecordedColours {
    const gr = recordingGraphics();
    ability.renderTargetingPreviewSelectedTargets!(gr, CASTER as never, [], MOUSE, []);
    return { fills: gr.fills, strokes: gr.strokes };
}

function coneHitbox(ability: AbilityStatic): ConeStrikeHitboxSpec {
    for (const interval of ability.abilityTimings ?? []) {
        if (!isAbilityTimingInterval(interval)) continue;
        const def = interval.targetDef;
        if (def && isSelectTargetDef(def) && def.hitbox instanceof ConeStrikeHitboxSpec) return def.hitbox;
    }
    throw new Error(`${ability.id} has no cone strike hitbox`);
}

function conePreviewColours(ability: AbilityStatic): RecordedColours {
    const gr = recordingGraphics();
    coneHitbox(ability).renderTargetingPreview(gr, CASTER, MOUSE, []);
    return { fills: gr.fills, strokes: gr.strokes };
}

describe('theme defaults for archetypes', () => {
    it('only a theme with an explicit secondary is two-tone', () => {
        expect(getTwoToneAbilityTheme('1008')?.id).toBe('armory');
        expect(getTwoToneAbilityTheme('0902')).toBeUndefined();
        expect(getTwoToneAbilityTheme('0121')).toBeUndefined();
        expect(getTwoToneAbilityTheme('abc')).toBeUndefined();
    });

    it('Create Shield keeps its Quench fill and stroke without passing them', () => {
        expect(resolveDirectionalShieldColors({ id: CreateShieldAbility_1008.id })).toEqual({
            fillColor: QUENCH_PRIMARY,
            strokeColor: QUENCH_SECONDARY,
        });
        expect(shieldPreviewColours(CreateShieldAbility_1008)).toEqual({
            fills: [QUENCH_PRIMARY],
            strokes: [QUENCH_SECONDARY],
        });
    });

    it('Release Charge keeps its Quench flash and preview without passing them', () => {
        expect(resolveConeStrikeColors({ id: ReleaseChargeAbility_1009.id })).toEqual({
            flashColor: QUENCH_SECONDARY,
            previewFillColor: QUENCH_PRIMARY,
            previewStrokeColor: QUENCH_SECONDARY,
        });
        expect(conePreviewColours(ReleaseChargeAbility_1009)).toEqual({
            fills: [QUENCH_PRIMARY],
            strokes: [QUENCH_SECONDARY],
        });
    });

    it('Cone of Light keeps the default flash and its grey preview', () => {
        expect(resolveConeStrikeColors({
            id: ConeOfLightAbility.id,
            previewFillColor: CONE_OF_LIGHT_PREVIEW_FILL,
            previewStrokeColor: CONE_OF_LIGHT_PREVIEW_STROKE,
        }).flashColor).toBeUndefined();
        expect(conePreviewColours(ConeOfLightAbility)).toEqual({
            fills: [CONE_OF_LIGHT_PREVIEW_FILL],
            strokes: [CONE_OF_LIGHT_PREVIEW_STROKE],
        });
    });

    it('explicit colours win over a two-tone theme', () => {
        expect(resolveDirectionalShieldColors({ id: '1099', fillColor: 0x123456 })).toEqual({
            fillColor: 0x123456,
            strokeColor: QUENCH_SECONDARY,
        });
        expect(resolveConeStrikeColors({ id: '1099', flashColor: 0x111111, previewStrokeColor: 0x222222 })).toEqual({
            flashColor: 0x111111,
            previewFillColor: QUENCH_PRIMARY,
            previewStrokeColor: 0x222222,
        });
    });

    it('a shield in a primary-only group (05) keeps the archetype defaults', () => {
        const shield = defineDirectionalShield({
            id: '0599',
            name: 'Test Earth Shield',
            image: '',
            duration: 1,
            getTooltipText: () => [],
        });
        expect(resolveDirectionalShieldColors({ id: '0599' })).toEqual({});
        expect(shieldPreviewColours(shield)).toEqual({
            fills: [ARC_PREVIEW_DEFAULT_FILL],
            strokes: [ARC_PREVIEW_DEFAULT_STROKE],
        });
    });

    it('telegraphs and Charge read the theme with unchanged values', () => {
        expect(TELEGRAPH_STYLES.earth.color).toBe(0xb45309);
        expect(themedTelegraphStyle('0536')).toEqual(TELEGRAPH_STYLES.earth);
        expect(themedTelegraphStyle('1004')).toEqual({ ...TELEGRAPH_STYLES.earth, color: QUENCH_PRIMARY });
        expect(themedTelegraphStyle('abc').color).toBe(getAbilityTheme('abc').primaryNum);
        expect(CHARGE_RESOURCE_COLOR).toBe('#e7e5e4');
    });
});
