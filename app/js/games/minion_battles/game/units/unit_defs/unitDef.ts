/**
 * Unit definitions own how units are drawn.
 * GameRenderer calls renderUnit(unit, context); the appropriate UnitDef creates the visual.
 */

import { Container, Graphics, Sprite, Text, TextStyle, type Texture } from 'pixi.js';
import { createBadge, updateBadgeText } from '../../GameRenderer/PixiComponents';
import type { Unit } from '../Unit';
import type { TeamId } from '../../teams';
import { areEnemies } from '../../teams';
import {
    darkCreatureDissolutionDeathEffect,
    darkCreatureIconFlashDeathEffect,
    type DarkCreatureDissolutionDeathEffectDef,
} from '../../deathEffects/darkCreatureDissolutionDef';
import { DARK_CREATURE_CORRUPTION_TINT, DARK_CREATURE_ICON_TINT_ALPHA } from '../../deathEffects/darkCreatureVisualConstants';
import { getPortrait } from '../../../character_defs/portraitLoader';
import { DEFAULT_UNIT_SIZE, UNIT_SIZE_MAP, type UnitSize } from './unitConstants';
import type { CcResistKey } from '../../../crowdControl/ccTypes';
import { UnitTag } from '../unitTag';
import type { EnrageDef } from '../enrageDef';

type HpBarSize = 'large' | 'small' | 'hidden';

function getHpBarSize(unit: Unit): HpBarSize {
    if (unit.tags.includes(UnitTag.Boss)) return 'hidden';
    if (unit.teamId === 'player') return 'large';
    return 'small';
}

/** Optional crowd-control tuning merged onto units at spawn (see `applyCombatCrowdControlProfile`). */
export type UnitCombatCcDef = {
    ccDurationResistPct?: Partial<Record<CcResistKey, number>>;
    ccDurationFlatSec?: Partial<Record<CcResistKey, number>>;
    hardCcArmourFloor?: number;
    chainCcResist?: number;
    chainCcDecayRounds?: number;
    /** Fixed stun duration (seconds) applied when CC armour breaks. Overrides the incoming hit's duration. */
    ccArmourBreakStunDuration?: number;
    /** Subtracts from the incoming knockback tier before CC armour is checked. Default 0. */
    knockbackResistance?: number;
};

/** Color for non-player allied units (pets, summoned NPCs). */
const ALLY_PET_GLOW_COLOR = 0x3b82f6; // blue-500
/** Color for allied player-controlled units. */
const ALLY_PLAYER_GLOW_COLOR = 0x9ca3af; // gray-400
/** Color for enemy unit glows. */
const ENEMY_GLOW_COLOR = 0xef4444; // red-500
/** Glow radius around units. */
const GLOW_RADIUS = 6;
/** Scale of character sprite relative to hitbox diameter (1 = same size). */
export const CHARACTER_SPRITE_SCALE = 0.85;

/** Context passed to unit def when creating a visual. */
export interface IUnitRenderContext {
    /** Team ID used to determine friend/foe glow colors. */
    localTeamId: TeamId;
    /** Get a cached character texture by character ID (e.g. 'slime' for the slime unit). */
    getCharacterTexture(characterId: string): Texture | null;
    /** Preloaded portrait texture for player units (portrait ID from campaign). */
    getPlayerPortraitTexture(portraitId: string): Texture | null;
}

/** Unit definition: responsible for drawing one unit type. */
export interface IUnitDef {
    /** Create the Pixi container for this unit (glow, body, label, HP bar placeholders). */
    createVisual(unit: Unit, context: IUnitRenderContext): Container;
}

export type UnitDeathEffectDef = DarkCreatureDissolutionDeathEffectDef;

/** Single runtime ID for all player-controlled battle units. */
export type PlayerUnitDefId = 'player';

