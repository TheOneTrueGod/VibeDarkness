/**
 * Pure layout for a mission map chapter: node positions (with a fallback snake grid),
 * quest banks on the map, dividers, the chapter background, and the SVG viewBox. Shared by the
 * character Mission Map and the admin Campaign Summary.
 */
import type { CampaignChapterDef, StorylineDef } from '../../../../storylines/types';
import type { IBaseMissionDef } from '../../../../storylines/BaseMissionDef';
import type { QuestSlotBank } from '../../../../storylines/questTypes';
import { STORYLINES, MISSION_MAP } from '../../../../storylines/index';
import { getAllMissionIdsInOrder, isSideMissionId } from '../../../../storylines/unlock';
import { listSegments } from '../../../../terrain/segmentRegistry';
import { questBankMapNodeKey } from '../questBankUi';
import { PADDING } from './missionMapHelpers';
import { buildSegmentGridBackground, type BuiltMapBackground, type MapBackgroundBounds } from './segmentGridBackground';

export interface MissionMapNodeLayout {
    id: string;
    def: IBaseMissionDef | undefined;
    pos: { x: number; y: number };
    isSide: boolean;
}

export interface MissionMapLayout {
    missions: MissionMapNodeLayout[];
    questBanksOnMap: QuestSlotBank[];
    mapDividers: NonNullable<CampaignChapterDef['mapDividers']>;
    /** Mission ids and `questBank:<id>` keys → SVG position. */
    posMap: Map<string, { x: number; y: number }>;
    /** Chapter `mapBackground`, built from the registered segments (null when the chapter has none). */
    background: BuiltMapBackground | null;
    viewBox: { vbX: number; vbY: number; vbW: number; vbH: number };
}

const COLS = 5;
const COL_STEP = 170;
const ROW_STEP = 200;

/**
 * Lay out `activeChapter` (or the whole storyline when it has no chapters).
 * `chapters` is the viewer's chapter list from `getCampaignChapters`.
 */
export function buildMissionMapLayout(
    storyline: StorylineDef,
    chapters: CampaignChapterDef[],
    activeChapter: CampaignChapterDef | null,
    isAdmin: boolean,
): MissionMapLayout {
    const missionIds = chapters.length > 0
        ? (activeChapter?.missionIds ?? [])
        : getAllMissionIdsInOrder(storyline, { isAdmin });

    // Resolve mission defs and assign fallback grid positions for any missing mapPosition.
    const missions = missionIds.map((id, idx): MissionMapNodeLayout => {
        const def = MISSION_MAP[id];
        const isSide = def?.isSideMission === true || isSideMissionId(id, STORYLINES);
        const col = idx % COLS;
        const row = Math.floor(idx / COLS);
        const xDir = row % 2 === 0 ? 1 : -1;
        const baseX = row % 2 === 0 ? 100 : 100 + COL_STEP * (COLS - 1);
        const pos = def?.mapPosition ?? {
            x: baseX + xDir * col * COL_STEP,
            y: 120 + row * ROW_STEP,
        };
        return { id, def, pos, isSide };
    });

    const allBanks = (storyline.questSlotBanks ?? []).filter((b) => b.mapPosition != null);
    const chapterBankIds = new Set(activeChapter?.questBankIds ?? []);
    const questBanksOnMap = chapters.length === 0 ? allBanks : allBanks.filter((b) => chapterBankIds.has(b.id));

    const mapDividers = activeChapter?.mapDividers ?? [];

    const posMap = new Map<string, { x: number; y: number }>();
    for (const { id, pos } of missions) posMap.set(id, pos);
    for (const bank of questBanksOnMap) {
        if (bank.mapPosition) posMap.set(questBankMapNodeKey(bank.id), bank.mapPosition);
    }

    const backgroundDef = activeChapter?.mapBackground;
    const background = backgroundDef ? buildSegmentGridBackground(backgroundDef, listSegments()) : null;

    return {
        missions,
        questBanksOnMap,
        mapDividers,
        posMap,
        background,
        viewBox: computeViewBox(missions, questBanksOnMap, mapDividers, background?.bounds ?? null),
    };
}

function computeViewBox(
    missions: MissionMapNodeLayout[],
    questBanksOnMap: QuestSlotBank[],
    mapDividers: NonNullable<CampaignChapterDef['mapDividers']>,
    backgroundBounds: MapBackgroundBounds | null,
): MissionMapLayout['viewBox'] {
    const points = [
        ...missions.map((m) => m.pos),
        ...questBanksOnMap.map((b) => b.mapPosition!).filter(Boolean),
    ];
    let minX = 0, minY = 0, maxX = 400, maxY = 300;
    if (points.length > 0) {
        minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
        for (const pos of points) {
            if (pos.x < minX) minX = pos.x;
            if (pos.y < minY) minY = pos.y;
            if (pos.x > maxX) maxX = pos.x;
            if (pos.y > maxY) maxY = pos.y;
        }
        for (const { y } of mapDividers) {
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    let vbX = minX - PADDING;
    let vbY = minY - PADDING;
    let vbRight = maxX + PADDING;
    let vbBottom = maxY + PADDING;
    // Grow (never shrink) to fit the whole background block.
    if (backgroundBounds) {
        vbX = Math.min(vbX, backgroundBounds.x);
        vbY = Math.min(vbY, backgroundBounds.y);
        vbRight = Math.max(vbRight, backgroundBounds.x + backgroundBounds.width);
        vbBottom = Math.max(vbBottom, backgroundBounds.y + backgroundBounds.height);
    }
    return { vbX, vbY, vbW: vbRight - vbX, vbH: vbBottom - vbY };
}
