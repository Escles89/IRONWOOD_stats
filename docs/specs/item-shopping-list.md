# Finished-item shopping list

Status: Direct-recipe slice (#4) implemented on 2026-09-26. Recursive expansion (#5) remains pending. See `../technical/shopping-list.md` for implementation and validation evidence.

## Implementation tickets

- [#4: Plan a finished item from its direct recipe](https://github.com/Escles89/IRONWOOD_stats/issues/4) — No blockers.
- [#5: Expand the full recipe chain](https://github.com/Escles89/IRONWOOD_stats/issues/5) — Blocked by #4.

## Problem Statement

The player wants to know what is still needed to own a chosen quantity of a finished item, including its intermediate crafting steps. Existing finished items and intermediate materials should reduce the work.

## Solution

Add an informational card on Status for one finished-item target and a Target owned quantity. Show a compact missing-materials summary and the full expandable recipe breakdown, including intermediate quantities and stock already available.

The feature is independent of the mastery tracker and planned next action in the first version. Connecting them is a longer-term goal.

## Confirmed Behavior

- The target is total quantity to own, not additional quantity to craft: 100 desired nails with 30 owned leaves 70 nails to produce.
- Use owned intermediate items before expanding recipes for their remaining shortfall.
- Treat all owned stock as available to this plan. Do not reserve stock or manage competing plans.
- Calculate using owned inventory only; exclude pending loot and unfinished queues.
- Include special recipe resources such as Charcoal, even when held as a separate native balance rather than an inventory item.
- Use current main crafting recipes only. Exclude House production and market-price optimization.
- When more than one valid crafting recipe produces an item, let the player choose.
- Use base recipe requirements. Do not predict savings from preservation or bonus output, or optimize special crafting modes.
- Flag recipes with uncertain output. Their nominal material calculation is not a guarantee of the requested finished quantity.
- Show intermediate steps and the full recipe breakdown; do not reduce the view to raw materials alone.
- Items with no known crafting recipe remain items to acquire. Do not choose between gathering and buying.
- Show useful partial results and explicit gaps. Unknown balances are not zero, and incomplete calculations cannot establish readiness.
- Save the target per character and game mode in this browser across reloads.
- Recalculate from new observations, show observation ages and offer explicit read-only refresh.
- Keep a satisfied target saved. Spending those items later causes the shortfall to return.
- Keep the card on Status only. Provide native-page links, without purchasing items or starting production.

## Calculation Contract

Subtract owned finished items from the target, floored at zero. For each unmet ingredient, allocate owned stock once, then expand its remaining shortfall through the selected current recipe. Aggregate demand for shared ingredients before allocating their stock or rounding production batches; no quantity may satisfy two branches.

For verified fixed-yield recipes, round required attempts upward using the native yield. Display output quantity, attempt count and ingredient quantities so rounding is explainable. Surplus from rounding is projected output, not owned inventory.

For probabilistic or failure-prone recipes, display the base per-attempt recipe and an explicitly labelled nominal calculation only where its basis is known. Do not invent a success probability or exact attempt count. Mark affected downstream totals uncertain; do not let the parent target appear guaranteed because its immediate recipe is deterministic.

Keep special resource balances distinct from similarly named inventory items. Where an intermediate recipe or balance is missing, preserve its known required quantity and expose the gap. Distinguish a verified noncraftable leaf from an unresolved recipe. Detect cycles and stop that branch with an explanation.

An item requiring a recipe choice remains unresolved until the player chooses; do not silently select the first catalog entry. Recipe availability is not the same as the player's current ability to craft it. Show known level or other requirements without hiding the material plan.

## Confirmed Presentation

Provide an item selector, a positive whole-number target and an editable saved target. The summary lists material shortfalls; expandable steps show selected recipes, required output, stock used, nominal production and uncertainty. Persist recipe choices with this plan and prompt again if a saved recipe is no longer valid.

Use clear distinctions: Target satisfied refers to owned finished items; Base materials covered refers to the observed inputs for a supported recipe plan. Neither means the finished item has been crafted. A recipe with uncertain output cannot promise that its nominal inputs are sufficient.

## Implementation Evidence and Requirements

The existing native integration discovers skill, action and item catalogs. Quick Skills already uses recipe materials and output IDs. Static inspection of a downloaded native client also found special resource costs, failure outputs, variable yields and obsolete recipe entries retained in the global catalog.

Resolve recipes through current skill action membership, not an unrestricted scan of the global action catalog. Do not interpret a drop amount as a guaranteed yield without validating its semantics. Read special resource balances from their actual native sources.

Retain native item IDs for matching, validate complete versus partial observations, and preserve observation ages. Follow the existing cache and read-only refresh contract; do not introduce age-triggered hidden reads. A refreshed calculation must remain scoped to the character for whom the plan was saved.

## Acceptance and Validation

Test the full planning workflow through the existing assembled-userscript harness; use focused calculation tests only for substantive graph and allocation cases:

1. A target of 100 with 30 owned plans only the remaining 70.
2. Existing intermediates reduce deeper recipe requirements.
3. Two branches sharing an ingredient cannot allocate the same stock twice.
4. Shared intermediate demand is aggregated before fixed-yield batch rounding.
5. Special resources are included and kept distinct from ordinary inventory.
6. Multiple current recipes require a choice; obsolete and House recipes are excluded.
7. Failure-prone or variable output makes affected totals explicitly uncertain.
8. Unknown balances, partial recipe data, cycles and unmatched IDs leave visible gaps.
9. A satisfied target persists, and spending its items restores the shortfall.
10. Reload, character/mode changes, stale observations and explicit refresh preserve correct scope.
11. Native-page links do not start production, purchase items or change game settings.
12. Verify mobile readability, expandable breakdowns and keyboard interaction.

Before implementation acceptance, validate representative native recipes, yields and special balances against the live interface without gameplay mutations. Run the repository build and complete check command. Distinguish static evidence, fixture coverage and live validation.

## Out of Scope

Multiple simultaneous targets, inventory reservations, pending-loot planning, House production, market optimization, rate/ETA prediction, bonus-adjusted estimates, automatic crafting, cross-device synchronization and creating plans in the other two features.