/** Enemy unit character IDs. */
export type EnemyUnitId =
    | 'enemy_melee'
    | 'slime'
    | 'dark_wolf'
    | 'alpha_wolf'
    | 'boar'
    | 'thornbinder'
    | 'husk_artillery'
    | 'huskling'
    | 'swarmling'
    | 'lanternite'
    | 'lanternite_nest'
    | 'thornling'
    | 'thornling_nest'
    | 'swarm_nest'
    | 'dog';
export type UnitDefId = PlayerUnitDefId | EnemyUnitId;

/**
 * Narrative / VFX hint for enemy categorization (see writing-style-enemies skill).
 * Set on every enemy unit def when the category is clear; if ambiguous, prompt the user before locking copy or visuals.
 */
export type CreatureType = 'dark_creature' | 'beast';

/** Serialized on units; all players share baseline stats from UNIT_DEFS.player. */
export const PLAYER_CHARACTER_ID: PlayerUnitDefId = 'player';

/**
 * Per-character static definition. Properties here are universal for all units of that characterId.
 * Add a property here (not on Unit) when its value is the same for every spawn of a given character type.
 * Expose it via a typed accessor function and a getter on Unit (see `knockbackResistance` for the pattern).
 */
export interface UnitDefEntry {
    bodyColor: number;
    characterSpriteKey?: string;
    hp?: number;
    speed?: number;
    /** Size category; radius derived from UNIT_SIZE_MAP. Overrides radius if both set. */
    size?: UnitSize;
    radius?: number;
    stamina?: number;
    stackSize?: number;
    perceptionRange?: number;
    deathEffect?: UnitDeathEffectDef;
    /** Darkness vs natural beast; drives expectations for death/damage presentation and copy. */
    creatureType?: CreatureType;
    /** Short flavor text for battle UI (e.g. timeline hover). */
    uiDescription?: string;
    combatCc?: UnitCombatCcDef;
    /** If set, units of this character type gain a tag when the enrage condition is met at runtime. */
    enrageDef?: EnrageDef;
}

