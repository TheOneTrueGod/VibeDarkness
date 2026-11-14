import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MISSION_MAP, STORYLINES } from '../../../games/minion_battles/storylines';
import type { IBaseMissionDef } from '../../../games/minion_battles/storylines/BaseMissionDef';
import {
    groupMissionsByChapter,
    type MissionListCategory,
} from '../../../games/minion_battles/storylines/missionOverview/missionChapterGroups';
import { missionOverviewPath } from '../../ability-tests/campaignTabPaths';
import PanelLayout from '../PanelLayout';
import MissionMapView from './MissionMapView';

/** Every mission that has a battle, grouped by storyline chapter in chapter order. */
const MISSION_GROUPS = groupMissionsByChapter(
    Object.values(MISSION_MAP).filter((m) => !m.skipBattle),
    STORYLINES,
);
const FIRST_MISSION: IBaseMissionDef | undefined = MISSION_GROUPS[0]?.entries[0]?.mission;

/** Solid left border per category; main missions keep a plain border so text stays aligned. */
const CATEGORY_BORDER: Record<MissionListCategory, string> = {
    boss: 'border-l-red-500',
    sideQuest: 'border-l-purple-500',
    main: '',
};

const CATEGORY_LEGEND: { category: MissionListCategory; label: string; swatch: string }[] = [
    { category: 'boss', label: 'Boss fight', swatch: 'bg-red-500' },
    { category: 'sideQuest', label: 'Side quest', swatch: 'bg-purple-500' },
];

function matches(mission: IBaseMissionDef, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return mission.name.toLowerCase().includes(q) || mission.missionId.toLowerCase().includes(q);
}

/**
 * Manager tab: read-only view of a mission's map with a darkness toggle, zone overlays and a spawn /
 * trigger overview. URL: `/campaign/mission-overview/:missionId`.
 */
export default function MissionOverviewPanel() {
    const navigate = useNavigate();
    const { '*': subpath } = useParams();
    const [query, setQuery] = useState('');
    const urlMissionId = subpath ? decodeURIComponent(subpath.split('/')[0] ?? '') : '';
    const mission = MISSION_MAP[urlMissionId] && !MISSION_MAP[urlMissionId].skipBattle ? MISSION_MAP[urlMissionId] : null;

    useEffect(() => {
        if (!mission && FIRST_MISSION) navigate(missionOverviewPath(FIRST_MISSION.missionId), { replace: true });
    }, [mission, navigate]);

    const visibleGroups = useMemo(
        () =>
            MISSION_GROUPS.map((g) => ({ ...g, entries: g.entries.filter((e) => matches(e.mission, query)) })).filter(
                (g) => g.entries.length > 0,
            ),
        [query],
    );

    return (
        <PanelLayout
            title="Mission Overview"
            subtitle="Read-only mission layout, darkness and spawns"
            leftSize="small"
            leftClassName="flex flex-col overflow-hidden"
            left={
                <>
                    <div className="shrink-0 p-3 border-b border-border-custom">
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search missions…"
                            aria-label="Search missions"
                            className="w-full rounded border border-border-custom bg-dark-900 px-2 py-1 text-sm text-white focus:border-primary focus:outline-none"
                        />
                        <div className="mt-2 flex gap-3 text-[11px] text-muted">
                            {CATEGORY_LEGEND.map((l) => (
                                <span key={l.category} className="inline-flex items-center gap-1.5">
                                    <span className={`h-3 w-1 rounded-sm ${l.swatch}`} />
                                    {l.label}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto pb-2">
                        {visibleGroups.map((group) => (
                            <section key={group.key} aria-label={group.label}>
                                <h3 className="sticky top-0 z-10 border-b border-border-custom bg-surface px-3 py-1.5">
                                    {group.storylineTitle && (
                                        <span className="block truncate text-[10px] uppercase tracking-wide text-muted">
                                            {group.storylineTitle}
                                        </span>
                                    )}
                                    <span className={`block text-xs font-semibold ${group.adminOnly ? 'text-amber-300' : 'text-gray-200'}`}>
                                        {group.chapterLabel}
                                        {group.adminOnly && <span className="ml-1 font-normal text-muted">(admin only)</span>}
                                    </span>
                                </h3>
                                <div className="flex flex-col gap-1 p-2">
                                    {group.entries.map(({ mission: m, category }) => (
                                        <button
                                            key={m.missionId}
                                            type="button"
                                            onClick={() => navigate(missionOverviewPath(m.missionId))}
                                            title={category === 'boss' ? 'Boss fight' : category === 'sideQuest' ? 'Side quest' : undefined}
                                            className={`flex flex-col px-3 py-2 rounded border border-l-4 text-left text-sm transition-colors ${
                                                m.missionId === mission?.missionId
                                                    ? 'border-primary bg-surface-light text-white'
                                                    : 'border-transparent text-gray-300 hover:border-border-custom hover:bg-surface-light'
                                            } ${CATEGORY_BORDER[category]}`}
                                        >
                                            <span className="font-medium">{m.name}</span>
                                            <span className="font-mono text-[11px] text-muted">{m.missionId}</span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        ))}
                        {visibleGroups.length === 0 && <p className="p-3 text-sm text-muted">No mission matches “{query}”.</p>}
                    </div>
                </>
            }
            centerClassName="overflow-hidden"
            center={mission ? <MissionMapView mission={mission} /> : <p className="p-4 text-sm text-muted">No mission selected.</p>}
        />
    );
}
