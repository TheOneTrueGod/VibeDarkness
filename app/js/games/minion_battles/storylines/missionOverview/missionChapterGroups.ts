/**
 * Groups missions by the storyline chapter they belong to, in chapter order, for dev tools that list
 * missions (the Mission Overview tab). A chapter owns its `missionIds` plus the fixed missions of every
 * quest its quest banks accept.
 */
import type { IBaseMissionDef } from '../BaseMissionDef';
import { listQuestsForCampaign } from '../questRegistry';
import type { StorylineDef } from '../types';
import { bankAcceptsQuest } from '../unlock';

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
    missions: IBaseMissionDef[];
}

export const NO_CHAPTER_GROUP_KEY = 'no_chapter';

/** Mission ids a chapter owns, in display order: its missions, then its quest banks' quest missions. */
function chapterMissionIds(storyline: StorylineDef, chapterIndex: number): string[] {
    const chapter = storyline.chapters![chapterIndex];
    const ids = [...chapter.missionIds];
    const quests = listQuestsForCampaign(storyline.id);
    for (const bankId of chapter.questBankIds ?? []) {
        const bank = storyline.questSlotBanks?.find((b) => b.id === bankId);
        if (!bank) continue;
        for (const quest of quests) {
            if (!bankAcceptsQuest(bank, quest)) continue;
            for (const slot of quest.slots) if (slot.kind === 'fixed') ids.push(slot.missionId);
        }
    }
    return ids;
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
            const groupMissions: IBaseMissionDef[] = [];
            for (const id of chapterMissionIds(storyline, index)) {
                const mission = byId.get(id);
                if (!mission || placed.has(id)) continue;
                placed.add(id);
                groupMissions.push(mission);
            }
            if (groupMissions.length === 0) continue;
            const name = chapter.title ? `Chapter ${chapter.numeral}: ${chapter.title}` : `Chapter ${chapter.numeral}`;
            groups.push({
                key: `${storyline.id}/${chapter.id}`,
                label: `${storyline.title} · ${name}`,
                storylineTitle: storyline.title,
                chapterLabel: name,
                adminOnly: chapter.adminOnly ?? false,
                missions: groupMissions,
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
            missions: rest,
        });
    }
    return groups;
}