const UNIT_DEFS: Record<UnitDefId, UnitDefEntry> = {
    // All player units: baseline stats; portrait defs may override body color and size on the token.
    player: {
        bodyColor: 0x4b5563,
        hp: 50,
        speed: 90,
        size: 'Medium',
        stamina: 2,
        uiDescription: 'Adventurer — stats and abilities from equipment and research.',
    },
    // Enemies
    enemy_melee: {
        bodyColor: 0x555555,
        characterSpriteKey: 'enemy_melee',
        hp: 12,
        speed: 80,
        size: 'Small',
        stamina: 1,
        perceptionRange: 250,
        uiDescription: 'Basic melee grunt that rushes into combat.',
    },
    slime: {
        bodyColor: 0x555555,
        characterSpriteKey: 'slime',
        hp: 20,
        speed: 50,
        size: 'Medium',
        stamina: 1,
        perceptionRange: 400,
        creatureType: 'dark_creature',
        deathEffect: darkCreatureIconFlashDeathEffect(5),
        uiDescription: 'Stays back and harasses with ranged attacks.',
    },
    dark_wolf: {
        bodyColor: 0x1a1a2e,
        characterSpriteKey: 'dark_wolf',
        hp: 12,
        speed: 120,
        size: 'Extra Small',
        stamina: 1,
        perceptionRange: 300,
        creatureType: 'dark_creature',
        deathEffect: darkCreatureIconFlashDeathEffect(5),
        uiDescription: 'Fast predator that lunges in for a quick bite.',
    },
    alpha_wolf: {
        bodyColor: 0x1a1a2e,
        characterSpriteKey: 'alpha_wolf',
        hp: 173,
        speed: 135,
        size: 'Extra Large',
        stamina: 2,
        perceptionRange: 350,
        creatureType: 'dark_creature',
        deathEffect: darkCreatureDissolutionDeathEffect(6),
        uiDescription: 'Pack leader with heavy claws and howling support.',
        combatCc: {
            ccDurationResistPct: { ALL: 0.5 },
            hardCcArmourFloor: 2,
            chainCcDecayRounds: 0,
            ccArmourBreakStunDuration: 5,
            knockbackResistance: 2,
        },
        enrageDef: {
            conditionType: 'health_below_percent',
            threshold: 0.5,
            tag: UnitTag.Enraged,
            oneShot: true,
        },
    },
    boar: {
        bodyColor: 0x4a3728,
        characterSpriteKey: 'boar',
        hp: 54,
        speed: 100,
        size: 'Large',
        stamina: 2,
        perceptionRange: 280,
        deathEffect: darkCreatureDissolutionDeathEffect(5),
        uiDescription: 'Tough charger that bowls through the front line.',
    },
    thornbinder: {
        bodyColor: 0x3d2c4a,
        characterSpriteKey: 'thornbinder',
        hp: 26,
        speed: 42,
        size: 'Large',
        stamina: 1,
        perceptionRange: 380,
        creatureType: 'dark_creature',
        deathEffect: darkCreatureIconFlashDeathEffect(5),
        uiDescription:
            'Zone controller — slams bramble into the ground, slowing foes. Weakens in bright light (Light Hate).',
    },
    husk_artillery: {
        bodyColor: 0x5c4d3f,
        characterSpriteKey: 'slime',
        hp: 48,
        speed: 35,
        size: 'Large',
        stamina: 1,
        perceptionRange: 420,
        creatureType: 'dark_creature',
        deathEffect: darkCreatureDissolutionDeathEffect(5),
        uiDescription:
            'Summoner — launches seed pods that hatch short-lived husks. Channels are telegraphed; weakens in bright light.',
    },
    huskling: {
        bodyColor: 0x6b5344,
        characterSpriteKey: 'enemy_melee',
        hp: 6,
        speed: 88,
        size: 'Extra Small',
        stamina: 1,
        perceptionRange: 220,
        creatureType: 'dark_creature',
        deathEffect: darkCreatureIconFlashDeathEffect(4),
        uiDescription: 'Ephemeral husk spawned by artillery — reckless melee punches.',
    },
    swarmling: {
        bodyColor: 0x1a1a2e,
        characterSpriteKey: 'swarmling',
        hp: 4,
        speed: 130,
        size: 'Tiny',
        stamina: 2,
        perceptionRange: 250,
        creatureType: 'dark_creature',
        deathEffect: darkCreatureIconFlashDeathEffect(4),
        uiDescription: 'Fast skittering biter — snaps twice per round.',
    },
    lanternite: {
        bodyColor: 0x34d399,
        characterSpriteKey: 'lanternite',
        hp: 20,
        speed: 70,
        size: 'Extra Small',
        stamina: 1,
        perceptionRange: 260,
        creatureType: 'beast',
        uiDescription:
            'Lantern-bearing creature — pulses light twice each round (Soul Sap) and wanders patrol routes beside its nest.',
    },
    lanternite_nest: {
        bodyColor: 0x065f46,
        characterSpriteKey: 'lanternite_nest',
        hp: 120,
        speed: 0,
        size: 'Extra Large',
        stamina: 1,
        perceptionRange: 0,
        creatureType: 'beast',
        uiDescription:
            'Living nursery — births lantern scouts on a rhythm; needs protection when stirred.',
    },
    thornling: {
        bodyColor: 0x3a6b1f,
        characterSpriteKey: 'thornbinder',
        hp: 8,
        speed: 110,
        size: 'Extra Small',
        stamina: 1,
        perceptionRange: 250,
        creatureType: 'beast',
        uiDescription: 'Thorny skittering creature — rushes in and bites.',
    },
    thornling_nest: {
        bodyColor: 0x1e3d0f,
        characterSpriteKey: 'lanternite_nest',
        hp: 80,
        speed: 0,
        size: 'Large',
        stamina: 1,
        perceptionRange: 0,
        creatureType: 'beast',
        uiDescription: 'Thornling brood nest — destroyable; roots the spawn cycle while it lives.',
    },
    swarm_nest: {
        bodyColor: 0x3d0000,
        characterSpriteKey: 'lanternite_nest',
        hp: 100,
        speed: 0,
        size: 'Large',
        stamina: 1,
        perceptionRange: 0,
        creatureType: 'dark_creature',
        deathEffect: darkCreatureDissolutionDeathEffect(5),
        uiDescription: 'Swarm Nest — spawns skittering swarmlings that seek out other nest sites.',
    },
    dog: {
        bodyColor: 0x8a5a2b,
        characterSpriteKey: 'dog',
        hp: 24,
        speed: 140,
        size: 'Small',
        stamina: 2,
        perceptionRange: 250,
        creatureType: 'beast',
        uiDescription: 'Loyal hound — fights close to its master, biting enemies that stray too near.',
    },
};

