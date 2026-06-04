import { Container, Graphics, Text, TextStyle, type TextStyleFontWeight } from 'pixi.js';

export interface BadgeOptions {
    radius?: number;
    bgColor?: number;
    bgAlpha?: number;
    textColor?: number;
    fontSize?: number;
    fontWeight?: TextStyleFontWeight;
}

/** A filled circle with a centered number/text label inside. */
export function createBadge(initialText: string, opts: BadgeOptions = {}): Container {
    const {
        radius = 7,
        bgColor = 0x000000,
        bgAlpha = 0.85,
        textColor = 0xffffff,
        fontSize = 8,
        fontWeight = 'bold',
    } = opts;

    const container = new Container();
    container.label = 'badge';

    const circle = new Graphics();
    circle.circle(0, 0, radius);
    circle.fill({ color: bgColor, alpha: bgAlpha });
    container.addChild(circle);

    const text = new Text({
        text: initialText,
        style: new TextStyle({ fontSize, fontWeight, fill: textColor }),
    });
    text.anchor.set(0.5, 0.5);
    text.label = 'badgeText';
    container.addChild(text);

    return container;
}

/** Update the text inside a badge created by `createBadge`. */
export function updateBadgeText(badge: Container, newText: string): void {
    const t = badge.children.find((c) => c.label === 'badgeText') as Text | undefined;
    if (t) t.text = newText;
}
