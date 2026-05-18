import type { UnitSize } from '../game/units/unit_defs/unitConstants';

export interface InnerCircleDef {
    color: string;       // "#rrggbb"
    radiusRatio: number; // 0–1, relative to outer body-circle radius
}

export interface BattleModelProceduralDef {
    type: 'procedural';
    bodyColor: string;
    size: UnitSize;
    showNameLetter: boolean;
    innerCircle: InnerCircleDef | null;
    modelImage?: string; // optional filename for battle model image (e.g. "battleModel.svg")
}

export interface BattleModelSpriteDef {
    type: 'sprite';
    spriteRef: string; // filename relative to the portrait folder (e.g. "battle.svg")
    bodyColor: string;
    size: UnitSize;
    showNameLetter: boolean;
    innerCircle: InnerCircleDef | null;
}

export type BattleModelDef = BattleModelProceduralDef | BattleModelSpriteDef;

export interface PortraitManifest {
    id: string;
    name: string;
    portraitRef?: string; // optional filename for portrait face image (convention: portrait.svg)
    battleModel: BattleModelDef;
    /** If set, only these account IDs may select this portrait. It still renders for all players. */
    allowedPlayerIds?: number[];
}

/** Runtime form: URLs resolved, hex strings converted to Pixi integers. */
export interface LoadedBattleModel {
    type: 'procedural' | 'sprite';
    spriteUrl: string | undefined;
    /** Resolved URL for the optional battle model image. Undefined = flat colour only. */
    modelImageUrl: string | undefined;
    bodyColor: number; // Pixi hex integer
    size: UnitSize;
    showNameLetter: boolean;
    innerCircle: { color: number; radiusRatio: number } | null;
}

export interface LoadedPortrait {
    id: string;
    name: string;
    /** Vite asset URL to the portrait face image (SVG or PNG). Undefined when no image file is present. */
    picture: string | undefined;
    battleModel: LoadedBattleModel;
    /** If set, only these account IDs may select this portrait. Undefined = unrestricted. */
    allowedPlayerIds?: number[];
}
