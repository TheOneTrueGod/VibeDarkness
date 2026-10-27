/**
 * Pure helpers and shared constants for the mission map (colours, tooltip data shapes,
 * quest slot rows, chapter-button classes).
 */
import type { MissionResult } from '../../../../../../types';
import type { MissionType, StorylineDef } from '../../../../storylines/types';
import type { QuestDef, QuestRunState, QuestSlotBank } from '../../../../storylines/questTypes';
import { MISSION_MAP } from '../../../../storylines/index';
import { hasVictoryResult, isMissionCompleted, isQuestDisabled } from '../../../../storylines/unlock';
import { getQuestDef } from '../../../../storylines/questRegistry';
import { MISSION_MAP_COMPLETED_EDGE_COLOR, bankDisplayLabel } from '../questBankUi';

export const CIRCLE_R = 28;
/** ViewBox inset — covers node radius, name label below, and hover rings without huge empty margins. */
export const PADDING = 48;
export const MISSION_ICON_SIZE = 22;
/** Horizontal inset of chapter map dividers from the viewBox edges. */
export const MAP_DIVIDER_INSET = 16;
export const SIDE_QUEST_MARK_FONT_SIZE = 16;

export const DEFAULT_MISSION_TYPE: MissionType = 'battle';

/** Solid fills for finished / battle / story nodes. */
export const MISSION_NODE_FILL = {
    finished: '#6b7280', // gray-500
    battle: '#ef4444', // red-500
    story: '#3b82f6', // blue-500
    campsite: '#f59e0b', // amber-500
} as const;

/** Lighter red halo on battle nodes — same role as quest-bank violet-400 on violet-600. */
export const BATTLE_NODE_STROKE = '#fca5a5'; // red-300

/** Checkmark and node border for completed missions / quest banks (and lines between them). */
export const COMPLETED_MISSION_ACCENT = MISSION_MAP_COMPLETED_EDGE_COLOR;

/** Gray fill for disabled map nodes of any type. */
export const DISABLED_NODE_FILL = MISSION_NODE_FILL.finished;

/** Solid accent used for boss hover glow (gradient fill cannot drive drop-shadow alone). */
export const BOSS_GLOW_COLOR = '#e11d48'; // rose-600
export const BOSS_GRADIENT_ID = 'mission-map-boss-fill';
/** Dashed ring when an admin can click a locked mission. */
export const LOCKED_ADMIN_RING_COLOR = '#f59e0b'; // amber-500
/** Dashed ring when an admin can click a disabled mission. */
export const DISABLED_ADMIN_RING_COLOR = '#a1a1aa'; // zinc-400

/** SVG fill for a mission node: gray when finished or disabled, else type-based (boss uses gradient url). */
export function getMissionNodeFill(
    missionId: string,
    missionType: MissionType,
    missionResults: MissionResult[],
    isDisabled: boolean,
): string {
    if (hasVictoryResult(missionId, missionResults) || isDisabled) return MISSION_NODE_FILL.finished;
    if (missionType === 'boss') return `url(#${BOSS_GRADIENT_ID})`;
    if (missionType === 'story') return MISSION_NODE_FILL.story;
    if (missionType === 'campsite') return MISSION_NODE_FILL.campsite;
    return MISSION_NODE_FILL.battle;
}

/** Solid color for hover glow / drop-shadow (never a gradient url). */
export function getMissionGlowColor(
    missionId: string,
    missionType: MissionType,
    missionResults: MissionResult[],
    isDisabled: boolean,
): string {
    if (hasVictoryResult(missionId, missionResults) || isDisabled) return MISSION_NODE_FILL.finished;
    if (missionType === 'boss') return BOSS_GLOW_COLOR;
    if (missionType === 'story') return MISSION_NODE_FILL.story;
    if (missionType === 'campsite') return MISSION_NODE_FILL.campsite;
    return MISSION_NODE_FILL.battle;
}