/** Optional CC spawn data for a character id (undefined when none). */
export function getUnitCombatCcDef(characterId: string): UnitCombatCcDef | undefined {
    return UNIT_DEFS[characterId as UnitDefId]?.combatCc;
}

/** Read-only access to a unit's static data (hp, speed, description, etc.). */
export function getUnitDefEntry(characterId: UnitDefId): UnitDefEntry | undefined {
    return UNIT_DEFS[characterId];
}

/** Enrage trigger def for a character id (undefined when the character does not enrage). */
export function getUnitEnrageDef(characterId: string): EnrageDef | undefined {
    return UNIT_DEFS[characterId as UnitDefId]?.enrageDef;
}

function unitIsDarkCreature(unit: Unit): boolean {
    return UNIT_DEFS[unit.characterId as UnitDefId]?.creatureType === 'dark_creature';
}

/** True when this character uses dark-creature presentation (tint, quick death flash, etc.). */
export function isDarkCreatureCharacterId(characterId: string): boolean {
    return UNIT_DEFS[characterId as UnitDefId]?.creatureType === 'dark_creature';
}

function ensureDarkCreatureIconTint(visual: Container, unit: Unit, characterTexture: Texture): void {
    if (!unitIsDarkCreature(unit)) return;
    const charSprite = visual.children.find((c) => c.label === 'characterSprite') as Sprite | undefined;
    if (!charSprite) return;
    let tint = visual.children.find((c) => c.label === 'darkCreatureIconTint') as Sprite | undefined;
    if (!tint) {
        tint = new Sprite(characterTexture);
        tint.label = 'darkCreatureIconTint';
        tint.anchor.set(0.5, 0.5);
        tint.blendMode = 'multiply';
        tint.tint = DARK_CREATURE_CORRUPTION_TINT;
        tint.alpha = DARK_CREATURE_ICON_TINT_ALPHA;
        const tintMask = new Graphics();
        tintMask.circle(0, 0, unit.radius);
        tintMask.fill(0xffffff);
        tintMask.label = 'darkCreatureIconTintMask';
        const insertAt = visual.getChildIndex(charSprite) + 1;
        visual.addChildAt(tintMask, insertAt);
        visual.addChildAt(tint, insertAt + 1);
        tint.mask = tintMask;
    } else {
        tint.texture = characterTexture;
    }
    tint.width = charSprite.width;
    tint.height = charSprite.height;
}

/** Token fill behind the portrait sprite; portrait battle model may override. */
export function resolvePlayerBodyColor(portraitId: string | undefined): number {
    const base = UNIT_DEFS.player.bodyColor;
    if (!portraitId) return base;
    const p = getPortrait(portraitId);
    return p?.battleModel.bodyColor ?? base;
}

/** Hitbox radius from global player default and optional portrait size override. */
export function resolvePlayerUnitRadius(portraitId: string | undefined): number {
    const baseSize = UNIT_DEFS.player.size ?? DEFAULT_UNIT_SIZE;
    const baseR = UNIT_SIZE_MAP[baseSize];
    if (!portraitId) return baseR;
    const p = getPortrait(portraitId);
    if (p?.battleModel.size) return UNIT_SIZE_MAP[p.battleModel.size];
    return baseR;
}

