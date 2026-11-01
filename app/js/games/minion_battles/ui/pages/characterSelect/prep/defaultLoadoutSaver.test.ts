import { describe, expect, it, vi } from 'vitest';
import { resolveInitialMissionSelection } from '../../../../storylines/questPrepLoadout';
import { createDefaultLoadoutSaver } from './defaultLoadoutSaver';

/** Nine selectable primaries for seven slots: the player must pick (mirrors lobby 53DBB4). */
const SELECTABLE = ['0101', '0120', '0601', '0103', '1001', '1004', '1005', '1008', '1011'];
const STORED_DEFAULT = ['0101', '0120', '0601', '0103', '1001', '1004'];

describe('createDefaultLoadoutSaver', () => {
    it('persists a pick right away, so leaving before the mission starts keeps it for the next one', async () => {
        const stored = { lastMissionAbilityIds: [...STORED_DEFAULT] };
        const write = vi.fn(async (ids: string[]) => {
            stored.lastMissionAbilityIds = ids;
        });
        const saver = createDefaultLoadoutSaver(write, stored.lastMissionAbilityIds);

        // Add Repair Post, then leave: no Ready press, no mission start.
        await saver.save([...STORED_DEFAULT, '1011']);

        expect(write).toHaveBeenCalledWith([...STORED_DEFAULT, '1011']);
        // Hosting a new mission seeds prep from the stored character.
        expect(resolveInitialMissionSelection(SELECTABLE, stored.lastMissionAbilityIds)).toEqual([
            ...STORED_DEFAULT,
            '1011',
        ]);
    });

    it('persists a reorder', async () => {
        const write = vi.fn(async () => {});
        const saver = createDefaultLoadoutSaver(write, ['a', 'b']);
        await saver.save(['b', 'a']);
        expect(write).toHaveBeenCalledWith(['b', 'a']);
    });

    it('skips writes when the loadout matches what was last saved', async () => {
        const write = vi.fn(async () => {});
        const saver = createDefaultLoadoutSaver(write, ['a', 'b']);
        await saver.save(['a', 'b']);
        await saver.save(['a', 'c']);
        await saver.save(['a', 'c']);
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('writes in order even when an earlier write is slow', async () => {
        const order: string[] = [];
        let releaseFirst: () => void = () => {};
        const write = vi.fn((ids: string[]) => {
            if (ids[0] === 'b') {
                return new Promise<void>((resolve) => {
                    releaseFirst = () => {
                        order.push(ids.join());
                        resolve();
                    };
                });
            }
            order.push(ids.join());
            return Promise.resolve();
        });
        const saver = createDefaultLoadoutSaver(write, ['a']);
        const first = saver.save(['b']);
        const second = saver.save(['c', 'b']);
        await Promise.resolve();
        releaseFirst();
        await Promise.all([first, second]);
        expect(order).toEqual(['b', 'c,b']);
    });

    it('keeps saving after a failed write', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const write = vi.fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValue(undefined);
        const saver = createDefaultLoadoutSaver(write, []);
        await saver.save(['a']);
        await saver.save(['b']);
        expect(write).toHaveBeenLastCalledWith(['b']);
        warn.mockRestore();
    });
});
