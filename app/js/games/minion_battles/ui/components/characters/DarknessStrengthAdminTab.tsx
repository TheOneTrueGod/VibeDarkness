import React, { useCallback, useMemo, useState } from 'react';
import type { LobbyClient } from '../../../../../LobbyClient';
import type { CampaignState } from '../../../../../types';
import { listDarknessStrengths } from '../../../../../darknessStrength/registry';
import { resolveActiveDarknessStrengths } from '../../../../../darknessStrength/resolve';
import type {
    DarknessStrengthAdminOverride,
    DarknessStrengthInstance,
} from '../../../../../darknessStrength/types';
import { withCampaignDarknessStrengthDefaults } from '../../../../../darknessStrength/campaignFields';

type OverrideMode = 'natural' | 'force_enable' | 'force_disable';

function overrideModeFor(
    packageId: string,
    overrides: Record<string, DarknessStrengthAdminOverride> | undefined,
): OverrideMode {
    const o = overrides?.[packageId];
    if (!o) return 'natural';
    return o.enabled ? 'force_enable' : 'force_disable';
}

function formatData(data: Record<string, unknown> | undefined): string {
    if (!data || Object.keys(data).length === 0) return '';
    try {
        return JSON.stringify(data, null, 2);
    } catch {
        return String(data);
    }
}