export function getDefaultRadius(characterId: string, fallbackRadius: number): number {
    const def = UNIT_DEFS[characterId as UnitDefId];
    if (def?.size) return UNIT_SIZE_MAP[def.size];
    return def?.radius ?? fallbackRadius;
}

const DEFAULT_BODY_COLOR = 0x555555;

/** Default unit def: draws glow, optional player ring, body circle, optional character sprite, initial label, HP bar. */
class DefaultUnitDef implements IUnitDef {
    createVisual(unit: Unit, context: IUnitRenderContext): Container {
        const container = new Container();
        const isEnemy = areEnemies(context.localTeamId, unit.teamId);
        const glowColor = isEnemy
            ? ENEMY_GLOW_COLOR
            : unit.isPlayerControlled()
                ? ALLY_PLAYER_GLOW_COLOR
                : ALLY_PET_GLOW_COLOR;
        const glowAlpha = isEnemy ? 0.3 : unit.isPlayerControlled() ? 0.4 : 0.55;
        const def = UNIT_DEFS[unit.characterId as UnitDefId] ?? { bodyColor: DEFAULT_BODY_COLOR };

        const playerPortrait =
            unit.characterId === PLAYER_CHARACTER_ID && unit.portraitId
                ? getPortrait(unit.portraitId)
                : undefined;

        const bodyColor = playerPortrait
            ? (playerPortrait.battleModel.bodyColor ?? UNIT_DEFS.player.bodyColor)
            : (def.bodyColor ?? DEFAULT_BODY_COLOR);

        let characterTexture: Texture | null = null;
        if (unit.characterId === PLAYER_CHARACTER_ID && unit.portraitId) {
            characterTexture = context.getPlayerPortraitTexture(unit.portraitId);
        } else if (def.characterSpriteKey) {
            characterTexture = context.getCharacterTexture(def.characterSpriteKey);
        }
        const showCharacterSprite = Boolean(characterTexture);

        // Glow circle
        const glow = new Graphics();
        glow.circle(0, 0, unit.radius + GLOW_RADIUS);
        glow.fill({ color: glowColor, alpha: glowAlpha });
        glow.label = 'glow';
        container.addChild(glow);

        // Player color ring (if player-owned)
        if (unit.isPlayerControlled()) {
            const playerRing = new Graphics();
            playerRing.circle(0, 0, unit.radius + 2);
            playerRing.stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
            playerRing.label = 'playerRing';
            container.addChild(playerRing);
        }

        // Body circle
        const body = new Graphics();
        body.circle(0, 0, unit.radius);
        body.fill(bodyColor);
        body.stroke({ color: 0x000000, width: 1 });
        body.label = 'body';
        container.addChild(body);

        // Inner circle (optional, from portrait battle model)
        const innerCircleDef = playerPortrait?.battleModel.innerCircle;
        if (innerCircleDef) {
            const inner = new Graphics();
            inner.circle(0, 0, unit.radius * innerCircleDef.radiusRatio);
            inner.fill(innerCircleDef.color);
            inner.label = 'innerCircle';
            container.addChild(inner);
        }

        // Character sprite (e.g. slime SVG for the slime unit, or model image for player portraits)
        if (showCharacterSprite && characterTexture) {
            ensureUnitCharacterSprite(container, unit, characterTexture, true);
        }

        const hpBarSize = getHpBarSize(unit);

        const hpBg = new Graphics();
        hpBg.label = 'hpBg';
        hpBg.visible = hpBarSize !== 'hidden';
        if (hpBarSize === 'large') {
            hpBg.rect(-unit.radius, -unit.radius - 14, unit.radius * 2, 10);
        } else if (hpBarSize === 'small') {
            hpBg.rect(-unit.radius, -unit.radius - 8, unit.radius * 2, 5);
        }
        if (hpBarSize !== 'hidden') hpBg.fill({ color: 0x333333, alpha: 0.8 });
        container.addChild(hpBg);

        const hpFill = new Graphics();
        hpFill.label = 'hpFill';
        hpFill.visible = hpBarSize !== 'hidden';
        container.addChild(hpFill);

        // Stack count badge: shown to the left of the HP bar when stackSize > 1
        if (hpBarSize !== 'hidden') {
            const stackBadge = createBadge('', { radius: 7 });
            stackBadge.label = 'stackBadge';
            stackBadge.visible = false;
            const barYCenter = hpBarSize === 'large' ? (-unit.radius - 14 + 5) : (-unit.radius - 8 + 2.5);
            stackBadge.x = -unit.radius - 10;
            stackBadge.y = barYCenter;
            container.addChild(stackBadge);
        }

        if (hpBarSize === 'large') {
            const style = new TextStyle({ fontSize: 8, fontWeight: 'bold', fill: 0x000000 });
            const label = new Text({ text: unit.name.slice(0, 6).toUpperCase(), style });
            label.anchor.set(0.5, 0.5);
            label.x = 0;
            label.y = -unit.radius - 9;
            label.label = 'label';
            container.addChild(label);
        }

        return container;
    }
}

