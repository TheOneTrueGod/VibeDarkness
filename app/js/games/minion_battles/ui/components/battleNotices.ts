/**
 * Battle notices: tiny store + presets + shape helper for the starburst notice container
 * shown just above the "Your Turn" plaque (see BattleNoticeSlot).
 *
 * Plain TS so it can be unit tested without React. Later uses add an entry to
 * BATTLE_NOTICE_PRESETS rather than new UI.
 */

export interface BattleNotice {
    id: string;
    title: string;
    detail?: string;
    /** Minimum time the notice stays visible after `show`, even if released sooner. */
    minVisibleMs: number;
}

export const DEFAULT_BATTLE_NOTICE_MIN_VISIBLE_MS = 1500;

/** Reusable notice presets (data only). */
export const BATTLE_NOTICE_PRESETS = {
    cast_interrupted: {
        id: 'cast_interrupted',
        title: 'Interrupted',
        minVisibleMs: DEFAULT_BATTLE_NOTICE_MIN_VISIBLE_MS,
    },
    cast_fizzled: {
        id: 'cast_fizzled',
        title: 'Fizzled',
        minVisibleMs: DEFAULT_BATTLE_NOTICE_MIN_VISIBLE_MS,
    },
    caster_defeated: {
        id: 'caster_defeated',
        title: 'Defeated',
        minVisibleMs: DEFAULT_BATTLE_NOTICE_MIN_VISIBLE_MS,
    },
    pick_required: {
        id: 'pick_required',
        title: 'Target needed',
        detail: "{Ability} reached a point that needs a target it doesn't have",
        minVisibleMs: DEFAULT_BATTLE_NOTICE_MIN_VISIBLE_MS,
    },
} as const satisfies Record<string, BattleNotice>;

export type BattleNoticePresetId = keyof typeof BATTLE_NOTICE_PRESETS;

/** Builds a notice from a preset; `{Ability}` in the preset detail is replaced by `abilityName`. */
export function buildPresetNotice(
    presetId: BattleNoticePresetId,
    opts: { abilityName?: string; detail?: string } = {},
): BattleNotice {
    const preset: BattleNotice = BATTLE_NOTICE_PRESETS[presetId];
    const presetDetail = preset.detail?.replace('{Ability}', opts.abilityName ?? 'This ability');
    return { ...preset, detail: opts.detail ?? presetDetail };
}

export interface BattleNoticeStore {
    /** Show (or replace, by id) a notice. Cancels any pending release of that id. */
    show(notice: BattleNotice): void;
    /** Remove a notice once its minimum visible time has elapsed (schedules removal if not yet). */
    release(id: string): void;
    subscribe(listener: () => void): () => void;
    getNotices(): readonly BattleNotice[];
}

interface StoreOptions {
    now?: () => number;
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
}

export function createBattleNoticeStore(options: StoreOptions = {}): BattleNoticeStore {
    const now = options.now ?? (() => Date.now());
    const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const clearTimer =
        options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

    const entries = new Map<string, { notice: BattleNotice; shownAt: number }>();
    const timers = new Map<string, unknown>();
    const listeners = new Set<() => void>();
    let snapshot: readonly BattleNotice[] = [];

    const emit = () => {
        snapshot = Array.from(entries.values(), (e) => e.notice);
        listeners.forEach((l) => l());
    };

    const cancelTimer = (id: string) => {
        if (timers.has(id)) {
            clearTimer(timers.get(id));
            timers.delete(id);
        }
    };

    return {
        show(notice) {
            cancelTimer(notice.id);
            entries.set(notice.id, { notice, shownAt: now() });
            emit();
        },
        release(id) {
            const entry = entries.get(id);
            if (!entry) return;
            const remaining = entry.shownAt + entry.notice.minVisibleMs - now();
            const remove = () => {
                timers.delete(id);
                if (entries.delete(id)) emit();
            };
            if (remaining <= 0) {
                cancelTimer(id);
                remove();
                return;
            }
            if (timers.has(id)) return;
            timers.set(id, setTimer(remove, remaining));
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getNotices() {
            return snapshot;
        },
    };
}

/**
 * CSS `polygon(...)` for a starburst: `2 * spikes` points alternating between the outer edge
 * (radius 50%) and `innerRatio` of it, centred in the box. Coordinates stay within 0-100%.
 */
export function starburstClipPath(spikes = 12, innerRatio = 0.85): string {
    const points: string[] = [];
    const total = spikes * 2;
    for (let i = 0; i < total; i++) {
        const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
        const radius = i % 2 === 0 ? 50 : 50 * innerRatio;
        const x = 50 + Math.cos(angle) * radius;
        const y = 50 + Math.sin(angle) * radius;
        points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
    }
    return `polygon(${points.join(', ')})`;
}
