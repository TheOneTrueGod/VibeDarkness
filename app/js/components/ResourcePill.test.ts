import { describe, expect, it } from 'vitest';
import {
    RESOURCE_PILL_SIZE_CLASS,
    RESOURCE_PILL_SIZE_DEFAULT,
    RESOURCE_PILL_SIZE_MEDIUM,
    RESOURCE_PILL_SIZE_SMALL,
} from './ResourcePill';

describe('RESOURCE_PILL_SIZE_CLASS', () => {
    it('defines a medium size between small and default', () => {
        expect(RESOURCE_PILL_SIZE_MEDIUM).toBe('medium');
        expect(RESOURCE_PILL_SIZE_CLASS[RESOURCE_PILL_SIZE_SMALL].pill).toContain('text-[10px]');
        expect(RESOURCE_PILL_SIZE_CLASS[RESOURCE_PILL_SIZE_MEDIUM].pill).toContain('text-[11px]');
        expect(RESOURCE_PILL_SIZE_CLASS[RESOURCE_PILL_SIZE_DEFAULT].pill).toContain('text-[13px]');
    });
});