const defaultUnitDef = new DefaultUnitDef();

/** Get the unit def for a character ID. */
export function getUnitDef(_characterId: string): IUnitDef {
    return defaultUnitDef;
}

/** Character sprite key for a character ID (for effects that mimic unit appearance). */
export function getCharacterSpriteKey(characterId: string): string | undefined {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.characterSpriteKey;
}

/** Body color for a character ID (for restoring unit visual after full-darkness mode). */
export function getBodyColor(characterId: string): number {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.bodyColor ?? DEFAULT_BODY_COLOR;
}

/** Additive color blend clamping each channel at 255. */
function blendAdditive(base: number, add: number): number {
    const r = Math.min(255, ((base >> 16) & 0xff) + ((add >> 16) & 0xff));
    const g = Math.min(255, ((base >> 8) & 0xff) + ((add >> 8) & 0xff));
    const b = Math.min(255, (base & 0xff) + (add & 0xff));
    return (r << 16) | (g << 8) | b;
}

/** Body color for a unit instance (player tokens use portrait overrides). */
export function getBodyColorForUnit(unit: Unit): number {
    const base = unit.characterId === PLAYER_CHARACTER_ID
        ? resolvePlayerBodyColor(unit.portraitId)
        : getBodyColor(unit.characterId);
    if (unit.tags.includes(UnitTag.Enraged)) {
        return blendAdditive(base, 0x550000);
    }
    return base;
}

/** Default HP for a character ID. Used when creating units without explicit hp. Returns 50 if not configured. */
export function getDefaultHp(characterId: string): number {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.hp ?? 50;
}

/** Battle UI blurb for tooltips (timeline hover, etc.). Placeholder when not configured. */
export function getUnitUiDescription(characterId: string): string {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.uiDescription ?? 'No unit description yet.';
}

/** Default speed for a character ID. Used when creating units without explicit speed. Returns 100 if not configured. */
export function getDefaultSpeed(characterId: string): number {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.speed ?? 100;
}

/** Default stamina for a character ID. */
export function getDefaultStamina(characterId: string): number {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.stamina ?? 1;
}

/**
 * Single source of truth for enemy baseline hp/speed: unit defs, with optional mission/spawn overrides.
 */
export function resolveEnemySpawnStats(partial: {
    characterId: string;
    hp?: number;
    speed?: number;
    stackSize?: number;
}): { hp: number; speed: number; stackSize: number } {
    const def = UNIT_DEFS[partial.characterId as UnitDefId];
    return {
        hp: partial.hp ?? getDefaultHp(partial.characterId),
        speed: partial.speed ?? getDefaultSpeed(partial.characterId),
        stackSize: partial.stackSize ?? def?.stackSize ?? 1,
    };
}

/** Perception range in px for AI (line-of-sight targeting). Returns 300 if not configured. */
export function getPerceptionRange(characterId: string): number {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.perceptionRange ?? 300;
}

