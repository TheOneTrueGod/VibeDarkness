export class AbilityUseTracker {
    private abilityUsesThisRound: Map<string, number> = new Map();

    trackAbilityUse(unitId: string, abilityId: string): void {
        const key = `${unitId}:${abilityId}`;
        this.abilityUsesThisRound.set(key, (this.abilityUsesThisRound.get(key) ?? 0) + 1);
    }

    getAbilityUsesThisRound(unitId: string, abilityId: string): number {
        return this.abilityUsesThisRound.get(`${unitId}:${abilityId}`) ?? 0;
    }

    clearAbilityUses(): void {
        this.abilityUsesThisRound.clear();
    }
}
