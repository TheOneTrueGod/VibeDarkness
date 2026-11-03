/**
 * MissionMapTab — SVG-based mission progress map for a campaign character.
 *
 * Shows all missions in the character's campaign as circles connected by lines.
 * Node fill: gray = finished; red = battle; blue = story; radial gradient = boss.
 * Locked missions are dimmed; admins can click them anyway.
 * Disabled nodes use a gray fill (any type) and stay viewable; only admins can host them.
 * Hovering a node shows a tooltip; clicking pins it and shows a "Host Mission" button.
 *
 * This file is the coordinator that owns state; pieces live in `./MissionMap/`.
 */
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { CampaignChapterDef } from '../../../storylines/types';
import type { StartQuestOptions } from '../../../storylines/questLobby';
import { STORYLINES, MISSION_MAP } from '../../../storylines/index';
import {
    getUnlockedMissionIds,
    hasVictoryResult,
    isMissionDisabled,
    getCampaignChapters,
    getHighestUnlockedChapterIndex,
    getUnlockedQuestSlotBanks,
    countQuestBankClears,
    getEligibleQuestsForBank,
    isDedicatedQuestBank,
    hasQuestVictoryResult,
} from '../../../storylines/unlock';
import type { QuestSlotBank } from '../../../storylines/questTypes';
import {
    isQuestBankFinished,
    questBankMapNodeKey,
    questBankUnlockRequirementLabel,
} from './questBankUi';
import QuestBankPickerPopup from './QuestBankPickerPopup';
import MissionMapCanvas from './MissionMap/MissionMapCanvas';
import MissionMapChapterBar from './MissionMap/MissionMapChapterBar';
import MissionTooltip from './MissionMap/MissionTooltip';
import QuestBankTooltip from './MissionMap/QuestBankTooltip';
import { buildMissionMapLayout } from './MissionMap/missionMapLayout';
import {
    missionBankUnlockHint,
    type QuestBankTooltipData,
    type TooltipData,
} from './MissionMap/missionMapHelpers';

interface Props {
    character: CampaignCharacter;
    isAdmin: boolean;
    onStartMission: (missionId: string) => void;
    /** Start / continue a quest (prep handled by CharacterEditor when mode is start). */
    onStartQuest?: (questDefId: string, options?: StartQuestOptions) => void;
    /** Clear the character's single active quest run (after confirm). */
    onAbandonQuest?: () => void | Promise<void>;
    /** Admin-only: clear a completed quest's victory so it can be run again. */
    onResetQuest?: (questDefId: string) => void | Promise<void>;
    onMarkVictory?: (missionId: string) => Promise<void>;
    /** Admin: record a quest as won in a bank with no rewards. */
    onMarkQuestVictory?: (questDefId: string, bankId: string) => Promise<void>;
    /** Admin-only: change the character's campaign from the map toolbar. */
    onCampaignChange?: (campaignId: string) => void | Promise<void>;
    /** Admin-only: open the Skip Chapter wizard for an `adminSkippable` chapter. */
    onSkipChapter?: (chapter: CampaignChapterDef) => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MissionMapTab({
    character,
    isAdmin,
    onStartMission,
    onStartQuest,
    onAbandonQuest,
    onResetQuest,
    onMarkVictory,
    onMarkQuestVictory,
    onCampaignChange,
    onSkipChapter,
}: Props) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [pressedId, setPressedId] = useState<string | null>(null);
    const [tooltip, setTooltip] = useState<TooltipData | null>(null);
    const [bankTooltip, setBankTooltip] = useState<QuestBankTooltipData | null>(null);
    const [pickerBank, setPickerBank] = useState<QuestSlotBank | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const storyline = useMemo(
        () => STORYLINES.find((s) => s.id === character.campaignId) ?? null,
        [character.campaignId],
    );

    const missionResults = useMemo(
        () => character.missionResults[character.campaignId] ?? [],
        [character.missionResults, character.campaignId],
    );

    const questResults = useMemo(
        () => character.questResults[character.campaignId] ?? [],
        [character.questResults, character.campaignId],
    );

    const unlockedIds = useMemo(
        () => (storyline ? getUnlockedMissionIds(storyline, missionResults, questResults, { isAdmin }) : new Set<string>()),
        [storyline, missionResults, questResults, isAdmin],
    );

    const chapters = useMemo(() => (storyline ? getCampaignChapters(storyline, { isAdmin }) : []), [storyline, isAdmin]);

    // Set by App.handleContinueFromMission when a victory Continue should land on a specific chapter.
    const requestedChapterId = (useLocation().state as { missionMapChapterId?: string } | null)?.missionMapChapterId;