export function getDeathEffectDef(characterId: string): UnitDeathEffectDef | undefined {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.deathEffect;
}

/** Creature category from unit defs; undefined when unset (treat as uncategorized for new-enemy workflows). */
export function getCreatureType(characterId: string): CreatureType | undefined {
    const def = UNIT_DEFS[characterId as UnitDefId];
    return def?.creatureType;
}

/**
 * Create a unit visual. Uses the unit's characterId to look up the UnitDef and delegates drawing.
 */
export function renderUnit(unit: Unit, context: IUnitRenderContext): Container {
    const def = getUnitDef(unit.characterId);
    return def.createVisual(unit, context);
}

/** Update the HP bar child inside a unit visual container. Call each frame from GameRenderer. */
export function updateUnitHpBar(visual: Container, unit: Unit): void {
    const hpFill = visual.children.find((c) => c.label === 'hpFill') as Graphics | undefined;
    if (!hpFill || !hpFill.visible) return;
    hpFill.clear();
    const ratio = unit.hp / unit.maxHp;
    const barWidth = unit.radius * 2 * ratio;
    const barColor = ratio > 0.5 ? 0x22c55e : ratio > 0.25 ? 0xeab308 : 0xef4444;
    const hpBarSize = getHpBarSize(unit);
    if (hpBarSize === 'large') {
        hpFill.rect(-unit.radius, -unit.radius - 14, barWidth, 10);
    } else {
        hpFill.rect(-unit.radius, -unit.radius - 8, barWidth, 5);
    }
    hpFill.fill(barColor);

    const stackBadge = visual.children.find((c) => c.label === 'stackBadge') as Container | undefined;
    if (stackBadge) {
        const show = unit.stackSize > 1;
        stackBadge.visible = show;
        if (show) updateBadgeText(stackBadge, String(unit.stackSize));
    }
}

/**
 * Ensures a character sprite exists and uses `texture`, sized for the unit's radius.
 * Call when assets finish loading after the unit visual was created with a fallback label.
 */
export function ensureUnitCharacterSprite(visual: Container, unit: Unit, texture: Texture, clipToCircle = false): void {
    const spriteSize = clipToCircle ? unit.radius * 2 : unit.radius * 2 * CHARACTER_SPRITE_SCALE;
    let charSprite = visual.children.find((c) => c.label === 'characterSprite') as Sprite | undefined;
    if (!charSprite) {
        charSprite = new Sprite(texture);
        charSprite.anchor.set(0.5, 0.5);
        charSprite.label = 'characterSprite';
        const bodyIdx = visual.children.findIndex((c) => c.label === 'body');
        const insertAt = bodyIdx >= 0 ? bodyIdx + 1 : visual.children.length;
        if (clipToCircle) {
            const mask = new Graphics();
            mask.circle(0, 0, unit.radius);
            mask.fill(0xffffff);
            mask.label = 'characterSpriteMask';
            visual.addChildAt(mask, insertAt);
            visual.addChildAt(charSprite, insertAt + 1);
            charSprite.mask = mask;
        } else {
            visual.addChildAt(charSprite, insertAt);
        }
    } else {
        charSprite.texture = texture;
    }
    charSprite.width = spriteSize;
    charSprite.height = spriteSize;
    ensureDarkCreatureIconTint(visual, unit, texture);
}

/** If a texture is now available for this unit's character sprite key, attach/update the sprite and hide the letter label. */
export function syncUnitCharacterSpriteIfNeeded(visual: Container, unit: Unit, context: IUnitRenderContext): void {
    if (unit.characterId === PLAYER_CHARACTER_ID && unit.portraitId) {
        const texture = context.getPlayerPortraitTexture(unit.portraitId);
        if (!texture) return;
        ensureUnitCharacterSprite(visual, unit, texture, true);
        return;
    }
    const key = getCharacterSpriteKey(unit.characterId);
    if (!key) return;
    const texture = context.getCharacterTexture(key);
    if (!texture) return;
    ensureUnitCharacterSprite(visual, unit, texture, true);
}
