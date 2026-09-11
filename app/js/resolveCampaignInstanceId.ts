/**
 * Account `campaignIds` are campaign-instance UUIDs used by the campaign API.
 * Character and mission `campaignId` values are storyline ids (e.g. `world_of_darkness`)
 * and must not be sent as campaign instance ids.
 */
export function resolveCampaignInstanceId(
    requested: string | null | undefined,
    accountCampaignIds: readonly string[] | undefined,
): string | null {
    const ids = accountCampaignIds ?? [];
    if (requested && ids.includes(requested)) {
        return requested;
    }
    return ids[0] ?? null;
}
