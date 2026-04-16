/**
 * Unit definitions own how units are drawn.
 * GameRenderer calls renderUnit(unit, context); the appropriate UnitDef creates the visual.
 */

import { Container, Graphics, Sprite, Text, TextStyle, type Texture } from 'pixi.js';
import type { Unit } from '../Unit';
import type { TeamId } from '../../teams';
import { areEnemies } from '../../teams';
import { ParticleExplosion } from '../../deathEffects/ParticleExplosion';
import type { EffectImageKey } from '../../effectImages';
import { getPortrait } from '../../../character_defs/portraits';
import { DEFAULT_UNIT_SIZE, UNIT_SIZE_MAP, type UnitSize } from './unitConstants';

/** Color for allied unit glows. */
const ALLY_GLOW_COLOR = 0x22c55e; // green-500
/** Color for enemy unit glows. */
const ENEMY_GLOW_COLOR = 0xef4444; // red-500
/** Glow radius around units. */
const GLOW_RADIUS = 6;
/** Scale of character sprite relative to hitbox diameter (1 = same size). */
const CHARACTER_SPRITE_SCALE = 0.85;

/** Context passed to unit def when creating a visual. */
export interface IUnitRenderContext {
    /** Team ID used to determine friend/foe glow colors. */
    localTeamId: TeamId;
    /** Get a cached character texture by character ID (e.g. 'enemy_ranged' for bowman). */
    getCharacterTexture(characterId: string): Texture | null;
    /** Preloaded portrait texture for player units (portrait ID from campaign). */
    getPlayerPortraitTexture(portraitId: string): Texture | null;
}

/** Unit definition: responsible for drawing one unit type. */
export interface IUnitDef {
    /** Create the Pixi container for this unit (glow, body, label, HP bar placeholders). */
    createVisual(unit: Unit, context: IUnitRenderContext): Container;
}

export type UnitDeathEffectDef =
    | { type: typeof ParticleExplosion; image: EffectImageKey; count: number };

/** Single runtime ID for all player-controlled battle units. */
export type PlayerUnitDefId = 'player';

/** Enemy unit character IDs. */
export type EnemyUnitId =
    | 'enemy_melee'
    | 'enemy_ranged'
    | 'dark_wolf'
    | 'alpha_wolf'
    | 'boar';
export type UnitDefId = PlayerUnitDefId | EnemyUnitId;

/** Serialized on units; all players share baseline stats from UNIT_DEFS.player. */
export const PLAYER_CHARACTER_ID: PlayerUnitDefId = 'player';

/** Body color, optional character sprite key, default HP/speed, size, and perception range (px) for AI. */
const UNIT_DEFS: Record<
    UnitDefId,
    {
        bodyColor: number;
        characterSpriteKey?: string;
        hp?: number;
        speed?: number;
        /** Size category; radius derived from UNIT_SIZE_MAP. Overrides radius if both set. */
        size?: UnitSize;
        radius?: number;
        stamina?: number;
        perceptionRange?: number;
        deathEffect?: UnitDeathEffectDef;
        /** Short flavor text for battle UI (e.g. timeline hover). */
        uiDescription?: string;
    }
