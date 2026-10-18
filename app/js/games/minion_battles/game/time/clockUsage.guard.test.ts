import { describe, expect, it } from 'vitest';

/**
 * Guard: ability code must read cast elapsed time from the caster's local clock via `getCastElapsed`
 * (`game/time/actorClock.ts`), never by subtracting `ActiveAbility.startTime` from the world clock.
 * `startTime` is a local-time timestamp; `gameTime - startTime` is wrong whenever tempo or world pace
 * is not 1. See `game/time/AGENTS.md`.
 */
const SOURCES = import.meta.glob(
    [
        '../../abilities/**/*.{ts,tsx}',
        '../../card_defs/**/*.{ts,tsx}',
        '!../../**/*.test.{ts,tsx}',
    ],
    { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

/** `gameTime - x.startTime` / `gameTime - x.castStartTime` (also `eng.gameTime`, `this.gameTime`, `ctx.gameTime`). */
const FORBIDDEN = /gameTime\s*-\s*[A-Za-z0-9_.?!]*(?:startTime|castStartTime)\b/;

describe('clock usage guard', () => {
    it('scans the ability and card sources', () => {
        expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
    });

    it('ability and card code never computes cast elapsed from the world clock', () => {
        const offenders: string[] = [];
        for (const [file, text] of Object.entries(SOURCES)) {
            text.split(/\r?\n/).forEach((line: string, i: number) => {
                const code = line.replace(/\/\/.*$/, '');
                if (/^\s*(\*|\/\*)/.test(code)) return;
                if (FORBIDDEN.test(code)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
            });
        }
        expect(
            offenders,
            'Use getCastElapsed(unit, active, engine) from game/time/actorClock instead of `gameTime - ...startTime` '
                + '(ActiveAbility.startTime is a local-time timestamp):\n' + offenders.join('\n'),
        ).toEqual([]);
    });
});
