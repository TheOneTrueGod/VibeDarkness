import type { ComponentType } from 'react';
import type { FxColors } from '../fxColors';

export type FxArtBackground = 'dark' | 'ground';

export interface FxArtProps {
    colors: FxColors;
    background: FxArtBackground;
}

/**
 * One concept-art piece a plan can list in an `art:` line: an animated SVG body painted from the
 * palette's colours. Rendered inside an `<svg viewBox="0 0 w h">` by `FxArtTile`.
 */
export interface FxArtPiece {
    id: string;
    label: string;
    /** A few words under the label. */
    caption?: string;
    /** viewBox width and height. */
    size: [number, number];
    /** Width on a palette card; the studio draws it 1.4x. */
    displayWidth: number;
    Render: ComponentType<FxArtProps>;
}

export const ART_BACKGROUNDS: Record<FxArtBackground, string> = { dark: '#07090d', ground: '#3a4433' };
