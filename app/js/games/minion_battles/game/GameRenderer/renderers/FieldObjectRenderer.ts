/**
 * Resting dropped weapons and placed deployables. Flight is an effect or projectile; this draws
 * what is left on the ground. Each deployable is drawn by the painter its def's `visual` names.
 */
import { Graphics } from 'pixi.js';
import type { Container, Sprite } from 'pixi.js';
import type { GameEngine } from '../../GameEngine';
import { DROPPED_WEAPON_ARC_DURATION } from '../../fieldObjects/landing';
import { weaponTipOffset } from '../../conjuredWeapons/registry';
import { turretHullColor } from '../../effect_defs/turretDeployDraw';
import { deployableWallSeconds, getDeployablePainter } from '../../effect_defs/deployablePainters';
import {
    DROPPED_SWORD_SCALE,
    createWeaponCardSprite,
    sizeWeaponCardSprite,
    syncWeaponCardTexture,
    weaponCardArtUrl,
} from '../../fieldObjects/weaponArt';
import { ConcealedArrivalClock } from '../../fieldObjects/concealedArrival';
import { getDeployableDef } from '../../fieldObjects/deployableDefs';

const Z_FIELD_OBJECTS = 6;

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
            if (!weaponCardArtUrl(weapon.kind)) continue;
            live.add(weapon.id);
            if (!this.arrivals.hasArrived(weapon.id, weapon.spawnedAtGameTime, engine.gameTime, DROPPED_WEAPON_ARC_DURATION)) continue;
            resting.add(weapon.id);
            const sprite = this.weaponSprite(weapon.id, weapon.kind);
            syncWeaponCardTexture(sprite, weapon.kind);
            sprite.position.set(weapon.x, weapon.y);
            sprite.rotation = weapon.facing + weaponTipOffset(weapon.kind);
            sizeWeaponCardSprite(sprite, DROPPED_SWORD_SCALE);
            sprite.alpha = 1;
        }
        const wallSeconds = deployableWallSeconds();
        for (const deployable of manager.placedDeployables) {
            const def = getDeployableDef(deployable.defId);
            const painter = getDeployablePainter(def);
            if (!def || !painter) continue;
            live.add(deployable.id);
            const g = this.deployableGraphic(deployable.id);
            g.visible = true;
            g.position.set(deployable.x, deployable.y);
            g.rotation = deployable.facing;
            painter.paint(g, {
                open: painter.openAmount(deployable.spawnedAtGameTime, engine.gameTime),
                chargesFilled: deployable.chargesRemaining,
                charges: def.charges,
                ownerColor: turretHullColor(engine.getUnit(deployable.ownerUnitId)),
                actionAmount: painter.actionAmount(deployable, engine.gameTime),
                wallSeconds,
            });
        }
        for (const [id, visual] of this.visuals) {
            const deployableStillThere = manager.placedDeployables.some((deployable) => deployable.id === id);
            if (resting.has(id) || deployableStillThere) continue;
            visual.destroy();
            this.visuals.delete(id);
        }
        this.arrivals.forgetExcept(live);
    }

    private weaponSprite(id: string, kind: string): Sprite {
        let visual = this.visuals.get(id);
        if (!visual) {
            const sprite = createWeaponCardSprite(kind);
            sprite.zIndex = Z_FIELD_OBJECTS;
            this.visuals.set(id, sprite);
            this.gameContainer.addChild(sprite);
            visual = sprite;
        }
        return visual as Sprite;
    }

    private deployableGraphic(id: string): Graphics {
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
