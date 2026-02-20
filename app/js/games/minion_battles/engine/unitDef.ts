/**
 * Unit definitions own how units are drawn.
 * GameRenderer calls renderUnit(unit, context); the appropriate UnitDef creates the visual.
 */

import { Container, Graphics, Sprite, Text, TextStyle, type Texture } from 'pixi.js';
import type { Unit } from '../objects/Unit';
import type { TeamId } from './teams';
import { areEnemies } from './teams';

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
}

/** Unit definition: responsible for drawing one unit type. */
export interface IUnitDef {
    /** Create the Pixi container for this unit (glow, body, label, HP bar placeholders). */
    createVisual(unit: Unit, context: IUnitRenderContext): Container;
}

/** Body color and optional character sprite key for default rendering. */
const UNIT_DEFS: Record<string, { bodyColor: number; characterSpriteKey?: string }> = {
    warrior: { bodyColor: 0x8b0000 },
    mage: { bodyColor: 0x4a148c },
    ranger: { bodyColor: 0x2e7d32 },
    healer: { bodyColor: 0xf5f5dc },
    enemy_ranged: { bodyColor: 0x555555, characterSpriteKey: 'enemy_ranged' },
    enemy_melee: { bodyColor: 0x555555, characterSpriteKey: 'enemy_melee' },
};

const DEFAULT_BODY_COLOR = 0x555555;

/** Default unit def: draws glow, optional player ring, body circle, optional character sprite, initial label, HP bar. */
class DefaultUnitDef implements IUnitDef {
    createVisual(unit: Unit, context: IUnitRenderContext): Container {
        const container = new Container();
        const isEnemy = areEnemies(context.localTeamId, unit.teamId);
        const glowColor = isEnemy ? ENEMY_GLOW_COLOR : ALLY_GLOW_COLOR;
        const def = UNIT_DEFS[unit.characterId] ?? { bodyColor: DEFAULT_BODY_COLOR };
        const bodyColor = def.bodyColor;
        const characterTexture = def.characterSpriteKey
            ? context.getCharacterTexture(def.characterSpriteKey)
            : null;
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
export function getUnitDef(characterId: string): IUnitDef {
    return defaultUnitDef;
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
