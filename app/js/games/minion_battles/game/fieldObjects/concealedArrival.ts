/**
 * A gameplay object can exist immediately while its resting picture stays hidden
 * until a flight finishes. Game time reveals it if the battle keeps running.
 * Wall time reveals it when the sim is halted, because an order pause freezes game time.
 *
 * The flight itself is a separate effect. This clock only answers whether the resting picture should show.
 */

const MS_PER_SECOND = 1000;

export class ConcealedArrivalClock {
    private seenAtMs = new Map<string, number>();

    hasArrived(
        id: string,
        spawnedAtGameTime: number,
        gameTime: number,
        flightSeconds: number,
        nowMs: number = performance.now(),
    ): boolean {
        if (gameTime >= spawnedAtGameTime + flightSeconds) return true;
        let seenAt = this.seenAtMs.get(id);
        if (seenAt == null) {
            seenAt = nowMs;
            this.seenAtMs.set(id, seenAt);
        }
        return nowMs - seenAt >= flightSeconds * MS_PER_SECOND;
    }

    /** Drop clocks for objects that are no longer in the world. */
    forgetExcept(liveIds: ReadonlySet<string>): void {
        for (const id of this.seenAtMs.keys()) {
            if (!liveIds.has(id)) this.seenAtMs.delete(id);
        }
    }
}