export function getStatusLabel(missionId: string, missionResults: MissionResult[]): { label: string; color: string } | null {
    if (hasVictoryResult(missionId, missionResults)) return { label: 'Victory', color: COMPLETED_MISSION_ACCENT };
    if (isMissionCompleted(missionId, missionResults)) return { label: 'Defeat', color: '#ef4444' };
    return null;
}

export function isQuestBankDisabled(bank: QuestSlotBank): boolean {
    if (!bank.questDefId) return false;
    return isQuestDisabled(getQuestDef(bank.questDefId));
}

export interface TooltipData {
    id: string;
    /** Viewport coordinates of the node circle center */
    cx: number;
    cy: number;
    pinned: boolean;
}

export interface QuestBankTooltipData {
    bankId: string;
    cx: number;
    cy: number;
    pinned: boolean;
}

export function missionBankUnlockHint(
    missionId: string,
    storyline: StorylineDef | undefined,
): string | undefined {
    const gate = (storyline?.edges ?? []).find(
        (e) => e.toMissionId === missionId && e.requiresQuestBankId,
    );
    if (!gate?.requiresQuestBankId) return undefined;
    const bank = (storyline?.questSlotBanks ?? []).find((b) => b.id === gate.requiresQuestBankId);
    return bank ? `Complete ${bankDisplayLabel(bank)} to unlock.` : undefined;
}

export type QuestSlotRow = {
    key: string;
    done: boolean;
    label: string;
    /** Real mission id, shown to admins once the slot is revealed. */
    missionId?: string;
};

/** Quest-only missions are named `Quest: …`; the list is already scoped to a quest. */
const QUEST_MISSION_NAME_PREFIX = /^Quest:\s*/;
const QUEST_SLOT_HIDDEN_LABEL = '????????';
const QUEST_SLOT_RANDOM_LABEL = 'Encounter';

/**
 * One row per quest slot. Completed slots show the mission name; the first unfinished slot shows
 * its name when fixed (or a generic label when random); later slots stay hidden.
 */
export function buildQuestSlotRows(
    quest: QuestDef,
    run: QuestRunState | null | undefined,
    questCompleted: boolean,
): QuestSlotRow[] {
    const activeRun = run
        && run.questDefId === quest.id
        && (run.status === 'prep' || run.status === 'active')
        ? run
        : null;
    const currentIndex = questCompleted ? quest.slots.length : (activeRun?.currentSlotIndex ?? 0);
    return quest.slots.map((slot, i) => {
        const done = i < currentIndex;
        const resolvedId = activeRun?.resolvedSlots[i]?.missionId
            ?? (slot.kind === 'fixed' ? slot.missionId : undefined);
        const name = resolvedId
            ? MISSION_MAP[resolvedId]?.name.replace(QUEST_MISSION_NAME_PREFIX, '')
            : undefined;
        const genericLabel = slot.kind === 'fixed'
            ? undefined
            : slot.kind === 'location_encounter'
              ? 'Location Encounter'
              : QUEST_SLOT_RANDOM_LABEL;
        const key = `${quest.id}-${i}`;
        if (done || i === currentIndex) {
            const revealed = slot.kind === 'fixed' || done;
            if (revealed && name) return { key, done, label: name, missionId: resolvedId };
            return { key, done, label: genericLabel ?? name ?? QUEST_SLOT_HIDDEN_LABEL };
        }
        return { key, done: false, label: QUEST_SLOT_HIDDEN_LABEL };
    });
}

export function chapterBtnClass(active: boolean, unlocked: boolean, clickable: boolean): string {
    return `flex items-center justify-center w-10 h-10 rounded-lg text-lg font-bold leading-none transition-all ${
        active
            ? 'bg-primary text-secondary'
            : clickable
                ? 'border border-border-custom text-muted hover:text-white hover:border-primary cursor-pointer'
                : 'border border-border-custom text-zinc-600 opacity-50 cursor-not-allowed'
    } ${!unlocked && clickable ? 'border-dashed border-amber-500/60' : ''}`;
}