export function DarknessStrengthAdminTab({
    lobbyClient,
    campaignId,
    campaign,
    onCampaignUpdated,
}: {
    lobbyClient: LobbyClient;
    campaignId: string;
    campaign: CampaignState;
    onCampaignUpdated: (next: CampaignState) => void;
}) {
    const normalized = useMemo(() => withCampaignDarknessStrengthDefaults(campaign), [campaign]);
    const packages = useMemo(() => listDarknessStrengths(), []);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dataDrafts, setDataDrafts] = useState<Record<string, string>>({});

    const activeIds = useMemo(() => {
        const active = resolveActiveDarknessStrengths({
            instances: normalized.darknessStrengthInstances,
            overrides: normalized.adminDarknessStrengthOverrides,
        });
        return new Set(active.map((a) => a.packageId));
    }, [normalized]);

    const instanceById = useMemo(() => {
        const map = new Map<string, DarknessStrengthInstance>();
        for (const inst of normalized.darknessStrengthInstances) {
            map.set(inst.packageId, inst);
        }
        return map;
    }, [normalized.darknessStrengthInstances]);

    const persistOverrides = useCallback(
        async (
            nextOverrides: Record<string, DarknessStrengthAdminOverride>,
            packageId: string,
        ) => {
            setSavingId(packageId);
            setError(null);
            try {
                const updated = await lobbyClient.updateCampaign(campaignId, {
                    adminDarknessStrengthOverrides: nextOverrides,
                });
                onCampaignUpdated(withCampaignDarknessStrengthDefaults(updated));
            } catch (err) {
                console.error('Failed to update DarknessStrength overrides:', err);
                setError(err instanceof Error ? err.message : 'Failed to save overrides');
            } finally {
                setSavingId(null);
            }
        },
        [campaignId, lobbyClient, onCampaignUpdated],
    );

    const setOverrideMode = useCallback(
        async (packageId: string, mode: OverrideMode) => {
            const prev = { ...(normalized.adminDarknessStrengthOverrides ?? {}) };
            const existing = prev[packageId];
            if (mode === 'natural') {
                delete prev[packageId];
            } else {
                prev[packageId] = {
                    enabled: mode === 'force_enable',
                    ...(existing?.data ? { data: existing.data } : {}),
                };
            }
            await persistOverrides(prev, packageId);
        },
        [normalized.adminDarknessStrengthOverrides, persistOverrides],
    );

    const saveOverrideData = useCallback(
        async (packageId: string) => {
            const raw = dataDrafts[packageId] ?? formatData(
                normalized.adminDarknessStrengthOverrides?.[packageId]?.data
                    ?? instanceById.get(packageId)?.data,
            );
            let parsed: Record<string, unknown> | undefined;
            const trimmed = raw.trim();
            if (trimmed.length > 0) {
                try {
                    const value = JSON.parse(trimmed) as unknown;
                    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
                        setError(`Package ${packageId}: data must be a JSON object`);
                        return;
                    }
                    parsed = value as Record<string, unknown>;
                } catch {
                    setError(`Package ${packageId}: invalid JSON`);
                    return;
                }
            }

            const prev = { ...(normalized.adminDarknessStrengthOverrides ?? {}) };
            const existing = prev[packageId];
            const mode = overrideModeFor(packageId, prev);
            // Editing data implies keeping (or creating) a force-enable override when natural.
            const enabled = mode === 'force_disable' ? false : true;
            const nextEntry: DarknessStrengthAdminOverride = { enabled };
            if (parsed) nextEntry.data = parsed;
            prev[packageId] = nextEntry;
            // If previously natural and empty data, still write force-enable so data sticks.
            if (mode === 'natural' && !parsed && !existing) {
                delete prev[packageId];
            }
            await persistOverrides(prev, packageId);
            setDataDrafts((d) => {
                const next = { ...d };
                delete next[packageId];
                return next;
            });
        },
        [
            dataDrafts,
            instanceById,
            normalized.adminDarknessStrengthOverrides,
            persistOverrides,
        ],
    );

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-4">
            <div>
                <h3 className="text-sm font-semibold text-white">DarknessStrength</h3>
                <p className="text-xs text-muted">
                    Registry packages for this campaign. Force enable/disable overrides persist on the
                    campaign; natural instances come from progression.
                </p>
            </div>

            {error && (
                <p className="rounded-md border border-red-700/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
                    {error}
                </p>
            )}

            <div className="flex flex-col gap-3">
                {packages.map((def) => {
                    const mode = overrideModeFor(def.packageId, normalized.adminDarknessStrengthOverrides);
                    const natural = instanceById.has(def.packageId);
                    const active = activeIds.has(def.packageId);
                    const override = normalized.adminDarknessStrengthOverrides?.[def.packageId];
                    const displayData = override?.data ?? instanceById.get(def.packageId)?.data;
                    const draft =
                        dataDrafts[def.packageId] ?? formatData(displayData);
                    const busy = savingId === def.packageId;

                    let statusLabel = 'Inactive';
                    let statusClass = 'text-muted border-border-custom bg-surface-light';
                    if (mode === 'force_enable') {
                        statusLabel = 'Force enabled';
                        statusClass = 'text-emerald-300 border-emerald-700/50 bg-emerald-950/40';
                    } else if (mode === 'force_disable') {
                        statusLabel = 'Force disabled';
                        statusClass = 'text-red-300 border-red-700/50 bg-red-950/40';
                    } else if (active) {
                        statusLabel = 'Active';
                        statusClass = 'text-primary border-primary/40 bg-primary/10';
                    } else if (natural) {
                        statusLabel = 'Instance (gated)';
                        statusClass = 'text-amber-300 border-amber-700/40 bg-amber-950/30';
                    }

                    return (
                        <div
                            key={def.packageId}
                            className="rounded-lg border border-border-custom bg-surface-light/40 p-3"
                            data-testid={`ds-admin-package-${def.packageId}`}
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-semibold text-white">{def.name}</p>
                                        <span
                                            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}
                                        >
                                            {statusLabel}
                                        </span>
                                        <span className="text-[11px] text-muted">{def.lane}</span>
                                    </div>
                                    <p className="mt-1 text-xs text-muted">{def.description}</p>
                                    <p className="mt-1 font-mono text-[10px] text-muted">{def.packageId}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        disabled={busy || mode === 'force_enable'}
                                        onClick={() => void setOverrideMode(def.packageId, 'force_enable')}
                                        className="rounded-md border border-emerald-700/60 bg-emerald-950/30 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-50"
                                    >
                                        Force enable
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy || mode === 'force_disable'}
                                        onClick={() => void setOverrideMode(def.packageId, 'force_disable')}
                                        className="rounded-md border border-red-700/60 bg-red-950/30 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900/40 disabled:opacity-50"
                                    >
                                        Force disable
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy || mode === 'natural'}
                                        onClick={() => void setOverrideMode(def.packageId, 'natural')}
                                        className="rounded-md border border-border-custom bg-surface px-2.5 py-1.5 text-xs font-medium text-white hover:bg-border-custom disabled:opacity-50"
                                    >
                                        Clear override
                                    </button>
                                </div>
                            </div>

                            <div className="mt-3">
                                <label className="mb-1 block text-[11px] font-semibold text-muted">
                                    Data (JSON object)
                                </label>
                                <textarea
                                    value={draft}
                                    onChange={(e) =>
                                        setDataDrafts((prev) => ({
                                            ...prev,
                                            [def.packageId]: e.target.value,
                                        }))
                                    }
                                    rows={3}
                                    spellCheck={false}
                                    className="w-full rounded-md border border-border-custom bg-dark-900 px-2 py-1.5 font-mono text-[11px] text-white"
                                    placeholder="{}"
                                />
                                <div className="mt-2 flex justify-end">
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void saveOverrideData(def.packageId)}
                                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-primary-hover disabled:opacity-60"
                                    >
                                        {busy ? 'Saving…' : 'Save data'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
