import React from 'react';
import { ChevronDown, FastForward } from 'lucide-react';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import type { MissionResult } from '../../../../../../types';
import type { CampaignChapterDef } from '../../../../storylines/types';
import { STORYLINES } from '../../../../storylines/index';
import { isChapterSkippable } from '../../../../storylines/chapterSkip';
import { isChapterUnlocked } from '../../../../storylines/unlock';
import { TestIds, missionMapChapterTestId } from '../../../../../../testing/testIds';
import { chapterBtnClass } from './missionMapHelpers';

interface Props {
    character: CampaignCharacter;
    isAdmin: boolean;
    chapters: CampaignChapterDef[];
    activeChapter: CampaignChapterDef | null;
    activeChapterIndex: number;
    missionResults: MissionResult[];
    onSelectChapter: (index: number) => void;
    onCampaignChange?: (campaignId: string) => void | Promise<void>;
    onSkipChapter?: (chapter: CampaignChapterDef) => void;
}

/** Top strip of the mission map: Skip Chapter (admin), chapter tabs, campaign select. */
export default function MissionMapChapterBar({
    character,
    isAdmin,
    chapters,
    activeChapter,
    activeChapterIndex,
    missionResults,
    onSelectChapter,
    onCampaignChange,
    onSkipChapter,
}: Props) {
    // Show the chapter strip whenever the campaign defines chapters at all — a lone "I" renders
    // too, for consistency across campaigns.
    const showChapters = chapters.length >= 1;

    return (
            <div className="shrink-0 flex items-center gap-3 pb-2 border-b border-border-custom mb-2">
                {/* left */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                    {isAdmin && onSkipChapter && activeChapter && isChapterSkippable(activeChapter) && (
                        <button
                            type="button"
                            data-testid={TestIds.missionMapSkipChapter}
                            onClick={() => onSkipChapter(activeChapter)}
                            title={`Admin: pick this chapter's rewards and mark every mission won`}
                            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-dashed border-amber-500/60 text-amber-200 hover:bg-amber-500/10 cursor-pointer"
                        >
                            <FastForward className="h-3.5 w-3.5" aria-hidden />
                            Skip Chapter
                        </button>
                    )}
                </div>

                {/* center: chapter buttons */}
                {showChapters && (
                    <div
                        className="shrink-0 flex items-center gap-2"
                        role="tablist"
                        aria-label="Campaign chapters"
                    >
                        {chapters.map((ch, i) => {
                            const unlocked = isChapterUnlocked(ch, i, missionResults);
                            const active = i === activeChapterIndex;
                            const clickable = unlocked || isAdmin;
                            return (
                                <button
                                    key={ch.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    disabled={!clickable}
                                    data-testid={missionMapChapterTestId(ch.id)}
                                    title={ch.title ?? `Chapter ${ch.numeral}`}
                                    onClick={() => onSelectChapter(i)}
                                    className={chapterBtnClass(active, unlocked, clickable)}
                                >
                                    {ch.numeral}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* right */}
                <div className="flex-1 min-w-0 flex items-center justify-end gap-3">
                    {onCampaignChange && (
                        <div className="flex items-center gap-2 min-w-0">
                            <label className="text-xs text-muted shrink-0">Campaign:</label>
                            <div className="relative w-44 max-w-[40vw] shrink-0">
                                <select
                                    value={character.campaignId}
                                    onChange={(e) => void onCampaignChange(e.target.value)}
                                    className="w-full appearance-none text-xs bg-surface border border-border-custom rounded pl-2 pr-7 py-1 text-white"
                                >
                                    {STORYLINES.map((s) => (
                                        <option key={s.id} value={s.id}>{s.title}</option>
                                    ))}
                                </select>
                                <ChevronDown
                                    className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white"
                                    aria-hidden
                                    strokeWidth={2.25}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
    );
}
