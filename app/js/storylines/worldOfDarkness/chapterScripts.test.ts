/**
 * Chapter script keys follow the storyline's missionIds, in order.
 * This file does not import the mission registry.
 */

import { describe, expect, it } from 'vitest';
import type { StorylineDef } from '../../games/minion_battles/storylines/types';
import { BunkerAtTheEndStoryline } from '../../games/minion_battles/storylines/BunkerAtTheEnd/BunkerAtTheEnd';
import { WorldOfDarknessStoryline } from '../../games/minion_battles/storylines/WorldOfDarkness/WorldOfDarkness';
import type { MissionScript } from '../missionScript';
import { bunkerChapterScripts } from '../bunkerAtTheEnd/chapter.script';
import { chapter0Scripts } from './chapter0.script';
import { chapter1Scripts } from './chapter1.script';
import { chapter2Scripts } from './chapter2.script';
import { chapter3Scripts } from './chapter3.script';
import { questScripts } from './quests.script';

const CHAPTER_SCRIPTS: Record<string, Record<string, MissionScript>> = {
    wod_ch1: chapter1Scripts,
    wod_ch2: chapter2Scripts,
    wod_ch3: chapter3Scripts,
    wod_ch0: chapter0Scripts,
    bunker_ch1: bunkerChapterScripts,
};

function chapterMissionIds(storyline: StorylineDef, chapterId: string): string[] {
    const chapter = storyline.chapters?.find((c) => c.id === chapterId);
    if (!chapter) throw new Error(`missing chapter ${chapterId}`);
    return chapter.missionIds;
}

function assertCopy(script: MissionScript, missionId: string): void {
    expect(script.name.length, missionId).toBeGreaterThan(0);
    expect(script.description.length, missionId).toBeGreaterThan(0);
    for (const [objectiveId, label] of Object.entries(script.objectives ?? {})) {
        expect(label.length, `${missionId} objective ${objectiveId}`).toBeGreaterThan(0);
    }
    if (script.playerControlLabel !== undefined) {
        expect(script.playerControlLabel.length, missionId).toBeGreaterThan(0);
    }
    for (const story of [script.preMissionStory, script.postMissionStory]) {
        if (!story) continue;
        expect(story.phrases.length, missionId).toBeGreaterThan(0);
        for (const phrase of story.phrases) {
            if (phrase.type === 'dialogue' || phrase.type === 'groupVote') {
                expect(phrase.text.length, missionId).toBeGreaterThan(0);
            }
            if (phrase.type === 'choice') {
                for (const option of phrase.options) {
                    expect(option.label.length, `${missionId} ${option.id}`).toBeGreaterThan(0);
                }
            }
        }
    }
}

describe('mission scripts', () => {
    it('lists each chapter in mission-map order', () => {
        const storylines = [WorldOfDarknessStoryline, BunkerAtTheEndStoryline];
        for (const [chapterId, scripts] of Object.entries(CHAPTER_SCRIPTS)) {
            const storyline = storylines.find((s) => s.chapters?.some((c) => c.id === chapterId));
            expect(storyline, chapterId).toBeDefined();
            expect(Object.keys(scripts)).toEqual(chapterMissionIds(storyline!, chapterId));
        }
    });

    it('gives every scripted mission a name and description', () => {
        const all = [chapter1Scripts, chapter2Scripts, chapter3Scripts, chapter0Scripts, bunkerChapterScripts, questScripts];
        for (const scripts of all) {
            for (const [missionId, script] of Object.entries(scripts)) {
                assertCopy(script, missionId);
            }
        }
    });

    it('keeps quest scripts off the chapter lists', () => {
        const onAChapter = new Set(
            (WorldOfDarknessStoryline.chapters ?? []).flatMap((chapter) => chapter.missionIds),
        );
        for (const missionId of Object.keys(questScripts)) {
            expect(onAChapter.has(missionId), missionId).toBe(false);
        }
    });
});
