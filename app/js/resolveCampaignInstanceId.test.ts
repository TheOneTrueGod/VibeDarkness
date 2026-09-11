import { describe, expect, it } from 'vitest';
import { resolveCampaignInstanceId } from './resolveCampaignInstanceId';

const INSTANCE_ID = 'c2fd6eee52b4a0d2';
const STORYLINE_ID = 'world_of_darkness';

describe('resolveCampaignInstanceId', () => {
    it('uses the requested id when it is an account campaign instance', () => {
        expect(resolveCampaignInstanceId(INSTANCE_ID, [INSTANCE_ID])).toBe(INSTANCE_ID);
    });

    it('falls back to the account campaign when requested is a storyline id', () => {
        expect(resolveCampaignInstanceId(STORYLINE_ID, [INSTANCE_ID])).toBe(INSTANCE_ID);
    });

    it('falls back to the account campaign when requested is missing', () => {
        expect(resolveCampaignInstanceId(null, [INSTANCE_ID])).toBe(INSTANCE_ID);
        expect(resolveCampaignInstanceId(undefined, [INSTANCE_ID])).toBe(INSTANCE_ID);
    });

    it('returns null when the account has no campaign instances', () => {
        expect(resolveCampaignInstanceId(STORYLINE_ID, [])).toBeNull();
        expect(resolveCampaignInstanceId(STORYLINE_ID, undefined)).toBeNull();
    });
});
