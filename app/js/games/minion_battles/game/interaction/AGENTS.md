# game/interaction/

Player-facing battle interaction: targeting tools and the **Interactive Targeting Session (ITS)** — local playahead for abilities with select `targetDef`s.

**Ended-early playahead:** an interrupt, fizzle or caster death of the preview cast does not rewind. The engine records `endedEarly` on `sequentialTargetingPreviewCast` from the `cast_ended_early` event, and the preview keeps playing. `getEndedEarlyPreviewStop` (`isITSPreviewComplete.ts`) decides when it stops for Done: caster dead, a frozen parallel pause, the caster able to act again (the normal order-pause predicate), or a frame cap after the interrupt. Until then cards are locked; only Undo (button or Esc) and Done work, and Auto End presses Done (`shouldAutoCommitItsPreview`). Commit sends the labels never picked as `missingSelectLabels`. The notice comes from the battle notice store (`ui/components/battleNotices.ts`), driven by `useInteractiveTargetingProgress`. History: lobby 3B8D37 made every retry identical when the old auto-rewind was used.

**Resume mode (missing-pick pause):** when a real-timeline cast reaches a select its order lacks, the owner is paused with `awaitingPickLabel` set. `InteractiveTargetingSession.beginResume` starts ITS from that pause (cursor up at once), and Done sends one `updateTargets` order; Pass (`handleWait`) sends `wait`, which fizzles the cast. Details and the saved-data-only rule: [`docs/interactive-sequential-targeting.md`](../../../../../../docs/interactive-sequential-targeting.md).

**ITS commit:** at commit time, `wouldCommitInPlace` decides **in-place** (keep the playahead state) vs **rollback** (restore the mark snapshot, with a rewind overlay). Predicate and UX: [`docs/interactive-sequential-targeting.md`](../../../../../../docs/interactive-sequential-targeting.md). Plan that introduced commit-time in-place / rewind: [`docs/plans/sequential-targeting-rollback-ux.md`](../../../../../../docs/plans/sequential-targeting-rollback-ux.md).

| Path | Owns |
|------|------|
| `InteractiveTargetingSession.ts` | Preview lifecycle: begin / resolveTarget / reset / replay / commit |
| `selectTargetLookahead.ts` | Pre-tick select pause; deferred-first-select |
| `isITSPreviewComplete.ts` | Single predicate for preview Done (natural completion, conditional cancel, ended-early stop); auto-commit and missing-pick decision helpers |
| `ghostPlanRenderPolicy.ts` | Hold inbound peer ghost plans during local ITS; merge for render after rewind |
| `PlayerInteractionManager.ts` | Tool activation (skips upfront targeting when sequential flag is on) |
| `tools/` | `AbilityTargetingTool`, default / debug tools |
