/**
 * Admin-only wizard for skipping a chapter: one step per story choice (resolved against the
 * picks so far, see `chapterSkip.ts`), then a summary and Apply. Persistence is the caller's.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import type { CampaignChapterDef } from '../../../storylines/types';
import type { StoryChoiceAction, StoryChoiceOptionRow } from '../../../storylines/storyTypes';
import {
    buildChapterSkipPlan,
    getNextChapterSkipStep,
    type ChapterSkipCharacterState,
    type ChapterSkipContext,
    type ChapterSkipPick,
    type ChapterSkipPlan,
} from '../../../storylines/chapterSkip';
import { MISSION_MAP } from '../../../storylines/index';
import { getItemDef } from '../../../character_defs/items';
import { getResearchNode } from '../../../../../researchTrees/list';
import { TestIds } from '../../../../../testing/testIds';

export interface ChapterSkipWizardProps {
    chapter: CampaignChapterDef;
    start: ChapterSkipCharacterState;
    ctx: ChapterSkipContext;
    onApply: (picks: ChapterSkipPick[], plan: ChapterSkipPlan) => Promise<void>;
    onClose: () => void;
}

/** What an option actually grants, for when its lore title hides it (e.g. "Crystal Experimentation"). */
function actionSummary(action: StoryChoiceAction | undefined): string | null {
    if (!action) return null;
    if (action.type === 'equip_item') return `Equip ${getItemDef(action.itemId)?.name ?? action.itemId}`;
    if (action.type === 'grant_research_to_player') {
        return getResearchNode(action.treeId, action.nodeId)?.title ?? `${action.treeId}/${action.nodeId}`;
    }
    return null;
}

function OptionButton({ option, onPick }: { option: StoryChoiceOptionRow; onPick: () => void }) {
    const title = option.loreTitle ?? option.label;
    const grants = actionSummary(option.action);
    const disabled = !!option.disabledLabel;
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onPick}
            className={`w-full text-left rounded border px-3 py-2 flex flex-col gap-0.5 ${
                disabled
                    ? 'border-border-custom opacity-50 cursor-not-allowed'
                    : 'border-border-custom hover:border-primary hover:bg-surface-light cursor-pointer'
            }`}
        >
            <span className="text-sm font-semibold text-white">{title}</span>
            {grants && grants !== title && <span className="text-[11px] text-primary">{grants}</span>}
            {option.loreDescription && <span className="text-[11px] text-muted">{option.loreDescription}</span>}
            {option.disabledLabel && <span className="text-[11px] text-amber-200/90">{option.disabledLabel}</span>}
        </button>
    );
}

export default function ChapterSkipWizard({ chapter, start, ctx, onApply, onClose }: ChapterSkipWizardProps) {
    const [picks, setPicks] = useState<ChapterSkipPick[]>([]);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const step = useMemo(() => getNextChapterSkipStep(chapter, start, picks, ctx), [chapter, start, picks, ctx]);
    const plan = useMemo(
        () => (step ? null : buildChapterSkipPlan(chapter, start, picks, ctx)),
        [step, chapter, start, picks, ctx],
    );

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !applying) onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose, applying]);

    const apply = async () => {
        if (!plan) return;
        setApplying(true);
        setError(null);
        try {
            await onApply(picks, plan);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setApplying(false);
        }
    };

    const heading = `Skip Chapter ${chapter.numeral}${chapter.title ? `: ${chapter.title}` : ''}`;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={(e) => {
                if (e.target === e.currentTarget && !applying) onClose();
            }}
            role="dialog"
            aria-label={heading}
            data-testid={TestIds.chapterSkipWizard}
        >
            <div
                className="w-[36rem] max-w-[92vw] max-h-[85vh] bg-black border border-border-custom rounded-lg shadow-xl p-4 flex flex-col gap-3"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-base font-bold text-white truncate">{heading}</h3>
                        <p className="text-[11px] text-amber-200/90 mt-0.5">
                            Admin: replaces this chapter&apos;s results and rewards on the character.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={applying}
                        className="h-7 w-7 shrink-0 rounded border border-border-custom bg-surface-light text-white flex items-center justify-center hover:bg-border-custom cursor-pointer"
                        aria-label="Close"
                        title="Close"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                </div>

                {step ? (
                    <section className="flex flex-col gap-2 min-h-0">
                        <p className="text-xs text-muted">
                            Mission {step.missionStepIndex + 1} of {step.missionStepCount}:{' '}
                            <span className="text-white font-semibold">{step.missionName}</span>
                        </p>
                        <div className="flex flex-col gap-1.5 overflow-y-auto pr-0.5">
                            {step.options.length === 0 ? (
                                <p className="text-[11px] text-muted italic">No options for this choice.</p>
                            ) : (
                                step.options.map((option) => (
                                    <OptionButton
                                        key={option.id}
                                        option={option}
                                        onPick={() =>
                                            setPicks((prev) => [
                                                ...prev,
                                                { missionId: step.missionId, choiceId: step.choiceId, optionId: option.id },
                                            ])
                                        }
                                    />
                                ))
                            )}
                        </div>
                    </section>
                ) : (
                    plan && (
                        <section className="flex flex-col gap-1.5 overflow-y-auto pr-0.5" aria-label="Summary">
                            {plan.missionResults.map((result) => {
                                const items = (result.itemIds ?? []).map((id) => getItemDef(id)?.name ?? id);
                                const research = (result.researchRewards ?? []).map(
                                    (r) => getResearchNode(r.treeId, r.nodeId)?.title ?? `${r.treeId}/${r.nodeId}`,
                                );
                                const grants = [...items, ...research];
                                return (
                                    <div key={result.missionId} className="text-xs flex gap-2">
                                        <span className="text-white font-semibold shrink-0">
                                            {MISSION_MAP[result.missionId]?.name ?? result.missionId}
                                        </span>
                                        <span className="text-muted">
                                            {grants.length > 0 ? grants.join(', ') : 'Victory'}
                                        </span>
                                    </div>
                                );
                            })}
                            {plan.knowledgeKeys.length > 0 && (
                                <p className="text-[11px] text-muted mt-1">
                                    Account knowledge: {plan.knowledgeKeys.join(', ')}
                                </p>
                            )}
                        </section>
                    )
                )}

                {error && <p className="text-[11px] text-red-400">{error}</p>}

                <div className="flex items-center justify-between gap-2">
                    <button
                        type="button"
                        disabled={picks.length === 0 || applying}
                        onClick={() => setPicks((prev) => prev.slice(0, -1))}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border-custom text-muted hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                        Back
                    </button>
                    {!step && (
                        <button
                            type="button"
                            data-testid={TestIds.chapterSkipApply}
                            disabled={applying}
                            onClick={() => void apply()}
                            className="text-xs font-semibold px-3 py-1.5 rounded bg-primary text-secondary hover:opacity-90 disabled:opacity-50 cursor-pointer"
                        >
                            {applying ? 'Applying…' : 'Apply'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