> = {
    // All player units: baseline stats; portrait defs may override body color and size on the token.
    player: {
        bodyColor: 0x4b5563,
        hp: 50,
        speed: 90,
        size: 'Medium',
        stamina: 1,
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
    enemy_ranged: {
        bodyColor: 0x555555,
        characterSpriteKey: 'enemy_ranged',
        hp: 30,
        speed: 60,
        size: 'Medium',
        stamina: 1,
        perceptionRange: 400,
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
        deathEffect: { type: ParticleExplosion, image: 'darkBlob', count: 8 },
        uiDescription: 'Fast predator that lunges in for a quick bite.',
    },
    alpha_wolf: {
        bodyColor: 0x1a1a2e,
        characterSpriteKey: 'alpha_wolf',
        hp: 140,
        speed: 135,
        size: 'Extra Large',
        stamina: 1,
        perceptionRange: 350,
        deathEffect: { type: ParticleExplosion, image: 'darkBlob', count: 12 },
        uiDescription: 'Pack leader with heavy claws and howling support.',
    },
    boar: {
        bodyColor: 0x4a3728,
        characterSpriteKey: 'boar',
        hp: 24,
        speed: 100,
        size: 'Large',
        stamina: 1,
        perceptionRange: 280,
        deathEffect: { type: ParticleExplosion, image: 'darkBlob', count: 10 },
        uiDescription: 'Tough charger that bowls through the front line.',
    },
};

/** Token fill behind the portrait sprite; portrait may override. */
export function resolvePlayerBodyColor(portraitId: string | undefined): number {
    const base = UNIT_DEFS.player.bodyColor;
    if (!portraitId) return base;
    const p = getPortrait(portraitId);
    return p?.battleBodyColor ?? base;
}

/** Hitbox radius from global player default and optional portrait size override. */
export function resolvePlayerUnitRadius(portraitId: string | undefined): number {
    const baseSize = UNIT_DEFS.player.size ?? DEFAULT_UNIT_SIZE;
    const baseR = UNIT_SIZE_MAP[baseSize];
    if (!portraitId) return baseR;
    const p = getPortrait(portraitId);
    if (p?.battleUnitSize) return UNIT_SIZE_MAP[p.battleUnitSize];
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
        const glowColor = isEnemy ? ENEMY_GLOW_COLOR : ALLY_GLOW_COLOR;
        const def = UNIT_DEFS[unit.characterId as UnitDefId] ?? { bodyColor: DEFAULT_BODY_COLOR };
        const bodyColor =
            unit.characterId === PLAYER_CHARACTER_ID
                ? resolvePlayerBodyColor(unit.portraitId)
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
        glow.fill({ color: glowColor, alpha: 0.3 });
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

        // Character sprite (e.g. bowman for enemy_ranged)
        if (showCharacterSprite && characterTexture) {
            const spriteSize = unit.radius * 2 * CHARACTER_SPRITE_SCALE;
            const charSprite = new Sprite(characterTexture);
            charSprite.anchor.set(0.5, 0.5);
            charSprite.width = spriteSize;
            charSprite.height = spriteSize;
            charSprite.label = 'characterSprite';
            container.addChild(charSprite);
        }

        // Character initial label (hidden when character sprite is shown)
        const style = new TextStyle({
            fontSize: 14,
            fontWeight: 'bold',
            fill: 0xffffff,
        });
        const label = new Text({ text: unit.name.charAt(0).toUpperCase(), style });
        label.anchor.set(0.5, 0.5);
        label.label = 'label';
        label.visible = !showCharacterSprite;
        container.addChild(label);

        // HP bar background
        const hpBg = new Graphics();
        hpBg.rect(-unit.radius, -unit.radius - 10, unit.radius * 2, 6);
        hpBg.fill({ color: 0x333333, alpha: 0.8 });
        hpBg.label = 'hpBg';
        container.addChild(hpBg);

        // HP bar fill
        const hpFill = new Graphics();
        hpFill.label = 'hpFill';
        container.addChild(hpFill);

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

/** Body color for a unit instance (player tokens use portrait overrides). */
export function getBodyColorForUnit(unit: Unit): number {
    if (unit.characterId === PLAYER_CHARACTER_ID) {
        return resolvePlayerBodyColor(unit.portraitId);
    }
    return getBodyColor(unit.characterId);
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
}): { hp: number; speed: number } {
    return {
        hp: partial.hp ?? getDefaultHp(partial.characterId),
        speed: partial.speed ?? getDefaultSpeed(partial.characterId),
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
    if (!hpFill) return;
    hpFill.clear();
    const ratio = unit.hp / unit.maxHp;
    const barWidth = unit.radius * 2 * ratio;
    const barColor = ratio > 0.5 ? 0x22c55e : ratio > 0.25 ? 0xeab308 : 0xef4444;
    hpFill.rect(-unit.radius, -unit.radius - 10, barWidth, 6);
    hpFill.fill(barColor);
}

/**
 * Ensures a character sprite exists and uses `texture`, sized for the unit's radius.
 * Call when assets finish loading after the unit visual was created with a fallback label.
 */
export function ensureUnitCharacterSprite(visual: Container, unit: Unit, texture: Texture): void {
    const spriteSize = unit.radius * 2 * CHARACTER_SPRITE_SCALE;
    let charSprite = visual.children.find((c) => c.label === 'characterSprite') as Sprite | undefined;
    if (!charSprite) {
        charSprite = new Sprite(texture);
        charSprite.anchor.set(0.5, 0.5);
        charSprite.label = 'characterSprite';
        const bodyIdx = visual.children.findIndex((c) => c.label === 'body');
        const insertAt = bodyIdx >= 0 ? bodyIdx + 1 : visual.children.length;
        visual.addChildAt(charSprite, insertAt);
    } else {
        charSprite.texture = texture;
    }
    charSprite.width = spriteSize;
    charSprite.height = spriteSize;
}

/** If a texture is now available for this unit's character sprite key, attach/update the sprite and hide the letter label. */
export function syncUnitCharacterSpriteIfNeeded(visual: Container, unit: Unit, context: IUnitRenderContext): void {
    if (unit.characterId === PLAYER_CHARACTER_ID && unit.portraitId) {
        const texture = context.getPlayerPortraitTexture(unit.portraitId);
        if (!texture) return;
        ensureUnitCharacterSprite(visual, unit, texture);
        const label = visual.children.find((c) => c.label === 'label');
        if (label) label.visible = false;
        return;
    }
    const key = getCharacterSpriteKey(unit.characterId);
    if (!key) return;
    const texture = context.getCharacterTexture(key);
    if (!texture) return;
    ensureUnitCharacterSprite(visual, unit, texture);
    const label = visual.children.find((c) => c.label === 'label');
    if (label) label.visible = false;
}
