# Skill Mastery materials tracker

Status: Design confirmed by the player on 2026-09-26. Ready for implementation; implementation has not started as part of this specification work.

## Implementation tickets

- [#2: Track one mastery’s outstanding requirements](https://github.com/Escles89/IRONWOOD_stats/issues/2) — No blockers.
- [#3: Include Current Loot in mastery progress](https://github.com/Escles89/IRONWOOD_stats/issues/3) — Blocked by #2.

## Problem Statement

The player usually pursues one Skill Mastery and needs to see what that mastery still requires. Comparing masteries is not the task. Already contributed items, owned inventory and Current Loot are different sources of progress and must not be counted twice.

## Solution

Add an informational card on Status for one selected Skill Mastery. Show Required, Contributed, Owned, Pending loot, Missing now and Missing after collection for each required item. Show XP and coins separately when known. Keep the card after mastery completion until the player chooses another mastery.

This feature is independent of the shopping list and planned next action in the first version. Connecting them is a longer-term goal.

## Confirmed Behavior

- Track one explicitly selected mastery, including a completed mastery; never automatically choose another.
- Keep the card on Status only.
- Save the selected mastery per character and game mode in this browser across reloads.
- Read requirements from the native game rather than hard-coded historical costs.
- Count contributed items separately from owned inventory. Mastery Contracts can increase contributions independently of inventory.
- Include only the current action's pending loot. Exclude House production, Taming, Attunement and unfinished queues from Pending loot.
- Keep XP and coins separate from the materials table. Owning all missing materials does not mean they have been contributed or that mastery can be completed.
- Keep both the material shortfall now and the conditional shortfall after collection visible.
- Show useful partial information with explicit gaps. Unknown values are not zero.
- Recalculate as new observations arrive, show their ages, and offer explicit read-only refresh.
- Link to the native mastery page. Do not submit items, spend coins or complete mastery from this card.

## Calculation Contract

For a required item with total requirement R, contributed quantity C, owned quantity O and completely observed pending quantity P:

- Outstanding requirement = max(0, R - C).
- Missing now = max(0, R - C - O).
- Missing after collection = max(0, R - C - O - P).

Example: 100 required, 20 contributed, 50 owned and 10 pending yields 30 missing now and 20 missing after collection.

If requirements, contributions or owned quantities are unknown, do not produce an exact shortfall that depends on them. If pending-loot coverage is incomplete, show the amount covered by known pending loot and label the remaining calculation incomplete. A missing loot card does not establish zero pending loot.

Collection must transfer quantities between pending loot and inventory without double counting. Submission must likewise reconcile contributed quantities and inventory together. Do not combine an old inventory balance with newly observed contributions as though both are current; label inconsistent evidence and refresh it.

## Confirmed Presentation

Use a selector labelled Skill Mastery and display the selected name in the card. Keep completed masteries selectable. Provide native-page navigation and Refresh; no contribution or completion buttons. On narrow screens, preserve all quantities in stacked item details rather than dropping columns.

Distinguish actual mastery completion from materials owned, materials contributed and XP/coin eligibility. Completion must come from native completion state, not a derived zero shortfall.

## Implementation Evidence and Requirements

Existing mastery collection in src/apps/inventory/service.js records completed skill names, not requirements or contributions. Static inspection of an already downloaded native client found feasible sources: MASTERY_DATA, calcMasteryItems, MASTERY_COST, MASTERY_EXP, character mastery item contributions, skill XP and coins. These are findings from that client build, not proof of live compatibility.

Validate access through the existing native integration. Retain native item IDs for joins across requirements, inventory and Current Loot; unresolved matches remain explicit. Extend observations to distinguish complete empty loot from missing or partial loot, and to capture contribution freshness independently.

Follow the existing cache contract: usable older snapshots remain labelled observations; age alone must not trigger hidden-page reads. Explicit refresh is read-only and must not invoke daily work or claim workflows. Preserve selections independently from cached observations and reject unknown/changing character identity.

## Acceptance and Validation

Exercise the real card and refresh workflow through the assembled userscript harness, with native runtime, storage and time as boundaries:

1. Select a mastery, reload, and verify character/game-mode isolation.
2. Verify the 100/20/50/10 example, zero-floor behavior and contributions advanced by Mastery Contracts.
3. Verify known empty loot, absent loot, partial loot, unmatched items and missing requirements.
4. Confirm collection and contribution updates do not count an item in two places.
5. Show stale or inconsistent observations and refresh without gameplay mutation.
6. Show insufficient XP or coins despite sufficient owned materials.
7. Keep a genuinely completed mastery selected until the player chooses another.
8. Confirm Status-only placement, native navigation, keyboard access and mobile readability.

For implementation, validate native capture against the live interface without changing gameplay, then run the repository build and complete check command. Static inspection and fixtures must not be described as live validation.

## Out of Scope

Mastery comparison, automatic target selection, material contribution, mastery completion, other pending-loot sources, cross-device synchronization and links that create plans in the other two features.
