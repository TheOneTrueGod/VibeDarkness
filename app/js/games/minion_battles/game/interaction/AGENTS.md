# game/interaction/

Player-facing battle interaction: targeting tools and the **Interactive Targeting Session (ITS)** — local playahead for abilities with select `targetDef`s.

**ITS commit:** at commit time, `wouldCommitInPlace` decides **in-place** (keep the playahead state) vs **rollback** (restore the mark snapshot, with a rewind overlay). Predicate and UX: [`docs/interactive-sequential-targeting.md`](../../../../../../docs/interactive-sequential-targeting.md). Plan that introduced commit-time in-place / rewind: [`docs/plans/sequential-targeting-rollback-ux.md`](../../../../../../docs/plans/sequential-targeting-rollback-ux.md).

| Path | Owns |
|------|------|
| `InteractiveTargetingSession.ts` | Preview lifecycle: begin / resolveTarget / reset / replay / commit |
| `selectTargetLookahead.ts` | Pre-tick select pause; deferred-first-select |
| `PlayerInteractionManager.ts` | Tool activation (skips upfront targeting when sequential flag is on) |
| `tools/` | `AbilityTargetingTool`, default / debug tools |
