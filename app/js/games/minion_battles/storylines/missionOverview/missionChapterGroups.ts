/**
 * Groups missions by the storyline chapter they belong to, in chapter order, for dev tools that list
 * missions (the Mission Overview tab). A chapter owns its `missionIds` plus the fixed missions of every
 * quest its quest banks accept. Each entry is also tagged boss / side quest / main.
 */
import type { IBaseMissionDef } from '../BaseMissionDef';
import { listQuestsForCampaign } from '../questRegistry';
import type { StorylineDef } from '../types';
import { bankAcceptsQuest, isSideMissionId } from '../unlock';

/**
 * - `boss`: `missionType === 'boss'` (wins over side quest).
 * - `sideQuest`: the mission is a side mission (`isSideMission`, or only reachable by side edges), or a
 *   quest mission from a bank drawn as a side quest (`isSideQuest`, default true, as on the Mission Map).
 * - `main`: everything else.
 */
export type MissionListCategory = 'boss' | 'sideQuest' | 'main';

export interface MissionListEntry {
    mission: IBaseMissionDef;
    category: MissionListCategory;
}

export interface MissionChapterGroup {
    /** `${storylineId}/${chapterId}`, or `NO_CHAPTER_GROUP_KEY`. */
    key: string;
    /** e.g. "A World of Darkness · Chapter I: A Dark Awakening". */
    label: string;
    /** Storyline title, or '' for the no-chapter group. */
    storylineTitle: string;
    /** e.g. "Chapter I: A Dark Awakening". */
    chapterLabel: string;
    adminOnly: boolean;
    entries: MissionListEntry[];
}

export const NO_CHAPTER_GROUP_KEY = 'no_chapter';

/**
 * Mission ids a chapter owns, in display order: its missions, then its quest banks' quest missions
 * (flagged when the bank is drawn as a side quest).
 */
function chapterMissionIds(storyline: StorylineDef, chapterIndex: number): { id: string; sideQuestBank: boolean }[] {
    const chapter = storyline.chapters![chapterIndex];
    const ids = chapter.missionIds.map((id) => ({ id, sideQuestBank: false }));
    const quests = listQuestsForCampaign(storyline.id);
    for (const bankId of chapter.questBankIds ?? []) {
        const bank = storyline.questSlotBanks?.find((b) => b.id === bankId);
        if (!bank) continue;
        const sideQuestBank = bank.isSideQuest ?? true;
        for (const quest of quests) {
            if (!bankAcceptsQuest(bank, quest)) continue;
            for (const slot of quest.slots) if (slot.kind === 'fixed') ids.push({ id: slot.missionId, sideQuestBank });
        }
    }
    return ids;
}

function categorize(mission: IBaseMissionDef, sideQuestBank: boolean, storylines: readonly StorylineDef[]): MissionListCategory {
    if (mission.missionType === 'boss') return 'boss';
    if (sideQuestBank || mission.isSideMission === true || isSideMissionId(mission.missionId, [...storylines])) return 'sideQuest';
    return 'main';
}

/**
 * One group per chapter that has any of `missions`: storylines in order, player chapters in order,
 * then admin-only chapters, then missions in no chapter. Each mission appears once, in the first
 * chapter that owns it.
 */
export function groupMissionsByChapter(
    missions: readonly IBaseMissionDef[],
    storylines: readonly StorylineDef[],
): MissionChapterGroup[] {
    const byId = new Map(missions.map((m) => [m.missionId, m]));
    const placed = new Set<string>();
    const groups: MissionChapterGroup[] = [];

    for (const storyline of storylines) {
        const chapters = (storyline.chapters ?? []).map((chapter, index) => ({ chapter, index }));
        const ordered = [...chapters.filter((c) => !c.chapter.adminOnly), ...chapters.filter((c) => c.chapter.adminOnly)];
        for (const { chapter, index } of ordered) {
            const entries: MissionListEntry[] = [];
            for (const { id, sideQuestBank } of chapterMissionIds(storyline, index)) {
                const mission = byId.get(id);
                if (!mission || placed.has(id)) continue;
                placed.add(id);
                entries.push({ mission, category: categorize(mission, sideQuestBank, storylines) });
            }
            if (entries.length === 0) continue;
            const name = chapter.title ? `Chapter ${chapter.numeral}: ${chapter.title}` : `Chapter ${chapter.numeral}`;
            groups.push({
                key: `${storyline.id}/${chapter.id}`,
                label: `${storyline.title} · ${name}`,
                storylineTitle: storyline.title,
                chapterLabel: name,
                adminOnly: chapter.adminOnly ?? false,
                entries,
            });
        }
    }

    const rest = missions.filter((m) => !placed.has(m.missionId));
    if (rest.length > 0) {
        groups.push({
            key: NO_CHAPTER_GROUP_KEY,
            label: 'Not in a chapter',
            storylineTitle: '',
            chapterLabel: 'Not in a chapter',
            adminOnly: false,
            entries: rest.map((mission) => ({ mission, category: categorize(mission, false, storylines) })),
        });
    }
    return groups;
}
