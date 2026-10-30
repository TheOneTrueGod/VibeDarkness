/**
 * Resting dropped weapons and sentries. Flight is an effect; this draws what is left on the ground.
 */
import { Graphics } from 'pixi.js';
import type { Container, Sprite } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import {
    DROPPED_WEAPON_ARC_DURATION,
    DROPPED_WEAPON_KIND_SWORD,
    SWORD_CARD_TIP_OFFSET,
    TURRET_SHOT_COUNT,
} from '../../../card_defs/10_armory_core/armoryConstants';
import {
    DROPPED_SWORD_SCALE,
    createSwordCardSprite,
    sizeSwordCardSprite,
    syncSwordCardTexture,
} from '../../fieldObjects/swordCardSprite';
import { ConcealedArrivalClock } from '../../fieldObjects/concealedArrival';

const Z_FIELD_OBJECTS = 6;
const TURRET_COLOR = 0xa8a29e;
const PIP_FILLED = 0xf5f5f4;
const PIP_EMPTY = 0x44403c;

export class FieldObjectRenderer {
    private visuals = new Map<string, Container>();
    /** Hides a dropped sword until its flight has elapsed on game time or wall time. */
    private arrivals = new ConcealedArrivalClock();

    constructor(private readonly gameContainer: Container) {}

    render(engine: GameEngine): void {
        const manager = engine.state.fieldObjects;
        const live = new Set<string>();
        const resting = new Set<string>();
        for (const weapon of manager.droppedWeapons) {
            if (weapon.kind !== DROPPED_WEAPON_KIND_SWORD) continue;
            live.add(weapon.id);
            if (!this.arrivals.hasArrived(weapon.id, weapon.spawnedAtGameTime, engine.gameTime, DROPPED_WEAPON_ARC_DURATION)) continue;
            resting.add(weapon.id);
            const sprite = this.sword(weapon.id);
            syncSwordCardTexture(sprite);
            sprite.position.set(weapon.x, weapon.y);
            sprite.rotation = weapon.facing + SWORD_CARD_TIP_OFFSET;
            sizeSwordCardSprite(sprite, DROPPED_SWORD_SCALE);
            sprite.alpha = 0.95;
        }
        for (const sentry of manager.sentries) {
            live.add(sentry.id);
            const g = this.sentryGraphic(sentry.id);
            g.position.set(sentry.x, sentry.y);
            g.clear();
            g.circle(0, 0, 10);
            g.fill({ color: TURRET_COLOR, alpha: 0.9 });
            g.moveTo(0, 0);
            g.lineTo(Math.cos(sentry.facing) * 16, Math.sin(sentry.facing) * 16);
            g.stroke({ color: 0xe7e5e4, width: 2, alpha: 0.9 });
            for (let i = 0; i < TURRET_SHOT_COUNT; i++) {
                const angle = -Math.PI / 2 + (i / TURRET_SHOT_COUNT) * Math.PI * 2;
                const filled = i < sentry.shotsRemaining;
                g.circle(Math.cos(angle) * 16, Math.sin(angle) * 16, 2.5);
                g.fill({ color: filled ? PIP_FILLED : PIP_EMPTY, alpha: 0.95 });
            }
        }
        for (const [id, visual] of this.visuals) {
            const sentryStillThere = manager.sentries.some((sentry) => sentry.id === id);
            if (resting.has(id) || sentryStillThere) continue;
            visual.destroy();
            this.visuals.delete(id);
        }
        this.arrivals.forgetExcept(live);
    }

    private sword(id: string): Sprite {
        let visual = this.visuals.get(id);
        if (!visual) {
            const sprite = createSwordCardSprite();
            sprite.zIndex = Z_FIELD_OBJECTS;
            this.visuals.set(id, sprite);
            this.gameContainer.addChild(sprite);
            visual = sprite;
        }
        return visual as Sprite;
    }

    private sentryGraphic(id: string): Graphics {
        let visual = this.visuals.get(id);
        if (!visual) {
            const g = new Graphics();
            g.zIndex = Z_FIELD_OBJECTS;
            this.visuals.set(id, g);
            this.gameContainer.addChild(g);
            visual = g;
        }
        return visual as Graphics;
    }
}
