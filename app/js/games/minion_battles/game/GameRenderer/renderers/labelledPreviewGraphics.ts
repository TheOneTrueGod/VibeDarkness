/**
 * Targeting-preview graphics that can also place a world-space text label.
 * Labels are children of the same Graphics, so they follow the camera and clear with the layer.
 */
import { Graphics, Text, TextStyle } from 'pixi.js';
import type { IAbilityPreviewGraphics } from '../../../abilities/Ability';

/** World-pixel size of a preview label. The camera scales it with the battlefield. */
export const PREVIEW_LABEL_FONT_PX = 13;

export class LabelledPreviewGraphics implements IAbilityPreviewGraphics {
    constructor(private readonly graphics: Graphics) {}

    clear(): void {
        this.graphics.clear();
        for (const child of this.graphics.removeChildren()) child.destroy();
    }

    moveTo(x: number, y: number): void {
        this.graphics.moveTo(x, y);
    }

    lineTo(x: number, y: number): void {
        this.graphics.lineTo(x, y);
    }

    circle(x: number, y: number, radius: number): void {
        this.graphics.circle(x, y, radius);
    }

    fill(options: { color: number; alpha?: number }): void {
        this.graphics.fill(options);
    }

    stroke(options: { color: number; width: number; alpha?: number }): void {
        this.graphics.stroke(options);
    }

    label(text: string, x: number, y: number, color: number): void {
        const label = new Text({
            text,
            style: new TextStyle({
                fontSize: PREVIEW_LABEL_FONT_PX,
                fontWeight: '700',
                fill: color,
                align: 'center',
            }),
        });
        label.anchor.set(0.5, 0);
        label.position.set(x, y);
        label.eventMode = 'none';
        this.graphics.addChild(label);
    }
}
