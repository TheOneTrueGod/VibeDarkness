/**
 * Registry of concept-art pieces for plan `art:` lines (see `PlanFxOptions`). Add a tree's pieces in
 * their own file and spread them in here; ids are global, so prefix them with the tree.
 */
import type { FxArtPiece } from './types';
import { COURT_MAGICIAN_ART } from './courtMagicianArt';
import { GARDEN_HEART_ART, GARDEN_ART_CSS } from './gardenHeartArt';
import { WATER_ART, WATER_ART_CSS } from './waterArt';

export type { FxArtPiece, FxArtProps } from './types';

const ALL_ART: FxArtPiece[] = [...WATER_ART, ...COURT_MAGICIAN_ART, ...GARDEN_HEART_ART];

const BY_ID: ReadonlyMap<string, FxArtPiece> = new Map(ALL_ART.map((piece) => [piece.id, piece]));

export function getFxArt(id: string): FxArtPiece | undefined {
    return BY_ID.get(id);
}

/** Every art id, for tests and plan authors. */
export const FX_ART_IDS: readonly string[] = ALL_ART.map((piece) => piece.id);

/** Keyframes the art pieces use; included once in the plan's FX stylesheet. */
export const FX_ART_CSS = [WATER_ART_CSS, GARDEN_ART_CSS].join('\n');