    const defaultChapterIndex = () => {
        if (!storyline) return 0;
        const requested = requestedChapterId ? chapters.findIndex((c) => c.id === requestedChapterId) : -1;
        return requested >= 0 ? requested : getHighestUnlockedChapterIndex(storyline, missionResults, { isAdmin });
    };

    const [activeChapterIndex, setActiveChapterIndex] = useState(defaultChapterIndex);

    // Re-default to the requested / highest unlocked chapter whenever the campaign changes.
    useEffect(() => {
        setActiveChapterIndex(defaultChapterIndex());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [character.campaignId, isAdmin, requestedChapterId]);

    const activeChapter = chapters[activeChapterIndex] ?? chapters[0] ?? null;

    const layout = useMemo(
        () => (storyline ? buildMissionMapLayout(storyline, chapters, activeChapter, isAdmin) : null),
        [storyline, chapters, activeChapter, isAdmin],
    );
    const missions = useMemo(() => layout?.missions ?? [], [layout]);
    const questBanksOnMap = useMemo(() => layout?.questBanksOnMap ?? [], [layout]);
    const mapDividers = layout?.mapDividers ?? [];
    const posMap = layout?.posMap ?? new Map<string, { x: number; y: number }>();

    const unlockedQuestBankIds = useMemo(() => {
        if (!storyline) return new Set<string>();
        return new Set(
            getUnlockedQuestSlotBanks(storyline, missionResults, questResults).map((b) => b.id),
        );
    }, [storyline, missionResults, questResults]);

    /** Map node keys (mission ids and `questBank:<id>`) that are complete; drives green outlines/lines. */
    const completedNodeKeys = useMemo(() => {
        const done = new Set<string>();
        for (const { id } of missions) {
            if (hasVictoryResult(id, missionResults)) done.add(id);
        }
        for (const bank of questBanksOnMap) {
            if (isQuestBankFinished(bank, questResults)) done.add(questBankMapNodeKey(bank.id));
        }
        return done;
    }, [missions, questBanksOnMap, missionResults, questResults]);

    const { vbX, vbY, vbW, vbH } = layout?.viewBox ?? { vbX: 0, vbY: 0, vbW: 400, vbH: 300 };

    /** Convert SVG-space coordinates to viewport coordinates. */
    const svgToViewport = useCallback((svgX: number, svgY: number): { x: number; y: number } => {
        const svg = svgRef.current;
        if (!svg) return { x: 0, y: 0 };
        const rect = svg.getBoundingClientRect();
        const scaleX = rect.width / vbW;
        const scaleY = rect.height / vbH;
        return {
            x: rect.left + (svgX - vbX) * scaleX,
            y: rect.top + (svgY - vbY) * scaleY,
        };
    }, [vbX, vbY, vbW, vbH]);

    const handleNodeEnter = useCallback((id: string, svgPosX: number, svgPosY: number) => {
        setHoveredId(id);
        if (tooltip?.pinned) return; // keep pinned tooltip
        const { x, y } = svgToViewport(svgPosX, svgPosY);
        setTooltip({ id, cx: x, cy: y, pinned: false });
    }, [tooltip?.pinned, svgToViewport]);

    const handleNodeLeave = useCallback((id: string) => {
        setHoveredId((h) => h === id ? null : h);
        setPressedId((p) => p === id ? null : p);
        if (!tooltip?.pinned) setTooltip(null);
    }, [tooltip?.pinned]);

    const handleNodeClick = useCallback((id: string, svgPosX: number, svgPosY: number) => {
        const { x, y } = svgToViewport(svgPosX, svgPosY);
        setBankTooltip(null);
        setTooltip({ id, cx: x, cy: y, pinned: true });
    }, [svgToViewport]);

    const dismissTooltip = useCallback(() => setTooltip(null), []);
    const dismissBankTooltip = useCallback(() => setBankTooltip(null), []);

    const handleQuestBankClick = useCallback(
        (bank: QuestSlotBank, svgPosX: number, svgPosY: number) => {
            setTooltip(null);
            if (isDedicatedQuestBank(bank)) {
                const { x, y } = svgToViewport(svgPosX, svgPosY);
                setPickerBank(null);
                setBankTooltip({ bankId: bank.id, cx: x, cy: y, pinned: true });
                return;
            }
            setBankTooltip(null);
            setPickerBank(bank);
        },
        [svgToViewport],
    );

    // Dismiss pinned tooltip on Escape or outside click
    useEffect(() => {
        if (!tooltip?.pinned && !bankTooltip?.pinned) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                dismissTooltip();
                dismissBankTooltip();
            }
        };
        const onMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('[data-mission-tooltip]')) dismissTooltip();
            if (!target.closest('[data-quest-bank-tooltip]')) dismissBankTooltip();
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onMouseDown);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onMouseDown);
        };
    }, [tooltip?.pinned, bankTooltip?.pinned, dismissTooltip, dismissBankTooltip]);

    if (!storyline) {
        return (
            <div className="flex items-center justify-center h-full text-muted text-sm">
                No campaign assigned to this character.
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-auto">
            <MissionMapChapterBar
                character={character}
                isAdmin={isAdmin}
                chapters={chapters}
                activeChapter={activeChapter}
                activeChapterIndex={activeChapterIndex}
                missionResults={missionResults}
                onSelectChapter={setActiveChapterIndex}
                onCampaignChange={onCampaignChange}
                onSkipChapter={onSkipChapter}
            />
            <MissionMapCanvas
                svgRef={svgRef}
                storyline={storyline}
                isAdmin={isAdmin}
                viewBox={{ vbX, vbY, vbW, vbH }}
                mapDividers={mapDividers}
                missions={missions}
                questBanksOnMap={questBanksOnMap}
                posMap={posMap}
                completedNodeKeys={completedNodeKeys}
                unlockedIds={unlockedIds}
                missionResults={missionResults}
                questResults={questResults}
                hoveredId={hoveredId}
                pressedId={pressedId}
                tooltip={tooltip}
                bankTooltip={bankTooltip}
                setHoveredId={setHoveredId}
                setPressedId={setPressedId}
                onNodeClick={handleNodeClick}
                onNodeEnter={handleNodeEnter}
                onNodeLeave={handleNodeLeave}
                onQuestBankClick={handleQuestBankClick}
            />

            {/* Tooltip portal */}
            {tooltip && (
                <MissionTooltip
                    data={tooltip}
                    missionResults={missionResults}
                    isAdmin={isAdmin}
                    isLocked={!unlockedIds.has(tooltip.id)}
                    isDisabled={isMissionDisabled(MISSION_MAP[tooltip.id])}
                    unlockHint={missionBankUnlockHint(tooltip.id, storyline)}
                    onStartMission={onStartMission}
                    onMarkVictory={onMarkVictory}
                    onDismiss={dismissTooltip}
                />
            )}
            {pickerBank && onStartQuest && (
                <QuestBankPickerPopup
                    character={character}
                    bank={pickerBank}
                    banks={storyline?.questSlotBanks ?? []}
                    isUnlocked={unlockedQuestBankIds.has(pickerBank.id) || isAdmin}
                    isAdmin={isAdmin}
                    onStartQuest={onStartQuest}
                    onAbandonQuest={onAbandonQuest}
                    onClose={() => setPickerBank(null)}
                />
            )}
            {bankTooltip && (() => {
                const bank = questBanksOnMap.find((b) => b.id === bankTooltip.bankId);
                if (!bank) return null;
                const unlocked = unlockedQuestBankIds.has(bank.id);
                const eligible = getEligibleQuestsForBank(
                    bank,
                    character.campaignId,
                    questResults,
                );
                return (
                    <QuestBankTooltip
                        data={bankTooltip}
                        bank={bank}
                        eligibleQuests={eligible}
                        clears={countQuestBankClears(bank, questResults)}
                        isLocked={!unlocked && !isAdmin}
                        unlockRequirementLabel={questBankUnlockRequirementLabel(
                            bank,
                            storyline?.questSlotBanks ?? [],
                        )}
                        isAdmin={isAdmin}
                        activeQuestDefId={
                            character.activeQuestRun
                            && (character.activeQuestRun.status === 'active'
                                || character.activeQuestRun.status === 'prep')
                                ? character.activeQuestRun.questDefId
                                : null
                        }
                        activeQuestRun={character.activeQuestRun}
                        questCompleted={
                            !!bank.questDefId && hasQuestVictoryResult(bank.questDefId, questResults)
                        }
                        questResult={
                            bank.questDefId
                                ? questResults.find(
                                    (r) => r.questDefId === bank.questDefId && r.result === 'victory',
                                )
                                : undefined
                        }
                        onStartQuest={onStartQuest}
                        onAbandonQuest={onAbandonQuest}
                        onResetQuest={onResetQuest}
                        onMarkQuestVictory={onMarkQuestVictory}
                        onDismiss={dismissBankTooltip}
                    />
                );
            })()}
        </div>
    );
}
